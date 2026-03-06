import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, MessageCircle, X } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { cn } from '@/lib/utils';
import type {
  ChatMessage as ChatMessageType,
  ToolStatus,
  AskUserPromptData,
  PhaseGateData,
  PipelineActivitySnapshot,
} from '@/types/session';
import type { PanelType, PanelData } from '@/types/panels';
import type { FinalResume } from '@/types/resume';

interface ChatDrawerProps {
  messages: ChatMessageType[];
  streamingText: string;
  tools: ToolStatus[];
  askPrompt: AskUserPromptData | null;
  phaseGate: PhaseGateData | null;
  currentPhase: string;
  isProcessing: boolean;
  connected?: boolean;
  lastBackendActivityAt?: string | null;
  stalledSuspected?: boolean;
  pipelineActivity?: PipelineActivitySnapshot | null;
  onReconnectStream?: () => void;
  onRefreshWorkflowState?: () => void | Promise<void>;
  isRefreshingWorkflowState?: boolean;
  onSendMessage: (content: string) => void | Promise<void>;
  panelType: PanelType | null;
  panelData: PanelData | null;
  resume: FinalResume | null;
  onPipelineRespond?: (gate: string, response: unknown) => void;
  isPipelineGateActive?: boolean;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
  approvedSections?: Record<string, string>;
}

const EMPTY_APPROVED_SECTIONS: Record<string, string> = {};

export function ChatDrawer({
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
  pipelineActivity = null,
  onReconnectStream,
  onRefreshWorkflowState,
  isRefreshingWorkflowState = false,
  onSendMessage,
  panelType,
  panelData,
  resume,
  onPipelineRespond,
  isPipelineGateActive,
  onSaveCurrentResumeAsBase,
  approvedSections = EMPTY_APPROVED_SECTIONS,
}: ChatDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Focus management: move focus into drawer on open, restore on close
  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else {
      openButtonRef.current?.focus();
    }
  }, [expanded]);

  // Close on Escape key
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setExpanded(false);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [expanded, handleEscape]);

  // Status derivation (mirrors ChatPanel logic)
  const pipelinePhaseActive = currentPhase !== 'onboarding' && currentPhase !== 'complete';
  const runtimeState = pipelineActivity?.processing_state ?? (
    stalledSuspected
      ? 'stalled_suspected'
      : isProcessing
        ? 'processing'
        : (isPipelineGateActive ? 'waiting_for_input' : (connected ? 'idle' : 'reconnecting'))
  );
  const statusLabel =
    runtimeState === 'stalled_suspected'
      ? 'Taking longer than expected'
      : runtimeState === 'processing'
        ? 'Working'
        : runtimeState === 'waiting_for_input'
          ? 'Waiting for your input'
          : runtimeState === 'reconnecting'
            ? 'Reconnecting...'
            : runtimeState === 'complete'
              ? 'Complete'
              : runtimeState === 'error'
                ? 'Something went wrong'
                : 'Ready';
  const statusDotColor =
    runtimeState === 'stalled_suspected' || runtimeState === 'error'
      ? 'bg-[#e0abab]'
      : runtimeState === 'processing'
        ? 'bg-[#afc4ff] motion-safe:animate-pulse'
        : runtimeState === 'waiting_for_input'
          ? 'bg-[#dfc797]'
          : 'bg-[#b5dec2]';

  return (
    <>
      {/* Collapsed: small icon button, bottom-left — zero layout footprint */}
      {!expanded && (
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setExpanded(true)}
          className="fixed bottom-4 right-4 z-20 flex h-12 items-center rounded-full border border-white/[0.12] bg-[#0d1117]/90 px-4 shadow-lg backdrop-blur-xl transition-all hover:border-white/[0.2] hover:bg-[#0d1117]"
          aria-label={`Open coach – ${statusLabel}`}
        >
          <MessageCircle className="h-[1.125rem] w-[1.125rem] text-white/60" />
          <span className="text-xs font-medium text-white/70 ml-1.5">Need Help?</span>
          <span className={cn('absolute right-0.5 top-0.5 h-2 w-2 rounded-full', statusDotColor)} />
        </button>
      )}

      {/* Expanded: fixed overlay from bottom — does NOT affect document layout */}
      {expanded && (
        <div
          ref={drawerRef}
          className="fixed inset-x-0 bottom-0 z-20 flex max-h-[50vh] flex-col border-t border-white/[0.08] bg-[#0d1117] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.5)]"
          role="dialog"
          aria-label="Coach drawer"
        >
          {/* Focus trap: top sentinel */}
          <div
            tabIndex={0}
            className="sr-only"
            onFocus={() => {
              const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
              );
              if (focusable?.length) focusable[focusable.length - 1].focus();
            }}
          />
          {/* Header bar */}
          <div className="flex h-[36px] shrink-0 items-center gap-2 px-4">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDotColor)} />
            <span className="text-xs font-medium text-white/80">Coach</span>
            <span className="text-xs text-white/50" aria-live="polite">{statusLabel}</span>
            {isProcessing && <Loader2 className="h-3 w-3 motion-safe:animate-spin text-[#aec3ff]" />}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setExpanded(false)}
              className="ml-auto rounded p-1 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70"
              aria-label="Close coach drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Chat body */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatPanel
              messages={messages}
              streamingText={streamingText}
              tools={tools}
              askPrompt={askPrompt}
              phaseGate={phaseGate}
              currentPhase={currentPhase}
              isProcessing={isProcessing}
              connected={connected}
              lastBackendActivityAt={lastBackendActivityAt}
              stalledSuspected={stalledSuspected}
              pipelineActivity={pipelineActivity}
              onReconnectStream={onReconnectStream}
              onRefreshWorkflowState={onRefreshWorkflowState}
              isRefreshingWorkflowState={isRefreshingWorkflowState}
              onSendMessage={onSendMessage}
              panelType={panelType}
              panelData={panelData}
              resume={resume}
              onPipelineRespond={onPipelineRespond}
              isPipelineGateActive={isPipelineGateActive}
              onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
              approvedSections={approvedSections}
              hideWorkProduct
            />
          </div>
          {/* Focus trap: bottom sentinel */}
          <div
            tabIndex={0}
            className="sr-only"
            onFocus={() => closeButtonRef.current?.focus()}
          />
        </div>
      )}
    </>
  );
}
