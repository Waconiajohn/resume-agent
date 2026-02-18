import { useState, useCallback } from 'react';
import type { CoachSession } from '@/types/session';

const API_BASE = '/api';

export function useSession(accessToken: string | null) {
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [currentSession, setCurrentSession] = useState<CoachSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }), [accessToken]);

  const listSessions = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions`, { headers: headers() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to load sessions (${res.status})`);
        return;
      }
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading sessions');
    } finally {
      setLoading(false);
    }
  }, [accessToken, headers]);

  const createSession = useCallback(async (masterResumeId?: string) => {
    if (!accessToken) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ master_resume_id: masterResumeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to create session (${res.status})`);
        return null;
      }
      const data = await res.json();
      const session = data.session as CoachSession;
      setCurrentSession(session);
      return session;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error creating session');
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken, headers]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (!accessToken) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, { headers: headers() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to load session (${res.status})`);
        return null;
      }
      const data = await res.json();
      const session = data.session as CoachSession;
      setCurrentSession(session);
      return session;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading session');
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken, headers]);

  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!accessToken) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to delete session (${res.status})`);
        return false;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setCurrentSession((prev) => (prev?.id === sessionId ? null : prev));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error deleting session');
      return false;
    }
  }, [accessToken, headers]);

  const sendMessage = useCallback(async (sessionId: string, content: string): Promise<boolean> => {
    if (!accessToken) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          content,
          idempotency_key: `${sessionId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to send message (${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error sending message');
      return false;
    }
  }, [accessToken, headers]);

  const startPipeline = useCallback(async (
    sessionId: string,
    rawResumeText: string,
    jobDescription: string,
    companyName: string,
  ): Promise<boolean> => {
    if (!accessToken) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pipeline/start`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          session_id: sessionId,
          raw_resume_text: rawResumeText,
          job_description: jobDescription,
          company_name: companyName,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to start pipeline (${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error starting pipeline');
      return false;
    }
  }, [accessToken, headers]);

  const respondToGate = useCallback(async (
    sessionId: string,
    gate: string,
    response: unknown,
  ): Promise<boolean> => {
    if (!accessToken) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pipeline/respond`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          session_id: sessionId,
          gate,
          response,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to respond to gate (${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error responding to gate');
      return false;
    }
  }, [accessToken, headers]);

  return {
    sessions,
    currentSession,
    loading,
    error,
    clearError,
    listSessions,
    createSession,
    loadSession,
    deleteSession,
    sendMessage,
    setCurrentSession,
    startPipeline,
    respondToGate,
  };
}
