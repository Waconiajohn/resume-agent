import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, ArrowRight, CheckCircle, ChevronDown } from 'lucide-react';
import { GlassTextarea } from './GlassInput';
import { GlassButton } from './GlassButton';
import { ChatMessage } from './ChatMessage';
import { AskUserPrompt } from './AskUserPrompt';
import { SafePanelContent } from './panels/panel-renderer';
import { ResumePanel } from './ResumePanel';
import { PartialResumePreview } from './panels/PartialResumePreview';
import { PHASE_LABELS } from '@/constants/phases';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType, ToolStatus, AskUserPromptData, PhaseGateData } from '@/types/session';
import type { PanelType, PanelData } from '@/types/panels';
import type { FinalResume } from '@/types/resume';

interface ChatPanelProps {
  messages: ChatMessageType[];
  streamingText: string;
  tools: ToolStatus[];
  askPrompt: AskUserPromptData | null;
  phaseGate: PhaseGateData | null;
  currentPhase: string;
  isProcessing: boolean;
  onSendMessage: (content: string) => void | Promise<void>;
  panelType: PanelType | null;
  panelData: PanelData | null;
  resume: FinalResume | null;
  onPipelineRespond?: (gate: string, response: unknown) => void;
  isPipelineGateActive?: boolean;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
  hideWorkProduct?: boolean;
  approvedSections?: Record<string, string>;
}

export function ChatPanel({
  messages,
  streamingText,
  tools,
  askPrompt,
  phaseGate,
  currentPhase,
  isProcessing,
  onSendMessage,
  panelType,
  panelData,
  resume,
  isPipelineGateActive,
  onPipelineRespond,
  onSaveCurrentResumeAsBase,
  hideWorkProduct = false,
  approvedSections = {},
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isBusy = isProcessing || isPipelineGateActive || streamingText.length > 0 || tools.some((t) => t.status === 'running');
  const isGateLocked = Boolean(isPipelineGateActive) && panelData != null
    && panelData.type !== 'positioning_interview'; // positioning uses chat
  const canOpenResumePreview =
    (!!resume && !!panelData && (panelData.type === 'quality_dashboard' || panelData.type === 'completion'))
    || Object.keys(approvedSections).length > 0;

  useEffect(() => {
    setShowResumePreview(false);
  }, [panelData?.type]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "near bottom" if within 100px of the bottom
    setUserScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }, []);

  const isStreaming = streamingText.length > 0;
  useEffect(() => {
    if (!userScrolledUp) {
      const behavior = isStreaming ? 'instant' : 'smooth';
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }
  }, [messages, streamingText, tools, askPrompt, phaseGate, isStreaming, userScrolledUp]);

  const handleSubmit = () => {
    if (!input.trim() || isBusy) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Visually hidden live region for screen reader phase announcements */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {PHASE_LABELS[currentPhase] ?? currentPhase}
      </span>
      {/* Phase indicator bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.1] px-4 py-2">
        <span className="text-[10px] uppercase tracking-wider text-white/50">Phase</span>
        <span className="rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-0.5 text-xs font-medium text-white/78">
          {PHASE_LABELS[currentPhase] ?? currentPhase}
        </span>
        {isBusy && (
          <div className="ml-auto flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-[#aec3ff]" />
            <span className="text-[10px] text-white/60">Working...</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="relative flex-1 overflow-hidden">
        {userScrolledUp && (
          <button
            type="button"
            onClick={() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
              setUserScrolledUp(false);
            }}
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1.5
              rounded-full border border-white/[0.12] bg-black/60 backdrop-blur-lg px-3 py-1.5
              text-[11px] text-white/70 shadow-lg transition-all hover:bg-black/80 hover:text-white/90"
          >
            <ChevronDown className="h-3 w-3" />
            New messages
          </button>
        )}
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overflow-x-hidden py-4 space-y-1">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {/* Tool status indicators */}
        {tools.filter((t) => t.status === 'running').map((tool) => (
          <div key={tool.name} className="flex items-center gap-2 px-4 py-2" role="status" aria-label={tool.description ?? 'Processing'}>
            <Loader2 className="h-3 w-3 animate-spin text-[#aec3ff]" aria-hidden="true" />
            <span className="text-xs text-white/50">{tool.description}</span>
          </div>
        ))}

        {/* Processing indicator (when agent is working but no text streaming yet) */}
        {isProcessing && !streamingText && tools.every((t) => t.status !== 'running') && (
          <div className="flex items-center gap-2 px-4 py-3" role="status" aria-label="Coach is thinking">
            <Loader2 className="h-4 w-4 animate-spin text-[#aec3ff]" aria-hidden="true" />
            <span className="text-sm text-white/50">Your coach is thinking...</span>
          </div>
        )}

        {/* Streaming text */}
        {streamingText && (
          <div aria-live="polite">
            <ChatMessage role="assistant" content={streamingText} animate={false} />
          </div>
        )}

        {/* Phase gate confirmation */}
        {phaseGate && (
          <div className="mx-4 my-3 rounded-lg border border-white/[0.12] bg-white/[0.035] p-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-[#a8d7b8]" />
              <span className="text-sm font-medium text-white">
                {PHASE_LABELS[phaseGate.currentPhase] ?? phaseGate.currentPhase} complete
              </span>
            </div>
            <p className="mb-3 text-sm text-white/70">{phaseGate.phaseSummary}</p>
            <div className="mb-3 flex items-center gap-2 text-xs text-white/50">
              <ArrowRight className="h-3 w-3" />
              <span>Next: <strong className="text-white/80">{PHASE_LABELS[phaseGate.nextPhase] ?? phaseGate.nextPhase}</strong></span>
            </div>
            <p className="mb-4 text-xs text-white/75">{phaseGate.nextPhasePreview}</p>
            <div className="flex gap-2">
              <GlassButton
                variant="primary"
                onClick={() => onPipelineRespond?.(phaseGate.toolCallId, { confirmed: true })}
              >
                Continue
              </GlassButton>
              <GlassButton
                variant="ghost"
                onClick={() => onPipelineRespond?.(phaseGate.toolCallId, { confirmed: false })}
              >
                Go Back
              </GlassButton>
            </div>
          </div>
        )}

        {!hideWorkProduct && panelData && panelType !== 'section_review' && (
          <div className="mx-4 my-3 min-h-[400px] overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.025]">
            <div className="flex items-center justify-between border-b border-white/[0.1] px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/48">
                Current Work Product
              </span>
              <div className="flex items-center gap-2">
                {canOpenResumePreview && (
                  <GlassButton
                    type="button"
                    variant="ghost"
                    onClick={() => setShowResumePreview((prev) => !prev)}
                    aria-label={showResumePreview ? 'Back to panel view' : 'Open resume preview'}
                    className="h-auto px-2 py-1 text-[10px] uppercase tracking-[0.12em]"
                  >
                    {showResumePreview ? 'Back To Panel' : 'Open Resume Preview'}
                  </GlassButton>
                )}
                <span className="text-[10px] text-white/58">
                  {(panelType ?? panelData.type).replace(/_/g, ' ')}
                </span>
              </div>
            </div>
            <div className="p-0">
              {showResumePreview ? (
                resume ? (
                  <ResumePanel resume={resume} />
                ) : (
                  <PartialResumePreview approvedSections={approvedSections} />
                )
              ) : (
                <SafePanelContent
                  panelType={panelType}
                  panelData={panelData}
                  resume={resume}
                  isProcessing={isProcessing}
                  onSendMessage={onSendMessage}
                  onPipelineRespond={onPipelineRespond}
                  onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
                  variant="inline"
                />
              )}
            </div>
          </div>
        )}

        {/* Ask user prompt */}
        {askPrompt && (
          <AskUserPrompt prompt={askPrompt} onSubmit={onSendMessage} />
        )}
      </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.1] p-4">
        <div className="flex gap-2">
          <GlassTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isGateLocked ? 'Use the panel above to continue' :
              phaseGate ? 'Or type your own response...' :
              askPrompt ? 'Answer the question above...' :
              'Type a message...'
            }
            rows={1}
            disabled={isGateLocked}
            className={cn('flex-1', isGateLocked && 'opacity-50')}
          />
          <GlassButton
            onClick={handleSubmit}
            disabled={!input.trim() || isBusy}
            className="self-end"
            aria-label="Send message"
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </GlassButton>
        </div>
        {isGateLocked && (
          <p className="mt-1.5 text-center text-[10px] text-white/40">Respond using the panel to continue</p>
        )}
      </div>
    </div>
  );
}
