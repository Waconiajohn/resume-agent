import { useEffect, useState } from 'react';
import { AlertTriangle, MessageSquare, X } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { WorkflowStatsRail } from './WorkflowStatsRail';
import { SafePanelContent } from './panels/panel-renderer';
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
  const [showChatOverlay, setShowChatOverlay] = useState(false);

  const isWorkbenchMode = panelType === 'section_review';

  useEffect(() => {
    runPanelPayloadSmokeChecks();
  }, []);

  // Auto-switch to details tab on mobile when panel data arrives
  useEffect(() => {
    if (panelData && window.innerWidth < 1024) {
      setMobileTab('details');
    }
  }, [panelData]);

  // Reset chat overlay when leaving workbench mode
  useEffect(() => {
    if (!isWorkbenchMode) {
      setShowChatOverlay(false);
    }
  }, [isWorkbenchMode]);

  // Close overlay on Escape key
  useEffect(() => {
    if (!showChatOverlay) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowChatOverlay(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showChatOverlay]);

  // Shared error banner and profile choice elements
  const errorBanner = error && !errorDismissed && (
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
  );

  const profileChoice = positioningProfileFound && onPipelineRespond && !profileChoiceMade && (
    <div className="px-4 py-2">
      <PositioningProfileChoice
        updatedAt={positioningProfileFound.updated_at}
        onChoice={(choice) => {
          onPipelineRespond('positioning_profile_choice', choice);
          setProfileChoiceMade(true);
        }}
      />
    </div>
  );

  // Workbench full-screen mode
  if (isWorkbenchMode && panelData) {
    return (
      <div className="relative flex h-[calc(100vh-3.5rem)] flex-col workbench-enter">
        {errorBanner}
        {profileChoice}

        {/* Show Chat button — top-left */}
        <div className="absolute left-4 top-4 z-10 hidden lg:block">
          <button
            type="button"
            onClick={() => setShowChatOverlay((prev) => !prev)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
              showChatOverlay
                ? 'border-[#98b3ff]/40 bg-[#98b3ff]/10 text-[#98b3ff]'
                : 'border-white/[0.12] bg-white/[0.05] text-white/60 hover:border-white/[0.2] hover:text-white/80',
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {showChatOverlay ? 'Hide Chat' : 'Show Chat'}
          </button>
        </div>

        {/* Main workbench area */}
        <div className="flex flex-1 min-h-0">
          {/* Chat overlay — slide in from left on lg+ */}
          {showChatOverlay && (
            <>
              {/* Backdrop */}
              <div
                className="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
                onClick={() => setShowChatOverlay(false)}
                aria-hidden="true"
              />
              <div className="relative z-30 w-96 shrink-0 border-r border-white/[0.1] bg-[#07090d]/95 backdrop-blur-xl chat-overlay-enter hidden lg:flex lg:flex-col">
                <div className="flex items-center justify-between border-b border-white/[0.1] px-3 py-2">
                  <span className="text-xs font-medium text-white/60">Chat</span>
                  <button
                    type="button"
                    onClick={() => setShowChatOverlay(false)}
                    aria-label="Close chat"
                    className="rounded p-0.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-h-0">
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
              </div>
            </>
          )}

          {/* Workbench panel — fills remaining space */}
          <div className="flex-1 min-w-0 min-h-0">
            <SafePanelContent
              panelType={panelType}
              panelData={panelData}
              resume={resume}
              isProcessing={isProcessing}
              onSendMessage={onSendMessage}
              onPipelineRespond={onPipelineRespond}
              onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
            />
          </div>
        </div>
      </div>
    );
  }

  // Default two-column layout
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {errorBanner}
      {profileChoice}

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
