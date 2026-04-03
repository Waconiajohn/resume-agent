import { ArrowRight, CheckCircle2, Target } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import type { CareerProfileSummary, CareerProfileSignals } from './career-profile-summary';
import type { CareerProfileSignalLevel } from '@/types/career-profile';

interface CareerProfileSummaryCardProps {
  summary: CareerProfileSummary;
  whyMeSignals?: CareerProfileSignals;
  title?: string;
  description?: string;
  usagePoints?: string[];
  onOpenProfile?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
}

export function CareerProfileSummaryCard({
  summary,
  whyMeSignals,
  title = 'Career Profile driving this tool',
  description,
  usagePoints = [],
  onOpenProfile,
  onContinue,
  continueLabel,
}: CareerProfileSummaryCardProps) {
  const visibleHighlights = summary.highlightPoints.slice(0, 2);
  const visibleUsagePoints = usagePoints.slice(0, 2);

  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[var(--link)]/12 p-2">
              <Target size={16} className="text-[var(--link)]" />
            </div>
            <div>
              <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]/70">
                Career Profile
              </div>
              <h2 className="mt-1 text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-[var(--text-soft)]">
            {description ?? summary.statusLine}
          </p>

          {whyMeSignals && (
            <button
              type="button"
              onClick={onOpenProfile}
              className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2 text-left transition-colors hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]/40"
              aria-label="View Why Me story signals in Career Profile"
            >
              <span className="text-[12px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                Why Me
              </span>
              <SignalPip level={whyMeSignals.clarity} label="Clarity" />
              <SignalPip level={whyMeSignals.alignment} label="Alignment" />
              <SignalPip level={whyMeSignals.differentiation} label="Differentiation" />
            </button>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SnapshotCard label="Readiness" value={`${summary.readinessPercent}%`} detail={summary.readinessLabel} />
            <SnapshotCard label="Core Story" value={summary.primaryStory} detail={summary.strengthSnapshot} />
            <SnapshotCard label="Differentiator" value={summary.differentiationSnapshot} detail={summary.focusAreas[0] ?? 'This profile is already strong enough to support execution work.'} />
          </div>

          {summary.highlightPoints.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
              <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">
                Strongest signals
              </div>
              <div className="mt-3 space-y-2">
                {visibleHighlights.map((point) => (
                  <div key={point} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[var(--badge-green-text)]" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibleUsagePoints.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--link)]/14 bg-[var(--link)]/[0.05] p-4">
              <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--link)]/72">
                Using now
              </div>
              <div className="mt-3 space-y-2">
                {visibleUsagePoints.map((point) => (
                  <div key={point} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                    <Target size={14} className="mt-0.5 shrink-0 text-[var(--link)]" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2">
          {onOpenProfile && (
            <GlassButton variant="ghost" onClick={onOpenProfile}>
              Review Career Profile
            </GlassButton>
          )}
          {onContinue && (
            <GlassButton variant="primary" onClick={onContinue}>
              {continueLabel ?? summary.nextRecommendedAction}
              <ArrowRight size={14} className="ml-1.5" />
            </GlassButton>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function SnapshotCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-4">
      <div className="text-[13px] font-medium uppercase tracking-widest text-[var(--text-soft)]">{label}</div>
      <div className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text-strong)]">{value}</div>
      <div className="mt-2 text-xs leading-relaxed text-[var(--text-soft)]">{detail}</div>
    </div>
  );
}

function SignalPip({ level, label }: { level: CareerProfileSignalLevel; label: string }) {
  const colorMap: Record<CareerProfileSignalLevel, string> = {
    green: 'bg-[var(--badge-green-text)]',
    yellow: 'bg-[var(--badge-amber-text)]',
    red: 'bg-[var(--line-strong)]',
  };
  return (
    <div className="flex items-center gap-1">
      <div className={cn('h-1.5 w-1.5 shrink-0 rounded-full', colorMap[level])} />
      <span className="text-xs text-[var(--text-soft)]">{label}</span>
    </div>
  );
}
