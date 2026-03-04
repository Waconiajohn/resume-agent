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
  const wordsRef = useRef<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check prefers-reduced-motion
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // Split target text into words
  useEffect(() => {
    wordsRef.current = targetText ? targetText.split(/(\s+)/) : [];
    // When target text changes and we're active, find divergence point
    if (isActive && !skipped && !prefersReducedMotion.current) {
      const newWords = targetText ? targetText.split(/(\s+)/) : [];
      // Reset to beginning for new content
      setWordIndex(0);
    } else if (!isActive) {
      // Not active — show full text
      setWordIndex(wordsRef.current.length);
      setSkipped(false);
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
