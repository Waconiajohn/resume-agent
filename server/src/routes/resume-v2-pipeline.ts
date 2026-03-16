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
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { sseConnections, addSSEConnection, removeSSEConnection, type AnySSEEvent } from './sessions.js';
import logger from '../lib/logger.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import { runV2Pipeline } from '../agents/resume-v2/orchestrator.js';
import type { V2PipelineSSEEvent } from '../agents/resume-v2/types.js';
import { llm } from '../lib/llm.js';
import { MODEL_MID, MODEL_LIGHT, MODEL_PRIMARY } from '../lib/model-constants.js';
import { repairJSON } from '../lib/json-repair.js';

const startSchema = z.object({
  resume_text: z.string().min(50, 'Resume must be at least 50 characters').max(50000, 'Resume must be at most 50,000 characters'),
  job_description: z.string().min(50, 'Job description must be at least 50 characters').max(50000, 'Job description must be at most 50,000 characters'),
  user_context: z.string().optional(),
});

const EDIT_ACTIONS = ['strengthen', 'add_metrics', 'shorten', 'add_keywords', 'rewrite', 'custom', 'not_my_voice'] as const;
type EditAction = typeof EDIT_ACTIONS[number];

const editContextSchema = z.object({
  requirement: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  strategy: z.string().optional(),
}).optional();

const editSchema = z.object({
  action: z.enum(EDIT_ACTIONS),
  selected_text: z.string().min(5, 'Selected text must be at least 5 characters'),
  section: z.string().min(1, 'Section is required'),
  full_resume_context: z.string().min(1, 'Full resume context is required'),
  job_description: z.string().min(1, 'Job description is required'),
  custom_instruction: z.string().optional(),
  /** Section-only context (reduces tokens when available) */
  section_context: z.string().optional(),
  /** Requirement/evidence/strategy context for intelligent edits */
  edit_context: editContextSchema,
});

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

  const { resume_text, job_description, user_context } = parsed.data;

  // Create session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('coach_sessions')
    .insert({
      user_id: userId,
      product_type: 'resume_v2',
      pipeline_status: 'running',
      pipeline_stage: 'intake',
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
    try {
      // emitters is looked up on every emit so late-connecting clients receive events
      const emit = (event: V2PipelineSSEEvent) => {
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
        user_context,
      });

      // Persist the full pipeline data so the V2 UI can hydrate from history.
      // Stored in tailored_sections (JSONB) with a version marker so the GET
      // endpoint can distinguish v2 payloads from legacy AssemblyOutput.
      const pipelineSnapshot = {
        version: 'v2' as const,
        pipeline_data: {
          jobIntelligence: result.job_intelligence ?? null,
          candidateIntelligence: result.candidate_intelligence ?? null,
          benchmarkCandidate: result.benchmark_candidate ?? null,
          gapAnalysis: result.gap_analysis ?? null,
          preScores: result.pre_scores ?? null,
          narrativeStrategy: result.narrative_strategy ?? null,
          resumeDraft: result.resume_draft ?? null,
          assembly: result.final_resume ?? null,
        },
        inputs: {
          resume_text,
          job_description,
        },
      };

      const { error: snapshotError } = await supabaseAdmin
        .from('coach_sessions')
        .update({
          pipeline_status: 'complete',
          pipeline_stage: 'complete',
          tailored_sections: pipelineSnapshot as unknown as Record<string, unknown>,
        })
        .eq('id', sessionId);

      if (snapshotError) {
        logger.error({ session_id: sessionId, error: snapshotError }, 'Failed to persist v2 pipeline snapshot');
      }

      totalCompleted++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ session_id: sessionId, error: message }, 'v2 pipeline failed');

      await supabaseAdmin
        .from('coach_sessions')
        .update({ pipeline_status: 'error', error_message: message })
        .eq('id', sessionId);

      totalFailed++;
    } finally {
      activePipelines--;
    }
  })();

  return c.json({ session_id: sessionId, status: 'started' });
});

// ─── POST /:sessionId/respond-gaps ──────────────────────────────────

const gapResponseSchema = z.object({
  responses: z.array(z.object({
    requirement: z.string().min(1),
    action: z.enum(['approve', 'context', 'skip']),
    user_context: z.string().optional(),
  })),
});

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
    .select('id, user_id, pipeline_status, tailored_sections')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (session.pipeline_status !== 'complete') {
    return c.json({ error: 'Pipeline not yet complete', status: session.pipeline_status }, 409);
  }

  // Detect v2 pipeline snapshot vs legacy AssemblyOutput
  const stored = session.tailored_sections as Record<string, unknown> | null;
  if (stored && stored.version === 'v2') {
    return c.json({
      version: 'v2',
      pipeline_data: stored.pipeline_data,
      inputs: stored.inputs,
    });
  }

  // Legacy fallback — just the assembly result
  return c.json({ result: stored });
});

// ─── POST /:sessionId/edit ───────────────────────────────────────────

function buildEditSystemPrompt(action: EditAction, customInstruction?: string): string {
  const base = `You are an expert executive resume editor. You will receive a selected piece of resume text and must return an improved replacement.

You MUST respond with valid JSON in exactly this format:
{ "replacement": "<your improved text here>" }

Do not include any explanation, preamble, or markdown. Only return the JSON object.

IMPORTANT: Never fabricate achievements, metrics, or claims. Every fact in the replacement must be traceable to the original text or surrounding resume context.`;

  const instructions: Record<EditAction, string> = {
    strengthen: `Rewrite the selected text to be more impactful. Use stronger action verbs, sharper language, and executive-caliber voice. Eliminate weak qualifiers and passive constructions. Preserve all factual claims. CRITICAL: Do NOT fabricate metrics, percentages, dollar amounts, or team sizes. Only sharpen language and strengthen action verbs. If the original text lacks specific numbers, do not add made-up numbers. Preserve all factual claims exactly as stated.`,
    add_metrics: `Enhance the selected text by adding or strengthening quantified results. Infer plausible numbers ONLY from the surrounding resume context — if explicit figures are absent, use conservative ranges (e.g., "team of 10+" rather than "team of 47") or directional language (e.g., "reduced costs by over 15%"). Every metric must be defensible given the context. Do NOT invent specific dollar amounts, exact percentages, or precise headcounts that aren't supported by the resume.`,
    shorten: `Compress the selected text to its most essential form. Cut every word that does not carry meaning. Preserve all key accomplishments, metrics, and impact. The result should be tighter and punchier, not thinner.`,
    add_keywords: `Naturally incorporate relevant keywords from the job description into the selected text. The integration must read fluently — never keyword-stuffed. Prioritize keywords that reflect genuine overlap with the candidate's experience. Do NOT change the meaning or add claims not present in the original text.`,
    rewrite: `Completely rewrite the selected text from scratch while preserving all underlying information, accomplishments, and meaning. Aim for cleaner structure, stronger language, and greater readability.`,
    custom: `Follow this instruction exactly: ${customInstruction ?? '(no instruction provided)'}`,
    not_my_voice: `Rewrite the selected text to sound more authentic and human. Strip out corporate jargon, buzzwords, and formulaic resume-speak. The revised text should sound like how this specific professional actually talks about their work — direct, specific, and genuine.`,
  };

  return `${base}\n\n${instructions[action]}`;
}

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

const rescoreSchema = z.object({
  resume_text: z.string().min(50, 'Resume text is required'),
  job_description: z.string().min(50, 'Job description is required'),
});

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

// ─── POST /:sessionId/integrate-keyword ─────────────────────────────

const integrateKeywordSchema = z.object({
  keyword: z.string().min(1, 'Keyword is required'),
  resume_text: z.string().min(50, 'Resume text is required'),
  job_description: z.string().min(50, 'Job description is required'),
});

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

const gapChatSchema = z.object({
  requirement: z.string().min(1).max(1000).trim(),
  classification: z.enum(['partial', 'missing', 'strong']),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000),
  })).max(20),
  context: z.object({
    evidence: z.array(z.string().max(1000)).max(20),
    current_strategy: z.string().max(2000).optional(),
    ai_reasoning: z.string().max(2000).optional(),
    inferred_metric: z.string().max(500).optional(),
    job_description_excerpt: z.string().max(5000),
    candidate_experience_summary: z.string().max(3000),
  }),
});

const GAP_CHAT_SYSTEM = `You are a $3,000/engagement executive resume strategist having a coaching conversation with a candidate about a specific gap on their resume.

Your job:
1. Help them surface hidden experience they haven't articulated
2. Find creative, TRUTHFUL ways to position their real experience against the requirement
3. When you have enough context, propose specific resume language they can add

CONVERSATION STYLE:
- Warm but direct. You're a coach, not a cheerleader.
- Ask ONE targeted follow-up question at a time — don't overwhelm.
- When the candidate shares new information, immediately show how you'd use it.
- Show your math when inferring numbers (budget from team size, etc.) and back off 10-20%.

RESPONSE FORMAT: Return valid JSON only:
{
  "response": "Your conversational reply — coaching explanation, what you found, follow-up question. 2-4 sentences.",
  "suggested_resume_language": "Ready-to-use resume bullet text if you have enough context. Omit this field if you need more information first.",
  "follow_up_question": "A single targeted question to surface more evidence. Omit if you've proposed language and are waiting for their decision."
}

RULES:
- NEVER fabricate experience. Only position what's real.
- When inferring metrics, back off 10-20% from calculated values.
- suggested_resume_language should be a single, polished resume bullet — not a paragraph.
- If the candidate's response reveals they truly don't have this experience, say so honestly and suggest they skip this gap.`;

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

    const result = repairJSON<{
      response: string;
      suggested_resume_language?: string;
      follow_up_question?: string;
    }>(response.text);

    if (!result?.response) {
      // Fallback: treat raw text as the response — log for monitoring
      logger.warn({ session_id: sessionId, requirement, rawSnippet: response.text.substring(0, 200) }, 'Gap chat: repairJSON failed, falling back to raw text');
      return c.json({
        response: response.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim(),
      });
    }

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, requirement, error: message }, 'Gap chat failed');
    return c.json({ error: 'Chat failed', message }, 500);
  }
});

// ─── POST /:sessionId/hiring-manager-review ────────────────────────

const hiringManagerReviewSchema = z.object({
  resume_text: z.string().min(50, 'Resume text is required'),
  job_description: z.string().min(50, 'Job description is required'),
  company_name: z.string().min(1, 'Company name is required'),
  role_title: z.string().min(1, 'Role title is required'),
  /** Key requirements from job intelligence — helps ground the review */
  requirements: z.array(z.string()).optional(),
  /** Hidden hiring signals from job intelligence */
  hidden_signals: z.array(z.string()).optional(),
});

resumeV2Pipeline.post('/:sessionId/hiring-manager-review', authMiddleware, rateLimitMiddleware(10, 60_000), async (c) => {
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

  const parsed = hiringManagerReviewSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { resume_text, job_description, company_name, role_title, requirements, hidden_signals } = parsed.data;

  logger.info({ session_id: sessionId, user_id: userId, company_name, role_title }, 'Hiring manager review requested');

  const requirementsList = requirements?.length
    ? `\n\nKEY REQUIREMENTS I'M EVALUATING:\n${requirements.map(r => `- ${r}`).join('\n')}`
    : '';

  const hiddenSignals = hidden_signals?.length
    ? `\n\nWHAT I'M REALLY LOOKING FOR (beyond the job posting):\n${hidden_signals.map(s => `- ${s}`).join('\n')}`
    : '';

  const systemPrompt = `You are the hiring manager for the ${role_title} position at ${company_name}. You have just received this resume and are reviewing it critically.

Your persona: You are experienced, demanding, and know exactly what you need. You've seen hundreds of resumes for this role. You are looking for someone who can hit the ground running.

REVIEW THE RESUME AS THIS SPECIFIC HIRING MANAGER. Be hyper-critical. Identify:
1. What immediately impresses you (strengths that would make you want to interview this person)
2. What concerns you or feels insufficient (specific gaps or weaknesses)
3. What's missing that you'd expect to see
4. Specific recommendations to address each concern

For each concern, provide a concrete, actionable recommendation — not vague advice.

Return valid JSON only:
{
  "overall_impression": "2-3 sentences of your gut reaction as the hiring manager",
  "verdict": "strong_candidate" | "promising_needs_work" | "significant_gaps",
  "strengths": [
    {
      "observation": "What impresses you",
      "why_it_matters": "Why this matters for the role"
    }
  ],
  "concerns": [
    {
      "observation": "What concerns you",
      "severity": "critical" | "moderate" | "minor",
      "recommendation": "Specific, actionable fix — phrase as a resume edit instruction",
      "target_section": "Which resume section to fix (e.g., 'Executive Summary', 'Professional Experience - Company X')"
    }
  ],
  "missing_elements": [
    {
      "element": "What you expected to see but didn't find",
      "recommendation": "How to add it"
    }
  ]
}

RULES:
- Be specific — reference actual content from the resume, not generic advice
- Every concern must have a concrete recommendation
- Focus on what would actually change your hiring decision
- Do NOT fabricate or assume experience — only reference what's in the resume
- Limit to the most impactful findings: max 5 strengths, max 5 concerns, max 3 missing elements`;

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `RESUME:\n${resume_text}\n\nJOB DESCRIPTION:\n${job_description}${requirementsList}${hiddenSignals}\n\nReview this resume as the hiring manager for this role.`,
      }],
      max_tokens: 4096,
    });

    const result = repairJSON<{
      overall_impression: string;
      verdict: 'strong_candidate' | 'promising_needs_work' | 'significant_gaps';
      strengths: Array<{ observation: string; why_it_matters: string }>;
      concerns: Array<{ observation: string; severity: string; recommendation: string; target_section?: string }>;
      missing_elements: Array<{ element: string; recommendation: string }>;
    }>(response.text);

    if (!result) {
      return c.json({ error: 'Review failed — unparseable response' }, 500);
    }

    logger.info({ session_id: sessionId, verdict: result.verdict }, 'Hiring manager review completed');

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ session_id: sessionId, error: message }, 'Hiring manager review failed');
    return c.json({ error: 'Review failed', message }, 500);
  }
});
