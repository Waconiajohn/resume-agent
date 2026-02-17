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

  const sendMessage = useCallback(async (sessionId: string, content: string): Promise<boolean> => {
    if (!accessToken) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ content }),
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

  return {
    sessions,
    currentSession,
    loading,
    error,
    clearError,
    listSessions,
    createSession,
    loadSession,
    sendMessage,
    setCurrentSession,
  };
}
