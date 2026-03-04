import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTypingAnimationProps {
  targetText: string;
  isActive: boolean;
  wordsPerTick?: number;
  tickIntervalMs?: number;
}

interface UseTypingAnimationReturn {
  displayText: string;
  isAnimating: boolean;
  skipToEnd: () => void;
  progress: number;
}

/**
 * Word-by-word typing animation hook.
 * Progressively reveals targetText when isActive is true.
 * Respects prefers-reduced-motion.
 */
export function useTypingAnimation({
  targetText,
  isActive,
  wordsPerTick = 3,
  tickIntervalMs = 40,
}: UseTypingAnimationProps): UseTypingAnimationReturn {
  const [wordIndex, setWordIndex] = useState(0);
  const [skipped, setSkipped] = useState(false);

  // Issue 2 fix: update wordsRef synchronously during render so that displayText
  // computed below always reads from the current split, never stale data.
  const newWordsSplit = targetText ? targetText.split(/(\s+)/) : [];
  const wordsRef = useRef<string[]>(newWordsSplit);
  wordsRef.current = newWordsSplit;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prefersReducedMotion = useRef(false);

  // Initialize and listen for reduced motion changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
      if (e.matches) {
        setSkipped(true);
        setWordIndex(wordsRef.current.length);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Handle targetText changes and isActive transitions.
  //
  // Issue 1 fix: when isActive goes false, do NOT reset `skipped`. The skip
  // state is intentional user input and should persist unless the text itself
  // changes while active. We only reset `skipped` (and restart the animation
  // from the divergence point) when targetText changes while isActive is true.
  //
  // Issue 2 fix: wordsRef.current is already up to date (set during render
  // above). We keep a separate prevWordsRef to track the previous split for
  // divergence comparison, since wordsRef.current no longer holds the old value.
  const prevWordsRef = useRef<string[]>([]);
  useEffect(() => {
    const newWords = wordsRef.current;
    const oldWords = prevWordsRef.current;
    prevWordsRef.current = newWords;

    if (isActive && !skipped && !prefersReducedMotion.current) {
      // Find divergence point to avoid re-animating already-shown content
      let divergeAt = 0;
      const minLen = Math.min(oldWords.length, newWords.length);
      while (divergeAt < minLen && oldWords[divergeAt] === newWords[divergeAt]) {
        divergeAt++;
      }
      setWordIndex((prev) => Math.min(prev, divergeAt));
    } else if (isActive && skipped) {
      // targetText changed while active and already skipped — check if the text
      // actually diverged. If it did, reset skip so the new content animates in.
      let divergeAt = 0;
      const minLen = Math.min(oldWords.length, newWords.length);
      while (divergeAt < minLen && oldWords[divergeAt] === newWords[divergeAt]) {
        divergeAt++;
      }
      const textChanged = divergeAt < newWords.length || newWords.length !== oldWords.length;
      if (textChanged) {
        setSkipped(false);
        setWordIndex(divergeAt);
      }
    } else if (!isActive) {
      // Deactivating: show full text but do NOT reset skipped. The user's skip
      // intent must survive a deactivation/reactivation cycle on the same text.
      setWordIndex(newWords.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetText, isActive]);

  // Animation interval
  useEffect(() => {
    if (!isActive || skipped || prefersReducedMotion.current) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setWordIndex((prev) => {
        const next = prev + wordsPerTick;
        if (next >= wordsRef.current.length) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return wordsRef.current.length;
        }
        return next;
      });
    }, tickIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // wordIndex intentionally excluded — the interval manages progression internally via setWordIndex functional updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, skipped, wordsPerTick, tickIntervalMs]);

  const skipToEnd = useCallback(() => {
    setSkipped(true);
    setWordIndex(wordsRef.current.length);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // If reduced motion or skipped, show full text immediately
  const shouldShowFull = !isActive || skipped || prefersReducedMotion.current;
  const totalWords = wordsRef.current.length;
  const displayText = shouldShowFull
    ? targetText
    : wordsRef.current.slice(0, wordIndex).join('');

  const isAnimating = isActive && !skipped && !prefersReducedMotion.current && wordIndex < totalWords;
  const progress = totalWords > 0 ? Math.min(wordIndex / totalWords, 1) : 1;

  return {
    displayText,
    isAnimating,
    skipToEnd,
    progress,
  };
}
