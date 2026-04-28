/**
 * useThankYouNote — Phase 2.3e.
 *
 * Multi-recipient thank-you note hook with recipient-role primary axis,
 * per-recipient independent refinement, soft interview-prep coupling,
 * and timing awareness. Mirrors the SSE peer-tool pattern from
 * useInterviewPrep / useFollowUpEmail.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEStream } from '@/lib/sse-parser';
import { API_BASE } from '@/lib/api';
import { createProductSession } from '@/lib/create-product-session';
import { safeString, safeNumber } from '@/lib/safe-cast';

import type { ActivityMessage } from '@/types/activity';

export type { ActivityMessage };

export type ThankYouNoteStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'note_review'
  | 'complete'
  | 'error';

export type NoteFormat = 'email' | 'handwritten' | 'linkedin_message';

export type RecipientRole =
  | 'hiring_manager'
  | 'recruiter'
  | 'panel_interviewer'
  | 'executive_sponsor'
  | 'other';

export interface RecipientInput {
  role: RecipientRole;
  name: string;
  title?: string;
  topics_discussed?: string[];
  rapport_notes?: string;
  key_questions?: string[];
}

export interface ThankYouNote {
  recipient_role: RecipientRole;
  recipient_name: string;
  recipient_title: string;
  format: NoteFormat;
  content: string;
  subject_line?: string;
  personalization_notes: string;
  quality_score?: number;
}

export interface TimingWarning {
  days_since_interview: number;
  message: string;
}

export interface NoteReviewData {
  notes: ThankYouNote[];
  quality_score: number;
}

export interface ThankYouNoteInput {
  applicationId: string;
  resumeText: string;
  company: string;
  role: string;
  recipients: RecipientInput[];
  interviewDate?: string;
  interviewType?: string;
  sourceSessionId?: string;
}

/** Collection-level gate response. */
export type CollectionGateResponse =
  | true
  | 'approved'
  | { feedback: string }
  | { edited_content: string };

/** Per-recipient gate response. */
export type PerRecipientGateResponse =
  | { recipient_index: number; feedback: string }
  | { recipient_index: number; edited_subject?: string; edited_body?: string };

interface ThankYouNoteHookState {
  status: ThankYouNoteStatus;
  report: string | null;
  qualityScore: number | null;
  activityMessages: ActivityMessage[];
  error: string | null;
  currentStage: string | null;
  noteReviewData: NoteReviewData | null;
  timingWarning: TimingWarning | null;
  pendingGate: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_ACTIVITY_MESSAGES = 50;

function parseRecordFromString(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function normalizeNotePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const nestedContent = parseRecordFromString(raw.content);
  if (!nestedContent) return raw;

  return {
    ...raw,
    ...Object.fromEntries(
      Object.entries(nestedContent).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ),
    content: nestedContent.content ?? raw.content,
    subject_line: nestedContent.subject_line ?? raw.subject_line,
    personalization_notes: nestedContent.personalization_notes ?? raw.personalization_notes,
    quality_score: nestedContent.quality_score ?? raw.quality_score,
  };
}

function normalizeNote(raw: unknown): ThankYouNote | null {
  const parsedRaw = parseRecordFromString(raw);
  if (!parsedRaw && (!raw || typeof raw !== 'object')) return null;
  const r = normalizeNotePayload(parsedRaw ?? (raw as Record<string, unknown>));
  const format = safeString(r.format, 'email') as NoteFormat;
  const role = safeString(r.recipient_role, 'other') as RecipientRole;
  return {
    recipient_role: role,
    recipient_name: safeString(r.recipient_name),
    recipient_title: safeString(r.recipient_title),
    format,
    content: safeString(r.content).trim(),
    subject_line: typeof r.subject_line === 'string' ? r.subject_line : undefined,
    personalization_notes: safeString(r.personalization_notes),
    quality_score:
      typeof r.quality_score === 'number' ? r.quality_score : undefined,
  };
}

function normalizeReviewNotes(value: unknown): ThankYouNote[] {
  if (!Array.isArray(value)) return [];
  const notes: ThankYouNote[] = [];
  for (const raw of value) {
    const note = normalizeNote(raw);
    if (note) notes.push(note);
  }
  return notes;
}

function normalizeGateName(value: unknown): 'note_review' | null {
  return value === 'note_review' ? 'note_review' : null;
}

export function useThankYouNote() {
  const [state, setState] = useState<ThankYouNoteHookState>({
    status: 'idle',
    report: null,
    qualityScore: null,
    activityMessages: [],
    error: null,
    currentStage: null,
    noteReviewData: null,
    timingWarning: null,
    pendingGate: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  const addActivity = useCallback((text: string, stage: string) => {
    if (!mountedRef.current) return;
    setState((prev) => ({
      ...prev,
      activityMessages: [
        ...prev.activityMessages.slice(-(MAX_ACTIVITY_MESSAGES - 1)),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          message: text,
          stage,
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  const handleSSEEvent = useCallback(
    (eventType: string, rawData: string) => {
      if (!mountedRef.current) return;

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (eventType) {
        case 'stage_start':
          setState((prev) => ({ ...prev, currentStage: safeString(data.stage) }));
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'stage_complete':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'transparency':
          addActivity(safeString(data.message), safeString(data.stage));
          break;

        case 'thank_you_timing_warning': {
          const days = safeNumber(data.days_since_interview);
          const message = safeString(data.message);
          if (days > 0 && message) {
            setState((prev) => ({ ...prev, timingWarning: { days_since_interview: days, message } }));
            addActivity(`Timing note: ${message}`, 'timing');
          }
          break;
        }

        case 'note_drafted': {
          const recipient = safeString(data.recipient_name);
          const format = safeString(data.format);
          addActivity(`Drafted ${format} note for ${recipient}`, 'drafting');
          break;
        }

        case 'note_complete': {
          const recipient = safeString(data.recipient_name);
          const qualityScore = safeNumber(data.quality_score);
          addActivity(`Quality checked note for ${recipient} — score: ${qualityScore}`, 'quality');
          break;
        }

        case 'note_review_ready': {
          setState((prev) => ({
            ...prev,
            noteReviewData: {
              notes: normalizeReviewNotes(data.notes),
              quality_score: safeNumber(data.quality_score),
            },
          }));
          break;
        }

        case 'pipeline_gate': {
          const gateName = normalizeGateName(data.gate);
          if (gateName === 'note_review') {
            setState((prev) => ({ ...prev, status: 'note_review', pendingGate: gateName }));
          }
          break;
        }

        case 'collection_complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            report: safeString(data.report) || prev.report,
            qualityScore:
              data.quality_score == null ? prev.qualityScore : safeNumber(data.quality_score, prev.qualityScore ?? 0),
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: safeString(data.error, 'Pipeline error'),
          }));
          abortRef.current?.abort();
          break;

        case 'pipeline_complete':
          setState((prev) => ({
            ...prev,
            status: prev.report ? 'complete' : prev.status,
          }));
          abortRef.current?.abort();
          break;

        case 'heartbeat':
          break;

        default:
          break;
      }
    },
    [addActivity],
  );

  const connectSSE = useCallback(
    (sessionId: string) => {
      const token = accessTokenRef.current;
      if (!token) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, status: 'connecting' }));

      fetch(`${API_BASE}/thank-you-note/${sessionId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            if (mountedRef.current) {
              setState((prev) => ({
                ...prev,
                status: 'error',
                error: `Connection failed (${response.status})`,
              }));
            }
            return;
          }

          if (mountedRef.current) {
            setState((prev) => ({ ...prev, status: 'running' }));
            reconnectAttemptsRef.current = 0;
          }

          try {
            for await (const msg of parseSSEStream(response.body)) {
              if (controller.signal.aborted) break;
              handleSSEEvent(msg.event, msg.data);
            }
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            console.error('[useThankYouNote] SSE stream error:', err);
          }

          if (!controller.signal.aborted && mountedRef.current) {
            setState((prev) => {
              if (prev.status === 'complete' || prev.status === 'error') return prev;
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
                reconnectAttemptsRef.current += 1;
                reconnectTimerRef.current = setTimeout(() => {
                  if (mountedRef.current && sessionIdRef.current) {
                    connectSSE(sessionIdRef.current);
                  }
                }, delay);
                return prev;
              }
              return { ...prev, status: 'error', error: 'Connection lost' };
            });
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[useThankYouNote] SSE fetch error:', err);
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: 'Failed to connect',
            }));
          }
        });
    },
    [handleSSEEvent],
  );

  const startPipeline = useCallback(
    async (input: ThankYouNoteInput): Promise<boolean> => {
      if (statusRef.current !== 'idle') return false;

      setState({
        status: 'connecting',
        report: null,
        qualityScore: null,
        activityMessages: [],
        error: null,
        currentStage: null,
        noteReviewData: null,
        timingWarning: null,
        pendingGate: null,
      });

      try {
        const { accessToken, session } = await createProductSession({
          productType: 'thank_you_note',
          jobApplicationId: input.applicationId,
        });
        accessTokenRef.current = accessToken;
        sessionIdRef.current = session.id;
        reconnectAttemptsRef.current = 0;

        const res = await fetch(`${API_BASE}/thank-you-note/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            session_id: session.id,
            job_application_id: input.applicationId,
            resume_text: input.resumeText,
            company: input.company,
            role: input.role,
            interview_date: input.interviewDate,
            interview_type: input.interviewType,
            source_session_id: input.sourceSessionId,
            recipients: input.recipients,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: `Failed to start (${res.status}): ${body}`,
          }));
          return false;
        }

        connectSSE(session.id);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, status: 'error', error: message }));
        return false;
      }
    },
    [connectSSE],
  );

  const respondToGate = useCallback(
    async (
      gate: string,
      response: CollectionGateResponse | PerRecipientGateResponse,
    ): Promise<boolean> => {
      const sessionId = sessionIdRef.current;
      const token = accessTokenRef.current;
      if (!sessionId || !token) return false;

      try {
        const res = await fetch(`${API_BASE}/thank-you-note/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId, gate, response }),
        });
        if (!res.ok) {
          console.error('[useThankYouNote] Gate respond failed:', res.status);
          return false;
        }
        // Only collection-level approve/revise/direct-edit or per-recipient
        // revise transitions back to 'running' (a rerun is coming). A
        // per-recipient direct-edit mutates state server-side without a
        // rerun, so the gate stays open; the UI decides when to approve.
        const triggersRerun =
          response === true
          || response === 'approved'
          || (typeof response === 'object' && 'feedback' in response && typeof response.feedback === 'string')
          || (typeof response === 'object' && 'edited_content' in response);
        if (triggersRerun) {
          setState((prev) => ({ ...prev, status: 'running', pendingGate: null }));
        }
        return true;
      } catch (err) {
        console.error('[useThankYouNote] Gate respond error:', err);
        return false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sessionIdRef.current = null;
    accessTokenRef.current = null;
    reconnectAttemptsRef.current = 0;
    setState({
      status: 'idle',
      report: null,
      qualityScore: null,
      activityMessages: [],
      error: null,
      currentStage: null,
      noteReviewData: null,
      timingWarning: null,
      pendingGate: null,
    });
  }, []);

  return {
    ...state,
    startPipeline,
    respondToGate,
    reset,
  };
}
