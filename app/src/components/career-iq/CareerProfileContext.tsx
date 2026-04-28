import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { trackProductEvent } from '@/lib/product-telemetry';
import { useCareerProfileAgent } from '@/hooks/useCareerProfileAgent';
import type { CareerProfileSummary } from './career-profile-summary';
import type { BenchmarkProfileReviewStatus, CareerProfileV2 } from '@/types/career-profile';
import type { AssessmentQuestion, OnboardingStatus } from '@/types/onboarding';
import type { ActivityMessage } from '@/types/activity';

interface CareerProfileContextValue {
  profile: CareerProfileV2 | null;
  story: ReturnType<typeof useCareerProfileAgent>['story'];
  signals: ReturnType<typeof useCareerProfileAgent>['signals'];
  dashboardState: ReturnType<typeof useCareerProfileAgent>['dashboardState'];
  summary: CareerProfileSummary;
  isComplete: boolean;
  hasStarted: boolean;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  onboardingStatus: OnboardingStatus;
  questions: AssessmentQuestion[];
  activityMessages: ActivityMessage[];
  currentStage: string | null;
  startAssessment: (resumeText?: string) => Promise<boolean>;
  submitResponses: (responses: Record<string, string>) => Promise<boolean>;
  resetAssessment: () => void;
  refreshProfile: () => Promise<CareerProfileV2 | null>;
  updateBenchmarkProfileItem: (
    itemId: string,
    changes: { statement?: string; review_status?: BenchmarkProfileReviewStatus },
  ) => Promise<boolean>;
  answerBenchmarkDiscoveryQuestion: (questionId: string, answer: string) => Promise<boolean>;
}

const CareerProfileContext = createContext<CareerProfileContextValue | null>(null);

export function CareerProfileProvider({ children }: { children: ReactNode }) {
  const careerProfile = useCareerProfileAgent();
  const startedTrackedRef = useRef(false);
  const completedTrackedRef = useRef(false);

  useEffect(() => {
    if (careerProfile.hasStarted && !startedTrackedRef.current) {
      trackProductEvent('career_profile_started', {
        readiness_percent: careerProfile.summary.readinessPercent,
        dashboard_state: careerProfile.dashboardState,
      });
      startedTrackedRef.current = true;
    }
    if (!careerProfile.hasStarted) {
      startedTrackedRef.current = false;
      completedTrackedRef.current = false;
    }
  }, [careerProfile.dashboardState, careerProfile.hasStarted, careerProfile.summary.readinessPercent]);

  useEffect(() => {
    if (careerProfile.isComplete && !completedTrackedRef.current) {
      trackProductEvent('career_profile_completed', {
        readiness_percent: careerProfile.summary.readinessPercent,
      });
      completedTrackedRef.current = true;
    }
  }, [careerProfile.isComplete, careerProfile.summary.readinessPercent]);

  useEffect(() => {
    if (!careerProfile.hasStarted || careerProfile.isComplete) return undefined;

    const timeoutId = window.setTimeout(() => {
      trackProductEvent('career_profile_stalled', {
        dashboard_state: careerProfile.dashboardState,
        readiness_percent: careerProfile.summary.readinessPercent,
        focus_areas: careerProfile.summary.focusAreas,
      });
    }, 90000);

    return () => window.clearTimeout(timeoutId);
  }, [
    careerProfile.dashboardState,
    careerProfile.hasStarted,
    careerProfile.isComplete,
    careerProfile.summary.focusAreas,
    careerProfile.summary.readinessPercent,
  ]);

  const value = useMemo<CareerProfileContextValue>(() => ({
    profile: careerProfile.profile,
    story: careerProfile.story,
    signals: careerProfile.signals,
    dashboardState: careerProfile.dashboardState,
    summary: careerProfile.summary,
    isComplete: careerProfile.isComplete,
    hasStarted: careerProfile.hasStarted,
    loading: careerProfile.loading || careerProfile.onboarding.status === 'generating_questions' || careerProfile.onboarding.status === 'evaluating',
    profileLoading: careerProfile.profileLoading,
    profileError: careerProfile.profileError ?? careerProfile.onboarding.error,
    onboardingStatus: careerProfile.onboarding.status,
    questions: careerProfile.onboarding.questions,
    activityMessages: careerProfile.onboarding.activityMessages,
    currentStage: careerProfile.onboarding.currentStage,
    startAssessment: careerProfile.startAssessment,
    submitResponses: careerProfile.onboarding.respondToGate,
    resetAssessment: careerProfile.onboarding.reset,
    refreshProfile: careerProfile.refreshProfile,
    updateBenchmarkProfileItem: careerProfile.updateBenchmarkProfileItem,
    answerBenchmarkDiscoveryQuestion: careerProfile.answerBenchmarkDiscoveryQuestion,
  }), [careerProfile]);

  return (
    <CareerProfileContext.Provider value={value}>
      {children}
    </CareerProfileContext.Provider>
  );
}

export function useCareerProfile(): CareerProfileContextValue {
  const context = useContext(CareerProfileContext);
  if (!context) {
    throw new Error('useCareerProfile must be used within CareerProfileProvider');
  }
  return context;
}
