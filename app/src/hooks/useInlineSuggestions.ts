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
  nextPending: InlineSuggestion | undefined;
  allResolved: boolean;
  processingStatus: string | null;
  containerRef: RefObject<HTMLDivElement | null>;
  accept: (id: string) => void;
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────

  const pendingCount = suggestions.filter((s) => s.status === 'pending').length;
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

  // ── Actions ───────────────────────────────────────────────────────────────

  const accept = useCallback(
    (id: string) => updateStatus(id, 'accepted'),
    [updateStatus],
  );

  const reject = useCallback(
    (id: string) => updateStatus(id, 'rejected'),
    [updateStatus],
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

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    nextPending,
    allResolved,
    processingStatus,
    containerRef,
    accept,
    reject,
    undo,
    scrollToNext,
    handleSuggestionEvent,
    handleProcessingStatus,
  };
}
