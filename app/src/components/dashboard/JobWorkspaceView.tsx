import { BriefcaseBusiness, Clock3, ExternalLink, FileText, Loader2, Mail, Mic, Sparkles, X } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import type { Application, PipelineStage } from '@/hooks/useApplicationPipeline';
import type { SessionJobRecord } from '@/lib/job-workspace';
import {
  JOB_WORKSPACE_STAGES,
  buildWorkspaceRoomRoute,
  formatJobStage,
  isPipelineStage,
  isResumeProductType,
  productTypeForSession,
  stageAwareActions,
  stageLabel,
} from '@/lib/job-workspace';

interface JobWorkspaceViewProps {
  record: SessionJobRecord;
  application?: Application;
  onClose?: () => void;
  onMoveJobStage?: (record: SessionJobRecord, stage: PipelineStage) => Promise<boolean>;
  savingStage?: PipelineStage | null;
  onResumeSession: (id: string) => void;
  onNavigate?: (route: string) => void;
  onViewResume: (sessionId: string) => void;
  onViewCoverLetter: (sessionId: string) => void;
}

export function JobWorkspaceView({
  record,
  application,
  onClose,
  onMoveJobStage,
  savingStage = null,
  onResumeSession,
  onNavigate,
  onViewResume,
  onViewCoverLetter,
}: JobWorkspaceViewProps) {
  const resumeAsset = record.assets.find((session) => isResumeProductType(productTypeForSession(session))) ?? null;
  const coverLetterAsset = record.assets.find((session) => productTypeForSession(session) === 'cover_letter') ?? null;
  const interviewPrepAsset = record.assets.find((session) => productTypeForSession(session) === 'interview_prep') ?? null;
  const thankYouAsset = record.assets.find((session) => productTypeForSession(session) === 'thank_you_note') ?? null;
  const ninetyDayPlanAsset = record.assets.find((session) => productTypeForSession(session) === 'ninety_day_plan') ?? null;
  const salaryNegotiationAsset = record.assets.find((session) => productTypeForSession(session) === 'salary_negotiation') ?? null;
  const activeStage = application?.stage ?? (isPipelineStage(record.jobStage) ? record.jobStage : 'saved');
  const activeStageBadge = formatJobStage(activeStage);
  const stageActions = stageAwareActions(activeStage);
  const reopenSessionId = resumeAsset?.id ?? record.latestSession.id;
  const interviewPrepRoute = buildWorkspaceRoomRoute('interview', record, {
    focus: 'prep',
    sessionId: interviewPrepAsset?.id ?? null,
  });
  const thankYouRoute = buildWorkspaceRoomRoute('interview', record, {
    focus: 'thank-you',
    sessionId: thankYouAsset?.id ?? null,
  });
  const ninetyDayPlanRoute = buildWorkspaceRoomRoute('interview', record, {
    focus: 'plan',
    sessionId: ninetyDayPlanAsset?.id ?? null,
  });
  const salaryNegotiationRoute = buildWorkspaceRoomRoute('salary-negotiation', record, {
    sessionId: salaryNegotiationAsset?.id ?? null,
  });
  const stageHistory = Array.isArray(application?.stage_history) && application?.stage_history.length > 0
    ? application.stage_history
    : [{ stage: activeStage, at: record.latestSession.updated_at }];

  return (
    <GlassCard className="space-y-5 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-widest text-[#98b3ff]/70">
            Job Workspace
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white/88">{record.company}</h3>
          <p className="mt-1 text-sm text-white/48">{record.role}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${activeStageBadge.classes}`}>
            {activeStageBadge.label}
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/72"
              aria-label="Close workspace"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Stage control</div>
        <p className="mt-2 text-sm leading-relaxed text-white/52">
          Keep this workspace lean until the process advances. Interview and offer assets only light up when the stage earns them.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {JOB_WORKSPACE_STAGES.map((stage) => {
            const active = activeStage === stage;
            return (
              <button
                key={stage}
                type="button"
                disabled={!application || !onMoveJobStage || active || savingStage === stage}
                onClick={() => void onMoveJobStage?.(record, stage)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-[#98b3ff]/25 bg-[#98b3ff]/10 text-[#d4dfff]'
                    : 'border-white/[0.08] bg-white/[0.03] text-white/52 hover:bg-white/[0.06] hover:text-white/78'
                }`}
              >
                {savingStage === stage ? <Loader2 size={12} className="animate-spin" /> : null}
                {stageLabel(stage)}
              </button>
            );
          })}
        </div>
        {!application ? (
          <p className="mt-3 text-[11px] text-white/38">
            This tailored work is not yet linked to a tracked job application, so the stage shown here is read-only.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Assets</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <FileText size={14} className="text-[#98b3ff]" />
                  Resume Builder
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/48">
                  {resumeAsset || coverLetterAsset
                    ? 'Your tailored resume and cover letter live together here. Reopen the active session or review the saved draft assets.'
                    : 'Use Resume Builder for the tailored resume first. Add a cover letter there only when this job actually needs one.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {resumeAsset ? (
                    <>
                      <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onResumeSession(resumeAsset.id)}>
                        <ExternalLink size={12} className="mr-1.5" />
                        Open Session
                      </GlassButton>
                      <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onViewResume(resumeAsset.id)}>
                        <FileText size={12} className="mr-1.5" />
                        View Resume
                      </GlassButton>
                    </>
                  ) : (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.('/workspace?room=resume')}>
                      <FileText size={12} className="mr-1.5" />
                      Open Resume Builder
                    </GlassButton>
                  )}
                  {coverLetterAsset ? (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onViewCoverLetter(coverLetterAsset.id)}>
                      <Mail size={12} className="mr-1.5" />
                      View Letter
                    </GlassButton>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <Mic size={14} className="text-[#98b3ff]" />
                  Interview Prep
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-white/48">
                  {(interviewPrepAsset || thankYouAsset || ninetyDayPlanAsset || salaryNegotiationAsset)
                    ? 'Prep reports, thank-you notes, 30-60-90 plans, and negotiation strategy stay together here so this job’s follow-up work lives in one place.'
                    : activeStage === 'interviewing'
                    ? 'This job is ready for interview prep, follow-up notes, and 30-60-90 planning.'
                    : activeStage === 'offer'
                    ? 'This job is ready for interview prep and negotiation strategy in the same flow.'
                    : 'Interview prep stays out of the way until the application reaches interviews.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(interviewPrepAsset || activeStage === 'interviewing' || activeStage === 'offer') ? (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(interviewPrepRoute)}>
                      <Mic size={12} className="mr-1.5" />
                      {interviewPrepAsset ? 'Open Saved Prep' : 'Open Interview Prep'}
                    </GlassButton>
                  ) : null}
                  {(thankYouAsset || activeStage === 'interviewing' || activeStage === 'offer') ? (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(thankYouRoute)}>
                      <Mail size={12} className="mr-1.5" />
                      {thankYouAsset ? 'Open Saved Note' : 'Open Thank-You Notes'}
                    </GlassButton>
                  ) : null}
                  {(ninetyDayPlanAsset || activeStage === 'interviewing' || activeStage === 'offer') ? (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(ninetyDayPlanRoute)}>
                      <FileText size={12} className="mr-1.5" />
                      {ninetyDayPlanAsset ? 'Open Saved 30-60-90 Plan' : 'Open 30-60-90 Plan'}
                    </GlassButton>
                  ) : null}
                  {(salaryNegotiationAsset || activeStage === 'offer') ? (
                    <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(salaryNegotiationRoute)}>
                      <Sparkles size={12} className="mr-1.5" />
                      {salaryNegotiationAsset ? 'Open Saved Strategy' : 'Open Negotiation Prep'}
                    </GlassButton>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Unlocked next</div>
            <div className="mt-3 text-sm font-medium text-white/80">{stageActions.nextActionLabel}</div>
            <p className="mt-2 text-[12px] leading-relaxed text-white/48">
              Available now: {stageActions.unlocked.join(' • ')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onResumeSession(reopenSessionId)}>
                <BriefcaseBusiness size={12} className="mr-1.5" />
                Reopen Tailored Work
              </GlassButton>
              {activeStage === 'interviewing' ? (
                <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(interviewPrepRoute)}>
                  <Mic size={12} className="mr-1.5" />
                  {interviewPrepAsset ? 'Open Saved Prep' : 'Open Interview Prep'}
                </GlassButton>
              ) : null}
              {activeStage === 'offer' ? (
                <GlassButton size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => onNavigate?.(salaryNegotiationRoute)}>
                  <Sparkles size={12} className="mr-1.5" />
                  {salaryNegotiationAsset ? 'Open Saved Strategy' : 'Open Negotiation Prep'}
                </GlassButton>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/40">
            <Clock3 size={12} />
            Stage history
          </div>
          <div className="mt-4 space-y-3">
            {stageHistory.map((entry, index) => {
              const stage = isPipelineStage(entry.stage) ? entry.stage : activeStage;
              return (
                <div key={`${entry.stage}-${entry.at}-${index}`} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-[#98b3ff]/70" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white/78">{stageLabel(stage)}</div>
                    <div className="mt-1 text-[12px] text-white/42">
                      {new Date(entry.at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {application?.next_action ? (
            <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/10 p-3">
              <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">Next action</div>
              <p className="mt-2 text-sm text-white/74">{application.next_action}</p>
              {application.next_action_due ? (
                <p className="mt-1 text-[12px] text-white/42">
                  Due {new Date(application.next_action_due).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
