import {
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { ExportBar } from './ExportBar';
import { HiringManagerReviewCard } from './cards/HiringManagerReviewCard';
import type {
  PostReviewPolishState,
  ResumeDraft,
} from '@/types/resume-v2';
import type { FinalReviewChatContext } from '@/types/resume-v2';
import type {
  HiringManagerConcern,
  HiringManagerReviewResult,
} from '@/hooks/useHiringManagerReview';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';

interface ResumeFinalReviewPanelProps {
  hiringManagerResult?: HiringManagerReviewResult | null;
  resolvedFinalReviewConcernIds: string[];
  isFinalReviewStale: boolean;
  isHiringManagerLoading?: boolean;
  hiringManagerError?: string | null;
  companyName?: string;
  jobTitle?: string;
  onRequestHiringManagerReview?: () => void;
  onApplyHiringManagerRecommendation?: (
    concern: HiringManagerConcern,
    languageOverride?: string,
    candidateInputUsed?: boolean,
  ) => void;
  finalReviewChat?: FinalReviewChatHook | null;
  buildFinalReviewChatContext?: (concern: HiringManagerConcern) => FinalReviewChatContext | null;
  isEditing: boolean;
}

export function GuidedWorkflowCard({
  hasFinalReview,
  isFinalReviewStale,
  unresolvedCriticalCount,
  coverageAddressed,
  coverageTotal,
  queueSummary,
  nextQueueItemLabel,
  postReviewPolish,
}: {
  hasFinalReview: boolean;
  isFinalReviewStale: boolean;
  unresolvedCriticalCount: number;
  coverageAddressed: number;
  coverageTotal: number;
  queueSummary: { needsAttention: number; partiallyAddressed: number; resolved: number; hardGapCount: number };
  nextQueueItemLabel?: string;
  postReviewPolish?: PostReviewPolishState;
}) {
  const queueNeedsAttention = queueSummary.needsAttention;
  const queuePartials = queueSummary.partiallyAddressed;
  const hardGapCount = queueSummary.hardGapCount;
  const hasActiveQueueWork = queueNeedsAttention > 0 || queuePartials > 0;
  const resumeCoverageLabel = coverageTotal > 0
    ? `${coverageAddressed} of ${coverageTotal} direct job requirements clearly addressed`
    : 'The requirement map is still being built';
  const nextActionLabel = hasActiveQueueWork
    ? nextQueueItemLabel
      ? `Work the next requirement: "${nextQueueItemLabel}".`
      : 'Open the next requirement and improve the proof before moving on.'
    : hardGapCount > 0
      ? `Review the ${hardGapCount} hard requirement risk${hardGapCount === 1 ? '' : 's'} honestly before trusting the draft.`
    : !hasFinalReview
      ? 'Run Final Review once the important requirements are covered.'
      : isFinalReviewStale
        ? 'Run Final Review again because the resume changed after the last review.'
        : unresolvedCriticalCount > 0
          ? `Resolve the ${unresolvedCriticalCount} critical concern${unresolvedCriticalCount === 1 ? '' : 's'} before export.`
          : 'Review the final wording and export when you are satisfied.';
  const reviewLabel = !hasFinalReview
    ? 'Not run yet'
    : isFinalReviewStale
      ? 'Needs rerun'
      : unresolvedCriticalCount > 0
        ? `${unresolvedCriticalCount} critical left`
        : postReviewPolish?.status === 'running'
          ? 'Refreshing tone + ATS'
          : 'Ready for final check';

  return (
    <div className="space-y-3">
      <div className="shell-panel px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow-label">Next step</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">What happens next</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-soft)]">
              Keep this simple: review the requirement map, fix the next issue on the left, then run Final Review before export.
            </p>
          </div>
          <div className="room-meta-strip text-[13px]">
            <div className="room-meta-item">
              Resume coverage
              <strong>{coverageTotal > 0 ? `${coverageAddressed}/${coverageTotal}` : 'Building map'}</strong>
            </div>
            <div className="room-meta-item">
              Requirements left
              <strong>{queueNeedsAttention + queuePartials}</strong>
            </div>
            {hardGapCount > 0 && (
              <div className="room-meta-item">
                Screen-out risks
                <strong>{hardGapCount}</strong>
              </div>
            )}
            <div className="room-meta-item">
              Final review
              <strong>{reviewLabel}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="support-callout border-[#afc4ff]/16 bg-[#afc4ff]/[0.06] px-4 py-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[#c9d7ff]/72">Current situation</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{resumeCoverageLabel}</p>
      </div>

      <div className="support-callout px-4 py-3">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[var(--text-soft)]">Do this next</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{nextActionLabel}</p>
      </div>
    </div>
  );
}

export function ResumeFinalReviewPanel({
  hiringManagerResult,
  resolvedFinalReviewConcernIds,
  isFinalReviewStale,
  isHiringManagerLoading,
  hiringManagerError,
  companyName,
  jobTitle,
  onRequestHiringManagerReview,
  onApplyHiringManagerRecommendation,
  finalReviewChat,
  buildFinalReviewChatContext,
  isEditing,
}: ResumeFinalReviewPanelProps) {
  return (
    <div className="space-y-4">
      <div className="shell-panel px-5 py-4">
        <p className="eyebrow-label">Final Review</p>
        <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">Fix final review issues on this resume</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">
          Run the recruiter and hiring manager check here, then send changes back into the resume on this same screen.
          The review explains what is still weak, and the edit flow applies fixes directly to the working draft.
        </p>
      </div>

      <div
        className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
          hiringManagerResult && !isFinalReviewStale
            ? 'border border-[#b5dec2]/20 bg-[#b5dec2]/[0.06] text-[#b5dec2]/90'
            : 'border border-[#f0d99f]/20 bg-[#f0d99f]/[0.06] text-[#f0d99f]/90'
        }`}
        role="status"
      >
        {hiringManagerResult && !isFinalReviewStale ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0" />
        )}
        {!hiringManagerResult
          ? 'Your draft is ready for Final Review. Run the recruiter and hiring manager check before exporting.'
          : isFinalReviewStale
            ? 'Final Review is out of date because the resume changed. Rerun it before exporting or acknowledge the warning.'
            : 'Final Review is current. Resolve any remaining concerns, then export if you are satisfied with the draft.'}
      </div>

      {onRequestHiringManagerReview && companyName && jobTitle && (
        <HiringManagerReviewCard
          result={hiringManagerResult ?? null}
          resolvedConcernIds={resolvedFinalReviewConcernIds}
          isLoading={isHiringManagerLoading ?? false}
          error={hiringManagerError ?? null}
          companyName={companyName}
          roleTitle={jobTitle}
          onRequestReview={onRequestHiringManagerReview}
          onApplyRecommendation={onApplyHiringManagerRecommendation}
          isEditing={isEditing}
          finalReviewChat={finalReviewChat}
          buildFinalReviewChatContext={buildFinalReviewChatContext}
        />
      )}
    </div>
  );
}

export function ResumeWorkspaceRail({
  displayResume,
  companyName,
  jobTitle,
  atsScore,
  hiringManagerResult,
  resolvedFinalReviewConcernIds,
  isFinalReviewStale,
  queueSummary,
  nextQueueItemLabel,
  finalReviewWarningsAcknowledged,
  onAcknowledgeFinalReviewWarnings,
}: {
  displayResume: ResumeDraft;
  companyName?: string;
  jobTitle?: string;
  atsScore: number;
  hiringManagerResult?: HiringManagerReviewResult | null;
  resolvedFinalReviewConcernIds: string[];
  isFinalReviewStale: boolean;
  queueSummary: { needsAttention: number; partiallyAddressed: number; resolved: number; hardGapCount: number };
  nextQueueItemLabel?: string;
  finalReviewWarningsAcknowledged?: boolean;
  onAcknowledgeFinalReviewWarnings?: () => void;
}) {
  const unresolvedCriticalConcerns = hiringManagerResult
    ? hiringManagerResult.concerns.filter((concern) => (
      concern.severity === 'critical' && !resolvedFinalReviewConcernIds.includes(concern.id)
    ))
    : [];

  return (
    <div data-workspace-rail="" className="space-y-4 pt-4 border-t border-[var(--line-soft)]">
      <ExportBar
        resume={displayResume}
        companyName={companyName}
        jobTitle={jobTitle}
        atsScore={atsScore}
        hasCompletedFinalReview={Boolean(hiringManagerResult)}
        isFinalReviewStale={isFinalReviewStale}
        unresolvedCriticalCount={unresolvedCriticalConcerns.length}
        unresolvedHardGapCount={queueSummary.hardGapCount}
        queueNeedsAttentionCount={queueSummary.needsAttention}
        queuePartialCount={queueSummary.partiallyAddressed}
        nextQueueItemLabel={nextQueueItemLabel}
        warningsAcknowledged={finalReviewWarningsAcknowledged}
        onAcknowledgeWarnings={onAcknowledgeFinalReviewWarnings}
      />
    </div>
  );
}
