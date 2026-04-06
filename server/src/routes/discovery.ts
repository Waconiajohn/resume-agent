/**
 * Discovery Routes — /api/discovery/*
 *
 * The "Moment of Recognition" discovery flow. Users drop their resume + one job
 * and within 30 seconds the AI speaks first with a recognition statement about
 * who they are.
 *
 * Endpoints:
 *   POST /analyze    — Main entry point. Runs analysis pipeline and returns DiscoveryOutput.
 *   POST /excavate   — One Q&A exchange during the excavation conversation.
 *   POST /complete   — Finalizes the session and saves a CareerIQ profile.
 *
 * Mounted at /api/discovery by server/src/index.ts.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import { upsertUserContext } from '../lib/platform-context.js';
import { createCombinedAbortSignal } from '../lib/llm-provider.js';
import { runJobIntelligence } from '../agents/resume-v2/job-intelligence/agent.js';
import { runCandidateIntelligence } from '../agents/resume-v2/candidate-intelligence/agent.js';
import { runBenchmarkCandidate } from '../agents/resume-v2/benchmark-candidate/agent.js';
import { runDiscoveryAgent } from '../agents/discovery/agent.js';
import { processExcavationAnswer } from '../agents/discovery/excavation.js';
import { buildCareerIQProfile } from '../agents/discovery/profile-builder.js';
import type { DiscoverySessionState } from '../agents/discovery/types.js';
import logger from '../lib/logger.js';

export const discoveryRoutes = new Hono();

// ─── In-Flight Lock ───────────────────────────────────────────────────────────
// Prevents duplicate concurrent /analyze runs for the same session_id.

const inFlightAnalyze = new Set<string>();

// ─── In-Memory Session Store ──────────────────────────────────────────────────
// Keyed by session_id. TTL cleanup runs every 30 minutes.
// Sessions older than 2 hours are evicted.

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const discoverySessions = new Map<string, DiscoverySessionState>();

const sessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, state] of discoverySessions.entries()) {
    if (now - state.created_at > SESSION_TTL_MS) {
      discoverySessions.delete(sessionId);
    }
  }
}, 30 * 60 * 1000);
sessionCleanupTimer.unref();

// ─── POST /analyze ────────────────────────────────────────────────────────────

discoveryRoutes.post('/analyze', authMiddleware, rateLimitMiddleware(5, 60_000), async (c) => {
  const user = c.get('user');

  const parsedBody = await parseJsonBodyWithLimit(c, 200_000);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data as Record<string, unknown>;
  const resume_text = typeof body.resume_text === 'string' ? body.resume_text.trim() : '';
  const job_description = typeof body.job_description === 'string' ? body.job_description.trim() : '';
  const session_id = typeof body.session_id === 'string' && body.session_id.trim().length > 0
    ? body.session_id.trim()
    : `discovery-${crypto.randomUUID()}`;

  if (resume_text.length < 100) {
    return c.json({ error: 'resume_text is required and must be at least 100 characters' }, 400);
  }
  if (job_description.length < 50) {
    return c.json({ error: 'job_description is required and must be at least 50 characters' }, 400);
  }
  if (resume_text.length > 30000) {
    return c.json({ error: 'Resume text must be under 30,000 characters' }, 400);
  }
  if (job_description.length > 15000) {
    return c.json({ error: 'Job description must be under 15,000 characters' }, 400);
  }

  // Fix 1: Concurrent duplicate prevention
  if (inFlightAnalyze.has(session_id)) {
    return c.json({ error: 'Analysis already in progress for this session.' }, 409);
  }
  inFlightAnalyze.add(session_id);

  const { signal, cleanup: signalCleanup } = createCombinedAbortSignal(c.req.raw.signal, 90_000);

  try {
    logger.info({ userId: user.id, sessionId: session_id }, 'Discovery analyze: starting');

    // Run job intelligence and candidate intelligence in parallel
    const [job_intelligence, candidate] = await Promise.all([
      runJobIntelligence({ job_description }, signal),
      runCandidateIntelligence({ resume_text }, signal),
    ]);

    logger.info({ userId: user.id, sessionId: session_id }, 'Discovery analyze: analysis agents complete, running benchmark');

    // Run benchmark candidate sequentially (depends on both above)
    const benchmark = await runBenchmarkCandidate({ job_intelligence, candidate }, signal);

    logger.info({ userId: user.id, sessionId: session_id }, 'Discovery analyze: benchmark complete, running discovery agent');

    // Run the discovery agent
    const discovery = await runDiscoveryAgent({ candidate, job_intelligence, benchmark }, signal);

    logger.info({ userId: user.id, sessionId: session_id }, 'Discovery analyze: recognition ready');

    // Persist session state for follow-up excavation
    const sessionState: DiscoverySessionState = {
      user_id: user.id,
      session_id,
      candidate,
      job_intelligence,
      benchmark,
      discovery,
      conversation_history: [
        {
          role: 'ai',
          content: [
            discovery.recognition.career_thread,
            discovery.recognition.role_fit,
            discovery.recognition.differentiator,
          ].join('\n\n'),
        },
      ],
      excavation_answers: [],
      remaining_questions: [...discovery.excavation_questions],
      created_at: Date.now(),
    };

    discoverySessions.set(session_id, sessionState);

    return c.json({
      session_id,
      discovery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId: user.id, sessionId: session_id, error: message }, 'Discovery analyze: failed');
    return c.json({ error: 'Discovery analysis failed. Please try again.' }, 500);
  } finally {
    inFlightAnalyze.delete(session_id);
    signalCleanup();
  }
});

// ─── POST /excavate ───────────────────────────────────────────────────────────

discoveryRoutes.post('/excavate', authMiddleware, rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');

  const parsedBody = await parseJsonBodyWithLimit(c, 10_000);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data as Record<string, unknown>;
  const session_id = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';

  if (!session_id) {
    return c.json({ error: 'session_id is required' }, 400);
  }
  if (session_id.length > 128 || !/^[\w-]+$/.test(session_id)) {
    return c.json({ error: 'Invalid session_id format' }, 400);
  }
  if (answer.length < 2) {
    return c.json({ error: 'answer is required' }, 400);
  }
  if (answer.length > 2000) {
    return c.json({ error: 'Answer must be 2000 characters or fewer' }, 400);
  }

  const sessionState = discoverySessions.get(session_id);
  if (!sessionState) {
    return c.json({ error: 'Session not found or expired. Please run /analyze again.' }, 404);
  }

  // Verify the session belongs to this user
  if (sessionState.user_id !== user.id) {
    return c.json({ error: 'Session not found or expired.' }, 404);
  }

  // Server-side exchange limit enforcement
  const exchangeCount = sessionState.conversation_history.filter(m => m.role === 'user').length;
  if (exchangeCount >= 8) {
    return c.json({
      next_question: null,
      resume_updates: [],
      insight: 'We have gathered enough to build your profile.',
      complete: true,
    });
  }

  // Determine which question was just answered
  const currentQuestion = sessionState.remaining_questions[0];
  const signal = c.req.raw.signal;

  try {
    const excavationResult = await processExcavationAnswer(
      {
        session_id,
        answer,
        conversation_history: sessionState.conversation_history,
        candidate: sessionState.candidate,
        job_intelligence: sessionState.job_intelligence,
        remaining_questions: sessionState.remaining_questions,
        profile_gaps: sessionState.discovery.profile_gaps,
      },
      signal,
    );

    // Update session state
    const updatedConversation = [
      ...sessionState.conversation_history,
      { role: 'user' as const, content: answer },
    ];

    if (excavationResult.next_question) {
      updatedConversation.push({ role: 'ai' as const, content: excavationResult.next_question });
    }

    // Track the answered question
    const updatedAnswers = currentQuestion
      ? [...sessionState.excavation_answers, { question: currentQuestion.question, answer }]
      : sessionState.excavation_answers;

    // Determine remaining questions
    let updatedRemaining = sessionState.remaining_questions;
    if (excavationResult.complete) {
      updatedRemaining = [];
    } else if (currentQuestion) {
      // Check if the LLM's next question matches a prepared question
      const isFollowUp = excavationResult.next_question
        && !sessionState.remaining_questions.some(q => q.question === excavationResult.next_question);

      if (isFollowUp && excavationResult.next_question) {
        // Follow-up: don't pop the current prepared question — prepend the follow-up
        updatedRemaining = [
          { question: excavationResult.next_question, what_we_are_looking_for: 'Follow-up from previous answer' },
          ...sessionState.remaining_questions,
        ];
      } else {
        // Moving to next prepared question: pop the answered one
        updatedRemaining = sessionState.remaining_questions.slice(1);
      }
    }

    discoverySessions.set(session_id, {
      ...sessionState,
      conversation_history: updatedConversation,
      excavation_answers: updatedAnswers,
      remaining_questions: updatedRemaining,
    });

    return c.json(excavationResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId: user.id, sessionId: session_id, error: message }, 'Discovery excavate: failed');
    return c.json({ error: 'Excavation failed. Please try again.' }, 500);
  }
});

// ─── POST /complete ───────────────────────────────────────────────────────────

discoveryRoutes.post('/complete', authMiddleware, rateLimitMiddleware(5, 60_000), async (c) => {
  const user = c.get('user');

  const parsedBody = await parseJsonBodyWithLimit(c, 1_000);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data as Record<string, unknown>;
  const session_id = typeof body.session_id === 'string' ? body.session_id.trim() : '';

  if (!session_id) {
    return c.json({ error: 'session_id is required' }, 400);
  }
  if (session_id.length > 128 || !/^[\w-]+$/.test(session_id)) {
    return c.json({ error: 'Invalid session_id format' }, 400);
  }

  const sessionState = discoverySessions.get(session_id);
  if (!sessionState) {
    return c.json({ error: 'Session not found or expired. Please run /analyze again.' }, 404);
  }

  if (sessionState.user_id !== user.id) {
    return c.json({ error: 'Session not found or expired.' }, 404);
  }

  const signal = c.req.raw.signal;

  try {
    logger.info({ userId: user.id, sessionId: session_id }, 'Discovery complete: building CareerIQ profile');

    const profile = await buildCareerIQProfile(
      {
        candidate: sessionState.candidate,
        job_intelligence: sessionState.job_intelligence,
        benchmark: sessionState.benchmark,
        discovery: sessionState.discovery,
        excavation_answers: sessionState.excavation_answers,
      },
      signal,
    );

    // Save to user_platform_context as career_profile type
    const saved = await upsertUserContext(
      user.id,
      'career_profile',
      profile as unknown as Record<string, unknown>,
      'discovery',
      session_id,
    );

    if (!saved) {
      logger.error({ userId: user.id, sessionId: session_id }, 'Discovery complete: profile save failed — session preserved for retry');
      return c.json({ error: 'Profile save failed. Please try again.' }, 500);
    }

    logger.info({ userId: user.id, sessionId: session_id }, 'Discovery complete: CareerIQ profile saved');

    // Only clean up session after confirmed save
    discoverySessions.delete(session_id);

    return c.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId: user.id, sessionId: session_id, error: message }, 'Discovery complete: failed');
    return c.json({ error: 'Profile build failed. Please try again.' }, 500);
  }
});
