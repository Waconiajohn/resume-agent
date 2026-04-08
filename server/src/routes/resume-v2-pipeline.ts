/**
 * Resume v2 Pipeline Routes
 *
 * POST /start — Accepts resume_text + job_description, starts pipeline
 * GET /:sessionId/stream — SSE stream of pipeline events
 *
 * The v2 pipeline streams through analysis, benchmark modeling, clarification,
 * writing, verification, and assembly.
 * The user sees results accumulate via SSE, passes through the resume-ready gate,
 * and then edits inline on the working document.
 */

import { z } from 'zod';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { sseConnections, addSSEConnection, removeSSEConnection, type AnySSEEvent } from './sessions.js';
import logger from '../lib/logger.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import { runV2Pipeline, pendingGapResolvers } from '../agents/resume-v2/orchestrator.js';
import type { V2PipelineSSEEvent, V2PipelineStage } from '../agents/resume-v2/types.js';
import { llm } from '../lib/llm.js';
import { setUsageTrackingContext, startUsageTracking, stopUsageTracking } from '../lib/llm-provider.js';
import { MODEL_MID, MODEL_LIGHT, MODEL_PRIMARY } from '../lib/model-constants.js';
import { repairJSON } from '../lib/json-repair.js';
import { loadCareerProfileContext } from '../lib/career-profile-context.js';
import {
  buildRequirementClarifyingQuestion,
  buildRequirementFallbackQuestion,
  buildRequirementFallbackResponse,
  looksLikeRequirementRewrite,
  looksLikeTargetedRequirementQuestion,
} from '../contracts/requirement-coaching-policy.js';
import {
  startSchema,
  editSchema,
  type EditAction,
  type StoredV2Snapshot,
  createInitialSnapshot,
  buildClarificationMemoryContext,
  applyEventToSnapshot,
  enrichStoredPipelineDataForClient,
  enrichStoredDraftStateForClient,
  gapResponseSchema,
  draftStateSchema,
  buildEditSystemPrompt,
  rescoreSchema,
  polishSchema,
  integrateKeywordSchema,
  gapChatSchema,
  lineCoachSchema,
  structuredCoachingResponseSchema,
  finalReviewChatSchema,
  hiringManagerReviewSchema,
  finalReviewResultSchema,
  buildFinalReviewPrompts,
  stabilizeFinalReviewResult,
  extractHardRequirementRisksFromGapAnalysis,
  extractMaterialJobFitRisksFromGapAnalysis,
} from './resume-v2-pipeline-support.js';

export const resumeV2Pipeline = new Hono();

/**
 * Load interview-sourced evidence lines from the user's master resume.
 * Returns an array of formatted evidence strings (one per item), or an empty
 * array if no master resume exists or no interview evidence is found.
 *
 * This runs at the route level so it can be parallelised with
 * loadCareerProfileContext — avoiding a serial round-trip inside the orchestrator.
 */
async function loadMasterResumeEvidence(userId: string): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin
      .from('master_resumes')
      .select('evidence_items')
      .eq('user_id', userId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();

    if (!data || !Array.isArray(data.evidence_items)) return [];

    return (data.evidence_items as Record<string, unknown>[])
      .filter((e) => e.source === 'interview' && typeof e.text === 'string')
      .map((e) => {
        const category = typeof e.category === 'string' ? e.category : 'interview_response';
        return `[${category}]: ${e.text as string}`;
      });
  } catch {
    return [];
  }
}

async function withTrackedSessionUsage<T>(
  sessionId: string,
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  startUsageTracking(sessionId, userId);
  setUsageTrackingContext(sessionId);
  try {
    return await work();
  } finally {
    stopUsageTracking(sessionId);
  }
}

// ─── Metrics ─────────────────────────────────────────────────────────

let activePipelines = 0;
let totalStarted = 0;
let totalCompleted = 0;
let totalFailed = 0;

export function getV2PipelineRouteStats() {
  return { active_pipelines: activePipelines, total_started: totalStarted, total_completed: totalCompleted, total_failed: totalFailed };
}

// ─── POST /start ─────────────────────────────────────────────────────

resumeV2Pipeline.post('/start', authMiddleware, rateLimitMiddleware(10, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;

  const parsedBody = await parseJsonBodyWithLimit(c, 200_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = startSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { resume_text, job_description, user_context, clarification_memory, gap_coaching_responses, pre_scores } = parsed.data;
  const initialSnapshot = createInitialSnapshot(resume_text, job_description, clarification_memory ?? null);
  const combinedUserContext = [
    user_context?.trim(),
    buildClarificationMemoryContext(clarification_memory ?? null),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n') || undefined;

  // Create session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('coach_sessions')
    .insert({
      user_id: userId,
      product_type: 'resume_v2',
      pipeline_status: 'running',
      pipeline_stage: 'intake',
      tailored_sections: initialSnapshot as unknown as Record<string, unknown>,
    })
    .select('id')
    .single();

  if (sessionError || !session) {
    logger.error({ error: sessionError }, 'Failed to create v2 pipeline session');
    return c.json({ error: 'Failed to create session' }, 500);
  }

  const sessionId = session.id;

  // Start pipeline in background
  activePipelines++;
  totalStarted++;

  // Pipeline runs asynchronously — events are emitted to SSE connections
  void (async () => {
    const liveSnapshot = initialSnapshot;
    let snapshotPersistChain: Promise<void> = Promise.resolve();

    const queueSnapshotPersist = (
      pipelineStatus: 'running' | 'complete' | 'error',
      pipelineStage: V2PipelineStage,
    ): Promise<void> => {
      liveSnapshot.updated_at = new Date().toISOString();
      const snapshotPayload = JSON.parse(JSON.stringify(liveSnapshot)) as StoredV2Snapshot;

      snapshotPersistChain = snapshotPersistChain
        .catch(() => undefined)
        .then(async () => {
          const { error: snapshotError } = await supabaseAdmin
            .from('coach_sessions')
            .update({
              pipeline_status: pipelineStatus,
              pipeline_stage: pipelineStage,
              tailored_sections: snapshotPayload as unknown as Record<string, unknown>,
            })
            .eq('id', sessionId);

          if (snapshotError) {
            logger.error({ session_id: sessionId, error: snapshotError }, 'Failed to persist v2 pipeline snapshot');
          }
        });

      return snapshotPersistChain;
    };

    try {
      const [careerProfile, evidenceLines] = await Promise.all([
        loadCareerProfileContext(userId),
        loadMasterResumeEvidence(userId),
      ]);

      // emitters is looked up on every emit so late-connecting clients receive events
      const emit = (event: V2PipelineSSEEvent) => {
        const snapshotState = applyEventToSnapshot(liveSnapshot, event);
        void queueSnapshotPersist(
          snapshotState.pipelineStatus ?? 'running',
          snapshotState.pipelineStage ?? liveSnapshot.pipeline_data.stage,
        );

        const emitters = sseConnections.get(sessionId);
        if (!emitters) return;
        for (const emitter of emitters) {
          try {
            // The SSE emitter expects the old PipelineSSEEvent type — cast through unknown
            (emitter as (e: unknown) => void)(event);
          } catch {
            // Emitter may have been closed
          }
        }
      };

      const result = await runV2Pipeline({
        resume_text,
        job_description,
        session_id: sessionId,
        user_id: userId,
        emit,
        career_profile: careerProfile ?? undefined,
        user_context: combinedUserContext,
        gap_coaching_responses,
        pre_scores,
        interview_evidence_lines: evidenceLines,
      });
      liveSnapshot.pipeline_data.stage = 'complete';
      liveSnapshot.pipeline_data.jobIntelligence = result.job_intelligence ?? liveSnapshot.pipeline_data.jobIntelligence;
      liveSnapshot.pipeline_data.candidateIntelligence = result.candidate_intelligence ?? liveSnapshot.pipeline_data.candidateIntelligence;
      liveSnapshot.pipeline_data.benchmarkCandidate = result.benchmark_candidate ?? liveSnapshot.pipeline_data.benchmarkCandidate;
      liveSnapshot.pipeline_data.gapAnalysis = result.gap_analysis ?? liveSnapshot.pipeline_data.gapAnalysis;
      liveSnapshot.pipeline_data.preScores = result.pre_scores ?? liveSnapshot.pipeline_data.preScores;
      liveSnapshot.pipeline_data.narrativeStrategy = result.narrative_strategy ?? liveSnapshot.pipeline_data.narrativeStrategy;
      liveSnapshot.pipeline_data.resumeDraft = result.resume_draft ?? liveSnapshot.pipeline_data.resumeDraft;
      liveSnapshot.pipeline_data.assembly = result.final_resume ?? liveSnapshot.pipeline_data.assembly;
      liveSnapshot.pipeline_data.feedbackMetadata = result.feedback_metadata ?? liveSnapshot.pipeline_data.feedbackMetadata;
      liveSnapshot.pipeline_data.error = null;

      await queueSnapshotPersist('complete', 'complete');

      totalCompleted++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ session_id: sessionId, error: message }, 'v2 pipeline failed');
      liveSnapshot.pipeline_data.error = message;

      await queueSnapshotPersist('error', liveSnapshot.pipeline_data.stage);

      await supabaseAdmin
        .from('coach_sessions')
        .update({ error_message: message })
        .eq('id', sessionId);

      totalFailed++;
    } finally {
      activePipelines--;
    }
  })();

  return c.json({ session_id: sessionId, status: 'started' });
});

// ─── POST /:sessionId/respond-gaps ──────────────────────────────────

resumeV2Pipeline.post('/:sessionId/respond-gaps', authMiddleware, rateLimitMiddleware(10, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 50_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = gapResponseSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  logger.info({ session_id: sessionId, response_count: parsed.data.responses.length }, 'Gap coaching responses received');

  const resolver = pendingGapResolvers.get(sessionId);
  if (!resolver) {
    // Pipeline is not currently waiting at the gap gate — this can happen if
    // the pipeline already completed or the session was restarted.
    logger.warn({ session_id: sessionId }, 'respond-gaps: no pending gap resolver found');
    return c.json({ status: 'no_gate_pending' }, 409);
  }

  resolver(parsed.data.responses);
  return c.json({ status: 'ok', responses: parsed.data.responses });
});

// ─── PUT /:sessionId/draft-state ───────────────────────────────────

resumeV2Pipeline.put('/:sessionId/draft-state', authMiddleware, rateLimitMiddleware(60, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, product_type, tailored_sections')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (session.product_type !== 'resume_v2') {
    return c.json({ error: 'Draft persistence is only supported for resume_v2 sessions' }, 400);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 250_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = draftStateSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const existingSnapshot = (session.tailored_sections as Record<string, unknown> | null) ?? {};
  const nextSnapshot = {
    ...existingSnapshot,
    version: 'v2' as const,
    draft_state: parsed.data.draft_state,
  };

  const { error: updateError } = await supabaseAdmin
    .from('coach_sessions')
    .update({
      tailored_sections: nextSnapshot as unknown as Record<string, unknown>,
    })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (updateError) {
    logger.error({ session_id: sessionId, error: updateError }, 'Failed to persist v2 draft state');
    return c.json({ error: 'Failed to save draft state' }, 500);
  }

  return c.json({ status: 'saved' });
});

// ─── GET /:sessionId/stream ──────────────────────────────────────────

resumeV2Pipeline.get('/:sessionId/stream', authMiddleware, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  // Verify session belongs to user
  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, pipeline_status')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return streamSSE(c, async (stream) => {
    const emitter = (event: unknown) => {
      void stream.writeSSE({
        data: JSON.stringify(event),
        event: 'pipeline',
      });
    };

    // Type boundary: V2PipelineSSEEvent is a different union from the legacy AnySSEEvent.
    // The emitter itself is typed as (event: unknown) — the cast is safe here.
    addSSEConnection(sessionId, userId, emitter as (event: AnySSEEvent) => void);

    // Keep-alive heartbeat
    const heartbeat = setInterval(() => {
      void stream.writeSSE({ data: '', event: 'heartbeat' });
    }, 30_000);

    try {
      // Hold the connection open until client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
    } finally {
      clearInterval(heartbeat);
      removeSSEConnection(sessionId, userId, emitter as (event: AnySSEEvent) => void); // same type boundary as above
    }
  });
});

// ─── GET /:sessionId/result ──────────────────────────────────────────

resumeV2Pipeline.get('/:sessionId/result', authMiddleware, async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, pipeline_status, pipeline_stage, error_message, tailored_sections')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Detect v2 pipeline snapshot vs legacy AssemblyOutput
  const stored = session.tailored_sections as Record<string, unknown> | null;
  if (stored && stored.version === 'v2') {
    const storedSnapshot = stored as StoredV2Snapshot;
    const enrichedPipelineData = enrichStoredPipelineDataForClient(storedSnapshot.pipeline_data);
    const enrichedDraftState = enrichStoredDraftStateForClient(storedSnapshot.draft_state, {
      resumeText: storedSnapshot.inputs.resume_text,
      gapAnalysis: enrichedPipelineData.gapAnalysis,
    });
    return c.json({
      version: 'v2',
      status: session.pipeline_status,
      pipeline_stage: session.pipeline_stage,
      error_message: session.error_message ?? null,
      pipeline_data: enrichedPipelineData,
      inputs: storedSnapshot.inputs,
      draft_state: enrichedDraftState ?? null,
    });
  }

  if (session.pipeline_status !== 'complete') {
    return c.json({ error: 'Pipeline snapshot not yet available', status: session.pipeline_status }, 409);
  }

  // Legacy fallback — just the assembly result
  return c.json({ result: stored });
});

// ─── POST /:sessionId/edit ───────────────────────────────────────────

resumeV2Pipeline.post('/:sessionId/edit', authMiddleware, rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  // Verify session belongs to user
  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 50_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = editSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const {
    action,
    selected_text,
    section,
    full_resume_context,
    job_description,
    custom_instruction,
    working_draft,
    section_context,
    edit_context,
  } = parsed.data;

  logger.info({ session_id: sessionId, user_id: userId, action, section }, 'Inline resume edit requested');

  const systemPrompt = buildEditSystemPrompt(action, custom_instruction);

  // Use section_context when available (much smaller than full resume)
  const resumeContext = section_context ?? full_resume_context;
  const contextLabel = section_context ? 'SECTION CONTEXT' : 'FULL RESUME CONTEXT';

  const messageParts = [
    `SECTION: ${section}`,
    '',
    `SELECTED TEXT TO EDIT:`,
    selected_text,
  ];

  if (working_draft && working_draft.trim().length > 0) {
    messageParts.push(
      '',
      'CURRENT WORKING DRAFT TO REPLACE:',
      working_draft.trim(),
    );
  }

  // Add edit context (requirement, evidence, strategy) when available
  if (edit_context) {
    messageParts.push('');
    if (edit_context.requirement) {
      messageParts.push(`JOB REQUIREMENT THIS ADDRESSES: ${edit_context.requirement}`);
    }
    if (edit_context.evidence && edit_context.evidence.length > 0) {
      messageParts.push(`CANDIDATE'S RELEVANT EXPERIENCE: ${edit_context.evidence.join('; ')}`);
    }
    if (edit_context.strategy) {
      messageParts.push(`POSITIONING STRATEGY: ${edit_context.strategy}`);
    }
  }

  if (action === 'custom' && custom_instruction) {
    messageParts.push('', `CUSTOM EDIT INSTRUCTION: ${custom_instruction}`);
  }

  messageParts.push(
    '',
    `${contextLabel}:`,
    resumeContext,
    '',
    `JOB DESCRIPTION (for keyword and requirement awareness):`,
    job_description,
  );

  const userMessage = messageParts.join('\n');

  try {
    const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
      model: MODEL_MID,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1024,
    }));

    const parsed_response = repairJSON<{ replacement: string }>(response.text);

    let replacement: string;
    if (parsed_response?.replacement) {
      replacement = parsed_response.replacement;
    } else {
      // Fall back to raw text, stripping any markdown code fences
      replacement = response.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    }

    logger.info({ session_id: sessionId, action, section }, 'Inline resume edit completed');

    return c.json({ replacement });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, action, error: message }, 'Inline resume edit failed');
    return c.json({ error: 'Edit failed', message }, 500);
  }
});

// ─── POST /:sessionId/rescore ─────────────────────────────────────

resumeV2Pipeline.post('/:sessionId/rescore', authMiddleware, rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 200_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = rescoreSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { resume_text, job_description } = parsed.data;

  try {
    const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
      model: MODEL_LIGHT,
      system: `You are an ATS scoring specialist. Score how well a resume matches a job description.

Return valid JSON only:
{
  "ats_score": 82,
  "keywords_found": ["phrase or keyword 1", "phrase 2"],
  "keywords_missing": ["missing phrase 1"],
  "top_suggestions": ["Add X to Y section", "Include Z in competencies"]
}

RULES:
- ats_score = (keywords_found / total_important_keywords) × 100
- Only count must-have and important keywords, not nice-to-haves
- top_suggestions: max 3, most impactful improvements
- Match multi-word PHRASES (2-4 words), not just single keywords`,
      messages: [{
        role: 'user',
        content: `RESUME:\n${resume_text}\n\nJOB DESCRIPTION:\n${job_description}\n\nScore the ATS match.`,
      }],
      max_tokens: 2048,
    }));

    const result = repairJSON<{
      ats_score: number;
      keywords_found: string[];
      keywords_missing: string[];
      top_suggestions: string[];
    }>(response.text);

    if (!result) {
      return c.json({ error: 'Scoring failed — unparseable response' }, 500);
    }

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, error: message }, 'ATS rescore failed');
    return c.json({ error: 'Rescore failed', message }, 500);
  }
});

// ─── POST /:sessionId/polish ──────────────────────────────────────

resumeV2Pipeline.post('/:sessionId/polish', authMiddleware, rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 200_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = polishSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { resume_text, job_description } = parsed.data;

  try {
    const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
      model: MODEL_MID,
      system: `You are a final resume polish specialist. Evaluate the tailored resume for both ATS match and executive tone after a revision round.

Return valid JSON only:
{
  "ats_score": 82,
  "keywords_found": ["keyword or phrase 1"],
  "keywords_missing": ["missing keyword or phrase 1"],
  "top_suggestions": ["most important ATS or content suggestion", "second suggestion", "third suggestion"],
  "tone_score": 88,
  "tone_findings": ["short note about any remaining tone issue", "another short note"]
}

RULES:
- ats_score: 0-100, based on meaningful requirement and keyword alignment
- tone_score: 0-100, based on executive voice, clarity, and credibility
- top_suggestions: max 3
- tone_findings: max 5, keep each item short and actionable
- If the resume already sounds strong, tone_findings may be empty
- Do not return markdown fences or commentary`,
      messages: [{
        role: 'user',
        content: `RESUME:\n${resume_text}\n\nJOB DESCRIPTION:\n${job_description}\n\nEvaluate this revised resume for final polish.`,
      }],
      max_tokens: 2048,
    }));

    const result = repairJSON<{
      ats_score: number;
      keywords_found: string[];
      keywords_missing: string[];
      top_suggestions: string[];
      tone_score: number;
      tone_findings: string[];
    }>(response.text);

    if (!result) {
      return c.json({ error: 'Polish failed — unparseable response' }, 500);
    }

    return c.json({
      ats_score: result.ats_score,
      keywords_found: result.keywords_found ?? [],
      keywords_missing: result.keywords_missing ?? [],
      top_suggestions: result.top_suggestions ?? [],
      tone_score: result.tone_score,
      tone_findings: result.tone_findings ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, error: message }, 'Post-review polish failed');
    return c.json({ error: 'Polish failed', message }, 500);
  }
});

// ─── POST /:sessionId/integrate-keyword ─────────────────────────────

resumeV2Pipeline.post('/:sessionId/integrate-keyword', authMiddleware, rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 200_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = integrateKeywordSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { keyword, resume_text, job_description } = parsed.data;

  logger.info({ session_id: sessionId, keyword }, 'Keyword integration requested');

  try {
    const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
      model: MODEL_MID,
      system: `You are an expert resume editor. You will receive a resume, a job description, and a missing keyword/phrase.

Your job: find the SINGLE BEST bullet point or sentence in the resume to naturally incorporate this keyword/phrase. Rewrite ONLY that one bullet to include the keyword naturally — it should read fluently, not keyword-stuffed.

Return valid JSON only:
{
  "original_text": "the exact original bullet/sentence you're modifying",
  "revised_text": "the rewritten version with the keyword naturally integrated",
  "section": "which section the bullet is in (e.g., 'Professional Experience - Company Name')",
  "explanation": "one sentence explaining why this placement works"
}`,
      messages: [{
        role: 'user',
        content: `MISSING KEYWORD/PHRASE: "${keyword}"\n\nRESUME:\n${resume_text}\n\nJOB DESCRIPTION:\n${job_description}\n\nFind the best place to integrate this keyword naturally.`,
      }],
      max_tokens: 1024,
    }));

    const result = repairJSON<{
      original_text: string;
      revised_text: string;
      section: string;
      explanation: string;
    }>(response.text);

    if (!result) {
      return c.json({ error: 'Integration failed — unparseable response' }, 500);
    }

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, keyword, error: message }, 'Keyword integration failed');
    return c.json({ error: 'Integration failed', message }, 500);
  }
});

// ─── POST /:sessionId/gap-chat ────────────────────────────────────

function normalizeGapChatResult(
  result: {
    response: string;
    suggested_resume_language?: string;
    follow_up_question?: string;
    current_question?: string;
    needs_candidate_input?: boolean;
    recommended_next_action?: 'answer_question' | 'review_edit' | 'try_another_angle' | 'skip' | 'confirm';
    related_line_suggestions?: Array<{
      candidate_id: string;
      line_text: string;
      suggested_resume_language: string;
      rationale?: string;
      requirement?: string;
    }>;
  },
  args: {
    requirement: string;
    classification: 'partial' | 'missing' | 'strong';
    context: {
      evidence: string[];
      job_description_excerpt: string;
      coaching_policy?: {
        clarifyingQuestion: string;
      };
    };
  },
) {
  const fallbackQuestion = args.context.coaching_policy?.clarifyingQuestion?.trim()
    || buildRequirementFallbackQuestion({
      requirement: args.requirement,
      classification: args.classification,
      evidence: args.context.evidence,
      jobDescriptionExcerpt: args.context.job_description_excerpt,
    });
  const hasStrongRewrite = looksLikeRequirementRewrite(result.suggested_resume_language);
  const bestQuestion = looksLikeTargetedRequirementQuestion(result.current_question, args.requirement)
    ? result.current_question.trim()
    : looksLikeTargetedRequirementQuestion(result.follow_up_question, args.requirement)
      ? result.follow_up_question.trim()
      : fallbackQuestion;

  if (!hasStrongRewrite) {
    return {
      response: buildRequirementFallbackResponse({
        requirement: args.requirement,
        classification: args.classification,
        evidence: args.context.evidence,
      }),
      current_question: bestQuestion,
      follow_up_question: bestQuestion,
      suggested_resume_language: undefined,
      needs_candidate_input: true,
      recommended_next_action: 'answer_question' as const,
      related_line_suggestions: result.related_line_suggestions,
    };
  }

  return {
    ...result,
    current_question: looksLikeTargetedRequirementQuestion(result.current_question, args.requirement) ? result.current_question.trim() : undefined,
    follow_up_question: looksLikeTargetedRequirementQuestion(result.follow_up_question, args.requirement) ? result.follow_up_question.trim() : undefined,
    needs_candidate_input: false,
    recommended_next_action: 'review_edit' as const,
  };
}

type StructuredCoachingResponse = z.infer<typeof structuredCoachingResponseSchema>;
type LineCoachRequest = z.infer<typeof lineCoachSchema>;

const LINE_COACH_SYSTEM = `You are the line coach inside a premium executive resume rewrite workflow.

You help the candidate improve ONE requirement, bullet, or final-review concern at a time.

Your job:
1. Identify what the line is trying to prove
2. Explain what proof already exists and what is still missing
3. Recommend the strongest truthful wording you can from the evidence already in hand
4. Ask ONE short confirm-or-correct question only when a missing detail would materially strengthen the resume
5. Be explicit when the best move is adjacent proof, soft inference, or leaving the issue unresolved

CONVERSATION STYLE:
- Warm, collaborative, and plain-spoken
- Tell the candidate what the current evidence already proves before asking for more
- Recommendation-first: lead with the safest strong rewrite you can, not with a broad question
- Ask only ONE next question at a time, and make it narrow and guided
- Name the actual evidence when you can
- Be aggressive about reframing nearby evidence, but never bluff
- If earlier confirmed clarifications already answer the gap, reuse them before asking anything new
- When earlier confirmed clarifications are relevant, say so plainly instead of making the candidate repeat themselves
- Never ask the candidate to invent resume wording from scratch if you can reasonably propose it for them

RESPONSE FORMAT: Return valid JSON only:
{
  "response": "2-4 sentence coaching reply",
  "suggested_resume_language": "Ready-to-review resume wording if enough context exists. Omit if you still need an answer.",
  "follow_up_question": "One targeted follow-up question. Omit if no answer is needed now.",
  "current_question": "Repeat the one question the candidate should answer next. Omit if no answer is needed now.",
  "needs_candidate_input": true,
  "recommended_next_action": "answer_question" | "review_edit" | "try_another_angle" | "skip" | "confirm",
  "related_line_suggestions": [
    {
      "candidate_id": "candidate id from the provided context",
      "line_text": "The nearby line this answer can also improve",
      "suggested_resume_language": "Sharper truthful rewrite for that nearby line",
      "rationale": "Why the same answer helps here",
      "requirement": "Optional requirement this nearby line reinforces"
    }
  ]
}

RULES:
- Never fabricate experience, ownership, metrics, credentials, or outcomes.
- If the evidence is adjacent, say that explicitly and translate it honestly.
- If an inferred metric is provided, use it conservatively and only when it fits the evidence.
- suggested_resume_language must be polished resume wording for the current line type, not commentary.
- Prefer giving suggested_resume_language whenever you can produce a safe truthful version.
- If the line type is a competency, keep it short and keyword-friendly rather than writing a sentence.
- If the line type is a summary or section intro, write a concise executive line rather than a bullet fragment.
- If you need an answer, ask for a confirm-or-correct detail, not a broad open-ended story.
- Good question style: "Would it be fair to say X, or should I keep this safer?"
- Bad question style: "Tell me more about this."
- If you need an answer, set needs_candidate_input=true and recommended_next_action="answer_question".
- If you provide usable language, set recommended_next_action="review_edit".
- Only include related_line_suggestions when the same answer would materially improve nearby lines from the provided context.
- Never invent nearby lines. Use only candidate_id values provided in the context block.
- Keep related_line_suggestions to at most 3 items and only when each suggestion is genuinely strengthened by the new answer.
- If the issue should remain unresolved or be removed, say so plainly.`;

function modeInstruction(mode: LineCoachRequest['mode']): string {
  switch (mode) {
    case 'rewrite':
      return 'Mode: rewrite. Produce a sharper but truthful bullet when the evidence already supports the claim.';
    case 'quantify':
      return 'Mode: quantify. Look for defensible scope, cadence, scale, or outcome language grounded in the evidence.';
    case 'reframe':
      return 'Mode: reframe. Translate adjacent experience into the role language honestly without overclaiming.';
    case 'final_review_fix':
      return 'Mode: final_review_fix. Resolve the hiring-manager concern directly and tie your advice to the concern.';
    case 'clarify':
    default:
      return 'Mode: clarify. Surface the one missing detail that would make the proof believable and stronger, but first reuse any earlier confirmed clarifications that already cover part of the gap.';
  }
}

function buildLineCoachContextBlock(request: LineCoachRequest): string {
  const { mode, item_id, context } = request;
  const evidence = context.evidence ?? [];

  if (mode === 'final_review_fix') {
    return [
      '## Line Coach Mode',
      modeInstruction(mode),
      '',
      '## Final Review Concern',
      `Concern ID: ${context.concern_id ?? item_id}`,
      context.work_item_id ? `Work item: ${context.work_item_id}` : '',
      context.concern_type ? `Type: ${context.concern_type}` : '',
      context.severity ? `Severity: ${context.severity}` : '',
      '',
      '## Observation',
      context.observation ?? '',
      '',
      '## Why It Hurts',
      context.why_it_hurts ?? '',
      '',
      '## Fix Strategy',
      context.fix_strategy ?? '',
      context.clarifying_question ? `Candidate question: ${context.clarifying_question}` : '',
      typeof context.requires_candidate_input === 'boolean'
        ? `Requires candidate input: ${context.requires_candidate_input ? 'yes' : 'no'}`
        : '',
      context.target_section ? `Target section: ${context.target_section}` : '',
      context.related_requirement ? `Related requirement: ${context.related_requirement}` : '',
      context.suggested_resume_edit ? `Existing sample language: ${context.suggested_resume_edit}` : '',
      '',
      '## Role Context',
      [context.role_title, context.company_name].filter(Boolean).join(' at '),
      context.job_description_fit ? `Job fit: ${context.job_description_fit}` : '',
      context.benchmark_alignment ? `Benchmark alignment: ${context.benchmark_alignment}` : '',
      context.business_impact ? `Business impact: ${context.business_impact}` : '',
      context.clarity_and_credibility ? `Clarity and credibility: ${context.clarity_and_credibility}` : '',
      '',
      '## Resume Excerpt',
      context.resume_excerpt ?? '',
    ].filter(Boolean).join('\n');
  }

  return [
    '## Line Coach Mode',
    modeInstruction(mode),
    '',
    '## Resume Line Context',
    context.line_kind ? `Line type: ${context.line_kind}` : '',
    context.section_label ? `Section: ${context.section_label}` : '',
    context.section_recommended_for_job === true ? 'Section importance: recommended for this role' : '',
    context.section_recommended_for_job === false ? 'Section importance: optional support section for this role' : '',
    context.section_rationale ? `Section rationale: ${context.section_rationale}` : '',
    context.line_text ? `Current line: ${context.line_text}` : '',
    context.related_requirements?.length ? `Related requirements: ${context.related_requirements.join(' | ')}` : '',
    context.coaching_goal ? `Coaching goal: ${context.coaching_goal}` : '',
    context.clarifying_questions?.length
      ? `Useful follow-up questions:\n${context.clarifying_questions.map((question) => `- ${question}`).join('\n')}`
      : '',
    context.prior_clarifications?.length
      ? `Previously confirmed candidate clarifications:\n${context.prior_clarifications.map((entry) => (
          `- topic="${entry.topic}"; answer="${entry.user_input}"${entry.applied_language ? `; applied_language="${entry.applied_language}"` : ''}${entry.primary_family ? `; family=${entry.primary_family}` : ''}`
        )).join('\n')}`
      : '',
    context.related_line_candidates?.length
      ? `Nearby lines that could also improve with the same answer:\n${context.related_line_candidates.map((candidate) => (
          `- candidate_id=${candidate.id}; label=${candidate.label}; line="${candidate.line_text}"; requirements=${candidate.requirements.join(' | ') || 'none'}${candidate.evidence_found ? `; evidence=${candidate.evidence_found}` : ''}`
        )).join('\n')}`
      : '',
    '',
    '## Requirement Work Item',
    `Requirement: ${context.requirement ?? item_id}`,
    context.work_item_id ? `Work item: ${context.work_item_id}` : '',
    context.classification ? `Classification: ${context.classification}` : '',
    context.review_state ? `Review state: ${context.review_state}` : '',
    context.requirement_source ? `Requirement source: ${context.requirement_source}` : '',
    context.source_evidence ? `Source evidence: ${context.source_evidence}` : '',
    '',
    evidence.length > 0
      ? `## Candidate Evidence\n${evidence.map((entry) => `- ${entry}`).join('\n')}`
      : '## Candidate Evidence\nNone found in current resume.',
    '',
    context.current_strategy ? `## Current Strategy\n${context.current_strategy}` : '',
    context.ai_reasoning ? `## AI Analysis\n${context.ai_reasoning}` : '',
    context.inferred_metric ? `## Inferred Metric\n${context.inferred_metric}` : '',
    context.coaching_policy
      ? `## Shared Coaching Guidance\nWhy this matters: ${context.coaching_policy.rationale}\nWhat would make this believable: ${context.coaching_policy.lookingFor}\nBest next question: ${context.coaching_policy.clarifyingQuestion}`
      : '',
    context.job_description_excerpt ? `## Job Description Context\n${context.job_description_excerpt}` : '',
    context.candidate_experience_summary ? `## Candidate Background Summary\n${context.candidate_experience_summary}` : '',
  ].filter(Boolean).join('\n');
}

function buildLineCoachStarter(request: LineCoachRequest): StructuredCoachingResponse {
  const { mode, item_id, context } = request;

  if (mode === 'final_review_fix') {
    const starterSubject = context.related_requirement?.trim() || context.observation?.trim() || item_id;
    const starterQuestion = context.clarifying_question?.trim()
      || (starterSubject
        ? buildRequirementClarifyingQuestion(starterSubject)
        : 'What concrete truthful detail would address this concern?');
    const starterNeedsInput = context.requires_candidate_input ?? !context.suggested_resume_edit;
    const starterAction = starterNeedsInput
      ? 'answer_question'
      : context.suggested_resume_edit
        ? 'review_edit'
        : 'answer_question';

    return {
      response: 'I understand the concern. I will either ask for the one missing detail that matters most or give you language that directly resolves it.',
      recommended_next_action: starterAction,
      needs_candidate_input: starterNeedsInput,
      follow_up_question: starterQuestion,
      current_question: starterQuestion,
    };
  }

  const requirement = context.requirement ?? item_id;
  const classification = context.classification ?? 'partial';
  const hasPriorClarifications = (context.prior_clarifications?.length ?? 0) > 0;
  const starterQuestion = context.coaching_policy?.clarifyingQuestion?.trim()
    || buildRequirementFallbackQuestion({
      requirement,
      classification,
      evidence: context.evidence ?? [],
      jobDescriptionExcerpt: context.job_description_excerpt ?? '',
    });

  return {
    response: hasPriorClarifications
      ? 'I will first reuse the strongest confirmed details you already shared earlier. I will only ask a new question if one critical detail is still missing after that.'
      : 'I will start by drafting the safest strong version I can from the evidence already here. If one detail would materially strengthen it, I will ask a short confirm-or-correct question instead of an open-ended one.',
    follow_up_question: undefined,
    current_question: hasPriorClarifications ? undefined : starterQuestion,
    needs_candidate_input: false,
    recommended_next_action: 'review_edit',
  };
}

async function runLineCoachTurn(
  sessionId: string,
  userId: string,
  request: LineCoachRequest,
): Promise<StructuredCoachingResponse> {
  const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: buildLineCoachContextBlock(request) },
    { role: 'assistant', content: JSON.stringify(buildLineCoachStarter(request)) },
    ...request.messages,
  ];

  const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
    model: MODEL_MID,
    system: LINE_COACH_SYSTEM,
    messages: llmMessages,
    max_tokens: 1024,
  }));

  const repaired = repairJSON<unknown>(response.text);
  const result = structuredCoachingResponseSchema.safeParse(repaired);

  if (!result.success) {
    if (request.mode === 'final_review_fix') {
      return {
        response: response.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim(),
        recommended_next_action: 'answer_question',
        needs_candidate_input: true,
        related_line_suggestions: undefined,
      };
    }

    const requirement = request.context.requirement ?? request.item_id;
    const classification = request.context.classification ?? 'partial';
    const fallbackQuestion = request.context.coaching_policy?.clarifyingQuestion?.trim()
      || buildRequirementFallbackQuestion({
        requirement,
        classification,
        evidence: request.context.evidence ?? [],
        jobDescriptionExcerpt: request.context.job_description_excerpt ?? '',
      });

    return {
      response: buildRequirementFallbackResponse({
        requirement,
        classification,
        evidence: request.context.evidence ?? [],
      }),
      follow_up_question: fallbackQuestion,
      current_question: fallbackQuestion,
      recommended_next_action: 'answer_question',
      needs_candidate_input: true,
      related_line_suggestions: undefined,
    };
  }

  if (request.mode === 'final_review_fix') {
    return result.data;
  }

  return normalizeGapChatResult(result.data, {
    requirement: request.context.requirement ?? request.item_id,
    classification: request.context.classification ?? 'partial',
    context: {
      evidence: request.context.evidence ?? [],
      job_description_excerpt: request.context.job_description_excerpt ?? '',
      coaching_policy: request.context.coaching_policy,
    },
  });
}

resumeV2Pipeline.post('/:sessionId/line-coach', authMiddleware, rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 50_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = lineCoachSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  logger.info({ session_id: sessionId, item_id: parsed.data.item_id, mode: parsed.data.mode, turn: parsed.data.messages.length }, 'Line coach message');

  try {
    return c.json(await runLineCoachTurn(sessionId, userId, parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, item_id: parsed.data.item_id, error: message }, 'Line coach failed');
    return c.json({ error: 'Chat failed', message }, 500);
  }
});

resumeV2Pipeline.post('/:sessionId/gap-chat', authMiddleware, rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 50_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = gapChatSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const request: LineCoachRequest = {
    mode: 'clarify',
    item_id: parsed.data.requirement,
    messages: parsed.data.messages,
    context: {
      requirement: parsed.data.requirement,
      classification: parsed.data.classification,
      evidence: parsed.data.context.evidence,
      current_strategy: parsed.data.context.current_strategy,
      ai_reasoning: parsed.data.context.ai_reasoning,
      inferred_metric: parsed.data.context.inferred_metric,
      job_description_excerpt: parsed.data.context.job_description_excerpt,
      candidate_experience_summary: parsed.data.context.candidate_experience_summary,
      coaching_policy: parsed.data.context.coaching_policy,
    },
  };

  logger.info({ session_id: sessionId, requirement: parsed.data.requirement, turn: parsed.data.messages.length }, 'Gap chat message');

  try {
    return c.json(await runLineCoachTurn(sessionId, userId, request));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, requirement: parsed.data.requirement, error: message }, 'Gap chat failed');
    return c.json({ error: 'Chat failed', message }, 500);
  }
});

// ─── POST /:sessionId/bullet-enhance ─────────────────────────────

const bulletEnhanceSchema = z.object({
  action: z.enum(['show_transformation', 'demonstrate_leadership', 'connect_to_role', 'show_accountability']),
  bullet_text: z.string().min(10).max(1000),
  requirement: z.string().max(1000),
  evidence: z.string().max(3000).optional(),
  job_context: z.string().max(2000).optional(),
  line_kind: z.enum(['bullet', 'summary', 'competency', 'section_summary', 'custom_line']).optional(),
  section_key: z.string().max(200).optional(),
  section_label: z.string().max(500).optional(),
  section_rationale: z.string().max(2000).optional(),
  section_recommended_for_job: z.boolean().optional(),
  source_evidence: z.string().max(5000).optional(),
  related_requirements: z.array(z.string().max(1000)).max(10).optional(),
  coaching_goal: z.string().max(2000).optional(),
  clarifying_questions: z.array(z.string().max(2000)).max(5).optional(),
});

function buildEnhanceActionDescription(
  action: z.infer<typeof bulletEnhanceSchema>['action'],
  lineKind: z.infer<typeof bulletEnhanceSchema>['line_kind'],
  sectionLabel?: string,
): string {
  if (lineKind === 'summary') {
    switch (action) {
      case 'show_transformation':
        return 'Rewrite this executive summary line so the opening tells a sharper transformation story: what kind of change this leader drives, at what level, and why it matters. Keep it concise, executive, and credible. Return 3 versions with different angles.';
      case 'demonstrate_leadership':
        return 'Rewrite this executive summary line to foreground leadership scope through people, scale, and operating cadence. Make the leadership signal unmistakable in concise executive language. Return 3 versions.';
      case 'connect_to_role':
        return 'Rewrite this executive summary line to mirror the target role more directly. Bridge the candidate\'s background to the hiring company\'s language, priorities, and problem space. Return 3 concise versions.';
      case 'show_accountability':
        return 'Rewrite this executive summary line to foreground ownership, standards, and business impact. Make it sound like a leader trusted with meaningful outcomes, not just activity. Return 3 concise versions.';
    }
  }

  if (lineKind === 'competency') {
    switch (action) {
      case 'show_transformation':
        return 'Rewrite this competency as a sharper ATS-friendly keyword phrase that signals transformation or change capability. Return 3 short versions with no ending punctuation.';
      case 'demonstrate_leadership':
        return 'Rewrite this competency as a sharper ATS-friendly phrase that signals leadership through people, organizational influence, or executive ownership. Return 3 short versions with no ending punctuation.';
      case 'connect_to_role':
        return 'Rewrite this competency in language that more closely matches the target role and job description. Return 3 ATS-friendly keyword phrases with no ending punctuation.';
      case 'show_accountability':
        return 'Rewrite this competency as a sharper ATS-friendly phrase that signals operating rigor, accountability, governance, or disciplined execution. Return 3 short versions with no ending punctuation.';
    }
  }

  if (lineKind === 'section_summary' || lineKind === 'custom_line') {
    const sectionPhrase = sectionLabel ? `"${sectionLabel}"` : 'this section';
    switch (action) {
      case 'show_transformation':
        return `Rewrite this resume line so it sharpens the story inside ${sectionPhrase}. Show the change, upgrade, or transformation the candidate drove, while staying grounded in real evidence. Return 3 versions.`;
      case 'demonstrate_leadership':
        return `Rewrite this resume line so it shows leadership more clearly inside ${sectionPhrase}. Emphasize influence, ownership, and how the candidate led people or decisions. Return 3 versions.`;
      case 'connect_to_role':
        return `Rewrite this resume line so it connects ${sectionPhrase} more directly to the target role. Translate the experience into the hiring company\'s language and priorities. Return 3 versions.`;
      case 'show_accountability':
        return `Rewrite this resume line so it shows accountability, standards, or business impact inside ${sectionPhrase}. Make the line sound trusted, concrete, and outcome-oriented. Return 3 versions.`;
    }
  }

  switch (action) {
    case 'show_transformation':
      return 'Rewrite this bullet to show transformation: the before-state (what was broken or challenging), the action taken (HOW — through people, process, creativity, not just what), and the after-state (what became possible, not just the metric). Structure: inherited/faced → did → resulted in. Return 3 versions with different angles.';
    case 'demonstrate_leadership':
      return 'Rewrite this bullet to demonstrate leadership through people — empowerment, delegation, team development, growing others into leaders. Show who was developed, how they were empowered, what they accomplished as a result. The best leaders are measured by what their people achieved. Return 3 versions.';
    case 'connect_to_role':
      return 'Rewrite this bullet to explicitly translate this accomplishment into the hiring company\'s language and problem space. Bridge the candidate\'s experience to the specific JD requirement. Make it obvious why this experience matters for THIS role. Return 3 versions.';
    case 'show_accountability':
      return 'Rewrite this bullet to show accountability — standards set and enforced, or a recovery narrative (setback → rapid diagnosis → course correction → result). Show resilience, self-assessment, and learning. Hiring managers trust people who face failure data calmly and act fast. Return 3 versions.';
  }
}

function buildEnhanceLineTypeInstructions(lineKind: z.infer<typeof bulletEnhanceSchema>['line_kind'], sectionLabel?: string): string[] {
  switch (lineKind) {
    case 'summary':
      return [
        'This is an executive summary line, not a bullet.',
        'Return concise executive positioning language that could sit near the top of the resume.',
        'Keep the wording polished and high-signal rather than writing a long sentence.',
      ];
    case 'competency':
      return [
        'This is a core competency label, not a bullet sentence.',
        'Return short ATS-friendly keyword phrases, usually 2-6 words, with no ending punctuation.',
        'Do not turn it into a sentence or add unsupported claims.',
      ];
    case 'section_summary':
      return [
        `This is a section intro${sectionLabel ? ` for "${sectionLabel}"` : ''}.`,
        'Return concise section-summary language that frames the section well before the details underneath it.',
      ];
    case 'custom_line':
      return [
        `This line lives inside ${sectionLabel ? `"${sectionLabel}"` : 'a custom section'}.`,
        'Keep the rewrite aligned to the section theme while staying grounded in the evidence.',
      ];
    case 'bullet':
    default:
      return [
        'This is a resume bullet line.',
        'Return polished bullet-ready wording grounded in the supplied evidence.',
      ];
  }
}

resumeV2Pipeline.post('/:sessionId/bullet-enhance', authMiddleware, rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: sessionData } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, tailored_sections')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!sessionData) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 10_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = bulletEnhanceSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const {
    action,
    bullet_text,
    requirement,
    evidence,
    job_context,
    line_kind,
    section_key,
    section_label,
    section_rationale,
    section_recommended_for_job,
    source_evidence,
    related_requirements,
    coaching_goal,
    clarifying_questions,
  } = parsed.data;
  const actionDescription = buildEnhanceActionDescription(action, line_kind, section_label);
  const lineTypeInstructions = buildEnhanceLineTypeInstructions(line_kind, section_label);

  // Read enriched context from pipeline state if available
  let narrativeContext = '';
  let candidateContext = '';
  let gapContext = '';
  let jobContext2 = '';
  try {
    const stored = sessionData.tailored_sections as Record<string, unknown> | null;
    const pipelineState = (stored?.pipeline_data ?? stored) as Record<string, unknown> | null;
    if (pipelineState) {
      // ── Narrative context ──────────────────────────────────────────────
      const narrative = (pipelineState.narrativeStrategy ?? pipelineState.narrative_strategy) as Record<string, unknown> | undefined;
      if (narrative?.primary_narrative) {
        narrativeContext = `\nCANDIDATE'S POSITIONING: ${narrative.primary_narrative}`;
      }
      if (narrative?.why_me_concise) {
        narrativeContext += `\nWHY ME: ${narrative.why_me_concise}`;
      }

      // ── Candidate background ───────────────────────────────────────────
      const candidate = (pipelineState.candidateIntelligence ?? pipelineState.candidate_intelligence) as Record<string, unknown> | undefined;
      if (candidate) {
        const careerThemes = Array.isArray(candidate.career_themes)
          ? (candidate.career_themes as string[]).slice(0, 5).join(', ')
          : '';
        const leadershipScope = typeof candidate.leadership_scope === 'string'
          ? candidate.leadership_scope
          : '';
        const operationalScale = typeof candidate.operational_scale === 'string'
          ? candidate.operational_scale
          : '';
        const careerSpan = typeof candidate.career_span_years === 'number'
          ? `${candidate.career_span_years} years experience`
          : '';
        const quantifiedOutcomes = Array.isArray(candidate.quantified_outcomes)
          ? (candidate.quantified_outcomes as Array<Record<string, unknown>>)
              .slice(0, 4)
              .map((o) => `${o.outcome ?? ''}: ${o.value ?? ''}`)
              .filter((s) => s.trim().length > 2)
              .join(' | ')
          : '';
        const industryDepth = Array.isArray(candidate.industry_depth)
          ? (candidate.industry_depth as string[]).slice(0, 4).join(', ')
          : '';

        const candidateParts = [
          careerSpan,
          careerThemes ? `Themes: ${careerThemes}` : '',
          leadershipScope ? `Leadership scope: ${leadershipScope}` : '',
          operationalScale ? `Scale: ${operationalScale}` : '',
          industryDepth ? `Industries: ${industryDepth}` : '',
          quantifiedOutcomes ? `Key outcomes: ${quantifiedOutcomes}` : '',
        ].filter(Boolean).join('. ');

        if (candidateParts) {
          candidateContext = `\nCANDIDATE BACKGROUND: ${candidateParts}`;
        }
      }

      // ── Gap analysis context ───────────────────────────────────────────
      const gapAnalysis = (pipelineState.gapAnalysis ?? pipelineState.gap_analysis) as Record<string, unknown> | undefined;
      if (gapAnalysis) {
        const strengthSummary = typeof gapAnalysis.strength_summary === 'string'
          ? gapAnalysis.strength_summary
          : '';

        // Find the matching requirement to pull its evidence and JD source excerpt
        let requirementEvidence = '';
        let jdExcerpt = '';
        if (Array.isArray(gapAnalysis.requirements)) {
          const requirementLower = requirement.toLowerCase();
          const matchedReq = (gapAnalysis.requirements as Array<Record<string, unknown>>).find(
            (r) => typeof r.requirement === 'string' &&
              r.requirement.toLowerCase().includes(requirementLower.substring(0, 40)),
          );
          if (matchedReq) {
            if (Array.isArray(matchedReq.evidence)) {
              requirementEvidence = (matchedReq.evidence as string[]).slice(0, 3).join(' | ');
            }
            if (typeof matchedReq.source_evidence === 'string' && matchedReq.source_evidence.length > 0) {
              jdExcerpt = matchedReq.source_evidence.substring(0, 300);
            }
          }
        }

        const gapParts = [
          strengthSummary ? `STRENGTH SUMMARY: ${strengthSummary}` : '',
          requirementEvidence ? `RELATED EVIDENCE: ${requirementEvidence}` : '',
        ].filter(Boolean).join('\n');

        if (gapParts) {
          gapContext = `\n${gapParts}`;
        }
        if (jdExcerpt) {
          gapContext += `\nJD EXCERPT FOR THIS REQUIREMENT: ${jdExcerpt}`;
        }
      }

      // ── Job intelligence context ───────────────────────────────────────
      const jobIntelligence = (pipelineState.jobIntelligence ?? pipelineState.job_intelligence) as Record<string, unknown> | undefined;
      if (jobIntelligence) {
        const targetRole = typeof jobIntelligence.role_title === 'string'
          ? jobIntelligence.role_title
          : '';
        const companyName = typeof jobIntelligence.company_name === 'string'
          ? jobIntelligence.company_name
          : '';
        const industry = typeof jobIntelligence.industry === 'string'
          ? jobIntelligence.industry
          : '';

        const mustHaveCompetencies = Array.isArray(jobIntelligence.core_competencies)
          ? (jobIntelligence.core_competencies as Array<Record<string, unknown>>)
              .filter((c) => c.importance === 'must_have')
              .slice(0, 5)
              .map((c) => String(c.competency ?? ''))
              .filter(Boolean)
              .join(', ')
          : '';

        const businessProblems = Array.isArray(jobIntelligence.business_problems)
          ? (jobIntelligence.business_problems as string[]).slice(0, 3).join('; ')
          : '';

        const companyContext = [
          companyName ? `Company: ${companyName}` : '',
          industry ? `Industry: ${industry}` : '',
          businessProblems ? `Business problems: ${businessProblems}` : '',
        ].filter(Boolean).join('. ');

        const jobParts = [
          targetRole ? `TARGET ROLE: ${targetRole}` : '',
          mustHaveCompetencies ? `JOB REQUIREMENTS (must-have): ${mustHaveCompetencies}` : '',
          companyContext ? `COMPANY CONTEXT: ${companyContext}` : '',
        ].filter(Boolean).join('\n');

        if (jobParts) {
          jobContext2 = `\n${jobParts}`;
        }
      }
    }
  } catch { /* pipeline state may not have all fields */ }

  logger.info({ session_id: sessionId, action, bulletSnippet: bullet_text.substring(0, 60) }, 'Bullet enhance request');

  const prompt = [
    `You are a senior resume coach. Rewrite this resume line for the strongest truthful version.`,
    ``,
    `BULLET: "${bullet_text}"`,
    `REQUIREMENT IT ADDRESSES: "${requirement}"`,
    line_kind ? `LINE TYPE: "${line_kind}"` : '',
    section_label ? `SECTION: "${section_label}"` : '',
    section_key ? `SECTION KEY: "${section_key}"` : '',
    section_recommended_for_job === true ? 'SECTION PRIORITY: Recommended for this role.' : '',
    section_recommended_for_job === false ? 'SECTION PRIORITY: Optional support section for this role.' : '',
    section_rationale ? `SECTION RATIONALE: "${section_rationale}"` : '',
    related_requirements?.length ? `RELATED REQUIREMENTS: "${related_requirements.join(' | ')}"` : '',
    source_evidence ? `ROLE NEEDS: "${source_evidence}"` : '',
    gapContext || '',
    evidence ? `EVIDENCE FROM RESUME: "${evidence}"` : '',
    narrativeContext || '',
    candidateContext || '',
    jobContext2 || '',
    job_context ? `JOB CONTEXT: "${job_context}"` : '',
    coaching_goal ? `COACHING GOAL: "${coaching_goal}"` : '',
    clarifying_questions?.length ? `OPEN QUESTIONS TO CONSIDER: "${clarifying_questions.join(' | ')}"` : '',
    ``,
    ...lineTypeInstructions,
    ``,
    `Action: ${actionDescription}`,
    ``,
    `Return a JSON object with this exact structure:`,
    `{`,
    `  "enhanced_bullet": "<your primary rewrite of the bullet>",`,
    `  "alternatives": [`,
    `    {"text": "<a version emphasizing quantified metrics and numbers>", "angle": "metric"},`,
    `    {"text": "<a version emphasizing scope, scale, and breadth of responsibility>", "angle": "scope"},`,
    `    {"text": "<a version emphasizing business impact and outcomes>", "angle": "impact"}`,
    `  ]`,
    `}`,
    ``,
    `Each "text" value must be complete, ready-to-use resume wording for the requested line type — NOT a label describing what you would write.`,
    ``,
    `Rules:`,
    `- Every bullet MUST be grounded in the evidence provided`,
    `- Never fabricate experience, credentials, or outcomes`,
    `- Use conservative estimates if inferring numbers (back off 10-20%)`,
    `- Each alternative should take a genuinely different angle`,
    `- For competency lines, keep each option short and keyword-based rather than sentence-based`,
    `- For summary or section-intro lines, keep each option concise, executive, and top-of-resume appropriate`,
    `- For bullet and custom-section lines, keep each option 1-2 lines and start with a strong action verb when it reads naturally`,
  ].filter(Boolean).join('\n');

  try {
    const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
      model: MODEL_MID,
      system: 'You are a senior resume coach. Return ONLY valid JSON. No markdown fences. No commentary. Start with { and end with }.',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }));

    const repaired = repairJSON<{ enhanced_bullet?: string; alternatives?: Array<{ text: string; angle: string }> }>(response.text);

    if (!repaired || typeof repaired.enhanced_bullet !== 'string') {
      logger.warn({ session_id: sessionId, action, rawSnippet: response.text.substring(0, 200) }, 'Bullet enhance: JSON parse failed');
      return c.json({ error: 'Enhancement failed — could not parse LLM response' }, 500);
    }

    // Reject placeholder/template text that the LLM echoed from the prompt
    const PLACEHOLDER_PATTERNS = [
      /^(the\s+)?primary\s+rewrite/i,
      /^metric[- ]focused\s+(version|phrasing)/i,
      /^scope[- ]focused\s+(version|phrasing)/i,
      /^impact[- ]focused\s+(version|phrasing)/i,
      /^(a\s+)?version\s+emphasizing/i,
      /^your\s+(primary\s+)?rewrite/i,
    ];

    const isPlaceholder = (text: string) => PLACEHOLDER_PATTERNS.some(p => p.test(text.trim()));

    if (isPlaceholder(repaired.enhanced_bullet)) {
      logger.warn({ session_id: sessionId, action, enhancedBulletSnippet: repaired.enhanced_bullet.substring(0, 100) }, 'Bullet enhance: placeholder text detected in enhanced_bullet');
      return c.json({ error: 'Enhancement produced generic text. Please try with more specific evidence.' }, 500);
    }

    // Filter placeholder alternatives
    if (Array.isArray(repaired.alternatives)) {
      repaired.alternatives = repaired.alternatives.filter(
        (alt: { text?: string }) => typeof alt.text === 'string' && !isPlaceholder(alt.text),
      );
    }

    return c.json({
      enhanced_bullet: repaired.enhanced_bullet,
      alternatives: Array.isArray(repaired.alternatives) ? repaired.alternatives : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, action, error: message }, 'Bullet enhance failed');
    return c.json({ error: 'Enhancement failed', message }, 500);
  }
});

// ─── POST /:sessionId/final-review-chat ───────────────────────────

resumeV2Pipeline.post('/:sessionId/final-review-chat', authMiddleware, rateLimitMiddleware(30, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 60_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = finalReviewChatSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { concern_id, messages, context } = parsed.data;

  logger.info({ session_id: sessionId, concern_id, turn: messages.length }, 'Final review chat message');

  try {
    return c.json(await runLineCoachTurn(sessionId, userId, {
      mode: 'final_review_fix',
      item_id: concern_id,
      messages,
      context: {
        concern_id,
        work_item_id: context.work_item_id,
        concern_type: context.concern_type,
        severity: context.severity,
        observation: context.observation,
        why_it_hurts: context.why_it_hurts,
        fix_strategy: context.fix_strategy,
        requires_candidate_input: context.requires_candidate_input,
        clarifying_question: context.clarifying_question,
        target_section: context.target_section,
        related_requirement: context.related_requirement,
        suggested_resume_edit: context.suggested_resume_edit,
        role_title: context.role_title,
        company_name: context.company_name,
        job_description_fit: context.job_description_fit,
        benchmark_alignment: context.benchmark_alignment,
        business_impact: context.business_impact,
        clarity_and_credibility: context.clarity_and_credibility,
        resume_excerpt: context.resume_excerpt,
      },
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, concern_id, error: message }, 'Final review chat failed');
    return c.json({ error: 'Chat failed', message }, 500);
  }
});

// ─── POST /:sessionId/hiring-manager-review ────────────────────────

resumeV2Pipeline.post('/:sessionId/hiring-manager-review', authMiddleware, rateLimitMiddleware(10, 60_000), async (c) => {
  const user = c.get('user');
  const userId = user.id;
  const sessionId = c.req.param('sessionId');

  const { data: session } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, user_id, tailored_sections')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const parsedBody = await parseJsonBodyWithLimit(c, 200_000);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = hiringManagerReviewSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const {
    resume_text,
    job_description,
    company_name,
    role_title,
    requirements,
    job_requirements,
    hidden_signals,
    benchmark_profile_summary,
    benchmark_requirements,
  } = parsed.data;

  logger.info({ session_id: sessionId, user_id: userId, company_name, role_title }, 'Hiring manager review requested');

  const snapshot = session.tailored_sections && typeof session.tailored_sections === 'object'
    ? session.tailored_sections as Record<string, unknown>
    : null;
  const pipelineData = snapshot && typeof snapshot.pipeline_data === 'object'
    ? snapshot.pipeline_data as Record<string, unknown>
    : null;
  const sessionJobIntel = pipelineData && typeof pipelineData.jobIntelligence === 'object'
    ? pipelineData.jobIntelligence as Record<string, unknown>
    : null;
  const sessionBenchmark = pipelineData && typeof pipelineData.benchmarkCandidate === 'object'
    ? pipelineData.benchmarkCandidate as Record<string, unknown>
    : null;
  const sessionGapAnalysis = pipelineData && typeof pipelineData.gapAnalysis === 'object'
    ? pipelineData.gapAnalysis
    : null;
  const sessionRequirementWorkItems = Array.isArray(pipelineData?.requirementWorkItems)
    ? pipelineData.requirementWorkItems as Array<{ id?: string; requirement?: string }>
    : sessionGapAnalysis && typeof sessionGapAnalysis === 'object' && Array.isArray((sessionGapAnalysis as { requirement_work_items?: unknown[] }).requirement_work_items)
      ? (sessionGapAnalysis as { requirement_work_items: Array<{ id?: string; requirement?: string }> }).requirement_work_items
      : null;
  const careerProfile = await loadCareerProfileContext(userId);
  const hardRequirementRisks = extractHardRequirementRisksFromGapAnalysis(sessionGapAnalysis);
  const materialJobFitRisks = extractMaterialJobFitRisksFromGapAnalysis(sessionGapAnalysis);

  const mergedJobRequirements = job_requirements
    ?? requirements
    ?? [
      ...(
        Array.isArray(sessionJobIntel?.core_competencies)
          ? (sessionJobIntel.core_competencies as Array<{ competency?: string }>)
            .map(item => item?.competency)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
          : []
      ),
      ...(
        Array.isArray(sessionJobIntel?.strategic_responsibilities)
          ? (sessionJobIntel.strategic_responsibilities as string[]).filter(Boolean)
          : []
      ),
    ];

  const mergedHiddenSignals = hidden_signals
    ?? (
      Array.isArray(sessionJobIntel?.hidden_hiring_signals)
        ? (sessionJobIntel.hidden_hiring_signals as string[]).filter(Boolean)
        : []
    );

  const mergedBenchmarkProfileSummary = benchmark_profile_summary
    ?? (
      typeof sessionBenchmark?.ideal_profile_summary === 'string'
        ? sessionBenchmark.ideal_profile_summary
        : undefined
    );

  const mergedBenchmarkRequirements = benchmark_requirements ?? [
    ...(
      typeof sessionBenchmark?.expected_leadership_scope === 'string'
        ? [`Leadership scope: ${sessionBenchmark.expected_leadership_scope}`]
        : []
    ),
    ...(
      Array.isArray(sessionBenchmark?.expected_achievements)
        ? (sessionBenchmark.expected_achievements as Array<{
          area?: string;
          description?: string;
          typical_metrics?: string;
        }>)
          .map(item => {
            const area = typeof item?.area === 'string' ? item.area : 'Achievement';
            const description = typeof item?.description === 'string' ? item.description : '';
            const metrics = typeof item?.typical_metrics === 'string' ? item.typical_metrics : '';
            return [area, description, metrics ? `Typical metrics: ${metrics}` : '']
              .filter(Boolean)
              .join(' - ');
          })
          .filter(Boolean)
        : []
    ),
    ...(
      Array.isArray(sessionBenchmark?.expected_industry_knowledge)
        ? (sessionBenchmark.expected_industry_knowledge as string[]).filter(Boolean)
        : []
    ),
    ...(
      Array.isArray(sessionBenchmark?.expected_technical_skills)
        ? (sessionBenchmark.expected_technical_skills as string[]).filter(Boolean)
        : []
    ),
    ...(
      Array.isArray(sessionBenchmark?.expected_certifications)
        ? (sessionBenchmark.expected_certifications as string[]).filter(Boolean)
        : []
    ),
    ...(
      Array.isArray(sessionBenchmark?.differentiators)
        ? (sessionBenchmark.differentiators as string[]).filter(Boolean)
        : []
    ),
  ];

  const { systemPrompt, userPrompt } = buildFinalReviewPrompts({
    companyName: company_name,
    roleTitle: role_title,
    resumeText: resume_text,
    jobDescription: job_description,
    jobRequirements: mergedJobRequirements,
    hiddenSignals: mergedHiddenSignals,
    benchmarkProfileSummary: mergedBenchmarkProfileSummary,
    benchmarkRequirements: mergedBenchmarkRequirements,
    careerProfile,
  });

  try {
    const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
      model: MODEL_PRIMARY,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 4096,
    }));

    let repaired = repairJSON<unknown>(response.text);
    let validated = finalReviewResultSchema.safeParse(repaired);

    if (!validated.success) {
      const retry = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
        model: MODEL_PRIMARY,
        system: 'Return ONLY valid JSON. No markdown fences. No commentary. Start with { and end with }.',
        messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }],
        max_tokens: 4096,
      }));

      repaired = repairJSON<unknown>(retry.text);
      validated = finalReviewResultSchema.safeParse(repaired);
    }

    if (!validated.success) {
      logger.error({
        session_id: sessionId,
        issues: validated.error.flatten(),
      }, 'Hiring manager review returned invalid final review payload');
      return c.json({ error: 'Review failed — unparseable response' }, 500);
    }

    const stabilizedResult = stabilizeFinalReviewResult(validated.data, {
      hardRequirementRisks,
      materialJobFitRisks,
      resumeText: resume_text,
      requirementWorkItems: sessionRequirementWorkItems,
    });

    logger.info({
      session_id: sessionId,
      rating: stabilizedResult.hiring_manager_verdict.rating,
      recruiter_decision: stabilizedResult.six_second_scan.decision,
    }, 'Hiring manager review completed');

    const existingSnapshot = (session.tailored_sections as Record<string, unknown> | null) ?? {};
    const existingDraftState = existingSnapshot.draft_state && typeof existingSnapshot.draft_state === 'object'
      ? existingSnapshot.draft_state as Record<string, unknown>
      : {};
    const nextDraftState = {
      ...existingDraftState,
      final_review_state: {
        result: stabilizedResult,
        resolved_concern_ids: [],
        acknowledged_export_warnings: false,
        is_stale: false,
        reviewed_resume_text: parsed.data.resume_text,
        last_run_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    const nextSnapshot = {
      ...existingSnapshot,
      version: 'v2' as const,
      draft_state: nextDraftState,
    };

    const { error: persistError } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        tailored_sections: nextSnapshot as unknown as Record<string, unknown>,
      })
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (persistError) {
      logger.warn({ session_id: sessionId, error: persistError }, 'Failed to persist final review state');
    }

    return c.json(stabilizedResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, error: message }, 'Hiring manager review failed');
    return c.json({ error: 'Review failed', message }, 500);
  }
});
