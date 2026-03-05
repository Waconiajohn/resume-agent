import { Check } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { SafePanelContent } from './panels/panel-renderer';
import { PIPELINE_STAGES } from '@/constants/pipeline-stages';
import { getStageInfo } from '@/constants/pipeline-stages';
import type { PanelRendererProps } from './panels/panel-renderer';
// ─── Interview Stepper ─────────────────────────────────────────────────────────

/** The first 5 pipeline stages map to interview mode phases */
const INTERVIEW_STEPS = PIPELINE_STAGES.slice(0, 5);

type StepState = 'completed' | 'active' | 'pending';

function getStepState(stepKey: string, currentPhaseKey: string): StepState {
  const stepInfo = getStageInfo(stepKey);
  const currentInfo = getStageInfo(currentPhaseKey);
  if (!stepInfo || !currentInfo) return 'pending';
  if (stepInfo.index < currentInfo.index) return 'completed';
  if (stepInfo.index === currentInfo.index) return 'active';
  return 'pending';
}

function InterviewStepper({ currentPhase }: { currentPhase: string }) {
  return (
    <div className="flex items-center justify-center gap-1 px-4 py-3 sm:gap-3">
      {INTERVIEW_STEPS.map((step, i) => {
        const state = getStepState(step.key, currentPhase);
        return (
          <div key={step.key} className="flex items-center gap-1 sm:gap-3">
            {i > 0 && (
              <div
                className={`hidden h-px w-6 sm:block lg:w-10 ${
                  state === 'pending' ? 'bg-white/20' : 'bg-emerald-400/50'
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                  state === 'completed'
                    ? 'bg-emerald-400/20 text-emerald-400'
                    : state === 'active'
                      ? 'bg-blue-400/20 text-blue-400 ring-2 ring-blue-400/30 dot-current'
                      : 'bg-white/10 text-white/40'
                }`}
              >
                {state === 'completed' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{step.index}</span>
                )}
              </div>
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  state === 'completed'
                    ? 'text-emerald-400/80'
                    : state === 'active'
                      ? 'text-blue-400'
                      : 'text-white/40'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Draft Readiness Summary (compact, for interview mode) ──────────────────

interface DraftReadinessData {
  ready: boolean;
  coverage_score: number;
}

function DraftReadinessBadge({ data }: { data: DraftReadinessData }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          data.ready ? 'bg-emerald-400' : 'bg-white/40'
        }`}
      />
      <span className="text-xs font-medium text-white/85">
        {data.ready ? 'Ready to Draft' : 'Building Evidence'}
      </span>
      <span className="ml-auto text-[11px] text-white/40">
        {Math.round(data.coverage_score)}% coverage
      </span>
    </div>
  );
}

// ─── Main InterviewLayout ───────────────────────────────────────────────────────

interface InterviewLayoutProps extends PanelRendererProps {
  effectiveCurrentPhase: string;
  positioningProfileFound?: { profile: unknown; updated_at: string } | null;
  onProfileChoice?: (choice: unknown) => void;
  draftReadiness?: DraftReadinessData | null;
}

export function InterviewLayout({
  effectiveCurrentPhase,
  panelType,
  panelData,
  resume,
  isProcessing,
  onSendMessage,
  onPipelineRespond,
  onSaveCurrentResumeAsBase,
  onDismissSuggestion,
  positioningProfileFound,
  onProfileChoice,
  draftReadiness,
}: InterviewLayoutProps) {
  const showProfileChoice = Boolean(positioningProfileFound && onProfileChoice);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Progress stepper */}
      <div className="flex-shrink-0 border-b border-white/[0.08]">
        <InterviewStepper currentPhase={effectiveCurrentPhase} />
      </div>

      {/* Centered panel content area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-10">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Positioning profile choice (if needed) */}
          {showProfileChoice && positioningProfileFound && onProfileChoice && (
            <GlassCard className="p-4">
              <PositioningProfileChoice
                updatedAt={positioningProfileFound.updated_at}
                onChoice={onProfileChoice}
              />
            </GlassCard>
          )}

          {/* Draft readiness indicator */}
          {draftReadiness && (
            <DraftReadinessBadge data={draftReadiness} />
          )}

          {/* Main panel content */}
          <GlassCard className="overflow-hidden">
            <SafePanelContent
              panelType={panelType}
              panelData={panelData}
              resume={resume}
              isProcessing={isProcessing}
              onSendMessage={onSendMessage}
              onPipelineRespond={onPipelineRespond}
              onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
              onDismissSuggestion={onDismissSuggestion}
              variant="inline"
            />
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
