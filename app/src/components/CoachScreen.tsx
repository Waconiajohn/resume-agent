import { ChatPanel } from './ChatPanel';
import { ResumePanel } from './ResumePanel';
import type { ChatMessage, ToolStatus, AskUserPromptData, PhaseGateData } from '@/types/session';
import type { FinalResume } from '@/types/resume';

interface CoachScreenProps {
  messages: ChatMessage[];
  streamingText: string;
  tools: ToolStatus[];
  askPrompt: AskUserPromptData | null;
  phaseGate: PhaseGateData | null;
  currentPhase: string;
  isProcessing: boolean;
  resume: FinalResume | null;
  onSendMessage: (content: string) => void;
}

export function CoachScreen({
  messages,
  streamingText,
  tools,
  askPrompt,
  phaseGate,
  currentPhase,
  isProcessing,
  resume,
  onSendMessage,
}: CoachScreenProps) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Chat side */}
      <div className="flex-1 border-r border-white/[0.06]">
        <ChatPanel
          messages={messages}
          streamingText={streamingText}
          tools={tools}
          askPrompt={askPrompt}
          phaseGate={phaseGate}
          currentPhase={currentPhase}
          isProcessing={isProcessing}
          onSendMessage={onSendMessage}
        />
      </div>

      {/* Resume preview side */}
      <div className="hidden w-[45%] lg:block">
        <ResumePanel resume={resume} />
      </div>
    </div>
  );
}
