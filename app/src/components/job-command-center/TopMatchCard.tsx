import { Building2, MapPin } from 'lucide-react';
import { GlassButton } from '@/components/GlassButton';
import { ScoreBadge } from '@/components/job-command-center/ScoreBadge';
import { cn } from '@/lib/utils';
import type { RadarJob } from '@/hooks/useRadarSearch';

interface TopMatchCardProps {
  job: RadarJob;
  onPromote: (job: RadarJob) => void;
  onDismiss: (externalId: string) => void;
  onSelect?: (job: RadarJob) => void;
}

export function TopMatchCard({ job, onPromote, onDismiss, onSelect }: TopMatchCardProps) {
  const score = job.match_score ?? 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.06] bg-white/[0.02] p-3',
        'hover:bg-white/[0.04] hover:border-white/[0.1] transition-all',
        onSelect ? 'cursor-pointer' : undefined,
      )}
      onClick={onSelect ? () => onSelect(job) : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(job);
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-white/80 truncate">{job.title}</span>
            <ScoreBadge score={score} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/40 flex-wrap">
            <span className="flex items-center gap-1">
              <Building2 size={10} />
              {job.company}
            </span>
            {job.location && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <MapPin size={10} />
                  {job.location}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className="flex gap-1.5 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GlassButton
            onClick={() => onPromote(job)}
            className="px-2.5 py-1 text-[11px]"
          >
            Promote
          </GlassButton>
          <button
            type="button"
            onClick={() => onDismiss(job.external_id)}
            className="px-2 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[11px] text-white/35 hover:text-white/55 hover:bg-white/[0.04] transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
