import { Clock, ArrowRight } from 'lucide-react';
import { GlassCard } from './GlassCard';
import type { CoachSession } from '@/types/session';

interface SessionCardProps {
  session: CoachSession;
  onClick: () => void;
}

const phaseLabels: Record<string, string> = {
  setup: 'Getting Started',
  research: 'Researching',
  analysis: 'Analyzing',
  interview: 'Interviewing',
  tailoring: 'Tailoring',
  review: 'Reviewing',
  export: 'Complete',
};

export function SessionCard({ session, onClick }: SessionCardProps) {
  const timeAgo = getTimeAgo(session.updated_at);

  return (
    <GlassCard hover className="cursor-pointer p-4" onClick={onClick}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70 w-fit">
            {phaseLabels[session.current_phase] ?? session.current_phase}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <Clock className="h-3 w-3" />
            {timeAgo}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-white/30" />
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
