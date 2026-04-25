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

export type ApplicationEventType = 'applied' | 'interview_happened' | 'offer_received';

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

export type ApplicationEventMetadata =
  | AppliedMetadata
  | InterviewHappenedMetadata
  | OfferReceivedMetadata;

export interface ApplicationEvent {
  id: string;
  user_id: string;
  job_application_id: string;
  type: ApplicationEventType;
  occurred_at: string;
  metadata: ApplicationEventMetadata | null;
  created_at: string;
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
        const res = await fetch(
          `${API_BASE}/job-applications/${encodeURIComponent(id)}/events`,
          { headers },
        );
        if (!res.ok) {
          if (mountedRef.current) setError(`Failed to load events (${res.status})`);
          return [];
        }
        const body = (await res.json()) as { events?: ApplicationEvent[] };
        const list = Array.isArray(body.events) ? body.events : [];
        if (mountedRef.current) setEvents(list);
        return list;
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load events');
        }
        return [];
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
            headers: { ...headers, 'Content-Type': 'application/json' },
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
    (input: {
      applicationId: string;
      resumeSessionId?: string;
      coverLetterSessionId?: string;
      appliedVia?: AppliedVia;
    }) =>
      recordEvent({
        applicationId: input.applicationId,
        metadata: {
          type: 'applied',
          resume_session_id: input.resumeSessionId,
          cover_letter_session_id: input.coverLetterSessionId,
          applied_via: input.appliedVia ?? 'manual',
        },
      }),
    [recordEvent],
  );

  const recordInterviewHappened = useCallback(
    (input: {
      applicationId: string;
      interviewDate: string;
      interviewType: InterviewType;
      interviewerNames?: string[];
      occurredAt?: string;
    }) =>
      recordEvent({
        applicationId: input.applicationId,
        occurredAt: input.occurredAt,
        metadata: {
          type: 'interview_happened',
          interview_date: input.interviewDate,
          interview_type: input.interviewType,
          interviewer_names: input.interviewerNames,
        },
      }),
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
    [recordEvent],
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
    hasEvent,
    latestEvent,
  };
}
