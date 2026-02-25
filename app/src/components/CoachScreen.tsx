import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, History, X } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { WorkflowStatsRail } from './WorkflowStatsRail';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { GlassInput } from './GlassInput';
import { ResumePanel } from './ResumePanel';
import { SafePanelContent } from './panels/panel-renderer';
import { runPanelPayloadSmokeChecks } from './panels/panel-smoke';
import { WorkspaceShell } from './workspace/WorkspaceShell';
import { useWorkspaceNavigation } from '@/hooks/useWorkspaceNavigation';
import { useWorkflowSession } from '@/hooks/useWorkflowSession';
import { PROCESS_STEP_CONTRACTS, processStepFromPhase, processStepFromWorkflowNode } from '@/constants/process-contract';
import { PHASE_LABELS } from '@/constants/phases';
import type { ChatMessage, ToolStatus, AskUserPromptData, PhaseGateData, DraftReadinessUpdate, WorkflowReplanUpdate } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData } from '@/types/panels';
import {
  WORKFLOW_NODES,
  panelDataToWorkflowNode,
  phaseToWorkflowNode,
  workflowNodeIndex,
  type WorkflowNodeStatus,
  type WorkspaceNodeSnapshot,
  type WorkflowNodeKey,
} from '@/types/workflow';

interface CoachScreenProps {
  sessionId?: string | null;
  accessToken?: string | null;
  messages: ChatMessage[];
  streamingText: string;
  tools: ToolStatus[];
  askPrompt: AskUserPromptData | null;
  phaseGate: PhaseGateData | null;
  currentPhase: string;
  isProcessing: boolean;
  connected?: boolean;
  lastBackendActivityAt?: string | null;
  stalledSuspected?: boolean;
  sessionComplete?: boolean;
  resume: FinalResume | null;
  panelType: PanelType | null;
  panelData: PanelData | null;
  error: string | null;
  onSendMessage: (content: string) => void | Promise<void>;
  isPipelineGateActive?: boolean;
  onPipelineRespond?: (gate: string, response: unknown) => void;
  positioningProfileFound?: { profile: unknown; updated_at: string } | null;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
  approvedSections?: Record<string, string>;
  onDismissSuggestion?: (id: string) => void;
  onRestartPipelineFromLastInputs?: (sessionId: string) => Promise<{ success: boolean; message: string }>;
  liveDraftReadiness?: DraftReadinessUpdate | null;
  liveWorkflowReplan?: WorkflowReplanUpdate | null;
  onReconnectStream?: () => void;
}

type SnapshotMap = Partial<Record<WorkflowNodeKey, WorkspaceNodeSnapshot>>;

function snapshotsStorageKey(sessionId: string) {
  return `resume-agent:workspace-snapshots:${sessionId}`;
}

function loadSnapshotMap(sessionId: string): SnapshotMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(snapshotsStorageKey(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnapshotMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

const MAX_SNAPSHOT_SESSIONS = 20;
const SNAPSHOT_KEY_PREFIX = 'resume-agent:workspace-snapshots:';

function pruneSnapshotStorage() {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(SNAPSHOT_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    if (keys.length > MAX_SNAPSHOT_SESSIONS) {
      // Remove oldest keys (we have no timestamps, so just remove by insertion order)
      keys.slice(0, keys.length - MAX_SNAPSHOT_SESSIONS).forEach((k) => {
        window.localStorage.removeItem(k);
      });
    }
  } catch {
    // Best effort
  }
}

function persistSnapshotMap(sessionId: string, map: SnapshotMap) {
  if (typeof window === 'undefined') return;
  try {
    pruneSnapshotStorage();
    window.localStorage.setItem(snapshotsStorageKey(sessionId), JSON.stringify(map));
  } catch {
    // Best effort
  }
}

function nodeTitle(nodeKey: WorkflowNodeKey): string {
  return WORKFLOW_NODES.find((node) => node.key === nodeKey)?.label ?? 'Workspace';
}

function formatPendingGateLabelForWorkspace(gate: string | null | undefined): string | undefined {
  if (!gate) return undefined;
  if (gate === 'positioning_profile_choice') return 'Choose how to use the saved positioning profile';
  if (gate === 'architect_review') return 'Review and approve the resume blueprint';
  if (gate.startsWith('positioning_q_')) return 'Answer the current Why Me question';
  if (gate.startsWith('questionnaire_')) return 'Complete the current questionnaire';
  if (gate.startsWith('section_review_')) return 'Review the current section draft';
  return gate.replace(/_/g, ' ');
}

function defaultEvidenceTargetForMode(mode: 'fast_draft' | 'balanced' | 'deep_dive'): number {
  if (mode === 'fast_draft') return 5;
  if (mode === 'deep_dive') return 12;
  return 8;
}

function formatReadinessPriorityLabel(priority: 'must_have' | 'implicit' | 'nice_to_have'): string {
  if (priority === 'must_have') return 'Must-have';
  if (priority === 'implicit') return 'Implicit';
  return 'Nice-to-have';
}

function getSectionsBundleNavDetail(snapshot: WorkspaceNodeSnapshot | undefined): string | null {
  const panelData = snapshot?.panelData;
  if (!panelData || panelData.type !== 'section_review') return null;
  const context = panelData.context;
  if (!context || context.review_strategy !== 'bundled' || !Array.isArray(context.review_bundles)) {
    return null;
  }
  const bundles = context.review_bundles.filter((b) => b && typeof b === 'object');
  if (bundles.length === 0) return null;
  const completed = bundles.filter((b) => b.status === 'complete' || b.status === 'auto_approved').length;
  const current = bundles.find((b) => b.key === context.current_review_bundle_key);
  if (completed >= bundles.length) return 'Bundles 100%';
  if (current?.label) {
    return `${completed}/${bundles.length} bundles • ${current.label}`;
  }
  return `${completed}/${bundles.length} bundles`;
}

function getSectionsBundleNavDetailFromSummary(
  bundleSummary: {
    total_bundles: number;
    completed_bundles: number;
    current_review_bundle_key: 'headline' | 'core_experience' | 'supporting' | null;
    bundles: Array<{ key: 'headline' | 'core_experience' | 'supporting'; label: string }>;
  } | null | undefined,
): string | null {
  if (!bundleSummary || bundleSummary.total_bundles <= 0) return null;
  if (bundleSummary.completed_bundles >= bundleSummary.total_bundles) return 'Bundles 100%';
  const current = bundleSummary.bundles.find((bundle) => bundle.key === bundleSummary.current_review_bundle_key);
  if (current?.label) return `${bundleSummary.completed_bundles}/${bundleSummary.total_bundles} bundles • ${current.label}`;
  return `${bundleSummary.completed_bundles}/${bundleSummary.total_bundles} bundles`;
}

function buildReplanNodeDetailMap(
  summaryReplan: {
    pending: boolean;
    stale_nodes: WorkflowNodeKey[];
    requires_restart: boolean;
  } | null | undefined,
  liveReplan: WorkflowReplanUpdate | null | undefined,
): Partial<Record<WorkflowNodeKey, string>> {
  if (!summaryReplan && !liveReplan) return {};
  const staleNodes = new Set<WorkflowNodeKey>(summaryReplan?.stale_nodes ?? []);
  const details: Partial<Record<WorkflowNodeKey, string>> = {};

  if (liveReplan?.state === 'in_progress') {
    const label = liveReplan.phase === 'refresh_gap_analysis'
      ? 'Regenerating'
      : liveReplan.phase === 'rebuild_blueprint'
        ? 'Rebuilding'
        : 'Applying benchmark';
    for (const node of staleNodes) details[node] = label;
    return details;
  }

  if (summaryReplan?.pending || liveReplan?.state === 'requested') {
    const label = summaryReplan?.requires_restart || liveReplan?.requires_restart
      ? 'Rebuild required'
      : 'Replan pending';
    for (const node of staleNodes) details[node] = label;
    return details;
  }

  if (liveReplan?.state === 'completed') {
    details.benchmark = 'Replan applied';
  }

  return details;
}

function renderNodeContentPlaceholder(nodeKey: WorkflowNodeKey, isActiveNode: boolean) {
  return (
    <div className="h-full p-3 md:p-4">
      <GlassCard className="h-full p-6">
        <div className="mb-2 flex items-center gap-2 text-white/78">
          <History className="h-4 w-4 text-white/45" />
          <h3 className="text-sm font-semibold">{nodeTitle(nodeKey)}</h3>
        </div>
        <p className="max-w-xl text-sm text-white/56">
          {isActiveNode
            ? 'Your coach is working on this step. Results will appear here shortly.'
            : 'This step hasn\'t been reached yet. Continue your session to see results here.'}
        </p>
      </GlassCard>
    </div>
  );
}

function renderQuestionsNodeSummaryPlaceholder(
  isActiveNode: boolean,
  draftReadiness: {
    high_impact_remaining?: Array<{
      requirement: string;
      classification: 'partial' | 'gap';
      priority: 'must_have' | 'implicit' | 'nice_to_have';
      evidence_count: number;
    }>;
  } | null,
  questionMetrics?: {
    total: number;
    answered: number;
    skipped: number;
    deferred: number;
    by_impact: {
      high: { total: number; answered: number; skipped: number; deferred: number };
      medium: { total: number; answered: number; skipped: number; deferred: number };
      low: { total: number; answered: number; skipped: number; deferred: number };
      untagged: { total: number; answered: number; skipped: number; deferred: number };
    };
    latest_activity_at: string | null;
  } | null,
  questionHistory?: Array<{
    questionnaire_id: string;
    question_id: string;
    stage: string;
    status: 'answered' | 'skipped' | 'deferred';
    impact_tag: 'high' | 'medium' | 'low' | null;
    payoff_hint: string | null;
    updated_at: string | null;
  }> | null,
  questionReuseSummaries?: Array<{
    stage: 'positioning' | 'gap_analysis';
    questionnaire_kind: 'positioning_batch' | 'gap_analysis_quiz';
    skipped_count: number;
    matched_by_topic_count: number;
    matched_by_payoff_count: number;
    prior_answered_count: number;
    prior_deferred_count: number;
    benchmark_edit_version: number | null;
    sample_topics: string[];
    sample_payoffs: string[];
    message: string | null;
    version: number | null;
    created_at: string | null;
  }> | null,
  questionReuseMetrics?: {
    total_skipped: number;
    by_stage: {
      positioning: { events: number; skipped_count: number };
      gap_analysis: { events: number; skipped_count: number };
    };
    matched_by_topic_count: number;
    matched_by_payoff_count: number;
    prior_answered_count: number;
    prior_deferred_count: number;
    latest_created_at: string | null;
  } | null,
  onOpenQuestions?: () => void,
) {
  const remaining = draftReadiness?.high_impact_remaining ?? [];
  return (
    <div className="h-full p-3 md:p-4">
      <GlassCard className="h-full p-6">
        <div className="mb-2 flex items-center gap-2 text-white/78">
          <History className="h-4 w-4 text-white/45" />
          <h3 className="text-sm font-semibold">Questions</h3>
        </div>
        {remaining.length > 0 ? (
          <>
            <p className="max-w-2xl text-sm text-white/56">
              {isActiveNode
                ? 'The coach is between question batches. These are the highest-impact remaining areas it is likely to ask about next.'
                : 'These are the highest-impact remaining areas the coach is likely to ask about next.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {remaining.slice(0, 6).map((item, index) => (
                <div
                  key={`${item.requirement}-${index}`}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-xs text-white/80"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                      item.priority === 'must_have'
                        ? 'border-rose-300/20 bg-rose-400/[0.08] text-rose-100/85'
                        : item.priority === 'implicit'
                          ? 'border-amber-300/20 bg-amber-400/[0.08] text-amber-100/85'
                          : 'border-white/[0.1] bg-white/[0.03] text-white/60'
                    }`}>
                      {item.priority === 'must_have' ? 'Must-have' : item.priority === 'implicit' ? 'Implicit' : 'Nice-to-have'}
                    </span>
                    <span className={item.classification === 'gap' ? 'text-rose-100/80' : 'text-amber-100/80'}>
                      {item.classification === 'gap' ? 'Gap' : 'Partial'}
                    </span>
                  </div>
                  <div className="mt-1 max-w-[32rem]">{item.requirement}</div>
                </div>
              ))}
            </div>
            {questionMetrics && questionMetrics.total > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-white/40">Question Progress</div>
                  <div className="mt-1 text-xs text-white/78">
                    Answered {questionMetrics.answered} • Deferred {questionMetrics.deferred} • Skipped {questionMetrics.skipped}
                  </div>
                  {questionMetrics.latest_activity_at && (
                    <div className="mt-1 text-[10px] text-white/45">
                      Last activity: {new Date(questionMetrics.latest_activity_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-white/40">High-Impact Questions</div>
                  <div className="mt-1 text-xs text-white/78">
                    Answered {questionMetrics.by_impact.high.answered} / {questionMetrics.by_impact.high.total}
                  </div>
                  <div className="mt-1 text-[10px] text-white/50">
                    Deferred {questionMetrics.by_impact.high.deferred} • Skipped {questionMetrics.by_impact.high.skipped}
                  </div>
                </div>
              </div>
            )}
            {Array.isArray(questionHistory) && questionHistory.length > 0 && (
              <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-white/40">Recent Question Rationale</div>
                <div className="mt-2 space-y-1.5">
                  {questionHistory.slice(0, 5).map((item, index) => (
                    <div key={`${item.questionnaire_id}:${item.question_id}:${index}`} className="rounded-md border border-white/[0.05] bg-white/[0.015] px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className={`rounded-full border px-1.5 py-0.5 ${
                          item.impact_tag === 'high'
                            ? 'border-rose-300/20 bg-rose-400/[0.08] text-rose-100/85'
                            : item.impact_tag === 'medium'
                              ? 'border-sky-300/20 bg-sky-400/[0.08] text-sky-100/85'
                              : 'border-white/[0.1] bg-white/[0.03] text-white/60'
                        }`}>
                          {item.impact_tag ? `${item.impact_tag} impact` : 'untagged'}
                        </span>
                        <span className={`rounded-full border px-1.5 py-0.5 ${
                          item.status === 'answered'
                            ? 'border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100/85'
                            : item.status === 'deferred'
                              ? 'border-amber-300/20 bg-amber-400/[0.08] text-amber-100/85'
                              : 'border-white/[0.1] bg-white/[0.03] text-white/60'
                        }`}>
                          {item.status}
                        </span>
                        <span className="text-white/45">{item.stage.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed text-white/74">
                        {item.payoff_hint}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(questionReuseSummaries) && questionReuseSummaries.length > 0 && (
              <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-white/40">Question Reuse (to reduce repeats)</div>
                {questionReuseMetrics && questionReuseMetrics.total_skipped > 0 && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-white/35">Reuse Savings</div>
                      <div className="mt-1 text-xs text-white/78">
                        Reused {questionReuseMetrics.total_skipped} lower-impact question{questionReuseMetrics.total_skipped === 1 ? '' : 's'}
                      </div>
                      <div className="mt-1 text-[10px] text-white/45">
                        Positioning {questionReuseMetrics.by_stage.positioning.skipped_count} • Gap Analysis {questionReuseMetrics.by_stage.gap_analysis.skipped_count}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-white/35">Reuse Basis</div>
                      <div className="mt-1 text-xs text-white/78">
                        Topic match {questionReuseMetrics.matched_by_topic_count} • Payoff match {questionReuseMetrics.matched_by_payoff_count}
                      </div>
                      <div className="mt-1 text-[10px] text-white/45">
                        Prior answered {questionReuseMetrics.prior_answered_count} • Prior deferred {questionReuseMetrics.prior_deferred_count}
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-2 space-y-1.5">
                  {questionReuseSummaries.slice(0, 4).map((item, index) => (
                    <div key={`${item.stage}:${item.version ?? index}:${index}`} className="rounded-md border border-white/[0.05] bg-white/[0.015] px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-1.5 py-0.5 text-white/70">
                          {item.stage === 'positioning' ? 'Positioning' : 'Gap Analysis'}
                        </span>
                        <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.08] px-1.5 py-0.5 text-sky-100/85">
                          Reused {item.skipped_count}
                        </span>
                        <span className="text-white/45">
                          topic {item.matched_by_topic_count} • payoff {item.matched_by_payoff_count}
                        </span>
                        {typeof item.benchmark_edit_version === 'number' && (
                          <span className="text-white/40">benchmark v{item.benchmark_edit_version}</span>
                        )}
                      </div>
                      {item.message && (
                        <div className="mt-1 text-[11px] leading-relaxed text-white/72">
                          {item.message}
                        </div>
                      )}
                      {(item.prior_answered_count > 0 || item.prior_deferred_count > 0) && (
                        <div className="mt-1 text-[10px] text-white/48">
                          Based on prior {item.prior_answered_count > 0 ? `${item.prior_answered_count} answered` : '0 answered'}
                          {item.prior_deferred_count > 0 ? ` and ${item.prior_deferred_count} deferred` : ''} response
                          {item.prior_answered_count + item.prior_deferred_count === 1 ? '' : 's'}.
                        </div>
                      )}
                      {item.sample_payoffs.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.sample_payoffs.slice(0, 2).map((payoff, payoffIndex) => (
                            <span
                              key={`${payoff}-${payoffIndex}`}
                              className="rounded-full border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-white/60"
                              title={payoff}
                            >
                              {payoff.length > 44 ? `${payoff.slice(0, 44)}...` : payoff}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {onOpenQuestions && (
              <div className="mt-3">
                <GlassButton type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={onOpenQuestions}>
                  Refresh Questions
                </GlassButton>
              </div>
            )}
          </>
        ) : (
          <p className="max-w-xl text-sm text-white/56">
            {isActiveNode
              ? 'Your coach is working on this step. Results will appear here shortly.'
              : 'This step hasn\'t been reached yet. Continue your session to see results here.'}
          </p>
        )}
      </GlassCard>
    </div>
  );
}

function renderSectionsNodeSummaryPlaceholder(
  isActiveNode: boolean,
  bundleSummary?: {
    review_strategy: 'per_section' | 'bundled';
    current_review_bundle_key: 'headline' | 'core_experience' | 'supporting' | null;
    total_bundles: number;
    completed_bundles: number;
    bundles: Array<{
      key: 'headline' | 'core_experience' | 'supporting';
      label: string;
      total_sections: number;
      review_required: number;
      reviewed_required: number;
      status: 'pending' | 'in_progress' | 'complete' | 'auto_approved';
    }>;
  } | null,
) {
  if (!bundleSummary || bundleSummary.review_strategy !== 'bundled' || bundleSummary.total_bundles <= 0) {
    return renderNodeContentPlaceholder('sections', isActiveNode);
  }
  return (
    <div className="h-full p-3 md:p-4">
      <GlassCard className="h-full p-6">
        <div className="mb-2 flex items-center gap-2 text-white/78">
          <History className="h-4 w-4 text-white/45" />
          <h3 className="text-sm font-semibold">Sections</h3>
        </div>
        <p className="max-w-2xl text-sm text-white/56">
          {isActiveNode
            ? 'The coach is working through section writing/review. Bundle progress is shown below so you can see what is being reviewed versus auto-approved.'
            : 'Bundle review progress from the latest section-review checkpoint.'}
        </p>
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/75">
            <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-white/70">
              Bundled Review
            </span>
            <span>{bundleSummary.completed_bundles}/{bundleSummary.total_bundles} bundles complete</span>
            {bundleSummary.current_review_bundle_key && (
              <span className="text-white/55">
                Current: {bundleSummary.bundles.find((b) => b.key === bundleSummary.current_review_bundle_key)?.label ?? bundleSummary.current_review_bundle_key}
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {bundleSummary.bundles.map((bundle) => (
              <div
                key={`sections-node-bundle-${bundle.key}`}
                className={`rounded-lg border px-2.5 py-2 ${
                  bundle.status === 'complete'
                    ? 'border-emerald-300/18 bg-emerald-400/[0.04]'
                    : bundle.status === 'in_progress'
                      ? 'border-sky-300/18 bg-sky-400/[0.04]'
                      : bundle.status === 'auto_approved'
                        ? 'border-white/[0.08] bg-white/[0.015]'
                        : 'border-white/[0.06] bg-white/[0.01]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-white/82">{bundle.label}</span>
                  <span className="text-[10px] text-white/50">
                    {bundle.status === 'auto_approved'
                      ? 'auto'
                      : `${bundle.reviewed_required}/${bundle.review_required}`}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-white/50">
                  {bundle.total_sections} section{bundle.total_sections === 1 ? '' : 's'}
                  {bundle.review_required > 0 ? ` • ${bundle.review_required} in review set` : ' • auto-approved by mode'}
                </div>
                <div className="mt-1 text-[10px] text-white/42">
                  {bundle.status === 'in_progress'
                    ? 'In progress'
                    : bundle.status === 'complete'
                      ? 'Complete'
                      : bundle.status === 'auto_approved'
                        ? 'Auto-approved'
                        : 'Pending'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function BenchmarkInspectorCard({
  panelData,
  benchmarkEditSummary,
  replanSummary,
  replanStatus,
  onSaveAssumptions,
  isSaving,
}: {
  panelData: PanelData | null;
  benchmarkEditSummary?: {
    version: number | null;
    edited_at: string | null;
    note: string | null;
    assumption_key_count: number;
    assumption_keys: string[];
  } | null;
  replanSummary?: {
    pending: boolean;
    requires_restart: boolean;
    benchmark_edit_version: number | null;
  } | null;
  replanStatus?: {
    state: 'requested' | 'in_progress' | 'completed';
    benchmark_edit_version: number;
  } | null;
  onSaveAssumptions?: (assumptions: Record<string, unknown>, note?: string) => Promise<{ success: boolean; message: string }>;
  isSaving?: boolean;
}) {
  const researchPanel = panelData?.type === 'research_dashboard' ? panelData : null;
  const benchmarkAssumptions = (researchPanel?.benchmark?.assumptions && typeof researchPanel.benchmark.assumptions === 'object')
    ? researchPanel.benchmark.assumptions as Record<string, unknown>
    : {};
  const inferredAssumptions = (researchPanel?.benchmark?.inferred_assumptions && typeof researchPanel.benchmark.inferred_assumptions === 'object')
    ? researchPanel.benchmark.inferred_assumptions as Record<string, unknown>
    : {};
  const assumptionProvenance = (researchPanel?.benchmark?.assumption_provenance && typeof researchPanel.benchmark.assumption_provenance === 'object')
    ? researchPanel.benchmark.assumption_provenance
    : {};
  const confidenceByAssumption = (researchPanel?.benchmark?.confidence_by_assumption && typeof researchPanel.benchmark.confidence_by_assumption === 'object')
    ? researchPanel.benchmark.confidence_by_assumption
    : {};
  const whyInferred = (researchPanel?.benchmark?.why_inferred && typeof researchPanel.benchmark.why_inferred === 'object')
    ? researchPanel.benchmark.why_inferred
    : {};
  const assumptionEntries = Object.entries(benchmarkAssumptions).filter(([, value]) => value != null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [companyValue, setCompanyValue] = useState(
    (typeof benchmarkAssumptions.company_name === 'string' ? benchmarkAssumptions.company_name : null)
    ?? researchPanel?.company?.company_name
    ?? '',
  );
  const [seniorityValue, setSeniorityValue] = useState(
    (typeof benchmarkAssumptions.seniority_level === 'string' ? benchmarkAssumptions.seniority_level : null)
    ?? researchPanel?.jd_requirements?.seniority_level
    ?? '',
  );
  const [mustHavesText, setMustHavesText] = useState((researchPanel?.jd_requirements?.must_haves ?? []).join('\n'));
  const [keywordsText, setKeywordsText] = useState((researchPanel?.benchmark?.language_keywords ?? []).join('\n'));
  const [differentiatorsText, setDifferentiatorsText] = useState(
    (
      researchPanel?.benchmark?.competitive_differentiators
      ?? Object.values(researchPanel?.benchmark?.section_expectations ?? {}).filter((v): v is string => typeof v === 'string')
    ).join('\n'),
  );
  const [idealSummary, setIdealSummary] = useState(
    researchPanel?.benchmark?.ideal_candidate_summary ?? researchPanel?.benchmark?.ideal_profile ?? '',
  );

  useEffect(() => {
    if (!researchPanel) return;
    const assumptions = (researchPanel.benchmark?.assumptions && typeof researchPanel.benchmark.assumptions === 'object')
      ? researchPanel.benchmark.assumptions as Record<string, unknown>
      : {};
    setCompanyValue(
      (typeof assumptions.company_name === 'string' ? assumptions.company_name : null)
      ?? researchPanel.company?.company_name
      ?? '',
    );
    setSeniorityValue(
      (typeof assumptions.seniority_level === 'string' ? assumptions.seniority_level : null)
      ?? researchPanel.jd_requirements?.seniority_level
      ?? '',
    );
    setMustHavesText((researchPanel.jd_requirements?.must_haves ?? []).join('\n'));
    setKeywordsText((researchPanel.benchmark?.language_keywords ?? []).join('\n'));
    setDifferentiatorsText(
      (
        researchPanel.benchmark?.competitive_differentiators
        ?? Object.values(researchPanel.benchmark?.section_expectations ?? {}).filter((v): v is string => typeof v === 'string')
      ).join('\n'),
    );
    setIdealSummary(researchPanel.benchmark?.ideal_candidate_summary ?? researchPanel.benchmark?.ideal_profile ?? '');
    setNote('');
    setSaveMessage(null);
    setSaveError(null);
  }, [researchPanel]);

  if (!researchPanel) return null;

  const companyName = researchPanel.company?.company_name ?? 'Unknown company';
  const seniority = researchPanel.jd_requirements?.seniority_level ?? 'Not inferred yet';
  const mustHaveCount = researchPanel.jd_requirements?.must_haves?.length ?? 0;
  const keywordCount = researchPanel.benchmark?.language_keywords?.length ?? 0;
  const differentiatorCount = researchPanel.benchmark?.competitive_differentiators?.length
    ?? Object.keys(researchPanel.benchmark?.section_expectations ?? {}).length;
  const visibleAssumptionEntries = assumptionEntries
    .filter(([_, value]) => {
      if (typeof value === 'string') return value.trim().length > 0;
      return value != null;
    })
    .slice(0, 8);
  const latestEditVersion = benchmarkEditSummary?.version ?? null;
  const pendingReplanForLatestEdit = latestEditVersion != null
    && (
      replanSummary?.pending === true && replanSummary.benchmark_edit_version === latestEditVersion
      || replanStatus?.state === 'requested' && replanStatus.benchmark_edit_version === latestEditVersion
      || replanStatus?.state === 'in_progress' && replanStatus.benchmark_edit_version === latestEditVersion
    );
  const appliedLatestEdit = latestEditVersion != null
    && replanStatus?.state === 'completed'
    && replanStatus.benchmark_edit_version === latestEditVersion;

  const handleSave = async () => {
    if (!onSaveAssumptions) return;
    setSaveMessage(null);
    setSaveError(null);
    const assumptions = {
      company_name: companyValue.trim(),
      seniority_level: seniorityValue.trim(),
      must_haves: mustHavesText.split('\n').map((s) => s.trim()).filter(Boolean),
      benchmark_keywords: keywordsText.split('\n').map((s) => s.trim()).filter(Boolean),
      competitive_differentiators: differentiatorsText.split('\n').map((s) => s.trim()).filter(Boolean),
      ideal_candidate_summary: idealSummary.trim(),
    };
    const result = await onSaveAssumptions(assumptions, note.trim() || undefined);
    if (result.success) {
      setSaveMessage(result.message);
      setEditing(false);
    } else {
      setSaveError(result.message);
    }
  };

  return (
    <GlassCard className="mb-3 p-4">
      <div className="mb-2 flex items-center gap-2">
        <History className="h-4 w-4 text-[#afc4ff]/70" />
        <h3 className="text-sm font-semibold text-white/88">Benchmark Inspector</h3>
        <div className="ml-auto flex items-center gap-2">
          <GlassButton
            type="button"
            variant="ghost"
            onClick={() => setEditing((prev) => !prev)}
            className="h-auto px-2 py-1 text-[11px]"
          >
            {editing ? 'Close' : 'Edit Assumptions'}
          </GlassButton>
        </div>
      </div>
      <p className="mb-3 text-xs text-white/56">
        These are the current inferred benchmark assumptions driving positioning decisions. Edits apply immediately early in the process; after section writing starts, changes require confirmation and a downstream rebuild to stay consistent.
      </p>
      {benchmarkEditSummary?.version != null && (
        <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Latest Benchmark Edit
            </span>
            <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/70">
              v{benchmarkEditSummary.version}
            </span>
            {pendingReplanForLatestEdit && (
              <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.06] px-2 py-0.5 text-[10px] text-sky-100/85">
                Pending apply
              </span>
            )}
            {appliedLatestEdit && (
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/[0.06] px-2 py-0.5 text-[10px] text-emerald-100/85">
                Applied to run
              </span>
            )}
            {!pendingReplanForLatestEdit && !appliedLatestEdit && (
              <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/60">
                Saved
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-white/55">
            {benchmarkEditSummary.edited_at
              ? `Edited ${new Date(benchmarkEditSummary.edited_at).toLocaleString()}`
              : 'Edit time unavailable'}
            {' • '}
            {benchmarkEditSummary.assumption_key_count} field{benchmarkEditSummary.assumption_key_count === 1 ? '' : 's'} changed
          </div>
          {benchmarkEditSummary.note && (
            <div className="mt-1 text-[11px] leading-relaxed text-white/62">
              Note: {benchmarkEditSummary.note}
            </div>
          )}
        </div>
      )}
      {visibleAssumptionEntries.length > 0 && (
        <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Inferred Assumptions (Why + Confidence)
          </div>
          <div className="space-y-2">
            {visibleAssumptionEntries.map(([key, value]) => {
              const confidence = typeof confidenceByAssumption[key] === 'number'
                ? confidenceByAssumption[key]
                : null;
              const why = typeof whyInferred[key] === 'string' ? whyInferred[key] : null;
              const provenance = assumptionProvenance[key];
              const isUserEdited = provenance?.source === 'user_edited';
              const originalValue = inferredAssumptions[key];
              const stringValue = Array.isArray(value)
                ? value.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number').slice(0, 5).join(', ')
                : typeof value === 'number'
                  ? String(value)
                  : (typeof value === 'string' ? value : JSON.stringify(value));
              const originalStringValue = Array.isArray(originalValue)
                ? originalValue.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number').slice(0, 5).join(', ')
                : typeof originalValue === 'number'
                  ? String(originalValue)
                  : (typeof originalValue === 'string' ? originalValue : (originalValue == null ? '' : JSON.stringify(originalValue)));
              const confidenceClass = confidence == null
                ? 'border-white/[0.1] bg-white/[0.03] text-white/60'
                : confidence >= 0.85
                  ? 'border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100/85'
                  : confidence >= 0.65
                    ? 'border-sky-300/20 bg-sky-400/[0.06] text-sky-100/85'
                    : 'border-amber-300/20 bg-amber-400/[0.06] text-amber-100/85';
              return (
                <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-white/45">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      isUserEdited
                        ? 'border-violet-300/20 bg-violet-400/[0.08] text-violet-100/85'
                        : 'border-white/[0.1] bg-white/[0.03] text-white/60'
                    }`}>
                      {isUserEdited ? 'User edited' : 'Inferred'}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${confidenceClass}`}>
                      {confidence == null ? 'Confidence n/a' : `Confidence ${Math.round(confidence * 100)}%`}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/84 break-words">
                    {String(stringValue ?? 'Not inferred')}
                  </div>
                  {isUserEdited && originalStringValue && originalStringValue !== String(stringValue ?? '') && (
                    <div className="mt-1 text-[10px] text-white/45 break-words">
                      Originally inferred: {originalStringValue}
                    </div>
                  )}
                  {why && (
                    <div className="mt-1 text-[10px] leading-relaxed text-white/50">
                      {why}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {saveMessage && (
        <div className="mb-3 rounded-lg border border-emerald-300/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-100/85">
          {saveMessage}
        </div>
      )}
      {saveError && (
        <div className="mb-3 rounded-lg border border-red-300/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-100/85">
          {saveError}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Company</div>
          <div className="mt-1 text-xs text-white/84">{companyName}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Seniority</div>
          <div className="mt-1 text-xs text-white/84">{seniority}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Must-Haves</div>
          <div className="mt-1 text-xs text-white/84">{mustHaveCount}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Benchmark Keywords</div>
          <div className="mt-1 text-xs text-white/84">{keywordCount}</div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">Competitive Differentiators</div>
          <div className="mt-1 text-xs text-white/84">{differentiatorCount}</div>
        </div>
      </div>
      {editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/65">
              <span className="mb-1 block">Company</span>
              <input
                value={companyValue}
                onChange={(e) => setCompanyValue(e.target.value)}
                className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              />
            </label>
            <label className="text-xs text-white/65">
              <span className="mb-1 block">Seniority</span>
              <input
                value={seniorityValue}
                onChange={(e) => setSeniorityValue(e.target.value)}
                className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              />
            </label>
          </div>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Must-Haves (one per line)</span>
            <textarea
              value={mustHavesText}
              onChange={(e) => setMustHavesText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Benchmark Keywords (one per line)</span>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Competitive Differentiators (one per line)</span>
            <textarea
              value={differentiatorsText}
              onChange={(e) => setDifferentiatorsText(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Ideal Candidate Summary</span>
            <textarea
              value={idealSummary}
              onChange={(e) => setIdealSummary(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
            />
          </label>
          <label className="block text-xs text-white/65">
            <span className="mb-1 block">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-2 text-xs text-white/90 outline-none focus:border-[#afc4ff]/40"
              placeholder="Why you are changing these assumptions"
            />
          </label>
          <div className="flex justify-end gap-2">
            <GlassButton
              type="button"
              variant="ghost"
              onClick={() => { setEditing(false); setNote(''); }}
              className="h-auto px-3 py-2 text-xs"
            >
              Cancel
            </GlassButton>
            <GlassButton
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-auto px-3 py-2 text-xs"
            >
              {isSaving ? 'Saving...' : 'Save Assumptions'}
            </GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function computeNodeStatuses(
  activeNode: WorkflowNodeKey,
  snapshots: SnapshotMap,
  isProcessing: boolean,
  isGateActive: boolean,
  sessionComplete?: boolean,
): Record<WorkflowNodeKey, WorkflowNodeStatus> {
  const activeIndex = workflowNodeIndex(activeNode);
  const result = {} as Record<WorkflowNodeKey, WorkflowNodeStatus>;

  for (const node of WORKFLOW_NODES) {
    const index = workflowNodeIndex(node.key);
    const hasSnapshot = Boolean(snapshots[node.key]);

    let status: WorkflowNodeStatus = 'locked';
    if (index <= activeIndex) status = 'ready';
    if (hasSnapshot) status = 'complete';
    if (node.key === activeNode) {
      status = isGateActive ? 'blocked' : (isProcessing ? 'in_progress' : (hasSnapshot ? 'complete' : 'ready'));
    }
    if (sessionComplete && hasSnapshot) {
      status = 'complete';
    }
    result[node.key] = status;
  }

  return result;
}

export function CoachScreen({
  sessionId = null,
  accessToken = null,
  messages,
  streamingText,
  tools,
  askPrompt,
  phaseGate,
  currentPhase,
  isProcessing,
  connected = false,
  lastBackendActivityAt = null,
  stalledSuspected = false,
  sessionComplete,
  resume,
  panelType,
  panelData,
  error,
  isPipelineGateActive,
  onSendMessage,
  onPipelineRespond,
  positioningProfileFound,
  onSaveCurrentResumeAsBase,
  approvedSections = {},
  onDismissSuggestion,
  onRestartPipelineFromLastInputs,
  liveDraftReadiness = null,
  liveWorkflowReplan = null,
  onReconnectStream,
}: CoachScreenProps) {
  const [profileChoiceMade, setProfileChoiceMade] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [isRestartingPipeline, setIsRestartingPipeline] = useState(false);
  const [evidenceTargetDraft, setEvidenceTargetDraft] = useState<number>(8);
  const [localSnapshots, setLocalSnapshots] = useState<SnapshotMap>({});
  const prevPanelDataRef = useRef<PanelData | null>(null);

  useEffect(() => {
    runPanelPayloadSmokeChecks();
  }, []);

  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  useEffect(() => {
    if (!sessionId) {
      setLocalSnapshots({});
      return;
    }
    setLocalSnapshots(loadSnapshotMap(sessionId));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    persistSnapshotMap(sessionId, localSnapshots);
  }, [sessionId, localSnapshots]);

  // Capture the latest panel as a node snapshot so users can jump back.
  useEffect(() => {
    if (!panelData) return;
    const nodeKey = panelDataToWorkflowNode(panelData);
    if (!nodeKey) return;
    const panelDataChanged = panelData !== prevPanelDataRef.current;
    prevPanelDataRef.current = panelData;
    setLocalSnapshots((prev) => {
      const nextSnapshot: WorkspaceNodeSnapshot = {
        nodeKey,
        panelType,
        panelData,
        resume,
        capturedAt: panelDataChanged ? new Date().toISOString() : (prev[nodeKey]?.capturedAt ?? new Date().toISOString()),
        currentPhase,
        isGateActive: Boolean(isPipelineGateActive),
      };
      return {
        ...prev,
        [nodeKey]: nextSnapshot,
      };
    });
  }, [panelData, panelType, resume, currentPhase, isPipelineGateActive]);

  // Keep export snapshot refreshed when completion resume changes
  useEffect(() => {
    if (!resume || panelData?.type !== 'completion') return;
    setLocalSnapshots((prev) => {
      const existing = prev.export;
      if (!existing) return prev;
      return {
        ...prev,
        export: {
          ...existing,
          resume,
          capturedAt: new Date().toISOString(),
        },
      };
    });
  }, [resume, panelData?.type]);

  const activeNode = useMemo(
    () => panelDataToWorkflowNode(panelData) ?? phaseToWorkflowNode(currentPhase),
    [panelData, currentPhase],
  );

  const {
    selectedNode,
    canGoBack,
    canGoForward,
    goToNode,
    goBack,
    goForward,
    returnToActiveNode,
  } = useWorkspaceNavigation({
    sessionId,
    activeNode,
  });

  const workflowSession = useWorkflowSession({
    sessionId,
    accessToken,
    selectedNode,
    currentPhase,
  });
  const authoritativePipelinePhase = workflowSession.summary?.session.pipeline_stage ?? null;
  const effectiveCurrentPhase = authoritativePipelinePhase || currentPhase;

  useEffect(() => {
    if (!liveWorkflowReplan) return;
    if (liveWorkflowReplan.state !== 'completed') return;
    void workflowSession.refreshSummary();
  }, [liveWorkflowReplan, workflowSession.refreshSummary]);

  const mergedSnapshots: SnapshotMap = useMemo(
    () => ({
      ...localSnapshots,
      ...workflowSession.nodeSnapshots,
    }),
    [localSnapshots, workflowSession.nodeSnapshots],
  );

  const nodeStatuses = useMemo(
    () => {
      const local = computeNodeStatuses(
        activeNode,
        mergedSnapshots,
        isProcessing,
        Boolean(isPipelineGateActive),
        sessionComplete,
      );
      return WORKFLOW_NODES.reduce((acc, node) => {
        acc[node.key] = workflowSession.nodeStatuses[node.key] ?? local[node.key];
        return acc;
      }, {} as Record<WorkflowNodeKey, WorkflowNodeStatus>);
    },
    [
      activeNode,
      mergedSnapshots,
      isProcessing,
      isPipelineGateActive,
      sessionComplete,
      workflowSession.nodeStatuses,
    ],
  );

  const navItems = useMemo(
    () => {
      const effectiveLiveReplan = liveWorkflowReplan ?? workflowSession.summary?.replan_status ?? null;
      const effectiveDraftReadiness = liveDraftReadiness ?? workflowSession.summary?.draft_readiness ?? null;
      const replanNodeDetails = buildReplanNodeDetailMap(workflowSession.summary?.replan, effectiveLiveReplan);
      return WORKFLOW_NODES.map((node) => {
        const summaryNode = workflowSession.summary?.nodes.find((n) => n.node_key === node.key);
        const hasSnapshot = Boolean(mergedSnapshots[node.key])
          || Boolean(workflowSession.summary?.latest_artifacts.some((artifact) => artifact.node_key === node.key));
        const sectionBundleDetail = node.key === 'sections'
          ? (
              getSectionsBundleNavDetail(mergedSnapshots.sections)
              ?? getSectionsBundleNavDetailFromSummary(workflowSession.summary?.sections_bundle_review)
              ?? undefined
            )
          : undefined;
        const questionsDetail = node.key === 'questions'
          ? (() => {
              const metrics = workflowSession.summary?.question_response_metrics ?? null;
              const reuseMetrics = workflowSession.summary?.question_reuse_metrics ?? null;
              const highImpactTotal = metrics?.by_impact.high.total ?? 0;
              const highImpactAnswered = metrics?.by_impact.high.answered ?? 0;
              const highImpactRemaining = effectiveDraftReadiness?.high_impact_remaining?.filter((item) => item.priority === 'must_have').length
                ?? effectiveDraftReadiness?.high_impact_remaining?.length
                ?? 0;
              if (highImpactTotal > 0) {
                if (highImpactRemaining > 0) {
                  return `High impact ${highImpactAnswered}/${highImpactTotal} • ${highImpactRemaining} remaining`;
                }
                return `High impact ${highImpactAnswered}/${highImpactTotal}`;
              }
              if (highImpactRemaining > 0) {
                return `${highImpactRemaining} high-impact remaining`;
              }
              if ((metrics?.total ?? 0) > 0) {
                if ((reuseMetrics?.total_skipped ?? 0) > 0) {
                  return `Answered ${metrics?.answered ?? 0} • Reused ${reuseMetrics?.total_skipped}`;
                }
                return `Answered ${metrics?.answered ?? 0} • Deferred ${metrics?.deferred ?? 0}`;
              }
              if ((reuseMetrics?.total_skipped ?? 0) > 0) {
                return `Reused ${reuseMetrics?.total_skipped} repeats`;
              }
              return undefined;
            })()
          : undefined;
        const replanDetail = replanNodeDetails[node.key];
        return {
          ...node,
          status: nodeStatuses[node.key],
          hasSnapshot,
          detailLabel:
            (summaryNode?.blocking_state === 'rebuild_required' ? 'Rebuild required' : undefined)
            ?? replanDetail
            ?? questionsDetail
            ?? sectionBundleDetail,
        };
      });
    },
    [nodeStatuses, mergedSnapshots, workflowSession.summary, liveWorkflowReplan, liveDraftReadiness],
  );

  const liveSnapshot: WorkspaceNodeSnapshot = {
    nodeKey: activeNode,
    panelType,
    panelData,
    resume,
    capturedAt: new Date().toISOString(),
    currentPhase: effectiveCurrentPhase,
    isGateActive: Boolean(isPipelineGateActive),
  };

  const selectedSnapshot = selectedNode === activeNode
    ? liveSnapshot
    : (mergedSnapshots[selectedNode] ?? null);

  const isViewingLiveNode = selectedNode === activeNode;
  const displayPanelType = selectedSnapshot?.panelType ?? null;
  const displayPanelData = selectedSnapshot?.panelData ?? null;
  const displayResume = selectedSnapshot?.resume ?? resume;
  const displayPhase = isViewingLiveNode
    ? effectiveCurrentPhase
    : (selectedSnapshot?.currentPhase ?? effectiveCurrentPhase);
  const displayProcessStepKey = processStepFromWorkflowNode(selectedNode, { currentPhase: displayPhase });
  const displayProcessStep = PROCESS_STEP_CONTRACTS[displayProcessStepKey] ?? PROCESS_STEP_CONTRACTS[processStepFromPhase(displayPhase)];

  const errorBanner = error && !errorDismissed && (
    <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-red-300/28 bg-red-500/[0.08] px-4 py-2.5 backdrop-blur-xl">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300/80" aria-hidden="true" />
      <p className="flex-1 text-sm text-red-100/90">{error}</p>
      <button
        type="button"
        onClick={() => setErrorDismissed(true)}
        aria-label="Dismiss error"
        className="shrink-0 rounded p-0.5 text-red-300/60 transition-colors hover:bg-white/[0.06] hover:text-red-300/90"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );

  const workflowErrorBanner = workflowSession.error && (
    <div className="mx-3 mt-3 rounded-lg border border-amber-300/18 bg-amber-300/[0.06] px-4 py-2 text-xs text-amber-100/90">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">Having trouble loading the latest workflow state.</span>
        <GlassButton
          variant="ghost"
          className="h-7 px-2.5 text-[11px]"
          loading={workflowSession.loadingSummary || workflowSession.loadingNode}
          onClick={async () => {
            await workflowSession.refreshSummary();
            await workflowSession.refreshNode(selectedNode);
          }}
        >
          Refresh State
        </GlassButton>
      </div>
    </div>
  );

  const runtimeRecoveryBanner = (Boolean(stalledSuspected) || (!connected && Boolean(isProcessing))) && (
    <div className="mx-3 mt-3 rounded-lg border border-rose-300/14 bg-rose-400/[0.04] px-4 py-2 text-xs text-rose-100/90">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">
          {stalledSuspected
            ? 'Processing may be stalled. Use the controls below to reconnect and refresh state before restarting.'
            : 'The live connection is disconnected while processing is still expected.'}
        </span>
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
          loading={workflowSession.loadingSummary || workflowSession.loadingNode}
          onClick={async () => {
            await workflowSession.refreshSummary();
            await workflowSession.refreshNode(selectedNode);
            await workflowSession.refreshNode(activeNode);
          }}
        >
          Refresh State
        </GlassButton>
      </div>
    </div>
  );

  const workflowActionBanner = (workflowSession.actionMessage || workflowSession.actionError) && (
    <div
      className={`mx-3 mt-3 rounded-lg border px-4 py-2 text-xs ${
        workflowSession.actionError
          ? 'border-red-300/20 bg-red-400/[0.06] text-red-100/90'
          : 'border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100/90'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1">{workflowSession.actionError ?? workflowSession.actionMessage}</span>
        {workflowSession.actionRequiresRestart && sessionId && (
          <GlassButton
            variant="ghost"
            disabled={isRestartingPipeline || workflowSession.isRestartPipelinePending || isProcessing}
            onClick={async () => {
              setIsRestartingPipeline(true);
              try {
                const usedWorkflowAction = await workflowSession.restartPipeline();
                if (!usedWorkflowAction.success && onRestartPipelineFromLastInputs) {
                  await onRestartPipelineFromLastInputs(sessionId);
                }
              } finally {
                setIsRestartingPipeline(false);
              }
            }}
            className="h-7 px-2.5 text-[11px]"
          >
            {(isRestartingPipeline || workflowSession.isRestartPipelinePending) ? 'Restarting…' : 'Restart & Rebuild'}
          </GlassButton>
        )}
        <button
          type="button"
          onClick={workflowSession.clearActionMessage}
          className="rounded p-0.5 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85"
          aria-label="Dismiss workflow message"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  const workflowReplanBanner = (() => {
    const summaryReplan = workflowSession.summary?.replan ?? null;
    const summaryReplanStatus = workflowSession.summary?.replan_status ?? null;
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
  })();

  const profileChoice = positioningProfileFound && onPipelineRespond && !profileChoiceMade && (
    <div className="px-3 pt-3">
      <PositioningProfileChoice
        updatedAt={positioningProfileFound.updated_at}
        onChoice={(choice) => {
          onPipelineRespond('positioning_profile_choice', choice);
          setProfileChoiceMade(true);
        }}
      />
    </div>
  );

  const draftReadiness = liveDraftReadiness ?? workflowSession.summary?.draft_readiness ?? null;
  const draftPathDecision = workflowSession.summary?.draft_path_decision ?? null;
  const workflowPreferences = workflowSession.summary?.workflow_preferences ?? null;
  const activeWorkflowMode =
    workflowPreferences?.workflow_mode
    ?? draftReadiness?.workflow_mode
    ?? 'balanced';
  const activeMinimumEvidenceTarget =
    (typeof workflowPreferences?.minimum_evidence_target === 'number'
      ? workflowPreferences.minimum_evidence_target
      : (typeof draftReadiness?.minimum_evidence_target === 'number'
          ? draftReadiness.minimum_evidence_target
          : defaultEvidenceTargetForMode(activeWorkflowMode)));

  useEffect(() => {
    setEvidenceTargetDraft(activeMinimumEvidenceTarget);
  }, [activeMinimumEvidenceTarget, sessionId]);

  const workflowPreferencesCard = (
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
                disabled={workflowSession.isUpdatingWorkflowPreferences}
                onClick={async () => {
                  if (activeWorkflowMode === modeKey) return;
                  await workflowSession.updateWorkflowPreferences({ workflow_mode: modeKey });
                }}
              >
                {label}
              </GlassButton>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/60 whitespace-nowrap">Min evidence</span>
            <GlassInput
              type="number"
              min={3}
              max={20}
              value={evidenceTargetDraft}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value || '', 10);
                if (Number.isFinite(next)) {
                  setEvidenceTargetDraft(Math.min(20, Math.max(3, next)));
                } else {
                  setEvidenceTargetDraft(3);
                }
              }}
              className="h-8 w-20 rounded-lg px-2.5 py-1 text-xs"
            />
            <GlassButton
              variant="ghost"
              className="h-8 px-3 text-[11px]"
              loading={workflowSession.isUpdatingWorkflowPreferences}
              disabled={workflowSession.isUpdatingWorkflowPreferences || evidenceTargetDraft === activeMinimumEvidenceTarget}
              onClick={async () => {
                await workflowSession.updateWorkflowPreferences({
                  minimum_evidence_target: evidenceTargetDraft,
                });
              }}
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
              disabled={workflowSession.isUpdatingWorkflowPreferences}
              onClick={async () => {
                setEvidenceTargetDraft(target);
                if (activeMinimumEvidenceTarget !== target) {
                  await workflowSession.updateWorkflowPreferences({ minimum_evidence_target: target });
                }
              }}
            >
              {target}
            </GlassButton>
          ))}
          {workflowPreferences?.source && (
            <span className="ml-1 text-[10px] text-white/40">
              Source: {workflowPreferences.source === 'workflow_preferences' ? 'updated in workspace' : workflowPreferences.source.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </GlassCard>
    </div>
  );

  const mainPanel = (
    <div className="flex h-full min-h-0 flex-col">
      {errorBanner}
      {workflowErrorBanner}
      {runtimeRecoveryBanner}
      {workflowActionBanner}
      {workflowReplanBanner}
      {profileChoice}
      <div className="min-h-0 flex-1 p-3 md:p-4">
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Your Resume Progress
            </span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/75">
              Step {displayProcessStep.number} of 7
            </span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/70">
              {PHASE_LABELS[displayPhase] ?? displayPhase}
            </span>
            {!isViewingLiveNode && (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2 py-0.5 text-[10px] text-white/58">
                Previous version
              </span>
            )}
          </div>
          <div className="mb-2 px-1">
            <GlassCard className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-white/86">{displayProcessStep.title}</span>
                <span className="text-[10px] text-white/45">•</span>
                <span className="text-[11px] text-white/58">
                  {displayProcessStep.summary}
                </span>
              </div>
            </GlassCard>
          </div>

          {draftReadiness && (
            <div className="mb-2 px-1">
              <GlassCard className={`px-3 py-2.5 ${draftReadiness.ready ? 'border-emerald-300/25 bg-emerald-400/[0.05]' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    draftReadiness.ready
                      ? 'border-emerald-300/30 bg-emerald-400/[0.10] text-emerald-100/90'
                      : 'border-white/[0.1] bg-white/[0.03] text-white/70'
                  }`}>
                    {draftReadiness.ready ? 'Ready To Draft' : 'Building Evidence'}
                  </span>
                  <span className="text-[11px] text-white/70">
                    Evidence {draftReadiness.evidence_count}/{draftReadiness.minimum_evidence_target}
                  </span>
                  <span className="text-[11px] text-white/60">•</span>
                  <span className="text-[11px] text-white/70">
                    Coverage {Math.round(draftReadiness.coverage_score)}% / {Math.round(draftReadiness.coverage_threshold)}%
                  </span>
                  <span className="text-[11px] text-white/60">•</span>
                  <span className="text-[11px] text-white/65">
                    {draftReadiness.workflow_mode.replace('_', ' ')}
                  </span>
                </div>
                {draftReadiness.note && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">
                    {draftReadiness.note}
                  </p>
                )}
                {draftPathDecision && (displayPhase === 'gap_analysis' || displayPhase === 'architect' || displayPhase === 'architect_review' || displayPhase === 'section_writing' || displayPhase === 'section_review' || displayPhase === 'quality_review' || displayPhase === 'revision' || displayPhase === 'complete') && (
                  <div className={`mt-2 rounded-lg border px-2.5 py-2 ${
                    draftPathDecision.proceeding_reason === 'momentum_mode'
                      ? 'border-amber-300/18 bg-amber-400/[0.04]'
                      : 'border-emerald-300/18 bg-emerald-400/[0.04]'
                  }`}>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={`rounded-full border px-1.5 py-0.5 ${
                        draftPathDecision.proceeding_reason === 'momentum_mode'
                          ? 'border-amber-300/20 bg-amber-400/[0.08] text-amber-100/85'
                          : 'border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100/85'
                      }`}>
                        {draftPathDecision.proceeding_reason === 'momentum_mode'
                          ? 'Proceeding with open items'
                          : 'Proceeding: readiness met'}
                      </span>
                      <span className="text-white/50">
                        {draftPathDecision.workflow_mode.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/72">
                      {draftPathDecision.message}
                    </p>
                    {(draftPathDecision.top_remaining || (draftPathDecision.blocking_reasons?.length ?? 0) > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {draftPathDecision.blocking_reasons?.includes('evidence_target')
                          && typeof draftPathDecision.remaining_evidence_needed === 'number'
                          && draftPathDecision.remaining_evidence_needed > 0 && (
                            <span className="rounded-full border border-amber-300/20 bg-amber-400/[0.06] px-2 py-0.5 text-[10px] text-amber-100/85">
                              {draftPathDecision.remaining_evidence_needed} evidence item{draftPathDecision.remaining_evidence_needed === 1 ? '' : 's'} still open
                            </span>
                          )}
                        {draftPathDecision.blocking_reasons?.includes('coverage_threshold')
                          && typeof draftPathDecision.remaining_coverage_needed === 'number'
                          && draftPathDecision.remaining_coverage_needed > 0 && (
                            <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.06] px-2 py-0.5 text-[10px] text-sky-100/85">
                              +{draftPathDecision.remaining_coverage_needed}% coverage still open
                            </span>
                          )}
                        {draftPathDecision.top_remaining && (
                          <GlassButton
                            type="button"
                            variant="ghost"
                            className="h-6 px-2.5 text-[10px]"
                            onClick={() => goToNode('questions')}
                          >
                            Review: {draftPathDecision.top_remaining.requirement.length > 42
                              ? `${draftPathDecision.top_remaining.requirement.slice(0, 42)}...`
                              : draftPathDecision.top_remaining.requirement}
                          </GlassButton>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(
                  typeof draftReadiness.remaining_evidence_needed === 'number'
                  || typeof draftReadiness.remaining_coverage_needed === 'number'
                  || typeof draftReadiness.suggested_question_count === 'number'
                ) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {typeof draftReadiness.remaining_evidence_needed === 'number' && draftReadiness.remaining_evidence_needed > 0 && (
                      <span className="rounded-full border border-amber-300/20 bg-amber-400/[0.06] px-2 py-0.5 text-[10px] text-amber-100/85">
                        Need {draftReadiness.remaining_evidence_needed} more evidence item{draftReadiness.remaining_evidence_needed === 1 ? '' : 's'}
                      </span>
                    )}
                    {typeof draftReadiness.remaining_coverage_needed === 'number' && draftReadiness.remaining_coverage_needed > 0 && (
                      <span className="rounded-full border border-sky-300/20 bg-sky-400/[0.06] px-2 py-0.5 text-[10px] text-sky-100/85">
                        Need +{draftReadiness.remaining_coverage_needed}% coverage
                      </span>
                    )}
                    {typeof draftReadiness.suggested_question_count === 'number' && draftReadiness.suggested_question_count > 0 && (
                      <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/70">
                        ~{draftReadiness.suggested_question_count} targeted question{draftReadiness.suggested_question_count === 1 ? '' : 's'} likely
                      </span>
                    )}
                    {!draftReadiness.ready && Array.isArray(draftReadiness.high_impact_remaining) && draftReadiness.high_impact_remaining.length > 0 && (
                      <GlassButton
                        type="button"
                        variant="ghost"
                        className="h-6 px-2.5 text-[10px]"
                        onClick={() => goToNode('questions')}
                      >
                        Open Questions
                      </GlassButton>
                    )}
                  </div>
                )}
                {draftReadiness.gap_breakdown && draftReadiness.gap_breakdown.total > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-white/55">
                    <span>Requirements</span>
                    <span className="rounded-full border border-emerald-300/18 bg-emerald-400/[0.05] px-2 py-0.5 text-emerald-100/80">
                      Strong {draftReadiness.gap_breakdown.strong}
                    </span>
                    <span className="rounded-full border border-amber-300/18 bg-amber-400/[0.05] px-2 py-0.5 text-amber-100/80">
                      Partial {draftReadiness.gap_breakdown.partial}
                    </span>
                    <span className="rounded-full border border-rose-300/18 bg-rose-400/[0.05] px-2 py-0.5 text-rose-100/80">
                      Gaps {draftReadiness.gap_breakdown.gap}
                    </span>
                  </div>
                )}
                {draftReadiness.evidence_quality && draftReadiness.evidence_count > 0 && (
                  <div className="mt-2 grid gap-1 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-white/35">Validated</div>
                      <div className="mt-0.5 text-[11px] text-white/78">
                        {draftReadiness.evidence_quality.user_validated_count}/{draftReadiness.evidence_count}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-white/35">Metrics</div>
                      <div className="mt-0.5 text-[11px] text-white/78">
                        {draftReadiness.evidence_quality.metrics_defensible_count}/{draftReadiness.evidence_count}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-white/35">Mapped To JD</div>
                      <div className="mt-0.5 text-[11px] text-white/78">
                        {draftReadiness.evidence_quality.mapped_requirement_evidence_count}/{draftReadiness.evidence_count}
                      </div>
                    </div>
                  </div>
                )}
                {Array.isArray(draftReadiness.high_impact_remaining) && draftReadiness.high_impact_remaining.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] uppercase tracking-[0.08em] text-white/40">
                      Highest-Impact Remaining Coverage
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {draftReadiness.high_impact_remaining.slice(0, 4).map((item, index) => (
                        <div
                          key={`${item.requirement}-${index}`}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[10px] leading-relaxed text-white/75 transition-colors hover:border-white/[0.12] hover:bg-white/[0.03] cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onClick={() => goToNode('questions')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              goToNode('questions');
                            }
                          }}
                        >
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className={`rounded-full border px-1.5 py-0.5 ${
                              item.priority === 'must_have'
                                ? 'border-rose-300/25 bg-rose-400/[0.08] text-rose-100/85'
                                : item.priority === 'implicit'
                                  ? 'border-amber-300/25 bg-amber-400/[0.08] text-amber-100/85'
                                  : 'border-white/[0.1] bg-white/[0.03] text-white/60'
                            }`}>
                              {formatReadinessPriorityLabel(item.priority)}
                            </span>
                            <span className={`${
                              item.classification === 'gap' ? 'text-rose-100/80' : 'text-amber-100/80'
                            }`}>
                              {item.classification === 'gap' ? 'Gap' : 'Partial'}
                            </span>
                            {item.evidence_count > 0 && (
                              <span className="text-white/45">evidence {item.evidence_count}</span>
                            )}
                          </div>
                          <div className="mt-1 max-w-[24rem] truncate" title={item.requirement}>
                            {item.requirement}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          )}

          {workflowPreferencesCard}

          {selectedNode === 'benchmark' && (
            <BenchmarkInspectorCard
              panelData={displayPanelData}
              benchmarkEditSummary={workflowSession.summary?.benchmark_edit ?? null}
              replanSummary={workflowSession.summary?.replan ?? null}
              replanStatus={workflowSession.summary?.replan_status
                ? {
                    state: workflowSession.summary.replan_status.state,
                    benchmark_edit_version: workflowSession.summary.replan_status.benchmark_edit_version,
                  }
                : null}
              onSaveAssumptions={workflowSession.saveBenchmarkAssumptions}
              isSaving={workflowSession.isSavingBenchmarkAssumptions}
            />
          )}

          <GlassCard className="min-h-0 flex-1 overflow-y-auto">
            {displayPanelData ? (
              <SafePanelContent
                panelType={displayPanelType}
                panelData={displayPanelData}
                resume={displayResume}
                isProcessing={isViewingLiveNode ? isProcessing : false}
                onSendMessage={isViewingLiveNode ? onSendMessage : undefined}
                onPipelineRespond={isViewingLiveNode ? onPipelineRespond : undefined}
                onSaveCurrentResumeAsBase={isViewingLiveNode ? onSaveCurrentResumeAsBase : undefined}
                onDismissSuggestion={isViewingLiveNode ? onDismissSuggestion : undefined}
              />
            ) : displayResume ? (
              <ResumePanel resume={displayResume} />
            ) : selectedNode === 'questions' ? (
              renderQuestionsNodeSummaryPlaceholder(
                isViewingLiveNode,
                draftReadiness,
                workflowSession.summary?.question_response_metrics ?? null,
                workflowSession.summary?.question_response_history ?? null,
                workflowSession.summary?.question_reuse_summaries ?? null,
                workflowSession.summary?.question_reuse_metrics ?? null,
                () => {
                  void workflowSession.refreshSummary();
                  void workflowSession.refreshNode('questions');
                },
              )
            ) : selectedNode === 'sections' ? (
              renderSectionsNodeSummaryPlaceholder(
                isViewingLiveNode,
                workflowSession.summary?.sections_bundle_review ?? null,
              )
            ) : (
              renderNodeContentPlaceholder(selectedNode, isViewingLiveNode)
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );

  const refreshWorkflowState = async () => {
    await workflowSession.refreshSummary();
    const nodesToRefresh = new Set<WorkflowNodeKey>([selectedNode, activeNode]);
    await Promise.all(Array.from(nodesToRefresh).map((node) => workflowSession.refreshNode(node)));
  };

  const sidePanel = (
    <div className="flex h-full min-h-0 flex-col">
      <ChatPanel
        messages={messages}
        streamingText={streamingText}
        tools={tools}
        askPrompt={askPrompt}
        phaseGate={phaseGate}
        currentPhase={effectiveCurrentPhase}
        isProcessing={isProcessing}
        connected={connected}
        lastBackendActivityAt={lastBackendActivityAt}
        stalledSuspected={stalledSuspected}
        onReconnectStream={onReconnectStream}
        onRefreshWorkflowState={refreshWorkflowState}
        isRefreshingWorkflowState={workflowSession.loadingSummary || workflowSession.loadingNode}
        onSendMessage={onSendMessage}
        isPipelineGateActive={isPipelineGateActive}
        panelType={panelType}
        panelData={panelData}
        resume={resume}
        onPipelineRespond={onPipelineRespond}
        onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
        approvedSections={approvedSections}
        hideWorkProduct
      />
    </div>
  );

  const footerRail = (
    <>
      <div className="hidden lg:block">
        <WorkflowStatsRail
          currentPhase={effectiveCurrentPhase}
          isProcessing={isProcessing}
          isGateActive={Boolean(isPipelineGateActive)}
          stalledSuspected={Boolean(stalledSuspected)}
          sessionComplete={sessionComplete}
          error={error}
          panelData={panelData}
          resume={resume}
          compact={false}
        />
      </div>
      <div className="lg:hidden">
        <WorkflowStatsRail
          currentPhase={effectiveCurrentPhase}
          isProcessing={isProcessing}
          isGateActive={Boolean(isPipelineGateActive)}
          stalledSuspected={Boolean(stalledSuspected)}
          sessionComplete={sessionComplete}
          error={error}
          panelData={panelData}
          resume={resume}
          compact
        />
      </div>
    </>
  );

  return (
    <WorkspaceShell
      title="Resume Workspace"
      subtitle={isViewingLiveNode ? nodeTitle(selectedNode) : `${nodeTitle(selectedNode)} — Previous version`}
      nodes={navItems}
      selectedNode={selectedNode}
      activeNode={activeNode}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onBack={goBack}
      onForward={goForward}
      onSelectNode={goToNode}
      activeGate={{
        active: Boolean(isPipelineGateActive),
        activeNode,
        label: formatPendingGateLabelForWorkspace(workflowSession.summary?.session.pending_gate ?? null),
        onReturn: returnToActiveNode,
        onGenerateDraftNow: workflowSession.summary?.replan?.requires_restart
          ? undefined
          : workflowSession.generateDraftNow,
        isGenerateDraftNowPending: workflowSession.isGenerateDraftNowPending,
      }}
      main={mainPanel}
      side={sidePanel}
      footerRail={footerRail}
    />
  );
}
