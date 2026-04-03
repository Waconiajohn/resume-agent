import { Clock, Building2, AlertTriangle } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import type { DailyOpsData } from '@/hooks/useDailyOps';

interface DailyOpsSectionProps {
  data: DailyOpsData;
  title?: string;
  subtitle?: string;
}

function urgencyClass(dueDateStr: string): string {
  const due = new Date(dueDateStr);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'text-red-400/70 border-red-400/20 bg-red-400/[0.04]';
  if (diffDays < 1) return 'text-[var(--badge-amber-text)]/70 border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-bg)]';
  return 'text-[var(--text-soft)] border-[var(--line-soft)] bg-[var(--accent-muted)]';
}

export function DailyOpsSection({
  data,
  title = 'Daily Ops',
  subtitle,
}: DailyOpsSectionProps) {
  const { dueActions, staleApplications, activeCount, interviewCount, offerCount } =
    data;

  return (
    <GlassCard className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Clock size={18} className="text-[#98b3ff]" />
        <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">{title}</h3>
      </div>

      {subtitle && (
        <p className="-mt-3 text-[13px] leading-relaxed text-[var(--text-soft)]">{subtitle}</p>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <StatMetric label="Active" value={activeCount} />
        <StatMetric label="Interviewing" value={interviewCount} highlight={interviewCount > 0} />
        <StatMetric label="Offers" value={offerCount} highlight={offerCount > 0} accent="green" />
        <StatMetric label="Due" value={dueActions.length} highlight={dueActions.length > 0} accent="amber" />
      </div>

      {/* Due actions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} className="text-[var(--badge-amber-text)]" />
          <span className="text-[12px] font-semibold text-[var(--text-soft)] uppercase tracking-wider">
            Due Actions
          </span>
          {dueActions.length > 0 && (
            <span className="ml-auto text-[13px] text-[var(--text-soft)]">{dueActions.length} due</span>
          )}
        </div>

        {dueActions.length === 0 ? (
          <p className="text-[12px] text-[var(--text-soft)] py-2">No upcoming actions due.</p>
        ) : (
          <div className="space-y-2">
            {dueActions.map((action) => {
              const cls = urgencyClass(action.next_action_due);
              const dueDate = new Date(action.next_action_due);
              const isPast = dueDate < new Date();
              const isDueToday = dueDate.toDateString() === new Date().toDateString();
              const dueLabelClass = isPast
                ? 'text-red-400/70'
                : isDueToday
                  ? 'text-[var(--badge-amber-text)]/70'
                  : 'text-[var(--text-soft)]';

              return (
                <div key={action.id} className={cn('support-callout border p-3 transition-colors', cls)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[var(--text-muted)]">
                        {action.next_action}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-[13px] text-[var(--text-soft)]">
                        <Building2 size={10} />
                        {action.company_name}
                        <span>·</span>
                        <span className="truncate">{action.role_title}</span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'text-[13px] font-medium flex-shrink-0 tabular-nums',
                        dueLabelClass,
                      )}
                    >
                      {isPast
                        ? 'Overdue'
                        : isDueToday
                          ? 'Today'
                          : dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stale applications callout */}
      {staleApplications.length > 0 && (
        <div className="support-callout border border-[var(--badge-amber-text)]/15 bg-[var(--badge-amber-bg)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-[var(--badge-amber-text)]/60" />
            <span className="text-[12px] font-semibold text-[var(--badge-amber-text)]/60">
              {staleApplications.length} application
              {staleApplications.length !== 1 ? 's' : ''} haven&apos;t been touched in 7+ days
            </span>
          </div>
          <div className="space-y-1">
            {staleApplications.map((app) => (
              <div key={app.id} className="flex items-center gap-2 text-[13px] text-[var(--text-soft)]">
                <Building2 size={10} />
                <span className="truncate">
                  {app.role_title} at {app.company_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function StatMetric({
  label,
  value,
  highlight = false,
  accent = 'blue',
}: {
  label: string;
  value: number;
  highlight?: boolean;
  accent?: 'blue' | 'green' | 'amber';
}) {
  const valueClass = highlight
    ? accent === 'green'
      ? 'text-[var(--badge-green-text)]'
      : accent === 'amber'
        ? 'text-[var(--badge-amber-text)]'
        : 'text-[#98b3ff]'
    : 'text-[var(--text-muted)]';

  return (
    <div className="border-l-2 border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
      <div className={cn('text-[18px] font-bold tabular-nums', valueClass)}>{value}</div>
      <div className="mt-1 text-[13px] uppercase tracking-[0.14em] text-[var(--text-soft)]">{label}</div>
    </div>
  );
}
