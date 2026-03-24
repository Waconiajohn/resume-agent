/**
 * SuggestionsBadge — Floating bottom-right badge for inline suggestion state
 *
 * Three states:
 *   1. Processing — pulsing dot + status text
 *   2. Has pending — count badge + "suggestions" label, click scrolls to next
 *   3. All resolved — checkmark + "All reviewed" + Export button
 */

import { Download, CheckCircle2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuggestionsBadgeProps {
  pendingCount: number;
  isProcessing: boolean;
  processingStatus: string | null;
  allResolved: boolean;
  onScrollToNext: () => void;
  onExport: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SuggestionsBadge({
  pendingCount,
  isProcessing,
  processingStatus,
  allResolved,
  onScrollToNext,
  onExport,
}: SuggestionsBadgeProps) {
  // Nothing to show until processing starts or there are suggestions
  if (!isProcessing && pendingCount === 0 && !allResolved) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 50,
        minWidth: '160px',
      }}
    >
      <div
        style={{
          background: 'var(--surface-elevated)',
          border: '1px solid var(--line-strong)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-mid)',
          padding: '12px 16px',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* ── State 1: Processing ── */}
        {isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#60a5fa',
                flexShrink: 0,
                animation: 'suggestion-badge-pulse 1.4s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {processingStatus ?? 'Analyzing...'}
            </span>
          </div>
        )}

        {/* ── State 2: Has pending suggestions ── */}
        {!isProcessing && !allResolved && pendingCount > 0 && (
          <button
            type="button"
            onClick={onScrollToNext}
            aria-label={`${pendingCount} suggestion${pendingCount === 1 ? '' : 's'} pending — scroll to next`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '26px',
                height: '26px',
                borderRadius: '8px',
                background: 'rgba(96, 165, 250, 0.2)',
                border: '1px solid rgba(96, 165, 250, 0.35)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#60a5fa',
                flexShrink: 0,
                padding: '0 6px',
              }}
            >
              {pendingCount}
            </span>
            <span
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                textAlign: 'left',
              }}
            >
              suggestion{pendingCount === 1 ? '' : 's'}
            </span>
          </button>
        )}

        {/* ── State 3: All resolved ── */}
        {!isProcessing && allResolved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2
                style={{ width: '16px', height: '16px', color: '#4ade80', flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                All reviewed
              </span>
            </div>

            <button
              type="button"
              onClick={onExport}
              aria-label="Export resume"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                background: 'rgba(74, 222, 128, 0.15)',
                color: '#4ade80',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                cursor: 'pointer',
              }}
            >
              <Download style={{ width: '13px', height: '13px' }} />
              Export
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
