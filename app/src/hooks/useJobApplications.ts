/**
 * useJobApplications — data hook for the `job_applications` table.
 *
 * Approach C Phase 2.1/2.2 — powers the My Applications list view and the
 * New Application intake form. Talks to `/api/job-applications/*` (the
 * canonical parent entity), NOT to `/api/applications/*` (which manages
 * the legacy kanban table `application_pipeline`, still present during
 * the Approach C migration).
 *
 * Parallel to `useApplicationPipeline` — different endpoint, same wire
 * shape (role_title / company_name). Phase 3 cleanup unifies them by
 * switching useApplicationPipeline over to this endpoint and retiring the
 * kanban table.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export type JobApplicationStage =
  | 'saved'
  | 'researching'
  | 'applied'
  | 'screening'
  | 'interviewing'
  | 'offer'
  | 'closed_won'
  | 'closed_lost';

export interface JobApplication {
  id: string;
  user_id: string;
  role_title: string;
  company_name: string;
  stage: JobApplicationStage;
  url?: string | null;
  jd_text?: string | null;
  source?: string | null;
  applied_date?: string | null;
  last_touch_date?: string | null;
  next_action?: string | null;
  next_action_due?: string | null;
  notes?: string | null;
  score?: number | null;
  stage_history?: Array<{ stage: string; at: string; from?: string; note?: string }>;
  created_at: string;
  updated_at: string;
}

export interface NewJobApplicationInput {
  role_title: string;
  company_name: string;
  url?: string;
  jd_text?: string;
  stage?: JobApplicationStage;
  notes?: string;
}

interface ListResponse {
  applications: JobApplication[];
  count: number;
}

export function useJobApplications() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Prevents a stale list response from clobbering a newer one if the hook
  // fetches twice in quick succession (e.g. list() called after create()).
  const requestIdRef = useRef(0);

  const fetchApplications = useCallback(async (): Promise<JobApplication[] | null> => {
    if (!accessToken) return null;
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/job-applications?sort_by=updated_at&sort_order=desc`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        // When the feature flag is off the server returns { data: null, feature_disabled: true }.
        if (res.status === 200) {
          const body = await res.json().catch(() => null);
          if (body && body.feature_disabled) {
            if (id === requestIdRef.current) setApplications([]);
            return [];
          }
        }
        const message = `Failed to list applications (HTTP ${res.status})`;
        if (id === requestIdRef.current) setError(message);
        return null;
      }
      const body = (await res.json()) as ListResponse | { feature_disabled?: boolean };
      if ('feature_disabled' in body && body.feature_disabled) {
        if (id === requestIdRef.current) setApplications([]);
        return [];
      }
      const list = 'applications' in body ? body.applications : [];
      if (id === requestIdRef.current) setApplications(list);
      return list;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list applications';
      if (id === requestIdRef.current) setError(message);
      return null;
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, [accessToken]);

  const createApplication = useCallback(
    async (input: NewJobApplicationInput): Promise<JobApplication | null> => {
      if (!accessToken) return null;
      try {
        const res = await fetch(`${API_BASE}/job-applications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setError(`Failed to create application (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
          return null;
        }
        const created = (await res.json()) as JobApplication;
        // Optimistic insert — next list fetch will reconcile.
        setApplications((prev) => [created, ...prev]);
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create application');
        return null;
      }
    },
    [accessToken],
  );

  const updateApplication = useCallback(
    async (id: string, patch: Partial<NewJobApplicationInput> & { stage?: JobApplicationStage }): Promise<JobApplication | null> => {
      if (!accessToken) return null;
      try {
        const res = await fetch(`${API_BASE}/job-applications/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          setError(`Failed to update application (HTTP ${res.status})`);
          return null;
        }
        const updated = (await res.json()) as JobApplication;
        setApplications((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update application');
        return null;
      }
    },
    [accessToken],
  );

  // Load on mount (once per access-token change). Skips when no token
  // (signed-out user) — the consumer handles that state.
  useEffect(() => {
    if (accessToken) void fetchApplications();
  }, [accessToken, fetchApplications]);

  // Derived grouping for the list view — not expensive, but memo'd so
  // consumers can pass groupedByStage directly as a prop without forcing
  // child re-renders when the underlying list hasn't changed.
  const groupedByStage = useMemo(() => {
    const groups: Partial<Record<JobApplicationStage, JobApplication[]>> = {};
    for (const app of applications) {
      (groups[app.stage] = groups[app.stage] ?? []).push(app);
    }
    return groups;
  }, [applications]);

  return {
    applications,
    groupedByStage,
    loading,
    error,
    fetchApplications,
    createApplication,
    updateApplication,
  };
}
