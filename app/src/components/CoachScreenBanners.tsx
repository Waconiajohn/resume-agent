import { AlertTriangle, X } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { GlassInput } from '@/components/GlassInput';
import { PHASE_LABELS } from '@/constants/phases';
import type { PipelineActivitySnapshot, WorkflowReplanUpdate } from '@/types/session';
import type { WorkflowNodeKey } from '@/types/workflow';

// ---- ErrorBanner ----

interface ErrorBannerProps {
  error: string | null;
  errorDismissed: boolean;
  onDismiss: () => void;
}

export function ErrorBanner({ error, errorDismissed, onDismiss }: ErrorBannerProps) {
  if (!error || errorDismissed) return null;
  return (
    <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-red-300/28 bg-red-500/[0.08] px-4 py-2.5 backdrop-blur-xl">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300/80" aria-hidden="true" />
      <p className="flex-1 text-sm text-red-100/90">{error}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 rounded p-0.5 text-red-300/60 transition-colors hover:bg-white/[0.06] hover:text-red-300/90"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

// ---- WorkflowErrorBanner ----

interface WorkflowErrorBannerProps {
  error: string | null;
  loadingSummary: boolean;
  loadingNode: boolean;
  onRefresh: () => Promise<void>;
}

export function WorkflowErrorBanner({ error, loadingSummary, loadingNode, onRefresh }: WorkflowErrorBannerProps) {
  if (!error) return null;
  return (
    <div className="mx-3 mt-3 rounded-lg border border-amber-300/18 bg-amber-300/[0.06] px-4 py-2 text-xs text-amber-100/90">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">Having trouble loading the latest workflow state.</span>
        <GlassButton
          variant="ghost"
          className="h-7 px-2.5 text-[11px]"
          loading={loadingSummary || loadingNode}
          onClick={onRefresh}
        >
          Refresh State
        </GlassButton>
      </div>
    </div>
  );
}

// ---- PipelineActivityBanner ----

interface PipelineActivityBannerProps {
  isViewingLiveNode: boolean;
  effectivePipelineActivity: PipelineActivitySnapshot | null;
  isProcessing: boolean;
  isPipelineGateActive: boolean;
  pipelineActivityStageElapsed: string | null;
  pipelineActivityLastStageDuration: string | null;
  pipelineActivityLastProgress: string | null;
  pipelineActivityLastHeartbeat: string | null;
  pipelineFirstProgressDuration: string | null;
  pipelineFirstActionReadyDuration: string | null;
}

export function PipelineActivityBanner({
  isViewingLiveNode,
  effectivePipelineActivity,
  isProcessing,
  isPipelineGateActive,
  pipelineActivityStageElapsed,
  pipelineActivityLastStageDuration,
  pipelineActivityLastProgress,
  pipelineActivityLastHeartbeat,
  pipelineFirstProgressDuration,
  pipelineFirstActionReadyDuration,
}: PipelineActivityBannerProps) {
  if (!isViewingLiveNode || !effectivePipelineActivity) return null;
  const shouldShow = isProcessing
    || isPipelineGateActive
    || effectivePipelineActivity.processing_state === 'reconnecting'
    || effectivePipelineActivity.processing_state === 'stalled_suspected';
  if (!shouldShow) return null;

  return (
    <div className="mx-3 mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs text-white/84">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-full border border-white/[0.1] bg-white/[0.025] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
          Backend Activity
        </span>
        <span className="text-white/88">
          {effectivePipelineActivity.current_activity_message
            ?? (isPipelineGateActive ? 'Waiting for your input in the current step.' : 'Processing your resume workflow.')}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/55">
        <span>State: {effectivePipelineActivity.processing_state.replace(/_/g, ' ')}</span>
        {effectivePipelineActivity.stage && <span>Stage: {PHASE_LABELS[effectivePipelineActivity.stage] ?? effectivePipelineActivity.stage}</span>}
        {pipelineActivityStageElapsed && <span>Stage elapsed: {pipelineActivityStageElapsed}</span>}
        {pipelineActivityLastStageDuration && <span>Last stage: {pipelineActivityLastStageDuration}</span>}
        {pipelineActivityLastProgress && <span>Last progress: {pipelineActivityLastProgress}</span>}
        {pipelineActivityLastHeartbeat && <span>Heartbeat: {pipelineActivityLastHeartbeat}</span>}
        {pipelineFirstProgressDuration && <span>First progress: {pipelineFirstProgressDuration}</span>}
        {pipelineFirstActionReadyDuration && <span>First action: {pipelineFirstActionReadyDuration}</span>}
      </div>
      {effectivePipelineActivity.expected_next_action && (
        <div className="mt-1 text-[11px] text-white/62">
          Next: {effectivePipelineActivity.expected_next_action}
        </div>
      )}
    </div>
  );
}

// ---- RuntimeRecoveryBanner ----

interface RuntimeRecoveryBannerProps {
  stalledSuspected: boolean;
  connected: boolean;
  isProcessing: boolean;
  pipelineActivityStageElapsed: string | null;
  pipelineActivityLastProgress: string | null;
  onReconnectStream?: () => void;
  loadingSummary: boolean;
  loadingNode: boolean;
  selectedNode: WorkflowNodeKey;
  activeNode: WorkflowNodeKey;
  onRefreshState: () => Promise<void>;
}

export function RuntimeRecoveryBanner({
  stalledSuspected,
  connected,
  isProcessing,
  pipelineActivityStageElapsed,
  pipelineActivityLastProgress,
  onReconnectStream,
  loadingSummary,
  loadingNode,
  onRefreshState,
}: RuntimeRecoveryBannerProps) {
  const shouldShow = Boolean(stalledSuspected) || (!connected && Boolean(isProcessing));
  if (!shouldShow) return null;
  return (
    <div className="mx-3 mt-3 rounded-lg border border-rose-300/14 bg-rose-400/[0.04] px-4 py-2 text-xs text-rose-100/90">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">
          {stalledSuspected
            ? 'Processing may be stalled. Use the controls below to reconnect and refresh state before restarting.'
            : 'The live connection is disconnected while processing is still expected.'}
        </span>
        {pipelineActivityStageElapsed && (
          <span className="rounded-full border border-rose-200/14 bg-rose-200/[0.04] px-2 py-0.5 text-[10px] text-rose-100/75">
            Stage elapsed {pipelineActivityStageElapsed}
          </span>
        )}
        {pipelineActivityLastProgress && (
          <span className="rounded-full border border-rose-200/14 bg-rose-200/[0.04] px-2 py-0.5 text-[10px] text-rose-100/75">
            Last progress {pipelineActivityLastProgress}
          </span>
        )}
        {onReconnectStream && (
          <GlassButton
            variant="ghost"
            className="h-7 px-2.5 text-[11px]"
            onClick={onReconnectStream}
          >
            Reconnect Stream
          </GlassButton>
        )}
        <GlassButton
          variant="ghost"
          className="h-7 px-2.5 text-[11px]"
          loading={loadingSummary || loadingNode}
          onClick={onRefreshState}
        >
          Refresh State
        </GlassButton>
      </div>
    </div>
  );
}

// ---- WorkflowActionBanner ----

interface WorkflowActionBannerProps {
  actionMessage: string | null;
  actionError: string | null;
  actionRequiresRestart: boolean;
  sessionId: string | null;
  isRestartingPipeline: boolean;
  isRestartPipelinePending: boolean;
  isProcessing: boolean;
  onRestart: () => Promise<void>;
  onDismiss: () => void;
}

export function WorkflowActionBanner({
  actionMessage,
  actionError,
  actionRequiresRestart,
  sessionId,
  isRestartingPipeline,
  isRestartPipelinePending,
  isProcessing,
  onRestart,
  onDismiss,
}: WorkflowActionBannerProps) {
  if (!actionMessage && !actionError) return null;
  return (
    <div
      className={`mx-3 mt-3 rounded-lg border px-4 py-2 text-xs ${
        actionError
          ? 'border-red-300/20 bg-red-400/[0.06] text-red-100/90'
          : 'border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100/90'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1">{actionError ?? actionMessage}</span>
        {actionRequiresRestart && sessionId && (
          <GlassButton
            variant="ghost"
            disabled={isRestartingPipeline || isRestartPipelinePending || isProcessing}
            onClick={onRestart}
            className="h-7 px-2.5 text-[11px]"
          >
            {(isRestartingPipeline || isRestartPipelinePending) ? 'Restarting...' : 'Restart & Rebuild'}
          </GlassButton>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-0.5 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85"
          aria-label="Dismiss workflow message"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---- WorkflowReplanBanner ----

interface WorkflowReplanBannerProps {
  summaryReplan: {
    pending: boolean;
    stale_nodes: WorkflowNodeKey[];
    requires_restart: boolean;
    rebuild_from_stage?: string;
  } | null;
  summaryReplanStatus: WorkflowReplanUpdate | null;
  liveWorkflowReplan: WorkflowReplanUpdate | null;
}

export function WorkflowReplanBanner({
  summaryReplan,
  summaryReplanStatus,
  liveWorkflowReplan,
}: WorkflowReplanBannerProps) {
  const effectiveLiveReplan = liveWorkflowReplan ?? summaryReplanStatus;
  if (!summaryReplan && !effectiveLiveReplan) return null;

  const staleNodeList = summaryReplan?.stale_nodes?.join(', ') ?? effectiveLiveReplan?.stale_nodes?.join(', ') ?? 'downstream steps';
  let body = '';

  if (effectiveLiveReplan?.state === 'in_progress') {
    const phaseLabel = effectiveLiveReplan.phase === 'refresh_gap_analysis'
      ? 'Refreshing gap analysis'
      : effectiveLiveReplan.phase === 'rebuild_blueprint'
        ? 'Rebuilding blueprint'
        : 'Applying updated benchmark assumptions';
    body = `${phaseLabel} for benchmark edit v${effectiveLiveReplan.benchmark_edit_version}. ${effectiveLiveReplan.message ?? 'Downstream outputs are being regenerated.'}`;
  } else if (effectiveLiveReplan?.state === 'completed') {
    const rebuilt = effectiveLiveReplan.rebuilt_through_stage ?? 'architect';
    body = `Benchmark replan applied for the current run (v${effectiveLiveReplan.benchmark_edit_version}). Regenerated through ${rebuilt}.`;
  } else if (summaryReplan?.requires_restart || effectiveLiveReplan?.requires_restart) {
    body = `Benchmark assumptions changed after section writing started. Downstream work (${staleNodeList}) is marked stale. Use "Restart & Rebuild" to regenerate from ${summaryReplan?.rebuild_from_stage ?? effectiveLiveReplan?.rebuild_from_stage ?? 'gap analysis'}.`;
  } else {
    body = `Benchmark assumptions changed. The pipeline will regenerate downstream work (${staleNodeList}) at the next safe checkpoint.`;
  }

  const toneClass = effectiveLiveReplan?.state === 'completed'
    ? 'border-emerald-300/18 bg-emerald-400/[0.05] text-emerald-100/90'
    : 'border-sky-300/18 bg-sky-400/[0.05] text-sky-100/90';

  return (
    <div className={`mx-3 mt-3 rounded-lg border px-4 py-2 text-xs ${toneClass}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{body}</span>
        {effectiveLiveReplan?.state === 'in_progress' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-sky-100/75">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-200/90" />
            Regenerating
          </span>
        )}
      </div>
    </div>
  );
}

// ---- WorkflowPreferencesCard ----

interface WorkflowPreferencesCardProps {
  activeWorkflowMode: 'fast_draft' | 'balanced' | 'deep_dive';
  activeMinimumEvidenceTarget: number;
  evidenceTargetDraft: number;
  isUpdatingWorkflowPreferences: boolean;
  workflowPreferencesSource?: string | null;
  onChangeMode: (mode: 'fast_draft' | 'balanced' | 'deep_dive') => Promise<void>;
  onChangeEvidenceTargetDraft: (target: number) => void;
  onApplyEvidenceTarget: () => Promise<void>;
}

export function WorkflowPreferencesCard({
  activeWorkflowMode,
  activeMinimumEvidenceTarget,
  evidenceTargetDraft,
  isUpdatingWorkflowPreferences,
  workflowPreferencesSource,
  onChangeMode,
  onChangeEvidenceTargetDraft,
  onApplyEvidenceTarget,
}: WorkflowPreferencesCardProps) {
  return (
    <div className="mb-2 px-1">
      <GlassCard className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
            Run Settings
          </span>
          <span className="text-[11px] text-white/55">
            Changes apply at the next safe checkpoint
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-wrap gap-1.5">
            {([
              ['fast_draft', 'Fast Draft'],
              ['balanced', 'Balanced'],
              ['deep_dive', 'Deep Dive'],
            ] as const).map(([modeKey, label]) => (
              <GlassButton
                key={modeKey}
                variant={activeWorkflowMode === modeKey ? 'primary' : 'ghost'}
                className="h-8 px-3 text-[11px]"
                disabled={isUpdatingWorkflowPreferences}
                onClick={async () => {
                  if (activeWorkflowMode === modeKey) return;
                  await onChangeMode(modeKey);
                }}
              >
                {label}
              </GlassButton>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] text-white/60 whitespace-nowrap"
              title="Positioning hint for evidence depth. Draft readiness uses coverage."
            >
              Evidence hint
            </span>
            <GlassInput
              type="number"
              min={3}
              max={20}
              value={evidenceTargetDraft}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value || '', 10);
                if (Number.isFinite(next)) {
                  onChangeEvidenceTargetDraft(Math.min(20, Math.max(3, next)));
                } else {
                  onChangeEvidenceTargetDraft(3);
                }
              }}
              className="h-8 w-20 rounded-lg px-2.5 py-1 text-xs"
            />
            <GlassButton
              variant="ghost"
              className="h-8 px-3 text-[11px]"
              loading={isUpdatingWorkflowPreferences}
              disabled={isUpdatingWorkflowPreferences || evidenceTargetDraft === activeMinimumEvidenceTarget}
              onClick={onApplyEvidenceTarget}
            >
              Apply
            </GlassButton>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {[5, 8, 12].map((target) => (
            <GlassButton
              key={target}
              variant={activeMinimumEvidenceTarget === target ? 'primary' : 'ghost'}
              className="h-7 px-2.5 text-[10px]"
              disabled={isUpdatingWorkflowPreferences}
              onClick={async () => {
                onChangeEvidenceTargetDraft(target);
                if (activeMinimumEvidenceTarget !== target) {
                  await onApplyEvidenceTarget();
                }
              }}
            >
              {target}
            </GlassButton>
          ))}
          {workflowPreferencesSource && (
            <span className="ml-1 text-[10px] text-white/40">
              Source: {workflowPreferencesSource === 'workflow_preferences' ? 'updated in workspace' : workflowPreferencesSource.replace(/_/g, ' ')}
            </span>
          )}
          <span className="text-[10px] text-white/35">
            Readiness uses coverage.
          </span>
        </div>
      </GlassCard>
    </div>
  );
}
