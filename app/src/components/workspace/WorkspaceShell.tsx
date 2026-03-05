import { useState, useCallback, useRef, useEffect } from 'react';
import { Lock, Sparkles, FileText, Target, Search, MessageCircle, Map, Layers, ShieldCheck, Download } from 'lucide-react';
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
  detailLabel?: string;
}

interface WorkspaceShellProps {
  nodes: WorkspaceNodeNavItem[];
  selectedNode: WorkflowNodeKey;
  activeNode: WorkflowNodeKey;
  onSelectNode: (node: WorkflowNodeKey) => void;
  main: React.ReactNode;
  activeGate?: {
    active: boolean;
    activeNode: WorkflowNodeKey;
    label?: string;
    onReturn: () => void;
    onGenerateDraftNow?: () => void;
    isGenerateDraftNowPending?: boolean;
  };
}

const NODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  overview: FileText,
  benchmark: Target,
  gaps: Search,
  questions: MessageCircle,
  blueprint: Map,
  sections: Layers,
  quality: ShieldCheck,
  export: Download,
};

function statusStyles(status: WorkflowNodeStatus) {
  switch (status) {
    case 'complete':
      return {
        dot: 'h-1.5 w-1.5 rounded-full bg-emerald-300 animate-node-complete-pop',
        pill: 'text-emerald-100/90 border-emerald-300/25 bg-emerald-400/[0.08]',
        label: '\u2713',
      };
    case 'blocked':
      return {
        dot: 'h-1.5 w-1.5 rounded-[2px] bg-amber-300 animate-node-pulse',
        pill: 'text-amber-100/90 border-amber-300/20 bg-amber-300/[0.08]',
        label: 'Your turn',
      };
    case 'in_progress':
      return {
        dot: 'h-1.5 w-1.5 rounded-full border-[1.5px] border-[#afc4ff] animate-node-pulse',
        pill: 'text-[#d5e1ff] border-[#afc4ff]/25 bg-[#afc4ff]/[0.09]',
        label: 'Active',
      };
    case 'stale':
      return {
        dot: 'h-1.5 w-1.5 rotate-45 rounded-[1px] bg-orange-300',
        pill: 'text-orange-100/90 border-orange-300/20 bg-orange-300/[0.08]',
        label: '',
      };
    case 'ready':
      return {
        dot: 'h-1.5 w-1.5 rounded-full border border-white/45',
        pill: 'text-white/72 border-white/[0.12] bg-white/[0.04]',
        label: '',
      };
    case 'locked':
    default:
      return {
        dot: 'h-[3px] w-1.5 rounded-[1px] bg-white/20',
        pill: 'text-white/45 border-white/[0.08] bg-white/[0.02]',
        label: '',
      };
  }
}

export function WorkspaceShell({
  nodes,
  selectedNode,
  activeNode,
  onSelectNode,
  main,
  activeGate,
}: WorkspaceShellProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setSidebarExpanded(true), 200);
  }, []);
  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setSidebarExpanded(false);
  }, []);

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Keyboard accessibility: expand sidebar on focus, collapse on blur
  const handleFocusCapture = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setSidebarExpanded(true);
  }, []);
  const handleBlurCapture = useCallback((e: React.FocusEvent) => {
    // Only collapse if focus is leaving the sidebar entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setSidebarExpanded(false);
    }
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
      {/* Skip to main content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-16 focus:z-50 focus:rounded-lg focus:border focus:border-[#afc4ff]/40 focus:bg-[#0d1117] focus:px-4 focus:py-2 focus:text-sm focus:text-white/90 focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      {activeGate?.active && (
        <div className="border-b border-white/[0.08] bg-white/[0.02] px-3 py-2 backdrop-blur-xl">
          <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-amber-300/18 bg-amber-300/[0.06] px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-200/90" />
            <p className="min-w-0 flex-1 truncate text-xs text-amber-100/85">
              {selectedNode === activeGate.activeNode
                ? `Your input is needed${activeGate.label ? `: ${activeGate.label}` : ''}`
                : `Your input is needed on a different step${activeGate.label ? `: ${activeGate.label}` : ''}`}
            </p>
            {selectedNode !== activeGate.activeNode && (
              <GlassButton
                type="button"
                variant="ghost"
                onClick={activeGate.onReturn}
                className="h-auto px-2 py-1 text-[11px]"
              >
                Return
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
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label="Workflow navigation"
          className={cn(
            'hidden shrink-0 border-r border-white/[0.08] bg-white/[0.015] lg:block',
            'transition-[width] duration-200 ease-in-out',
            sidebarExpanded ? 'absolute inset-y-0 left-0 z-10 w-[270px] shadow-[4px_0_24px_-12px_rgba(0,0,0,0.5)]' : 'relative w-14',
          )}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocusCapture={handleFocusCapture}
          onBlurCapture={handleBlurCapture}
        >
          <div className="flex h-full flex-col gap-3 overflow-y-auto p-2">
            <div className="space-y-1">
              {nodes.map((node) => {
                const isSelected = node.key === selectedNode;
                const styles = statusStyles(node.status);
                const isLocked = node.status === 'locked';
                const Icon = NODE_ICONS[node.key] ?? FileText;

                return (
                  <div key={node.key} className="group relative">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => onSelectNode(node.key)}
                      aria-label={!sidebarExpanded ? `${node.label}${node.detailLabel ? ` – ${node.detailLabel}` : ''}` : undefined}
                      className={cn(
                        'relative flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-all',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/70',
                        isLocked
                          ? 'cursor-not-allowed border-transparent opacity-40'
                          : 'border-transparent hover:border-white/[0.14] hover:bg-white/[0.045]',
                        isSelected && 'border-[#afc4ff]/30 bg-[#afc4ff]/[0.08] shadow-[0_0_0_1px_rgba(175,196,255,0.08)_inset]',
                        node.key === activeNode && !isSelected && 'border-[#afc4ff]/14',
                      )}
                    >
                      <div className="relative shrink-0">
                        <Icon className={cn('h-5 w-5', isSelected ? 'text-[#afc4ff]' : 'text-white/60')} />
                        {/* Status dot */}
                        <span className={cn('absolute -right-0.5 -top-0.5', styles.dot)} />
                      </div>

                      {sidebarExpanded && (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-white/88">{node.label}</span>
                            {node.status === 'locked' && <Lock className="h-3 w-3 text-white/35" />}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-white/48">{node.description}</div>
                          {node.detailLabel && (
                            <div className="mt-1 text-[11px] text-white/55">{node.detailLabel}</div>
                          )}
                        </div>
                      )}
                    </button>

                    {/* Tooltip on hover when collapsed */}
                    {!sidebarExpanded && (
                      <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#0d1117]/95 px-3 py-1.5 text-xs text-white/80 opacity-0 shadow-xl backdrop-blur-xl transition-opacity group-hover:opacity-100">
                        {node.label}
                        {node.detailLabel && <span className="ml-1 text-white/50">&middot; {node.detailLabel}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
                    title={node.detailLabel ? `${node.label}: ${node.detailLabel}` : undefined}
                  >
                    {node.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <main id="main-content" className="min-h-0 min-w-0 flex-1">
            {main}
          </main>
        </div>
      </div>
    </div>
  );
}
