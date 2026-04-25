/**
 * useV3SessionPersistence — "come back and find your last resume waiting."
 *
 * Two layers:
 *  1. localStorage cache keyed by user id, for instant same-browser restore.
 *     Rewritten whenever the pipeline reaches isComplete or editedWritten
 *     changes (debounced 500ms).
 *  2. Server fallback via GET /v3-pipeline/sessions/latest, used when the
 *     cache is empty (new browser, fresh cleared localStorage). Edits are
 *     posted to PATCH /v3-pipeline/sessions/:id/edits debounced 2s.
 *
 * The hook does not own pipeline state — it observes the pipeline (and any
 * user edits) and writes the serialized snapshot out. On mount it exposes a
 * `lastSession` value; the host screen decides whether to render the "Resume
 * where you left off" banner and, if the user confirms, hydrates the
 * pipeline from the snapshot.
 *
 * Deliberately narrow:
 *  - Only completed runs are cached. Mid-run state isn't resumable — the
 *    SSE stream can't be re-joined after a tab close, and a partial UI would
 *    be more confusing than helpful.
 *  - Cache entries older than SEVEN_DAYS_MS are ignored on read.
 *  - Single entry per user; no unbounded growth.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type {
  V3BenchmarkProfile,
  V3DiscoveryAnswer,
  V3StageCosts,
  V3StageTimings,
  V3Strategy,
  V3StructuredResume,
  V3VerifyResult,
  V3WrittenResume,
} from '@/hooks/useV3Pipeline';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LOCALSTORAGE_WRITE_DEBOUNCE_MS = 500;
const SERVER_EDITS_DEBOUNCE_MS = 2000;

export interface V3SessionSnapshot {
  sessionId: string | null;
  structured: V3StructuredResume;
  benchmark: V3BenchmarkProfile;
  strategy: V3Strategy;
  written: V3WrittenResume;
  verify: V3VerifyResult;
  timings: V3StageTimings | null;
  costs: V3StageCosts | null;
  /** Optional user-edited WrittenResume (click-to-edit + applied patches). */
  editedWritten?: V3WrittenResume | null;
  /** Candidate-provided discovery proof collected during this run. */
  discoveryAnswers?: V3DiscoveryAnswer[];
  /** Snapshot context so the banner can show "[title] at [company]". */
  jdTitle?: string | null;
  jdCompany?: string | null;
  /** When the snapshot was saved to localStorage / fetched from the server. */
  savedAt: number;
}

interface CacheEntry extends V3SessionSnapshot {
  version: 1;
}

function storageKey(userId: string, applicationId?: string | null): string {
  // Approach C Sprint A — when inside an application workspace, scope the
  // cache key by applicationId so each application has its own "last run"
  // slot. Outside an application the key is just user-scoped, same as before.
  return applicationId
    ? `resume-v3-last-session-${userId}-app-${applicationId}`
    : `resume-v3-last-session-${userId}`;
}

function readCache(userId: string, applicationId?: string | null): V3SessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId, applicationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.version !== 1) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > SEVEN_DAYS_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(
  userId: string,
  snapshot: V3SessionSnapshot,
  applicationId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry = { ...snapshot, version: 1 };
    window.localStorage.setItem(storageKey(userId, applicationId), JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled — server is still authoritative.
  }
}

function clearCache(userId: string, applicationId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(userId, applicationId));
  } catch {
    // ignored
  }
}

interface UseV3SessionPersistenceArgs {
  accessToken: string | null;
  userId: string | null;
  /** Live pipeline state from useV3Pipeline. */
  pipeline: {
    isComplete: boolean;
    sessionId: string | null;
    structured: V3StructuredResume | null;
    benchmark: V3BenchmarkProfile | null;
    strategy: V3Strategy | null;
    written: V3WrittenResume | null;
    verify: V3VerifyResult | null;
    timings: V3StageTimings | null;
    costs: V3StageCosts | null;
  };
  /** The user's current edited-written state, if any. */
  editedWritten: V3WrittenResume | null;
  /** Candidate-provided discovery proof collected during this run. */
  discoveryAnswers?: V3DiscoveryAnswer[];
  /** Metadata captured at submit time so the banner can label the run. */
  jdTitle?: string | null;
  jdCompany?: string | null;
  /**
   * Approach C Sprint A — when set, scopes both the localStorage cache and
   * the server latest-session lookup to this application. The banner for an
   * application workspace must only show prior runs FOR THAT APPLICATION so
   * the user isn't tempted to resume work from a different company / role.
   */
  applicationId?: string | null;
}

export interface UseV3SessionPersistenceResult {
  /** The most-recent resumable snapshot, or null if nothing was found. */
  lastSession: V3SessionSnapshot | null;
  /** True while the mount-time lookup is in flight. */
  loading: boolean;
  /**
   * Clear both caches and forget the resumable snapshot. Called when the
   * user clicks Start fresh or Start over.
   */
  clear: () => void;
  /**
   * Forget the current `lastSession` without clearing localStorage — used
   * after the user explicitly resumes (we don't want the banner to re-show
   * while the hydrated session is on screen).
   */
  acknowledge: () => void;
}

export function useV3SessionPersistence({
  accessToken,
  userId,
  pipeline,
  editedWritten,
  discoveryAnswers,
  jdTitle,
  jdCompany,
  applicationId,
}: UseV3SessionPersistenceArgs): UseV3SessionPersistenceResult {
  const [lastSession, setLastSession] = useState<V3SessionSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const cacheWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverEditsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPostedEditsRef = useRef<string | null>(null);

  // ─── Mount-time hydrate lookup ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!userId) {
        if (!cancelled) {
          setLastSession(null);
          setLoading(false);
        }
        return;
      }

      const cached = readCache(userId, applicationId);
      if (cached) {
        if (!cancelled) {
          setLastSession(cached);
          setLoading(false);
        }
        return;
      }

      if (!accessToken) {
        if (!cancelled) {
          setLastSession(null);
          setLoading(false);
        }
        return;
      }

      try {
        const qs = applicationId ? `?application_id=${encodeURIComponent(applicationId)}` : '';
        const res = await fetch(`${API_BASE}/v3-pipeline/sessions/latest${qs}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setLastSession(null);
            setLoading(false);
          }
          return;
        }
        const body = (await res.json()) as {
          session: {
            id: string;
            updatedAt: string;
            pipelineOutput: {
              structured: V3StructuredResume;
              benchmark: V3BenchmarkProfile;
              strategy: V3Strategy;
              written: V3WrittenResume;
              verify: V3VerifyResult;
              discoveryAnswers?: V3DiscoveryAnswer[];
              timings: V3StageTimings | null;
              costs: V3StageCosts | null;
            };
            jdText: string | null;
            jdTitle: string | null;
            jdCompany: string | null;
            resumeSource: string | null;
            editedWritten: V3WrittenResume | null;
          } | null;
        };

        if (cancelled) return;
        if (!body.session) {
          setLastSession(null);
          setLoading(false);
          return;
        }

        const snapshot: V3SessionSnapshot = {
          sessionId: body.session.id,
          structured: body.session.pipelineOutput.structured,
          benchmark: body.session.pipelineOutput.benchmark,
          strategy: body.session.pipelineOutput.strategy,
          written: body.session.pipelineOutput.written,
          verify: body.session.pipelineOutput.verify,
          discoveryAnswers: body.session.pipelineOutput.discoveryAnswers ?? [],
          timings: body.session.pipelineOutput.timings,
          costs: body.session.pipelineOutput.costs,
          editedWritten: body.session.editedWritten,
          jdTitle: body.session.jdTitle,
          jdCompany: body.session.jdCompany,
          savedAt: new Date(body.session.updatedAt).getTime() || Date.now(),
        };
        setLastSession(snapshot);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLastSession(null);
          setLoading(false);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [userId, accessToken, applicationId]);

  // ─── localStorage write on completion / edits ─────────────────────────
  useEffect(() => {
    if (!userId) return;
    if (!pipeline.isComplete) return;
    if (
      !pipeline.structured
      || !pipeline.benchmark
      || !pipeline.strategy
      || !pipeline.written
      || !pipeline.verify
    ) {
      return;
    }

    if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current);
    cacheWriteTimerRef.current = setTimeout(() => {
      const snapshot: V3SessionSnapshot = {
        sessionId: pipeline.sessionId,
        structured: pipeline.structured!,
        benchmark: pipeline.benchmark!,
        strategy: pipeline.strategy!,
        written: pipeline.written!,
        verify: pipeline.verify!,
        discoveryAnswers: discoveryAnswers ?? [],
        timings: pipeline.timings,
        costs: pipeline.costs,
        editedWritten,
        jdTitle: jdTitle ?? null,
        jdCompany: jdCompany ?? null,
        savedAt: Date.now(),
      };
      writeCache(userId, snapshot, applicationId);
    }, LOCALSTORAGE_WRITE_DEBOUNCE_MS);

    return () => {
      if (cacheWriteTimerRef.current) {
        clearTimeout(cacheWriteTimerRef.current);
        cacheWriteTimerRef.current = null;
      }
    };
  }, [
    userId,
    pipeline.isComplete,
    pipeline.sessionId,
    pipeline.structured,
    pipeline.benchmark,
    pipeline.strategy,
    pipeline.written,
    pipeline.verify,
    pipeline.timings,
    pipeline.costs,
    editedWritten,
    discoveryAnswers,
    jdTitle,
    jdCompany,
    applicationId,
  ]);

  // ─── Server-side edit persistence (PATCH /sessions/:id/edits) ─────────
  // Only fires when the pipeline has completed AND we have a real session
  // id AND editedWritten differs from the last payload we posted. Debounced
  // so a burst of keystrokes doesn't produce a burst of PATCHes.
  useEffect(() => {
    if (!accessToken) return;
    if (!pipeline.isComplete) return;
    if (!pipeline.sessionId) return;
    if (!editedWritten) return;

    const serialized = JSON.stringify(editedWritten);
    if (serialized === lastPostedEditsRef.current) return;

    if (serverEditsTimerRef.current) clearTimeout(serverEditsTimerRef.current);
    serverEditsTimerRef.current = setTimeout(() => {
      const sessionId = pipeline.sessionId;
      if (!sessionId) return;
      lastPostedEditsRef.current = serialized;
      void fetch(`${API_BASE}/v3-pipeline/sessions/${sessionId}/edits`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ editedWritten }),
      }).catch(() => {
        // Network hiccup — localStorage is authoritative; we'll retry on
        // the next edit.
        lastPostedEditsRef.current = null;
      });
    }, SERVER_EDITS_DEBOUNCE_MS);

    return () => {
      if (serverEditsTimerRef.current) {
        clearTimeout(serverEditsTimerRef.current);
        serverEditsTimerRef.current = null;
      }
    };
  }, [accessToken, pipeline.isComplete, pipeline.sessionId, editedWritten]);

  const clear = useCallback(() => {
    if (userId) clearCache(userId, applicationId);
    lastPostedEditsRef.current = null;
    setLastSession(null);
  }, [userId, applicationId]);

  const acknowledge = useCallback(() => {
    setLastSession(null);
  }, []);

  return { lastSession, loading, clear, acknowledge };
}
