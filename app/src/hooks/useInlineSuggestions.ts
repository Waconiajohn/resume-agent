/**
 * useInlineSuggestions — State management for the inline suggestion system
 *
 * Manages suggestion lifecycle (pending → accepted/rejected/undone),
 * scroll-to-next behavior, and SSE event integration.
 */

import { useState, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { InlineSuggestion } from '@/lib/compute-inline-diffs';

// ─── Hook return shape ────────────────────────────────────────────────────────

export interface InlineSuggestionsHook {
  suggestions: InlineSuggestion[];
  pendingCount: number;
  reviewedCount: number;
  nextPending: InlineSuggestion | undefined;
  allResolved: boolean;
  processingStatus: string | null;
  containerRef: RefObject<HTMLDivElement | null>;
  currentSuggestionIndex: number;
  setCurrentSuggestionIndex: (index: number) => void;
  accept: (id: string, editedText?: string) => void;
  reject: (id: string) => void;
  undo: (id: string) => void;
  scrollToNext: () => void;
  handleSuggestionEvent: (data: { suggestions: InlineSuggestion[] }) => void;
  handleProcessingStatus: (status: string) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useInlineSuggestions(): InlineSuggestionsHook {
  const [suggestions, setSuggestions] = useState<InlineSuggestion[]>([]);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────

  const pendingCount = suggestions.filter((s) => s.status === 'pending').length;
  const reviewedCount = suggestions.filter((s) => s.status !== 'pending').length;
  const nextPending = suggestions.find((s) => s.status === 'pending');
  const allResolved = suggestions.length > 0 && pendingCount === 0;

  // ── Status updater helper ─────────────────────────────────────────────────

  const updateStatus = useCallback(
    (id: string, status: InlineSuggestion['status']) => {
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s)),
      );
    },
    [],
  );

  // ── Auto-advance to next pending suggestion ───────────────────────────────

  const advanceToNext = useCallback(
    (afterIndex: number, updatedSuggestions: InlineSuggestion[]) => {
      const nextPendingIdx = updatedSuggestions.findIndex(
        (s, i) => i > afterIndex && s.status === 'pending',
      );
      if (nextPendingIdx >= 0) {
        setCurrentSuggestionIndex(nextPendingIdx);
        // Auto-scroll to the next suggestion after a short delay for visual feedback
        setTimeout(() => {
          const el = document.querySelector(
            `[data-suggestion-index="${nextPendingIdx}"]`,
          );
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 400);
      }
    },
    [],
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const accept = useCallback(
    (id: string, editedText?: string) => {
      setSuggestions((prev) => {
        const updated = prev.map((s) =>
          s.id === id
            ? { ...s, status: 'accepted' as const, ...(editedText !== undefined ? { acceptedText: editedText } : {}) }
            : s,
        );
        const idx = prev.findIndex((s) => s.id === id);
        if (idx >= 0) {
          // Schedule advance after state settles
          setTimeout(() => advanceToNext(idx, updated), 0);
        }
        return updated;
      });
    },
    [advanceToNext],
  );

  const reject = useCallback(
    (id: string) => {
      setSuggestions((prev) => {
        const updated = prev.map((s) => (s.id === id ? { ...s, status: 'rejected' as const } : s));
        const idx = prev.findIndex((s) => s.id === id);
        if (idx >= 0) {
          setTimeout(() => advanceToNext(idx, updated), 0);
        }
        return updated;
      });
    },
    [advanceToNext],
  );

  const undo = useCallback(
    (id: string) => updateStatus(id, 'pending'),
    [updateStatus],
  );

  /**
   * Scrolls the viewport to the first pending suggestion mark in the DOM.
   * Relies on data-suggestion-id attributes placed by InlineSuggestionMark.
   * Uses containerRef when available to scope the query to the document area.
   */
  const scrollToNext = useCallback(() => {
    if (!nextPending) return;

    const root = containerRef.current ?? document;
    const el = root.querySelector(
      `[data-suggestion-id="${nextPending.id}"]`,
    );
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [nextPending]);

  // ── SSE integration ───────────────────────────────────────────────────────

  /**
   * Called when the server emits a batch of inline suggestions.
   * Appends new suggestions; does not overwrite already-resolved ones.
   */
  const handleSuggestionEvent = useCallback(
    (data: { suggestions: InlineSuggestion[] }) => {
      if (!Array.isArray(data.suggestions)) return;

      setSuggestions((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const incoming = data.suggestions.filter((s) => !existingIds.has(s.id));
        return [...prev, ...incoming];
      });
    },
    [],
  );

  const handleProcessingStatus = useCallback((status: string) => {
    setProcessingStatus(status);
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    suggestions,
    pendingCount,
    reviewedCount,
    nextPending,
    allResolved,
    processingStatus,
    containerRef,
    currentSuggestionIndex,
    setCurrentSuggestionIndex,
    accept,
    reject,
    undo,
    scrollToNext,
    handleSuggestionEvent,
    handleProcessingStatus,
  };
}
