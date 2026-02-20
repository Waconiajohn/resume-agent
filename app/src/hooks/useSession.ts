import { useState, useCallback, useEffect, useRef } from 'react';
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
  const accessTokenRef = useRef<string | null>(accessToken);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const headers = useCallback(() => {
    const token = accessTokenRef.current;
    const next: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      next.Authorization = `Bearer ${token}`;
    }
    return next;
  }, []);

  const buildErrorMessage = useCallback(async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => ({} as { error?: string }));
    let message = data.error ?? fallback;
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      if (retryAfter && /^\d+$/.test(retryAfter)) {
        message = `${message} Please retry in about ${retryAfter} second${retryAfter === '1' ? '' : 's'}.`;
      }
    }
    return message;
  }, []);

  const listSessions = useCallback(async () => {
    if (!accessTokenRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions`, { headers: headers() });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to load sessions (${res.status})`);
        setError(message);
        return;
      }
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading sessions');
    } finally {
      setLoading(false);
    }
  }, [headers, buildErrorMessage]);

  const createSession = useCallback(async (masterResumeId?: string) => {
    if (!accessTokenRef.current) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ master_resume_id: masterResumeId }),
      });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to create session (${res.status})`);
        setError(message);
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
  }, [headers, buildErrorMessage]);

  const listResumes = useCallback(async () => {
    if (!accessTokenRef.current) return;
    setResumesLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes`, { headers: headers() });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to load resumes (${res.status})`);
        setError(message);
        return;
      }
      const data = await res.json();
      setResumes((data.resumes ?? []) as MasterResumeListItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading resumes');
    } finally {
      setResumesLoading(false);
    }
  }, [headers, buildErrorMessage]);

  const getDefaultResume = useCallback(async (): Promise<MasterResume | null> => {
    if (!accessTokenRef.current) return null;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes/default`, { headers: headers() });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to load default resume (${res.status})`);
        setError(message);
        return null;
      }
      const data = await res.json();
      return (data.resume as MasterResume | null) ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading default resume');
      return null;
    }
  }, [headers, buildErrorMessage]);

  const saveResumeAsBase = useCallback(async (
    resume: FinalResume,
    options: { setAsDefault: boolean; sourceSessionId?: string | null },
  ): Promise<{ success: boolean; resumeId?: string; error?: string }> => {
    if (!accessTokenRef.current) return { success: false, error: 'Not authenticated' };
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
        const message = await buildErrorMessage(res, `Failed to save resume (${res.status})`);
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
  }, [headers, buildErrorMessage]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (!accessTokenRef.current) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, { headers: headers() });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to load session (${res.status})`);
        setError(message);
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
  }, [headers, buildErrorMessage]);

  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!accessTokenRef.current) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to delete session (${res.status})`);
        setError(message);
        return false;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setCurrentSession((prev) => (prev?.id === sessionId ? null : prev));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error deleting session');
      return false;
    }
  }, [headers, buildErrorMessage]);

  const setDefaultResume = useCallback(async (resumeId: string): Promise<boolean> => {
    if (!accessTokenRef.current) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes/${resumeId}/default`, {
        method: 'PUT',
        headers: headers(),
      });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to set default resume (${res.status})`);
        setError(message);
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
  }, [headers, buildErrorMessage]);

  const deleteResume = useCallback(async (resumeId: string): Promise<boolean> => {
    if (!accessTokenRef.current) return false;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes/${resumeId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to delete resume (${res.status})`);
        setError(message);
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
  }, [headers, buildErrorMessage]);

  const sendMessage = useCallback(async (
    sessionId: string,
    content: string,
    clientMessageId?: string,
  ): Promise<boolean> => {
    if (!accessTokenRef.current) return false;
    setError(null);
    const idempotencyKey = `${sessionId}:${clientMessageId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            content,
            idempotency_key: idempotencyKey,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({} as { code?: string; error?: string }));

          // Duplicate idempotency key means the message was already accepted.
          if (res.status === 409 && data.code === 'DUPLICATE') {
            return true;
          }

          const retryable = res.status === 429 || res.status >= 500;
          if (retryable && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            continue;
          }

          const fallback = data.error ?? `Failed to send message (${res.status})`;
          const message = await buildErrorMessage(res, fallback);
          setError(message);
          return false;
        }
        return true;
      } catch (err) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
        setError(err instanceof Error ? err.message : 'Network error sending message');
        return false;
      }
    }
    return false;
  }, [headers, buildErrorMessage]);

  const startPipeline = useCallback(async (
    sessionId: string,
    rawResumeText: string,
    jobDescription: string,
    companyName: string,
  ): Promise<boolean> => {
    if (!accessTokenRef.current) return false;
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
        const message = await buildErrorMessage(res, `Failed to start pipeline (${res.status})`);
        setError(message);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error starting pipeline');
      return false;
    }
  }, [headers, buildErrorMessage]);

  const respondToGate = useCallback(async (
    sessionId: string,
    gate: string,
    response: unknown,
  ): Promise<boolean> => {
    if (!accessTokenRef.current) return false;
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
        const data = await res.json().catch(() => ({} as { code?: string; error?: string }));
        if (data.code === 'STALE_PIPELINE') {
          setError('Session state became stale after a server restart. Please restart the pipeline from this session.');
        } else {
          const fallback = data.error ?? `Failed to respond to gate (${res.status})`;
          const message = await buildErrorMessage(res, fallback);
          setError(message);
        }
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error responding to gate');
      return false;
    }
  }, [headers, buildErrorMessage]);

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
