import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { safeString } from '@/lib/safe-cast';

export interface InterviewerNote {
  name: string;
  title?: string;
  topics_discussed?: string[];
  rapport_notes?: string;
}

export interface InterviewDebrief {
  id: string;
  user_id: string;
  job_application_id?: string;
  company_name: string;
  role_title: string;
  interview_date: string;
  interview_type?: 'phone' | 'video' | 'onsite';
  overall_impression?: 'positive' | 'neutral' | 'negative';
  what_went_well?: string;
  what_went_poorly?: string;
  questions_asked?: string[];
  interviewer_notes?: InterviewerNote[];
  company_signals?: string;
  follow_up_actions?: string;
  created_at: string;
  updated_at: string;
}

interface DebriefState {
  debriefs: InterviewDebrief[];
  loading: boolean;
  error: string | null;
}

const INTERVIEW_TYPE_SET = new Set<NonNullable<InterviewDebrief['interview_type']>>(['phone', 'video', 'onsite']);
const IMPRESSION_SET = new Set<NonNullable<InterviewDebrief['overall_impression']>>(['positive', 'neutral', 'negative']);

function normalizeStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeInterviewerNotes(value: unknown): InterviewerNote[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const name = safeString(raw.name).trim();
    if (!name) return [];
    const title = safeString(raw.title).trim();
    const rapportNotes = safeString(raw.rapport_notes).trim();
    return [{
      name,
      title: title || undefined,
      topics_discussed: normalizeStringArray(raw.topics_discussed),
      rapport_notes: rapportNotes || undefined,
    }];
  });
}

function normalizeInterviewDebrief(value: unknown): InterviewDebrief | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const id = safeString(raw.id).trim();
  const userId = safeString(raw.user_id).trim();
  const companyName = safeString(raw.company_name).trim();
  const roleTitle = safeString(raw.role_title).trim();
  const interviewDate = safeString(raw.interview_date).trim();
  const createdAt = safeString(raw.created_at).trim();
  const updatedAt = safeString(raw.updated_at).trim();
  if (!id || !userId || !companyName || !roleTitle || !interviewDate || !createdAt || !updatedAt) return null;

  const interviewType = safeString(raw.interview_type).trim();
  const overallImpression = safeString(raw.overall_impression).trim();
  const jobApplicationId = safeString(raw.job_application_id).trim();
  const whatWentWell = safeString(raw.what_went_well).trim();
  const whatWentPoorly = safeString(raw.what_went_poorly).trim();
  const companySignals = safeString(raw.company_signals).trim();
  const followUpActions = safeString(raw.follow_up_actions).trim();

  return {
    id,
    user_id: userId,
    job_application_id: jobApplicationId || undefined,
    company_name: companyName,
    role_title: roleTitle,
    interview_date: interviewDate,
    interview_type: INTERVIEW_TYPE_SET.has(interviewType as NonNullable<InterviewDebrief['interview_type']>)
      ? (interviewType as NonNullable<InterviewDebrief['interview_type']>)
      : undefined,
    overall_impression: IMPRESSION_SET.has(overallImpression as NonNullable<InterviewDebrief['overall_impression']>)
      ? (overallImpression as NonNullable<InterviewDebrief['overall_impression']>)
      : undefined,
    what_went_well: whatWentWell || undefined,
    what_went_poorly: whatWentPoorly || undefined,
    questions_asked: normalizeStringArray(raw.questions_asked),
    interviewer_notes: normalizeInterviewerNotes(raw.interviewer_notes),
    company_signals: companySignals || undefined,
    follow_up_actions: followUpActions || undefined,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function normalizeInterviewDebriefs(value: unknown): InterviewDebrief[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((debrief) => normalizeInterviewDebrief(debrief))
    .filter((debrief): debrief is InterviewDebrief => debrief !== null);
}

async function getAuthHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function useInterviewDebriefs() {
  const [state, setState] = useState<DebriefState>({
    debriefs: [],
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

  const refresh = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, loading: false, error: 'Not authenticated' }));
        }
        return;
      }

      const res = await fetch(`${API_BASE}/interview-debriefs`, { headers: authHeader });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: `Failed to fetch debriefs (${res.status}): ${body}`,
          }));
        }
        return;
      }

      const json = (await res.json()) as { debriefs?: unknown } | unknown[];
      const debriefs = normalizeInterviewDebriefs(Array.isArray(json) ? json : (json.debriefs ?? []));
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, debriefs, loading: false }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: message }));
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createDebrief = useCallback(
    async (
      data: Omit<InterviewDebrief, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
    ): Promise<InterviewDebrief | null> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return null;

        const res = await fetch(`${API_BASE}/interview-debriefs`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) return null;

        const created = normalizeInterviewDebrief(await res.json());
        if (!created) return null;
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            debriefs: [created, ...prev.debriefs],
          }));
        }
        return created;
      } catch {
        return null;
      }
    },
    [],
  );

  const updateDebrief = useCallback(
    async (id: string, data: Partial<InterviewDebrief>): Promise<void> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return;

        const res = await fetch(`${API_BASE}/interview-debriefs/${id}`, {
          method: 'PATCH',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) return;

        const updated = normalizeInterviewDebrief(await res.json());
        if (!updated) return;
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            debriefs: prev.debriefs.map((d) => (d.id === id ? updated : d)),
          }));
        }
      } catch {
        // Fail silently — caller can retry
      }
    },
    [],
  );

  const deleteDebrief = useCallback(async (id: string): Promise<void> => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const res = await fetch(`${API_BASE}/interview-debriefs/${id}`, {
        method: 'DELETE',
        headers: authHeader,
      });

      if (!res.ok) return;

      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          debriefs: prev.debriefs.filter((d) => d.id !== id),
        }));
      }
    } catch {
      // Fail silently — caller can retry
    }
  }, []);

  return {
    debriefs: state.debriefs,
    loading: state.loading,
    error: state.error,
    createDebrief,
    updateDebrief,
    deleteDebrief,
    refresh,
  };
}
