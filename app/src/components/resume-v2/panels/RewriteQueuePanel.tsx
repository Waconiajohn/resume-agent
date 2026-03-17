import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  MessagesSquare,
  Sparkles,
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
  RewriteQueueStatus,
} from '@/types/resume-v2';
import type { EditAction, EditContext } from '@/hooks/useInlineEdit';
import type { HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import { buildEditContext, findBulletForRequirement } from '../utils/coaching-actions';
import { buildRewriteQueue } from '@/lib/rewrite-queue';
import { GapChatThread } from './GapChatThread';
import { FinalReviewConcernThread } from '../cards/FinalReviewConcernThread';

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

const STATUS_STYLES: Record<RewriteQueueStatus, string> = {
  already_covered: 'border-[#b5dec2]/20 bg-[#b5dec2]/[0.06] text-[#b5dec2]',
  partially_addressed: 'border-[#afc4ff]/20 bg-[#afc4ff]/[0.06] text-[#afc4ff]',
  needs_more_evidence: 'border-[#f0d99f]/20 bg-[#f0d99f]/[0.06] text-[#f0d99f]',
  not_addressed: 'border-[#f0b8b8]/20 bg-[#f0b8b8]/[0.06] text-[#f0b8b8]',
};

const STATUS_LABELS: Record<RewriteQueueStatus, string> = {
  already_covered: 'Already Covered',
  partially_addressed: 'Partially Addressed',
  needs_more_evidence: 'Needs More Evidence',
  not_addressed: 'Not Addressed',
};

const SOURCE_LABELS = {
  job_description: 'Job Description',
  benchmark: 'Benchmark',
  final_review: 'Final Review',
} as const;

const BUCKETS: Array<{
  id: RewriteQueueItem['bucket'];
  title: string;
  description: string;
}> = [
  {
    id: 'needs_attention',
    title: 'Needs Attention',
    description: 'These are the highest-value items to work next.',
  },
  {
    id: 'partially_addressed',
    title: 'Partially Addressed',
    description: 'You have movement here, but the draft still needs stronger proof or wording.',
  },
  {
    id: 'resolved',
    title: 'Resolved',
    description: 'These items already have accepted evidence in the current draft.',
  },
];

function QueueStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${tone}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="mt-2 text-base font-semibold text-white/86">{value}</p>
    </div>
  );
}

function ItemMeta({ item }: { item: RewriteQueueItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${STATUS_STYLES[item.status]}`}>
        {STATUS_LABELS[item.status]}
      </span>
      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">
        {SOURCE_LABELS[item.source]}
      </span>
      {item.importance && (
        <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/38">
          {item.importance.replaceAll('_', ' ')}
        </span>
      )}
      {item.severity && (
        <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/38">
          {item.severity}
        </span>
      )}
    </div>
  );
}

function EvidenceSummary({
  currentCount,
  sourceCount,
  needsCandidateInput,
}: {
  currentCount: number;
  sourceCount: number;
  needsCandidateInput?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-white/40">
      <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1">
        {currentCount === 0 ? 'No accepted proof yet' : `${currentCount} accepted proof${currentCount === 1 ? '' : 's'}`}
      </span>
      <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1">
        {sourceCount} source note{sourceCount === 1 ? '' : 's'}
      </span>
      {needsCandidateInput && (
        <span className="rounded-full border border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] px-2.5 py-1 text-[#f0d99f]">
          Needs one more detail
        </span>
      )}
    </div>
  );
}

function EvidenceList({
  label,
  items,
}: {
  label: string;
  items: RewriteQueueItem['currentEvidence'];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs leading-5 text-white/42">
        {label}: no accepted resume evidence yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">{label}</p>
      {items.slice(0, 2).map((item, index) => (
        <div key={`${item.text}-${index}`} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {item.section && (
              <span className="text-[11px] text-white/42">{item.section}</span>
            )}
            {item.isNew && (
              <span className="rounded-full border border-[#b5dec2]/20 bg-[#b5dec2]/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#b5dec2]">
                New
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-white/74">{item.text}</p>
        </div>
      ))}
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
  finalReviewChat,
  finalReviewChatSnapshot,
  buildFinalReviewChatContext,
  resolvedFinalReviewConcernIds = [],
  onRequirementClick,
  onRequestEdit,
  onApplyFinalReviewRecommendation,
  onRequestHiringManagerReview,
  isEditing = false,
}: RewriteQueuePanelProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

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

  const concernMap = useMemo(() => new Map(
    (finalReviewResult?.concerns ?? []).map((concern) => [concern.id, concern]),
  ), [finalReviewResult]);
  const nextItem = queue.nextItem;

  const handlePrimaryAction = (item: RewriteQueueItem) => {
    if (item.kind === 'final_review' && item.concernId) {
      const concern = concernMap.get(item.concernId);
      if (concern && item.recommendedNextStep.action === 'review_suggested_fix') {
        onApplyFinalReviewRecommendation?.(concern);
        return;
      }
      setExpandedItemId((previous) => previous === item.id ? null : item.id);
      return;
    }

    if (item.requirement && item.status === 'already_covered') {
      onRequirementClick(item.requirement);
      return;
    }

    setExpandedItemId((previous) => previous === item.id ? null : item.id);
  };

  const renderThread = (item: RewriteQueueItem) => {
    if (expandedItemId !== item.id) return null;

    if (item.kind === 'requirement' && item.requirement && gapChat && buildChatContext) {
      const chatState = gapChat.getItemState(item.requirement);
      const chatContext = buildChatContext(item.requirement);
      if (!currentResume || !onRequestEdit) return null;

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
            const fallbackTarget = !target && currentResume.professional_experience[0]?.bullets[0]
              ? {
                  text: currentResume.professional_experience[0].bullets[0].text,
                  section: `Professional Experience - ${currentResume.professional_experience[0].company}`,
                }
              : null;
            const editTarget = target ?? fallbackTarget;
            if (!editTarget) return;

            onRequestEdit(
              editTarget.text,
              editTarget.section,
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
    }

    if (item.kind === 'final_review' && item.concernId && finalReviewChat && buildFinalReviewChatContext) {
      const concern = concernMap.get(item.concernId);
      if (!concern) return null;
      const chatState = finalReviewChat.getItemState(item.concernId);
      const chatContext = buildFinalReviewChatContext(concern);
      if (!chatContext) return null;

      return (
        <FinalReviewConcernThread
          concernId={item.concernId}
          messages={chatState?.messages ?? []}
          isLoading={chatState?.isLoading ?? false}
          error={chatState?.error ?? null}
          resolvedLanguage={chatState?.resolvedLanguage ?? null}
          onSendMessage={finalReviewChat.sendMessage}
          onReviewEdit={(concernId, language, candidateInputUsed) => {
            const mappedConcern = concernMap.get(concernId);
            if (!mappedConcern) return;
            onApplyFinalReviewRecommendation?.(mappedConcern, language, candidateInputUsed);
          }}
          context={chatContext}
          isEditing={isEditing}
          onCloseThread={() => setExpandedItemId(null)}
        />
      );
    }

    return null;
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b1018]">
      <div className="px-5 py-5 space-y-4 border-b border-white/[0.06]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-[#afc4ff]/18 bg-[#afc4ff]/[0.07] p-2.5">
            <Target className="h-4 w-4 text-[#afc4ff]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white/88">Rewrite Queue</h2>
            <p className="mt-1 text-sm leading-6 text-white/54">
              Work this queue from top to bottom. Every item explains why it matters, what evidence exists today, and the next best move. Nothing advances until the actual resume edit is accepted.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <QueueStat label="Needs Attention" value={queue.summary.needsAttention} tone="border-[#f0b8b8]/16 bg-[#f0b8b8]/[0.05]" />
          <QueueStat label="Partially Addressed" value={queue.summary.partiallyAddressed} tone="border-[#afc4ff]/16 bg-[#afc4ff]/[0.05]" />
          <QueueStat label="Resolved" value={queue.summary.resolved} tone="border-[#b5dec2]/16 bg-[#b5dec2]/[0.05]" />
        </div>

        {nextItem && (
          <div className="rounded-2xl border border-[#afc4ff]/16 bg-[#0f1622] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#afc4ff]/72">Recommended Next Move</p>
                <p className="mt-2 text-sm font-semibold text-white/86">{nextItem.title}</p>
                <p className="mt-1 text-sm leading-6 text-white/54">{nextItem.recommendedNextStep.detail}</p>
              </div>
              <span className="rounded-full border border-[#afc4ff]/18 bg-[#afc4ff]/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#afc4ff]">
                {SOURCE_LABELS[nextItem.source]}
              </span>
            </div>
            <div className="mt-3 space-y-3 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">Why this is next</p>
                <p className="mt-1 text-sm leading-6 text-white/66">{nextItem.whyItMatters}</p>
              </div>
              <EvidenceSummary
                currentCount={nextItem.currentEvidence.length}
                sourceCount={nextItem.sourceEvidence.length}
                needsCandidateInput={nextItem.candidateInputNeeded}
              />
              {nextItem.starterQuestion && (
                <div className="rounded-lg border border-[#afc4ff]/16 bg-[#afc4ff]/[0.04] px-3 py-2 text-xs leading-5 text-white/72">
                  First question: {nextItem.starterQuestion}
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

        {!finalReviewResult && onRequestHiringManagerReview && (
          <div className="rounded-xl border border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f0d99f]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white/82">Final Review joins the queue after the draft is ready.</p>
                <p className="mt-1 text-sm leading-6 text-white/56">
                  Once you like the core rewrite, run Final Review. Its recruiter-scan and hiring-manager concerns will appear in this same queue.
                </p>
                <button
                  type="button"
                  onClick={onRequestHiringManagerReview}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#f0d99f]/24 bg-[#f0d99f]/10 px-3 py-2 text-xs font-medium text-[#f0d99f] transition-colors hover:bg-[#f0d99f]/16"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Run Final Review
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-5 space-y-5">
        {BUCKETS.map((bucket) => {
          const items = queue.items.filter((item) => item.bucket === bucket.id);
          if (items.length === 0) return null;
          const isResolvedBucket = bucket.id === 'resolved';
          const bucketOpen = !isResolvedBucket || showResolved;

          return (
            <section key={bucket.id} className="space-y-3" aria-label={bucket.title}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white/84">{bucket.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/46">{bucket.description}</p>
                </div>
                {isResolvedBucket && (
                  <button
                    type="button"
                    onClick={() => setShowResolved((previous) => !previous)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/56 transition-colors hover:bg-white/[0.06] hover:text-white/78"
                    aria-expanded={bucketOpen}
                  >
                    <ChevronRight
                      className="h-3.5 w-3.5 transition-transform"
                      style={{ transform: bucketOpen ? 'rotate(90deg)' : 'none' }}
                    />
                    {bucketOpen ? 'Hide Resolved' : `Show Resolved (${items.length})`}
                  </button>
                )}
              </div>

              {bucketOpen && (
                <div className="space-y-3">
                {items.map((item) => {
                  const canViewResume = Boolean(item.requirement ?? item.relatedRequirement);
                  const isExpanded = expandedItemId === item.id;
                  const isPrimary = queue.nextItem?.id === item.id;

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
                          ) : isPrimary ? (
                            <Target className="h-4 w-4 shrink-0 text-[#afc4ff]" />
                          ) : (
                            <AlertCircle className="h-4 w-4 shrink-0 text-white/24" />
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
                                <ItemMeta item={item} />
                              </div>

                              <div>
                                <p className="text-sm font-semibold leading-6 text-white/88">{item.title}</p>
                                <p className="mt-1 text-sm leading-6 text-white/56">{item.recommendedNextStep.detail}</p>
                              </div>

                              <EvidenceSummary
                                currentCount={item.currentEvidence.length}
                                sourceCount={item.sourceEvidence.length}
                                needsCandidateInput={item.candidateInputNeeded}
                              />
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

                            {canViewResume && (
                              <button
                                type="button"
                                onClick={() => onRequirementClick(item.requirement ?? item.relatedRequirement!)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/64 transition-colors hover:bg-white/[0.06] hover:text-white/82"
                              >
                                <ClipboardCheck className="h-3.5 w-3.5" />
                                View in Resume
                              </button>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-black/15 px-3 py-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">Why it matters</p>
                                <p className="mt-1 text-sm leading-6 text-white/68">{item.whyItMatters}</p>
                              </div>

                              {item.starterQuestion && item.bucket !== 'resolved' && (
                                <div className="rounded-lg border border-[#afc4ff]/16 bg-[#afc4ff]/[0.05] px-3 py-2 text-xs leading-5 text-white/70">
                                  First question to unlock this item: {item.starterQuestion}
                                </div>
                              )}

                              {item.coachingReasoning && item.bucket !== 'resolved' && (
                                <div className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2 text-xs leading-5 text-white/52">
                                  AI angle: {item.coachingReasoning}
                                </div>
                              )}

                              <EvidenceList label="Current resume evidence" items={item.currentEvidence} />

                              {item.sourceEvidence.length > 0 && (
                                <EvidenceList label="Why this is on the queue" items={item.sourceEvidence} />
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
