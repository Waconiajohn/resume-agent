import { ArrowRight, CheckCircle2, Target } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import type { CareerProfileSummary } from './career-profile-summary';

interface CareerProfileSummaryCardProps {
  summary: CareerProfileSummary;
  title?: string;
  description?: string;
  usagePoints?: string[];
  onOpenProfile?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
}

export function CareerProfileSummaryCard({
  summary,
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
            <div className="rounded-lg bg-[#98b3ff]/12 p-2">
              <Target size={16} className="text-[#98b3ff]" />
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
                Career Profile
              </div>
              <h2 className="mt-1 text-sm font-semibold text-white/88">{title}</h2>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-white/58">
            {description ?? summary.statusLine}
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SnapshotCard label="Readiness" value={`${summary.readinessPercent}%`} detail={summary.readinessLabel} />
            <SnapshotCard label="Core Story" value={summary.primaryStory} detail={summary.strengthSnapshot} />
            <SnapshotCard label="Differentiator" value={summary.differentiationSnapshot} detail={summary.focusAreas[0] ?? 'This profile is already strong enough to support execution work.'} />
          </div>

          {summary.highlightPoints.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">
                Strongest signals
              </div>
              <div className="mt-3 space-y-2">
                {visibleHighlights.map((point) => (
                  <div key={point} className="flex items-start gap-2 text-sm text-white/68">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#b5dec2]" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibleUsagePoints.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#98b3ff]/14 bg-[#98b3ff]/[0.05] p-4">
              <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/72">
                Using now
              </div>
              <div className="mt-3 space-y-2">
                {visibleUsagePoints.map((point) => (
                  <div key={point} className="flex items-start gap-2 text-sm text-white/72">
                    <Target size={14} className="mt-0.5 shrink-0 text-[#98b3ff]" />
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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="text-[11px] font-medium uppercase tracking-widest text-white/42">{label}</div>
      <div className="mt-2 text-sm font-semibold leading-relaxed text-white/86">{value}</div>
      <div className="mt-2 text-xs leading-relaxed text-white/48">{detail}</div>
    </div>
  );
}
