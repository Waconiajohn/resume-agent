/**
 * InlineSuggestionMark — Inline <ins>/<del> mark with hover-to-reveal accept/reject popup
 *
 * Renders a single diff segment (addition or deletion) with a floating popup
 * that shows the requirement context and accept/reject controls.
 * Uses @floating-ui/react for popup positioning.
 */

import { useState, useRef, useCallback } from 'react';
import {
  useFloating,
  offset,
  flip,
  shift,
  arrow,
  autoUpdate,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingArrow,
} from '@floating-ui/react';
import { Check, X } from 'lucide-react';
import type { DiffSegment, InlineSuggestion } from '@/lib/compute-inline-diffs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InlineSuggestionMarkProps {
  segment: DiffSegment;
  suggestion: InlineSuggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

// ─── Priority badge ───────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<InlineSuggestion['requirementPriority'], string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  important: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  supporting: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
};

const PRIORITY_LABELS: Record<InlineSuggestion['requirementPriority'], string> = {
  critical: 'Critical',
  important: 'Important',
  supporting: 'Supporting',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function InlineSuggestionMark({
  segment,
  suggestion,
  onAccept,
  onReject,
}: InlineSuggestionMarkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const arrowRef = useRef(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip(),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
  });

  const hover = useHover(context, { move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  // Bug 16 fix: use 'dialog' not 'tooltip' so screen readers announce interactive content
  const role = useRole(context, { role: 'dialog' });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  // ── Resolved state rendering ──────────────────────────────────────────────

  if (suggestion.status === 'accepted') {
    // Accepted: show the suggested text as normal copy (addition text only).
    // Deletions vanish entirely once accepted.
    if (segment.type === 'deletion') return null;
    return (
      <span
        data-suggestion-id={suggestion.id}
        style={{
          borderLeft: '2px solid rgba(34, 197, 94, 0.5)',
          paddingLeft: '2px',
        }}
      >
        {segment.text}
      </span>
    );
  }

  if (suggestion.status === 'rejected') {
    // Rejected: show the original text (deletion text), hide additions.
    if (segment.type === 'addition') return null;
    return <span data-suggestion-id={suggestion.id}>{segment.text}</span>;
  }

  // ── Pending state rendering ───────────────────────────────────────────────

  const isAddition = segment.type === 'addition';

  const markStyle: React.CSSProperties = isAddition
    ? {
        background: 'rgba(34, 197, 94, 0.15)',
        borderBottom: '2px solid #22c55e',
        textDecoration: 'none',
        cursor: 'pointer',
        borderRadius: '2px',
        padding: '0 1px',
      }
    : {
        background: 'rgba(239, 68, 68, 0.1)',
        textDecoration: 'line-through',
        textDecorationColor: '#ef4444',
        cursor: 'pointer',
        borderRadius: '2px',
        padding: '0 1px',
      };

  // Bug 3 fix: call onAccept/onReject and setIsOpen directly — no resolvingRef needed
  const handleAccept = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      onAccept(suggestion.id);
      setIsOpen(false);
    },
    [onAccept, suggestion.id],
  );

  const handleReject = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      onReject(suggestion.id);
      setIsOpen(false);
    },
    [onReject, suggestion.id],
  );

  // Bug 10 fix: open popup on Space/Enter for keyboard accessibility
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    },
    [],
  );

  const Tag = isAddition ? 'ins' : 'del';

  return (
    <>
      <Tag
        ref={refs.setReference}
        data-suggestion-id={suggestion.id}
        style={markStyle}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        {...getReferenceProps()}
      >
        {segment.text}
      </Tag>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{
              ...floatingStyles,
              zIndex: 9999,
              minWidth: '220px',
              maxWidth: '320px',
            }}
            {...getFloatingProps()}
          >
            {/* Popup card */}
            <div
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--line-strong)',
                borderRadius: '10px',
                boxShadow: 'var(--shadow-mid)',
                padding: '10px 12px',
                position: 'relative',
              }}
            >
              {/* Requirement text */}
              {suggestion.requirementText && (
                <p
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-soft)',
                    marginBottom: '6px',
                    lineHeight: '1.4',
                  }}
                >
                  {suggestion.requirementText}
                </p>
              )}

              {/* Priority badge + rationale row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '9999px' }}
                  className={PRIORITY_STYLES[suggestion.requirementPriority]}
                >
                  {PRIORITY_LABELS[suggestion.requirementPriority]}
                </span>
                {suggestion.rationale && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-soft)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                    title={suggestion.rationale}
                  >
                    {suggestion.rationale}
                  </span>
                )}
              </div>

              {/* Accept / Reject buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={handleAccept}
                  onKeyDown={(e) => e.key === 'Enter' && handleAccept(e)}
                  aria-label="Accept suggestion"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    cursor: 'pointer',
                  }}
                >
                  <Check style={{ width: '12px', height: '12px' }} />
                  Accept
                </button>

                <button
                  type="button"
                  onClick={handleReject}
                  onKeyDown={(e) => e.key === 'Enter' && handleReject(e)}
                  aria-label="Reject suggestion"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--line-soft)',
                    cursor: 'pointer',
                  }}
                >
                  <X style={{ width: '12px', height: '12px' }} />
                  Reject
                </button>
              </div>
            </div>

            {/* Bug 4/15 fix: FloatingArrow handles placement-aware positioning automatically */}
            <FloatingArrow
              ref={arrowRef}
              context={context}
              style={{
                fill: 'var(--surface-elevated)',
                stroke: 'var(--line-strong)',
                strokeWidth: 1,
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
