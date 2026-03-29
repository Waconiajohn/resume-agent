import { ArrowLeft, ClipboardList, Mail } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { NinetyDayPlanRoom } from '@/components/career-iq/NinetyDayPlanRoom';
import type { InterviewLabDocumentsView } from './interviewLabRouting';

interface InterviewLabDocumentsPanelProps {
  documentsView: InterviewLabDocumentsView;
  activeCompany: string;
  activeRole: string;
  activeJobApplicationId?: string;
  initialPlanSessionId?: string;
  onDocumentsViewChange: (view: InterviewLabDocumentsView) => void;
  onOpenThankYou: () => void;
}

export function InterviewLabDocumentsPanel({
  documentsView,
  activeCompany,
  activeRole,
  activeJobApplicationId,
  initialPlanSessionId,
  onDocumentsViewChange,
  onOpenThankYou,
}: InterviewLabDocumentsPanelProps) {
  if (documentsView === 'overview') {
    return (
      <GlassCard className="p-6">
        <div className="eyebrow-label">
          Leave-behinds
        </div>
        <h2 className="mt-2 text-2xl text-[var(--text-strong)]">Keep your follow-up docs tied to the same interview story</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
          Keep your prep story, thank-you note, and 30-60-90 plan aligned. These should feel like the natural next step after the interview, not separate chores.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="support-callout">
            <div className="eyebrow-label">Leave-behind</div>
            <h3 className="mt-2 text-xl text-[var(--text-strong)]">30-60-90 Day Plan</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Use this to show how you would step into the role and sequence your first 30, 60, and 90 days.
            </p>
            <GlassButton
              variant="secondary"
              onClick={() => onDocumentsViewChange('ninety_day_plan')}
              className="mt-4 text-[13px]"
            >
              <ClipboardList size={14} className="mr-1.5" />
              Open 30-60-90 Day Plan
            </GlassButton>
          </div>

          <div className="support-callout">
            <div className="eyebrow-label">Follow-up</div>
            <h3 className="mt-2 text-xl text-[var(--text-strong)]">Thank You Note</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Use this to turn the interview into a focused follow-up while the conversation is still fresh.
            </p>
            <GlassButton variant="secondary" onClick={onOpenThankYou} className="mt-4 text-[13px]">
              <Mail size={14} className="mr-1.5" />
              Open Thank You Note
            </GlassButton>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <button
          type="button"
          onClick={() => onDocumentsViewChange('overview')}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)]"
        >
          <ArrowLeft size={14} />
          Back to Leave-behinds
        </button>
        <div className="eyebrow-label mt-4">
          30-60-90 Day Plan
        </div>
        <h2 className="mt-2 text-2xl text-[var(--text-strong)]">Draft the 30-60-90 plan without losing the thread</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
          This plan should make the first 30, 60, and 90 days feel concrete. Keep it consistent with the same positioning story you used in prep, practice, and follow-up.
        </p>
      </GlassCard>
      <NinetyDayPlanRoom
        initialTargetRole={activeRole}
        initialTargetCompany={activeCompany}
        initialJobApplicationId={activeJobApplicationId}
        initialSessionId={initialPlanSessionId}
      />
    </div>
  );
}
