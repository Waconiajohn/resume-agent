import { ArrowLeft, ArrowRight, Lock, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import type { WorkflowNodeKey, WorkflowNodeStatus } from '@/types/workflow';

export interface WorkspaceNodeNavItem {
  key: WorkflowNodeKey;
  label: string;
  shortLabel: string;
  description: string;
  status: WorkflowNodeStatus;
  hasSnapshot?: boolean;
}

interface WorkspaceShellProps {
  title: string;
  subtitle?: string;
  nodes: WorkspaceNodeNavItem[];
  selectedNode: WorkflowNodeKey;
  activeNode: WorkflowNodeKey;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onSelectNode: (node: WorkflowNodeKey) => void;
  main: React.ReactNode;
  side: React.ReactNode;
  footerRail?: React.ReactNode;
  activeGate?: {
    active: boolean;
    activeNode: WorkflowNodeKey;
    onReturn: () => void;
    onGenerateDraftNow?: () => void;
    isGenerateDraftNowPending?: boolean;
  };
}

function statusStyles(status: WorkflowNodeStatus) {
  switch (status) {
    case 'complete':
      return {
        dot: 'bg-emerald-300 animate-node-complete-pop',
        pill: 'text-emerald-100/90 border-emerald-300/25 bg-emerald-400/[0.08]',
        label: 'Complete',
      };
    case 'blocked':
      return {
        dot: 'bg-amber-300 animate-node-pulse',
        pill: 'text-amber-100/90 border-amber-300/20 bg-amber-300/[0.08]',
        label: 'Needs Input',
      };
    case 'in_progress':
      return {
        dot: 'bg-[#afc4ff] animate-node-pulse',
        pill: 'text-[#d5e1ff] border-[#afc4ff]/25 bg-[#afc4ff]/[0.09]',
        label: 'Active',
      };
    case 'stale':
      return {
        dot: 'bg-orange-300',
        pill: 'text-orange-100/90 border-orange-300/20 bg-orange-300/[0.08]',
        label: 'Stale',
      };
    case 'ready':
      return {
        dot: 'bg-white/45',
        pill: 'text-white/72 border-white/[0.12] bg-white/[0.04]',
        label: 'Ready',
      };
    case 'locked':
    default:
      return {
        dot: 'bg-white/20',
        pill: 'text-white/45 border-white/[0.08] bg-white/[0.02]',
        label: 'Locked',
      };
  }
}

export function WorkspaceShell({
  title,
  subtitle,
  nodes,
  selectedNode,
  activeNode,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onSelectNode,
  main,
  side,
  footerRail,
  activeGate,
}: WorkspaceShellProps) {
  const selected = nodes.find((node) => node.key === selectedNode);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
      <div className="border-b border-white/[0.08] bg-white/[0.02] px-3 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <GlassButton
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={!canGoBack}
            className="h-auto px-2 py-1 text-xs"
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </GlassButton>
          <GlassButton
            type="button"
            variant="ghost"
            onClick={onForward}
            disabled={!canGoForward}
            className="h-auto px-2 py-1 text-xs"
            aria-label="Forward"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </GlassButton>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white/88">{title}</div>
            {subtitle && <div className="truncate text-[11px] text-white/52">{subtitle}</div>}
          </div>
          {selected && (
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">Viewing</span>
              <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-xs text-white/80">
                {selected.label}
              </span>
            </div>
          )}
        </div>

        {activeGate?.active && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-300/18 bg-amber-300/[0.06] px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-200/90" />
            <p className="min-w-0 flex-1 truncate text-xs text-amber-100/85">
              {selectedNode === activeGate.activeNode
                ? 'A question is waiting in this step. You can answer it, or request a faster path to draft.'
                : 'A question is waiting in another step. You can browse here and return when ready.'}
            </p>
            {selectedNode !== activeGate.activeNode && (
              <GlassButton
                type="button"
                variant="ghost"
                onClick={activeGate.onReturn}
                className="h-auto px-2 py-1 text-[11px]"
              >
                Return To Active Step
              </GlassButton>
            )}
            {activeGate.onGenerateDraftNow && (
              <GlassButton
                type="button"
                variant="ghost"
                onClick={activeGate.onGenerateDraftNow}
                disabled={activeGate.isGenerateDraftNowPending}
                className="h-auto px-2 py-1 text-[11px]"
              >
                {activeGate.isGenerateDraftNowPending ? 'Requesting...' : 'Generate Draft Now'}
              </GlassButton>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[270px] shrink-0 border-r border-white/[0.08] bg-white/[0.015] lg:block">
          <div className="flex h-full flex-col gap-3 p-3">
            <GlassCard className="p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/48">
                Workflow
              </div>
              <div className="space-y-2">
                {nodes.map((node) => {
                  const selectedNodeItem = node.key === selectedNode;
                  const styles = statusStyles(node.status);
                  const isLocked = node.status === 'locked';
                  return (
                    <button
                      key={node.key}
                      type="button"
                      disabled={isLocked}
                      onClick={() => onSelectNode(node.key)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-2 text-left transition-all',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/70',
                        isLocked
                          ? 'cursor-not-allowed border-white/[0.06] bg-white/[0.015] opacity-65'
                          : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.045]',
                        selectedNodeItem && 'border-[#afc4ff]/30 bg-[#afc4ff]/[0.08] shadow-[0_0_0_1px_rgba(175,196,255,0.08)_inset]',
                        node.key === activeNode && !selectedNodeItem && 'border-[#afc4ff]/14',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-white/88">{node.label}</span>
                            {node.status === 'locked' && <Lock className="h-3 w-3 text-white/35" />}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-white/48">{node.description}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px]', styles.pill)}>
                              {styles.label}
                            </span>
                            {node.hasSnapshot && (
                              <span className="text-[10px] text-white/48">Saved view</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </GlassCard>
            {footerRail && <div className="min-h-0 flex-1 overflow-y-auto">{footerRail}</div>}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-white/[0.06] px-3 py-2 lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {nodes.map((node) => {
                const styles = statusStyles(node.status);
                const isLocked = node.status === 'locked';
                return (
                  <button
                    key={node.key}
                    type="button"
                    disabled={isLocked}
                    onClick={() => onSelectNode(node.key)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors',
                      selectedNode === node.key
                        ? 'border-[#afc4ff]/30 bg-[#afc4ff]/[0.08] text-white/90'
                        : 'border-white/[0.1] bg-white/[0.03] text-white/65',
                      isLocked && 'opacity-60',
                    )}
                    aria-label={`${node.label} (${styles.label})`}
                  >
                    {node.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
            <main className="min-h-[300px] min-w-0 flex-1 border-b border-white/[0.06] xl:border-b-0 xl:border-r xl:border-white/[0.06]">
              {main}
            </main>
            <aside className="flex min-h-[320px] w-full min-w-0 flex-col xl:w-[430px] xl:shrink-0">
              <div className="min-h-0 flex-1">{side}</div>
              <div className="border-t border-white/[0.06] xl:hidden">
                {footerRail}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
