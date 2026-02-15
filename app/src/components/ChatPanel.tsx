import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ArrowRight, CheckCircle } from 'lucide-react';
import { GlassTextarea } from './GlassInput';
import { GlassButton } from './GlassButton';
import { ChatMessage } from './ChatMessage';
import { AskUserPrompt } from './AskUserPrompt';
import type { ChatMessage as ChatMessageType, ToolStatus, AskUserPromptData, PhaseGateData } from '@/types/session';

const PHASE_LABELS: Record<string, string> = {
  onboarding: 'Getting Started',
  deep_research: 'Deep Research',
  gap_analysis: 'Gap Analysis',
  resume_design: 'Resume Design',
  section_craft: 'Section Craft',
  quality_review: 'Quality Review',
  cover_letter: 'Cover Letter',
  interview_prep: 'Interview Prep',
};

interface ChatPanelProps {
  messages: ChatMessageType[];
  streamingText: string;
  tools: ToolStatus[];
  askPrompt: AskUserPromptData | null;
  phaseGate: PhaseGateData | null;
  currentPhase: string;
  isProcessing: boolean;
  onSendMessage: (content: string) => void;
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
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isBusy = isProcessing || streamingText.length > 0 || tools.some((t) => t.status === 'running');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText, tools, askPrompt, phaseGate]);

  const handleSubmit = () => {
    if (!input.trim()) return;
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
      {/* Phase indicator bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
        <span className="text-[10px] uppercase tracking-wider text-white/50">Phase</span>
        <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-medium text-blue-300">
          {PHASE_LABELS[currentPhase] ?? currentPhase}
        </span>
        {isBusy && (
          <div className="ml-auto flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            <span className="text-[10px] text-white/60">Working...</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {/* Tool status indicators */}
        {tools.filter((t) => t.status === 'running').map((tool) => (
          <div key={tool.name} className="flex items-center gap-2 px-4 py-2">
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            <span className="text-xs text-white/50">{tool.description}</span>
          </div>
        ))}

        {/* Processing indicator (when agent is working but no text streaming yet) */}
        {isProcessing && !streamingText && tools.every((t) => t.status !== 'running') && (
          <div className="flex items-center gap-2 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <span className="text-sm text-white/50">Your coach is thinking...</span>
          </div>
        )}

        {/* Streaming text */}
        {streamingText && (
          <ChatMessage role="assistant" content={streamingText} />
        )}

        {/* Phase gate confirmation */}
        {phaseGate && (
          <div className="mx-4 my-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium text-white">
                {PHASE_LABELS[phaseGate.currentPhase] ?? phaseGate.currentPhase} complete
              </span>
            </div>
            <p className="mb-3 text-sm text-white/70">{phaseGate.phaseSummary}</p>
            <div className="mb-3 flex items-center gap-2 text-xs text-white/50">
              <ArrowRight className="h-3 w-3" />
              <span>Next: <strong className="text-white/80">{PHASE_LABELS[phaseGate.nextPhase] ?? phaseGate.nextPhase}</strong></span>
            </div>
            <p className="mb-4 text-xs text-white/50">{phaseGate.nextPhasePreview}</p>
            <div className="flex gap-2">
              <button
                onClick={() => onSendMessage("Yes, let's move forward!")}
                className="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-400"
              >
                Continue
              </button>
              <button
                onClick={() => onSendMessage("I'd like to revisit some things first.")}
                className="rounded-md border border-white/20 px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/5"
              >
                Go Back
              </button>
            </div>
          </div>
        )}

        {/* Ask user prompt */}
        {askPrompt && (
          <AskUserPrompt prompt={askPrompt} onSubmit={onSendMessage} />
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] p-4">
        <div className="flex gap-2">
          <GlassTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              phaseGate ? 'Or type your own response...' :
              askPrompt ? 'Answer the question above...' :
              'Type a message...'
            }
            rows={1}
            className="flex-1"
          />
          <GlassButton
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="self-end"
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
