import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Building2, ChevronDown, Mic, DollarSign, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { ScoreBadge } from './ScoreBadge';
import type { Application, PipelineStage } from '@/hooks/useApplicationPipeline';

const ALL_STAGES: { key: PipelineStage; label: string }[] = [
  { key: 'saved', label: 'Shortlist' },
  { key: 'researching', label: 'Researching' },
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer', label: 'Offer' },
  { key: 'closed_won', label: 'Won' },
  { key: 'closed_lost', label: 'Lost' },
];

const STAGE_DOT: Record<PipelineStage, string> = {
  saved: 'bg-white/30',
  researching: 'bg-[#98b3ff]/60',
  applied: 'bg-[#f0d99f]/60',
  screening: 'bg-[#f0d99f]/80',
  interviewing: 'bg-[#b5dec2]/60',
  offer: 'bg-[#b5dec2]/80',
  closed_won: 'bg-[#b5dec2]',
  closed_lost: 'bg-red-400/50',
};

interface OpportunityCardProps {
  application: Application;
  onMoveStage: (id: string, stage: PipelineStage) => void;
  onClick?: (application: Application) => void;
  onBuildResume?: (application: Application) => void;
  onPrepInterview?: (application: Application) => void;
  onNegotiateSalary?: (application: Application) => void;
}

export function OpportunityCard({
  application,
  onMoveStage,
  onClick,
  onBuildResume,
  onPrepInterview,
  onNegotiateSalary,
}: OpportunityCardProps) {
  const [showStageMenu, setShowStageMenu] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const otherStages = ALL_STAGES.filter((s) => s.key !== application.stage);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] p-3 transition-all',
        isDragging
          ? 'shadow-2xl border-[var(--line-strong)] bg-[var(--surface-1)] cursor-grabbing'
          : 'hover:bg-[var(--surface-1)] hover:border-[var(--line-strong)] cursor-grab',
        onClick && !isDragging && 'active:cursor-grabbing',
      )}
      onClick={() => !isDragging && onClick?.(application)}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-[var(--text-muted)] truncate">
            {application.role_title}
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[13px] text-[var(--text-soft)]">
            <Building2 size={10} />
            {application.company_name}
          </div>
          {application.next_action && (
            <div className="mt-1.5 text-[13px] text-[#98b3ff]/50 truncate">
              {application.next_action}
            </div>
          )}
          {(application.stage === 'saved' || application.stage === 'researching') && onBuildResume && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onBuildResume(application);
              }}
              className="mt-2 flex items-center gap-1 text-[12px] font-medium text-[#98b3ff]/70 hover:text-[#98b3ff] transition-colors"
            >
              <FileText size={10} />
              Build Resume
            </button>
          )}
          {application.stage === 'interviewing' && onPrepInterview && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onPrepInterview(application);
              }}
              className="mt-2 flex items-center gap-1 text-[12px] font-medium text-[#b5dec2]/70 hover:text-[#b5dec2] transition-colors"
            >
              <Mic size={10} />
              Prep for Interview
            </button>
          )}
          {application.stage === 'offer' && onNegotiateSalary && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onNegotiateSalary(application);
              }}
              className="mt-2 flex items-center gap-1 text-[12px] font-medium text-[#b5dec2]/70 hover:text-[#b5dec2] transition-colors"
            >
              <DollarSign size={10} />
              Negotiate Salary
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {application.score != null && <ScoreBadge score={application.score} />}

          {/* Stage dropdown fallback */}
          <div className="relative">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setShowStageMenu((v) => !v);
              }}
              className="flex items-center gap-0.5 text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors"
              aria-label="Move to stage"
            >
              <ChevronDown size={13} />
            </button>
            {showStageMenu && (
              <div className="absolute right-0 top-full mt-1 z-20 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-1)] shadow-xl py-1 min-w-[130px]">
                {otherStages.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveStage(application.id, s.key);
                      setShowStageMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--text-soft)] hover:text-[var(--text-muted)] hover:bg-[var(--accent-muted)] transition-colors flex items-center gap-2"
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STAGE_DOT[s.key])} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
