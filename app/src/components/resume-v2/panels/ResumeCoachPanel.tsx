/**
 * ResumeCoachPanel — Left-panel coach for the resume editing workflow.
 *
 * Three states:
 *   overview  — !isActive && !isComplete: section mini-map + start CTA
 *   coaching  — isActive: progress header + children (BulletCoachingPanel)
 *   complete  — isComplete: success state + export buttons
 *
 * The progress header (item counter + progress bar) is always visible.
 * Coaching content scrolls below it.
 */

import type { ReactNode } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download, FileType2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionMiniMap } from './SectionMiniMap';
import type { SectionMiniMapProps } from './SectionMiniMap';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ResumeCoachPanelProps {
  // Item data
  flaggedCount: number;
  reviewedCount: number;
  currentPosition: number; // 1-based position of active item among flagged items
  // Section mini-map data
  sectionSummaries: SectionMiniMapProps['sections'];
  // Active state
  isActive: boolean;  // true when a bullet is selected (coaching mode)
  isComplete: boolean; // true when all flagged items reviewed
  // Callbacks
  onStartReviewing: () => void;
  onPrevItem: () => void;
  onNextItem: () => void;
  onSectionClick: (sectionKey: string) => void;
  onStructurePlan?: () => void;
  // Export
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  // Children: the coaching panel content (BulletCoachingPanel) is passed as children
  children?: ReactNode;
  // Error
  error?: string | null;
  onRetryPipeline?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progressPercent(reviewed: number, total: number): number {
  if (total === 0) return 100;
  return Math.min(100, Math.round((reviewed / total) * 100));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ProgressBarProps {
  percent: number;
  isComplete: boolean;
}

function ProgressBar({ percent, isComplete }: ProgressBarProps) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: 'var(--line-soft)' }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${percent}% reviewed`}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${percent}%`,
          backgroundColor: isComplete ? 'var(--badge-green-text)' : 'var(--link)',
        }}
      />
    </div>
  );
}

interface ErrorBannerProps {
  error: string;
  onRetry?: () => void;
}

function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border px-3.5 py-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--badge-red-text) 25%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--badge-red-text) 6%, transparent)',
      }}
      role="alert"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: 'var(--badge-red-text)' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[13px] font-medium" style={{ color: 'var(--text-strong)' }}>
          {error}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
            )}
            style={{
              color: 'var(--badge-red-text)',
              backgroundColor: 'color-mix(in srgb, var(--badge-red-text) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--badge-red-text) 20%, transparent)',
            }}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ResumeCoachPanel({
  flaggedCount,
  reviewedCount,
  currentPosition,
  sectionSummaries,
  isActive,
  isComplete,
  onStartReviewing,
  onPrevItem,
  onNextItem,
  onSectionClick,
  onStructurePlan,
  onExportDocx,
  onExportPdf,
  children,
  error,
  onRetryPipeline,
}: ResumeCoachPanelProps) {
  const percent = progressPercent(reviewedCount, flaggedCount);

  // ── Shared progress header ────────────────────────────────────────────────

  const progressHeader = (
    <div className="space-y-2 px-4 pt-4 pb-3">
      {/* Counter row */}
      <div className="flex items-center justify-between">
        {isComplete ? (
          <p className="text-[14px] font-semibold" style={{ color: 'var(--badge-green-text)' }}>
            <span aria-hidden="true">&#10003; </span>
            {flaggedCount} of {flaggedCount} reviewed
          </p>
        ) : isActive ? (
          <div className="flex items-center gap-1">
            <p className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--text-strong)' }}>
              {currentPosition} of {flaggedCount}
            </p>
          </div>
        ) : (
          <p className="text-[14px] font-semibold" style={{ color: 'var(--text-strong)' }}>
            {flaggedCount} {flaggedCount === 1 ? 'item' : 'items'} to strengthen
          </p>
        )}

        {/* Prev / Next arrows — only in coaching state */}
        {isActive && !isComplete && (
          <div className="flex items-center gap-1" role="group" aria-label="Navigate items">
            <button
              type="button"
              onClick={onPrevItem}
              disabled={currentPosition <= 1}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                'hover:bg-[var(--surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
                'disabled:opacity-30 disabled:cursor-not-allowed',
              )}
              aria-label="Previous flagged item"
              style={{ color: 'var(--text-soft)' }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNextItem}
              disabled={currentPosition >= flaggedCount}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                'hover:bg-[var(--surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
                'disabled:opacity-30 disabled:cursor-not-allowed',
              )}
              aria-label="Next flagged item"
              style={{ color: 'var(--text-soft)' }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <ProgressBar percent={percent} isComplete={isComplete} />
    </div>
  );

  // ── Complete state ─────────────────────────────────────────────────────────

  if (isComplete) {
    return (
      <div className="flex h-full flex-col" style={{ color: 'var(--text-strong)' }}>
        {error && (
          <div className="px-4 pt-4">
            <ErrorBanner error={error} onRetry={onRetryPipeline} />
          </div>
        )}

        {/* Sticky progress header */}
        <div
          className="shrink-0 border-b"
          style={{ borderColor: 'var(--line-soft)', backgroundColor: 'var(--surface-0)' }}
        >
          {progressHeader}
        </div>

        {/* Complete body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>
            Your resume is ready.
          </p>

          {/* Export buttons */}
          <div className="space-y-2.5">
            {onExportDocx && (
              <button
                type="button"
                onClick={onExportDocx}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-[14px] font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
                )}
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  borderColor: 'var(--btn-primary-border)',
                  color: 'var(--btn-primary-text)',
                  border: '1px solid var(--btn-primary-border)',
                }}
              >
                <FileType2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Download DOCX
              </button>
            )}

            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl border px-4 py-3 text-[14px] font-semibold transition-colors',
                  'hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
                )}
                style={{
                  borderColor: 'var(--line-soft)',
                  backgroundColor: 'var(--accent-muted)',
                  color: 'var(--text-muted)',
                }}
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                Download PDF
              </button>
            )}
          </div>

          <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Click any bullet to keep editing.
          </p>
        </div>
      </div>
    );
  }

  // ── Coaching state (bullet selected) ─────────────────────────────────────

  if (isActive) {
    return (
      <div className="flex h-full flex-col" style={{ color: 'var(--text-strong)' }}>
        {error && (
          <div className="px-4 pt-4">
            <ErrorBanner error={error} onRetry={onRetryPipeline} />
          </div>
        )}

        {/* Sticky progress header */}
        <div
          className="shrink-0 border-b"
          style={{ borderColor: 'var(--line-soft)', backgroundColor: 'var(--surface-0)' }}
        >
          {progressHeader}
        </div>

        {/* Coaching content — scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    );
  }

  // ── Overview state ────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col" style={{ color: 'var(--text-strong)' }}>
      {error && (
        <div className="px-4 pt-4">
          <ErrorBanner error={error} onRetry={onRetryPipeline} />
        </div>
      )}

      {/* Sticky progress header */}
      <div
        className="shrink-0 border-b"
        style={{ borderColor: 'var(--line-soft)', backgroundColor: 'var(--surface-0)' }}
      >
        {progressHeader}
      </div>

      {/* Overview body — scrollable */}
      <div className="flex h-full flex-col overflow-y-auto">
        {flaggedCount === 0 ? (
          /* Zero-flagged: positive all-clear state */
          <div className="flex flex-col items-center justify-center flex-1 px-6 text-center py-8">
            <p className="text-lg font-semibold text-[var(--text-strong)] mb-2">All bullets look strong.</p>
            <p className="text-sm text-[var(--text-soft)] mb-6">Your resume is ready to download.</p>
            {onExportDocx && (
              <button
                type="button"
                onClick={onExportDocx}
                className="w-full max-w-[240px] flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors mb-2"
              >
                Download DOCX
              </button>
            )}
            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                className="w-full max-w-[240px] flex items-center justify-center gap-2 rounded-lg border border-[var(--line-soft)] px-4 py-2.5 text-sm font-medium text-[var(--text-strong)] hover:bg-[var(--surface-1)] transition-colors"
              >
                Download PDF
              </button>
            )}
            {/* Structure plan link — available even when no items are flagged */}
            {onStructurePlan && (
              <button
                type="button"
                onClick={onStructurePlan}
                className={cn(
                  'mt-4 inline-flex w-full max-w-[240px] items-center justify-center text-[13px] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
                )}
                style={{ color: 'var(--link)' }}
              >
                Adjust section structure
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-4 space-y-5">
            {/* Section mini-map */}
            {sectionSummaries.length > 0 && (
              <section aria-label="Resume sections">
                <SectionMiniMap
                  sections={sectionSummaries}
                  onSectionClick={onSectionClick}
                />
              </section>
            )}

            {/* Hint copy */}
            <p className="text-[13px] leading-5" style={{ color: 'var(--text-soft)' }}>
              Click any section to start, or work from the top.
            </p>

            {/* Start Reviewing CTA */}
            <button
              type="button"
              onClick={onStartReviewing}
              className={cn(
                'inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-[14px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
              )}
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                border: '1px solid var(--btn-primary-border)',
                color: 'var(--btn-primary-text)',
              }}
            >
              Start Reviewing
              <ChevronRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </button>

            {/* Structure plan link */}
            {onStructurePlan && (
              <button
                type="button"
                onClick={onStructurePlan}
                className={cn(
                  'inline-flex w-full items-center justify-center text-[13px] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--focus-ring-offset-bg)]',
                )}
                style={{ color: 'var(--link)' }}
              >
                Adjust section structure
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
