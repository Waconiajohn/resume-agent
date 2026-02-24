import { useState, useCallback, useEffect, useRef } from 'react';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeListItem } from '@/types/resume';
import { resumeToText } from '@/lib/export';
import { retryDelayMsFromHeaders } from '@/lib/http-retry';
import { API_BASE } from '../lib/api';

type WorkflowMode = 'fast_draft' | 'balanced' | 'deep_dive';
type ResumePriority = 'authentic' | 'ats' | 'impact' | 'balanced';
type SeniorityDelta = 'same' | 'one_up' | 'big_jump' | 'step_back';

interface PipelineStartCacheEntry {
  rawResumeText: string;
  jobDescription: string;
  companyName: string;
  workflowMode: WorkflowMode;
  minimumEvidenceTarget?: number;
  resumePriority?: ResumePriority;
  seniorityDelta?: SeniorityDelta;
  savedAt: string;
}

const PIPELINE_START_CACHE_PREFIX = 'resume-agent:pipeline-start:';

function pipelineStartCacheKey(sessionId: string): string {
  return `${PIPELINE_START_CACHE_PREFIX}${sessionId}`;
}

function persistPipelineStartCache(sessionId: string, entry: PipelineStartCacheEntry) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(pipelineStartCacheKey(sessionId), JSON.stringify(entry));
  } catch {
    // Best effort
  }
}

function loadPipelineStartCache(sessionId: string): PipelineStartCacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(pipelineStartCacheKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PipelineStartCacheEntry> | null;
    if (!parsed) return null;
    if (typeof parsed.rawResumeText !== 'string' || typeof parsed.jobDescription !== 'string' || typeof parsed.companyName !== 'string') {
      return null;
    }
    const workflowMode: WorkflowMode = parsed.workflowMode === 'fast_draft' || parsed.workflowMode === 'deep_dive'
      ? parsed.workflowMode
      : 'balanced';
    return {
      rawResumeText: parsed.rawResumeText,
      jobDescription: parsed.jobDescription,
      companyName: parsed.companyName,
      workflowMode,
      minimumEvidenceTarget: typeof parsed.minimumEvidenceTarget === 'number' ? parsed.minimumEvidenceTarget : undefined,
      resumePriority: parsed.resumePriority,
      seniorityDelta: parsed.seniorityDelta,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

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

  const fetchWithOneRetry = useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    const attempt = async () => fetch(url, init);
    let res = await attempt();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMsFromHeaders(res.headers, 300)));
      res = await attempt();
    }
    return res;
  }, []);

  const buildErrorMessage = useCallback(async (
    res: Response,
    fallback: string,
    preParsed?: { error?: string },
  ) => {
    const data = preParsed ?? await res.json().catch(() => ({} as { error?: string }));
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
      const res = await fetchWithOneRetry(`${API_BASE}/sessions`, { headers: headers() });
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
  }, [headers, buildErrorMessage, fetchWithOneRetry]);

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
      const res = await fetchWithOneRetry(`${API_BASE}/resumes`, { headers: headers() });
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
  }, [headers, buildErrorMessage, fetchWithOneRetry]);

  const getDefaultResume = useCallback(async (): Promise<MasterResume | null> => {
    if (!accessTokenRef.current) return null;
    setError(null);
    try {
      const res = await fetchWithOneRetry(`${API_BASE}/resumes/default`, { headers: headers() });
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
  }, [headers, buildErrorMessage, fetchWithOneRetry]);

  const getResumeById = useCallback(async (resumeId: string): Promise<MasterResume | null> => {
    if (!accessTokenRef.current) return null;
    setError(null);
    try {
      const res = await fetchWithOneRetry(`${API_BASE}/resumes/${encodeURIComponent(resumeId)}`, {
        headers: headers(),
      });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to load resume (${res.status})`);
        setError(message);
        return null;
      }
      const data = await res.json();
      return (data.resume as MasterResume | null) ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading resume');
      return null;
    }
  }, [headers, buildErrorMessage, fetchWithOneRetry]);

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
      const res = await fetchWithOneRetry(`${API_BASE}/sessions/${sessionId}`, { headers: headers() });
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
  }, [headers, buildErrorMessage, fetchWithOneRetry]);

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
            await new Promise((resolve) => setTimeout(resolve, retryDelayMsFromHeaders(res.headers, 300)));
            continue;
          }

          const fallback = data.error ?? `Failed to send message (${res.status})`;
          const message = await buildErrorMessage(res, fallback, data);
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
    workflowMode: WorkflowMode = 'balanced',
    minimumEvidenceTarget?: number,
    resumePriority?: ResumePriority,
    seniorityDelta?: SeniorityDelta,
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
          workflow_mode: workflowMode,
          minimum_evidence_target: minimumEvidenceTarget,
          resume_priority: resumePriority,
          seniority_delta: seniorityDelta,
        }),
      });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to start pipeline (${res.status})`);
        setError(message);
        return false;
      }
      persistPipelineStartCache(sessionId, {
        rawResumeText,
        jobDescription,
        companyName,
        workflowMode,
        minimumEvidenceTarget,
        resumePriority,
        seniorityDelta,
        savedAt: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error starting pipeline');
      return false;
    }
  }, [headers, buildErrorMessage]);

  const restartPipelineWithCachedInputs = useCallback(async (
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> => {
    if (accessTokenRef.current) {
      try {
        const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(sessionId)}/restart`, {
          method: 'POST',
          headers: headers(),
        });
        const data = await res.json().catch(() => ({} as { error?: string; message?: string; status?: string }));
        if (res.ok) {
          const message = data.message ?? 'Restarted the pipeline from saved session inputs.';
          return { success: true, message };
        }
        // If the server has a definitive response (e.g., already running/capacity), do not fallback.
        if (res.status !== 404) {
          const message = data.message ?? data.error ?? `Failed to restart pipeline (${res.status})`;
          setError(message);
          return { success: false, message };
        }
        // 404 means this server may not have the restart endpoint or no artifact exists — fall through.
      } catch {
        // Fall back to local cache + restart-inputs endpoint path below.
      }
    }

    let cached = loadPipelineStartCache(sessionId);
    if (!cached && accessTokenRef.current) {
      try {
        const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(sessionId)}/restart-inputs`, {
          headers: headers(),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({} as {
            inputs?: {
              raw_resume_text?: string;
              job_description?: string;
              company_name?: string;
              workflow_mode?: WorkflowMode;
              minimum_evidence_target?: number | null;
              resume_priority?: ResumePriority | null;
              seniority_delta?: SeniorityDelta | null;
            };
          }));
          const inputs = data.inputs;
          if (inputs?.raw_resume_text && inputs?.job_description && inputs?.company_name) {
            cached = {
              rawResumeText: inputs.raw_resume_text,
              jobDescription: inputs.job_description,
              companyName: inputs.company_name,
              workflowMode: inputs.workflow_mode === 'fast_draft' || inputs.workflow_mode === 'deep_dive'
                ? inputs.workflow_mode
                : 'balanced',
              minimumEvidenceTarget: typeof inputs.minimum_evidence_target === 'number'
                ? inputs.minimum_evidence_target
                : undefined,
              resumePriority: inputs.resume_priority ?? undefined,
              seniorityDelta: inputs.seniority_delta ?? undefined,
              savedAt: new Date().toISOString(),
            };
            persistPipelineStartCache(sessionId, cached);
          }
        }
      } catch {
        // Fall through to local cache / error path.
      }
    }
    if (!cached) {
      const message = 'No restart inputs are available for this session. Please restart from the intake form.';
      setError(message);
      return { success: false, message };
    }
    const started = await startPipeline(
      sessionId,
      cached.rawResumeText,
      cached.jobDescription,
      cached.companyName,
      cached.workflowMode,
      cached.minimumEvidenceTarget,
      cached.resumePriority,
      cached.seniorityDelta,
    );
    return {
      success: started,
      message: started
        ? 'Restarted the pipeline with your last resume, job description, and workflow settings.'
        : 'Failed to restart pipeline',
    };
  }, [startPipeline]);

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
          const message = await buildErrorMessage(res, fallback, data);
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
    getResumeById,
    saveResumeAsBase,
    loadSession,
    deleteSession,
    setDefaultResume,
    deleteResume,
    sendMessage,
    setCurrentSession,
    startPipeline,
    restartPipelineWithCachedInputs,
    respondToGate,
  };
}
