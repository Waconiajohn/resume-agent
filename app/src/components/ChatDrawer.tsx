import { useState, useEffect, useRef } from 'react';
import { ChevronUp, Loader2 } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { cn } from '@/lib/utils';
import type {
  ChatMessage as ChatMessageType,
  ToolStatus,
  AskUserPromptData,
  PhaseGateData,
  PipelineActivitySnapshot,
  PipelineRuntimeMetricsSnapshot,
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
  runtimeMetrics?: PipelineRuntimeMetricsSnapshot | null;
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
  runtimeMetrics = null,
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
  approvedSections = {},
}: ChatDrawerProps) {
  const [expanded, setExpanded] = useState(false);

  // Refs to track previous values for auto-expand
  const prevStreamingRef = useRef(streamingText);
  const prevPhaseGateRef = useRef(phaseGate);
  const prevAskPromptRef = useRef(askPrompt);
  const prevMessagesLenRef = useRef(messages.length);

  // Auto-expand triggers
  useEffect(() => {
    const streamingStarted = !prevStreamingRef.current && streamingText;
    const gateAppeared = !prevPhaseGateRef.current && phaseGate;
    const askAppeared = !prevAskPromptRef.current && askPrompt;
    const newMessages = messages.length > prevMessagesLenRef.current;

    prevStreamingRef.current = streamingText;
    prevPhaseGateRef.current = phaseGate;
    prevAskPromptRef.current = askPrompt;
    prevMessagesLenRef.current = messages.length;

    if (streamingStarted || gateAppeared || askAppeared || newMessages) {
      setExpanded(true);
    }
  }, [streamingText, phaseGate, askPrompt, messages.length]);

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
      ? 'May be stalled'
      : runtimeState === 'processing'
        ? 'Working'
        : runtimeState === 'waiting_for_input'
          ? 'Waiting for input'
          : runtimeState === 'reconnecting'
            ? 'Reconnecting'
            : runtimeState === 'complete'
              ? 'Complete'
              : runtimeState === 'error'
                ? 'Error'
                : (connected ? (pipelinePhaseActive ? 'Idle' : 'Connected') : 'Reconnecting');
  const statusDotColor =
    runtimeState === 'stalled_suspected' || runtimeState === 'error'
      ? 'bg-rose-400'
      : runtimeState === 'processing'
        ? 'bg-sky-400 animate-pulse'
        : runtimeState === 'waiting_for_input'
          ? 'bg-amber-400'
          : runtimeState === 'complete'
            ? 'bg-emerald-400'
            : (connected ? 'bg-emerald-400' : 'bg-white/40');

  return (
    <div
      className={cn(
        'grid flex-shrink-0 border-t border-white/[0.08] bg-white/[0.02] backdrop-blur-xl transition-[grid-template-rows] duration-300 ease-in-out',
        expanded ? 'grid-rows-[36px_1fr]' : 'grid-rows-[36px_0fr]',
      )}
      style={{ maxHeight: expanded ? '40vh' : '36px' }}
    >
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex h-[36px] w-full items-center gap-2 px-4 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDotColor)} />
        <span className="text-xs font-medium text-white/80">Coach</span>
        <span className="text-xs text-white/50">{statusLabel}</span>
        {isProcessing && <Loader2 className="h-3 w-3 animate-spin text-[#aec3ff]" />}
        <ChevronUp
          className={cn(
            'ml-auto h-4 w-4 text-white/50 transition-transform duration-200',
            expanded ? '' : 'rotate-180',
          )}
        />
      </button>

      {/* Drawer body */}
      <div className="min-h-0 overflow-hidden">
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
          runtimeMetrics={runtimeMetrics}
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
    </div>
  );
}
