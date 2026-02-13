import { useState, useCallback } from 'react';
import type { CoachSession } from '@/types/session';

const API_BASE = '/api';

export function useSession(accessToken: string | null) {
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [currentSession, setCurrentSession] = useState<CoachSession | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }), [accessToken]);

  const listSessions = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`, { headers: headers() });
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, [accessToken, headers]);

  const createSession = useCallback(async (masterResumeId?: string) => {
    if (!accessToken) return null;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ master_resume_id: masterResumeId }),
      });
      const data = await res.json();
      const session = data.session as CoachSession;
      setCurrentSession(session);
      return session;
    } finally {
      setLoading(false);
    }
  }, [accessToken, headers]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (!accessToken) return null;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, { headers: headers() });
      const data = await res.json();
      const session = data.session as CoachSession;
      setCurrentSession(session);
      return session;
    } finally {
      setLoading(false);
    }
  }, [accessToken, headers]);

  const sendMessage = useCallback(async (sessionId: string, content: string) => {
    if (!accessToken) return;
    await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ content }),
    });
  }, [accessToken, headers]);

  return {
    sessions,
    currentSession,
    loading,
    listSessions,
    createSession,
    loadSession,
    sendMessage,
    setCurrentSession,
  };
}
