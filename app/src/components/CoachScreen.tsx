import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { WorkflowStatsRail } from './WorkflowStatsRail';
import { runPanelPayloadSmokeChecks } from './panels/panel-smoke';
import { cn } from '@/lib/utils';
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
  sessionComplete?: boolean;
  resume: FinalResume | null;
  panelType: PanelType | null;
  panelData: PanelData | null;
  error: string | null;
  onSendMessage: (content: string) => void;
  isPipelineGateActive?: boolean;
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
  sessionComplete,
  resume,
  panelType,
  panelData,
  error,
  isPipelineGateActive,
  onSendMessage,
  onPipelineRespond,
  positioningProfileFound,
  onSaveCurrentResumeAsBase,
}: CoachScreenProps) {
  const [profileChoiceMade, setProfileChoiceMade] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'details'>('chat');
  const [errorDismissed, setErrorDismissed] = useState(false);

  useEffect(() => {
    runPanelPayloadSmokeChecks();
  }, []);

  // Auto-switch to details tab on mobile when panel data arrives
  useEffect(() => {
    if (panelData && window.innerWidth < 1024) {
      setMobileTab('details');
    }
  }, [panelData]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Error banner */}
      {error && !errorDismissed && (
        <div className="mx-4 mt-2 flex items-start gap-2 rounded-lg border border-red-300/28 bg-red-500/[0.08] px-4 py-2.5 backdrop-blur-xl">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300/80" aria-hidden="true" />
          <p className="flex-1 text-sm text-red-100/90">{error}</p>
          <button
            type="button"
            onClick={() => setErrorDismissed(true)}
            aria-label="Dismiss error"
            className="shrink-0 rounded p-0.5 text-red-300/60 transition-colors hover:bg-white/[0.06] hover:text-red-300/90"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
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

      {/* Mobile tab switcher — only visible on < lg screens */}
      <div className="flex lg:hidden border-b border-white/10 shrink-0">
        <button
          onClick={() => setMobileTab('chat')}
          className={cn(
            'flex-1 py-2 text-sm font-medium transition-colors',
            mobileTab === 'chat'
              ? 'text-white border-b-2 border-[#afc4ff]'
              : 'text-white/50 hover:text-white/70',
          )}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileTab('details')}
          className={cn(
            'flex-1 py-2 text-sm font-medium transition-colors',
            mobileTab === 'details'
              ? 'text-white border-b-2 border-[#afc4ff]'
              : 'text-white/50 hover:text-white/70',
          )}
        >
          Details
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className={cn('flex-1 min-w-0', mobileTab !== 'chat' && 'hidden lg:flex lg:flex-col')}>
          <ChatPanel
            messages={messages}
            streamingText={streamingText}
            tools={tools}
            askPrompt={askPrompt}
            phaseGate={phaseGate}
            currentPhase={currentPhase}
            isProcessing={isProcessing}
            onSendMessage={onSendMessage}
            isPipelineGateActive={isPipelineGateActive}
            panelType={panelType}
            panelData={panelData}
            resume={resume}
            onPipelineRespond={onPipelineRespond}
            onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
          />
        </div>

        <div className={cn('w-72 min-w-0 min-h-[200px]', mobileTab !== 'details' && 'hidden lg:block')}>
          <WorkflowStatsRail
            currentPhase={currentPhase}
            isProcessing={isProcessing}
            sessionComplete={sessionComplete}
            error={error}
            panelData={panelData}
            resume={resume}
          />
        </div>
      </div>
    </div>
  );
}
