import { getStageInfo, getCompletedCount, TOTAL_PIPELINE_STAGES } from '@/constants/pipeline-stages';

interface PipelineProgressBarProps {
  pipelineStage: string | null;
  isProcessing: boolean;
  sessionComplete: boolean;
}

export function PipelineProgressBar({ pipelineStage, isProcessing, sessionComplete }: PipelineProgressBarProps) {
  if (pipelineStage === null && !sessionComplete) return null;

  const stageInfo = pipelineStage ? getStageInfo(pipelineStage) : null;
  const completedCount = sessionComplete
    ? TOTAL_PIPELINE_STAGES
    : pipelineStage
      ? getCompletedCount(pipelineStage)
      : 0;

  const widthPct = (completedCount / TOTAL_PIPELINE_STAGES) * 100;

  const label = sessionComplete ? 'Complete' : (stageInfo?.label ?? '');
  const stepIndex = stageInfo?.index ?? null;
  const showEstimate =
    !sessionComplete &&
    stageInfo !== null &&
    !stageInfo.isInteractive &&
    stageInfo.estimateMinutes > 0.5;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-1.5 pt-0.5">
      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full bg-gradient-to-r from-[#7b9cff] via-[#afc4ff] to-[#d5e1ff] transition-[width] duration-500${isProcessing && !sessionComplete ? ' animate-pulse' : ''}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-[11px] text-white/60">{label}</span>
        <div className="flex items-center gap-3">
          {showEstimate && (
            <span className="text-[11px] text-white/40">~{stageInfo!.estimateMinutes} min</span>
          )}
          {!sessionComplete && stepIndex !== null && (
            <span className="text-[11px] text-white/40">
              Step {stepIndex} of {TOTAL_PIPELINE_STAGES}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
