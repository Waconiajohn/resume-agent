/**
 * V3StrategyPanel — shows the "why" behind the rewrite.
 *
 * Sections:
 *  - Frame — the one-line positioning angle (e.g. "consolidator")
 *  - Target discipline — the branded-title phrase the summary anchors to
 *  - Emphasized accomplishments — the specific wins the Strategy elected
 *    to foreground
 *  - Objections & rebuttals — the gaps Strategy expects the hiring manager
 *    to raise and how the resume preempts them (v3-specific insight that
 *    v2 buried in agent logs)
 *  - Per-position weight — which roles get heavy treatment vs brief mention
 *
 * This panel is the core of what makes v3 explicable: every rewrite choice
 * traces to an explicit strategy decision the user can read and contest.
 */

import { GlassCard } from '@/components/GlassCard';
import { Target, AlertCircle, Sparkles, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V3Strategy } from '@/hooks/useV3Pipeline';

interface Props {
  strategy: V3Strategy | null;
}

function weightBadgeClass(weight: 'primary' | 'secondary' | 'brief'): string {
  if (weight === 'primary') return 'bg-[var(--bullet-confirm-bg)] text-[var(--bullet-confirm)] border border-[var(--bullet-confirm-border)]';
  if (weight === 'secondary') return 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]';
  return 'bg-[var(--accent-muted)] text-[var(--text-muted)]';
}

export function V3StrategyPanel({ strategy }: Props) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--bullet-confirm)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Strategy
        </h2>
      </div>

      {!strategy ? (
        <div className="mt-4 space-y-2">
          <div className="h-3 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-1/2" />
          <div className="h-3 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-2/3" />
          <div className="h-3 rounded bg-[var(--surface-2)] motion-safe:animate-pulse w-1/3" />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Positioning frame */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-1.5">
              <Target className="h-3 w-3" />
              Frame
            </div>
            <div className="text-sm text-[var(--text-strong)] font-medium leading-snug">
              {strategy.positioningFrame}
            </div>
          </div>

          {/* Target discipline phrase */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-1.5">
              Target discipline
            </div>
            <div className="text-[13px] text-[var(--text-muted)] italic leading-snug">
              {strategy.targetDisciplinePhrase}
            </div>
          </div>

          {/* Emphasized accomplishments */}
          {strategy.emphasizedAccomplishments.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
                Emphasized wins ({strategy.emphasizedAccomplishments.length})
              </div>
              <ul className="space-y-2">
                {strategy.emphasizedAccomplishments.map((a, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-[var(--text-muted)] leading-snug border-l-2 border-[var(--bullet-confirm-border)] pl-2"
                  >
                    <span className="text-[var(--text-strong)]">{a.summary}</span>
                    {a.rationale && (
                      <span className="block text-[11px] text-[var(--text-soft)] mt-0.5 italic">
                        {a.rationale}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Objections — v3-specific insight */}
          {strategy.objections && strategy.objections.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
                <AlertCircle className="h-3 w-3" />
                Objections handled ({strategy.objections.length})
              </div>
              <ul className="space-y-2">
                {strategy.objections.map((o, i) => (
                  <li key={i} className="text-[11px] leading-snug">
                    <div className="text-[var(--text-muted)]">
                      <span className="font-medium">Likely question: </span>
                      {o.objection}
                    </div>
                    <div className="text-[var(--text-strong)] mt-0.5">
                      <span className="font-medium text-[var(--bullet-confirm)]">Preempt: </span>
                      {o.rebuttal}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-position weight */}
          {strategy.positionEmphasis.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
                <Layers className="h-3 w-3" />
                Position weight
              </div>
              <ul className="space-y-1">
                {strategy.positionEmphasis.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-[var(--text-muted)]">Position {p.positionIndex}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider', weightBadgeClass(p.weight))}>
                      {p.weight}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notes */}
          {strategy.notes && (
            <div className="pt-2 border-t border-[var(--line-soft)]">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-1">
                Notes
              </div>
              <div className="text-[11px] text-[var(--text-muted)] leading-snug italic">
                {strategy.notes}
              </div>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
