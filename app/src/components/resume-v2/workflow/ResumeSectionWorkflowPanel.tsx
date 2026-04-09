import type { CandidateIntelligence, RequirementWorkItem, ResumeDraft } from '@/types/resume-v2';
import type {
  ResumeSectionDraftVariant,
  ResumeSectionWorkflowViewModel,
  ResumeWorkflowSectionStepViewModel,
} from '@/lib/resume-section-workflow';
import type { SectionRefineActionId } from '@/lib/section-draft-refinement';
import type { ResumeCustomSectionPresetId } from '@/lib/resume-section-plan';
import { SectionPlanStep } from './SectionPlanStep';
import { SectionDraftStep } from './SectionDraftStep';

interface ResumeSectionWorkflowPanelProps {
  resume: ResumeDraft;
  workflow: ResumeSectionWorkflowViewModel;
  candidateIntelligence?: CandidateIntelligence | null;
  requirementWorkItems?: RequirementWorkItem[] | null;
  structureConfirmed: boolean;
  currentStep: ResumeWorkflowSectionStepViewModel | null;
  draftState?: {
    status: 'idle' | 'loading' | 'ready' | 'error';
    result: import('@/lib/resume-section-workflow').ResumeSectionDraftResult | null;
    error: string | null;
    isRefining?: boolean;
    refinementActionId?: SectionRefineActionId | null;
    refinementError?: string | null;
  };
  onMoveSection: (sectionId: string, direction: 'up' | 'down') => void;
  onToggleSection: (sectionId: string, enabled: boolean) => void;
  onAddAISection: () => void;
  onAddCustomSection: (title: string, lines: string[], presetId?: ResumeCustomSectionPresetId) => void;
  onRemoveCustomSection: (sectionId: string) => void;
  onConfirmStructure: () => void;
  onGenerateDraft: () => void;
  onRefineDraft: (actionId: SectionRefineActionId, workingDraft: string) => Promise<void>;
  onApplyVariant: (variant: ResumeSectionDraftVariant) => void;
  onShowStructurePlan: () => void;
}

export function ResumeSectionWorkflowPanel({
  resume,
  workflow,
  candidateIntelligence,
  requirementWorkItems,
  structureConfirmed,
  currentStep,
  draftState,
  onMoveSection,
  onToggleSection,
  onAddAISection,
  onAddCustomSection,
  onRemoveCustomSection,
  onConfirmStructure,
  onGenerateDraft,
  onRefineDraft,
  onApplyVariant,
  onShowStructurePlan,
}: ResumeSectionWorkflowPanelProps) {
  if (!structureConfirmed || !currentStep) {
    return (
      <SectionPlanStep
        resume={resume}
        candidateIntelligence={candidateIntelligence}
        requirementWorkItems={requirementWorkItems}
        onMoveSection={onMoveSection}
        onToggleSection={onToggleSection}
        onAddAISection={onAddAISection}
        onAddCustomSection={onAddCustomSection}
        onRemoveCustomSection={onRemoveCustomSection}
        onContinue={onConfirmStructure}
        nextSectionTitle={workflow.steps[0]?.title}
      />
    );
  }

  return (
    <SectionDraftStep
      step={currentStep}
      draftState={draftState}
      onGenerateDraft={onGenerateDraft}
      onRefineDraft={onRefineDraft}
      onApplyVariant={onApplyVariant}
      onShowStructurePlan={onShowStructurePlan}
    />
  );
}
