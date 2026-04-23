import { useReducer, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfileSetup } from '@/hooks/useProfileSetup';
import { trackProductEvent } from '@/lib/product-telemetry';
import { IntakeForm } from './IntakeForm';
import { InterviewView } from './InterviewView';
import { ProfileReveal } from './ProfileReveal';
import type { IntakeAnalysis, CareerIQProfileFull } from '@/types/profile-setup';

// ─── Types ───────────────────────────────────────────────────────────────────

type SetupScreen = 'intake' | 'processing' | 'interview' | 'building' | 'reveal';

interface SetupState {
  screen: SetupScreen;
  sessionId: string | null;
  intake: IntakeAnalysis | null;
  answers: Array<{ question: string; answer: string }>;
  currentQuestionIndex: number;
  profile: CareerIQProfileFull | null;
  masterResumeCreated: boolean | null;
  error: string | null;
}

type SetupAction =
  | { type: 'START_PROCESSING' }
  | { type: 'ANALYSIS_COMPLETE'; sessionId: string; intake: IntakeAnalysis }
  | { type: 'ANALYSIS_ERROR'; error: string }
  | { type: 'RECORD_ANSWER'; question: string; answer: string; nextIndex: number }
  | { type: 'START_BUILDING' }
  | { type: 'PROFILE_READY'; profile: CareerIQProfileFull; masterResumeCreated: boolean | null }
  | { type: 'PROFILE_ERROR'; error: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' };

// ─── Processing messages ─────────────────────────────────────────────────────

const PROCESSING_MESSAGES = [
  'Reading your career history...',
  'Finding the thread that connects it all...',
  'Identifying where you are exceptional...',
  'Surfacing what hiring managers will want to know...',
  'Preparing your interview questions...',
];

// ─── Reducer ─────────────────────────────────────────────────────────────────

function setupReducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case 'START_PROCESSING':
      return { ...state, screen: 'processing', error: null };

    case 'ANALYSIS_COMPLETE':
      return {
        ...state,
        screen: 'interview',
        sessionId: action.sessionId,
        intake: action.intake,
        error: null,
      };

    case 'ANALYSIS_ERROR':
      return { ...state, screen: 'intake', error: action.error };

    case 'RECORD_ANSWER':
      return {
        ...state,
        answers: [...state.answers, { question: action.question, answer: action.answer }],
        currentQuestionIndex: action.nextIndex,
      };

    case 'START_BUILDING':
      return { ...state, screen: 'building' };

    case 'PROFILE_READY':
      return {
        ...state,
        screen: 'reveal',
        profile: action.profile,
        masterResumeCreated: action.masterResumeCreated,
        error: null,
      };

    case 'PROFILE_ERROR':
      return { ...state, screen: 'interview', error: action.error };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
}

const initialState: SetupState = {
  screen: 'intake',
  sessionId: null,
  intake: null,
  answers: [],
  currentQuestionIndex: 0,
  profile: null,
  masterResumeCreated: null,
  error: null,
};

// ─── Processing screen ────────────────────────────────────────────────────────

function ProcessingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  const currentMessage = PROCESSING_MESSAGES[messageIndex] ?? PROCESSING_MESSAGES[0];

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center max-w-sm px-8">
        <p
          className="text-2xl font-light text-[var(--text-strong)] mb-6"
          style={{ fontFamily: 'var(--font-display)' }}
          aria-live="polite"
          aria-atomic="true"
        >
          {currentMessage}
        </p>
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-[var(--link)] animate-[dot-bounce_1.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.16}s` }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Building screen ──────────────────────────────────────────────────────────

function BuildingScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p
          className="text-2xl font-light text-[var(--text-strong)] mb-6"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Building your CareerIQ profile...
        </p>
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-[var(--link)] animate-[dot-bounce_1.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.16}s` }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProfileSetupPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { analyze, answer, complete, analyzing, answering, completing, error: hookError } = useProfileSetup(accessToken);

  const [state, dispatch] = useReducer(setupReducer, initialState);
  const [retryMasterResumeRecovered, setRetryMasterResumeRecovered] = useState(false);

  // The hook's error is read via hookErrorRef at dispatch time; no separate effect needed.

  // After BUILDING screen: fetch the profile
  const buildingTriggeredRef = useRef(false);
  useEffect(() => {
    if (state.screen !== 'building' || !state.sessionId || buildingTriggeredRef.current) return;
    buildingTriggeredRef.current = true;

    const fetchProfile = async () => {
      const result = await complete(state.sessionId!);
      if (result) {
        if (result.master_resume_created === false) {
          trackProductEvent('profile_setup_retry_needed', {
            session_id: state.sessionId!,
            source: 'initial_complete',
          });
        }
        setRetryMasterResumeRecovered(false);
        dispatch({
          type: 'PROFILE_READY',
          profile: result.profile,
          masterResumeCreated: typeof result.master_resume_created === 'boolean'
            ? result.master_resume_created
            : null,
        });
      } else {
        dispatch({ type: 'PROFILE_ERROR', error: 'Could not build your profile. Please try again.' });
        buildingTriggeredRef.current = false;
      }
    };

    void fetchProfile();
  }, [state.screen, state.sessionId, complete]);

  const hookErrorRef = useRef<string | null>(null);
  hookErrorRef.current = hookError;

  const handleIntakeSubmit = useCallback(
    async (
      resumeText: string,
      linkedinAbout: string,
      targetRoles: string,
      situation: string,
    ) => {
      setRetryMasterResumeRecovered(false);
      dispatch({ type: 'START_PROCESSING' });

      const result = await analyze(resumeText, linkedinAbout, targetRoles, situation);
      if (!result) {
        dispatch({
          type: 'ANALYSIS_ERROR',
          error: hookErrorRef.current ?? 'Analysis failed. Please check your inputs and try again.',
        });
        return;
      }

      dispatch({
        type: 'ANALYSIS_COMPLETE',
        sessionId: result.session_id,
        intake: result.intake,
      });
    },
    [analyze],
  );

  const handleAnswer = useCallback(
    async (answerText: string) => {
      if (!state.sessionId || !state.intake) return;

      const currentQuestion =
        state.intake.interview_questions[state.currentQuestionIndex]?.question ?? '';

      await answer(state.sessionId, answerText);

      dispatch({
        type: 'RECORD_ANSWER',
        question: currentQuestion,
        answer: answerText,
        nextIndex: state.currentQuestionIndex + 1,
      });
    },
    [state.sessionId, state.intake, state.currentQuestionIndex, answer],
  );

  const handleInterviewComplete = useCallback(() => {
    setRetryMasterResumeRecovered(false);
    dispatch({ type: 'START_BUILDING' });
    buildingTriggeredRef.current = false;
  }, []);

  const handleRetryMasterResume = useCallback(async () => {
    if (!state.sessionId || state.screen !== 'reveal') return;

    trackProductEvent('profile_setup_retry_requested', {
      session_id: state.sessionId,
      source: 'reveal',
    });

    const result = await complete(state.sessionId);
    if (result) {
      if (result.master_resume_created === false) {
        setRetryMasterResumeRecovered(false);
        trackProductEvent('profile_setup_retry_needed', {
          session_id: state.sessionId,
          source: 'retry',
        });
        trackProductEvent('profile_setup_retry_failed', {
          session_id: state.sessionId,
          reason: 'master_resume_not_created',
          message: 'Career Evidence creation still needs another retry.',
        });
        dispatch({
          type: 'SET_ERROR',
          error: 'We saved your profile again, but your Career Evidence still needs another retry.',
        });
        return;
      }

      setRetryMasterResumeRecovered(true);
      trackProductEvent('profile_setup_retry_succeeded', {
        session_id: state.sessionId,
        master_resume_id: result.master_resume_id ?? null,
      });
      dispatch({
        type: 'PROFILE_READY',
        profile: result.profile,
        masterResumeCreated: typeof result.master_resume_created === 'boolean'
          ? result.master_resume_created
          : state.masterResumeCreated,
      });
      return;
    }

    setRetryMasterResumeRecovered(false);
    trackProductEvent('profile_setup_retry_failed', {
      session_id: state.sessionId,
      reason: 'request_failed',
      message: hookErrorRef.current ?? 'Could not create your Career Evidence yet. Please try again.',
    });
    dispatch({
      type: 'SET_ERROR',
      error: hookErrorRef.current ?? 'Could not create your Career Evidence yet. Please try again.',
    });
  }, [complete, state.masterResumeCreated, state.screen, state.sessionId]);

  const displayError = state.error ?? hookError ?? null;

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{ background: 'var(--bg-0)' }}
    >
      {/* Error banner */}
      {displayError && (
        <div
          role="alert"
          className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm"
          style={{
            background: 'var(--badge-red-bg)',
            borderColor: 'var(--badge-red-bg)',
            color: 'var(--badge-red-text)',
          }}
        >
          {displayError}
          <button
            type="button"
            className="ml-3 underline opacity-70 hover:opacity-100"
            onClick={() => dispatch({ type: 'CLEAR_ERROR' })}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Screens */}
      {state.screen === 'intake' && (
        <IntakeForm onSubmit={handleIntakeSubmit} loading={analyzing} />
      )}

      {state.screen === 'processing' && <ProcessingScreen />}

      {state.screen === 'interview' && state.intake && (
        <InterviewView
          intake={state.intake}
          currentQuestionIndex={state.currentQuestionIndex}
          onAnswer={handleAnswer}
          onComplete={handleInterviewComplete}
          answering={answering}
        />
      )}

      {state.screen === 'building' && <BuildingScreen />}

      {state.screen === 'reveal' && state.profile && (
        <ProfileReveal
          profile={state.profile}
          masterResumeCreated={state.masterResumeCreated}
          masterResumeRecovered={retryMasterResumeRecovered}
          onRetryMasterResume={state.masterResumeCreated === false ? handleRetryMasterResume : undefined}
          retryingMasterResume={completing}
        />
      )}

      {/* Completing indicator (overlay when building) */}
      {completing && state.screen === 'building' && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'var(--bg-0)' }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
