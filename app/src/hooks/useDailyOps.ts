import { useMemo } from 'react';
import type { Application, DueAction } from '@/hooks/useApplicationPipeline';

export interface DailyOpsData {
  dueActions: DueAction[];
  staleApplications: Application[];
  activeCount: number;
  interviewCount: number;
  offerCount: number;
  loading: boolean;
}

const CLOSED_STAGES = new Set(['closed_won', 'closed_lost']);
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function useDailyOps(
  applications: Application[],
  dueActions: DueAction[],
  loading = false,
): DailyOpsData {
  const staleApplications = useMemo(() => {
    const now = Date.now();
    return applications.filter((app) => {
      if (CLOSED_STAGES.has(app.stage)) return false;
      const updatedAt = new Date(app.updated_at).getTime();
      return now - updatedAt > STALE_THRESHOLD_MS;
    });
  }, [applications]);

  const activeCount = useMemo(() => {
    return applications.filter((app) => !CLOSED_STAGES.has(app.stage)).length;
  }, [applications]);

  const interviewCount = useMemo(() => {
    return applications.filter((app) => app.stage === 'interviewing').length;
  }, [applications]);

  const offerCount = useMemo(() => {
    return applications.filter((app) => app.stage === 'offer').length;
  }, [applications]);

  return {
    dueActions,
    staleApplications,
    activeCount,
    interviewCount,
    offerCount,
    loading,
  };
}
