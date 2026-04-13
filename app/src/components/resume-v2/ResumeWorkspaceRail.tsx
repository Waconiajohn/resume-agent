import {
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { ExportBar } from './ExportBar';
import { HiringManagerReviewCard } from './cards/HiringManagerReviewCard';
import type { ResumeDraft, RewriteQueueSummary } from '@/types/resume-v2';
import type { FinalReviewChatContext } from '@/types/resume-v2';
import type {
  HiringManagerConcern,
  HiringManagerReviewResult,
} from '@/hooks/useHiringManagerReview';
import type { FinalReviewChatHook } from '@/hooks/useFinalReviewChat';
import type { FinalReviewTargetMatch } from './utils/final-review-target';

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
  resolveConcernTarget?: (concern: HiringManagerConcern) => FinalReviewTargetMatch | null;
  onPreviewConcernTarget?: (concern: HiringManagerConcern) => void;
  isEditing: boolean;
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
  resolveConcernTarget,
  onPreviewConcernTarget,
  isEditing,
}: ResumeFinalReviewPanelProps) {
  const reviewStatusCopy = !hiringManagerResult
    ? 'Run final review before export.'
    : isFinalReviewStale
      ? 'Rerun final review before export.'
      : 'Final review is current.';

  return (
    <div className="space-y-4">
      <div className="shell-panel px-4 py-3.5">
        <p className="eyebrow-label">Final Review</p>
        <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">Run the recruiter and hiring-manager check here</p>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-[var(--text-soft)]">
          Review what is still weak, then send fixes straight back into the working draft from this screen.
        </p>
      </div>

      <div
        className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] ${
          hiringManagerResult && !isFinalReviewStale
            ? 'border border-[var(--badge-green-text)]/20 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]/90'
            : 'border border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]/90'
        }`}
        role="status"
      >
        {hiringManagerResult && !isFinalReviewStale ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0" />
        )}
        {reviewStatusCopy}
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
          resolveConcernTarget={resolveConcernTarget}
          onPreviewConcernTarget={onPreviewConcernTarget}
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
  jobUrl,
  sessionId,
  accessToken,
}: {
  displayResume: ResumeDraft;
  companyName?: string;
  jobTitle?: string;
  atsScore: number;
  hiringManagerResult?: HiringManagerReviewResult | null;
  resolvedFinalReviewConcernIds: string[];
  isFinalReviewStale: boolean;
  queueSummary: RewriteQueueSummary;
  nextQueueItemLabel?: string;
  /** Job application URL — when present, shows the Apply to This Job button in ExportBar */
  jobUrl?: string;
  /** Session ID for linking the resume to the job application */
  sessionId?: string;
  /** Access token for the link-resume API call */
  accessToken?: string | null;
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
        queueNeedsUserInput={queueSummary.needsUserInput}
        queueNeedsApproval={queueSummary.needsApproval}
        queueHandled={queueSummary.handled}
        queueTotal={queueSummary.total}
        nextQueueItemLabel={nextQueueItemLabel}
        jobUrl={jobUrl}
        sessionId={sessionId}
        accessToken={accessToken}
      />
    </div>
  );
}
