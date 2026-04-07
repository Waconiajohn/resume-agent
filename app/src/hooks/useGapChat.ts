/**
 * useGapChat — Per-item conversational coaching for gap analysis
 *
 * Manages independent chat histories per gap requirement.
 * Each item has its own conversation that persists across navigation.
 * Chat state lives in component memory — not persisted to DB.
 *
 * Hardened against: stale closures, ghost conversations after reset,
 * unmount leaks, and rapid double-sends.
 */

import { useCallback, useReducer, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import type { CoachingThreadSnapshot, GapChatMessage, GapChatContext } from '@/types/resume-v2';

export const MAX_TURNS = 10;

interface GapItemChatState {
  messages: GapChatMessage[];
  isLoading: boolean;
  /** The language the user has accepted for "Add to Resume" */
  resolvedLanguage: string | null;
  error: string | null;
}

interface GapChatState {
  /** Keyed by normalized requirement string */
  items: Record<string, GapItemChatState>;
  /** Incremented on RESET — stale async responses are dropped */
  generation: number;
}

type GapChatAction =
  | { type: 'SEND_START'; requirement: string; userMessage: string }
  | { type: 'SEND_SUCCESS'; requirement: string; message: GapChatMessage; generation: number }
  | { type: 'SEND_ERROR'; requirement: string; error: string; generation: number; rollbackMessage?: string }
  | { type: 'RESOLVE'; requirement: string; language: string }
  | { type: 'CLEAR_RESOLUTION'; requirement: string }
  | { type: 'HYDRATE'; snapshot: CoachingThreadSnapshot | null }
  | { type: 'RESET' };

function normalizeKey(requirement: string): string {
  return requirement.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
}

function getOrCreate(state: GapChatState, key: string): GapItemChatState {
  return state.items[key] ?? { messages: [], isLoading: false, resolvedLanguage: null, error: null };
}

function reducer(state: GapChatState, action: GapChatAction): GapChatState {
  switch (action.type) {
    case 'SEND_START': {
      const key = normalizeKey(action.requirement);
      const item = getOrCreate(state, key);
      return {
        ...state,
        items: {
          ...state.items,
          [key]: {
            ...item,
            messages: [...item.messages, { role: 'user', content: action.userMessage }],
            isLoading: true,
            error: null,
          },
        },
      };
    }
    case 'SEND_SUCCESS': {
      // Drop if from a stale generation (reset happened while in-flight)
      if (action.generation !== state.generation) return state;
      const key = normalizeKey(action.requirement);
      const item = getOrCreate(state, key);
      return {
        ...state,
        items: {
          ...state.items,
          [key]: {
            ...item,
            messages: [...item.messages, action.message],
            isLoading: false,
          },
        },
      };
    }
    case 'SEND_ERROR': {
      // Drop if from a stale generation
      if (action.generation !== state.generation) return state;
      const key = normalizeKey(action.requirement);
      const item = getOrCreate(state, key);
      // Roll back the optimistic user message so it's not stranded
      const rolledBackMessages = action.rollbackMessage
        ? item.messages.filter((m, i) => !(m.role === 'user' && m.content === action.rollbackMessage && i === item.messages.length - 1))
        : item.messages;
      return {
        ...state,
        items: {
          ...state.items,
          [key]: {
            ...item,
            messages: rolledBackMessages,
            isLoading: false,
            error: action.error,
          },
        },
      };
    }
    case 'RESOLVE': {
      const key = normalizeKey(action.requirement);
      const item = getOrCreate(state, key);
      return {
        ...state,
        items: {
          ...state.items,
          [key]: {
            ...item,
            resolvedLanguage: action.language,
          },
        },
      };
    }
    case 'CLEAR_RESOLUTION': {
      const key = normalizeKey(action.requirement);
      const item = getOrCreate(state, key);
      return {
        ...state,
        items: {
          ...state.items,
          [key]: {
            ...item,
            resolvedLanguage: null,
          },
        },
      };
    }
    case 'HYDRATE': {
      const hydratedItems = Object.fromEntries(
        Object.entries(action.snapshot?.items ?? {}).map(([key, item]) => [
          key,
          {
            messages: item.messages ?? [],
            isLoading: false,
            resolvedLanguage: item.resolvedLanguage ?? null,
            error: item.error ?? null,
          },
        ]),
      );
      return {
        ...state,
        items: hydratedItems,
      };
    }
    case 'RESET':
      return { items: {}, generation: state.generation + 1 };
    default:
      return state;
  }
}

export function useGapChat(accessToken: string | null, sessionId: string) {
  const [state, dispatch] = useReducer(reducer, { items: {}, generation: 0 });

  // Refs for reading current state without stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // AbortController for in-flight requests — aborted on reset
  const abortRef = useRef<AbortController | null>(null);

  // Per-key send guard to prevent rapid double-sends
  const sendingKeysRef = useRef(new Set<string>());

  // Stable getItemState — reads from ref, no dependency on state.items
  const getItemState = useCallback((requirement: string): GapItemChatState | undefined => {
    return stateRef.current.items[normalizeKey(requirement)];
  }, []);

  const sendMessage = useCallback(async (
    requirement: string,
    message: string,
    context: GapChatContext,
    classification: 'partial' | 'missing' | 'strong',
  ) => {
    if (!accessToken || !sessionId) return;

    const key = normalizeKey(requirement);

    // Prevent concurrent sends for the same item
    if (sendingKeysRef.current.has(key)) return;

    // Read current state from ref (not stale closure)
    const currentItems = stateRef.current.items;
    const item = currentItems[key];

    // Enforce turn cap using current state
    const userTurns = (item?.messages.filter(m => m.role === 'user').length ?? 0) + 1;
    if (userTurns > MAX_TURNS) return;

    sendingKeysRef.current.add(key);
    const generation = stateRef.current.generation;

    dispatch({ type: 'SEND_START', requirement, userMessage: message });

    // Build conversation history from current state (before dispatch mutated it)
    const existingMessages = item?.messages ?? [];
    const apiMessages = [
      ...existingMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];

    // Create abort controller for this request
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/line-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          mode: classification === 'strong' ? 'rewrite' : 'clarify',
          item_id: requirement,
          messages: apiMessages,
          context: {
            work_item_id: context.workItemId,
            requirement,
            classification,
            requirement_source: context.requirementSource,
            evidence: context.evidence,
            current_strategy: context.currentStrategy,
            ai_reasoning: context.aiReasoning,
            inferred_metric: context.inferredMetric,
            job_description_excerpt: context.jobDescriptionExcerpt,
            candidate_experience_summary: context.candidateExperienceSummary,
            coaching_policy: context.coachingPolicy,
            source_evidence: context.sourceEvidence,
            line_text: context.lineText,
            line_kind: context.lineKind,
            section_key: context.sectionKey,
            section_label: context.sectionLabel,
            related_requirements: context.relatedRequirements,
            coaching_goal: context.coachingGoal,
            clarifying_questions: context.clarifyingQuestions,
            prior_clarifications: context.priorClarifications?.map((entry) => ({
              topic: entry.topic,
              user_input: entry.userInput,
              suggested_language: entry.suggestedLanguage,
              applied_language: entry.appliedLanguage,
              primary_family: entry.primaryFamily,
              families: entry.families,
            })),
            related_line_candidates: context.relatedLineCandidates?.map((candidate) => ({
              id: candidate.id,
              section: candidate.section,
              index: candidate.index,
              line_text: candidate.lineText,
              line_kind: candidate.lineKind,
              label: candidate.label,
              requirements: candidate.requirements,
              evidence_found: candidate.evidenceFound,
              work_item_id: candidate.workItemId,
            })),
          },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Chat failed: ${response.status}`);
      }

      const result = await response.json() as {
        response: string;
        suggested_resume_language?: string;
        follow_up_question?: string;
        current_question?: string;
        needs_candidate_input?: boolean;
        recommended_next_action?: GapChatMessage['recommendedNextAction'];
        related_line_suggestions?: GapChatMessage['relatedLineSuggestions'];
      };

      dispatch({
        type: 'SEND_SUCCESS',
        requirement,
        generation,
        message: {
          role: 'assistant',
          content: result.response,
          suggestedLanguage: result.suggested_resume_language,
          followUpQuestion: result.follow_up_question,
          currentQuestion: result.current_question,
          needsCandidateInput: result.needs_candidate_input,
          recommendedNextAction: result.recommended_next_action,
          relatedLineSuggestions: result.related_line_suggestions,
        },
      });
    } catch (err) {
      // Don't dispatch error for aborted requests
      if (err instanceof DOMException && err.name === 'AbortError') return;

      dispatch({
        type: 'SEND_ERROR',
        requirement,
        generation,
        error: err instanceof Error ? err.message : 'Chat failed',
        rollbackMessage: message,
      });
    } finally {
      sendingKeysRef.current.delete(key);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [accessToken, sessionId]);

  const acceptLanguage = useCallback((requirement: string, language: string) => {
    dispatch({ type: 'RESOLVE', requirement, language });
  }, []);

  const clearResolvedLanguage = useCallback((requirement: string) => {
    dispatch({ type: 'CLEAR_RESOLUTION', requirement });
  }, []);

  const hydrateSnapshot = useCallback((snapshot: CoachingThreadSnapshot | null) => {
    dispatch({ type: 'HYDRATE', snapshot });
  }, []);

  const getSnapshot = useCallback((): CoachingThreadSnapshot => {
    const items = Object.fromEntries(
      Object.entries(stateRef.current.items).map(([key, item]) => [
        key,
        {
          messages: item.messages,
          resolvedLanguage: item.resolvedLanguage,
          error: item.error,
        },
      ]),
    );

    return { items };
  }, []);

  const resetChat = useCallback(() => {
    // Abort any in-flight requests before resetting
    abortRef.current?.abort();
    abortRef.current = null;
    sendingKeysRef.current.clear();
    dispatch({ type: 'RESET' });
  }, []);

  // Compute summary stats
  const resolvedCount = Object.values(state.items).filter(item => item.resolvedLanguage !== null).length;
  const isAnyLoading = Object.values(state.items).some(item => item.isLoading);

  return {
    getItemState,
    sendMessage,
    acceptLanguage,
    clearResolvedLanguage,
    getSnapshot,
    hydrateSnapshot,
    resetChat,
    resolvedCount,
    isAnyLoading,
  };
}

export type GapChatHook = ReturnType<typeof useGapChat>;
