import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ChevronDown,
  MessagesSquare,
  ShieldAlert,
  Target,
} from 'lucide-react';
import type {
  CandidateIntelligence,
  BenchmarkCandidate,
  CoachingThreadSnapshot,
  FinalReviewChatContext,
  FinalReviewResult,
  GapAnalysis,
  GapChatContext,
  GapCoachingCard,
  JobIntelligence,
  NarrativeStrategy,
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
import { JobIntelligenceCard } from '../cards/JobIntelligenceCard';
import { CandidateIntelligenceCard } from '../cards/CandidateIntelligenceCard';
import { BenchmarkCandidateCard } from '../cards/BenchmarkCandidateCard';
import { NarrativeStrategyCard } from '../cards/NarrativeStrategyCard';

interface RewriteQueuePanelProps {
  jobIntelligence: JobIntelligence;
  candidateIntelligence?: CandidateIntelligence | null;
  positioningAssessment: PositioningAssessment | null;
  gapAnalysis: GapAnalysis;
  benchmarkCandidate?: BenchmarkCandidate | null;
  narrativeStrategy?: NarrativeStrategy | null;
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
  quick_win: 'Easier to fix',
  proof_upgrade: 'Needs stronger proof',
  hard_gap: 'Possible screen-out risk',
  benchmark_stretch: 'Benchmark signal',
  final_review_issue: 'Final Review',
};

const BUCKETS: Array<{
  id: RewriteQueueItem['bucket'];
  title: string;
  description: string;
}> = [
  {
    id: 'needs_attention',
    title: 'Start here',
    description: 'These are the highest-value requirements to work through next. Finish them one at a time so the rewrite stays clear and truthful.',
  },
  {
    id: 'partially_addressed',
    title: 'Still needs stronger proof',
    description: 'These requirements are on the page already, but the proof is still not strong enough to trust.',
  },
  {
    id: 'resolved',
    title: 'Already covered',
    description: 'These requirements already have accepted evidence in the current draft.',
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
    <div className={`support-callout px-3 py-3 ${tone}`}>
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
      <div className="support-callout px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">2. Current proof on the resume</p>
        <p className="mt-1 text-sm leading-6 text-white/52">
          Nothing on the current resume proves this yet.
        </p>
      </div>
    );
  }

  const isNearbyEvidence = firstEvidence.basis === 'nearby';

  return (
    <div className="support-callout px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">
        2. Current proof on the resume
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/34">
        {isNearbyEvidence ? 'Closest proof we found on the resume' : 'Current proof on the resume'}
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

function SuggestedDraftPreview({ item }: { item: RewriteQueueItem }) {
  return (
    <div className="support-callout border border-[#afc4ff]/16 bg-[#afc4ff]/[0.04] px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#afc4ff]/72">3. Better draft to start from</p>
      {item.suggestedDraft ? (
        <>
          <p className="mt-2 text-sm leading-6 text-white/78">{item.suggestedDraft}</p>
          <p className="mt-2 text-xs leading-5 text-white/48">
            Treat this as a starting point. You can edit it before you apply it to the resume.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-white/64">
            AI is ready to draft this, but it still needs one more concrete detail or one quick review of the current proof.
          </p>
          {item.starterQuestion && (
            <p className="mt-2 text-xs leading-5 text-white/52">
              First question: {item.starterQuestion}
            </p>
          )}
        </>
      )}
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
        <div className="support-callout px-3 py-2 text-sm leading-6 text-white/50">
          {emptyLabel}
        </div>
      ) : (
        items.slice(0, 2).map((item, index) => (
          <div key={`${item.text}-${index}`} className="support-callout px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {item.section && <p className="text-[11px] text-white/42">{item.section}</p>}
              {item.basis === 'nearby' && (
                <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/38">
                  Closest proof
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
  candidateIntelligence,
  positioningAssessment,
  gapAnalysis,
  benchmarkCandidate,
  narrativeStrategy,
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
          <div className="mt-0.5 rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/[0.07] p-2.5">
            <Target className="h-4 w-4 text-[#afc4ff]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white/88">Requirements to Match</h2>
            <p className="mt-1 text-sm leading-6 text-white/54">
              We pulled requirements from the job description first and added benchmark signals second. For each one, we show what the role is asking for, what your resume proves today, and how AI can help you improve the match.
            </p>
          </div>
        </div>

        <div className="support-callout px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">How to use this</p>
          <p className="mt-2 text-sm leading-6 text-white/74">
            This is the working view. Start with the first requirement below, compare it with the current resume proof, then use the AI helper to draft a stronger version you can edit and apply inline.
          </p>
          <p className="mt-2 text-sm leading-6 text-white/56">
            Job Description items are direct asks from the posting. Benchmark items are executive-level signals strong candidates usually show even when the posting is incomplete. If you want the full analysis report, open it below.
          </p>
        </div>

        <details className="room-shell px-4 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">Optional background report</p>
              <p className="mt-1 text-sm font-medium text-white/84">View Full Analysis</p>
              <p className="mt-1 text-sm leading-6 text-white/54">
                Open the full role, resume, benchmark, and positioning analysis if you want the deeper report behind this workspace.
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-white/34" />
          </summary>

          <div className="mt-4 space-y-4">
            <JobIntelligenceCard data={jobIntelligence} />
            {candidateIntelligence && <CandidateIntelligenceCard data={candidateIntelligence} />}
            {benchmarkCandidate && <BenchmarkCandidateCard data={benchmarkCandidate} />}
            {narrativeStrategy && <NarrativeStrategyCard data={narrativeStrategy} />}

            {gapAnalysis.critical_gaps.length > 0 && (
              <div className="support-callout border-[#f0b8b8]/18 bg-[#f0b8b8]/[0.05] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#f0b8b8]/78">Potential critical gaps</p>
                <div className="mt-2 space-y-2 text-sm leading-6 text-white/68">
                  {gapAnalysis.critical_gaps.map((gap, index) => (
                    <p key={`${gap}-${index}`}>{gap}</p>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-white/46">
                  These are already reflected in the working queue below, so you can address them there instead of reading a separate report first.
                </p>
              </div>
            )}
          </div>
        </details>

        <div className="grid gap-3 sm:grid-cols-3">
          <QueueStat
            label="Start Here"
            value={visibleFixFirstCount}
            detail={queuedAfterFixFirst > 0 ? `${queuedAfterFixFirst} more queued after these` : undefined}
            tone="border-[#f0b8b8]/16 bg-[#f0b8b8]/[0.05]"
          />
          <QueueStat label="Strengthen Next" value={queue.summary.partiallyAddressed} tone="border-[#afc4ff]/16 bg-[#afc4ff]/[0.05]" />
          <QueueStat label="Already Covered" value={queue.summary.resolved} tone="border-[#b5dec2]/16 bg-[#b5dec2]/[0.05]" />
        </div>

        {nextItem && (
          <div className="room-shell border border-[#afc4ff]/16 bg-[#0f1622] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#afc4ff]/72">Start with this requirement</p>
                <p className="mt-2 text-sm font-semibold text-white/86">{nextItem.title}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">
                  {SOURCE_LABELS[nextItem.source]}
                </span>
                <span className="rounded-md border border-[#afc4ff]/18 bg-[#afc4ff]/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#afc4ff]">
                  {CATEGORY_LABELS[nextItem.category]}
                </span>
              </div>
            </div>

            <div className="support-callout mt-3 space-y-3 px-3 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">1. Why this needs attention</p>
                <p className="mt-1 text-sm leading-6 text-white/66">{nextItem.userInstruction}</p>
              </div>

              <CurrentProofPreview item={nextItem} />
              <SuggestedDraftPreview item={nextItem} />

              <div className="support-callout px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">4. Work with AI on this requirement</p>
                <p className="mt-1 text-sm leading-6 text-white/66">{nextItem.aiPlan}</p>
              </div>

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
                  {nextItem.suggestedDraft ? 'Review Draft with AI' : 'Draft with AI'}
                </button>
                {nextItem.requirement && nextItem.currentEvidence.some((evidence) => Boolean(evidence.section)) && (
                  <button
                    type="button"
                    onClick={() => onRequirementClick(nextItem.requirement!)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/64 transition-colors hover:bg-white/[0.06] hover:text-white/82"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Show Current Proof in Resume
                  </button>
                )}
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
                        className={`room-shell border px-4 py-4 transition-colors ${
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
                                    <span className="rounded-md border border-[#afc4ff]/18 bg-[#afc4ff]/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#afc4ff]">
                                      Start here
                                    </span>
                                  )}
                                  <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/42">
                                    {SOURCE_LABELS[item.source]}
                                  </span>
                                  <span className={`rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
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
                                <SuggestedDraftPreview item={item} />
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
                                {item.suggestedDraft ? 'Review Draft with AI' : 'Draft with AI'}
                              </button>

                              {hasViewableEvidence && item.requirement && (
                                <button
                                  type="button"
                                  onClick={() => onRequirementClick(item.requirement!)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/64 transition-colors hover:bg-white/[0.06] hover:text-white/82"
                                >
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                  Jump to Current Proof
                                </button>
                              )}
                            </div>

                            {isExpanded && (
                              <div className="support-callout space-y-3 px-3 py-3">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">1. Why this needs attention</p>
                                  <p className="mt-1 text-sm leading-6 text-white/68">{item.whyItMatters}</p>
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
                                  title="2. What your resume shows today"
                                  items={item.currentEvidence}
                                  emptyLabel="Nothing on the current resume proves this yet."
                                />

                                <SuggestedDraftPreview item={item} />

                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/34">4. Work with AI on this requirement</p>
                                  <p className="mt-1 text-sm leading-6 text-white/68">{item.aiPlan}</p>
                                  <p className="mt-2 text-sm leading-6 text-white/56">{item.userInstruction}</p>
                                </div>

                                {item.sourceEvidence.length > 0 && (
                                  <EvidenceList
                                    title={item.source === 'benchmark' ? 'What the benchmark is looking for' : 'What the job description is looking for'}
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
