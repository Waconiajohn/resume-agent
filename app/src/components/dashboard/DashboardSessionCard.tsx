import { Trash2, Eye, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/GlassCard';
import type { CoachSession } from '@/types/session';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function humanizeStage(stage: string | null | undefined): string {
  if (!stage) return '';
  return stage
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusBadgeProps {
  status: string | null | undefined;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status ?? 'unknown';
  const config: Record<string, { dot: string; label: string; text: string }> = {
    running: { dot: 'bg-blue-400', label: 'Running', text: 'text-blue-300' },
    complete: { dot: 'bg-emerald-400', label: 'Complete', text: 'text-emerald-300' },
    error: { dot: 'bg-red-400', label: 'Error', text: 'text-red-300' },
  };
  const cfg = config[normalized] ?? { dot: 'bg-white/30', label: normalized, text: 'text-white/50' };

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', cfg.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

interface DashboardSessionCardProps {
  session: CoachSession;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onViewResume: (id: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  showSelectCheckbox?: boolean;
}

export function DashboardSessionCard({
  session,
  onResume,
  onDelete,
  onViewResume,
  isSelected,
  onToggleSelect,
  showSelectCheckbox,
}: DashboardSessionCardProps) {
  const title = [session.company_name, session.job_title].filter(Boolean).join(' — ') || 'Untitled Session';
  const cost = session.estimated_cost_usd != null
    ? `$${session.estimated_cost_usd.toFixed(2)}`
    : null;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this session? This action cannot be undone.')) {
      onDelete(session.id);
    }
  };

  const handleViewResumeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewResume(session.id);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(session.id);
  };

  return (
    <GlassCard
      hover
      className="cursor-pointer p-4"
      onClick={() => onResume(session.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2 flex-wrap">
            {showSelectCheckbox && (
              <input
                type="checkbox"
                checked={isSelected ?? false}
                onClick={handleCheckboxClick}
                onChange={() => {}}
                className="h-4 w-4 cursor-pointer accent-[#afc4ff]"
                aria-label={`Select session: ${title}`}
              />
            )}
            <span className="text-sm font-medium text-white/90 truncate">{title}</span>
            <StatusBadge status={session.pipeline_status} />
          </div>

          {session.pipeline_stage && (
            <p className="mb-1 text-xs text-white/50">{humanizeStage(session.pipeline_stage)}</p>
          )}

          <div className="flex items-center gap-3 text-xs text-white/40">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(session.updated_at)}
            </span>
            {cost && <span>{cost}</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {session.pipeline_status === 'complete' && (
            <button
              type="button"
              onClick={handleViewResumeClick}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/85"
              aria-label="View resume"
              title="View resume"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleDeleteClick}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-red-400"
            aria-label="Delete session"
            title="Delete session"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
