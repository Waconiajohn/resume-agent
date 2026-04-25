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

import { useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import {
  Target, AlertCircle, Sparkles, Layers,
  ShieldCheck, Microscope, TrendingUp, ChevronDown, ChevronRight, Loader2,
  MessageSquare, RefreshCw, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  V3Strategy,
  V3BenchmarkProfile,
  V3BenchmarkGap,
  V3DiscoveryAnswer,
} from '@/hooks/useV3Pipeline';
import type { PositionWeight } from '@/hooks/useV3Regenerate';

interface Props {
  benchmark: V3BenchmarkProfile | null;
  strategy: V3Strategy | null;
  /**
   * When the user clicks a bullet's source chip in the resume view, this
   * index is set to that bullet's position. Any emphasized-accomplishment
   * cards with a matching `positionIndex` flash briefly. `flashTick`
   * re-triggers the animation even when positionIndex hasn't changed.
   */
  flashPositionIndex?: number | null;
  flashTick?: number;
  /**
   * Regenerate a position with a new weight (Phase 4). When provided, the
   * per-position weight badges become clickable — cycling primary → secondary
   * → brief → primary. Pending changes accumulate locally; "Re-run" applies.
   */
  onRegeneratePosition?: (
    positionIndex: number,
    weight?: PositionWeight,
  ) => void | Promise<void>;
  /**
   * Rerun the full pipeline with user-provided answers to strategy discovery
   * questions appended to the source resume for this run.
   */
  onRunDiscoveryAnswers?: (answers: V3DiscoveryAnswer[]) => void;
  discoveryRunning?: boolean;
  /** Position indices currently regenerating — spinner. */
  pendingPositions?: Set<number>;
}

const WEIGHT_CYCLE: PositionWeight[] = ['primary', 'secondary', 'brief'];

function nextWeight(w: PositionWeight): PositionWeight {
  const idx = WEIGHT_CYCLE.indexOf(w);
  return WEIGHT_CYCLE[(idx + 1) % WEIGHT_CYCLE.length]!;
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

type EvidenceOpportunity = NonNullable<V3Strategy['evidenceOpportunities']>[number];

function evidenceLevelLabel(level: EvidenceOpportunity['level']): string {
  if (level === 'direct_proof') return 'direct';
  if (level === 'reasonable_inference') return 'inferred';
  if (level === 'adjacent_proof') return 'adjacent';
  if (level === 'candidate_discovery_needed') return 'ask';
  return 'gap';
}

function evidenceLevelClass(level: EvidenceOpportunity['level']): string {
  if (level === 'direct_proof') return 'bg-[var(--bullet-confirm-bg)] text-[var(--bullet-confirm)] border border-[var(--bullet-confirm-border)]';
  if (level === 'reasonable_inference') return 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]';
  if (level === 'adjacent_proof') return 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]';
  if (level === 'candidate_discovery_needed') return 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--line-soft)]';
  return 'bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]';
}

function riskLabel(risk: EvidenceOpportunity['risk']): string {
  if (risk === 'low') return 'low risk';
  if (risk === 'medium') return 'medium risk';
  return 'high risk';
}

function shouldAskDiscoveryQuestion(item: EvidenceOpportunity): boolean {
  if (!item.discoveryQuestion) return false;
  if (item.level === 'candidate_discovery_needed') return true;
  if (item.level === 'unsupported') return true;
  return item.level === 'adjacent_proof' && item.risk !== 'low';
}

function discoveryKey(item: EvidenceOpportunity, index: number): string {
  return `${index}:${item.requirement}:${item.discoveryQuestion ?? ''}`;
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

function StrategyCard({
  strategy,
  flashPositionIndex,
  flashTick,
  onRegeneratePosition,
  onRunDiscoveryAnswers,
  discoveryRunning,
  pendingPositions,
}: {
  strategy: V3Strategy | null;
  flashPositionIndex?: number | null;
  flashTick?: number;
  onRegeneratePosition?: (positionIndex: number, weight?: PositionWeight) => void | Promise<void>;
  onRunDiscoveryAnswers?: (answers: V3DiscoveryAnswer[]) => void;
  discoveryRunning?: boolean;
  pendingPositions?: Set<number>;
}) {
  const emphasisRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  // Pending weight changes not yet applied. Keyed by positionIndex;
  // cleared when the user clicks "Re-run" or resets an individual row.
  const [pendingWeights, setPendingWeights] = useState<Map<number, PositionWeight>>(new Map());

  const currentWeights = useMemo(() => {
    const m = new Map<number, PositionWeight>();
    strategy?.positionEmphasis.forEach((p) => m.set(p.positionIndex, p.weight));
    return m;
  }, [strategy]);

  const hasPendingChanges = pendingWeights.size > 0;
  const editorial = strategy?.editorialAssessment;
  const evidenceOpportunities = strategy?.evidenceOpportunities ?? [];
  const discoveryItems = useMemo(
    () => evidenceOpportunities.filter(shouldAskDiscoveryQuestion),
    [evidenceOpportunities],
  );
  const discoverySignature = useMemo(
    () => discoveryItems.map((item, index) => discoveryKey(item, index)).join('|'),
    [discoveryItems],
  );
  const [discoveryAnswers, setDiscoveryAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    setDiscoveryAnswers({});
  }, [discoverySignature]);

  const handleCycleWeight = (positionIndex: number) => {
    if (!onRegeneratePosition) return;
    setPendingWeights((prev) => {
      const next = new Map(prev);
      const cur = next.get(positionIndex) ?? currentWeights.get(positionIndex) ?? 'secondary';
      const cycled = nextWeight(cur);
      const original = currentWeights.get(positionIndex) ?? 'secondary';
      if (cycled === original) {
        next.delete(positionIndex);
      } else {
        next.set(positionIndex, cycled);
      }
      return next;
    });
  };

  const handleApplyChanges = () => {
    if (!onRegeneratePosition) return;
    // Fire regenerate for each pending change. Capture keys first since
    // state mutates as each call kicks off.
    const entries = [...pendingWeights.entries()];
    for (const [positionIndex, weight] of entries) {
      void onRegeneratePosition(positionIndex, weight);
    }
    setPendingWeights(new Map());
  };

  const answerCount = discoveryItems.reduce((count, item, index) => {
    const key = discoveryKey(item, index);
    return discoveryAnswers[key]?.trim() ? count + 1 : count;
  }, 0);

  const handleDiscoveryAnswerChange = (
    item: EvidenceOpportunity,
    index: number,
    value: string,
  ) => {
    const key = discoveryKey(item, index);
    setDiscoveryAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearDiscoveryAnswers = () => {
    setDiscoveryAnswers({});
  };

  const handleRunDiscoveryAnswers = () => {
    if (!onRunDiscoveryAnswers) return;
    const answers = discoveryItems.flatMap((item, index): V3DiscoveryAnswer[] => {
      const answer = discoveryAnswers[discoveryKey(item, index)]?.trim();
      if (!answer) return [];
      return [{
        requirement: item.requirement,
        question: item.discoveryQuestion ?? '',
        answer,
        level: item.level,
        risk: item.risk,
        recommendedFraming: item.recommendedFraming,
        sourceSignal: item.sourceSignal,
      }];
    });
    if (answers.length === 0) return;
    onRunDiscoveryAnswers(answers);
  };

  useEffect(() => {
    if (flashPositionIndex === null || flashPositionIndex === undefined) return;
    // Flash every emphasized accomplishment that targets this position.
    strategy?.emphasizedAccomplishments.forEach((a, i) => {
      if (a.positionIndex !== flashPositionIndex) return;
      const el = emphasisRefs.current.get(i);
      if (!el) return;
      el.classList.remove('v3-strategy-flash');
      // Force reflow so re-adding the class re-runs the animation.
      void el.offsetWidth;
      el.classList.add('v3-strategy-flash');
    });
    // flashTick is intentionally in the deps: bumping it re-triggers the flash
    // even when positionIndex is unchanged.
  }, [flashPositionIndex, flashTick, strategy]);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--bullet-confirm)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Strategy
        </h2>
      </div>

      {/* Pending-weight-changes bar — appears only when the user has cycled
          one or more weights. Clicking "Re-run" fires regenerate per-change. */}
      {hasPendingChanges && (
        <div className="mt-3 rounded border border-[var(--bullet-confirm-border)] bg-[var(--bullet-confirm-bg)] p-2 flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-strong)] flex-1">
            {pendingWeights.size} position{pendingWeights.size === 1 ? '' : 's'} to re-run
          </span>
          <button
            type="button"
            onClick={handleApplyChanges}
            className="text-[11px] font-semibold text-[var(--bullet-confirm)] hover:underline"
          >
            Re-run
          </button>
          <button
            type="button"
            onClick={() => setPendingWeights(new Map())}
            className="text-[11px] text-[var(--text-soft)] hover:text-[var(--text-muted)]"
          >
            Cancel
          </button>
        </div>
      )}

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

          {/* Human editorial assessment */}
          {editorial && (
            <div className="pt-3 border-t border-[var(--line-soft)]">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
                <TrendingUp className="h-3 w-3" />
                Strategist read
                <span className="ml-auto text-[var(--text-muted)] tracking-normal">
                  {Math.round(editorial.callbackPower)}/100
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-[var(--bullet-confirm)]"
                  style={{ width: `${Math.max(0, Math.min(100, editorial.callbackPower))}%` }}
                />
              </div>
              <dl className="space-y-2 text-[11px] leading-snug">
                <div>
                  <dt className="text-[var(--text-soft)]">Strongest angle</dt>
                  <dd className="text-[var(--text-strong)]">{editorial.strongestAngle}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-soft)]">Weak spot</dt>
                  <dd className="text-[var(--text-muted)]">{editorial.weakestAngle}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-soft)]">Question to answer</dt>
                  <dd className="text-[var(--text-muted)]">{editorial.hiringManagerQuestion}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-soft)]">Next move</dt>
                  <dd className="text-[var(--bullet-confirm)]">{editorial.recommendedMove}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Evidence opportunities */}
          {evidenceOpportunities.length > 0 && (
            <div className="pt-3 border-t border-[var(--line-soft)]">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
                <Microscope className="h-3 w-3" />
                Evidence map ({evidenceOpportunities.length})
              </div>
              <ul className="space-y-2">
                {evidenceOpportunities.map((item, i) => (
                  <li key={`${item.requirement}-${i}`} className="text-[11px] leading-snug border-l-2 border-[var(--line-soft)] pl-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[var(--text-strong)]">{item.requirement}</span>
                      <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider', evidenceLevelClass(item.level))}>
                        {evidenceLevelLabel(item.level)}
                      </span>
                    </div>
                    {item.sourceSignal && (
                      <div className="mt-1 text-[var(--text-soft)]">
                        Proof: {item.sourceSignal}
                      </div>
                    )}
                    <div className="mt-1 text-[var(--text-muted)]">
                      {item.recommendedFraming}
                    </div>
                    {item.discoveryQuestion && (
                      <div className="mt-1 text-[var(--badge-amber-text)]">
                        Ask: {item.discoveryQuestion}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-soft)]">
                      {riskLabel(item.risk)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Candidate discovery answers */}
          {onRunDiscoveryAnswers && discoveryItems.length > 0 && (
            <div className="pt-3 border-t border-[var(--line-soft)]">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)] mb-2">
                <MessageSquare className="h-3 w-3" />
                Discovery ({discoveryItems.length})
              </div>
              <ul className="space-y-3">
                {discoveryItems.map((item, index) => {
                  const key = discoveryKey(item, index);
                  return (
                    <li
                      key={key}
                      className="text-[11px] leading-snug border-l-2 border-[var(--badge-amber-text)]/40 pl-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[var(--text-strong)]">{item.requirement}</span>
                        <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider', evidenceLevelClass(item.level))}>
                          {evidenceLevelLabel(item.level)}
                        </span>
                      </div>
                      <label
                        htmlFor={`discovery-answer-${index}`}
                        className="mt-1 block text-[var(--text-muted)]"
                      >
                        {item.discoveryQuestion}
                      </label>
                      <textarea
                        id={`discovery-answer-${index}`}
                        aria-label={`Answer for ${item.requirement}`}
                        value={discoveryAnswers[key] ?? ''}
                        onChange={(event) => handleDiscoveryAnswerChange(item, index, event.target.value)}
                        rows={3}
                        disabled={discoveryRunning}
                        placeholder="Concrete detail, scope, tool, result, or 'No direct experience'."
                        className="mt-2 min-h-[78px] w-full resize-y rounded border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-1.5 text-[11px] leading-snug text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus:ring-1 focus:ring-[var(--bullet-confirm)] disabled:cursor-wait disabled:opacity-60"
                      />
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  {answerCount} answered
                </div>
                <div className="flex items-center gap-2">
                  {answerCount > 0 && (
                    <button
                      type="button"
                      onClick={handleClearDiscoveryAnswers}
                      disabled={discoveryRunning}
                      className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--line-soft)] px-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)] disabled:cursor-wait disabled:opacity-60"
                    >
                      <X className="h-3 w-3" />
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRunDiscoveryAnswers}
                    disabled={answerCount === 0 || discoveryRunning}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded border px-2 text-[11px] font-semibold',
                      answerCount > 0
                        ? 'border-[var(--bullet-confirm-border)] bg-[var(--bullet-confirm-bg)] text-[var(--bullet-confirm)] hover:brightness-105'
                        : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-soft)]',
                      discoveryRunning && 'cursor-wait opacity-60',
                    )}
                  >
                    <RefreshCw className={cn('h-3 w-3', discoveryRunning && 'animate-spin')} />
                    Re-run
                  </button>
                </div>
              </div>
            </div>
          )}

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
                    ref={(el) => {
                      if (el) emphasisRefs.current.set(i, el);
                      else emphasisRefs.current.delete(i);
                    }}
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
                {onRegeneratePosition && (
                  <span className="ml-auto text-[var(--text-soft)] normal-case tracking-normal italic">
                    click to cycle
                  </span>
                )}
              </div>
              <ul className="space-y-1">
                {strategy.positionEmphasis.map((p, i) => {
                  const pending = pendingWeights.get(p.positionIndex);
                  const displayWeight = pending ?? p.weight;
                  const isPending = pending !== undefined;
                  const isRegenerating = pendingPositions?.has(p.positionIndex) ?? false;
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-[var(--text-muted)]">
                        Position {p.positionIndex}
                      </span>
                      {onRegeneratePosition ? (
                        <button
                          type="button"
                          onClick={() => handleCycleWeight(p.positionIndex)}
                          disabled={isRegenerating}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider transition-colors inline-flex items-center gap-1',
                            weightBadgeClass(displayWeight),
                            isPending && 'ring-1 ring-[var(--bullet-confirm)]',
                            isRegenerating && 'cursor-wait opacity-60',
                          )}
                          title={
                            isRegenerating
                              ? 'Regenerating…'
                              : isPending
                                ? `Changed from ${p.weight} — click to cycle further`
                                : 'Click to cycle weight'
                          }
                        >
                          {isRegenerating && (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          )}
                          {displayWeight}
                        </button>
                      ) : (
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider',
                            weightBadgeClass(p.weight),
                          )}
                        >
                          {p.weight}
                        </span>
                      )}
                    </li>
                  );
                })}
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

export function V3StrategyPanel({
  benchmark,
  strategy,
  flashPositionIndex,
  flashTick,
  onRegeneratePosition,
  onRunDiscoveryAnswers,
  discoveryRunning,
  pendingPositions,
}: Props) {
  return (
    <div className="space-y-4">
      <BenchmarkCard benchmark={benchmark} />
      <StrategyCard
        strategy={strategy}
        flashPositionIndex={flashPositionIndex}
        flashTick={flashTick}
        onRegeneratePosition={onRegeneratePosition}
        onRunDiscoveryAnswers={onRunDiscoveryAnswers}
        discoveryRunning={discoveryRunning}
        pendingPositions={pendingPositions}
      />
    </div>
  );
}
