/**
 * IAppliedCTA — Phase 1 of pursuit timeline.
 *
 * Small, reusable "I applied" surface. Two states:
 *  - No applied event yet → shows the button. Click records the event.
 *  - Event exists           → shows "Applied N days ago" with subtle styling.
 *
 * Used inline on:
 *  - V3PipelineScreen complete state (resume tailoring done)
 *  - CoverLetterScreen complete state (cover letter done)
 *  - ApplicationsListScreen rows (catch users who applied out-of-band)
 *
 * Hidden entirely when no applicationId is provided. The button only renders
 * after the surrounding hook has loaded events, so the brief loading flash
 * doesn't show a spinner — it just shows nothing until we know.
 */

import { useCallback, useMemo, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/GlassButton';
import {
  useApplicationEvents,
  type AppliedVia,
} from '@/hooks/useApplicationEvents';

interface IAppliedCTAProps {
  applicationId: string;
  resumeSessionId?: string;
  coverLetterSessionId?: string;
  /** Compact rendering used inside list rows. Omits the description copy. */
  compact?: boolean;
  /** Defaults to 'manual'. Pass 'imported' for backfill flows. */
  appliedVia?: AppliedVia;
  /** Optional callback after a successful record. */
  onRecorded?: () => void;
  className?: string;
}

function daysSince(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

export function IAppliedCTA({
  applicationId,
  resumeSessionId,
  coverLetterSessionId,
  compact = false,
  appliedVia = 'manual',
  onRecorded,
  className,
}: IAppliedCTAProps) {
  const { events, loading, recordApplied, hasEvent, latestEvent } = useApplicationEvents({
    applicationId,
  });
  const [submitting, setSubmitting] = useState(false);

  const applied = hasEvent('applied');
  const appliedEvent = useMemo(() => latestEvent('applied'), [latestEvent]);
  const days = appliedEvent ? daysSince(appliedEvent.occurred_at) : 0;

  const handleClick = useCallback(async () => {
    if (submitting || applied) return;
    setSubmitting(true);
    const ok = await recordApplied({
      applicationId,
      resumeSessionId,
      coverLetterSessionId,
      appliedVia,
    });
    setSubmitting(false);
    if (ok) onRecorded?.();
  }, [submitting, applied, recordApplied, applicationId, resumeSessionId, coverLetterSessionId, appliedVia, onRecorded]);

  // Don't flash UI before we know the state.
  if (loading && events.length === 0 && !applied) {
    return null;
  }

  if (applied && appliedEvent) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 text-[12px] text-[var(--badge-green-text)]/80',
          className,
        )}
        aria-label="Applied"
      >
        <Check size={12} />
        <span>
          Applied {days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}
        </span>
      </div>
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={submitting}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] px-2 py-0.5 text-[12px] text-[var(--text-soft)] transition-colors hover:border-[var(--link)]/40 hover:text-[var(--link)] disabled:opacity-60',
          className,
        )}
      >
        <ExternalLink size={11} />
        I applied
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3',
        className,
      )}
    >
      <ExternalLink size={14} className="text-[var(--link)] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[var(--text-strong)]">
          Applied to this role yet?
        </div>
        <div className="text-[12px] text-[var(--text-soft)] mt-0.5">
          Mark it so the platform can keep your timeline accurate.
        </div>
      </div>
      <GlassButton
        variant="primary"
        size="sm"
        onClick={() => void handleClick()}
        disabled={submitting}
        className="text-[13px]"
      >
        {submitting ? 'Recording…' : 'I applied'}
      </GlassButton>
    </div>
  );
}
