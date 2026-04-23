import { GlassCard } from '@/components/GlassCard';
import { Radio, Calendar } from 'lucide-react';

export function LiveWebinarsRoom() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--accent-muted)] text-[var(--accent)]">
          <Radio className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-strong)]">
            Live Webinars
          </h1>
          <p className="text-[13px] text-[var(--text-muted)]">Coming soon</p>
        </div>
      </div>

      <GlassCard className="p-8">
        <div className="mb-4 flex items-start gap-3">
          <Calendar className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <div>
            <h2 className="mb-2 text-[16px] font-semibold text-[var(--text-strong)]">
              3&ndash;4 live sessions per week on specific career-building topics
            </h2>
            <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
              The schedule and archive will live here once we start hosting. Expect topics like
              executive positioning, interview negotiation, LinkedIn brand audits, and real-time
              resume reviews.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
