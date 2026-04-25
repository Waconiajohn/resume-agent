/**
 * TodayView — Phase 5 of pursuit timeline.
 *
 * Cross-pursuit "what should I do today" surface. Mounted as a tab on
 * /workspace/applications next to the kanban (Pipeline). Reads the Today
 * aggregation from useTodayTimeline; same rule-engine output the per-pursuit
 * overview and completion CTAs read from.
 *
 * Three regions stacked: tier A (time-sensitive), tier B (pursuit-blocking),
 * tier C (waiting / stale). Empty state nudges toward prospecting.
 */

import { AlertCircle, ArrowRight, Building2, Clock, Hourglass, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import {
  buildApplicationWorkspaceRoute,
  type ApplicationWorkspaceTool,
} from '@/lib/app-routing';
import { useTodayTimeline } from '@/hooks/useTodayTimeline';
import type { TodayItem } from '@/lib/timeline/today';

interface TodayViewProps {
  onNavigate?: (to: string) => void;
}

function navigateTo(to: string, onNavigate?: (to: string) => void) {
  if (onNavigate) onNavigate(to);
  else window.location.assign(to);
}

// ─── Skeleton ─────────────────────────────────────────────────────────

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6" data-testid="today-view-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
          <GlassCard className="p-5">
            <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-white/10" />
          </GlassCard>
        </div>
      ))}
    </div>
  );
}

// ─── Item card ─────────────────────────────────────────────────────────

function TodayItemCard({
  item,
  onNavigate,
}: {
  item: TodayItem;
  onNavigate?: (to: string) => void;
}) {
  const isUrgent = item.tier === 'A';

  const onCardClick = () => {
    navigateTo(
      buildApplicationWorkspaceRoute(item.applicationId, 'overview'),
      onNavigate,
    );
  };

  const onActionClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    navigateTo(
      buildApplicationWorkspaceRoute(item.applicationId, item.target as ApplicationWorkspaceTool),
      onNavigate,
    );
  };

  // The action button label is a compact verb; the card copy carries the
  // full phrasing from the aggregator/rule engine.
  const actionLabel = actionLabelFor(item);

  return (
    <GlassCard
      hover
      className="flex flex-wrap items-start gap-3 p-4"
      data-testid={`today-item-${item.kind}`}
      data-rule-id={item.ruleId ?? null}
      data-application-id={item.applicationId}
    >
      {/* Icon */}
      {isUrgent ? (
        <AlertCircle className="h-4 w-4 flex-none mt-0.5 text-amber-300" aria-hidden="true" />
      ) : item.tier === 'B' ? (
        <Sparkles className="h-4 w-4 flex-none mt-0.5 text-sky-300" aria-hidden="true" />
      ) : (
        <Hourglass className="h-4 w-4 flex-none mt-0.5 text-white/50" aria-hidden="true" />
      )}

      {/* Body */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onCardClick}
          className="group flex items-center gap-1.5 text-left text-sm font-medium text-white hover:text-[var(--link)]"
          data-testid="today-item-pursuit-link"
        >
          <Building2 className="h-3.5 w-3.5 text-white/50 group-hover:text-[var(--link)]" aria-hidden="true" />
          <span className="truncate">{item.companyName}</span>
          <span className="text-white/40">·</span>
          <span className="truncate text-white/70">{item.roleTitle}</span>
        </button>
        <p className="mt-1 text-xs text-white/70 whitespace-pre-line">{item.label}</p>
      </div>

      {/* Action */}
      <div className="flex flex-none items-center gap-2">
        {typeof item.days === 'number' && (
          <div className="flex items-center gap-1 text-[11px] text-white/50">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span>{daysIndicator(item.days)}</span>
          </div>
        )}
        <GlassButton
          variant={isUrgent ? 'primary' : 'ghost'}
          size="sm"
          onClick={onActionClick}
          className="text-[12px]"
          data-testid="today-item-action"
        >
          {actionLabel}
          <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
        </GlassButton>
      </div>
    </GlassCard>
  );
}

function actionLabelFor(item: TodayItem): string {
  switch (item.kind) {
    case 'overdue_thank_you':
      return 'Send thank-you';
    case 'interview_today':
    case 'interview_tomorrow':
    case 'imminent_prep':
      return 'Open prep';
    case 'their_turn':
      return 'View pursuit';
    case 'next_rule':
    default:
      // Default by target.
      switch (item.target) {
        case 'resume':
          return 'Open resume';
        case 'cover-letter':
          return 'Draft letter';
        case 'networking':
          return 'Open networking';
        case 'interview-prep':
          return 'Open prep';
        case 'thank-you-note':
          return 'Open thank-you';
        case 'follow-up-email':
          return 'Open follow-up';
        case 'offer-negotiation':
          return 'Open negotiation';
        case 'overview':
        default:
          return 'View pursuit';
      }
  }
}

function daysIndicator(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return '1 day ago';
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}

// ─── Region ────────────────────────────────────────────────────────────

function Region({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: TodayItem[];
  onNavigate?: (to: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" data-testid={`today-region-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="flex flex-col gap-2">
        {items.map((item, idx) => (
          <TodayItemCard
            key={`${item.applicationId}-${item.kind}-${idx}`}
            item={item}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Main component ────────────────────────────────────────────────────

export function TodayView({ onNavigate }: TodayViewProps) {
  const { aggregation, loading, error, totalCount } = useTodayTimeline();

  return (
    <div className="flex flex-col gap-6" data-testid="today-view">
      <header>
        <h2 className="text-lg font-semibold text-white">Today</h2>
        <p className="mt-1 text-sm text-white/60">
          What needs your attention across all your pursuits.
        </p>
      </header>

      {loading ? (
        <TodaySkeleton />
      ) : error ? (
        <GlassCard className="p-5">
          <p className="text-sm text-white/70">
            We couldn&apos;t load Today. Try refreshing in a moment.
          </p>
        </GlassCard>
      ) : totalCount === 0 ? (
        <GlassCard className="p-6" data-testid="today-empty-state">
          <p className="text-sm text-white/80">
            Nothing urgent right now. Good time for prospecting —{' '}
            <button
              type="button"
              onClick={() => navigateTo('/workspace/job-search', onNavigate)}
              className="text-[var(--link)] underline-offset-2 hover:underline"
            >
              search for new roles
            </button>
            .
          </p>
        </GlassCard>
      ) : (
        <>
          <Region label="Time-sensitive" items={aggregation.tierA} onNavigate={onNavigate} />
          <Region label="Get unblocked" items={aggregation.tierB} onNavigate={onNavigate} />
          <Region label="Waiting" items={aggregation.tierC} onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
}
