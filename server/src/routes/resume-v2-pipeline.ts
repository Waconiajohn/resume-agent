/**
 * Resume v2 Pipeline Routes
 *
 * POST /start — Accepts resume_text + job_description, starts pipeline
 * GET /:sessionId/stream — SSE stream of pipeline events
 *
 * The v2 pipeline has no gates (no approval steps during generation).
 * The user sees results accumulate via SSE, then edits inline afterward.
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

  const { resume_text, job_description, user_context, gap_coaching_responses, pre_scores } = parsed.data;
  const initialSnapshot = createInitialSnapshot(resume_text, job_description);

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
      const careerProfile = await loadCareerProfileContext(userId);

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
        user_context,
        gap_coaching_responses,
        pre_scores,
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

const GAP_CHAT_SYSTEM = `You are a $3,000/engagement executive resume strategist having a coaching conversation with a candidate about a specific gap on their resume.

Your job:
1. Help them surface hidden experience they haven't articulated
2. Find creative, TRUTHFUL ways to position their real experience against the requirement
3. When you have enough context, propose specific resume language they can add
4. Guide the user one step at a time so they always know whether to answer, review an edit, try another angle, or skip it

CONVERSATION STYLE:
- Warm but direct. You're a coach, not a cheerleader.
- Ask ONE targeted follow-up question at a time — don't overwhelm.
- When the candidate shares new information, immediately show how you'd use it.
- Show your math when inferring numbers (budget from team size, etc.) and back off 10-20%.
- Speak in plain language. Tell them what the current evidence already proves, what is still missing, and what the next step is.
- Name the actual evidence when you can. Avoid vague phrases like "related experience" unless you immediately say what experience you mean.

RESPONSE FORMAT: Return valid JSON only:
{
  "response": "Your conversational reply — coaching explanation, what you found, follow-up question. 2-4 sentences.",
  "suggested_resume_language": "Ready-to-use resume bullet text if you have enough context. Omit this field if you need more information first.",
  "follow_up_question": "A single targeted question to surface more evidence. Omit if you've proposed language and are waiting for their decision.",
  "current_question": "Repeat the one question the candidate should answer next. Omit if no answer is needed right now.",
  "needs_candidate_input": true,
  "recommended_next_action": "answer_question" | "review_edit" | "try_another_angle" | "skip" | "confirm"
}

RULES:
- NEVER fabricate experience. Only position what's real.
- When inferring metrics, back off 10-20% from calculated values.
- suggested_resume_language should be a single, polished resume bullet — not a paragraph.
- suggested_resume_language must sound like a real resume line, not a label or category name.
- If an inferred metric is provided in the context, your suggested_resume_language MUST incorporate it. Never infer a number in one place while writing generic language elsewhere.
- If the candidate's response reveals they truly don't have this experience, say so honestly and suggest they skip this gap.
- When you ask a question, tie it to the strongest evidence we already have or the specific company/role in the background summary whenever possible.
- Do not just restate the requirement. Explain what would make the proof believable for a recruiter.
- If you ask a question, set needs_candidate_input=true and recommended_next_action="answer_question".
- If you propose language, set recommended_next_action="review_edit".
- If the candidate seems stuck, you may set recommended_next_action="try_another_angle" or "skip".`;

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

  const { requirement, classification, messages, context } = parsed.data;

  logger.info({ session_id: sessionId, requirement, turn: messages.length }, 'Gap chat message');

  const starterQuestion = context.coaching_policy?.clarifyingQuestion?.trim()
    || buildRequirementFallbackQuestion({
      requirement,
      classification,
      evidence: context.evidence,
      jobDescriptionExcerpt: context.job_description_excerpt,
    });

  // Build the context message for the first turn
  const contextBlock = [
    `## Gap Being Discussed`,
    `Requirement: ${requirement}`,
    `Classification: ${classification}`,
    '',
    context.evidence.length > 0
      ? `## Candidate's Relevant Experience\n${context.evidence.map(e => `- ${e}`).join('\n')}`
      : '## Candidate\'s Relevant Experience\nNone found in current resume.',
    '',
    context.current_strategy ? `## Current Positioning Strategy\n${context.current_strategy}` : '',
    context.ai_reasoning ? `## AI Analysis\n${context.ai_reasoning}` : '',
    context.inferred_metric ? `## Inferred Metric\n${context.inferred_metric}` : '',
    context.coaching_policy
      ? `## Shared Coaching Guidance\nWhy this matters: ${context.coaching_policy.rationale}\nWhat would make this believable: ${context.coaching_policy.lookingFor}\nBest next question: ${context.coaching_policy.clarifyingQuestion}`
      : '',
    '',
    `## Job Description Context\n${context.job_description_excerpt}`,
    '',
    `## Candidate Background Summary\n${context.candidate_experience_summary}`,
  ].filter(Boolean).join('\n');

  // Build multi-turn conversation: context as first system-provided user message,
  // then the actual conversation history
  const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: contextBlock },
    { role: 'assistant', content: JSON.stringify({
      response: 'I will compare what the role needs with the strongest proof we already have, then either give you one better resume line or ask for the one missing detail that matters most.',
      follow_up_question: starterQuestion,
      current_question: starterQuestion,
      needs_candidate_input: true,
      recommended_next_action: 'answer_question',
    }) },
    ...messages,
  ];

  try {
    const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
      model: MODEL_MID,
      system: GAP_CHAT_SYSTEM,
      messages: llmMessages,
      max_tokens: 1024,
    }));

    const repaired = repairJSON<unknown>(response.text);
    const result = structuredCoachingResponseSchema.safeParse(repaired);

    if (!result.success) {
      // Fallback: treat raw text as the response — log for monitoring
      logger.warn({ session_id: sessionId, requirement, rawSnippet: response.text.substring(0, 200) }, 'Gap chat: repairJSON failed, falling back to raw text');
      const fallbackQuestion = buildRequirementFallbackQuestion({
        requirement,
        classification,
        evidence: context.evidence,
        jobDescriptionExcerpt: context.job_description_excerpt,
      });
      return c.json({
        response: buildRequirementFallbackResponse({
          requirement,
          classification,
          evidence: context.evidence,
        }),
        follow_up_question: context.coaching_policy?.clarifyingQuestion?.trim() || fallbackQuestion,
        current_question: context.coaching_policy?.clarifyingQuestion?.trim() || fallbackQuestion,
        recommended_next_action: 'answer_question',
        needs_candidate_input: true,
      });
    }

    return c.json(normalizeGapChatResult(result.data, { requirement, classification, context }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, requirement, error: message }, 'Gap chat failed');
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
});

const ACTION_DESCRIPTIONS: Record<string, string> = {
  show_transformation: 'Rewrite this bullet to show transformation: the before-state (what was broken or challenging), the action taken (HOW — through people, process, creativity, not just what), and the after-state (what became possible, not just the metric). Structure: inherited/faced → did → resulted in. Return 3 versions with different angles.',
  demonstrate_leadership: 'Rewrite this bullet to demonstrate leadership through people — empowerment, delegation, team development, growing others into leaders. Show who was developed, how they were empowered, what they accomplished as a result. The best leaders are measured by what their people achieved. Return 3 versions.',
  connect_to_role: 'Rewrite this bullet to explicitly translate this accomplishment into the hiring company\'s language and problem space. Bridge the candidate\'s experience to the specific JD requirement. Make it obvious why this experience matters for THIS role. Return 3 versions.',
  show_accountability: 'Rewrite this bullet to show accountability — standards set and enforced, or a recovery narrative (setback → rapid diagnosis → course correction → result). Show resilience, self-assessment, and learning. Hiring managers trust people who face failure data calmly and act fast. Return 3 versions.',
};

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

  const { action, bullet_text, requirement, evidence, job_context } = parsed.data;
  const actionDescription = ACTION_DESCRIPTIONS[action];

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
    `You are a senior resume coach. Rewrite this bullet for a resume.`,
    ``,
    `BULLET: "${bullet_text}"`,
    `REQUIREMENT IT ADDRESSES: "${requirement}"`,
    gapContext || '',
    evidence ? `EVIDENCE FROM RESUME: "${evidence}"` : '',
    narrativeContext || '',
    candidateContext || '',
    jobContext2 || '',
    job_context ? `JOB CONTEXT: "${job_context}"` : '',
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
    `Each "text" value must be a complete, ready-to-use resume bullet — NOT a label or description.`,
    ``,
    `Rules:`,
    `- Every bullet MUST be grounded in the evidence provided`,
    `- Never fabricate experience, credentials, or outcomes`,
    `- Use conservative estimates if inferring numbers (back off 10-20%)`,
    `- Each alternative should take a genuinely different angle`,
    `- Each bullet should be 1-2 lines, start with a strong action verb`,
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

const FINAL_REVIEW_CHAT_SYSTEM = `You are the follow-up coach inside the Final Review stage of a premium resume rewrite workflow.

You are helping the candidate resolve ONE specific hiring-manager concern at a time.

Your job:
1. Ask one targeted clarification question when missing detail could materially strengthen the resume
2. Turn the candidate's answer into truthful, polished resume language when you have enough context
3. Keep the advice tightly tied to the hiring-manager concern, the target role, and the affected section
4. If the candidate truly lacks the experience, say so plainly and suggest positioning it as partial or unresolved

RESPONSE FORMAT: Return valid JSON only:
{
  "response": "2-4 sentence coaching reply",
  "suggested_resume_language": "Ready-to-review resume wording if enough context exists. Omit if you still need an answer.",
  "follow_up_question": "One targeted follow-up question. Omit if no answer is needed now.",
  "current_question": "Repeat the one question the candidate should answer next. Omit if no answer is needed now.",
  "needs_candidate_input": true,
  "recommended_next_action": "answer_question" | "review_edit" | "try_another_angle" | "skip" | "confirm"
}

RULES:
- Never fabricate experience, metrics, scope, credentials, or outcomes.
- Keep the response grounded in the actual concern.
- If you propose language, make it concise and executive-level.
- If you ask a question, set needs_candidate_input=true and recommended_next_action="answer_question".
- If you propose language, set recommended_next_action="review_edit".
- If adjacent experience is the best available move, say that explicitly and keep it truthful.
- If the concern should remain unresolved, recommended_next_action should be "skip" or "confirm".`;

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

  const starterSubject = context.related_requirement?.trim() || context.observation?.trim();
  const starterQuestion = context.clarifying_question?.trim()
    || (starterSubject
      ? buildRequirementClarifyingQuestion(starterSubject)
      : 'What concrete truthful detail would address this concern?');
  const starterNeedsInput = context.requires_candidate_input ?? !context.suggested_resume_edit;
  const starterAction = starterNeedsInput ? 'answer_question' : context.suggested_resume_edit ? 'review_edit' : 'answer_question';

  const contextBlock = [
    '## Final Review Concern',
    `Concern ID: ${concern_id}`,
    `Type: ${context.concern_type}`,
    `Severity: ${context.severity}`,
    '',
    `## Observation`,
    context.observation,
    '',
    `## Why It Hurts`,
    context.why_it_hurts,
    '',
    `## Fix Strategy`,
    context.fix_strategy,
    context.clarifying_question ? `Candidate question: ${context.clarifying_question}` : '',
    `Requires candidate input: ${starterNeedsInput ? 'yes' : 'no'}`,
    context.target_section ? `Target section: ${context.target_section}` : '',
    context.related_requirement ? `Related requirement: ${context.related_requirement}` : '',
    context.suggested_resume_edit ? `Existing sample language: ${context.suggested_resume_edit}` : '',
    '',
    `## Role Context`,
    `${context.role_title} at ${context.company_name}`,
    context.job_description_fit ? `Job fit: ${context.job_description_fit}` : '',
    context.benchmark_alignment ? `Benchmark alignment: ${context.benchmark_alignment}` : '',
    context.business_impact ? `Business impact: ${context.business_impact}` : '',
    context.clarity_and_credibility ? `Clarity and credibility: ${context.clarity_and_credibility}` : '',
    '',
    '## Resume Excerpt',
    context.resume_excerpt,
  ].filter(Boolean).join('\n');

  const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: contextBlock },
    { role: 'assistant', content: JSON.stringify({
      response: 'I understand the concern. I will either ask for the one missing detail that matters most or give you language that directly resolves it.',
      recommended_next_action: starterAction,
      needs_candidate_input: starterNeedsInput,
      follow_up_question: starterQuestion,
      current_question: starterQuestion,
    }) },
    ...messages,
  ];

  try {
    const response = await withTrackedSessionUsage(sessionId, userId, async () => llm.chat({
      model: MODEL_MID,
      system: FINAL_REVIEW_CHAT_SYSTEM,
      messages: llmMessages,
      max_tokens: 1024,
    }));

    const repaired = repairJSON<unknown>(response.text);
    const result = structuredCoachingResponseSchema.safeParse(repaired);

    if (!result.success) {
      logger.warn({ session_id: sessionId, concern_id, rawSnippet: response.text.substring(0, 200) }, 'Final review chat: repairJSON failed, falling back to raw text');
      return c.json({
        response: response.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim(),
        recommended_next_action: 'answer_question',
        needs_candidate_input: true,
      });
    }

    return c.json(result.data);
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
