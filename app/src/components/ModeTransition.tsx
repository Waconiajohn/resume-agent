import { useState, useEffect, useRef, useCallback } from 'react';
import type { UIMode } from '@/hooks/useUIMode';

interface ModeTransitionProps {
  uiMode: UIMode;
  children: React.ReactNode;
}

type TransitionState = 'idle' | 'fade-out' | 'message' | 'fade-in';

const TRANSITION_MESSAGE: Record<string, string> = {
  'interview→review': 'Your resume is taking shape...',
};

function getTransitionKey(from: UIMode, to: UIMode): string {
  return `${from}→${to}`;
}

export function ModeTransition({ uiMode, children }: ModeTransitionProps) {
  const [state, setState] = useState<TransitionState>('idle');
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const prevModeRef = useRef(uiMode);
  const isFirstRender = useRef(true);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    // No animation on initial render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevModeRef.current = uiMode;
      return;
    }

    const prevMode = prevModeRef.current;
    if (prevMode === uiMode) return;

    // Store previous mode for message lookup before updating ref
    const transitionKey = getTransitionKey(prevMode, uiMode);
    prevModeRef.current = uiMode;

    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplayedChildren(childrenRef.current);
      return;
    }

    // Clear any in-progress transition
    clearTimers();

    const message = TRANSITION_MESSAGE[transitionKey];

    if (message) {
      // Full transition: fade out → message → fade in
      setState('fade-out');
      timersRef.current.push(setTimeout(() => {
        setState('message');
        timersRef.current.push(setTimeout(() => {
          setDisplayedChildren(childrenRef.current);
          setState('fade-in');
          timersRef.current.push(setTimeout(() => setState('idle'), 200));
        }, 300));
      }, 200));
    } else {
      // Simple crossfade
      setState('fade-out');
      timersRef.current.push(setTimeout(() => {
        setDisplayedChildren(childrenRef.current);
        setState('fade-in');
        timersRef.current.push(setTimeout(() => setState('idle'), 300));
      }, 150));
    }

    return clearTimers;
  }, [uiMode, clearTimers]);

  // When idle, always show latest children
  useEffect(() => {
    if (state === 'idle') {
      setDisplayedChildren(children);
    }
  }, [children, state]);

  if (state === 'message') {
    // Use the stored transition key from the effect
    const key = getTransitionKey(
      // prevModeRef is already updated, so derive from uiMode
      uiMode === 'review' ? 'interview' : uiMode === 'edit' ? 'review' : 'interview',
      uiMode,
    );
    const message = TRANSITION_MESSAGE[key] ?? '';
    return (
      <div className="flex h-full items-center justify-center mode-fade-in">
        <p className="text-sm font-medium text-white/60">{message}</p>
      </div>
    );
  }

  return (
    <div
      className={`h-full ${
        state === 'fade-out'
          ? 'mode-fade-out'
          : state === 'fade-in'
            ? 'mode-fade-in'
            : ''
      }`}
    >
      {displayedChildren}
    </div>
  );
}
