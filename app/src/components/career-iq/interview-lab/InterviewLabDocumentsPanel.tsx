import { ArrowLeft, ClipboardList, Mail } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { NinetyDayPlanRoom } from '@/components/career-iq/NinetyDayPlanRoom';

export type InterviewLabDocumentsView = 'overview' | 'ninety_day_plan';

interface InterviewLabDocumentsPanelProps {
  documentsView: InterviewLabDocumentsView;
  activeCompany: string;
  activeRole: string;
  activeJobApplicationId?: string;
  initialFocus?: string;
  initialAssetSessionId?: string;
  onDocumentsViewChange: (view: InterviewLabDocumentsView) => void;
  onOpenThankYou: () => void;
}

export function InterviewLabDocumentsPanel({
  documentsView,
  activeCompany,
  activeRole,
  activeJobApplicationId,
  initialFocus,
  initialAssetSessionId,
  onDocumentsViewChange,
  onOpenThankYou,
}: InterviewLabDocumentsPanelProps) {
  if (documentsView === 'overview') {
    return (
      <GlassCard className="p-5">
        <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
          Leave-behinds
        </div>
        <h2 className="mt-2 text-lg font-semibold text-white/88">Build leave-behinds without leaving the lab</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/54">
          Keep your prep story and supporting documents together. The 30-60-90 plan should feel like the next step, not a side project.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/38">Leave-behind</div>
            <h3 className="mt-2 text-base font-semibold text-white/84">30-60-90 Day Plan</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/52">
              Use this to show how you would step into the role and sequence your first 30, 60, and 90 days.
            </p>
            <GlassButton
              variant="ghost"
              onClick={() => onDocumentsViewChange('ninety_day_plan')}
              className="mt-4 text-[13px]"
            >
              <ClipboardList size={14} className="mr-1.5" />
              Open 30-60-90 Day Plan
            </GlassButton>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/38">Follow-up</div>
            <h3 className="mt-2 text-base font-semibold text-white/84">Thank You Note</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/52">
              Use this to turn the interview into a focused follow-up while the conversation is still fresh.
            </p>
            <GlassButton variant="ghost" onClick={onOpenThankYou} className="mt-4 text-[13px]">
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
      <GlassCard className="p-5">
        <button
          type="button"
          onClick={() => onDocumentsViewChange('overview')}
          className="inline-flex items-center gap-1.5 text-[#98b3ff] text-[13px] font-medium"
        >
          <ArrowLeft size={14} />
          Back to Leave-behinds
        </button>
        <div className="mt-4 text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
          30-60-90 Day Plan
        </div>
        <h2 className="mt-2 text-lg font-semibold text-white/88">Stay in the interview workflow while you build the leave-behind</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/54">
          This document should make the interviewer feel your first 30, 60, and 90 days are already taking shape. Keep the positioning story consistent with your prep report and mock-interview answers.
        </p>
      </GlassCard>
      <NinetyDayPlanRoom
        initialTargetRole={activeRole}
        initialTargetCompany={activeCompany}
        initialJobApplicationId={activeJobApplicationId}
        initialSessionId={initialFocus === 'plan' ? initialAssetSessionId : undefined}
      />
    </div>
  );
}
