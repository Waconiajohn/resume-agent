import React from 'react';
import { History } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { WORKFLOW_NODES } from '@/types/workflow';
import type { WorkflowNodeKey, WorkflowNodeStatus, WorkspaceNodeSnapshot } from '@/types/workflow';
import type { WorkflowReplanUpdate } from '@/types/session';
import type { PanelData } from '@/types/panels';

export type SnapshotMap = Partial<Record<WorkflowNodeKey, WorkspaceNodeSnapshot>>;

export const MAX_SNAPSHOT_SESSIONS = 20;
export const SNAPSHOT_KEY_PREFIX = 'resume-agent:workspace-snapshots:';

export function snapshotsStorageKey(sessionId: string): string {
  return `resume-agent:workspace-snapshots:${sessionId}`;
}

export function loadSnapshotMap(sessionId: string): SnapshotMap {
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

export function pruneSnapshotStorage(): void {
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
      keys.slice(0, keys.length - MAX_SNAPSHOT_SESSIONS).forEach((k) => {
        window.localStorage.removeItem(k);
      });
    }
  } catch {
    // Best effort
  }
}

export function persistSnapshotMap(sessionId: string, map: SnapshotMap): void {
  if (typeof window === 'undefined') return;
  try {
    pruneSnapshotStorage();
    window.localStorage.setItem(snapshotsStorageKey(sessionId), JSON.stringify(map));
  } catch {
    // Best effort
  }
}

export function nodeTitle(nodeKey: WorkflowNodeKey): string {
  return WORKFLOW_NODES.find((node) => node.key === nodeKey)?.label ?? 'Workspace';
}

export function formatPendingGateLabelForWorkspace(gate: string | null | undefined): string | undefined {
  if (!gate) return undefined;
  if (gate === 'positioning_profile_choice') return 'Choose how to use the saved positioning profile';
  if (gate === 'architect_review') return 'Review and approve the resume blueprint';
  if (gate.startsWith('positioning_q_')) return 'Answer the current Why Me question';
  if (gate.startsWith('questionnaire_')) return 'Complete the current questionnaire';
  if (gate.startsWith('section_review_')) return 'Review the current section draft';
  return gate.replace(/_/g, ' ');
}

export function defaultEvidenceTargetForMode(mode: 'fast_draft' | 'balanced' | 'deep_dive'): number {
  if (mode === 'fast_draft') return 5;
  if (mode === 'deep_dive') return 12;
  return 8;
}

export function formatReadinessPriorityLabel(priority: 'must_have' | 'implicit' | 'nice_to_have'): string {
  if (priority === 'must_have') return 'Must-have';
  if (priority === 'implicit') return 'Implicit';
  return 'Nice-to-have';
}

export function formatRelativeShort(timestamp: string | null | undefined, now = Date.now()): string | null {
  if (!timestamp) return null;
  const ms = now - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function formatDurationShort(startAt: string | null | undefined, now = Date.now()): string | null {
  if (!startAt) return null;
  const ms = now - new Date(startAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

export function formatMsDurationShort(msValue: number | null | undefined): string | null {
  if (typeof msValue !== 'number' || !Number.isFinite(msValue) || msValue < 0) return null;
  const totalSeconds = Math.floor(msValue / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function getSectionsBundleNavDetail(snapshot: WorkspaceNodeSnapshot | undefined): string | null {
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

export function getSectionsBundleNavDetailFromSummary(
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

export function buildReplanNodeDetailMap(
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

export function computeNodeStatuses(
  activeNode: WorkflowNodeKey,
  snapshots: SnapshotMap,
  isProcessing: boolean,
  isGateActive: boolean,
  sessionComplete?: boolean,
): Record<WorkflowNodeKey, WorkflowNodeStatus> {
  const activeIndex = WORKFLOW_NODES.findIndex((n) => n.key === activeNode);
  const result = {} as Record<WorkflowNodeKey, WorkflowNodeStatus>;

  for (const node of WORKFLOW_NODES) {
    const index = WORKFLOW_NODES.findIndex((n) => n.key === node.key);
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

export function renderNodeContentPlaceholder(nodeKey: WorkflowNodeKey, isActiveNode: boolean): React.ReactElement {
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

// Re-export PanelData type dependency used by getSectionsBundleNavDetail
export type { PanelData };
