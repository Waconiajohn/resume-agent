import { ArrowDown, ArrowUp, BrainCircuit, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { CandidateIntelligence, RequirementWorkItem, ResumeDraft } from '@/types/resume-v2';
import { buildAIHighlightsSection, buildResumeSectionPlan } from '@/lib/resume-section-plan';

interface ResumeStructurePlannerCardProps {
  resume: ResumeDraft;
  candidateIntelligence?: CandidateIntelligence | null;
  requirementWorkItems?: RequirementWorkItem[] | null;
  onMoveSection: (sectionId: string, direction: 'up' | 'down') => void;
  onToggleSection: (sectionId: string, enabled: boolean) => void;
  onAddAISection: () => void;
  onRemoveCustomSection: (sectionId: string) => void;
}

function sectionSecondaryCopy(sectionId: string): string {
  switch (sectionId) {
    case 'executive_summary':
      return 'Lead with identity and the strongest fit story.';
    case 'core_competencies':
      return 'ATS keywords and executive themes.';
    case 'selected_accomplishments':
      return 'Best proof points above the fold.';
    case 'professional_experience':
      return 'Core evidence and credibility.';
    case 'earlier_career':
      return 'Background continuity without crowding the page.';
    case 'education':
      return 'Formal credentials and academic credibility.';
    case 'certifications':
      return 'Certifications that matter for this search.';
    case 'ai_highlights':
      return 'Optional AI transformation story for the right roles.';
    default:
      return 'Custom section for role-specific proof.';
  }
}

export function ResumeStructurePlannerCard({
  resume,
  candidateIntelligence,
  requirementWorkItems,
  onMoveSection,
  onToggleSection,
  onAddAISection,
  onRemoveCustomSection,
}: ResumeStructurePlannerCardProps) {
  const plan = buildResumeSectionPlan(resume);
  const aiSectionCandidate = buildAIHighlightsSection(candidateIntelligence, requirementWorkItems);
  const hasAISection = plan.some((item) => item.id === 'ai_highlights');

  return (
    <div className="shell-panel px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow-label">Resume Structure</p>
          <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">Choose the sections that help this resume win</h3>
          <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
            Reorder the story, hide weaker sections, and add an AI-focused section when the role calls for it.
          </p>
        </div>
        {aiSectionCandidate && !hasAISection && (
          <button
            type="button"
            onClick={onAddAISection}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium text-[var(--text-strong)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            Add AI Section
          </button>
        )}
      </div>

      {aiSectionCandidate && !hasAISection && (
        <div className="mt-3 rounded-xl border border-[var(--badge-blue-text)]/20 bg-[var(--badge-blue-bg)] px-3.5 py-3 text-[13px] text-[var(--badge-blue-text)]/90">
          <p className="font-medium text-[var(--text-strong)]">{aiSectionCandidate.title}</p>
          <p className="mt-1">
            We found AI-adjacent leadership signals in the candidate profile. Add this when the role values AI, automation, or transformation leadership.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {plan.map((item, index) => (
          <div
            key={item.id}
            className={`rounded-xl border px-3.5 py-3 transition-colors ${
              item.enabled
                ? 'border-[var(--line-soft)] bg-[var(--surface-1)]'
                : 'border-[var(--line-soft)]/70 bg-[var(--accent-muted)]/60 opacity-80'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-strong)]">{item.title}</span>
                  {item.recommended_for_job && (
                    <span className="rounded-full bg-[var(--badge-green-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--badge-green-text)]">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
                  {item.rationale ?? sectionSecondaryCopy(item.id)}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onMoveSection(item.id, 'up')}
                  disabled={index === 0}
                  className="rounded-md border border-[var(--line-soft)] p-1.5 text-[var(--text-soft)] hover:text-[var(--text-strong)] disabled:opacity-30"
                  aria-label={`Move ${item.title} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSection(item.id, 'down')}
                  disabled={index === plan.length - 1}
                  className="rounded-md border border-[var(--line-soft)] p-1.5 text-[var(--text-soft)] hover:text-[var(--text-strong)] disabled:opacity-30"
                  aria-label={`Move ${item.title} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSection(item.id, !item.enabled)}
                  className="rounded-md border border-[var(--line-soft)] p-1.5 text-[var(--text-soft)] hover:text-[var(--text-strong)]"
                  aria-label={`${item.enabled ? 'Hide' : 'Show'} ${item.title}`}
                >
                  {item.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                {item.is_custom && (
                  <button
                    type="button"
                    onClick={() => onRemoveCustomSection(item.id)}
                    className="rounded-md border border-[var(--line-soft)] p-1.5 text-[var(--text-soft)] hover:text-[var(--badge-red-text)]"
                    aria-label={`Remove ${item.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!aiSectionCandidate && !hasAISection && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-[var(--line-soft)] px-3.5 py-3 text-[13px] text-[var(--text-soft)]">
          <Plus className="mt-0.5 h-4 w-4 shrink-0" />
          No AI-specific section is recommended yet. If the role really leans on AI, we’ll need stronger evidence before we should add one.
        </div>
      )}
    </div>
  );
}
