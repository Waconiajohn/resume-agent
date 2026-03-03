import { GlassCard } from './GlassCard';
import { PHASE_LABELS } from '@/constants/phases';
import type { PanelData } from '@/types/panels';
import type { FinalResume } from '@/types/resume';
import type { PipelineActivitySnapshot } from '@/types/session';

interface WorkflowStatsRailProps {
  currentPhase: string;
  isProcessing: boolean;
  isGateActive?: boolean;
  stalledSuspected?: boolean;
  pipelineActivity?: PipelineActivitySnapshot | null;
  sessionComplete?: boolean;
  error?: string | null;
  panelData: PanelData | null;
  resume: FinalResume | null;
  compact?: boolean;
}

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function metricSnapshot(panelData: PanelData | null, resume: FinalResume | null) {
  let ats: number | null = resume?.ats_score ?? null;
  let keywordCoverage: number | null = null;
  let authenticity: number | null = null;
  let requirements: string | null = null;

  if (panelData?.type === 'quality_dashboard') {
    ats = panelData.ats_score ?? ats;
    keywordCoverage = panelData.keyword_coverage ?? null;
    authenticity = panelData.authenticity_score ?? null;
  }

  if (panelData?.type === 'completion') {
    ats = panelData.ats_score ?? ats;
    keywordCoverage = panelData.keyword_coverage ?? keywordCoverage;
    authenticity = panelData.authenticity_score ?? authenticity;
    requirements =
      panelData.requirements_addressed != null ? `${panelData.requirements_addressed}` : null;
  }

  if (panelData?.type === 'gap_analysis') {
    requirements = `${panelData.addressed}/${panelData.total}`;
  }

  return { ats, keywordCoverage, authenticity, requirements };
}

// ─── Stage-aware metric visibility ───────────────────────────────────────────

interface VisibleMetrics {
  showAts: boolean;
  showKeywordCoverage: boolean;
  showAuthenticity: boolean;
  showRequirements: boolean;
}

function getVisibleMetrics(currentPhase: string): VisibleMetrics {
  const STRATEGIST_STAGES = new Set([
    'intake',
    'positioning',
    'research',
    'gap_analysis',
    'architect',
    'architect_review',
  ]);
  const CRAFTSMAN_STAGES = new Set(['section_writing', 'section_review']);
  const PRODUCER_STAGES = new Set(['quality_review', 'revision']);

  if (STRATEGIST_STAGES.has(currentPhase)) {
    return {
      showAts: false,
      showKeywordCoverage: false,
      showAuthenticity: false,
      showRequirements: false,
    };
  }

  if (CRAFTSMAN_STAGES.has(currentPhase)) {
    return {
      showAts: false,
      showKeywordCoverage: false,
      showAuthenticity: false,
      showRequirements: true,
    };
  }

  if (PRODUCER_STAGES.has(currentPhase) || currentPhase === 'complete') {
    return {
      showAts: true,
      showKeywordCoverage: true,
      showAuthenticity: true,
      showRequirements: true,
    };
  }

  return {
    showAts: false,
    showKeywordCoverage: false,
    showAuthenticity: false,
    showRequirements: false,
  };
}

export function WorkflowStatsRail({
  currentPhase,
  isProcessing,
  isGateActive = false,
  stalledSuspected = false,
  pipelineActivity = null,
  sessionComplete,
  error,
  panelData,
  resume,
  compact = false,
}: WorkflowStatsRailProps) {
  const { ats, keywordCoverage, authenticity, requirements } = metricSnapshot(panelData, resume);
  const visibleMetrics = getVisibleMetrics(currentPhase);
  const runtimeState = pipelineActivity?.processing_state ?? (
    error
      ? 'error'
      : stalledSuspected
        ? 'stalled_suspected'
        : (sessionComplete || currentPhase === 'complete')
          ? 'complete'
          : isGateActive
            ? 'waiting_for_input'
            : isProcessing
              ? 'processing'
              : 'idle'
  );
  const status = runtimeState === 'error'
    ? 'Error'
    : runtimeState === 'stalled_suspected'
      ? 'Potentially Stalled'
      : runtimeState === 'complete'
        ? 'Complete'
        : runtimeState === 'waiting_for_input'
          ? 'Waiting for Input'
          : runtimeState === 'processing'
            ? 'Processing'
            : runtimeState === 'reconnecting'
              ? 'Reconnecting'
              : 'Idle';
  const statusClass = error
    ? 'text-red-100/90'
    : status === 'Potentially Stalled'
      ? 'text-amber-100/90'
    : status === 'Complete'
      ? 'text-emerald-100/90'
      : 'text-white/62';

  const hasAts = visibleMetrics.showAts && ats != null;
  const hasKeywordCoverage = visibleMetrics.showKeywordCoverage && keywordCoverage != null;
  const hasAuthenticity = visibleMetrics.showAuthenticity && authenticity != null;
  const hasRequirements = visibleMetrics.showRequirements && Boolean(requirements);
  const hasAnyMetrics = hasAts || hasKeywordCoverage || hasAuthenticity || hasRequirements;

  // During strategist stages, skip the entire rail — no metrics exist yet
  const noMetricsYet = !hasAnyMetrics && !Object.values(visibleMetrics).some(Boolean);

  const content = (
    <GlassCard className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/65">{phaseLabel(currentPhase)}</span>
        <span className={`text-xs font-medium ${statusClass}`}>{status}</span>
      </div>
      {!noMetricsYet && (
        <div className="mt-2 space-y-1.5">
          {hasRequirements && requirements && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/55">Requirements</span>
              <span className="text-xs font-semibold text-white/86">{requirements}</span>
            </div>
          )}
          {hasAts && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/55">ATS Score</span>
              <span className="text-xs font-semibold text-white/86">{ats}%</span>
            </div>
          )}
          {hasKeywordCoverage && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/55">Keyword Coverage</span>
              <span className="text-xs font-semibold text-white/86">{keywordCoverage}%</span>
            </div>
          )}
          {hasAuthenticity && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/55">Authenticity</span>
              <span className="text-xs font-semibold text-white/86">{authenticity}%</span>
            </div>
          )}
          {!hasAnyMetrics && (
            <p className="text-xs text-white/45">No metrics available for this stage yet.</p>
          )}
        </div>
      )}
    </GlassCard>
  );

  if (compact) {
    return (
      <aside className="border-b border-white/[0.1] px-3 py-2">
        {content}
      </aside>
    );
  }

  return (
    <aside className="h-full overflow-y-auto border-l border-white/[0.1] px-3 py-3">
      {content}
    </aside>
  );
}
