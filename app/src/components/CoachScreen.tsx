import { ChatPanel } from './ChatPanel';
import { RightPanel } from './panels/RightPanel';
import type { ChatMessage, ToolStatus, AskUserPromptData, PhaseGateData } from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData } from '@/types/panels';

interface CoachScreenProps {
  messages: ChatMessage[];
  streamingText: string;
  tools: ToolStatus[];
  askPrompt: AskUserPromptData | null;
  phaseGate: PhaseGateData | null;
  currentPhase: string;
  isProcessing: boolean;
  resume: FinalResume | null;
  panelType: PanelType | null;
  panelData: PanelData | null;
  error: string | null;
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
  panelType,
  panelData,
  error,
  onSendMessage,
}: CoachScreenProps) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* 3D: Error banner */}
      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2.5 backdrop-blur-sm">
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Chat side */}
        <div className="flex-1 border-r border-white/[0.12]">
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

        {/* Dynamic right panel */}
        <div className="hidden w-[45%] lg:block">
          <RightPanel panelType={panelType} panelData={panelData} resume={resume} onSendMessage={onSendMessage} />
        </div>
      </div>
    </div>
  );
}
