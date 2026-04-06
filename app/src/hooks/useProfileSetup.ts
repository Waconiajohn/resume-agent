import { useState, useCallback, useEffect, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import type { IntakeAnalysis, InterviewResponse, CareerIQProfileFull } from '@/types/profile-setup';

interface AnalyzeResult {
  session_id: string;
  intake: IntakeAnalysis;
}

interface CompleteResult {
  profile: CareerIQProfileFull;
  master_resume_created?: boolean;
  master_resume_id?: string | null;
}

interface UseProfileSetupState {
  analyzing: boolean;
  answering: boolean;
  completing: boolean;
  error: string | null;
}

export function useProfileSetup(accessToken: string | null) {
  const [state, setState] = useState<UseProfileSetupState>({
    analyzing: false,
    answering: false,
    completing: false,
    error: null,
  });

  const accessTokenRef = useRef<string | null>(accessToken);
  accessTokenRef.current = accessToken;

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const getHeaders = useCallback((): Record<string, string> => {
    const token = accessTokenRef.current;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const analyze = useCallback(
    async (
      resumeText: string,
      linkedinAbout: string,
      targetRoles: string,
      situation: string,
    ): Promise<AnalyzeResult | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, analyzing: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/profile-setup/analyze`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            resume_text: resumeText,
            linkedin_about: linkedinAbout,
            target_roles: targetRoles,
            situation,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as AnalyzeResult;
        return data;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return null;
        const message = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
        setState((prev) => ({ ...prev, error: message }));
        return null;
      } finally {
        setState((prev) => ({ ...prev, analyzing: false }));
      }
    },
    [getHeaders],
  );

  const answer = useCallback(
    async (sessionId: string, answerText: string): Promise<InterviewResponse | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, answering: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/profile-setup/answer`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ session_id: sessionId, answer: answerText }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as InterviewResponse;
        return data;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return null;
        const message = err instanceof Error ? err.message : 'Could not send answer. Please try again.';
        setState((prev) => ({ ...prev, error: message }));
        return null;
      } finally {
        setState((prev) => ({ ...prev, answering: false }));
      }
    },
    [getHeaders],
  );

  const complete = useCallback(
    async (sessionId: string): Promise<CompleteResult | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, completing: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/profile-setup/complete`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ session_id: sessionId }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as CompleteResult;
        return data;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return null;
        const message = err instanceof Error ? err.message : 'Could not build your profile. Please try again.';
        setState((prev) => ({ ...prev, error: message }));
        return null;
      } finally {
        setState((prev) => ({ ...prev, completing: false }));
      }
    },
    [getHeaders],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    analyzing: state.analyzing,
    answering: state.answering,
    completing: state.completing,
    error: state.error,
    analyze,
    answer,
    complete,
    clearError,
  };
}
