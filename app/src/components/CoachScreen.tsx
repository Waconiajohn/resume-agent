import { useEffect, useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { WorkflowStatsRail } from './WorkflowStatsRail';
import { runPanelPayloadSmokeChecks } from './panels/panel-smoke';
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
  onPipelineRespond?: (gate: string, response: unknown) => void;
  positioningProfileFound?: { profile: unknown; updated_at: string } | null;
  onSaveCurrentResumeAsBase?: (
    mode: 'default' | 'alternate',
  ) => Promise<{ success: boolean; message: string }>;
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
  onPipelineRespond,
  positioningProfileFound,
  onSaveCurrentResumeAsBase,
}: CoachScreenProps) {
  const [profileChoiceMade, setProfileChoiceMade] = useState(false);

  useEffect(() => {
    runPanelPayloadSmokeChecks();
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* 3D: Error banner */}
      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-white/[0.14] bg-white/[0.04] px-4 py-2.5 backdrop-blur-xl">
          <p className="text-sm text-white/78">{error}</p>
        </div>
      )}

      {/* Positioning profile choice — shown when an existing profile is found */}
      {positioningProfileFound && onPipelineRespond && !profileChoiceMade && (
        <div className="px-4 py-2">
          <PositioningProfileChoice
            updatedAt={positioningProfileFound.updated_at}
            onChoice={(choice) => {
              onPipelineRespond('positioning_profile_choice', choice);
              setProfileChoiceMade(true);
            }}
          />
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <ChatPanel
            messages={messages}
            streamingText={streamingText}
            tools={tools}
            askPrompt={askPrompt}
            phaseGate={phaseGate}
            currentPhase={currentPhase}
            isProcessing={isProcessing}
            onSendMessage={onSendMessage}
            panelType={panelType}
            panelData={panelData}
            resume={resume}
            onPipelineRespond={onPipelineRespond}
            onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
          />
        </div>

        <div className="hidden w-72 min-w-0 lg:block">
          <WorkflowStatsRail
            currentPhase={currentPhase}
            isProcessing={isProcessing}
            panelData={panelData}
            resume={resume}
          />
        </div>
      </div>
    </div>
  );
}
