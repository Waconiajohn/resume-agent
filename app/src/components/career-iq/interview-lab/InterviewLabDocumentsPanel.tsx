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
        <h2 className="mt-2 text-lg font-semibold text-white/88">Keep your follow-up docs tied to the same interview story</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/54">
          Keep your prep story, thank-you note, and 30-60-90 plan aligned. These should feel like the natural next step after the interview, not separate chores.
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
        <h2 className="mt-2 text-lg font-semibold text-white/88">Draft the 30-60-90 plan without losing the thread</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/54">
          This plan should make the first 30, 60, and 90 days feel concrete. Keep it consistent with the same positioning story you used in prep, practice, and follow-up.
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
