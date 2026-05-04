/**
 * V3StrategyPanel - consumer-facing explanation of the resume rewrite.
 *
 * The pipeline still produces benchmark and strategy objects, but this panel
 * translates them into the questions a normal user is asking:
 * - What did CareerIQ notice about this job?
 * - What did it change in my resume?
 * - What does it need from me before it can claim more?
 * - What did it avoid saying because the proof is not there yet?
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import {
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  V3Strategy,
  V3BenchmarkProfile,
  V3DiscoveryAnswer,
  V3StructuredResume,
  V3WrittenResume,
} from '@/hooks/useV3Pipeline';
import type { PositionWeight } from '@/hooks/useV3Regenerate';

interface Props {
  benchmark: V3BenchmarkProfile | null;
  strategy: V3Strategy | null;
  structured?: V3StructuredResume | null;
  written?: V3WrittenResume | null;
  /**
   * When the user clicks a bullet's source chip in the resume view, this
   * index is set to that bullet's position. Matching proof cards flash so
   * the user can connect the resume line back to the strategy.
   */
  flashPositionIndex?: number | null;
  flashTick?: number;
  /**
   * Kept for API compatibility with the pipeline screen. The consumer panel
   * intentionally hides raw position-weight controls.
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
  /** Kept for API compatibility; advanced position controls are hidden. */
  pendingPositions?: Set<number>;
}

type EvidenceOpportunity = NonNullable<V3Strategy['evidenceOpportunities']>[number];

interface AnswerDraft {
  choice: string;
  detail: string;
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
        <div
          key={i}
          className={cn(
            'h-3 rounded bg-[var(--surface-2)] motion-safe:animate-pulse',
            widths[i % widths.length],
          )}
        />
      ))}
    </div>
  );
}

function StatusPill({
  children,
  tone = 'green',
}: {
  children: React.ReactNode;
  tone?: 'green' | 'amber' | 'blue' | 'muted';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]',
        tone === 'green' && 'border border-[var(--bullet-confirm-border)] bg-[var(--bullet-confirm-bg)] text-[var(--bullet-confirm)]',
        tone === 'amber' && 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]',
        tone === 'blue' && 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]',
        tone === 'muted' && 'border border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)]',
      )}
    >
      {children}
    </span>
  );
}

function positionLabel(
  positionIndex: number | null | undefined,
  structured?: V3StructuredResume | null,
): string {
  if (positionIndex === null || positionIndex === undefined) return 'Career-wide proof';
  const position = structured?.positions[positionIndex];
  if (!position) return 'Professional Experience';
  const title = position.title?.trim();
  const company = position.company?.trim();
  if (title && company) return `${company} - ${title}`;
  return company || title || 'Professional Experience';
}

function defaultPlacement(
  positionIndex: number | null | undefined,
  structured?: V3StructuredResume | null,
): string[] {
  const locations = ['Selected Accomplishments'];
  if (positionIndex !== null && positionIndex !== undefined) {
    locations.push(positionLabel(positionIndex, structured));
  }
  return locations;
}

const STOP_WORDS = new Set([
  'about',
  'across',
  'after',
  'also',
  'and',
  'are',
  'because',
  'been',
  'but',
  'can',
  'for',
  'from',
  'has',
  'have',
  'into',
  'not',
  'over',
  'that',
  'the',
  'this',
  'through',
  'with',
  'without',
  'your',
]);

function contentWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9$%.]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function hasUsefulOverlap(source: string, target: string): boolean {
  const words = contentWords(source);
  if (words.length === 0) return false;
  const targetText = target.toLowerCase();
  const metrics = source.match(/\$?\d[\d.,]*(?:m|k|b|%|mm)?/gi) ?? [];
  if (metrics.length > 0 && metrics.some((metric) => targetText.includes(metric.toLowerCase()))) {
    return true;
  }
  const uniqueWords = [...new Set(words)];
  const hits = uniqueWords.filter((word) => targetText.includes(word)).length;
  return hits >= Math.min(4, Math.max(2, Math.ceil(uniqueWords.length * 0.45)));
}

function findResumeLocations(
  signal: string,
  written?: V3WrittenResume | null,
  fallbackPositionIndex?: number | null,
  structured?: V3StructuredResume | null,
): string[] {
  if (!signal || !written) return defaultPlacement(fallbackPositionIndex, structured);

  const locations: string[] = [];
  if (hasUsefulOverlap(signal, written.summary)) locations.push('Summary');
  if (written.selectedAccomplishments.some((item) => hasUsefulOverlap(signal, item))) {
    locations.push('Selected Accomplishments');
  }
  written.positions.forEach((position) => {
    const positionText = [
      position.scope ?? '',
      ...position.bullets.map((bullet) => bullet.text),
    ].join(' ');
    if (hasUsefulOverlap(signal, positionText)) {
      locations.push(positionLabel(position.positionIndex, structured));
    }
  });

  return locations.length > 0
    ? [...new Set(locations)]
    : defaultPlacement(fallbackPositionIndex, structured);
}

function answerOptionsFor(item: EvidenceOpportunity): string[] {
  const text = `${item.requirement} ${item.discoveryQuestion ?? ''}`.toLowerCase();

  if (/\bp&l\b|profit|loss|budget|financial|margin|capital|working capital|cost target/.test(text)) {
    return [
      'I had final P&L sign-off',
      'I owned budget or cost targets, but not final P&L',
      'I partnered with Finance on P&L reviews',
      'I influenced margin, cost, working capital, or capital allocation',
      'No direct ownership / not sure',
    ];
  }

  if (/board|pe sponsor|private equity|sponsor|executive committee|ceo|cfo|senior leadership/.test(text)) {
    return [
      'Yes, board or PE sponsor',
      'Yes, CEO or executive team',
      'Yes, CFO or finance leadership',
      'Advisory board only',
      'No direct board-facing work / not sure',
    ];
  }

  if (/sap|oracle|erp|system|platform|tool|software/.test(text)) {
    return [
      'Hands-on with this exact system',
      'Worked with a similar system',
      'Led the business side, not the tool work',
      'Only adjacent exposure',
      'No direct experience / not sure',
    ];
  }

  if (/certification|certified|credential|degree|mba|license/.test(text)) {
    return [
      'I have this credential',
      'I have a related credential',
      'I have hands-on experience but no credential',
      'I do not have this credential',
      'Not sure',
    ];
  }

  if (/m&a|merger|acquisition|integration|divestiture|recapitalization/.test(text)) {
    return [
      'I led this directly',
      'I played a major supporting role',
      'I handled adjacent integration work',
      'I have no direct experience',
      'Not sure',
    ];
  }

  return [
    'I have direct proof',
    'I have related experience',
    'I influenced this through adjacent work',
    'No direct experience',
    'Not sure',
  ];
}

function draftToAnswerText(draft: AnswerDraft | undefined): string {
  if (!draft) return '';
  const parts = [draft.choice.trim(), draft.detail.trim()].filter(Boolean);
  return parts.join(' - ');
}

function isDraftAnswered(draft: AnswerDraft | undefined): boolean {
  return draftToAnswerText(draft).length > 0;
}

function useDiscoveryDrafts(discoveryItems: EvidenceOpportunity[]) {
  const signature = useMemo(
    () => discoveryItems.map((item, index) => discoveryKey(item, index)).join('|'),
    [discoveryItems],
  );
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});

  useEffect(() => {
    setDrafts({});
  }, [signature]);

  const setChoice = (item: EvidenceOpportunity, index: number, choice: string) => {
    const key = discoveryKey(item, index);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        choice,
        detail: prev[key]?.detail ?? '',
      },
    }));
  };

  const setDetail = (item: EvidenceOpportunity, index: number, detail: string) => {
    const key = discoveryKey(item, index);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        choice: prev[key]?.choice ?? '',
        detail,
      },
    }));
  };

  return {
    drafts,
    setChoice,
    setDetail,
    clear: () => setDrafts({}),
  };
}

function JobReadCard({
  benchmark,
  strategy,
}: {
  benchmark: V3BenchmarkProfile | null;
  strategy: V3Strategy | null;
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <SearchCheck className="h-4 w-4 text-[var(--bullet-confirm)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          What this job is asking for
        </h2>
      </div>

      {!benchmark && !strategy ? (
        <div className="mt-4">
          <SkeletonPulse rows={4} />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {benchmark?.roleProblemHypothesis && (
            <p className="text-[12px] leading-snug text-[var(--text-muted)]">
              {benchmark.roleProblemHypothesis}
            </p>
          )}

          {(strategy?.positioningFrame || benchmark?.positioningFrame) && (
            <div className="rounded border border-[var(--line-soft)] bg-[var(--surface-1)] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-soft)]">
                <Target className="h-3 w-3" />
                Resume angle
              </div>
              <p className="text-[13px] font-medium leading-snug text-[var(--text-strong)]">
                {strategy?.positioningFrame ?? benchmark?.positioningFrame}
              </p>
              {strategy?.editorialAssessment?.strongestAngle && (
                <p className="mt-2 text-[11px] leading-snug text-[var(--text-muted)]">
                  Best proof to lead with: {strategy.editorialAssessment.strongestAngle}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function UsedProofCard({
  strategy,
  structured,
  written,
  flashPositionIndex,
  flashTick,
}: {
  strategy: V3Strategy | null;
  structured?: V3StructuredResume | null;
  written?: V3WrittenResume | null;
  flashPositionIndex?: number | null;
  flashTick?: number;
}) {
  const emphasisRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (flashPositionIndex === null || flashPositionIndex === undefined) return;
    strategy?.emphasizedAccomplishments.forEach((item, index) => {
      if (item.positionIndex !== flashPositionIndex) return;
      const el = emphasisRefs.current.get(index);
      if (!el) return;
      el.classList.remove('v3-strategy-flash');
      void el.offsetWidth;
      el.classList.add('v3-strategy-flash');
    });
  }, [flashPositionIndex, flashTick, strategy]);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--bullet-confirm)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          What we changed in your resume
        </h2>
      </div>

      {!strategy ? (
        <div className="mt-4">
          <SkeletonPulse rows={3} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {strategy.editorialAssessment?.recommendedMove && (
            <div className="rounded border border-[var(--bullet-confirm-border)] bg-[var(--bullet-confirm-bg)] p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--bullet-confirm)]">
                Main rewrite move
              </div>
              <p className="text-[12px] leading-snug text-[var(--text-strong)]">
                {strategy.editorialAssessment.recommendedMove}
              </p>
            </div>
          )}

          {strategy.emphasizedAccomplishments.length > 0 ? (
            <ul className="space-y-2">
              {strategy.emphasizedAccomplishments.map((item, index) => {
                const locations = findResumeLocations(
                  item.summary,
                  written,
                  item.positionIndex,
                  structured,
                );
                return (
                  <li
                    key={`${item.summary}-${index}`}
                    ref={(el) => {
                      if (el) emphasisRefs.current.set(index, el);
                      else emphasisRefs.current.delete(index);
                    }}
                    className="rounded border border-[var(--line-soft)] bg-[var(--surface-1)] p-3 text-[12px] leading-snug"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <StatusPill>Used</StatusPill>
                      <span className="text-[10px] text-[var(--text-soft)]">
                        {positionLabel(item.positionIndex, structured)}
                      </span>
                    </div>
                    <p className="font-medium text-[var(--text-strong)]">{item.summary}</p>
                    {item.rationale && (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Why it matters: {item.rationale}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-soft)]">
                      Look for it in: {locations.join(', ')}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12px] leading-snug text-[var(--text-muted)]">
              We are still identifying the strongest proof to move into the resume.
            </p>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function DiscoveryCard({
  strategy,
  onRunDiscoveryAnswers,
  discoveryRunning,
}: {
  strategy: V3Strategy | null;
  onRunDiscoveryAnswers?: (answers: V3DiscoveryAnswer[]) => void;
  discoveryRunning?: boolean;
}) {
  const evidenceOpportunities = strategy?.evidenceOpportunities ?? [];
  const discoveryItems = useMemo(
    () => evidenceOpportunities.filter(shouldAskDiscoveryQuestion),
    [evidenceOpportunities],
  );
  const { drafts, setChoice, setDetail, clear } = useDiscoveryDrafts(discoveryItems);

  const answerCount = discoveryItems.reduce((count, item, index) => {
    return count + (isDraftAnswered(drafts[discoveryKey(item, index)]) ? 1 : 0);
  }, 0);

  const handleRunDiscoveryAnswers = () => {
    if (!onRunDiscoveryAnswers) return;
    const answers = discoveryItems.flatMap((item, index): V3DiscoveryAnswer[] => {
      const answer = draftToAnswerText(drafts[discoveryKey(item, index)]);
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

  if (!strategy || discoveryItems.length === 0) {
    return null;
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-[var(--badge-amber-text)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Questions that could make this stronger
        </h2>
      </div>

      <p className="mt-3 text-[12px] leading-snug text-[var(--text-muted)]">
        We did not claim these yet. If you have proof, answer here and we will
        rebuild the resume with the stronger, confirmed version.
      </p>

      <ul className="mt-4 space-y-4">
        {discoveryItems.map((item, index) => {
          const key = discoveryKey(item, index);
          const draft = drafts[key];
          return (
            <li
              key={key}
              className="rounded border border-[var(--badge-amber-text)]/30 bg-[var(--surface-1)] p-3 text-[12px] leading-snug"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <StatusPill tone="amber">Needs your answer</StatusPill>
                  <p className="mt-2 font-medium text-[var(--text-strong)]">
                    {item.requirement}
                  </p>
                </div>
              </div>

              {item.sourceSignal && (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Current proof: {item.sourceSignal}
                </p>
              )}

              <label
                htmlFor={`discovery-detail-${index}`}
                className="mt-3 block text-[11px] font-medium text-[var(--text-strong)]"
              >
                {item.discoveryQuestion}
              </label>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {answerOptionsFor(item).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setChoice(item, index, option)}
                    disabled={discoveryRunning || !onRunDiscoveryAnswers}
                    className={cn(
                      'rounded border px-2 py-1 text-[10px] font-medium transition-colors',
                      draft?.choice === option
                        ? 'border-[var(--bullet-confirm-border)] bg-[var(--bullet-confirm-bg)] text-[var(--bullet-confirm)]'
                        : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-strong)]',
                      (discoveryRunning || !onRunDiscoveryAnswers) && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <textarea
                id={`discovery-detail-${index}`}
                aria-label={`Add detail for ${item.requirement}`}
                value={draft?.detail ?? ''}
                onChange={(event) => setDetail(item, index, event.target.value)}
                rows={3}
                disabled={discoveryRunning || !onRunDiscoveryAnswers}
                placeholder="Optional: add budget size, decision rights, audience, cadence, tool, metric, or outcome."
                className="mt-3 min-h-[76px] w-full resize-y rounded border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-1.5 text-[11px] leading-snug text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus:ring-1 focus:ring-[var(--bullet-confirm)] disabled:cursor-wait disabled:opacity-60"
              />

              <p className="mt-2 text-[10px] leading-snug text-[var(--text-soft)]">
                Current handling: {item.recommendedFraming}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-soft)]">
          {answerCount} answered
        </div>
        <div className="flex items-center gap-2">
          {answerCount > 0 && (
            <button
              type="button"
              onClick={clear}
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
            disabled={answerCount === 0 || discoveryRunning || !onRunDiscoveryAnswers}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded border px-2 text-[11px] font-semibold',
              answerCount > 0 && onRunDiscoveryAnswers
                ? 'border-[var(--bullet-confirm-border)] bg-[var(--bullet-confirm-bg)] text-[var(--bullet-confirm)] hover:brightness-105'
                : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-soft)]',
              (discoveryRunning || !onRunDiscoveryAnswers) && 'cursor-wait opacity-60',
            )}
          >
            <RefreshCw className={cn('h-3 w-3', discoveryRunning && 'animate-spin')} />
            Rebuild resume with my answers
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

function HandledCarefullyCard({
  benchmark,
  strategy,
}: {
  benchmark: V3BenchmarkProfile | null;
  strategy: V3Strategy | null;
}) {
  const evidenceOpportunities = strategy?.evidenceOpportunities ?? [];
  const unansweredRiskItems = evidenceOpportunities.filter((item) => {
    if (item.level === 'direct_proof' || item.level === 'reasonable_inference') return false;
    if (shouldAskDiscoveryQuestion(item)) return false;
    return item.level === 'unsupported' || item.risk === 'high';
  });
  const benchmarkGaps = benchmark?.gapAssessment.filter((gap) => gap.severity !== 'noise') ?? [];
  const objections = strategy?.objections ?? [];
  const hasItems = unansweredRiskItems.length > 0 || benchmarkGaps.length > 0 || objections.length > 0;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-[var(--badge-blue-text)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          What we handled carefully
        </h2>
      </div>

      {!benchmark && !strategy ? (
        <div className="mt-4">
          <SkeletonPulse rows={3} />
        </div>
      ) : !hasItems ? (
        <p className="mt-4 text-[12px] leading-snug text-[var(--text-muted)]">
          No unsupported claims stood out. The resume stayed inside the proof we found.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {objections.slice(0, 3).map((item, index) => (
            <div
              key={`objection-${index}`}
              className="rounded border border-[var(--line-soft)] bg-[var(--surface-1)] p-3 text-[12px] leading-snug"
            >
              <StatusPill tone="blue">Handled without overclaiming</StatusPill>
              <p className="mt-2 text-[var(--text-muted)]">
                Possible concern: {item.objection}
              </p>
              <p className="mt-1 font-medium text-[var(--text-strong)]">
                Resume response: {item.rebuttal}
              </p>
            </div>
          ))}

          {unansweredRiskItems.slice(0, 3).map((item, index) => (
            <div
              key={`risk-${index}`}
              className="rounded border border-[var(--line-soft)] bg-[var(--surface-1)] p-3 text-[12px] leading-snug"
            >
              <StatusPill tone="muted">Not claimed yet</StatusPill>
              <p className="mt-2 font-medium text-[var(--text-strong)]">
                {item.requirement}
              </p>
              <p className="mt-1 text-[var(--text-muted)]">
                Current safe handling: {item.recommendedFraming}
              </p>
            </div>
          ))}

          {benchmarkGaps.slice(0, 2).map((gap, index) => (
            <div
              key={`gap-${index}`}
              className="rounded border border-[var(--line-soft)] bg-[var(--surface-1)] p-3 text-[12px] leading-snug"
            >
              <StatusPill tone="amber">Careful framing</StatusPill>
              <p className="mt-2 text-[var(--text-muted)]">
                Gap we noticed: {gap.gap}
              </p>
              <p className="mt-1 font-medium text-[var(--text-strong)]">
                How we positioned around it: {gap.bridgingStrategy}
              </p>
            </div>
          ))}

          <p className="text-[11px] leading-snug text-[var(--text-soft)]">
            If one of these is stronger than your source material shows, answer
            the question above and rebuild. Otherwise, CareerIQ keeps the claim
            conservative so the resume does not overstate your record.
          </p>
        </div>
      )}
    </GlassCard>
  );
}

function ProofReceiptsCard({
  strategy,
}: {
  strategy: V3Strategy | null;
}) {
  const proofItems = (strategy?.evidenceOpportunities ?? [])
    .filter((item) => item.level === 'direct_proof' || item.level === 'reasonable_inference')
    .slice(0, 4);

  if (!strategy || proofItems.length === 0) {
    return null;
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-[var(--bullet-confirm)]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Proof we found
        </h2>
      </div>

      <ul className="mt-4 space-y-2">
        {proofItems.map((item, index) => (
          <li
            key={`${item.requirement}-${index}`}
            className="rounded border border-[var(--line-soft)] bg-[var(--surface-1)] p-3 text-[12px] leading-snug"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-medium text-[var(--text-strong)]">{item.requirement}</p>
              <StatusPill>{item.level === 'direct_proof' ? 'Direct proof' : 'Supported'}</StatusPill>
            </div>
            {item.sourceSignal && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Source: {item.sourceSignal}
              </p>
            )}
            <p className="mt-1 text-[11px] text-[var(--text-soft)]">
              Resume handling: {item.recommendedFraming}
            </p>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

export function V3StrategyPanel({
  benchmark,
  strategy,
  structured,
  written,
  flashPositionIndex,
  flashTick,
  onRunDiscoveryAnswers,
  discoveryRunning,
}: Props) {
  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bullet-confirm)]" />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--text-strong)]">
              Why we wrote this resume this way
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
              CareerIQ compares the job to your source material, rewrites only
              from proof it can support, and asks before making stronger claims.
            </p>
          </div>
        </div>
      </GlassCard>

      <JobReadCard benchmark={benchmark} strategy={strategy} />
      <UsedProofCard
        strategy={strategy}
        structured={structured}
        written={written}
        flashPositionIndex={flashPositionIndex}
        flashTick={flashTick}
      />
      <DiscoveryCard
        strategy={strategy}
        onRunDiscoveryAnswers={onRunDiscoveryAnswers}
        discoveryRunning={discoveryRunning}
      />
      <HandledCarefullyCard benchmark={benchmark} strategy={strategy} />
      <ProofReceiptsCard strategy={strategy} />
    </div>
  );
}
