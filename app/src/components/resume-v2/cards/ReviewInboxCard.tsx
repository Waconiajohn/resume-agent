import { ClipboardCheck, Clock3, Sparkles } from 'lucide-react';
import type { PendingEdit } from '@/hooks/useInlineEdit';

interface ReviewInboxCardProps {
  pendingEdit: PendingEdit | null;
}

function originLabel(pendingEdit: PendingEdit['editContext']): string {
  if (pendingEdit?.origin === 'final_review') return 'Final Review';
  if (pendingEdit?.origin === 'gap') return 'Requirement Queue';
  return 'Manual Edit';
}

export function ReviewInboxCard({ pendingEdit }: ReviewInboxCardProps) {
  if (!pendingEdit) {
    return (
      <div className="room-shell border border-[var(--line-soft)] bg-[var(--accent-muted)] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-[var(--line-soft)] bg-[var(--accent-muted)] p-2">
            <ClipboardCheck className="h-4 w-4 text-[var(--text-soft)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--text-muted)]">Review Inbox</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-soft)]">
              No suggestion is waiting right now. Open an item from the rewrite queue to generate a new candidate edit, then review the diff before it changes the resume.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="room-shell border border-[#afc4ff]/18 bg-[#afc4ff]/[0.05] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-[#afc4ff]/18 bg-[#afc4ff]/[0.08] p-2">
          <Sparkles className="h-4 w-4 text-[#afc4ff]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-[var(--text-strong)]">Review Inbox</p>
            <span className="rounded-md border border-[#afc4ff]/18 bg-[#afc4ff]/[0.08] px-2.5 py-1 text-[12px] uppercase tracking-[0.16em] text-[#afc4ff]">
              {originLabel(pendingEdit.editContext)}
            </span>
            <span className="rounded-md border border-[var(--line-soft)] bg-[var(--accent-muted)] px-2.5 py-1 text-[12px] uppercase tracking-[0.16em] text-[var(--text-soft)]">
              {pendingEdit.action.replaceAll('_', ' ')}
            </span>
          </div>

          <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
            A draft change is waiting below. Review the diff, then accept or reject it. The rewrite queue only updates after you make that decision.
          </p>

          {pendingEdit.editContext?.requirement && (
            <p className="mt-2 text-xs text-[var(--text-soft)]">
              Requirement: {pendingEdit.editContext.requirement}
            </p>
          )}

          {pendingEdit.editContext?.finalReviewConcernId && (
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              Final Review concern: {pendingEdit.editContext.finalReviewConcernId}
            </p>
          )}

          {pendingEdit.editContext?.candidateInputUsed && (
            <div className="support-callout mt-3 inline-flex items-center gap-1.5 border border-[#f0d99f]/20 bg-[#f0d99f]/[0.05] px-2.5 py-1 text-[13px] text-[#f0d99f]">
              <Clock3 className="h-3.5 w-3.5" />
              Uses candidate-provided detail
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
