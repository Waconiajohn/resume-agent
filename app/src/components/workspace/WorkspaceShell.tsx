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
        dot: 'h-1.5 w-1.5 rounded-full bg-[var(--badge-green-text)] motion-safe:animate-node-complete-pop',
        pill: 'text-[var(--badge-green-text)]/90 border-[var(--badge-green-text)]/25 bg-[var(--badge-green-bg)]',
        label: '\u2713',
      };
    case 'blocked':
      return {
        dot: 'h-1.5 w-1.5 rounded-[2px] bg-[var(--badge-amber-text)] motion-safe:animate-node-pulse',
        pill: 'text-[var(--badge-amber-text)]/90 border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-bg)]',
        label: 'Your turn',
      };
    case 'in_progress':
      return {
        dot: 'h-1.5 w-1.5 rounded-full border-[1.5px] border-[var(--link)] motion-safe:animate-node-pulse',
        pill: 'text-[var(--link)] border-[var(--link)]/25 bg-[var(--badge-blue-bg)]',
        label: 'Active',
      };
    case 'stale':
      return {
        dot: 'h-1.5 w-1.5 rotate-45 rounded-[1px] bg-[var(--badge-amber-text)]',
        pill: 'text-[var(--badge-amber-text)]/90 border-[var(--badge-amber-text)]/20 bg-[var(--badge-amber-bg)]',
        label: '',
      };
    case 'ready':
      return {
        dot: 'h-1.5 w-1.5 rounded-full border border-[var(--line-strong)]',
        pill: 'text-[var(--text-muted)] border-[var(--line-soft)] bg-[var(--accent-muted)]',
        label: '',
      };
    case 'locked':
    default:
      return {
        dot: 'h-[3px] w-1.5 rounded-[1px] bg-[var(--line-strong)]',
        pill: 'text-[var(--text-soft)] border-[var(--line-soft)] bg-[var(--accent-muted)]',
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-16 focus:z-50 focus:rounded-[12px] focus:border focus:border-[var(--line-strong)] focus:bg-[var(--surface-3)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--text-strong)] focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      {activeGate?.active && (
        <div className="border-b border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] px-3 py-3">
          <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-[14px] border border-[var(--badge-amber-text)]/18 bg-[var(--badge-amber-bg)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--badge-amber-text)]/90" />
            <p className="min-w-0 flex-1 truncate text-[13px] uppercase tracking-[0.12em] text-[var(--badge-amber-text)]/85">
              {selectedNode === activeGate.activeNode
                ? `Your input is needed${activeGate.label ? `: ${activeGate.label}` : ''}`
                : `Your input is needed on a different step${activeGate.label ? `: ${activeGate.label}` : ''}`}
            </p>
            {selectedNode !== activeGate.activeNode && (
              <GlassButton
                type="button"
                variant="ghost"
                onClick={activeGate.onReturn}
                className="h-auto px-2 py-1 text-[13px]"
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
                className="h-auto px-2 py-1 text-[13px]"
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
            'hidden shrink-0 border-r border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(15,21,28,0.96),rgba(11,16,22,0.98))] lg:block',
            'transition-[width] duration-200 ease-in-out',
            sidebarExpanded ? 'absolute inset-y-0 left-0 z-10 w-[284px] shadow-[8px_0_34px_-20px_rgba(0,0,0,0.7)]' : 'relative w-16',
          )}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocusCapture={handleFocusCapture}
          onBlurCapture={handleBlurCapture}
        >
          <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
            <div className="space-y-1.5">
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
                        'relative flex w-full items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition-all',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                        isLocked
                          ? 'cursor-not-allowed border-transparent opacity-40'
                          : 'border-transparent hover:border-[rgba(238,243,248,0.14)] hover:bg-[rgba(255,255,255,0.035)]',
                        isSelected && 'border-[rgba(238,243,248,0.28)] bg-[rgba(255,255,255,0.05)] shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]',
                        node.key === activeNode && !isSelected && 'border-[rgba(238,243,248,0.12)]',
                      )}
                    >
                      <div className="relative shrink-0">
                        <Icon className={cn('h-5 w-5', isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-soft)]')} />
                        {/* Status dot */}
                        <span className={cn('absolute -right-0.5 -top-0.5', styles.dot)} />
                      </div>

                      {sidebarExpanded && (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-strong)]">{node.label}</span>
                            {node.status === 'locked' && <Lock className="h-3 w-3 text-[var(--text-soft)]" />}
                          </div>
                          <div className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--text-soft)]">{node.description}</div>
                          {node.detailLabel && (
                            <div className="mt-2 text-[13px] text-[var(--text-muted)]">{node.detailLabel}</div>
                          )}
                        </div>
                      )}
                    </button>

                    {/* Tooltip on hover when collapsed */}
                    {!sidebarExpanded && (
                      <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[12px] border border-[var(--line-soft)] bg-[rgba(12,18,24,0.96)] px-3 py-2 text-xs text-[var(--text-strong)] opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                        {node.label}
                        {node.detailLabel && <span className="ml-1 text-[var(--text-soft)]">&middot; {node.detailLabel}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-[var(--line-soft)] px-3 py-3 lg:hidden">
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
                      'shrink-0 rounded-[12px] border px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors',
                      selectedNode === node.key
                        ? 'border-[rgba(238,243,248,0.3)] bg-[rgba(255,255,255,0.06)] text-[var(--text-strong)]'
                        : 'border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] text-[var(--text-muted)]',
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
