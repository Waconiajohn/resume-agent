import { Building2, MapPin } from 'lucide-react';
import { GlassButton } from '@/components/GlassButton';
import { ScoreBadge } from '@/components/job-command-center/ScoreBadge';
import { ReferralBadge, getBestBonusDisplay } from '@/components/job-command-center/ReferralBadge';
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
        'rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3',
        'hover:bg-[var(--surface-1)] hover:border-[var(--line-strong)] transition-all',
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
            <span className="text-[13px] font-medium text-[var(--text-muted)] truncate">{job.title}</span>
            <ScoreBadge score={score} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[13px] text-[var(--text-soft)] flex-wrap">
            <span className="flex items-center gap-1">
              <Building2 size={10} />
              {job.company}
            </span>
            {job.referral_bonus && (() => {
              const bonusDisplay = getBestBonusDisplay(job.referral_bonus);
              return bonusDisplay ? (
                <ReferralBadge
                  bonusAmount={bonusDisplay}
                  confidence={job.referral_bonus.confidence}
                />
              ) : null;
            })()}
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
            className="px-2.5 py-1 text-[13px]"
          >
            Promote
          </GlassButton>
          <button
            type="button"
            onClick={() => onDismiss(job.external_id)}
            className="px-2 py-1 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] text-[13px] text-[var(--text-soft)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-1)] transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
