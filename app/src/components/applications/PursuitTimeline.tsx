/**
 * PursuitTimeline — Phase 3 of the pursuit timeline.
 *
 * The workspace overview surface. Three regions stacked top-to-bottom:
 *   Done       — what's already happened, in lifecycle order
 *   Next       — a few things you could do now, in rough priority order
 *   Their turn — the honest truth about what's blocked by the company
 *
 * Each card is a click target that deep-links into the right tool tab.
 * Skeleton loader matches the three-region layout so smart-default routing
 * doesn't flicker into the wrong tool while the payload resolves.
 */

import { Clock, ArrowRight, CheckCircle2, Sparkles, Hourglass } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import {
  buildApplicationWorkspaceRoute,
  type ApplicationWorkspaceTool,
} from '@/lib/app-routing';
import type {
  DoneItem,
} from '@/hooks/useApplicationTimeline';
import type { NextItem, TheirTurnItem } from '@/lib/timeline/rules';

interface PursuitTimelineProps {
  applicationId: string;
  stage: string;
  done: DoneItem[];
  next: NextItem[];
  theirTurn: TheirTurnItem[];
  loading?: boolean;
  onNavigate?: (to: string) => void;
}

const STAGE_LABELS: Record<string, string> = {
  saved: 'Saved',
  researching: 'Researching',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed_won: 'Won',
  closed_lost: 'Closed',
};

function relativeFrom(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

function navigateTo(
  applicationId: string,
  tool: ApplicationWorkspaceTool,
  onNavigate?: (to: string) => void,
) {
  const route = buildApplicationWorkspaceRoute(applicationId, tool);
  if (onNavigate) onNavigate(route);
  else window.location.assign(route);
}

// ─── Skeleton ─────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-6" data-testid="pursuit-timeline-skeleton">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-16 animate-pulse rounded bg-[var(--line-soft)]" />
        <GlassCard className="p-5">
          <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--line-soft)]" />
          <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-[var(--line-soft)]" />
        </GlassCard>
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-4 w-16 animate-pulse rounded bg-[var(--line-soft)]" />
        <GlassCard className="p-5">
          <div className="h-5 w-1/2 animate-pulse rounded bg-[var(--line-soft)]" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-[var(--line-soft)]" />
        </GlassCard>
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-4 w-20 animate-pulse rounded bg-[var(--line-soft)]" />
        <GlassCard className="p-5">
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--line-soft)]" />
        </GlassCard>
      </div>
    </div>
  );
}

// ─── Done card ────────────────────────────────────────────────────────

function DoneCard({
  item,
  applicationId,
  onNavigate,
}: {
  item: DoneItem;
  applicationId: string;
  onNavigate?: (to: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => navigateTo(applicationId, item.target, onNavigate)}
      className="group w-full text-left"
    >
      <GlassCard
        hover
        className="flex items-center gap-3 px-4 py-3 transition-transform group-hover:translate-x-0.5"
      >
        <CheckCircle2 className="h-4 w-4 flex-none text-[var(--badge-green-text)]" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--text-strong)]">{item.title}</div>
          {item.detail && (
            <div className="text-xs text-[var(--text-soft)] truncate">{item.detail}</div>
          )}
        </div>
        <div className="flex flex-none items-center gap-2 text-xs text-[var(--text-soft)]">
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span>{relativeFrom(item.occurredAt)}</span>
        </div>
      </GlassCard>
    </button>
  );
}

// ─── Next card ────────────────────────────────────────────────────────

function NextCard({
  item,
  applicationId,
  onNavigate,
}: {
  item: NextItem;
  applicationId: string;
  onNavigate?: (to: string) => void;
}) {
  const tierAccent =
    item.tier === 'A'
      ? 'text-[var(--badge-amber-text)]'
      : item.tier === 'B'
        ? 'text-[var(--link)]'
        : 'text-[var(--text-soft)]';

  return (
    <button
      type="button"
      onClick={() => navigateTo(applicationId, item.target, onNavigate)}
      className="group w-full text-left"
    >
      <GlassCard
        hover
        className="flex items-start gap-3 p-4 transition-transform group-hover:translate-x-0.5"
      >
        <Sparkles className={`h-4 w-4 flex-none mt-0.5 ${tierAccent}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--text-strong)]">{item.title}</div>
          <p className="mt-1 text-xs text-[var(--text-soft)] whitespace-pre-line">{item.body}</p>
        </div>
        <ArrowRight className="h-4 w-4 flex-none text-[var(--text-soft)] mt-0.5" aria-hidden="true" />
      </GlassCard>
    </button>
  );
}

// ─── Their-turn card ──────────────────────────────────────────────────

function TheirTurnCard({ item }: { item: TheirTurnItem }) {
  return (
    <GlassCard className="flex items-start gap-3 p-4">
      <Hourglass className="h-4 w-4 flex-none mt-0.5 text-[var(--text-soft)]" />
      <div className="flex-1">
        <div className="text-sm font-semibold text-[var(--text-strong)]">{item.title}</div>
        <p className="mt-1 text-xs text-[var(--text-soft)]">{item.body}</p>
      </div>
    </GlassCard>
  );
}

// ─── Region header ────────────────────────────────────────────────────

function RegionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-soft)]">
      {children}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────

export function PursuitTimeline({
  applicationId,
  stage,
  done,
  next,
  theirTurn,
  loading = false,
  onNavigate,
}: PursuitTimelineProps) {
  if (loading) return <TimelineSkeleton />;

  const stageLabel = STAGE_LABELS[stage] ?? stage;

  return (
    <div className="flex flex-col gap-6" data-testid="pursuit-timeline">
      {/* Stage chip — non-prescriptive, just situates the user. */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-soft)]">You're in</span>
        <span className="rounded-full bg-[var(--badge-blue-bg)] px-3 py-1 text-xs font-semibold text-[var(--badge-blue-text)]">
          {stageLabel}
        </span>
      </div>

      {/* DONE region */}
      <section className="flex flex-col gap-3">
        <RegionHeader>Done</RegionHeader>
        {done.length === 0 ? (
          <GlassCard className="p-5">
            <p className="text-sm text-[var(--text-soft)]">
              Nothing's wrapped up yet for this pursuit. Pick something from the
              "Next" list below to get started.
            </p>
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-2">
            {done.map((item) => (
              <DoneCard
                key={item.id}
                item={item}
                applicationId={applicationId}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </section>

      {/* NEXT region */}
      <section className="flex flex-col gap-3">
        <RegionHeader>Next</RegionHeader>
        {next.length === 0 ? (
          <GlassCard className="p-5">
            <p className="text-sm text-[var(--text-soft)]">
              Nothing pressing right now. The next move is probably in their court —
              see "Their turn" below.
            </p>
          </GlassCard>
        ) : (
          <>
            <p className="text-xs text-[var(--text-soft)]">
              A few things you could do now, in rough priority order.
            </p>
            <div className="flex flex-col gap-2">
              {next.map((item) => (
                <NextCard
                  key={item.id}
                  item={item}
                  applicationId={applicationId}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* THEIR TURN region */}
      <section className="flex flex-col gap-3">
        <RegionHeader>Their turn</RegionHeader>
        {theirTurn.length === 0 ? (
          <GlassCard className="p-5">
            <p className="text-sm text-[var(--text-soft)]">
              Nothing's stuck waiting on them yet. Once you've applied or
              interviewed, this region will show what's queued up on their side.
            </p>
          </GlassCard>
        ) : (
          <>
            <p className="text-xs text-[var(--text-soft)]">
              Honest about waiting — the next move is on their side, not yours.
            </p>
            <div className="flex flex-col gap-2">
              {theirTurn.map((item) => (
                <TheirTurnCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
