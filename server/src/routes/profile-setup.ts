/**
 * Profile Setup Routes — /api/profile-setup/*
 *
 * The CareerIQ profile setup flow. Four text fields → 30s analysis →
 * 8-question interview → profile synthesis.
 *
 * Endpoints:
 *   POST /analyze  — Runs intake agent. Returns session_id + IntakeAnalysis.
 *   POST /answer   — Processes one interview answer. Returns InterviewResponse.
 *   POST /complete — Synthesizes final profile. Saves to user_platform_context.
 *
 * Mounted at /api/profile-setup by server/src/index.ts.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { parseJsonBodyWithLimit } from '../lib/http-body-guard.js';
import { upsertUserContext } from '../lib/platform-context.js';
import { createCombinedAbortSignal } from '../lib/llm-provider.js';
import { runIntakeAgent } from '../agents/profile-setup/intake-agent.js';
import { processInterviewAnswer } from '../agents/profile-setup/interview-runner.js';
import { synthesizeProfile } from '../agents/profile-setup/synthesizer.js';
import type { ProfileSetupSessionState, ProfileSetupInput } from '../agents/profile-setup/types.js';
import logger from '../lib/logger.js';

export const profileSetupRoutes = new Hono();

// ─── In-Memory Session Store ──────────────────────────────────────────────────
// Short-lived sessions that live between /analyze and /complete.
// TTL: 2 hours. Cleanup runs every 10 minutes.

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const sessions = new Map<string, ProfileSetupSessionState>();

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, state] of sessions) {
    if (now - state.last_active_at > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

const pruneTimer = setInterval(pruneExpiredSessions, 10 * 60 * 1000);
pruneTimer.unref();

// ─── In-Flight Locks ──────────────────────────────────────────────────────────

const inFlightAnalyze = new Set<string>();
const inFlightAnswer = new Set<string>();
const inFlightComplete = new Set<string>();

// ─── POST /analyze ────────────────────────────────────────────────────────────

profileSetupRoutes.post('/analyze', authMiddleware, rateLimitMiddleware(5, 60_000), async (c) => {
  const user = c.get('user');

  const parsedBody = await parseJsonBodyWithLimit(c, 50_000);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data as Record<string, unknown>;

  const resume_text = typeof body.resume_text === 'string' ? body.resume_text.trim() : '';
  const linkedin_about = typeof body.linkedin_about === 'string' ? body.linkedin_about.trim() : '';
  const target_roles = typeof body.target_roles === 'string' ? body.target_roles.trim() : '';
  const situation = typeof body.situation === 'string' ? body.situation.trim() : '';

  // Validation — lower bounds
  if (resume_text.length < 100) {
    return c.json({ error: 'resume_text is required and must be at least 100 characters' }, 400);
  }
  if (target_roles.length < 5) {
    return c.json({ error: 'target_roles is required and must be at least 5 characters' }, 400);
  }

  // Validation — upper bounds
  if (resume_text.length > 30_000) {
    return c.json({ error: 'resume_text must be under 30,000 characters' }, 400);
  }
  if (linkedin_about.length > 10_000) {
    return c.json({ error: 'linkedin_about must be under 10,000 characters' }, 400);
  }
  if (target_roles.length > 500) {
    return c.json({ error: 'target_roles must be under 500 characters' }, 400);
  }
  if (situation.length > 2_000) {
    return c.json({ error: 'situation must be under 2,000 characters' }, 400);
  }

  const session_id = `profile-setup-${crypto.randomUUID()}`;

  if (inFlightAnalyze.has(user.id)) {
    return c.json({ error: 'Analysis already in progress.' }, 409);
  }
  inFlightAnalyze.add(user.id);

  const { signal, cleanup: signalCleanup } = createCombinedAbortSignal(c.req.raw.signal, 120_000);

  try {
    logger.info({ userId: user.id, sessionId: session_id }, 'Profile setup analyze: starting intake agent');

    const input: ProfileSetupInput = {
      resume_text,
      linkedin_about,
      target_roles,
      situation,
      user_id: user.id,
      session_id,
    };

    const intake = await runIntakeAgent(input, signal);

    const sessionState: ProfileSetupSessionState = {
      user_id: user.id,
      session_id,
      input,
      intake,
      answers: [],
      created_at: Date.now(),
      last_active_at: Date.now(),
    };

    sessions.set(session_id, sessionState);

    logger.info({ userId: user.id, sessionId: session_id }, 'Profile setup analyze: complete');

    return c.json({ session_id, intake });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId: user.id, sessionId: session_id, error: message }, 'Profile setup analyze: failed');
    return c.json({ error: 'Intake analysis failed. Please try again.' }, 500);
  } finally {
    inFlightAnalyze.delete(user.id);
    signalCleanup();
  }
});

// ─── POST /answer ─────────────────────────────────────────────────────────────

profileSetupRoutes.post('/answer', authMiddleware, rateLimitMiddleware(20, 60_000), async (c) => {
  const user = c.get('user');

  const parsedBody = await parseJsonBodyWithLimit(c, 5_000);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data as Record<string, unknown>;
  const session_id = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';

  if (!session_id) {
    return c.json({ error: 'session_id is required' }, 400);
  }
  if (answer.length < 2) {
    return c.json({ error: 'answer must be at least 2 characters' }, 400);
  }
  if (answer.length > 2_000) {
    return c.json({ error: 'answer must be 2,000 characters or fewer' }, 400);
  }

  const sessionState = sessions.get(session_id);
  if (!sessionState) {
    return c.json({ error: 'Session not found or expired. Please run /analyze again.' }, 404);
  }
  if (sessionState.user_id !== user.id) {
    return c.json({ error: 'Session not found or expired.' }, 404);
  }

  // Enforce max questions server-side
  const currentIndex = sessionState.answers.length;
  const totalQuestions = sessionState.intake.interview_questions.length;
  if (currentIndex >= totalQuestions) {
    return c.json({
      acknowledgment: 'We have covered all the questions.',
      next_question: null,
      question_index: currentIndex,
      complete: true,
    });
  }

  if (inFlightAnswer.has(session_id)) {
    return c.json({ error: 'Answer processing already in progress for this session.' }, 409);
  }
  inFlightAnswer.add(session_id);

  const { signal, cleanup: signalCleanup } = createCombinedAbortSignal(c.req.raw.signal, 60_000);

  try {
    const currentQuestion = sessionState.intake.interview_questions[currentIndex];

    const result = await processInterviewAnswer(
      {
        session_id,
        answer,
        question_index: currentIndex,
        questions: sessionState.intake.interview_questions,
        history: sessionState.answers,
      },
      signal,
    );

    // Record the answer
    const updatedAnswers = [
      ...sessionState.answers,
      {
        question_index: currentIndex,
        question: currentQuestion?.question ?? '',
        answer,
      },
    ];

    sessions.set(session_id, {
      ...sessionState,
      answers: updatedAnswers,
      last_active_at: Date.now(),
    });

    logger.info(
      { userId: user.id, sessionId: session_id, questionIndex: currentIndex, complete: result.complete },
      'Profile setup answer: processed',
    );

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId: user.id, sessionId: session_id, error: message }, 'Profile setup answer: failed');
    return c.json({ error: 'Answer processing failed. Please try again.' }, 500);
  } finally {
    inFlightAnswer.delete(session_id);
    signalCleanup();
  }
});

// ─── POST /complete ───────────────────────────────────────────────────────────

profileSetupRoutes.post('/complete', authMiddleware, rateLimitMiddleware(5, 60_000), async (c) => {
  const user = c.get('user');

  const parsedBody = await parseJsonBodyWithLimit(c, 1_000);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.data as Record<string, unknown>;
  const session_id = typeof body.session_id === 'string' ? body.session_id.trim() : '';

  if (!session_id) {
    return c.json({ error: 'session_id is required' }, 400);
  }

  const sessionState = sessions.get(session_id);
  if (!sessionState) {
    return c.json({ error: 'Session not found or expired. Please run /analyze again.' }, 404);
  }
  if (sessionState.user_id !== user.id) {
    return c.json({ error: 'Session not found or expired.' }, 404);
  }

  if (inFlightComplete.has(session_id)) {
    return c.json({ error: 'Profile synthesis already in progress for this session.' }, 409);
  }
  inFlightComplete.add(session_id);

  const { signal, cleanup: signalCleanup } = createCombinedAbortSignal(c.req.raw.signal, 120_000);

  try {
    logger.info(
      { userId: user.id, sessionId: session_id, answerCount: sessionState.answers.length },
      'Profile setup complete: synthesizing profile',
    );

    const profile = await synthesizeProfile(
      sessionState.input,
      sessionState.intake,
      sessionState.answers,
      signal,
    );

    // Save to user_platform_context as career_iq_profile type
    // source_session_id column is UUID — pass null since our session IDs have a prefix
    const saved = await upsertUserContext(
      user.id,
      'career_iq_profile',
      profile as unknown as Record<string, unknown>,
      'profile-setup',
    );

    if (!saved) {
      logger.error(
        { userId: user.id, sessionId: session_id },
        'Profile setup complete: profile save failed — session preserved for retry',
      );
      return c.json({ error: 'Profile save failed. Please try again.' }, 500);
    }

    logger.info({ userId: user.id, sessionId: session_id }, 'Profile setup complete: profile saved');

    // Clean up session only after confirmed save
    sessions.delete(session_id);

    return c.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId: user.id, sessionId: session_id, error: message }, 'Profile setup complete: failed');
    return c.json({ error: 'Profile synthesis failed. Please try again.' }, 500);
  } finally {
    inFlightComplete.delete(session_id);
    signalCleanup();
  }
});
