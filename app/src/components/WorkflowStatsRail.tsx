import { Activity, Gauge, Hash, ShieldCheck, ListChecks } from 'lucide-react';
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
  sessionComplete,
  error,
  panelData,
  resume,
  compact = false,
}: WorkflowStatsRailProps) {
  const { ats, keywordCoverage, authenticity, requirements } = metricSnapshot(panelData, resume);
  const status = error
    ? 'Error'
    : stalledSuspected
      ? 'Potentially Stalled'
    : (sessionComplete || currentPhase === 'complete')
      ? 'Complete'
      : isGateActive
        ? 'Waiting for Input'
      : isProcessing
        ? 'Processing'
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
      {(pipelineActivity?.current_activity_message || pipelineActivity?.stage) && (
        <div className="mt-2 rounded-lg border border-white/[0.1] bg-white/[0.02] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-white/42">Backend</div>
          <div className="mt-1 text-xs text-white/72">
            {pipelineActivity.current_activity_message ?? 'Waiting for backend updates.'}
          </div>
          {pipelineActivity.stage && (
            <div className="mt-1 text-[10px] text-white/45">
              Stage: {phaseLabel(pipelineActivity.stage)}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );

  const metricsCard = (
    <GlassCard className="p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/48">
        Metrics
      </div>
      {ats != null && <MetricRow label="ATS Score" value={`${ats}%`} icon={Gauge} />}
      {keywordCoverage != null && (
        <div className="mt-2">
          <MetricRow label="Keyword Coverage" value={`${keywordCoverage}%`} icon={Hash} />
        </div>
      )}
      {authenticity != null && (
        <div className="mt-2">
          <MetricRow label="Authenticity" value={`${authenticity}%`} icon={ShieldCheck} />
        </div>
      )}
      {requirements && (
        <div className="mt-2">
          <MetricRow label="Requirements" value={requirements} icon={ListChecks} />
        </div>
      )}
      {ats == null && keywordCoverage == null && authenticity == null && !requirements && (
        <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-xs text-white/56">
          Metrics appear as the pipeline advances.
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
