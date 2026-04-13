import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeNumber, safeString } from '@/lib/safe-cast';

export type PipelineStage =
  | 'saved'
  | 'researching'
  | 'applied'
  | 'screening'
  | 'interviewing'
  | 'offer'
  | 'closed_won'
  | 'closed_lost';

export interface Application {
  id: string;
  role_title: string;
  company_name: string;
  company_id?: string;
  stage: PipelineStage;
  source: string;
  url?: string;
  applied_date?: string;
  last_touch_date?: string;
  next_action?: string;
  next_action_due?: string;
  resume_version_id?: string;
  location?: string;
  notes?: string;
  stage_history: Array<{ stage: string; at: string }>;
  score?: number;
  created_at: string;
  updated_at: string;
}

export interface DueAction {
  id: string;
  role_title: string;
  company_name: string;
  next_action: string;
  next_action_due: string;
  stage: PipelineStage;
}

interface ApplicationPipelineState {
  applications: Application[];
  dueActions: DueAction[];
  loading: boolean;
  error: string | null;
}

const VALID_STAGES: PipelineStage[] = [
  'saved',
  'researching',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'closed_won',
  'closed_lost',
];

function sanitizeStage(value: unknown): PipelineStage | null {
  return VALID_STAGES.includes(value as PipelineStage) ? (value as PipelineStage) : null;
}

function safeOptionalString(value: unknown): string | undefined {
  const normalized = safeString(value).trim();
  return normalized ? normalized : undefined;
}

function sanitizeStageHistory(value: unknown): Array<{ stage: string; at: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      stage: safeString(entry.stage).trim(),
      at: safeString(entry.at).trim(),
    }))
    .filter((entry) => entry.stage && entry.at);
}

function sanitizeApplication(value: unknown): Application | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = safeString(candidate.id).trim();
  const roleTitle = safeString(candidate.role_title).trim();
  const companyName = safeString(candidate.company_name).trim();
  const stage = sanitizeStage(candidate.stage);
  const source = safeString(candidate.source).trim();
  const createdAt = safeString(candidate.created_at).trim();
  const updatedAt = safeString(candidate.updated_at).trim();
  if (!id || !roleTitle || !companyName || !stage || !source || !createdAt || !updatedAt) return null;

  const score = candidate.score == null ? undefined : safeNumber(candidate.score);

  return {
    id,
    role_title: roleTitle,
    company_name: companyName,
    company_id: safeOptionalString(candidate.company_id),
    stage,
    source,
    url: safeOptionalString(candidate.url),
    applied_date: safeOptionalString(candidate.applied_date),
    last_touch_date: safeOptionalString(candidate.last_touch_date),
    next_action: safeOptionalString(candidate.next_action),
    next_action_due: safeOptionalString(candidate.next_action_due),
    resume_version_id: safeOptionalString(candidate.resume_version_id),
    location: safeOptionalString(candidate.location),
    notes: safeOptionalString(candidate.notes),
    stage_history: sanitizeStageHistory(candidate.stage_history),
    score,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function sanitizeApplications(value: unknown): Application[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((application) => sanitizeApplication(application))
    .filter((application): application is Application => application !== null);
}

function sanitizeDueAction(value: unknown): DueAction | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = safeString(candidate.id).trim();
  const roleTitle = safeString(candidate.role_title).trim();
  const companyName = safeString(candidate.company_name).trim();
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

async function getAuthHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function useApplicationPipeline() {
  const [state, setState] = useState<ApplicationPipelineState>({
    applications: [],
    dueActions: [],
    loading: false,
    error: null,
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchApplications = useCallback(async (stage?: PipelineStage): Promise<void> => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            applications: [],
            dueActions: [],
            loading: false,
            error: 'Not authenticated',
          }));
        }
        return;
      }

      const url = stage
        ? `${API_BASE}/applications?stage=${encodeURIComponent(stage)}`
        : `${API_BASE}/applications`;

      const res = await fetch(url, { headers: authHeader });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: `Failed to fetch applications (${res.status}): ${body}`,
          }));
        }
        return;
      }

      const json = await res.json() as { applications?: Application[]; feature_disabled?: boolean };
      if (json.feature_disabled) {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            applications: [],
            dueActions: [],
            loading: false,
            error: null,
          }));
        }
        return;
      }
      const data = sanitizeApplications(json.applications);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, applications: data, loading: false }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: message }));
      }
    }
  }, []);

  const fetchDueActions = useCallback(async (days = 7): Promise<void> => {
    if (!mountedRef.current) return;

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, dueActions: [] }));
        }
        return;
      }

      const res = await fetch(`${API_BASE}/applications/due-actions?days=${days}`, {
        headers: authHeader,
      });

      if (!res.ok) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, dueActions: [] }));
        }
        return;
      }

      const json = await res.json() as { actions?: DueAction[]; feature_disabled?: boolean };
      if (json.feature_disabled) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, dueActions: [] }));
        }
        return;
      }
      const data = sanitizeDueActions(json.actions);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, dueActions: data }));
      }
    } catch {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, dueActions: [] }));
      }
    }
  }, []);

  const createApplication = useCallback(
    async (data: Partial<Application>): Promise<Application | null> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return null;

        const res = await fetch(`${API_BASE}/applications`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) return null;

        const created = sanitizeApplication(await res.json());
        if (!created) return null;
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            applications: [created, ...prev.applications],
          }));
        }
        return created;
      } catch {
        return null;
      }
    },
    [],
  );

  const updateApplication = useCallback(
    async (id: string, data: Partial<Application>): Promise<Application | null> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return null;

        const res = await fetch(`${API_BASE}/applications/${id}`, {
          method: 'PATCH',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) return null;

        const updated = sanitizeApplication(await res.json());
        if (!updated) return null;
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            applications: prev.applications.map((a) => (a.id === id ? updated : a)),
          }));
        }
        return updated;
      } catch {
        return null;
      }
    },
    [],
  );

  const moveToStage = useCallback(async (id: string, stage: PipelineStage): Promise<boolean> => {
    // Optimistic update — apply immediately, revert on error
    const previousApplications = state.applications;
    setState((prev) => ({
      ...prev,
      applications: prev.applications.map((a) => (a.id === id ? { ...a, stage } : a)),
    }));

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, applications: previousApplications }));
        }
        return false;
      }

      const res = await fetch(`${API_BASE}/applications/${id}/stage`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });

      if (!res.ok) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, applications: previousApplications }));
        }
        return false;
      }

      return true;
    } catch {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, applications: previousApplications }));
      }
      return false;
    }
  }, [state.applications]);

  const deleteApplication = useCallback(async (id: string): Promise<boolean> => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return false;

      const res = await fetch(`${API_BASE}/applications/${id}`, {
        method: 'DELETE',
        headers: authHeader,
      });

      if (!res.ok) return false;

      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          applications: prev.applications.filter((a) => a.id !== id),
          dueActions: prev.dueActions.filter((a) => a.id !== id),
        }));
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([fetchApplications(), fetchDueActions()]);
  }, [fetchApplications, fetchDueActions]);

  const clear = useCallback((): void => {
    if (!mountedRef.current) return;
    setState({
      applications: [],
      dueActions: [],
      loading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    fetchApplications,
    fetchDueActions,
    createApplication,
    updateApplication,
    moveToStage,
    deleteApplication,
    refresh,
    clear,
  };
}
