import { useState, useCallback, useEffect, useRef } from 'react';
import type { CoachSession } from '@/types/session';
import type { FinalResume, MasterResume, MasterResumeEvidenceItem, MasterResumeListItem } from '@/types/resume';
import { resumeToText } from '@/lib/export';
import { retryDelayMsFromHeaders } from '@/lib/http-retry';
import { safeNumber, safeString } from '@/lib/safe-cast';
import {
  buildAuthScopedStorageKey,
  decodeUserIdFromAccessToken,
  readJsonFromLocalStorage,
  removeLocalStorageKey,
  writeJsonToLocalStorage,
} from '@/lib/auth-scoped-storage';
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

const PIPELINE_START_CACHE_NAMESPACE = 'resume-agent:pipeline-start';
const LEGACY_PIPELINE_START_CACHE_PREFIX = `${PIPELINE_START_CACHE_NAMESPACE}:`;

function pipelineStartCacheKey(sessionId: string, userId: string | null): string {
  return buildAuthScopedStorageKey(PIPELINE_START_CACHE_NAMESPACE, userId, sessionId);
}

function legacyPipelineStartCacheKey(sessionId: string): string {
  return `${LEGACY_PIPELINE_START_CACHE_PREFIX}${sessionId}`;
}

function normalizePipelineStartCache(parsed: Partial<PipelineStartCacheEntry> | null): PipelineStartCacheEntry | null {
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
}

function persistPipelineStartCache(sessionId: string, userId: string | null, entry: PipelineStartCacheEntry) {
  writeJsonToLocalStorage(pipelineStartCacheKey(sessionId, userId), entry);
  removeLocalStorageKey(legacyPipelineStartCacheKey(sessionId));
}

function loadPipelineStartCache(sessionId: string, userId: string | null): PipelineStartCacheEntry | null {
  return normalizePipelineStartCache(
    readJsonFromLocalStorage<Partial<PipelineStartCacheEntry>>(pipelineStartCacheKey(sessionId, userId)),
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeMasterResumeListItem(value: unknown): MasterResumeListItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = safeString(raw.id).trim();
  const createdAt = safeString(raw.created_at).trim();
  const updatedAt = safeString(raw.updated_at).trim();
  if (!id || !createdAt || !updatedAt) return null;

  return {
    id,
    summary: safeString(raw.summary),
    version: safeNumber(raw.version),
    is_default: Boolean(raw.is_default),
    source_session_id: raw.source_session_id == null ? null : safeString(raw.source_session_id),
    company_name: raw.company_name == null ? null : safeString(raw.company_name),
    job_title: raw.job_title == null ? null : safeString(raw.job_title),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function normalizeMasterResumeList(value: unknown): MasterResumeListItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeMasterResumeListItem(item))
    .filter((item): item is MasterResumeListItem => item !== null);
}

function normalizeMasterResume(value: unknown): MasterResume | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const id = safeString(raw.id).trim();
  const userId = safeString(raw.user_id).trim();
  const rawText = safeString(raw.raw_text);
  const createdAt = safeString(raw.created_at).trim();
  const updatedAt = safeString(raw.updated_at).trim();
  if (!id || !userId || !createdAt || !updatedAt) return null;

  const contactInfo =
    raw.contact_info && typeof raw.contact_info === 'object' && !Array.isArray(raw.contact_info)
      ? {
          name: safeString((raw.contact_info as Record<string, unknown>).name),
          email: safeString((raw.contact_info as Record<string, unknown>).email) || undefined,
          phone: safeString((raw.contact_info as Record<string, unknown>).phone) || undefined,
          linkedin: safeString((raw.contact_info as Record<string, unknown>).linkedin) || undefined,
          location: safeString((raw.contact_info as Record<string, unknown>).location) || undefined,
        }
      : undefined;

  const experience = Array.isArray(raw.experience)
    ? raw.experience.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const entry = item as Record<string, unknown>;
        return [{
          company: safeString(entry.company),
          title: safeString(entry.title),
          start_date: safeString(entry.start_date),
          end_date: safeString(entry.end_date),
          location: safeString(entry.location),
          bullets: Array.isArray(entry.bullets)
            ? entry.bullets.flatMap((bullet) => {
                if (!bullet || typeof bullet !== 'object' || Array.isArray(bullet)) return [];
                const rawBullet = bullet as Record<string, unknown>;
                const text = safeString(rawBullet.text).trim();
                if (!text) return [];
                return [{ text, source: safeString(rawBullet.source) }];
              })
            : [],
        }];
      })
    : [];

  const skills =
    raw.skills && typeof raw.skills === 'object' && !Array.isArray(raw.skills)
      ? Object.fromEntries(
          Object.entries(raw.skills as Record<string, unknown>).map(([category, items]) => [category, normalizeStringArray(items)]),
        )
      : {};

  const education = Array.isArray(raw.education)
    ? raw.education.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const entry = item as Record<string, unknown>;
        return [{
          institution: safeString(entry.institution),
          degree: safeString(entry.degree),
          field: safeString(entry.field),
          year: safeString(entry.year),
        }];
      })
    : [];

  const certifications = Array.isArray(raw.certifications)
    ? raw.certifications.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const entry = item as Record<string, unknown>;
        const name = safeString(entry.name).trim();
        if (!name) return [];
        return [{
          name,
          issuer: safeString(entry.issuer),
          year: safeString(entry.year),
        }];
      })
    : [];

  const evidenceItems = Array.isArray(raw.evidence_items)
    ? raw.evidence_items.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const entry = item as Record<string, unknown>;
        const text = safeString(entry.text).trim();
        const sourceSessionId = safeString(entry.source_session_id).trim();
        const createdAtValue = safeString(entry.created_at).trim();
        const source = safeString(entry.source);
        const normalizedSource: MasterResumeEvidenceItem['source'] | null =
          source === 'crafted' || source === 'upgraded' || source === 'interview'
            ? source
            : null;
        if (!text || !sourceSessionId || !createdAtValue || !normalizedSource) {
          return [];
        }
        return [{
          text,
          source: normalizedSource,
          category: safeString(entry.category) || undefined,
          source_session_id: sourceSessionId,
          created_at: createdAtValue,
        }];
      })
    : [];

  return {
    id,
    user_id: userId,
    summary: safeString(raw.summary),
    experience,
    skills,
    education,
    certifications,
    contact_info: contactInfo,
    raw_text: rawText,
    version: safeNumber(raw.version),
    is_default: raw.is_default == null ? undefined : Boolean(raw.is_default),
    source_session_id: raw.source_session_id == null ? null : safeString(raw.source_session_id),
    evidence_items: evidenceItems,
    created_at: createdAt,
    updated_at: updatedAt,
  };
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

  const listSessions = useCallback(async (filters?: { limit?: number; status?: string }) => {
    if (!accessTokenRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.status) params.set('status', filters.status);
      const qs = params.toString();
      const url = `${API_BASE}/sessions${qs ? `?${qs}` : ''}`;
      const res = await fetchWithOneRetry(url, { headers: headers() });
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
      setResumes(normalizeMasterResumeList(data.resumes));
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
      return normalizeMasterResume(data.resume);
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
      return normalizeMasterResume(data.resume);
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
      return { success: true, resumeId: typeof data.resume?.id === 'string' ? data.resume.id : undefined };
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
      const newDefaultId = (typeof data.resume_id === 'string' ? data.resume_id : undefined) ?? resumeId;
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
      const newDefaultId = (typeof data.new_default_resume_id === 'string' ? data.new_default_resume_id : null);
      setResumes((prev) => {
        const filtered = prev.filter((r) => r.id !== resumeId);
        if (newDefaultId === null) {
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
      persistPipelineStartCache(sessionId, decodeUserIdFromAccessToken(accessTokenRef.current), {
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

    const storageUserId = decodeUserIdFromAccessToken(accessTokenRef.current);
    let cached = loadPipelineStartCache(sessionId, storageUserId);
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
            persistPipelineStartCache(sessionId, storageUserId, cached);
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

  const getSessionResume = useCallback(async (sessionId: string): Promise<FinalResume | null> => {
    if (!accessTokenRef.current) return null;
    setError(null);
    try {
      const res = await fetchWithOneRetry(
        `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/resume`,
        { headers: headers() },
      );
      if (!res.ok) {
        if (res.status === 404) return null;
        const message = await buildErrorMessage(res, `Failed to load session resume (${res.status})`);
        setError(message);
        return null;
      }
      const data = await res.json();
      return (data.resume as FinalResume | null) ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading session resume');
      return null;
    }
  }, [headers, buildErrorMessage, fetchWithOneRetry]);

  const getSessionCoverLetter = useCallback(
    async (sessionId: string): Promise<{ letter: string; quality_score?: number | null } | null> => {
      if (!accessTokenRef.current) return null;
      setError(null);
      try {
        const res = await fetchWithOneRetry(
          `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/cover-letter`,
          { headers: headers() },
        );
        if (!res.ok) {
          if (res.status === 404) return null;
          const message = await buildErrorMessage(res, `Failed to load session cover letter (${res.status})`);
          setError(message);
          return null;
        }
        const data = await res.json() as { letter: string; quality_score?: number | null };
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error loading session cover letter');
        return null;
      }
    },
    [headers, buildErrorMessage, fetchWithOneRetry],
  );

  const updateMasterResume = useCallback(async (
    resumeId: string,
    changes: Record<string, unknown>,
  ): Promise<MasterResume | null> => {
    if (!accessTokenRef.current) return null;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resumes/${encodeURIComponent(resumeId)}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(changes),
      });
      if (!res.ok) {
        const message = await buildErrorMessage(res, `Failed to update resume (${res.status})`);
        setError(message);
        return null;
      }
      const data = await res.json();
      return (data.resume as MasterResume | null) ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error updating resume');
      return null;
    }
  }, [headers, buildErrorMessage]);

  const getResumeHistory = useCallback(async (resumeId: string) => {
    if (!accessTokenRef.current) return [];
    setError(null);
    try {
      const res = await fetchWithOneRetry(
        `${API_BASE}/resumes/${encodeURIComponent(resumeId)}/history`,
        { headers: headers() },
      );
      if (!res.ok) {
        if (res.status === 404) return [];
        const message = await buildErrorMessage(res, `Failed to load resume history (${res.status})`);
        setError(message);
        return [];
      }
      const data = await res.json();
      return (data.history ?? []) as Array<{ id: string; master_resume_id: string; changes_summary: string; changes_detail: Record<string, unknown>; created_at: string }>;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading resume history');
      return [];
    }
  }, [headers, buildErrorMessage, fetchWithOneRetry]);

  const respondToGate = useCallback(async (
    sessionId: string,
    gate: string,
    response: unknown,
  ): Promise<boolean> => {
    if (!accessTokenRef.current) return false;
    setError(null);

    const attemptRespond = async (): Promise<Response> => {
      return fetch(`${API_BASE}/pipeline/respond`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          session_id: sessionId,
          gate,
          response,
        }),
      });
    };

    try {
      let res = await attemptRespond();

      // Auto-retry once on 429 (timing race: pipeline not yet at gate, or status not yet 'running')
      if (res.status === 429) {
        const retryDelayMs = retryDelayMsFromHeaders(res.headers, 2000);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        res = await attemptRespond();
      }

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
    getSessionResume,
    getSessionCoverLetter,
    updateMasterResume,
    getResumeHistory,
  };
}
