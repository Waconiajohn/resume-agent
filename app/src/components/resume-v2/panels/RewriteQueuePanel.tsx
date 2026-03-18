import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  MessagesSquare,
  ShieldAlert,
  Target,
} from 'lucide-react';
import type {
  BenchmarkCandidate,
  CoachingThreadSnapshot,
  FinalReviewChatContext,
  FinalReviewResult,
  GapAnalysis,
  GapChatContext,
  GapCoachingCard,
  JobIntelligence,
  PositioningAssessment,
  ResumeDraft,
  RewriteQueueItem,
} from '@/types/resume-v2';
import type { EditAction, EditContext } from '@/hooks/useInlineEdit';
import type { HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import { buildEditContext, findBulletForRequirement } from '../utils/coaching-actions';
import { buildRewriteQueue } from '@/lib/rewrite-queue';
import { GapChatThread } from './GapChatThread';

interface RewriteQueuePanelProps {
  jobIntelligence: JobIntelligence;
  positioningAssessment: PositioningAssessment | null;
  gapAnalysis: GapAnalysis;
  benchmarkCandidate?: BenchmarkCandidate | null;
  currentResume?: ResumeDraft | null;
  gapCoachingCards?: GapCoachingCard[] | null;
  gapChat?: GapChatHook | null;
  gapChatSnapshot?: CoachingThreadSnapshot | null;
  buildChatContext?: (requirement: string) => GapChatContext;
  finalReviewResult?: FinalReviewResult | null;
  finalReviewChat?: FinalReviewChatHook | null;
  finalReviewChatSnapshot?: CoachingThreadSnapshot | null;
  buildFinalReviewChatContext?: (concern: HiringManagerConcern) => FinalReviewChatContext | null;
  resolvedFinalReviewConcernIds?: string[];
  onRequirementClick: (requirement: string) => void;
  onRequestEdit?: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: EditContext) => void;
  onApplyFinalReviewRecommendation?: (
    concern: HiringManagerConcern,
    languageOverride?: string,
    candidateInputUsed?: boolean,
  ) => void;
  onRequestHiringManagerReview?: () => void;
  isEditing?: boolean;
}

const SOURCE_LABELS = {
  job_description: 'Job Description',
  benchmark: 'Benchmark',
  final_review: 'Final Review',
} as const;

const CATEGORY_LABELS: Record<RewriteQueueItem['category'], string> = {
  quick_win: 'Quick Win',
  proof_upgrade: 'Needs Proof',
  hard_gap: 'Hard Requirement',
  benchmark_stretch: 'Benchmark Stretch',
  final_review_issue: 'Final Review',
};

const BUCKETS: Array<{
  id: RewriteQueueItem['bucket'];
  title: string;
  description: string;
}> = [
  {
    id: 'needs_attention',
    title: 'Fix First',
    description: 'Start with the small group of highest-value fixes. We keep this list short so you always know what to do next.',
  },
  {
    id: 'partially_addressed',
    title: 'Can Be Stronger',
    description: 'These items have some movement already, but they are not yet carrying enough proof.',
  },
  {
    id: 'resolved',
    title: 'Done',
    description: 'These items already have accepted evidence in the current draft.',
  },
];

const FIX_FIRST_VISIBLE_LIMIT = 5;

function QueueStat({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: number;
  tone: string;
  detail?: string;
}) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${tone}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="mt-2 text-base font-semibold text-white/86">{value}</p>
      {detail && <p className="mt-1 text-[11px] leading-4 text-white/42">{detail}</p>}
    </div>
  );
}

function CurrentProofPreview({ item }: { item: RewriteQueueItem }) {
  const firstEvidence = item.currentEvidence[0];
  if (!firstEvidence) {
    return (
      <p className="text-sm leading-6 text-white/52">
        Nothing on the current resume proves this yet.
      </p>
    );
  }

  const isNearbyEvidence = firstEvidence.basis === 'nearby';

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">
        {isNearbyEvidence ? 'Nearby proof we can strengthen' : 'Current proof'}
        {firstEvidence.section ? ` · ${firstEvidence.section}` : ''}
      </p>
      {isNearbyEvidence && (
        <p className="mt-1 text-xs leading-5 text-white/48">
          We found related experience nearby, but it is not yet direct proof for this requirement.
        </p>
      )}
      <p className="mt-1 text-sm leading-6 text-white/72">{firstEvidence.text}</p>
    </div>
  );
}

function EvidenceList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: RewriteQueueItem['currentEvidence'];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">{title}</p>
      {items.length === 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm leading-6 text-white/50">
          {emptyLabel}
        </div>
      ) : (
        items.slice(0, 2).map((item, index) => (
          <div key={`${item.text}-${index}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {item.section && <p className="text-[11px] text-white/42">{item.section}</p>}
              {item.basis === 'nearby' && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/38">
                  Nearby proof
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-6 text-white/74">{item.text}</p>
          </div>
        ))
      )}
    </div>
  );
}

export function RewriteQueuePanel({
  jobIntelligence,
  positioningAssessment,
  gapAnalysis,
  benchmarkCandidate,
  currentResume,
  gapCoachingCards,
  gapChat,
  gapChatSnapshot,
  buildChatContext,
  finalReviewResult,
  finalReviewChat: _finalReviewChat,
  finalReviewChatSnapshot,
  buildFinalReviewChatContext: _buildFinalReviewChatContext,
  resolvedFinalReviewConcernIds = [],
  onRequirementClick,
  onRequestEdit,
  onApplyFinalReviewRecommendation: _onApplyFinalReviewRecommendation,
  onRequestHiringManagerReview: _onRequestHiringManagerReview,
  isEditing = false,
}: RewriteQueuePanelProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [showAllFixFirst, setShowAllFixFirst] = useState(false);
  const [placementWarnings, setPlacementWarnings] = useState<Record<string, string>>({});

  const queue = useMemo(() => buildRewriteQueue({
    jobIntelligence,
    gapAnalysis,
    currentResume,
    benchmarkCandidate,
    gapCoachingCards,
    gapChatSnapshot,
    finalReviewResult,
    finalReviewChatSnapshot,
    resolvedFinalReviewConcernIds,
  }), [
    benchmarkCandidate,
    currentResume,
    finalReviewResult,
    finalReviewChatSnapshot,
    gapAnalysis,
    gapChatSnapshot,
    gapCoachingCards,
    jobIntelligence,
    resolvedFinalReviewConcernIds,
  ]);

  const nextItem = queue.nextItem;
  const visibleFixFirstCount = Math.min(queue.summary.needsAttention, FIX_FIRST_VISIBLE_LIMIT);
  const queuedAfterFixFirst = Math.max(queue.summary.needsAttention - FIX_FIRST_VISIBLE_LIMIT, 0);

  const handlePrimaryAction = (item: RewriteQueueItem) => {
    if (item.status === 'already_covered' && item.requirement && item.currentEvidence.some((evidence) => Boolean(evidence.section))) {
      onRequirementClick(item.requirement);
      return;
    }

    setExpandedItemId((previous) => previous === item.id ? null : item.id);
  };

  const renderThread = (item: RewriteQueueItem) => {
    if (expandedItemId !== item.id) return null;
    if (item.kind !== 'requirement' || !item.requirement || !gapChat || !buildChatContext || !currentResume || !onRequestEdit) {
      return null;
    }

    const chatState = gapChat.getItemState(item.requirement);
    const chatContext = buildChatContext(item.requirement);

    return (
      <GapChatThread
        requirement={item.requirement}
        classification={item.classification === 'strong' ? 'strong' : item.classification === 'partial' ? 'partial' : 'missing'}
        messages={chatState?.messages ?? []}
        isLoading={chatState?.isLoading ?? false}
        error={chatState?.error ?? null}
        resolvedLanguage={chatState?.resolvedLanguage ?? null}
        onSendMessage={gapChat.sendMessage}
        onAcceptLanguage={(requirement, language, candidateInputUsed) => {
          const target = findBulletForRequirement(requirement, positioningAssessment, currentResume);
          if (!target) {
            setPlacementWarnings((previous) => ({
              ...previous,
              [item.id]: 'We could not place this automatically yet. Open a section on the resume first or answer one more question so we can anchor the edit in the right place.',
            }));
            return;
          }

          setPlacementWarnings((previous) => {
            const next = { ...previous };
            delete next[item.id];
            return next;
          });

          onRequestEdit(
            target.text,
            target.section,
            'custom',
            `Naturally integrate this coached resume language into the text: "${language}". This addresses the requirement: "${requirement}".`,
            buildEditContext(
              requirement,
              item.currentEvidence.map((evidence) => evidence.text),
              language,
              {
                origin: 'gap',
                candidateInputUsed,
                scoreDomain: item.source === 'benchmark' ? 'benchmark' : 'job_description',
              },
            ),
          );
        }}
        context={chatContext}
        isEditing={isEditing}
        onSkip={() => setExpandedItemId(null)}
      />
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b1018]">
      <div className="space-y-4 border-b border-white/[0.06] px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-[#afc4ff]/18 bg-[#afc4ff]/[0.07] p-2.5">
            <Target className="h-4 w-4 text-[#afc4ff]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white/88">What to Fix Next</h2>
            <p className="mt-1 text-sm leading-6 text-white/54">
              AI already read your resume, studied the job description, built a benchmark candidate, and compared that work against your current draft.
              Work one issue at a time. Answer the next question or review the next edit. Nothing changes on the resume until you accept the edit.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <QueueStat
            label="Fix First Now"
            value={visibleFixFirstCount}
            detail={queuedAfterFixFirst > 0 ? `${queuedAfterFixFirst} more queued after these` : undefined}
            tone="border-[#f0b8b8]/16 bg-[#f0b8b8]/[0.05]"
          />
          <QueueStat label="Can Be Stronger" value={queue.summary.partiallyAddressed} tone="border-[#afc4ff]/16 bg-[#afc4ff]/[0.05]" />
          <QueueStat label="Done" value={queue.summary.resolved} tone="border-[#b5dec2]/16 bg-[#b5dec2]/[0.05]" />
        </div>

        {nextItem && (
          <div className="rounded-2xl border border-[#afc4ff]/16 bg-[#0f1622] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#afc4ff]/72">Recommended Next Step</p>
                <p className="mt-2 text-sm font-semibold text-white/86">{nextItem.title}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">
                  {SOURCE_LABELS[nextItem.source]}
                </span>
                <span className="rounded-full border border-[#afc4ff]/18 bg-[#afc4ff]/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#afc4ff]">
                  {CATEGORY_LABELS[nextItem.category]}
                </span>
              </div>
            </div>

            <div className="mt-3 space-y-3 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">Why this matters</p>
                <p className="mt-1 text-sm leading-6 text-white/68">{nextItem.whyItMatters}</p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">What AI will do</p>
                <p className="mt-1 text-sm leading-6 text-white/66">{nextItem.aiPlan}</p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">What you should do now</p>
                <p className="mt-1 text-sm leading-6 text-white/66">{nextItem.userInstruction}</p>
              </div>

              <CurrentProofPreview item={nextItem} />

              {nextItem.starterQuestion && (
                <div className="rounded-lg border border-[#afc4ff]/16 bg-[#afc4ff]/[0.04] px-3 py-2 text-xs leading-5 text-white/72">
                  First question: {nextItem.starterQuestion}
                </div>
              )}

              {nextItem.riskNote && (
                <div className="rounded-lg border border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] px-3 py-2 text-xs leading-5 text-white/70">
                  {nextItem.riskNote}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handlePrimaryAction(nextItem)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/[0.08] px-3 py-2 text-xs font-medium text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/[0.14]"
                >
                  <MessagesSquare className="h-3.5 w-3.5" />
                  {nextItem.recommendedNextStep.label}
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedItemId((previous) => previous === nextItem.id ? null : nextItem.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/64 transition-colors hover:bg-white/[0.06] hover:text-white/82"
                >
                  <ChevronRight
                    className="h-3.5 w-3.5 transition-transform"
                    style={{ transform: expandedItemId === nextItem.id ? 'rotate(90deg)' : 'none' }}
                  />
                  {expandedItemId === nextItem.id ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5 px-5 py-5">
        {BUCKETS.map((bucket) => {
          const items = queue.items.filter((item) => item.bucket === bucket.id);
          if (items.length === 0) return null;

          const isResolvedBucket = bucket.id === 'resolved';
          const isFixFirstBucket = bucket.id === 'needs_attention';
          const bucketOpen = !isResolvedBucket || showResolved;
          const visibleItems = isFixFirstBucket && !showAllFixFirst
            ? items.slice(0, FIX_FIRST_VISIBLE_LIMIT)
            : items;
          const hiddenFixFirstCount = isFixFirstBucket ? Math.max(items.length - visibleItems.length, 0) : 0;

          return (
            <section key={bucket.id} className="space-y-3" aria-label={bucket.title}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white/84">{bucket.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/46">{bucket.description}</p>
                </div>
                {(isResolvedBucket || hiddenFixFirstCount > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isResolvedBucket) {
                        setShowResolved((previous) => !previous);
                        return;
                      }
                      setShowAllFixFirst((previous) => !previous);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/56 transition-colors hover:bg-white/[0.06] hover:text-white/78"
                    aria-expanded={isResolvedBucket ? bucketOpen : showAllFixFirst}
                  >
                    <ChevronRight
                      className="h-3.5 w-3.5 transition-transform"
                      style={{ transform: (isResolvedBucket ? bucketOpen : showAllFixFirst) ? 'rotate(90deg)' : 'none' }}
                    />
                    {isResolvedBucket
                      ? (bucketOpen ? 'Hide Done' : `Show Done (${items.length})`)
                      : (showAllFixFirst ? 'Show fewer first-priority items' : `Show all queued issues (${hiddenFixFirstCount})`)}
                  </button>
                )}
              </div>

              {bucketOpen && (
                <div className="space-y-3">
                  {visibleItems.map((item) => {
                    const hasViewableEvidence = item.currentEvidence.some((evidence) => Boolean(evidence.section));
                    const isExpanded = expandedItemId === item.id;
                    const isPrimary = nextItem?.id === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border px-4 py-4 transition-colors ${
                          isExpanded
                            ? isPrimary
                              ? 'border-[#afc4ff]/28 bg-[#afc4ff]/[0.06]'
                              : 'border-white/[0.14] bg-white/[0.045]'
                            : isPrimary
                              ? 'border-[#afc4ff]/18 bg-[#afc4ff]/[0.04]'
                              : 'border-white/[0.06] bg-white/[0.025]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {item.bucket === 'resolved' ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#b5dec2]" />
                            ) : item.category === 'hard_gap' ? (
                              <ShieldAlert className="h-4 w-4 shrink-0 text-[#f0d99f]" />
                            ) : isPrimary ? (
                              <Target className="h-4 w-4 shrink-0 text-[#afc4ff]" />
                            ) : (
                              <AlertCircle className="h-4 w-4 shrink-0 text-white/26" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  {isPrimary && item.bucket !== 'resolved' && (
                                    <span className="rounded-full border border-[#afc4ff]/18 bg-[#afc4ff]/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#afc4ff]">
                                      Work this now
                                    </span>
                                  )}
                                  <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">
                                    {SOURCE_LABELS[item.source]}
                                  </span>
                                  <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
                                    item.category === 'hard_gap'
                                      ? 'border-[#f0d99f]/18 bg-[#f0d99f]/[0.06] text-[#f0d99f]'
                                      : 'border-[#afc4ff]/18 bg-[#afc4ff]/[0.06] text-[#afc4ff]'
                                  }`}>
                                    {CATEGORY_LABELS[item.category]}
                                  </span>
                                </div>

                                <div>
                                  <p className="text-sm font-semibold leading-6 text-white/88">{item.title}</p>
                                  <p className="mt-1 text-sm leading-6 text-white/58">{item.whyItMatters}</p>
                                </div>

                                <CurrentProofPreview item={item} />
                              </div>

                              <button
                                type="button"
                                onClick={() => setExpandedItemId((previous) => previous === item.id ? null : item.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/56 transition-colors hover:bg-white/[0.06] hover:text-white/78"
                                aria-expanded={isExpanded}
                                aria-label={`Toggle details for ${item.title}`}
                              >
                                <ChevronRight
                                  className="h-3.5 w-3.5 transition-transform"
                                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
                                />
                                {isExpanded ? 'Hide Details' : 'Show Details'}
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handlePrimaryAction(item)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/[0.08] px-3 py-2 text-xs font-medium text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/[0.14]"
                              >
                                <MessagesSquare className="h-3.5 w-3.5" />
                                {item.recommendedNextStep.label}
                              </button>

                              {hasViewableEvidence && item.requirement && (
                                <button
                                  type="button"
                                  onClick={() => onRequirementClick(item.requirement!)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/64 transition-colors hover:bg-white/[0.06] hover:text-white/82"
                                >
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                  View Current Proof
                                </button>
                              )}
                            </div>

                            {isExpanded && (
                              <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-black/15 px-3 py-3">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">What AI is doing</p>
                                  <p className="mt-1 text-sm leading-6 text-white/68">{item.aiPlan}</p>
                                </div>

                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">What you should do</p>
                                  <p className="mt-1 text-sm leading-6 text-white/68">{item.userInstruction}</p>
                                </div>

                                {item.starterQuestion && item.bucket !== 'resolved' && (
                                  <div className="rounded-lg border border-[#afc4ff]/16 bg-[#afc4ff]/[0.05] px-3 py-2 text-xs leading-5 text-white/72">
                                    First question: {item.starterQuestion}
                                  </div>
                                )}

                                {item.riskNote && (
                                  <div className="rounded-lg border border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] px-3 py-2 text-xs leading-5 text-white/70">
                                    {item.riskNote}
                                  </div>
                                )}

                                <EvidenceList
                                  title="What the resume says today"
                                  items={item.currentEvidence}
                                  emptyLabel="Nothing on the current resume proves this yet."
                                />

                                {item.sourceEvidence.length > 0 && (
                                  <EvidenceList
                                    title="Why AI flagged this"
                                    items={item.sourceEvidence}
                                    emptyLabel="No source excerpt is available for this item."
                                  />
                                )}

                                {placementWarnings[item.id] && (
                                  <div className="rounded-lg border border-[#f0b8b8]/18 bg-[#f0b8b8]/[0.05] px-3 py-2 text-xs leading-5 text-[#f0b8b8]">
                                    {placementWarnings[item.id]}
                                  </div>
                                )}

                                {renderThread(item)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
