/**
 * V3StrategyPanel — the "why" behind the rewrite.
 *
 * Two layers:
 *  1. Benchmark (stage 3a output): what a strong candidate for this role
 *     looks like, how this specific candidate stacks up, and the specific
 *     gaps the writer is positioning around. v2 hid this; v3 exposes it.
 *  2. Strategy (stage 3 output): the positioning angle the writer committed
 *     to, with emphasized accomplishments, objections, per-position weight.
 *
 * Both render as progressive skeleton-pulses until their respective
 * stage_complete events arrive.
 */

import { useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import {
  Target, AlertCircle, Sparkles, Layers,
  ShieldCheck, Microscope, TrendingUp, ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V3Strategy, V3BenchmarkProfile, V3BenchmarkGap } from '@/hooks/useV3Pipeline';

interface Props {
  benchmark: V3BenchmarkProfile | null;
  strategy: V3Strategy | null;
}

function weightBadgeClass(weight: 'primary' | 'secondary' | 'brief'): string {
  if (weight === 'primary') return 'bg-[var(--bullet-confirm-bg)] text-[var(--bullet-confirm)] border border-[var(--bullet-confirm-border)]';
  if (weight === 'secondary') return 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]';
  return 'bg-[var(--accent-muted)] text-[var(--text-muted)]';
}

function severityBadgeClass(severity: V3BenchmarkGap['severity']): string {
  if (severity === 'disqualifying') return 'bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]';
  if (severity === 'manageable') return 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]';
  return 'bg-[var(--accent-muted)] text-[var(--text-soft)]';
}

function SkeletonPulse({ rows = 3 }: { rows?: number }) {
  const widths = ['w-3/4', 'w-2/3', 'w-5/6', 'w-1/2'];
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn('h-3 rounded bg-[var(--surface-2)] motion-safe:animate-pulse', widths[i % widths.length])} />
      ))}
    </div>
  );
}

function BenchmarkCard({ benchmark }: { benchmark: V3BenchmarkProfile | null }) {
  const [objectionsOpen, setObjectionsOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Microscope className="h-4 w-4 text-[var(--bullet-confirm)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Benchmark
        </h2>
      </div>

      {!benchmark ? (
        <div className="mt-4"><SkeletonPulse rows={4} /></div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Role problem hypothesis */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-1.5">
              <TrendingUp className="h-3 w-3" />
              Role problem
            </div>
            <div className="text-[12px] text-[var(--text-muted)] leading-snug">
              {benchmark.roleProblemHypothesis}
            </div>
          </div>

          {/* Ideal profile summary */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-1.5">
              Ideal candidate
            </div>
            <div className="text-[12px] text-[var(--text-strong)] leading-snug border-l-2 border-[var(--bullet-confirm-border)] pl-2 italic">
              {benchmark.idealProfileSummary}
            </div>
          </div>

          {/* Positioning frame (the one committed angle) */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-1.5">
              <Target className="h-3 w-3" />
              Frame
            </div>
            <div className="text-[12px] text-[var(--text-strong)] leading-snug">
              {benchmark.positioningFrame}
            </div>
          </div>

          {/* Gaps */}
          {benchmark.gapAssessment.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
                Gaps vs benchmark ({benchmark.gapAssessment.length})
              </div>
              <ul className="space-y-2">
                {benchmark.gapAssessment.map((g, i) => (
                  <li key={i} className="text-[11px] leading-snug">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider', severityBadgeClass(g.severity))}>
                        {g.severity}
                      </span>
                    </div>
                    <div className="text-[var(--text-strong)]">{g.gap}</div>
                    <div className="text-[var(--text-muted)] mt-0.5 italic">
                      → {g.bridgingStrategy}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Direct matches (collapsible) */}
          {benchmark.directMatches.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setMatchesOpen((o) => !o)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] hover:text-[var(--text-muted)] w-full text-left"
              >
                {matchesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <ShieldCheck className="h-3 w-3" />
                Direct matches ({benchmark.directMatches.length})
              </button>
              {matchesOpen && (
                <ul className="mt-2 space-y-1.5 pl-4">
                  {benchmark.directMatches.map((m, i) => (
                    <li key={i} className="text-[11px] leading-snug border-l-2 border-[var(--line-soft)] pl-2">
                      <div className="text-[var(--text-strong)] font-medium">{m.jdRequirement}</div>
                      <div className="text-[var(--text-muted)] mt-0.5">{m.candidateEvidence}</div>
                      <div className={cn('inline-block mt-1 px-1 py-0.5 rounded text-[9px] uppercase tracking-wider',
                        m.strength === 'strong'
                          ? 'bg-[var(--badge-green-bg,rgba(34,197,94,0.12))] text-[var(--badge-green-text)]'
                          : 'bg-[var(--accent-muted)] text-[var(--text-muted)]')}
                      >
                        {m.strength}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* HM objections (collapsible) */}
          {benchmark.hiringManagerObjections.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setObjectionsOpen((o) => !o)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] hover:text-[var(--text-muted)] w-full text-left"
              >
                {objectionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <AlertCircle className="h-3 w-3" />
                Hiring manager objections ({benchmark.hiringManagerObjections.length})
              </button>
              {objectionsOpen && (
                <ul className="mt-2 space-y-2 pl-4">
                  {benchmark.hiringManagerObjections.map((o, i) => (
                    <li key={i} className="text-[11px] leading-snug border-l-2 border-[var(--line-soft)] pl-2">
                      <div className="text-[var(--text-muted)]">
                        <span className="font-medium">Fear: </span>
                        {o.objection}
                      </div>
                      <div className="text-[var(--text-strong)] mt-0.5">
                        <span className="font-medium text-[var(--bullet-confirm)]">Preempt: </span>
                        {o.neutralizationStrategy}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function StrategyCard({ strategy }: { strategy: V3Strategy | null }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--bullet-confirm)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Strategy
        </h2>
      </div>

      {!strategy ? (
        <div className="mt-4"><SkeletonPulse rows={3} /></div>
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

          {/* Objections (strategize-level) */}
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

export function V3StrategyPanel({ benchmark, strategy }: Props) {
  return (
    <div className="space-y-4">
      <BenchmarkCard benchmark={benchmark} />
      <StrategyCard strategy={strategy} />
    </div>
  );
}
