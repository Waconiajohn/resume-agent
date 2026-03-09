import { useMemo } from 'react';
import type { Application, DueAction } from '@/hooks/useApplicationPipeline';
import type { RadarJob } from '@/hooks/useRadarSearch';

export interface DailyOpsData {
  topMatches: RadarJob[];
  dueActions: DueAction[];
  staleApplications: Application[];
  activeCount: number;
  interviewCount: number;
  offerCount: number;
  loading: boolean;
}

const CLOSED_STAGES = new Set(['closed_won', 'closed_lost']);
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_MATCH_SCORE = 60;
const TOP_MATCHES_LIMIT = 5;

export function useDailyOps(
  applications: Application[],
  dueActions: DueAction[],
  radarJobs: RadarJob[],
  loading = false,
): DailyOpsData {
  const topMatches = useMemo(() => {
    return radarJobs
      .filter((job) => typeof job.match_score === 'number' && job.match_score >= MIN_MATCH_SCORE)
      .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
      .slice(0, TOP_MATCHES_LIMIT);
  }, [radarJobs]);

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
    topMatches,
    dueActions,
    staleApplications,
    activeCount,
    interviewCount,
    offerCount,
    loading,
  };
}
