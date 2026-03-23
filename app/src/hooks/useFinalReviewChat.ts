/**
 * useFinalReviewChat — Per-concern conversational coaching for Final Review
 *
 * Mirrors the gap coaching thread model, but each thread is keyed by
 * final-review concern id instead of requirement text.
 */

import { useCallback, useReducer, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import type { CoachingThreadSnapshot, FinalReviewChatContext, GapChatMessage } from '@/types/resume-v2';
import { MAX_TURNS } from './useGapChat';

interface FinalReviewChatItemState {
  messages: GapChatMessage[];
  isLoading: boolean;
  resolvedLanguage: string | null;
  error: string | null;
}

interface FinalReviewChatState {
  items: Record<string, FinalReviewChatItemState>;
  generation: number;
}

type FinalReviewChatAction =
  | { type: 'SEND_START'; concernId: string; userMessage: string }
  | { type: 'SEND_SUCCESS'; concernId: string; message: GapChatMessage; generation: number }
  | { type: 'SEND_ERROR'; concernId: string; error: string; generation: number; rollbackMessage?: string }
  | { type: 'RESOLVE'; concernId: string; language: string }
  | { type: 'CLEAR_RESOLUTION'; concernId: string }
  | { type: 'HYDRATE'; snapshot: CoachingThreadSnapshot | null }
  | { type: 'RESET' };

function normalizeKey(concernId: string): string {
  return concernId.trim().toLowerCase();
}

function getOrCreate(state: FinalReviewChatState, key: string): FinalReviewChatItemState {
  return state.items[key] ?? { messages: [], isLoading: false, resolvedLanguage: null, error: null };
}

function reducer(state: FinalReviewChatState, action: FinalReviewChatAction): FinalReviewChatState {
  switch (action.type) {
    case 'SEND_START': {
      const key = normalizeKey(action.concernId);
      const item = getOrCreate(state, key);
      return {
        ...state,
        items: {
          ...state.items,
          [key]: {
            ...item,
            messages: [...item.messages, { role: 'user', content: action.userMessage, candidateInputUsed: true }],
            isLoading: true,
            error: null,
          },
        },
      };
    }
    case 'SEND_SUCCESS': {
      if (action.generation !== state.generation) return state;
      const key = normalizeKey(action.concernId);
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
      if (action.generation !== state.generation) return state;
      const key = normalizeKey(action.concernId);
      const item = getOrCreate(state, key);
      const rolledBackMessages = action.rollbackMessage
        ? item.messages.filter((message, index) => !(message.role === 'user' && message.content === action.rollbackMessage && index === item.messages.length - 1))
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
      const key = normalizeKey(action.concernId);
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
      const key = normalizeKey(action.concernId);
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

export function useFinalReviewChat(accessToken: string | null, sessionId: string) {
  const [state, dispatch] = useReducer(reducer, { items: {}, generation: 0 });

  const stateRef = useRef(state);
  stateRef.current = state;

  const abortRef = useRef<AbortController | null>(null);
  const sendingKeysRef = useRef(new Set<string>());

  const getItemState = useCallback((concernId: string): FinalReviewChatItemState | undefined => {
    return stateRef.current.items[normalizeKey(concernId)];
  }, []);

  const sendMessage = useCallback(async (
    concernId: string,
    message: string,
    context: FinalReviewChatContext,
  ) => {
    if (!accessToken || !sessionId) return;

    const key = normalizeKey(concernId);
    if (sendingKeysRef.current.has(key)) return;

    const currentItems = stateRef.current.items;
    const item = currentItems[key];
    const userTurns = (item?.messages.filter(chatMessage => chatMessage.role === 'user').length ?? 0) + 1;
    if (userTurns > MAX_TURNS) return;

    sendingKeysRef.current.add(key);
    const generation = stateRef.current.generation;
    dispatch({ type: 'SEND_START', concernId, userMessage: message });

    const existingMessages = item?.messages ?? [];
    const apiMessages = [
      ...existingMessages.map(chatMessage => ({ role: chatMessage.role, content: chatMessage.content })),
      { role: 'user' as const, content: message },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/final-review-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          concern_id: concernId,
          messages: apiMessages,
          context: {
            concern_type: context.concernType,
            severity: context.severity,
            observation: context.observation,
            why_it_hurts: context.whyItHurts,
            fix_strategy: context.fixStrategy,
            requires_candidate_input: context.requiresCandidateInput,
            clarifying_question: context.clarifyingQuestion,
            target_section: context.targetSection,
            related_requirement: context.relatedRequirement,
            suggested_resume_edit: context.suggestedResumeEdit,
            role_title: context.roleTitle,
            company_name: context.companyName,
            job_description_fit: context.jobDescriptionFit,
            benchmark_alignment: context.benchmarkAlignment,
            business_impact: context.businessImpact,
            clarity_and_credibility: context.clarityAndCredibility,
            resume_excerpt: context.resumeExcerpt,
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
      };

      dispatch({
        type: 'SEND_SUCCESS',
        concernId,
        generation,
        message: {
          role: 'assistant',
          content: result.response,
          suggestedLanguage: result.suggested_resume_language,
          followUpQuestion: result.follow_up_question,
          currentQuestion: result.current_question,
          needsCandidateInput: result.needs_candidate_input,
          recommendedNextAction: result.recommended_next_action,
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;

      dispatch({
        type: 'SEND_ERROR',
        concernId,
        generation,
        error: error instanceof Error ? error.message : 'Chat failed',
        rollbackMessage: message,
      });
    } finally {
      sendingKeysRef.current.delete(key);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [accessToken, sessionId]);

  const acceptLanguage = useCallback((concernId: string, language: string) => {
    dispatch({ type: 'RESOLVE', concernId, language });
  }, []);

  const clearResolvedLanguage = useCallback((concernId: string) => {
    dispatch({ type: 'CLEAR_RESOLUTION', concernId });
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
    abortRef.current?.abort();
    abortRef.current = null;
    sendingKeysRef.current.clear();
    dispatch({ type: 'RESET' });
  }, []);

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

export type FinalReviewChatHook = ReturnType<typeof useFinalReviewChat>;
