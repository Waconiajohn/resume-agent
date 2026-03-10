import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

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

      const json = (await res.json()) as { debriefs?: InterviewDebrief[] } | InterviewDebrief[];
      const debriefs = Array.isArray(json) ? json : (json.debriefs ?? []);
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

        const created = (await res.json()) as InterviewDebrief;
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

        const updated = (await res.json()) as InterviewDebrief;
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
