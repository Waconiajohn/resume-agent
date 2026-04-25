/**
 * useApplicationTimeline — Phase 3 of the pursuit timeline.
 *
 * Single round-trip fetch that returns everything the workspace overview
 * needs: Done artifacts inventory, all events, networking signals, and
 * the company's referral-bonus signal. The hook composes these with the
 * pure rule engine in `lib/timeline/rules` to derive the Next region and
 * the Their-turn region.
 *
 * Done items are derived directly from the payload (lifecycle ordering
 * happens in the component). Next/Their-turn rules run client-side from
 * the same payload — keeps the contract simple and the rule edits hot.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import {
  computeTimelineRules,
  type ApplicationCore,
  type ArtifactSignal,
  type ReferralBonusSignal,
  type TimelineEvent,
  type TimelinePayload,
  type NextItem,
  type TheirTurnItem,
} from '@/lib/timeline/rules';
import type { ApplicationWorkspaceTool } from '@/lib/app-routing';

const LOCAL_EVENTS_PREFIX = 'career-iq:application-events:';

function localEventsKey(applicationId: string): string {
  return `${LOCAL_EVENTS_PREFIX}${applicationId}`;
}

function readLocalTimelineEvents(applicationId: string): TimelineEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localEventsKey(applicationId)) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is TimelineEvent & { job_application_id?: string } => {
        if (!value || typeof value !== 'object') return false;
        const event = value as Record<string, unknown>;
        return (
          typeof event.id === 'string'
          && typeof event.type === 'string'
          && typeof event.occurred_at === 'string'
          && (event.metadata === null || typeof event.metadata === 'object')
          && event.job_application_id === applicationId
        );
      })
      .map((event) => ({
        id: event.id,
        type: event.type,
        occurred_at: event.occurred_at,
        metadata: event.metadata,
      }));
  } catch {
    return [];
  }
}

function withLocalTimelineEvents(payload: TimelinePayload, applicationId: string): TimelinePayload {
  const localEvents = readLocalTimelineEvents(applicationId);
  if (localEvents.length === 0) return payload;
  const seen = new Set<string>();
  const events = [...localEvents, ...payload.events]
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  return { ...payload, events };
}

// ─── Done item shape (derived from payload) ───────────────────────────

export type DoneItemId =
  | 'resume_tailored'
  | 'cover_letter_drafted'
  | 'applied'
  | 'networking_messages'
  | 'interview_scheduled'
  | 'interview_prep'
  | 'interview_happened'
  | 'thank_you_sent'
  | 'follow_up_sent'
  | 'offer_received';

export interface DoneItem {
  id: DoneItemId;
  title: string;
  /** Display timestamp. May be the artifact's last_at or an event's occurred_at. */
  occurredAt: string;
  /** Where to navigate when the user clicks. */
  target: ApplicationWorkspaceTool;
  /** Extra context for the card body. */
  detail?: string;
}

// Lifecycle order — when multiple Done items exist, render in this fixed
// order regardless of chronology. Mirrors the spec's "Done region — lifecycle
// order" list.
const DONE_LIFECYCLE_ORDER: DoneItemId[] = [
  'resume_tailored',
  'cover_letter_drafted',
  'applied',
  'networking_messages',
  'interview_scheduled',
  'interview_prep',
  'interview_happened',
  'thank_you_sent',
  'follow_up_sent',
  'offer_received',
];

function deriveDoneItems(payload: TimelinePayload): DoneItem[] {
  const items: Partial<Record<DoneItemId, DoneItem>> = {};

  if (payload.resume.exists && payload.resume.last_at) {
    items.resume_tailored = {
      id: 'resume_tailored',
      title: 'Resume tailored',
      occurredAt: payload.resume.last_at,
      target: 'resume',
    };
  }
  if (payload.cover_letter.exists && payload.cover_letter.last_at) {
    items.cover_letter_drafted = {
      id: 'cover_letter_drafted',
      title: 'Cover letter drafted',
      occurredAt: payload.cover_letter.last_at,
      target: 'cover-letter',
    };
  }

  const appliedEvent = payload.events.find((e) => e.type === 'applied')
    ?? (payload.application.applied_date
      ? {
          id: 'applied-date',
          type: 'applied' as const,
          occurred_at: payload.application.applied_date,
          metadata: { type: 'applied', applied_via: 'manual' },
        }
      : undefined);
  if (appliedEvent) {
    items.applied = {
      id: 'applied',
      title: 'Applied',
      occurredAt: appliedEvent.occurred_at,
      target: 'resume',
    };
  }

  if (payload.networking_messages.count > 0 && payload.networking_messages.last_at) {
    const count = payload.networking_messages.count;
    items.networking_messages = {
      id: 'networking_messages',
      title: `Networking messages (${count})`,
      occurredAt: payload.networking_messages.last_at,
      target: 'networking',
      detail: count === 1 ? '1 message sent' : `${count} messages sent`,
    };
  }

  // For interview_scheduled, expose only the latest scheduled date —
  // multi-round interviews are real but the Done card surfaces one row.
  const scheduled = payload.events
    .filter((e): e is TimelineEvent => e.type === 'interview_scheduled')
    .map((e) => {
      const meta = (e.metadata as Record<string, unknown> | null) ?? {};
      const sd = typeof meta.scheduled_date === 'string' ? meta.scheduled_date : null;
      return { event: e, sd };
    })
    .filter((row) => !!row.sd)
    .sort((a, b) => Date.parse(b.sd!) - Date.parse(a.sd!));
  if (scheduled[0]) {
    const sd = scheduled[0].sd!;
    items.interview_scheduled = {
      id: 'interview_scheduled',
      title: 'Interview scheduled',
      occurredAt: scheduled[0].event.occurred_at,
      target: 'interview-prep',
      detail: new Date(sd).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
  }

  if (payload.interview_prep.exists && payload.interview_prep.last_at) {
    items.interview_prep = {
      id: 'interview_prep',
      title: 'Interview prep brief',
      occurredAt: payload.interview_prep.last_at,
      target: 'interview-prep',
    };
  }

  const interviewHappenedEvent = payload.events.find((e) => e.type === 'interview_happened');
  if (interviewHappenedEvent) {
    items.interview_happened = {
      id: 'interview_happened',
      title: 'Interview happened',
      occurredAt: interviewHappenedEvent.occurred_at,
      target: 'thank-you-note',
    };
  }

  if (payload.thank_you.exists && payload.thank_you.last_at) {
    items.thank_you_sent = {
      id: 'thank_you_sent',
      title: 'Thank-you sent',
      occurredAt: payload.thank_you.last_at,
      target: 'thank-you-note',
    };
  }

  if (payload.follow_up.exists && payload.follow_up.last_at) {
    items.follow_up_sent = {
      id: 'follow_up_sent',
      title: 'Follow-up sent',
      occurredAt: payload.follow_up.last_at,
      target: 'follow-up-email',
    };
  }

  const offerEvent = payload.events.find((e) => e.type === 'offer_received');
  if (offerEvent) {
    items.offer_received = {
      id: 'offer_received',
      title: 'Offer received',
      occurredAt: offerEvent.occurred_at,
      target: 'offer-negotiation',
    };
  }

  return DONE_LIFECYCLE_ORDER
    .map((id) => items[id])
    .filter((item): item is DoneItem => !!item);
}

// ─── Hook ─────────────────────────────────────────────────────────────

interface UseApplicationTimelineOptions {
  applicationId?: string | null;
  /** Skip the initial fetch — caller will trigger refresh manually. */
  skip?: boolean;
}

export interface UseApplicationTimelineResult {
  payload: TimelinePayload | null;
  done: DoneItem[];
  next: NextItem[];
  theirTurn: TheirTurnItem[];
  hasAnyDone: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useApplicationTimeline(
  options: UseApplicationTimelineOptions = {},
): UseApplicationTimelineResult {
  const { applicationId, skip } = options;
  const [payload, setPayload] = useState<TimelinePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchTimeline = useCallback(async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      if (mountedRef.current) setError('Not authenticated');
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await fetch(
        `${API_BASE}/job-applications/${encodeURIComponent(id)}/timeline`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        if (mountedRef.current) {
          setError(`Failed to load timeline (${res.status})`);
          setPayload(null);
        }
        return;
      }
      const body = (await res.json()) as TimelinePayload;
      if (mountedRef.current) setPayload(withLocalTimelineEvents(body, id));
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load timeline');
        setPayload(null);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Auto-fetch when applicationId changes.
  useEffect(() => {
    if (skip || !applicationId) return;
    void fetchTimeline(applicationId);
  }, [applicationId, skip, fetchTimeline]);

  const refresh = useCallback(async () => {
    if (!applicationId) return;
    await fetchTimeline(applicationId);
  }, [applicationId, fetchTimeline]);

  const { done, next, theirTurn, hasAnyDone } = useMemo(() => {
    if (!payload) {
      return { done: [], next: [], theirTurn: [], hasAnyDone: false };
    }
    const doneItems = deriveDoneItems(payload);
    const rules = computeTimelineRules(payload);
    return {
      done: doneItems,
      next: rules.next,
      theirTurn: rules.theirTurn,
      hasAnyDone: doneItems.length > 0,
    };
  }, [payload]);

  return {
    payload,
    done,
    next,
    theirTurn,
    hasAnyDone,
    loading,
    error,
    refresh,
  };
}

export type { TimelinePayload, NextItem, TheirTurnItem, ApplicationCore, ArtifactSignal, ReferralBonusSignal, TimelineEvent };
