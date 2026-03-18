/**
 * Resume v2 Pipeline Routes
 *
 * POST /start — Accepts resume_text + job_description, starts pipeline
 * GET /:sessionId/stream — SSE stream of pipeline events
 *
 * The v2 pipeline has no gates (no approval steps during generation).
 * The user sees results accumulate via SSE, then edits inline afterward.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { sseConnections, addSSEConnection, removeSSEConnection, type AnySSEEvent } from './sessions.js';
import logger from '../lib/logger.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import { runV2Pipeline } from '../agents/resume-v2/orchestrator.js';
import type { V2PipelineSSEEvent, V2PipelineStage } from '../agents/resume-v2/types.js';
import { llm } from '../lib/llm.js';
import { MODEL_MID, MODEL_LIGHT, MODEL_PRIMARY } from '../lib/model-constants.js';
import { repairJSON } from '../lib/json-repair.js';
import { loadCareerProfileContext } from '../lib/career-profile-context.js';
import {
  startSchema,
  editSchema,
  type EditAction,
  type StoredV2Snapshot,
  createInitialSnapshot,
  applyEventToSnapshot,
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
} from './resume-v2-pipeline-support.js';

export const resumeV2Pipeline = new Hono();

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

  return c.json({ status: 'received', responses: parsed.data.responses });
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
    return c.json({
      version: 'v2',
      status: session.pipeline_status,
      pipeline_stage: session.pipeline_stage,
      error_message: session.error_message ?? null,
      pipeline_data: stored.pipeline_data,
      inputs: stored.inputs,
      draft_state: stored.draft_state ?? null,
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

  const { action, selected_text, section, full_resume_context, job_description, custom_instruction, section_context, edit_context } = parsed.data;

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
    const response = await llm.chat({
      model: MODEL_MID,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1024,
    });

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
    const response = await llm.chat({
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
    });

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
    const response = await llm.chat({
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
    });

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
    const response = await llm.chat({
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
    });

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
- If the candidate's response reveals they truly don't have this experience, say so honestly and suggest they skip this gap.
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
    '',
    `## Job Description Context\n${context.job_description_excerpt}`,
    '',
    `## Candidate Background Summary\n${context.candidate_experience_summary}`,
  ].filter(Boolean).join('\n');

  // Build multi-turn conversation: context as first system-provided user message,
  // then the actual conversation history
  const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: contextBlock },
    { role: 'assistant', content: '{"response": "I understand the gap. Let me review what we have and help you position this.", "follow_up_question": "Tell me about any experience you have related to this requirement, even if it seems indirect."}' },
    ...messages,
  ];

  try {
    const response = await llm.chat({
      model: MODEL_MID,
      system: GAP_CHAT_SYSTEM,
      messages: llmMessages,
      max_tokens: 1024,
    });

    const repaired = repairJSON<unknown>(response.text);
    const result = structuredCoachingResponseSchema.safeParse(repaired);

    if (!result.success) {
      // Fallback: treat raw text as the response — log for monitoring
      logger.warn({ session_id: sessionId, requirement, rawSnippet: response.text.substring(0, 200) }, 'Gap chat: repairJSON failed, falling back to raw text');
      return c.json({
        response: response.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim(),
        recommended_next_action: 'answer_question',
        needs_candidate_input: true,
      });
    }

    return c.json(result.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, requirement, error: message }, 'Gap chat failed');
    return c.json({ error: 'Chat failed', message }, 500);
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
    { role: 'assistant', content: '{"response":"I understand the concern. I will either ask for the one missing detail that matters most or give you language that directly resolves it.","recommended_next_action":"answer_question","needs_candidate_input":true,"follow_up_question":"What additional detail can you share that would make this point more credible or specific?","current_question":"What additional detail can you share that would make this point more credible or specific?"}' },
    ...messages,
  ];

  try {
    const response = await llm.chat({
      model: MODEL_MID,
      system: FINAL_REVIEW_CHAT_SYSTEM,
      messages: llmMessages,
      max_tokens: 1024,
    });

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
  const careerProfile = await loadCareerProfileContext(userId);

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
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 4096,
    });

    let repaired = repairJSON<unknown>(response.text);
    let validated = finalReviewResultSchema.safeParse(repaired);

    if (!validated.success) {
      const retry = await llm.chat({
        model: MODEL_PRIMARY,
        system: 'Return ONLY valid JSON. No markdown fences. No commentary. Start with { and end with }.',
        messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }],
        max_tokens: 4096,
      });

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

    logger.info({
      session_id: sessionId,
      rating: validated.data.hiring_manager_verdict.rating,
      recruiter_decision: validated.data.six_second_scan.decision,
    }, 'Hiring manager review completed');

    const existingSnapshot = (session.tailored_sections as Record<string, unknown> | null) ?? {};
    const existingDraftState = existingSnapshot.draft_state && typeof existingSnapshot.draft_state === 'object'
      ? existingSnapshot.draft_state as Record<string, unknown>
      : {};
    const nextDraftState = {
      ...existingDraftState,
      final_review_state: {
        result: validated.data,
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

    return c.json(validated.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, error: message }, 'Hiring manager review failed');
    return c.json({ error: 'Review failed', message }, 500);
  }
});
