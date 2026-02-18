import { useState, useCallback } from 'react';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeListItem } from '@/types/resume';
import { resumeToText } from '@/lib/export';

const API_BASE = '/api';

export function useSession(accessToken: string | null) {
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [resumes, setResumes] = useState<MasterResumeListItem[]>([]);
  const [currentSession, setCurrentSession] = useState<CoachSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [resumesLoading, setResumesLoading] = useState(false);
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

  const listResumes = useCallback(async () => {
    if (!accessToken) return;
    setResumesLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes`, { headers: headers() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to load resumes (${res.status})`);
        return;
      }
      const data = await res.json();
      setResumes((data.resumes ?? []) as MasterResumeListItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading resumes');
    } finally {
      setResumesLoading(false);
    }
  }, [accessToken, headers]);

  const getDefaultResume = useCallback(async (): Promise<MasterResume | null> => {
    if (!accessToken) return null;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes/default`, { headers: headers() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to load default resume (${res.status})`);
        return null;
      }
      const data = await res.json();
      return (data.resume as MasterResume | null) ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading default resume');
      return null;
    }
  }, [accessToken, headers]);

  const saveResumeAsBase = useCallback(async (
    resume: FinalResume,
    options: { setAsDefault: boolean; sourceSessionId?: string | null },
  ): Promise<{ success: boolean; resumeId?: string; error?: string }> => {
    if (!accessToken) return { success: false, error: 'Not authenticated' };
    setError(null);
    try {
      const body = {
        raw_text: resumeToText(resume),
        summary: resume.summary ?? '',
        experience: resume.experience ?? [],
        skills: resume.skills ?? {},
        education: resume.education ?? [],
        certifications: resume.certifications ?? [],
        contact_info: resume.contact_info ?? {},
        set_as_default: options.setAsDefault,
        source_session_id: options.sourceSessionId ?? undefined,
      };
      const res = await fetch(`${API_BASE}/resumes`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error ?? `Failed to save resume (${res.status})`;
        setError(message);
        return { success: false, error: message };
      }
      const data = await res.json();
      return { success: true, resumeId: data.resume?.id as string | undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error saving resume';
      setError(message);
      return { success: false, error: message };
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

  const setDefaultResume = useCallback(async (resumeId: string): Promise<boolean> => {
    if (!accessToken) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes/${resumeId}/default`, {
        method: 'PUT',
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to set default resume (${res.status})`);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const newDefaultId = (data.resume_id as string | undefined) ?? resumeId;
      setResumes((prev) =>
        prev.map((r) => ({
          ...r,
          is_default: r.id === newDefaultId,
        })),
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error setting default resume');
      return false;
    }
  }, [accessToken, headers]);

  const deleteResume = useCallback(async (resumeId: string): Promise<boolean> => {
    if (!accessToken) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes/${resumeId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed to delete resume (${res.status})`);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const newDefaultId = (data.new_default_resume_id as string | null | undefined);
      setResumes((prev) => {
        const filtered = prev.filter((r) => r.id !== resumeId);
        if (typeof newDefaultId === 'undefined') {
          return filtered;
        }
        return filtered.map((r) => ({
          ...r,
          is_default: newDefaultId ? r.id === newDefaultId : false,
        }));
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error deleting resume');
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
    resumes,
    currentSession,
    loading,
    resumesLoading,
    error,
    clearError,
    listSessions,
    listResumes,
    createSession,
    getDefaultResume,
    saveResumeAsBase,
    loadSession,
    deleteSession,
    setDefaultResume,
    deleteResume,
    sendMessage,
    setCurrentSession,
    startPipeline,
    respondToGate,
  };
}
