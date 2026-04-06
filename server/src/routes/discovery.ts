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
import { runJobIntelligence } from '../agents/resume-v2/job-intelligence/agent.js';
import { runCandidateIntelligence } from '../agents/resume-v2/candidate-intelligence/agent.js';
import { runBenchmarkCandidate } from '../agents/resume-v2/benchmark-candidate/agent.js';
import { runDiscoveryAgent } from '../agents/discovery/agent.js';
import { processExcavationAnswer } from '../agents/discovery/excavation.js';
import { buildCareerIQProfile } from '../agents/discovery/profile-builder.js';
import type { DiscoverySessionState } from '../agents/discovery/types.js';
import logger from '../lib/logger.js';

export const discoveryRoutes = new Hono();

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
    : `discovery-${user.id}-${Date.now()}`;

  if (resume_text.length < 100) {
    return c.json({ error: 'resume_text is required and must be at least 100 characters' }, 400);
  }
  if (job_description.length < 50) {
    return c.json({ error: 'job_description is required and must be at least 50 characters' }, 400);
  }

  const signal = c.req.raw.signal;

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
  if (answer.length < 2) {
    return c.json({ error: 'answer is required' }, 400);
  }

  const sessionState = discoverySessions.get(session_id);
  if (!sessionState) {
    return c.json({ error: 'Session not found or expired. Please run /analyze again.' }, 404);
  }

  // Verify the session belongs to this user
  if (sessionState.user_id !== user.id) {
    return c.json({ error: 'Session not found or expired.' }, 404);
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

    const updatedAnswers = currentQuestion
      ? [...sessionState.excavation_answers, { question: currentQuestion.question, answer }]
      : sessionState.excavation_answers;

    // Pop the first remaining question now that it's been answered
    const updatedRemaining = currentQuestion
      ? sessionState.remaining_questions.slice(1)
      : sessionState.remaining_questions;

    // If the next question is a follow-up (not from the prepared list), prepend it
    // so it becomes the next item to answer. Follow-ups replace the queue head temporarily.
    const finalRemaining = excavationResult.complete ? [] : updatedRemaining;

    discoverySessions.set(session_id, {
      ...sessionState,
      conversation_history: updatedConversation,
      excavation_answers: updatedAnswers,
      remaining_questions: finalRemaining,
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
    await upsertUserContext(
      user.id,
      'career_profile',
      profile as unknown as Record<string, unknown>,
      'discovery',
      session_id,
    );

    logger.info({ userId: user.id, sessionId: session_id }, 'Discovery complete: CareerIQ profile saved');

    // Clean up session
    discoverySessions.delete(session_id);

    return c.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId: user.id, sessionId: session_id, error: message }, 'Discovery complete: failed');
    return c.json({ error: 'Profile build failed. Please try again.' }, 500);
  }
});
