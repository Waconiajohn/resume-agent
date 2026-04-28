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
import { supabaseAdmin } from '../lib/supabase.js';
import { runIntakeAgent } from '../agents/profile-setup/intake-agent.js';
import { processInterviewAnswer } from '../agents/profile-setup/interview-runner.js';
import { synthesizeProfile } from '../agents/profile-setup/synthesizer.js';
import { buildMasterResumePayload, createInitialMasterResume } from '../agents/profile-setup/master-resume-builder.js';
import type { ProfileSetupSessionState, ProfileSetupInput } from '../agents/profile-setup/types.js';
import logger from '../lib/logger.js';

export const profileSetupRoutes = new Hono();

// ─── In-Memory Session Store ──────────────────────────────────────────────────
// Short-lived sessions that live between /analyze and /complete.
// TTL: 2 hours. Cleanup runs every 10 minutes.

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const sessions = new Map<string, ProfileSetupSessionState>();

async function persistSessionState(sessionState: ProfileSetupSessionState): Promise<void> {
  const lastActiveAt = new Date(sessionState.last_active_at);
  const { error } = await supabaseAdmin
    .from('profile_setup_sessions')
    .upsert({
      session_id: sessionState.session_id,
      user_id: sessionState.user_id,
      state: sessionState,
      last_active_at: lastActiveAt.toISOString(),
      expires_at: new Date(sessionState.last_active_at + SESSION_TTL_MS).toISOString(),
    }, { onConflict: 'session_id' });

  if (error) {
    logger.warn(
      { userId: sessionState.user_id, sessionId: sessionState.session_id, error: error.message },
      'Profile setup: failed to persist setup session',
    );
  }
}

async function deleteSessionState(sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('profile_setup_sessions')
    .delete()
    .eq('session_id', sessionId);
  if (error) {
    logger.warn({ sessionId, error: error.message }, 'Profile setup: failed to delete setup session');
  }
}

function isProfileSetupSessionState(value: unknown): value is ProfileSetupSessionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<ProfileSetupSessionState>;
  return (
    typeof record.user_id === 'string'
    && typeof record.session_id === 'string'
    && typeof record.created_at === 'number'
    && typeof record.last_active_at === 'number'
    && !!record.input
    && !!record.intake
    && Array.isArray(record.answers)
  );
}

async function loadSessionState(sessionId: string, userId: string): Promise<ProfileSetupSessionState | null> {
  const inMemoryState = sessions.get(sessionId);
  if (inMemoryState?.user_id === userId) return inMemoryState;

  const { data, error } = await supabaseAdmin
    .from('profile_setup_sessions')
    .select('state, expires_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn({ userId, sessionId, error: error.message }, 'Profile setup: failed to load setup session');
    return null;
  }

  const row = data as { state?: unknown; expires_at?: string | null } | null;
  if (!row?.state || !isProfileSetupSessionState(row.state)) return null;

  const expiresAtMs = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
    await deleteSessionState(sessionId);
    return null;
  }

  sessions.set(sessionId, row.state);
  return row.state;
}

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

async function ensureProfileSetupProvenanceSession(
  userId: string,
  sessionState: ProfileSetupSessionState,
): Promise<string | null> {
  if (sessionState.provenance_session_id) {
    return sessionState.provenance_session_id;
  }

  const { data, error } = await supabaseAdmin
    .from('coach_sessions')
    .insert({
      user_id: userId,
      status: 'completed',
      current_phase: 'profile_setup',
      product_type: 'profile-setup',
      messages: [],
      interview_responses: sessionState.answers.map((answer) => ({
        question_index: answer.question_index,
        question: answer.question,
        answer: answer.answer,
      })),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    logger.error(
      { userId, sessionId: sessionState.session_id, error: error?.message ?? 'missing session id' },
      'Profile setup: failed to create provenance session',
    );
    return null;
  }

  const updatedState: ProfileSetupSessionState = {
    ...sessionState,
    provenance_session_id: data.id,
    last_active_at: Date.now(),
  };
  sessions.set(sessionState.session_id, updatedState);
  await persistSessionState(updatedState);
  return data.id;
}

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
  if (linkedin_about.length > 50_000) {
    return c.json({ error: 'linkedin_about must be under 50,000 characters' }, 400);
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
    await persistSessionState(sessionState);

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

  const sessionState = await loadSessionState(session_id, user.id);
  if (!sessionState) {
    return c.json({ error: 'Session not found or expired. Please run /analyze again.' }, 404);
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

    const updatedSessionState = {
      ...sessionState,
      answers: updatedAnswers,
      last_active_at: Date.now(),
    };

    sessions.set(session_id, updatedSessionState);
    await persistSessionState(updatedSessionState);

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

  const sessionState = await loadSessionState(session_id, user.id);
  if (!sessionState) {
    return c.json({ error: 'Session not found or expired. Please run /analyze again.' }, 404);
  }

  if (inFlightComplete.has(session_id)) {
    return c.json({ error: 'Profile synthesis already in progress for this session.' }, 409);
  }
  inFlightComplete.add(session_id);

  const { signal, cleanup: signalCleanup } = createCombinedAbortSignal(c.req.raw.signal, 120_000);

  try {
    let currentSessionState = sessionState;

    // M6: Warn if no answers were recorded
    if (currentSessionState.answers.length === 0) {
      logger.warn(
        { userId: user.id, sessionId: session_id },
        'Profile setup complete: no interview answers recorded — transcript and evidence will be empty',
      );
    }

    logger.info(
      { userId: user.id, sessionId: session_id, answerCount: currentSessionState.answers.length },
      'Profile setup complete: synthesizing profile',
    );

    const profile = currentSessionState.completed_profile ?? await synthesizeProfile(
      currentSessionState.input,
      currentSessionState.intake,
      currentSessionState.answers,
      signal,
    );

    if (!currentSessionState.completed_profile) {
      currentSessionState = {
        ...currentSessionState,
        completed_profile: profile,
        last_active_at: Date.now(),
      };
      sessions.set(session_id, currentSessionState);
      await persistSessionState(currentSessionState);
    }

    const provenanceSessionId = await ensureProfileSetupProvenanceSession(user.id, currentSessionState);

    // Save to user_platform_context as career_profile (CareerProfileV2 format)
    const saved = await upsertUserContext(
      user.id,
      'career_profile',
      profile as unknown as Record<string, unknown>,
      'profile-setup',
      provenanceSessionId ?? undefined,
    );

    if (saved) {
      logger.info({ userId: user.id, sessionId: session_id }, 'Profile setup complete: profile saved');
    } else {
      logger.warn(
        { userId: user.id, sessionId: session_id },
        'Profile setup: DB save failed — returning profile without persistence',
      );
    }

    // Sync to why_me_stories so workspace unlocks and YourProfilePage populates
    try {
      const narrative = (profile as unknown as { narrative?: { colleagues_came_for_what?: string; known_for_what?: string; why_not_me?: string } }).narrative;
      await supabaseAdmin.from('why_me_stories').upsert({
        user_id: user.id,
        colleagues_came_for_what: narrative?.colleagues_came_for_what ?? '',
        known_for_what: narrative?.known_for_what ?? '',
        why_not_me: narrative?.why_not_me ?? '',
      }, { onConflict: 'user_id' });
    } catch (err) {
      logger.warn({ userId: user.id, error: err instanceof Error ? err.message : String(err) }, 'profile-setup: failed to sync why_me_stories');
    }

    // Persist interview transcript for downstream consumers
    const transcriptContent = {
      questions_and_answers: sessionState.answers.map((a) => {
        const question = sessionState.intake.interview_questions[a.question_index];
        if (!question) {
          logger.warn(
            { userId: user.id, sessionId: session_id, questionIndex: a.question_index, totalQuestions: sessionState.intake.interview_questions.length },
            'Profile setup transcript: question_index out of bounds — references_resume_element will be null',
          );
        }
        // suggested_starters intentionally omitted — UI-only, no downstream value
        return {
          question: a.question,
          answer: a.answer,
          question_index: a.question_index,
          references_resume_element: question?.references_resume_element ?? null,
        };
      }),
      intake_session_id: session_id,
      completed_at: new Date().toISOString(),
    };

    const transcriptSaved = await upsertUserContext(
      user.id,
      'career_interview_transcript',
      transcriptContent as unknown as Record<string, unknown>,
      'profile-setup',
      provenanceSessionId ?? undefined,
    );

    if (!transcriptSaved) {
      logger.warn(
        { userId: user.id, sessionId: session_id },
        'Profile setup: interview transcript save failed',
      );
    }

    // Build and create initial master resume from the profile setup data.
    // Failure is non-fatal — profile is still returned to the user.
    let resumeResult: { success: boolean; resumeId?: string } = { success: false };

    if (provenanceSessionId) {
      const resumePayload = buildMasterResumePayload(
        currentSessionState.input,
        currentSessionState.intake,
        currentSessionState.answers,
        profile,
        provenanceSessionId,
      );

      resumeResult = await createInitialMasterResume(user.id, resumePayload, provenanceSessionId);
    } else {
      logger.warn(
        { userId: user.id, sessionId: session_id },
        'Profile setup: skipping master resume creation because provenance session was unavailable',
      );
    }

    if (resumeResult.success) {
      logger.info(
        { userId: user.id, sessionId: session_id, resumeId: resumeResult.resumeId },
        'Profile setup complete: initial master resume created',
      );
      sessions.delete(session_id);
      await deleteSessionState(session_id);
    } else {
      logger.warn(
        { userId: user.id, sessionId: session_id },
        'Profile setup: master resume creation failed — profile saved, session retained for retry',
      );
    }

    return c.json({
      profile,
      master_resume_created: resumeResult.success,
      master_resume_id: resumeResult.resumeId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId: user.id, sessionId: session_id, error: message }, 'Profile setup complete: failed');
    return c.json({ error: 'Profile synthesis failed. Please try again.' }, 500);
  } finally {
    inFlightComplete.delete(session_id);
    signalCleanup();
  }
});
