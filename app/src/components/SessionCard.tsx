import { Clock, ArrowRight, Trash2 } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { PHASE_LABELS } from '@/constants/phases';
import type { CoachSession } from '@/types/session';

interface SessionCardProps {
  session: CoachSession;
  onClick: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
}

export function SessionCard({ session, onClick, onDelete, deleteDisabled = false }: SessionCardProps) {
  const timeAgo = getTimeAgo(session.updated_at);
  const sessionTitle =
    [session.company_name, session.job_title].filter(Boolean).join(' — ') || null;
  const phaseLabel = PHASE_LABELS[session.current_phase] ?? session.current_phase;

  return (
    <GlassCard hover className="cursor-pointer p-4" onClick={onClick}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          {sessionTitle ? (
            <span className="text-sm font-medium text-[var(--text-strong)] truncate max-w-[200px]">
              {sessionTitle}
            </span>
          ) : null}
          <span className="rounded-full border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] w-fit">
            {phaseLabel}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-soft)]">
            <Clock className="h-3 w-3" />
            {timeAgo}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={deleteDisabled}
                className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--text-soft)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Delete session"
              >
                <Trash2 className="h-4 w-4" />
              </button>
          )}
          <ArrowRight className="h-4 w-4 text-[var(--text-soft)]" />
        </div>
      </div>
    </GlassCard>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}
