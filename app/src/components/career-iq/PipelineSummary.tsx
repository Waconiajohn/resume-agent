import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const STAGES = ['Discovered', 'Applied', 'Interviewing', 'Offer', 'Accepted'] as const;

const STAGE_DB_MAP: Record<string, string> = {
  saved: 'Discovered',
  discovered: 'Discovered',
  applied: 'Applied',
  phone_screen: 'Interviewing',
  interviewing: 'Interviewing',
  final_round: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Discovered',
  withdrawn: 'Discovered',
};

const STAGE_COLORS: Record<string, string> = {
  Discovered: 'bg-[var(--line-strong)]',
  Applied: 'bg-[#98b3ff]/50',
  Interviewing: 'bg-[#f0d99f]/50',
  Offer: 'bg-[#b5dec2]/50',
  Accepted: 'bg-[#b5dec2]/70',
};

function makeEmptyCounts(): Record<string, number> {
  return STAGES.reduce<Record<string, number>>((counts, stage) => {
    counts[stage] = 0;
    return counts;
  }, {});
}

export function PipelineSummary() {
  const [stageCounts, setStageCounts] = useState<Record<string, number>>(makeEmptyCounts);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) {
          if (!cancelled) {
            setStageCounts(makeEmptyCounts());
            setTotalActive(0);
            setLoading(false);
          }
          return;
        }

        const { data } = await supabase
          .from('application_pipeline')
          .select('stage')
          .eq('user_id', user.id);

        if (!data || cancelled) {
          if (!cancelled) {
            setStageCounts(makeEmptyCounts());
            setTotalActive(0);
            setLoading(false);
          }
          return;
        }

        const counts = makeEmptyCounts();
        for (const row of data) {
          const mapped = STAGE_DB_MAP[row.stage] ?? 'Discovered';
          counts[mapped] = (counts[mapped] ?? 0) + 1;
        }
        setStageCounts(counts);
        setTotalActive(data.length);
      } catch {
        if (!cancelled) {
          setStageCounts(makeEmptyCounts());
          setTotalActive(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Pipeline Summary</h3>
        <span className="text-[13px] text-[var(--text-soft)]">
          {loading ? 'Loading…' : `${totalActive} active`}
        </span>
      </div>

      {/* Horizontal bar */}
      <div className="mb-3 flex h-3 gap-0.5 overflow-hidden bg-[var(--surface-1)]">
        {STAGES.map((stage) => {
          const count = stageCounts[stage] ?? 0;
          if (count === 0 || totalActive === 0) return null;
          const widthPct = (count / totalActive) * 100;
          return (
            <div
              key={stage}
              className={cn('h-full transition-all duration-500', STAGE_COLORS[stage])}
              style={{ width: `${widthPct}%` }}
              title={`${stage}: ${count}`}
            />
          );
        })}
      </div>

      {!loading && totalActive === 0 && (
        <p className="mb-3 text-[12px] text-[var(--text-soft)]">
          No active applications yet. Save strong roles from Discover to start building the pipeline.
        </p>
      )}

      {/* Stage pills */}
      <div className="flex flex-wrap gap-2">
        {STAGES.map((stage) => {
          const count = stageCounts[stage] ?? 0;
          return (
            <div key={stage} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2', STAGE_COLORS[stage])} />
              <span className="text-[13px] text-[var(--text-soft)]">{stage}</span>
              <span className="text-[13px] font-medium text-[var(--text-soft)] tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
