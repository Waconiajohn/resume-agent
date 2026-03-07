import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { CareerIQRoom } from './Sidebar';

const STAGES = ['Discovered', 'Applied', 'Interviewing', 'Offer', 'Accepted'] as const;

const STAGE_DB_MAP: Record<string, string> = {
  discovered: 'Discovered',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
};

const STAGE_COLORS: Record<string, string> = {
  Discovered: 'bg-white/20',
  Applied: 'bg-[#98b3ff]/50',
  Interviewing: 'bg-[#dfc797]/50',
  Offer: 'bg-[#b5dec2]/50',
  Accepted: 'bg-[#b5dec2]/70',
};

const FALLBACK_COUNTS: Record<string, number> = {
  Discovered: 2,
  Applied: 3,
  Interviewing: 2,
  Offer: 1,
  Accepted: 0,
};

interface PipelineSummaryProps {
  onNavigateDashboard?: (room: CareerIQRoom) => void;
}

export function PipelineSummary({ onNavigateDashboard }: PipelineSummaryProps) {
  const [stageCounts, setStageCounts] = useState<Record<string, number>>(FALLBACK_COUNTS);
  const [totalActive, setTotalActive] = useState(8);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data } = await supabase
          .from('job_applications')
          .select('pipeline_stage')
          .neq('status', 'archived');

        if (!data || cancelled) return;

        if (data.length > 0) {
          const counts: Record<string, number> = {};
          for (const stage of STAGES) counts[stage] = 0;
          for (const row of data) {
            const mapped = STAGE_DB_MAP[row.pipeline_stage] ?? 'Discovered';
            counts[mapped] = (counts[mapped] ?? 0) + 1;
          }
          setStageCounts(counts);
          setTotalActive(data.length);
        }
      } catch { /* keep fallback */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-white/80">Pipeline Summary</h3>
        <span className="text-[11px] text-white/30">{totalActive} active</span>
      </div>

      {/* Horizontal bar */}
      <div className="flex gap-0.5 h-3 rounded-full overflow-hidden bg-white/[0.04] mb-3">
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

      {/* Stage pills */}
      <div className="flex flex-wrap gap-2">
        {STAGES.map((stage) => {
          const count = stageCounts[stage] ?? 0;
          return (
            <div key={stage} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', STAGE_COLORS[stage])} />
              <span className="text-[11px] text-white/40">{stage}</span>
              <span className="text-[11px] font-medium text-white/55 tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>

      {onNavigateDashboard && (
        <button
          type="button"
          onClick={() => onNavigateDashboard('dashboard')}
          className="mt-3 flex items-center gap-1 text-[11px] text-[#98b3ff]/60 hover:text-[#98b3ff] transition-colors"
        >
          View Full Pipeline <ArrowRight size={11} />
        </button>
      )}
    </GlassCard>
  );
}
