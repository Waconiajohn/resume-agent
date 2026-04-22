/**
 * useJobApplications — data hook for the `job_applications` table.
 *
 * Approach C Phase 3 — the canonical hook for everything that used to live
 * in `useApplicationPipeline`. Reads/writes `/api/job-applications/*` which
 * backs the unified `job_applications` table. The legacy
 * `application_pipeline` table was dropped in Phase 3.
 *
 * Exposed surface:
 *   - applications, groupedByStage, loading, error
 *   - dueActions (items with next_action_due within a window)
 *   - fetchApplications / fetchDueActions / refresh / clear
 *   - createApplication / updateApplication / moveToStage / deleteApplication
 *   - archiveApplication / restoreApplication (soft-archive flow, Sprint B4)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { safeNumber, safeString } from '@/lib/safe-cast';

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
  /** Optional on the client — legacy Application type didn't carry user_id. */
  user_id?: string;
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
  /** Sprint B4 — null = active, non-null = archived. */
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** Sprint B4 — archived filter for the list endpoint. */
export type JobApplicationArchivedFilter = 'active' | 'archived' | 'all';

/** Legacy alias. New code should import JobApplicationStage. */
export type PipelineStage = JobApplicationStage;

/** Legacy alias. New code should import JobApplication. */
export type Application = JobApplication;

/** Phase 3 — item returned by /job-applications/due-actions. */
export interface DueAction {
  id: string;
  role_title: string;
  company_name: string;
  next_action: string;
  next_action_due: string;
  stage: JobApplicationStage;
}

export interface NewJobApplicationInput {
  role_title: string;
  company_name: string;
  url?: string;
  jd_text?: string;
  stage?: JobApplicationStage;
  source?: string;
  location?: string;
  notes?: string;
  stage_history?: Array<{ stage: string; at: string }>;
}

const VALID_STAGES: JobApplicationStage[] = [
  'saved',
  'researching',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'closed_won',
  'closed_lost',
];

function sanitizeStage(value: unknown): JobApplicationStage | null {
  return VALID_STAGES.includes(value as JobApplicationStage)
    ? (value as JobApplicationStage)
    : null;
}

function sanitizeDueAction(value: unknown): DueAction | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = safeString(candidate.id).trim();
  // Server wire-format returns role_title / company_name. Fallback to raw
  // DB column names (title / company) to tolerate the legacy /applications
  // shape during transition.
  const roleTitle = safeString(candidate.role_title ?? candidate.title).trim();
  const companyName = safeString(candidate.company_name ?? candidate.company).trim();
  const nextAction = safeString(candidate.next_action).trim();
  const nextActionDue = safeString(candidate.next_action_due).trim();
  const stage = sanitizeStage(candidate.stage);
  if (!id || !roleTitle || !companyName || !nextAction || !nextActionDue || !stage) return null;
  return {
    id,
    role_title: roleTitle,
    company_name: companyName,
    next_action: nextAction,
    next_action_due: nextActionDue,
    stage,
  };
}

function sanitizeDueActions(value: unknown): DueAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((action) => sanitizeDueAction(action))
    .filter((action): action is DueAction => action !== null);
}

// Suppress the unused-import warnings from the util imports on the off-chance
// the build tree-shakes them — safeNumber is retained for future numeric
// sanitizers (score etc.).
void safeNumber;

interface ListResponse {
  applications: JobApplication[];
  count: number;
}

export function useJobApplications(options?: { archived?: JobApplicationArchivedFilter }) {
  const archivedFilter = options?.archived ?? 'active';
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [dueActions, setDueActions] = useState<DueAction[]>([]);
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
      const params = new URLSearchParams({
        sort_by: 'updated_at',
        sort_order: 'desc',
        archived: archivedFilter,
      });
      const res = await fetch(`${API_BASE}/job-applications?${params.toString()}`, {
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
  }, [accessToken, archivedFilter]);

  const archiveApplication = useCallback(
    async (id: string): Promise<JobApplication | null> => {
      if (!accessToken) return null;
      try {
        const res = await fetch(`${API_BASE}/job-applications/${id}/archive`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          setError(`Failed to archive application (HTTP ${res.status})`);
          return null;
        }
        const archived = (await res.json()) as JobApplication;
        // Optimistic local update: drop from active list if we're filtering
        // to active; add to archived list if we're filtering to archived.
        if (archivedFilter === 'active') {
          setApplications((prev) => prev.filter((a) => a.id !== id));
        } else if (archivedFilter === 'archived') {
          setApplications((prev) => [archived, ...prev.filter((a) => a.id !== id)]);
        } else {
          setApplications((prev) => prev.map((a) => (a.id === id ? archived : a)));
        }
        return archived;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to archive application');
        return null;
      }
    },
    [accessToken, archivedFilter],
  );

  const restoreApplication = useCallback(
    async (id: string): Promise<JobApplication | null> => {
      if (!accessToken) return null;
      try {
        const res = await fetch(`${API_BASE}/job-applications/${id}/restore`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          setError(`Failed to restore application (HTTP ${res.status})`);
          return null;
        }
        const restored = (await res.json()) as JobApplication;
        if (archivedFilter === 'archived') {
          setApplications((prev) => prev.filter((a) => a.id !== id));
        } else if (archivedFilter === 'active') {
          setApplications((prev) => [restored, ...prev.filter((a) => a.id !== id)]);
        } else {
          setApplications((prev) => prev.map((a) => (a.id === id ? restored : a)));
        }
        return restored;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore application');
        return null;
      }
    },
    [accessToken, archivedFilter],
  );

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

  /** Move an application to a new stage. Optimistic; reverts on error. */
  const moveToStage = useCallback(
    async (id: string, stage: JobApplicationStage): Promise<boolean> => {
      const previous = applications;
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, stage } : a)));
      if (!accessToken) {
        setApplications(previous);
        return false;
      }
      try {
        const res = await fetch(`${API_BASE}/job-applications/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ stage }),
        });
        if (!res.ok) {
          setApplications(previous);
          return false;
        }
        return true;
      } catch {
        setApplications(previous);
        return false;
      }
    },
    [accessToken, applications],
  );

  /** Hard delete. Soft-archive is usually preferred — see archiveApplication. */
  const deleteApplication = useCallback(
    async (id: string): Promise<boolean> => {
      if (!accessToken) return false;
      try {
        const res = await fetch(`${API_BASE}/job-applications/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return false;
        setApplications((prev) => prev.filter((a) => a.id !== id));
        setDueActions((prev) => prev.filter((a) => a.id !== id));
        return true;
      } catch {
        return false;
      }
    },
    [accessToken],
  );

  /** Fetch items with `next_action_due` inside the next `days` window. */
  const fetchDueActions = useCallback(
    async (days = 7): Promise<void> => {
      if (!accessToken) {
        setDueActions([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/job-applications/due-actions?days=${days}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          setDueActions([]);
          return;
        }
        const body = (await res.json()) as { actions?: unknown; feature_disabled?: boolean };
        if (body && 'feature_disabled' in body && body.feature_disabled) {
          setDueActions([]);
          return;
        }
        setDueActions(sanitizeDueActions(body.actions));
      } catch {
        setDueActions([]);
      }
    },
    [accessToken],
  );

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([fetchApplications(), fetchDueActions()]);
  }, [fetchApplications, fetchDueActions]);

  const clear = useCallback((): void => {
    setApplications([]);
    setDueActions([]);
    setError(null);
    setLoading(false);
  }, []);

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
    dueActions,
    loading,
    error,
    fetchApplications,
    fetchDueActions,
    refresh,
    clear,
    createApplication,
    updateApplication,
    moveToStage,
    deleteApplication,
    archiveApplication,
    restoreApplication,
  };
}

/**
 * Legacy alias — existing call sites import `useApplicationPipeline` from
 * `@/hooks/useJobApplications`. New code should use `useJobApplications`
 * directly. This re-export lets Phase 3's file migrations stay as a pure
 * import-path swap without touching call-site names. Safe to rename and
 * remove once no caller references it.
 */
export const useApplicationPipeline = useJobApplications;
