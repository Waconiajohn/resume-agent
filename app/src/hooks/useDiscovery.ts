import { useState, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import type { DiscoveryOutput, ExcavationResponse, CareerIQProfile } from '@/types/discovery';

interface DiscoveryAnalyzeResult {
  session_id: string;
  discovery: DiscoveryOutput;
}

interface CompleteResult {
  profile: CareerIQProfile;
}

interface UseDiscoveryState {
  analyzing: boolean;
  excavating: boolean;
  completing: boolean;
  error: string | null;
}

export function useDiscovery(accessToken: string | null) {
  const [state, setState] = useState<UseDiscoveryState>({
    analyzing: false,
    excavating: false,
    completing: false,
    error: null,
  });

  const accessTokenRef = useRef<string | null>(accessToken);
  accessTokenRef.current = accessToken;

  const getHeaders = useCallback((): Record<string, string> => {
    const token = accessTokenRef.current;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const analyze = useCallback(
    async (resumeText: string, jobText: string): Promise<DiscoveryAnalyzeResult | null> => {
      setState((prev) => ({ ...prev, analyzing: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/discovery/analyze`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ resume_text: resumeText, job_description: jobText }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as DiscoveryAnalyzeResult;
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
        setState((prev) => ({ ...prev, error: message }));
        return null;
      } finally {
        setState((prev) => ({ ...prev, analyzing: false }));
      }
    },
    [getHeaders],
  );

  const excavate = useCallback(
    async (sessionId: string, answer: string): Promise<ExcavationResponse | null> => {
      setState((prev) => ({ ...prev, excavating: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/discovery/excavate`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ session_id: sessionId, answer }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as ExcavationResponse;
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Excavation failed. Please try again.';
        setState((prev) => ({ ...prev, error: message }));
        return null;
      } finally {
        setState((prev) => ({ ...prev, excavating: false }));
      }
    },
    [getHeaders],
  );

  const complete = useCallback(
    async (sessionId: string): Promise<CompleteResult | null> => {
      setState((prev) => ({ ...prev, completing: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/discovery/complete`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as CompleteResult;
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not complete profile. Please try again.';
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
    excavating: state.excavating,
    completing: state.completing,
    error: state.error,
    analyze,
    excavate,
    complete,
    clearError,
  };
}
