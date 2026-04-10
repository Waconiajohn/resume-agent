import { useEffect, useRef } from 'react';

const AUTOSAVE_KEY_PREFIX = 'careeriq:resume-draft:';
const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * Periodically saves a resume draft to localStorage so it can be recovered on reload.
 *
 * Saves every 30 seconds and also on tab switch / minimize (visibilitychange).
 * Skips the write if the value has not changed since the last save.
 */
export function useResumeAutoSave(sessionId: string | null, resumeDraft: unknown | null): void {
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (!sessionId || !resumeDraft) return;

    const save = () => {
      const serialized = JSON.stringify(resumeDraft);
      if (serialized === lastSavedRef.current) return;
      try {
        localStorage.setItem(`${AUTOSAVE_KEY_PREFIX}${sessionId}`, serialized);
        lastSavedRef.current = serialized;
      } catch {
        // localStorage full — silently ignore
      }
    };

    const interval = setInterval(save, AUTOSAVE_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.hidden) save();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      save(); // final save on unmount
    };
  }, [sessionId, resumeDraft]);
}

export function loadAutoSavedDraft(sessionId: string): unknown | null {
  try {
    const saved = localStorage.getItem(`${AUTOSAVE_KEY_PREFIX}${sessionId}`);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function clearAutoSavedDraft(sessionId: string): void {
  try {
    localStorage.removeItem(`${AUTOSAVE_KEY_PREFIX}${sessionId}`);
  } catch {
    // best effort
  }
}
