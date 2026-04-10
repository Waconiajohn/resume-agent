/**
 * Interview Prep Routes — Agent #10 using the generic route factory.
 *
 * Mounted at /api/interview-prep/*. Feature-flagged via FF_INTERVIEW_PREP.
 * Runs a 2-agent pipeline (Researcher → Writer) to generate comprehensive
 * interview preparation documents. Autonomous — no user gates.
 *
 * Cross-product context: Loads Why-Me story, positioning strategy, and
 * evidence items from prior resume sessions if available.
 */

import { z } from 'zod';
import { createProductRoutes } from './product-route-factory.js';
import { createInterviewPrepProductConfig } from '../agents/interview-prep/product.js';
import { FF_INTERVIEW_PREP } from '../lib/feature-flags.js';
import { loadAgentContextBundle } from '../lib/career-profile-context.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import logger from '../lib/logger.js';
import type { InterviewPrepState, InterviewPrepSSEEvent } from '../agents/interview-prep/types.js';
import { applySharedContextOverride } from '../contracts/shared-context-adapter.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../lib/llm.js';
import { repairJSON } from '../lib/json-repair.js';

const startSchema = z.object({
  session_id: z.string().uuid(),
  resume_text: z.string().min(50).max(100_000),
  job_description: z.string().min(1).max(50_000),
  company_name: z.string().min(1).max(200),
  job_application_id: z.string().uuid().optional(),
});

export const interviewPrepRoutes = createProductRoutes<InterviewPrepState, InterviewPrepSSEEvent>({
  startSchema,
  buildProductConfig: () => createInterviewPrepProductConfig(),
  isEnabled: () => FF_INTERVIEW_PREP,

  onBeforeStart: async (input, _c, _session) => {
    const sessionId = input.session_id as string;
    const jobApplicationId = typeof input.job_application_id === 'string' ? input.job_application_id : null;
    const { error } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        product_type: 'interview_prep',
        ...(jobApplicationId ? { job_application_id: jobApplicationId } : {}),
      })
      .eq('id', sessionId);
    if (error) {
      logger.warn({ session_id: sessionId, error: error.message }, 'Interview prep: failed to set product_type');
    }
  },

  transformInput: async (input, session) => {
    const userId = session.user_id as string | undefined;
    if (!userId) return input;

    try {
      const { platformContext, emotionalBaseline, sharedContext } = await loadAgentContextBundle(userId, {
        includeCareerProfile: true,
        includePositioningStrategy: true,
        includeEvidenceItems: true,
        includeCareerNarrative: true,
        includeWhyMeStory: true,
        includeClientProfile: true,
        includeEmotionalBaseline: true,
      });

      const result: Record<string, unknown> = { ...input };
      if (Object.keys(platformContext).length > 0) {
        result.platform_context = platformContext;
      }
      result.shared_context = applySharedContextOverride(sharedContext, {
        artifactTarget: {
          artifactType: 'interview_prep',
          artifactGoal: 'prepare for a target interview',
          targetAudience: 'candidate',
          successCriteria: [
            'ground answers in supported evidence',
            'align stories to the target role',
            'keep interview prep truthful and reusable',
          ],
        },
        workflowState: {
          room: 'interview_prep',
          stage: 'context_loaded',
          activeTask: 'turn shared evidence into interview-ready preparation',
        },
      });
      if (emotionalBaseline) {
        result.emotional_baseline = emotionalBaseline;
      }
      return result;
    } catch (err) {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Interview prep: failed to load platform context (continuing without it)',
      );
    }

    return input;
  },

  momentumActivityType: 'interview_prep_completed',
});

interviewPrepRoutes.get('/reports/latest', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_INTERVIEW_PREP) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');

  const { data, error } = await supabaseAdmin
    .from('interview_prep_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id }, 'GET /interview-prep/reports/latest: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No reports found' }, 404);
  }

  return c.json({ report: data });
});

interviewPrepRoutes.get('/reports/session/:sessionId', rateLimitMiddleware(30, 60_000), async (c) => {
  if (!FF_INTERVIEW_PREP) {
    return c.json({ error: 'Not found' }, 404);
  }

  const user = c.get('user');
  const sessionId = c.req.param('sessionId') ?? '';
  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) {
    return c.json({ error: 'Invalid session id' }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from('interview_prep_reports')
    .select('*')
    .eq('user_id', user.id)
    .eq('session_id', parsed.data)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error: error.message, userId: user.id, sessionId: parsed.data }, 'GET /interview-prep/reports/session/:sessionId: query failed');
    return c.json({ error: 'Failed to fetch report' }, 500);
  }
  if (!data) {
    return c.json({ error: 'No report found for session' }, 404);
  }

  return c.json({ report: data });
});

// ─── POST /debrief — Generate AI-structured debrief notes ──────────────────────

const debriefInputSchema = z.object({
  company: z.string().min(1).max(500),
  role: z.string().min(1).max(500),
  what_went_well: z.string().max(10_000).optional(),
  what_was_difficult: z.string().max(10_000).optional(),
  questions_asked: z.array(z.string().max(1000)).max(50).optional(),
  company_signals: z.string().max(5_000).optional(),
  overall_impression: z.enum(['positive', 'neutral', 'negative']).optional(),
});

interviewPrepRoutes.post('/debrief', rateLimitMiddleware(20, 60_000), async (c) => {
  if (!FF_INTERVIEW_PREP) {
    return c.json({ error: 'Feature not enabled' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = debriefInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const {
    company,
    role,
    what_went_well = '',
    what_was_difficult = '',
    questions_asked = [],
    company_signals = '',
    overall_impression = 'neutral',
  } = parsed.data;

  try {
    const questionsBlock = questions_asked.length > 0
      ? `\nQuestions asked:\n${questions_asked.map((q) => `- ${q}`).join('\n')}`
      : '';

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 3000,
      system: `You are an executive interview coach helping a senior candidate debrief after an interview. Be specific and honest. Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Debrief this interview.

Company: ${company}
Role: ${role}
Overall impression: ${overall_impression}
${what_went_well ? `\nWhat went well:\n${what_went_well}` : ''}
${what_was_difficult ? `\nWhat was difficult:\n${what_was_difficult}` : ''}
${questionsBlock}
${company_signals ? `\nCompany signals:\n${company_signals}` : ''}

Return JSON:
{
  "strengths_demonstrated": ["strength 1", "strength 2"],
  "areas_to_improve": ["area 1", "area 2"],
  "follow_up_items": ["action 1", "action 2"],
  "lessons_for_next": ["lesson 1", "lesson 2"],
  "company_signals": ["signal 1", "signal 2"]
}`,
      }],
    });

    let result: {
      strengths_demonstrated?: string[];
      areas_to_improve?: string[];
      follow_up_items?: string[];
      lessons_for_next?: string[];
      company_signals?: string[];
    };
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text) as typeof result;
    } catch {
      result = {};
    }

    return c.json({
      strengths_demonstrated: Array.isArray(result.strengths_demonstrated) ? result.strengths_demonstrated.map(String) : [],
      areas_to_improve: Array.isArray(result.areas_to_improve) ? result.areas_to_improve.map(String) : [],
      follow_up_items: Array.isArray(result.follow_up_items) ? result.follow_up_items.map(String) : [],
      lessons_for_next: Array.isArray(result.lessons_for_next) ? result.lessons_for_next.map(String) : [],
      company_signals: Array.isArray(result.company_signals) ? result.company_signals.map(String) : [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, 'POST /interview-prep/debrief: LLM call failed');
    return c.json({ error: 'Failed to generate debrief' }, 500);
  }
});

// ─── POST /follow-up-email — Generate situation-specific follow-up email ───────

const FOLLOW_UP_SITUATION_DESCRIPTIONS: Record<string, string> = {
  post_interview: 'Standard follow-up sent 5-7 business days after the interview to check on status',
  no_response: 'Follow-up after the company has gone silent for 2+ weeks after a promised decision',
  rejection_graceful: 'Graceful response to a rejection that keeps the door open and builds long-term relationship',
  keep_warm: 'Check-in for a role that stalled or a contact worth maintaining for future opportunities',
  negotiation_counter: 'Acknowledgment plus counter-proposal framing for a compensation or offer negotiation',
};

const followUpEmailInputSchema = z.object({
  company: z.string().min(1).max(500),
  role: z.string().min(1).max(500),
  situation: z.enum(['post_interview', 'no_response', 'rejection_graceful', 'keep_warm', 'negotiation_counter']),
  recipient_name: z.string().max(200).optional(),
  recipient_title: z.string().max(200).optional(),
  specific_context: z.string().max(5_000).optional(),
});

interviewPrepRoutes.post('/follow-up-email', rateLimitMiddleware(20, 60_000), async (c) => {
  if (!FF_INTERVIEW_PREP) {
    return c.json({ error: 'Feature not enabled' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = followUpEmailInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const {
    company,
    role,
    situation,
    recipient_name,
    recipient_title,
    specific_context,
  } = parsed.data;

  const situationDescription = FOLLOW_UP_SITUATION_DESCRIPTIONS[situation] ?? situation;
  const recipientLine = recipient_name
    ? `Recipient: ${recipient_name}${recipient_title ? `, ${recipient_title}` : ''}`
    : 'Recipient: hiring manager or recruiter';

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2000,
      system: `You are an executive communication strategist writing follow-up emails for senior executives in job search situations. Professional, confident, never desperate. Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a follow-up email.

Situation: ${situation}
Description: ${situationDescription}
Company: ${company}
Role: ${role}
${recipientLine}
${specific_context ? `\nAdditional context:\n${specific_context}` : ''}

Return JSON:
{
  "subject": "email subject line",
  "body": "full email body",
  "tone_notes": "brief note on tone choices",
  "timing_guidance": "when and how to send"
}`,
      }],
    });

    let result: { subject?: string; body?: string; tone_notes?: string; timing_guidance?: string };
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text) as typeof result;
    } catch {
      result = { body: response.text.trim() };
    }

    return c.json({
      situation,
      subject: String(result.subject ?? `Re: ${role} at ${company}`),
      body: String(result.body ?? ''),
      tone_notes: String(result.tone_notes ?? ''),
      timing_guidance: String(result.timing_guidance ?? ''),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, 'POST /interview-prep/follow-up-email: LLM call failed');
    return c.json({ error: 'Failed to generate follow-up email' }, 500);
  }
});
