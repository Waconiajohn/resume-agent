/**
 * ScheduleInterviewButton — Phase 3 of pursuit timeline.
 *
 * Inline form that records an `interview_scheduled` event. Sibling to
 * HadThisInterviewButton; placed on the same prep card so the user can
 * either confirm a future interview is on the calendar (this control) or
 * attest one happened (HadThisInterviewButton). The two are independent —
 * scheduled and happened are separate event types.
 *
 * Idempotency dedup is keyed by (application_id, type, scheduled_date) so
 * multi-round interviews remain distinct. The form re-opens after each
 * scheduling so the user can add another round.
 */

import { useCallback, useMemo, useState } from 'react';
import { CalendarPlus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/GlassButton';
import {
  useApplicationEvents,
  type InterviewType,
} from '@/hooks/useApplicationEvents';

interface ScheduleInterviewButtonProps {
  applicationId: string;
  defaultInterviewType?: InterviewType;
  className?: string;
  /** Optional callback fired after successful record. */
  onScheduled?: () => void;
}

function defaultDateTimeLocal(): string {
  // 09:00 tomorrow, formatted for <input type="datetime-local">.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function nowDateTimeLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function localDateTimeToIso(value: string): string {
  // <input type="datetime-local"> gives us a naive local datetime string.
  // Convert to ISO via the Date constructor (which assumes local zone).
  const d = new Date(value);
  return d.toISOString();
}

export function ScheduleInterviewButton({
  applicationId,
  defaultInterviewType = 'video',
  className,
  onScheduled,
}: ScheduleInterviewButtonProps) {
  const { events, recordInterviewScheduled } = useApplicationEvents({ applicationId });

  const minLocal = useMemo(nowDateTimeLocal, []);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState<string>(defaultDateTimeLocal());
  const [interviewType, setInterviewType] = useState<InterviewType>(defaultInterviewType);
  const [round, setRound] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Compute current upcoming interview (if any). When a future-dated
  // scheduling exists, surface a small confirmation chip; the user can still
  // open the form again to add a follow-up round.
  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => e.type === 'interview_scheduled')
      .map((e) => {
        const meta = e.metadata as { scheduled_date?: string; round?: string } | null;
        const sd = typeof meta?.scheduled_date === 'string' ? meta.scheduled_date : null;
        return { event: e, scheduledMs: sd ? Date.parse(sd) : NaN, scheduled: sd, round: meta?.round };
      })
      .filter((row) => Number.isFinite(row.scheduledMs) && row.scheduledMs >= now)
      .sort((a, b) => a.scheduledMs - b.scheduledMs)[0];
  }, [events]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const iso = localDateTimeToIso(scheduledLocal);
      const result = await recordInterviewScheduled({
        applicationId,
        scheduledDate: iso,
        interviewType,
        round: round.trim() || undefined,
      });
      if (!result) {
        setError('Failed to schedule. Please try again.');
        return;
      }
      setOpen(false);
      setRound('');
      setScheduledLocal(defaultDateTimeLocal());
      onScheduled?.();
    } catch {
      setError('Failed to schedule. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, scheduledLocal, recordInterviewScheduled, applicationId, interviewType, round, onScheduled]);

  if (!open) {
    // Confirmation chip + "schedule another round" affordance when an
    // interview is already on the calendar.
    if (upcoming?.scheduled) {
      const dateLabel = new Date(upcoming.scheduled).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return (
        <div className={cn('flex flex-wrap items-center gap-2 text-[12px]', className)}>
          <span className="inline-flex items-center gap-1.5 text-[var(--badge-green-text)]/80">
            <Check size={12} />
            Interview scheduled for {dateLabel}
            {upcoming.round ? ` · ${upcoming.round}` : ''}
          </span>
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            className="text-[12px]"
          >
            <CalendarPlus size={11} className="mr-1.5" />
            Schedule another round
          </GlassButton>
        </div>
      );
    }
    return (
      <GlassButton
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn('text-[12px]', className)}
      >
        <CalendarPlus size={12} className="mr-1.5" />
        Schedule interview
      </GlassButton>
    );
  }

  return (
    <div className={cn('rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 space-y-3', className)}>
      <div className="text-[12px] font-semibold text-[var(--text-strong)]">Schedule this interview</div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[12px] text-[var(--text-soft)]">
          Date &amp; time
          <input
            type="datetime-local"
            value={scheduledLocal}
            min={minLocal}
            onChange={(e) => setScheduledLocal(e.target.value)}
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

      <label className="block text-[12px] text-[var(--text-soft)]">
        Round (optional)
        <input
          type="text"
          value={round}
          onChange={(e) => setRound(e.target.value)}
          placeholder="e.g., First round, Final, Panel with Eng"
          className="mt-1 w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg-1)] px-2 py-1.5 text-[12px] text-[var(--text-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40"
        />
      </label>

      {error && (
        <div className="text-[12px] text-[var(--badge-red-text)]">{error}</div>
      )}

      <div className="flex items-center gap-2">
        <GlassButton
          variant="primary"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={submitting || !scheduledLocal}
          className="text-[12px]"
        >
          {submitting ? 'Scheduling…' : 'Schedule'}
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
