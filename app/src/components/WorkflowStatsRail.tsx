import { Activity, Gauge, Hash, ShieldCheck, ListChecks } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { PHASE_LABELS } from '@/constants/phases';
import type { PanelData } from '@/types/panels';
import type { FinalResume } from '@/types/resume';
import type { PipelineActivitySnapshot, PipelineRuntimeMetricsSnapshot } from '@/types/session';

interface WorkflowStatsRailProps {
  currentPhase: string;
  isProcessing: boolean;
  isGateActive?: boolean;
  stalledSuspected?: boolean;
  pipelineActivity?: PipelineActivitySnapshot | null;
  runtimeMetrics?: PipelineRuntimeMetricsSnapshot | null;
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

/**
 * Determines which metrics are visible based on the current pipeline phase.
 *
 * - Strategist stages (intake → architect_review): Phase + Status only.
 *   No metrics yet — they don't exist at this point.
 * - Craftsman stages (section_writing, section_review): Phase + Status +
 *   Requirements count (if available).
 * - Producer stages (quality_review, revision): All metrics.
 * - complete: All metrics.
 * - onboarding or unknown: No metrics (show placeholder).
 */
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

  // onboarding, unknown: no metrics yet
  return {
    showAts: false,
    showKeywordCoverage: false,
    showAuthenticity: false,
    showRequirements: false,
  };
}

// ─── MetricRow component ──────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2">
      <div className="flex items-center gap-2 text-white/65">
        <Icon className="h-3.5 w-3.5 text-white/58" />
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-semibold text-white/86">{value}</span>
    </div>
  );
}

export function WorkflowStatsRail({
  currentPhase,
  isProcessing,
  isGateActive = false,
  stalledSuspected = false,
  pipelineActivity = null,
  runtimeMetrics = null,
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

  const sessionCard = (
    <GlassCard className="p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/48">
        Session
      </div>
      <MetricRow
        label="Phase"
        value={phaseLabel(currentPhase)}
        icon={Activity}
      />
      <div className="mt-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2">
        <span className={`text-xs ${statusClass}`}>
          {status}
        </span>
      </div>
    </GlassCard>
  );

  // Determine which metrics actually have values AND are permitted by stage
  const hasAts = visibleMetrics.showAts && ats != null;
  const hasKeywordCoverage = visibleMetrics.showKeywordCoverage && keywordCoverage != null;
  const hasAuthenticity = visibleMetrics.showAuthenticity && authenticity != null;
  const hasRequirements = visibleMetrics.showRequirements && Boolean(requirements);
  const hasAnyMetrics = hasAts || hasKeywordCoverage || hasAuthenticity || hasRequirements;
  const noMetricsYet = !hasAnyMetrics && !Object.values(visibleMetrics).some(Boolean);

  const metricsCard = (
    <GlassCard className="p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/48">
        Metrics
      </div>
      {hasAts && <MetricRow label="ATS Score" value={`${ats}%`} icon={Gauge} />}
      {hasKeywordCoverage && (
        <div className="mt-2">
          <MetricRow label="Keyword Coverage" value={`${keywordCoverage}%`} icon={Hash} />
        </div>
      )}
      {hasAuthenticity && (
        <div className="mt-2">
          <MetricRow label="Authenticity" value={`${authenticity}%`} icon={ShieldCheck} />
        </div>
      )}
      {hasRequirements && requirements && (
        <div className="mt-2">
          <MetricRow label="Requirements" value={requirements} icon={ListChecks} />
        </div>
      )}
      {(!hasAnyMetrics) && (
        <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-xs text-white/56">
          {noMetricsYet
            ? 'Metrics appear as the pipeline advances.'
            : 'No metrics available for this stage yet.'}
        </div>
      )}
    </GlassCard>
  );

  if (compact) {
    return (
      <aside className="border-b border-white/[0.1] px-3 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <div className="min-w-[185px] flex-1">{sessionCard}</div>
          <div className="min-w-[220px] flex-1">{metricsCard}</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full overflow-y-auto border-l border-white/[0.1] px-3 py-3">
      <div className="space-y-3">
        {sessionCard}
        {metricsCard}
      </div>
    </aside>
  );
}
