/**
 * HadThisInterviewButton — Phase 1 of pursuit timeline.
 *
 * Inline record-the-event control for the InterviewLab prep card.
 *
 * Flow:
 *   1. Idle: shows "Had this interview" button.
 *   2. Form: date picker (default today, allows back-dating ≤60 days,
 *      forbids future dates) + interview type. Submit records the event.
 *   3. Recorded: shows "Interview happened on {date}" plus a deep-link
 *      to the thank-you-note tool for the same application.
 *
 * Server enforces the past-only constraint as well; this component just
 * disables the future side of the date picker so the user can't aim
 * there in the first place.
 */

import { useCallback, useMemo, useState } from 'react';
import { Calendar, Check, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/GlassButton';
import {
  useApplicationEvents,
  type InterviewType,
} from '@/hooks/useApplicationEvents';

interface HadThisInterviewButtonProps {
  applicationId: string;
  /** Default interview type to preselect in the form. */
  defaultInterviewType?: InterviewType;
  /** Default ISO date (yyyy-mm-dd) to pre-fill. Defaults to today. */
  defaultInterviewDate?: string;
  className?: string;
}

const MAX_BACKFILL_DAYS = 60;

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function backfillFloorIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - MAX_BACKFILL_DAYS);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function HadThisInterviewButton({
  applicationId,
  defaultInterviewType = 'video',
  defaultInterviewDate,
  className,
}: HadThisInterviewButtonProps) {
  const { events, hasEvent, latestEvent, recordInterviewHappened } = useApplicationEvents({
    applicationId,
  });

  const today = useMemo(todayIsoDate, []);
  const minDate = useMemo(backfillFloorIsoDate, []);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState<string>(defaultInterviewDate ?? today);
  const [interviewType, setInterviewType] = useState<InterviewType>(defaultInterviewType);
  const [error, setError] = useState<string | null>(null);

  const happened = hasEvent('interview_happened');
  const happenedEvent = useMemo(() => latestEvent('interview_happened'), [latestEvent]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (date > today) {
      setError('Interview date cannot be in the future.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const ok = await recordInterviewHappened({
      applicationId,
      interviewDate: date,
      interviewType,
      // occurred_at as the start-of-day ISO (UTC) so the server's past-only
      // guard accepts back-dated entries entered later in the day.
      occurredAt: `${date}T00:00:00.000Z`,
    });
    setSubmitting(false);
    if (ok) {
      setOpen(false);
    } else {
      setError('Failed to record. Please try again.');
    }
  }, [submitting, date, today, recordInterviewHappened, applicationId, interviewType]);

  const handleNavigateToThankYou = useCallback(() => {
    window.location.assign(`/workspace/application/${encodeURIComponent(applicationId)}/thank-you-note`);
  }, [applicationId]);

  // Recorded state — show a small confirmation + deep-link to thank-you tool.
  if (happened && happenedEvent) {
    const meta = happenedEvent.metadata as { interview_date?: string } | null;
    const recordedDate = meta?.interview_date ?? happenedEvent.occurred_at.slice(0, 10);
    return (
      <div className={cn('flex flex-wrap items-center gap-2 text-[12px]', className)}>
        <span className="inline-flex items-center gap-1.5 text-[var(--badge-green-text)]/80">
          <Check size={12} />
          Interview happened on {recordedDate}
        </span>
        <GlassButton
          variant="ghost"
          size="sm"
          onClick={handleNavigateToThankYou}
          className="text-[12px]"
        >
          <Mail size={11} className="mr-1.5" />
          Draft thank-you note
        </GlassButton>
      </div>
    );
  }

  if (!open) {
    // Don't render until events have loaded at least once — avoids the
    // button flicker when an event is already on file.
    if (events.length === 0 && happened === false) {
      // events loading or genuinely empty; render the button regardless
    }
    return (
      <GlassButton
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn('text-[12px]', className)}
      >
        <Calendar size={12} className="mr-1.5" />
        Had this interview
      </GlassButton>
    );
  }

  return (
    <div className={cn('rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 space-y-3', className)}>
      <div className="text-[12px] font-semibold text-[var(--text-strong)]">Record this interview</div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[12px] text-[var(--text-soft)]">
          Date
          <input
            type="date"
            value={date}
            min={minDate}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg-1)] px-2 py-1.5 text-[12px] text-[var(--text-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40 [color-scheme:dark]"
          />
        </label>
        <label className="block text-[12px] text-[var(--text-soft)]">
          Type
          <select
            value={interviewType}
            onChange={(e) => setInterviewType(e.target.value as InterviewType)}
            className="mt-1 w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg-1)] px-2 py-1.5 text-[12px] text-[var(--text-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40"
          >
            <option value="phone">Phone</option>
            <option value="video">Video</option>
            <option value="onsite">Onsite</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="text-[12px] text-[var(--badge-red-text)]">{error}</div>
      )}

      <div className="flex items-center gap-2">
        <GlassButton
          variant="primary"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="text-[12px]"
        >
          {submitting ? 'Recording…' : 'Record'}
        </GlassButton>
        <GlassButton
          variant="ghost"
          size="sm"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={submitting}
          className="text-[12px]"
        >
          Cancel
        </GlassButton>
      </div>
    </div>
  );
}
