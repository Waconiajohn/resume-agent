import { useState, useCallback, useEffect, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import { parseSSEStream } from '@/lib/sse-parser';
import type { DiscoveryOutput, ExcavationResponse, CareerIQProfile, DiscoverySSEEvent } from '@/types/discovery';

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

  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
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
      jobText: string,
      onStage?: (stage: string, message: string) => void,
    ): Promise<DiscoveryAnalyzeResult | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, analyzing: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/discovery/analyze`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ resume_text: resumeText, job_description: jobText }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }
        if (!res.body) {
          throw new Error('No response body from server');
        }

        for await (const { event, data } of parseSSEStream(res.body)) {
          if (event === 'heartbeat') continue;
          let parsed: DiscoverySSEEvent;
          try {
            parsed = JSON.parse(data) as DiscoverySSEEvent;
          } catch {
            continue;
          }
          if (parsed.type === 'processing_stage') {
            onStage?.(parsed.stage, parsed.message);
          } else if (parsed.type === 'recognition_ready') {
            return parsed.data;
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message);
          }
        }

        throw new Error('Stream ended without a result');
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

  const excavate = useCallback(
    async (sessionId: string, answer: string): Promise<ExcavationResponse | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, excavating: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/discovery/excavate`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ session_id: sessionId, answer }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(body || `Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as ExcavationResponse;
        return data;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return null;
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
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, completing: true, error: null }));
      try {
        const res = await fetch(`${API_BASE}/discovery/complete`, {
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
        const message = err instanceof Error ? err.message : 'Could not complete profile. Please try again.';
        setState((prev) => ({ ...prev, error: message }));
        return null;
      } finally {
        setState((prev) => ({ ...prev, completing: false }));
      }
    },
    [getHeaders],
  );

  const fetchJobDescription = useCallback(
    async (url: string): Promise<{ text: string; title: string } | null> => {
      try {
        const res = await fetch(`${API_BASE}/discovery/fetch-jd`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ url }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok) return null;
        return (await res.json()) as { text: string; title: string };
      } catch {
        return null;
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
    fetchJobDescription,
    clearError,
  };
}
