import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { trackProductEvent } from '@/lib/product-telemetry';
import type { CareerProfileSummary } from './career-profile-summary';
import { buildCareerProfileSummary } from './career-profile-summary';
import { useWhyMeStory, type WhyMeStory } from './useWhyMeStory';

interface CareerProfileContextValue {
  story: WhyMeStory;
  updateField: (field: keyof WhyMeStory, value: string) => void;
  signals: ReturnType<typeof useWhyMeStory>['signals'];
  dashboardState: ReturnType<typeof useWhyMeStory>['dashboardState'];
  isComplete: boolean;
  hasStarted: boolean;
  loading: boolean;
  summary: CareerProfileSummary;
}

const CareerProfileContext = createContext<CareerProfileContextValue | null>(null);

export function CareerProfileProvider({ children }: { children: ReactNode }) {
  const whyMe = useWhyMeStory();
  const startedTrackedRef = useRef(false);
  const completedTrackedRef = useRef(false);

  const summary = useMemo(
    () => buildCareerProfileSummary(whyMe.story, whyMe.signals, whyMe.dashboardState),
    [whyMe.story, whyMe.signals, whyMe.dashboardState],
  );

  useEffect(() => {
    if (whyMe.hasStarted && !startedTrackedRef.current) {
      trackProductEvent('career_profile_started', {
        readiness_percent: summary.readinessPercent,
        dashboard_state: whyMe.dashboardState,
      });
      startedTrackedRef.current = true;
    }
    if (!whyMe.hasStarted) {
      startedTrackedRef.current = false;
      completedTrackedRef.current = false;
    }
  }, [summary.readinessPercent, whyMe.dashboardState, whyMe.hasStarted]);

  useEffect(() => {
    if (whyMe.isComplete && !completedTrackedRef.current) {
      trackProductEvent('career_profile_completed', {
        readiness_percent: summary.readinessPercent,
      });
      completedTrackedRef.current = true;
    }
  }, [summary.readinessPercent, whyMe.isComplete]);

  useEffect(() => {
    if (!whyMe.hasStarted || whyMe.isComplete) return undefined;

    const timeoutId = window.setTimeout(() => {
      trackProductEvent('career_profile_stalled', {
        dashboard_state: whyMe.dashboardState,
        readiness_percent: summary.readinessPercent,
        focus_areas: summary.focusAreas,
      });
    }, 90000);

    return () => window.clearTimeout(timeoutId);
  }, [summary.focusAreas, summary.readinessPercent, whyMe.dashboardState, whyMe.hasStarted, whyMe.isComplete]);

  const value = useMemo<CareerProfileContextValue>(() => ({
    ...whyMe,
    summary,
  }), [summary, whyMe]);

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
