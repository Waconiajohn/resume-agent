import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { PositioningProfileChoice } from './PositioningProfileChoice';
import { SafePanelContent } from './panels/panel-renderer';
import { PROCESS_STEP_CONTRACTS, processStepFromPhase } from '@/constants/process-contract';
import type { PanelRendererProps } from './panels/panel-renderer';

// ─── Narrative Status Line ──────────────────────────────────────────────────

const PHASE_NARRATIVE: Record<string, string> = {
  intake: 'Reading your resume...',
  onboarding: "Here's what we found in your resume.",
  research: 'Studying what this company is looking for...',
  positioning: "Let's strengthen your story with a few questions.",
  gap_analysis: 'Almost there — a few more questions to close the gaps.',
  architect: 'Planning the best structure for your resume...',
  architect_review: 'Planning the best structure for your resume...',
  section_writing: 'Writing your resume now...',
  section_review: 'Reviewing what we wrote...',
  revision: 'Making revisions...',
  positioning_profile_choice: 'We found your saved positioning profile.',
  quality_review: 'Doing a final quality check...',
  complete: 'Your resume is ready!',
};

function NarrativeStatusLine({ phase }: { phase: string }) {
  const message = PHASE_NARRATIVE[phase] ?? PHASE_NARRATIVE.intake;
  return (
    <p role="status" aria-live="polite" className="px-4 py-3 text-center text-sm font-medium text-[var(--text-muted)]">
      {message}
    </p>
  );
}

// ─── Victory Moment ─────────────────────────────────────────────────────────

function VictoryMoment({ message }: { message: string }) {
  return (
    <GlassCard role="alert" className="border-[#b5dec2]/20 bg-[#b5dec2]/[0.04] p-6 text-center">
      <div className="mb-2 flex justify-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#b5dec2]/20">
          <Check className="h-5 w-5 text-[#b5dec2]" />
        </div>
      </div>
      <p className="text-sm font-medium text-[#b5dec2]/90">{message}</p>
    </GlassCard>
  );
}

// ─── Main InterviewLayout ───────────────────────────────────────────────────────

interface InterviewLayoutProps extends PanelRendererProps {
  effectiveCurrentPhase: string;
  positioningProfileFound?: { profile: unknown; updated_at: string } | null;
  onProfileChoice?: (choice: unknown) => void;
}

export function InterviewLayout({
  effectiveCurrentPhase,
  panelType,
  panelData,
  resume,
  isProcessing,
  onSendMessage,
  onPipelineRespond,
  onSaveCurrentResumeAsBase,
  onDismissSuggestion,
  positioningProfileFound,
  onProfileChoice,
}: InterviewLayoutProps) {
  const showProfileChoice = Boolean(positioningProfileFound && onProfileChoice);
  const showWelcomeNarrative = !panelData && isProcessing;

  // Victory moment on phase transitions
  const [victoryMessage, setVictoryMessage] = useState<string | null>(null);
  const prevPhaseRef = useRef(effectiveCurrentPhase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = effectiveCurrentPhase;
    if (prev === effectiveCurrentPhase) return;

    const prevStep = processStepFromPhase(prev);
    const contract = PROCESS_STEP_CONTRACTS[prevStep];
    if (contract?.victoryMessage) {
      setVictoryMessage(contract.victoryMessage);
      const timer = setTimeout(() => setVictoryMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [effectiveCurrentPhase]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Narrative status line */}
      <div className="flex-shrink-0 border-b border-[var(--line-soft)]">
        <NarrativeStatusLine phase={effectiveCurrentPhase} />
      </div>

      {/* Centered panel content area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-10">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Positioning profile choice (if needed) */}
          {showProfileChoice && positioningProfileFound && onProfileChoice && (
            <GlassCard className="p-4">
              <PositioningProfileChoice
                updatedAt={positioningProfileFound.updated_at}
                onChoice={onProfileChoice}
              />
            </GlassCard>
          )}

          {/* Victory moment between phases */}
          {victoryMessage && (
            <VictoryMoment message={victoryMessage} />
          )}

          {/* Welcome narrative during processing dead zone */}
          {showWelcomeNarrative && !victoryMessage && (
            <GlassCard className="p-6 text-center">
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                We're reading your resume and studying the job posting. In a moment,
                we'll show you what we found and start asking a few questions to
                strengthen your positioning. This usually takes about 30 seconds.
              </p>
            </GlassCard>
          )}

          {/* Main panel content */}
          {panelData && (
            <GlassCard className="overflow-hidden">
              <SafePanelContent
                panelType={panelType}
                panelData={panelData}
                resume={resume}
                isProcessing={isProcessing}
                onSendMessage={onSendMessage}
                onPipelineRespond={onPipelineRespond}
                onSaveCurrentResumeAsBase={onSaveCurrentResumeAsBase}
                onDismissSuggestion={onDismissSuggestion}
                variant="inline"
              />
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
