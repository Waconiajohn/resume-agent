import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import { Flame, Trophy, Zap, Check } from 'lucide-react';
import type { MomentumSummary } from '@/hooks/useMomentum';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MomentumCardProps {
  summary: MomentumSummary | null;
  loading: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function humanizeActivityType(activityType: string): string {
  const MAP: Record<string, string> = {
    resume_completed: 'Resume completed',
    cover_letter_completed: 'Cover letter created',
    job_applied: 'Applied to job',
    interview_prep: 'Interview prepared',
    mock_interview: 'Mock interview completed',
    debrief_logged: 'Interview debriefed',
    networking_outreach: 'Networking outreach sent',
    linkedin_post: 'LinkedIn post published',
    profile_update: 'Profile updated',
    salary_negotiation: 'Salary negotiation prepared',
  };
  if (MAP[activityType]) return MAP[activityType];
  // Fallback: convert snake_case to Title Case
  return activityType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function MomentumSkeleton() {
  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-[var(--accent-muted)] animate-pulse" />
        <div className="h-7 w-16 bg-[var(--accent-muted)] rounded animate-pulse" />
        <div className="h-4 w-20 bg-[var(--accent-muted)] rounded animate-pulse" />
      </div>
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-12 bg-[var(--accent-muted)] rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-4 w-3/4 bg-[var(--accent-muted)] rounded animate-pulse" />
        <div className="h-4 w-1/2 bg-[var(--accent-muted)] rounded animate-pulse" />
      </div>
    </GlassCard>
  );
}

// ─── Mini-stat ───────────────────────────────────────────────────────────────

function MiniStat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Zap }) {
  return (
    <div className="flex-1 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-muted)] px-3 py-2.5 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon size={12} className="text-[var(--text-soft)]" />
        <span className="text-[12px] text-[var(--text-soft)] uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-[18px] font-semibold text-[var(--text-muted)]">{value}</div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MomentumCard({ summary, loading }: MomentumCardProps) {
  if (loading) {
    return <MomentumSkeleton />;
  }

  const streak = summary?.current_streak ?? 0;
  const streakColor = streak >= 3 ? 'text-[var(--badge-green-text)]' : 'text-[var(--badge-amber-text)]';
  const recentWins = summary?.recent_wins?.slice(0, 3) ?? [];

  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-[var(--text-strong)]">Momentum</h3>
      </div>

      {/* Streak row */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'rounded-lg p-2 flex-shrink-0',
            streak >= 3 ? 'bg-[var(--badge-green-text)]/10' : 'bg-[var(--badge-amber-text)]/10',
          )}
        >
          <Flame
            size={20}
            className={cn(streak >= 3 ? 'text-[var(--badge-green-text)]' : 'text-[var(--badge-amber-text)]')}
          />
        </div>
        {streak > 0 ? (
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-[28px] font-bold leading-none', streakColor)}>
              {streak}
            </span>
            <span className="text-[13px] text-[var(--text-soft)]">day streak</span>
          </div>
        ) : (
          <span className="text-[13px] text-[var(--badge-amber-text)]">Start your streak!</span>
        )}
      </div>

      {/* Mini-stats row */}
      <div className="flex gap-2">
        <MiniStat label="This Week" value={summary?.this_week_activities ?? 0} icon={Zap} />
        <MiniStat label="All Time" value={summary?.total_activities ?? 0} icon={Flame} />
        <MiniStat label="Best Streak" value={summary?.longest_streak ?? 0} icon={Trophy} />
      </div>

      {/* Recent wins */}
      {recentWins.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] text-[var(--text-soft)] uppercase tracking-wide mb-0.5">Recent wins</div>
          {recentWins.map((win) => (
            <div key={win.id} className="flex items-center gap-2">
              <div className="rounded-full bg-[var(--badge-green-text)]/10 p-1 flex-shrink-0">
                <Check size={11} className="text-[var(--badge-green-text)]" />
              </div>
              <span className="text-[12px] text-[var(--text-soft)] leading-snug">
                {humanizeActivityType(win.activity_type)}
              </span>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
