import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const STAGES = ['Shortlist', 'Applied', 'Interviewing', 'Offer', 'Won', 'Lost'] as const;

const STAGE_DB_MAP: Record<string, string> = {
  saved: 'Shortlist',
  researching: 'Shortlist',
  applied: 'Applied',
  screening: 'Interviewing',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed_won: 'Won',
  closed_lost: 'Lost',
};

const STAGE_COLORS: Record<string, string> = {
  Shortlist: 'bg-[var(--line-strong)]',
  Applied: 'bg-[var(--link)]/50',
  Interviewing: 'bg-[var(--badge-amber-text)]/50',
  Offer: 'bg-[var(--badge-green-text)]/50',
  Won: 'bg-[var(--badge-green-text)]',
  Lost: 'bg-[var(--badge-red-text)]/50',
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
    async function load(userIdOverride?: string | null) {
      try {
        const resolvedUserId = userIdOverride === undefined
          ? (await supabase.auth.getUser()).data.user?.id ?? null
          : userIdOverride;

        if (!resolvedUserId || cancelled) {
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
          .eq('user_id', resolvedUserId);

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
          const mapped = STAGE_DB_MAP[row.stage];
          if (mapped) counts[mapped] = (counts[mapped] ?? 0) + 1;
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
    void load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Stage Summary</h3>
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
          No active applications yet. Save strong roles from the Job Board to start building the pipeline.
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
