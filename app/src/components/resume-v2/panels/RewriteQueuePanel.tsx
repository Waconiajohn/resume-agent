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
  job_description: 'From the job description',
  benchmark: 'From the benchmark',
  final_review: 'From the final review',
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

function sourceSectionTitle(source: RewriteQueueItem['source']): string {
  if (source === 'benchmark') return '1. From the benchmark';
  if (source === 'final_review') return '1. From the final review';
  return '1. From the job description';
}

function sourceCardPhrase(source: RewriteQueueItem['source']): string {
  if (source === 'benchmark') return 'the benchmark';
  if (source === 'final_review') return 'the final review';
  return 'the job description';
}

function missingExplanation(item: RewriteQueueItem): string {
  if (item.category === 'hard_gap') {
    return 'This may be a real gap. We need to confirm whether you actually have it before the resume should claim it.';
  }

  const firstEvidence = item.currentEvidence[0];
  if (!firstEvidence) {
    return 'Your resume does not clearly show this yet, so we still need one truthful detail before we should rewrite it.';
  }

  if (firstEvidence.basis === 'nearby') {
    return 'This line is related, but it does not directly prove the requirement yet.';
  }

  return 'Your resume gets close here, but the requirement is still not obvious enough for a recruiter or hiring manager.';
}

function nextDetailPrompt(item: RewriteQueueItem): string {
  return item.starterQuestion ?? item.userInstruction;
}

function aiActionLabel(item: RewriteQueueItem): string {
  return item.suggestedDraft ? 'Work on This with AI' : 'Let AI Draft It';
}

function helperToggleLabel(isExpanded: boolean): string {
  return isExpanded ? 'Hide AI Workspace' : 'Work on This with AI';
}

function contextToggleLabel(isExpanded: boolean): string {
  return isExpanded ? 'Hide Why This Needs Work' : 'Why This Needs Work';
}

function primaryActionLabel(item: RewriteQueueItem, hasViewableEvidence: boolean): string {
  if (item.status === 'already_covered' && hasViewableEvidence) {
    return 'See Current Proof on Resume';
  }

  return aiActionLabel(item);
}

function PlacementWarning({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[#f0b8b8]/18 bg-[#f0b8b8]/[0.05] px-3 py-2 text-xs leading-5 text-[#f0b8b8]">
      {message}
    </div>
  );
}

function RequirementSourcePreview({ item }: { item: RewriteQueueItem }) {
  const excerpt = item.sourceEvidence[0]?.text;

  return (
    <div className="support-callout px-4 py-3">
      <p className="text-[12px] uppercase tracking-[0.15em] text-white/40">{sourceSectionTitle(item.source)}</p>
      <p className="mt-2 text-base leading-7 text-white/82">
        {excerpt || 'We do not have a source excerpt saved for this requirement, but it is still part of the current match analysis.'}
      </p>
    </div>
  );
}

function CurrentProofPreview({ item }: { item: RewriteQueueItem }) {
  const firstEvidence = item.currentEvidence[0];
  if (!firstEvidence) {
    return (
      <div className="support-callout px-4 py-3">
        <p className="text-[12px] uppercase tracking-[0.15em] text-white/40">2. From your resume</p>
        <p className="mt-2 text-base leading-7 text-white/62">
          We do not have a direct line on the resume that proves this requirement yet.
        </p>
      </div>
    );
  }

  const isNearbyEvidence = firstEvidence.basis === 'nearby';

  return (
    <div className="support-callout px-4 py-3">
      <p className="text-[12px] uppercase tracking-[0.15em] text-white/40">2. From your resume</p>
      <p className="mt-2 text-[12px] uppercase tracking-[0.14em] text-white/38">
        {firstEvidence.section ? `${firstEvidence.section}` : 'Resume evidence'}
      </p>
      {isNearbyEvidence && (
        <p className="mt-2 text-sm leading-6 text-white/56">
          This line is related, but it does not directly prove the requirement yet.
        </p>
      )}
      <p className="mt-2 text-base leading-7 text-white/80">{firstEvidence.text}</p>
    </div>
  );
}

function SuggestedDraftPreview({ item }: { item: RewriteQueueItem }) {
  return (
    <div className="support-callout border border-[#afc4ff]/16 bg-[#afc4ff]/[0.04] px-4 py-4">
      <p className="text-[12px] uppercase tracking-[0.15em] text-[#afc4ff]/78">4. Suggested rewrite for your resume</p>
      {item.suggestedDraft ? (
        <>
          <p className="mt-3 text-[17px] leading-8 text-white/86">{item.suggestedDraft}</p>
          <p className="mt-3 text-sm leading-6 text-white/56">
            This is the resume line we recommend from what we already know. Send it to review as-is or improve it first before it goes onto the resume.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-base leading-7 text-white/70">
            We are ready to draft this, but we still need one concrete detail before we should write it into the resume.
          </p>
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
      <p className="text-[12px] uppercase tracking-[0.15em] text-white/40">{title}</p>
      {items.length === 0 ? (
        <div className="support-callout px-4 py-3 text-base leading-7 text-white/56">
          {emptyLabel}
        </div>
      ) : (
        items.slice(0, 2).map((item, index) => (
          <div key={`${item.text}-${index}`} className="support-callout px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {item.section && <p className="text-[12px] text-white/44">{item.section}</p>}
              {item.basis === 'nearby' && (
                <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/38">
                  Related, but not direct yet
                </span>
              )}
            </div>
            <p className="mt-2 text-base leading-7 text-white/78">{item.text}</p>
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
  const [openHelperItemId, setOpenHelperItemId] = useState<string | null>(null);
  const [openContextItemId, setOpenContextItemId] = useState<string | null>(null);
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
  const nextItemHasViewableEvidence = nextItem?.currentEvidence.some((evidence) => Boolean(evidence.section)) ?? false;

  const applySuggestedLanguage = (
    item: RewriteQueueItem,
    language: string,
    candidateInputUsed = false,
  ) => {
    if (!item.requirement || !currentResume || !onRequestEdit) return;

    const target = findBulletForRequirement(item.requirement, positioningAssessment, currentResume);
    if (!target) {
      setOpenHelperItemId(item.id);
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
      `Naturally integrate this coached resume language into the text: "${language}". This addresses the requirement: "${item.requirement}".`,
      buildEditContext(
        item.requirement,
        item.currentEvidence.map((evidence) => evidence.text),
        language,
        {
          origin: 'gap',
          candidateInputUsed,
          scoreDomain: item.source === 'benchmark' ? 'benchmark' : 'job_description',
        },
      ),
    );
  };

  const handlePrimaryAction = (item: RewriteQueueItem) => {
    if (item.status === 'already_covered' && item.requirement && item.currentEvidence.some((evidence) => Boolean(evidence.section))) {
      onRequirementClick(item.requirement);
      return;
    }

    setOpenHelperItemId((previous) => previous === item.id ? null : item.id);
  };

  const renderThread = (item: RewriteQueueItem) => {
    if (openHelperItemId !== item.id) return null;
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
          const matchedItem = { ...item, requirement };
          applySuggestedLanguage(matchedItem, language, candidateInputUsed);
        }}
        context={chatContext}
        isEditing={isEditing}
        onSkip={() => setOpenHelperItemId(null)}
        sourceLabel={SOURCE_LABELS[item.source]}
        sourceExcerpt={item.sourceEvidence[0]?.text ?? null}
        initialQuestion={nextDetailPrompt(item)}
        initialSuggestedLanguage={item.suggestedDraft ?? null}
        promptHint={item.userInstruction}
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
              We pulled requirements from the job description first and added benchmark signals second. For each one, we show the language from the role, the closest line from your resume, what is still missing, and the rewrite we recommend next.
            </p>
          </div>
        </div>

        <div className="support-callout px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">How to use this</p>
          <p className="mt-2 text-sm leading-6 text-white/74">
            Start with the first requirement below. Read what the role is asking for, compare it with what your resume says now, then either use the suggested rewrite or improve it with AI.
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
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#afc4ff]/72">
                  Start with this requirement from {sourceCardPhrase(nextItem.source)}
                </p>
                <p className="mt-2 text-lg font-semibold leading-8 text-white/90">{nextItem.title}</p>
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
              <RequirementSourcePreview item={nextItem} />
              <CurrentProofPreview item={nextItem} />
              <div className="support-callout px-4 py-3">
                <p className="text-[12px] uppercase tracking-[0.15em] text-white/40">3. What is still missing</p>
                <p className="mt-2 text-base leading-7 text-white/74">{missingExplanation(nextItem)}</p>
                <p className="mt-3 text-sm leading-6 text-white/56">
                  The one detail we still need from you: {nextDetailPrompt(nextItem)}
                </p>
              </div>
              <SuggestedDraftPreview item={nextItem} />

              {nextItem.riskNote && (
                <div className="rounded-lg border border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] px-3 py-2 text-xs leading-5 text-white/70">
                  {nextItem.riskNote}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {nextItem.suggestedDraft && nextItem.status !== 'already_covered' && (
                  <button
                    type="button"
                    onClick={() => applySuggestedLanguage(nextItem, nextItem.suggestedDraft ?? '')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#b5dec2]/20 bg-[#b5dec2]/[0.09] px-3 py-2 text-xs font-medium text-[#b5dec2] transition-colors hover:bg-[#b5dec2]/[0.15]"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Send to Review
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handlePrimaryAction(nextItem)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/[0.08] px-3 py-2 text-xs font-medium text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/[0.14]"
                >
                  {nextItem.status === 'already_covered' && nextItemHasViewableEvidence ? (
                    <ClipboardCheck className="h-3.5 w-3.5" />
                  ) : (
                    <MessagesSquare className="h-3.5 w-3.5" />
                  )}
                  {nextItem.status === 'already_covered' && nextItemHasViewableEvidence
                    ? primaryActionLabel(nextItem, nextItemHasViewableEvidence)
                    : helperToggleLabel(openHelperItemId === nextItem.id)}
                </button>
              </div>

              {placementWarnings[nextItem.id] && (
                <PlacementWarning message={placementWarnings[nextItem.id]} />
              )}

              {renderThread(nextItem)}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5 px-5 py-5">
        {BUCKETS.map((bucket) => {
          const bucketItems = queue.items.filter((item) => item.bucket === bucket.id);
          const items = nextItem && nextItem.bucket === bucket.id
            ? bucketItems.filter((item) => item.id !== nextItem.id)
            : bucketItems;
          if (items.length === 0) return null;

          const isResolvedBucket = bucket.id === 'resolved';
          const isFixFirstBucket = bucket.id === 'needs_attention';
          const bucketOpen = !isResolvedBucket || showResolved;
          const visibleFixFirstRemainingLimit = Math.max(
            visibleFixFirstCount - (nextItem?.bucket === 'needs_attention' ? 1 : 0),
            0,
          );
          const visibleItems = isFixFirstBucket && !showAllFixFirst
            ? items.slice(0, visibleFixFirstRemainingLimit)
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
                    const isHelperOpen = openHelperItemId === item.id;
                    const isContextOpen = openContextItemId === item.id;
                    const isPrimary = nextItem?.id === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`room-shell border px-4 py-4 transition-colors ${
                          isHelperOpen || isContextOpen
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
                                  <p className="text-base font-semibold leading-7 text-white/88">{item.title}</p>
                                  <p className="mt-1 text-base leading-7 text-white/62">{item.whyItMatters}</p>
                                </div>

                                <CurrentProofPreview item={item} />
                                <SuggestedDraftPreview item={item} />
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1">
                              {item.suggestedDraft && item.status !== 'already_covered' && (
                                <button
                                  type="button"
                                  onClick={() => applySuggestedLanguage(item, item.suggestedDraft ?? '')}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#b5dec2]/20 bg-[#b5dec2]/[0.09] px-3 py-2 text-xs font-medium text-[#b5dec2] transition-colors hover:bg-[#b5dec2]/[0.15]"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Send to Review
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePrimaryAction(item)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/[0.08] px-3 py-2 text-xs font-medium text-[#afc4ff] transition-colors hover:bg-[#afc4ff]/[0.14]"
                              >
                                {item.status === 'already_covered' && hasViewableEvidence ? (
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                ) : (
                                  <MessagesSquare className="h-3.5 w-3.5" />
                                )}
                                {primaryActionLabel(item, hasViewableEvidence)}
                              </button>
                              <button
                                type="button"
                                onClick={() => setOpenContextItemId((previous) => previous === item.id ? null : item.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/64 transition-colors hover:bg-white/[0.06] hover:text-white/82"
                                aria-expanded={isContextOpen}
                                aria-label={`Toggle more context for ${item.title}`}
                              >
                                <ChevronRight
                                  className="h-3.5 w-3.5 transition-transform"
                                  style={{ transform: isContextOpen ? 'rotate(90deg)' : 'none' }}
                                />
                                {contextToggleLabel(isContextOpen)}
                              </button>
                            </div>

                            {placementWarnings[item.id] && (
                              <PlacementWarning message={placementWarnings[item.id]} />
                            )}

                            {isContextOpen && (
                              <div className="support-callout space-y-3 px-3 py-3">
                                <RequirementSourcePreview item={item} />

                                {item.starterQuestion && item.bucket !== 'resolved' && (
                                  <div className="rounded-lg border border-[#afc4ff]/16 bg-[#afc4ff]/[0.05] px-3 py-2 text-sm leading-6 text-white/72">
                                    The one detail we still need from you: {item.starterQuestion}
                                  </div>
                                )}

                                <div className="support-callout px-4 py-3">
                                  <p className="text-[12px] uppercase tracking-[0.15em] text-white/40">3. What is still missing</p>
                                  <p className="mt-2 text-base leading-7 text-white/74">{missingExplanation(item)}</p>
                                </div>

                                {item.riskNote && (
                                  <div className="rounded-lg border border-[#f0d99f]/18 bg-[#f0d99f]/[0.05] px-3 py-2 text-xs leading-5 text-white/70">
                                    {item.riskNote}
                                  </div>
                                )}

                                {item.currentEvidence.length > 1 && (
                                  <EvidenceList
                                    title="Other related evidence on your resume"
                                    items={item.currentEvidence.slice(1)}
                                    emptyLabel="No other related evidence was found on the resume."
                                  />
                                )}

                              </div>
                            )}

                            {renderThread(item)}
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
