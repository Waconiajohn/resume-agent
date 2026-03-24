/**
 * ProcessingStatusBar — Thin progress bar + single status line
 *
 * Replaces V2StreamingDisplay during the suggestion processing phase.
 * Sits at the very top of its container (full width, 2px bar).
 * Fades out 2 seconds after isComplete transitions to true.
 */

import { useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcessingStatusBarProps {
  status: string | null;
  /** 0–100 */
  progress: number;
  isComplete: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProcessingStatusBar({
  status,
  progress,
  isComplete,
}: ProcessingStatusBarProps) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bug 11 fix: reset visible when isComplete transitions back to false (re-run scenario)
  useEffect(() => {
    if (!isComplete) {
      setVisible(true);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Fade out 2 seconds after completion
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, 2000);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isComplete]);

  if (!visible) return null;

  const clampedProgress = Math.min(100, Math.max(0, progress));
  const displayStatus = isComplete
    ? 'Ready — review your suggestions below'
    : (status ?? 'Processing...');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={displayStatus}
      style={{
        width: '100%',
        transition: 'opacity 600ms ease',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* ── Progress bar ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          height: '2px',
          width: '100%',
          background: 'var(--line-soft)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${clampedProgress}%`,
            background: isComplete ? '#4ade80' : '#60a5fa',
            transition: 'width 400ms ease, background 300ms ease',
          }}
        />
        {/* Animated shimmer while processing */}
        {!isComplete && clampedProgress < 100 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '40%',
              background:
                'linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.4) 50%, transparent 100%)',
              animation: 'processing-bar-shimmer 1.6s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* ── Status text ── */}
      <div
        style={{
          textAlign: 'center',
          marginTop: '8px',
          fontSize: '13px',
          color: isComplete ? '#4ade80' : 'var(--text-soft)',
          transition: 'color 300ms ease',
          letterSpacing: '0.01em',
        }}
      >
        {displayStatus}
      </div>

    </div>
  );
}
