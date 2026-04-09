import { ResumeStructurePlannerCard } from '@/components/resume-v2/cards/ResumeStructurePlannerCard';
import type { CandidateIntelligence, RequirementWorkItem, ResumeDraft } from '@/types/resume-v2';
import type { ResumeCustomSectionPresetId } from '@/lib/resume-section-plan';

interface SectionPlanStepProps {
  resume: ResumeDraft;
  candidateIntelligence?: CandidateIntelligence | null;
  requirementWorkItems?: RequirementWorkItem[] | null;
  onMoveSection: (sectionId: string, direction: 'up' | 'down') => void;
  onToggleSection: (sectionId: string, enabled: boolean) => void;
  onAddAISection: () => void;
  onAddCustomSection: (title: string, lines: string[], presetId?: ResumeCustomSectionPresetId) => void;
  onRemoveCustomSection: (sectionId: string) => void;
  onContinue: () => void;
  nextSectionTitle?: string;
}

export function SectionPlanStep({
  resume,
  candidateIntelligence,
  requirementWorkItems,
  onMoveSection,
  onToggleSection,
  onAddAISection,
  onAddCustomSection,
  onRemoveCustomSection,
  onContinue,
  nextSectionTitle,
}: SectionPlanStepProps) {
  return (
    <div className="space-y-4">
      <ResumeStructurePlannerCard
        resume={resume}
        candidateIntelligence={candidateIntelligence}
        requirementWorkItems={requirementWorkItems}
        onMoveSection={onMoveSection}
        onToggleSection={onToggleSection}
        onAddAISection={onAddAISection}
        onAddCustomSection={onAddCustomSection}
        onRemoveCustomSection={onRemoveCustomSection}
      />

      <div className="shell-panel px-4 py-4">
        <p className="eyebrow-label">Next</p>
        <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">
          {nextSectionTitle ? `Start with ${nextSectionTitle}` : 'Start editing from the top'}
        </h3>
        <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
          Once the sections look right, we will move top to bottom through the resume and improve each section in order.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-4 rounded-lg bg-[var(--link)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-95"
        >
          Continue to editing
        </button>
      </div>
    </div>
  );
}
