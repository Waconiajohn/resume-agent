/**
 * useApplicationEvents — Phase 1 of the pursuit timeline.
 *
 * Append-only ledger of discrete moments per application
 * (applied / interview_happened / offer_received). Reads run on demand;
 * recorders fire from button surfaces and round-trip through
 * /api/job-applications/:id/events.
 *
 * Idempotency lives server-side (5min for applied, 60s for the others) so
 * the UI can fire freely without coordinating with other surfaces.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ─── Types (mirror server discriminated union) ────────────────────────

export type ApplicationEventType =
  | 'applied'
  | 'interview_happened'
  | 'offer_received'
  | 'interview_scheduled';

export type AppliedVia = 'manual' | 'extension' | 'imported';
export type InterviewType = 'phone' | 'video' | 'onsite';

export interface AppliedMetadata {
  type: 'applied';
  resume_session_id?: string;
  cover_letter_session_id?: string;
  applied_via: AppliedVia;
}

export interface InterviewHappenedMetadata {
  type: 'interview_happened';
  interview_date: string;
  interview_type: InterviewType;
  interviewer_names?: string[];
}

export interface OfferReceivedMetadata {
  type: 'offer_received';
  amount?: number;
  currency?: string;
  offer_date?: string;
  role_title?: string;
}

export interface InterviewScheduledMetadata {
  type: 'interview_scheduled';
  scheduled_date: string;
  interview_type: InterviewType;
  round?: string;
  with_whom?: string[];
}

export type ApplicationEventMetadata =
  | AppliedMetadata
  | InterviewHappenedMetadata
  | OfferReceivedMetadata
  | InterviewScheduledMetadata;

export interface ApplicationEvent {
  id: string;
  user_id: string;
  job_application_id: string;
  type: ApplicationEventType;
  occurred_at: string;
  metadata: ApplicationEventMetadata | null;
  created_at: string;
}

const LOCAL_EVENTS_PREFIX = 'career-iq:application-events:';

function localEventsKey(applicationId: string): string {
  return `${LOCAL_EVENTS_PREFIX}${applicationId}`;
}

function isApplicationEvent(value: unknown): value is ApplicationEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ApplicationEvent>;
  return (
    typeof event.id === 'string'
    && typeof event.job_application_id === 'string'
    && typeof event.type === 'string'
    && typeof event.occurred_at === 'string'
    && typeof event.created_at === 'string'
  );
}

function readLocalEvents(applicationId: string): ApplicationEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localEventsKey(applicationId)) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isApplicationEvent).filter((event) => event.job_application_id === applicationId)
      : [];
  } catch {
    return [];
  }
}

function writeLocalEvent(event: ApplicationEvent) {
  if (typeof window === 'undefined') return;
  const existing = readLocalEvents(event.job_application_id);
  const next = [event, ...existing.filter((item) => item.id !== event.id)].slice(0, 100);
  try {
    window.localStorage.setItem(localEventsKey(event.job_application_id), JSON.stringify(next));
  } catch {
    // Restricted storage should not make the visible user action fail.
  }
}

function mergeEvents(remote: ApplicationEvent[], local: ApplicationEvent[]): ApplicationEvent[] {
  const seen = new Set<string>();
  return [...local, ...remote]
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
}

function withJsonHeader(headers: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set('Content-Type', 'application/json');
  return next;
}

// ─── Hook ─────────────────────────────────────────────────────────────

interface UseApplicationEventsOptions {
  applicationId?: string | null;
  /** Skip the initial fetch — caller will trigger reads manually. */
  skip?: boolean;
}

export function useApplicationEvents(options: UseApplicationEventsOptions = {}) {
  const { applicationId, skip } = options;
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const authHeader = useCallback(async (): Promise<HeadersInit | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchEvents = useCallback(
    async (id: string): Promise<ApplicationEvent[]> => {
      const headers = await authHeader();
      if (!headers) return [];
      setLoading(true);
      setError(null);
      try {
        const localEvents = readLocalEvents(id);
        const res = await fetch(
          `${API_BASE}/job-applications/${encodeURIComponent(id)}/events`,
          { headers },
        );
        if (!res.ok) {
          if (mountedRef.current) setError(`Failed to load events (${res.status})`);
          if (mountedRef.current) setEvents(localEvents);
          return localEvents;
        }
        const body = (await res.json()) as { events?: ApplicationEvent[] };
        const remote = Array.isArray(body.events) ? body.events : [];
        const list = mergeEvents(remote, localEvents);
        if (mountedRef.current) setEvents(list);
        return list;
      } catch (err) {
        const localEvents = readLocalEvents(id);
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load events');
          setEvents(localEvents);
        }
        return localEvents;
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [authHeader],
  );

  // Auto-fetch when applicationId changes.
  useEffect(() => {
    if (skip || !applicationId) return;
    void fetchEvents(applicationId);
  }, [applicationId, skip, fetchEvents]);

  const recordEvent = useCallback(
    async (input: {
      applicationId: string;
      metadata: ApplicationEventMetadata;
      occurredAt?: string;
    }): Promise<{ event: ApplicationEvent; deduplicated: boolean } | null> => {
      const headers = await authHeader();
      if (!headers) return null;
      try {
          const res = await fetch(
            `${API_BASE}/job-applications/${encodeURIComponent(input.applicationId)}/events`,
            {
              method: 'POST',
              headers: withJsonHeader(headers),
              body: JSON.stringify({
              type: input.metadata.type,
              occurred_at: input.occurredAt,
              metadata: input.metadata,
            }),
          },
        );
        if (!res.ok) {
          if (mountedRef.current) setError(`Failed to record event (${res.status})`);
          return null;
        }
        const body = (await res.json()) as { event: ApplicationEvent; deduplicated: boolean };
        // Refresh local list if this hook is currently watching that application.
        if (mountedRef.current && applicationId === input.applicationId) {
          setEvents((prev) => {
            const existingIdx = prev.findIndex((e) => e.id === body.event.id);
            if (existingIdx >= 0) return prev;
            return [body.event, ...prev];
          });
        }
        return body;
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to record event');
        }
        return null;
      }
    },
    [authHeader, applicationId],
  );

  const recordApplied = useCallback(
    async (input: {
      applicationId: string;
      resumeSessionId?: string;
      coverLetterSessionId?: string;
      appliedVia?: AppliedVia;
    }): Promise<{ event: ApplicationEvent; deduplicated: boolean } | null> => {
      const metadata: AppliedMetadata = {
        type: 'applied',
        resume_session_id: input.resumeSessionId,
        cover_letter_session_id: input.coverLetterSessionId,
        applied_via: input.appliedVia ?? 'manual',
      };
      const recorded = await recordEvent({
        applicationId: input.applicationId,
        metadata,
      });
      if (recorded) return recorded;

      // Fallback for environments where the append-only events table is not
      // migrated yet: persist the canonical application stage/date so the UI
      // can advance instead of making "I applied" feel like a dead button.
      const headers = await authHeader();
      if (!headers) return null;
      const now = new Date();
      const appliedDate = now.toISOString().slice(0, 10);
      try {
          const res = await fetch(
            `${API_BASE}/job-applications/${encodeURIComponent(input.applicationId)}`,
            {
              method: 'PATCH',
              headers: withJsonHeader(headers),
              body: JSON.stringify({ stage: 'applied', applied_date: appliedDate }),
          },
        );
        if (!res.ok) {
          if (mountedRef.current) setError(`Failed to record applied state (${res.status})`);
          return null;
        }
        const syntheticEvent: ApplicationEvent = {
          id: `applied-${input.applicationId}-${appliedDate}`,
          user_id: '',
          job_application_id: input.applicationId,
          type: 'applied',
          occurred_at: now.toISOString(),
          metadata,
          created_at: now.toISOString(),
        };
        if (mountedRef.current) {
          setError(null);
          if (applicationId === input.applicationId) {
            setEvents((prev) => (
              prev.some((event) => event.type === 'applied')
                ? prev
                : [syntheticEvent, ...prev]
            ));
          }
        }
        return { event: syntheticEvent, deduplicated: false };
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to record applied state');
        }
        return null;
      }
    },
    [authHeader, applicationId, recordEvent],
  );

  const recordLocalFallback = useCallback(
    (
      targetApplicationId: string,
      metadata: ApplicationEventMetadata,
      occurredAt?: string,
    ): { event: ApplicationEvent; deduplicated: boolean } => {
      const nowIso = new Date().toISOString();
      const event: ApplicationEvent = {
        id: `local-${metadata.type}-${targetApplicationId}-${Date.now()}`,
        user_id: '',
        job_application_id: targetApplicationId,
        type: metadata.type,
        occurred_at: occurredAt ?? nowIso,
        metadata,
        created_at: nowIso,
      };
      writeLocalEvent(event);
      if (mountedRef.current) {
        setError(null);
        if (applicationId === targetApplicationId) {
          setEvents((prev) => mergeEvents(prev, [event]));
        }
      }
      return { event, deduplicated: false };
    },
    [applicationId],
  );

  const recordInterviewHappened = useCallback(
    async (input: {
      applicationId: string;
      interviewDate: string;
      interviewType: InterviewType;
      interviewerNames?: string[];
      occurredAt?: string;
    }) => {
      const metadata: InterviewHappenedMetadata = {
        type: 'interview_happened',
        interview_date: input.interviewDate,
        interview_type: input.interviewType,
        interviewer_names: input.interviewerNames,
      };
      const recorded = await recordEvent({
        applicationId: input.applicationId,
        occurredAt: input.occurredAt,
        metadata,
      });
      if (recorded) return recorded;
      return recordLocalFallback(input.applicationId, metadata, input.occurredAt);
    },
    [recordEvent],
  );

  const recordOfferReceived = useCallback(
    (input: {
      applicationId: string;
      amount?: number;
      currency?: string;
      offerDate?: string;
      roleTitle?: string;
    }) =>
      recordEvent({
        applicationId: input.applicationId,
        metadata: {
          type: 'offer_received',
          amount: input.amount,
          currency: input.currency,
          offer_date: input.offerDate,
          role_title: input.roleTitle,
        },
      }),
    [recordEvent, recordLocalFallback],
  );

  const recordInterviewScheduled = useCallback(
    async (input: {
      applicationId: string;
      scheduledDate: string;
      interviewType: InterviewType;
      round?: string;
      withWhom?: string[];
    }) => {
      const metadata: InterviewScheduledMetadata = {
        type: 'interview_scheduled',
        scheduled_date: input.scheduledDate,
        interview_type: input.interviewType,
        round: input.round,
        with_whom: input.withWhom,
      };
      const recorded = await recordEvent({
        applicationId: input.applicationId,
        metadata,
      });
      if (recorded) return recorded;
      return recordLocalFallback(input.applicationId, metadata);
    },
    [recordEvent, recordLocalFallback],
  );

  /** Convenience: has an event of the given type been recorded for this app? */
  const hasEvent = useCallback(
    (type: ApplicationEventType): boolean => events.some((e) => e.type === type),
    [events],
  );

  /** Convenience: most recent event of a given type, or undefined. */
  const latestEvent = useCallback(
    (type: ApplicationEventType): ApplicationEvent | undefined =>
      events.find((e) => e.type === type),
    [events],
  );

  return {
    events,
    loading,
    error,
    fetchEvents,
    recordApplied,
    recordInterviewHappened,
    recordOfferReceived,
    recordInterviewScheduled,
    hasEvent,
    latestEvent,
  };
}
