import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BrainCircuit, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { CandidateIntelligence, RequirementWorkItem, ResumeDraft } from '@/types/resume-v2';
import type { ResumeCustomSectionPresetId } from '@/lib/resume-section-plan';
import {
  buildAIHighlightsSection,
  buildCustomSectionDraftSuggestions,
  buildCustomSectionPresetRecommendations,
  buildResumeSectionPlan,
  RESUME_CUSTOM_SECTION_PRESETS,
} from '@/lib/resume-section-plan';

interface ResumeStructurePlannerCardProps {
  resume: ResumeDraft;
  candidateIntelligence?: CandidateIntelligence | null;
  requirementWorkItems?: RequirementWorkItem[] | null;
  onMoveSection: (sectionId: string, direction: 'up' | 'down') => void;
  onToggleSection: (sectionId: string, enabled: boolean) => void;
  onAddAISection: () => void;
  onAddCustomSection: (title: string, lines: string[], presetId?: ResumeCustomSectionPresetId) => void;
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
  onAddCustomSection,
  onRemoveCustomSection,
}: ResumeStructurePlannerCardProps) {
  const plan = buildResumeSectionPlan(resume);
  const aiSectionCandidate = buildAIHighlightsSection(candidateIntelligence, requirementWorkItems);
  const hasAISection = plan.some((item) => item.id === 'ai_highlights');
  const recommendationList = useMemo(
    () => buildCustomSectionPresetRecommendations(candidateIntelligence, requirementWorkItems, plan.map((item) => item.id)),
    [candidateIntelligence, requirementWorkItems, plan],
  );
  const recommendationOrder = useMemo(
    () => new Map(recommendationList.map((item, index) => [item.presetId, index])),
    [recommendationList],
  );
  const [showAddSectionComposer, setShowAddSectionComposer] = useState(false);
  const [showSectionControls, setShowSectionControls] = useState(false);
  const availablePresets = useMemo(() => (
    RESUME_CUSTOM_SECTION_PRESETS
      .filter((preset) => !plan.some((item) => item.id === preset.id))
      .sort((a, b) => {
        const aOrder = recommendationOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = recommendationOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || a.title.localeCompare(b.title);
      })
  ), [plan, recommendationOrder]);
  const draftSuggestions = useMemo<Partial<Record<ResumeCustomSectionPresetId, ReturnType<typeof buildCustomSectionDraftSuggestions>>>>(() => {
    const entries = availablePresets.map((preset) => [
      preset.id,
      buildCustomSectionDraftSuggestions(candidateIntelligence, requirementWorkItems, preset.id),
    ] as const);
    return Object.fromEntries(entries) as Partial<Record<ResumeCustomSectionPresetId, ReturnType<typeof buildCustomSectionDraftSuggestions>>>;
  }, [availablePresets, candidateIntelligence, requirementWorkItems]);
  const defaultPresetId = useMemo<ResumeCustomSectionPresetId>(() => (
    availablePresets.find((preset) => (draftSuggestions[preset.id]?.length ?? 0) > 0)?.id
      ?? availablePresets[0]?.id
      ?? 'custom'
  ), [availablePresets, draftSuggestions]);
  const [selectedPresetId, setSelectedPresetId] = useState<ResumeCustomSectionPresetId>(defaultPresetId);
  const [sectionTitle, setSectionTitle] = useState('');
  const [draftText, setDraftText] = useState('');
  const selectedPreset = availablePresets.find((preset) => preset.id === selectedPresetId);
  const selectedDraftSuggestions = selectedPresetId !== 'custom'
    ? draftSuggestions[selectedPresetId] ?? []
    : [];
  const draftLines = useMemo(
    () => draftText.split('\n').map((line) => line.trim()).filter((line, index, all) => line.length > 0 && all.findIndex((candidate) => candidate.toLowerCase() === line.toLowerCase()) === index),
    [draftText],
  );
  const canAddSection = sectionTitle.trim().length > 0 && draftLines.length > 0;

  const handleSelectPreset = (presetId: ResumeCustomSectionPresetId, options?: { preserveDraft?: boolean }) => {
    setSelectedPresetId(presetId);
    if (presetId === 'custom') {
      if (!options?.preserveDraft) {
        setSectionTitle('');
        setDraftText('');
      }
      return;
    }
    const preset = RESUME_CUSTOM_SECTION_PRESETS.find((candidate) => candidate.id === presetId);
    setSectionTitle(preset?.title ?? '');
    if (!options?.preserveDraft) {
      const suggestion = buildCustomSectionDraftSuggestions(candidateIntelligence, requirementWorkItems, presetId)[0];
      setDraftText(suggestion?.lines.join('\n') ?? '');
    }
  };

  const handleOpenComposer = () => {
    const nextPresetId = defaultPresetId;
    setShowAddSectionComposer((current) => {
      const next = !current;
      if (next) {
        handleSelectPreset(nextPresetId);
      }
      return next;
    });
  };

  const handleAddSection = () => {
    if (!canAddSection) return;
    onAddCustomSection(sectionTitle.trim(), draftLines, selectedPresetId === 'custom' ? undefined : selectedPresetId);
    setDraftText('');
    setShowAddSectionComposer(false);
    const nextDefaultPreset = availablePresets.find((preset) => preset.id !== selectedPresetId && (draftSuggestions[preset.id]?.length ?? 0) > 0)?.id
      ?? availablePresets.find((preset) => preset.id !== selectedPresetId)?.id
      ?? 'custom';
    handleSelectPreset(nextDefaultPreset);
  };

  return (
    <div className="shell-panel px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow-label">Section Plan</p>
          <h3 className="mt-2 text-base font-semibold text-[var(--text-strong)]">Get the structure right first</h3>
          <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-soft)]">
            Add, hide, or move sections before you polish wording so the strongest proof shows up in the right place.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowSectionControls((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium text-[var(--text-strong)] hover:bg-[var(--surface-2)] transition-colors"
          >
            {showSectionControls ? 'Done Arranging' : 'Arrange Sections'}
          </button>
          <button
            type="button"
            onClick={handleOpenComposer}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium text-[var(--text-strong)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Section
          </button>
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
      </div>

      {showAddSectionComposer && (
        <div className="mt-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-3 sm:mt-4 sm:px-4 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-strong)]">Add a section with real content</p>
              <p className="mt-1 text-[13px] leading-5 text-[var(--text-soft)]">
                Start with a grounded mini-draft now. You can polish the section once it is in the resume.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {availablePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  selectedPresetId === preset.id
                    ? 'border-[var(--link)] bg-[var(--badge-blue-bg)] text-[var(--link)]'
                    : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-soft)] hover:text-[var(--text-strong)]'
                }`}
              >
                {preset.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleSelectPreset('custom')}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                selectedPresetId === 'custom'
                  ? 'border-[var(--link)] bg-[var(--badge-blue-bg)] text-[var(--link)]'
                  : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-soft)] hover:text-[var(--text-strong)]'
              }`}
            >
              Custom
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--text-soft)]">
            {selectedPreset?.rationale ?? 'Create a custom section when you need a focused proof area the standard resume structure does not cover.'}
          </p>
          {selectedDraftSuggestions.length > 0 && (
            <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2.5 sm:px-3.5 sm:py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">Starter drafts</p>
              <div className="mt-2 space-y-2">
                {selectedDraftSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.lines.join('|')}
                    type="button"
                    onClick={() => setDraftText(suggestion.lines.join('\n'))}
                    className="block w-full rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2.5 text-left hover:bg-[var(--surface-0)] transition-colors"
                  >
                    <div className="space-y-1">
                      {suggestion.lines.map((line) => (
                        <p key={line} className="text-sm leading-6 text-[var(--text-strong)]">• {line}</p>
                      ))}
                    </div>
                    {suggestion.support && suggestion.support.length > 0 && (
                      <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">Built from: {suggestion.support.join(' • ')}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedPresetId !== 'custom' && selectedDraftSuggestions.length === 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-[var(--line-soft)] px-3 py-2.5 text-[13px] leading-5 text-[var(--text-soft)] sm:px-3.5 sm:py-3">
              We do not have a grounded starter for this preset yet. Add it only if you can anchor it with a few concrete, truthful lines.
            </div>
          )}
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">Section Title</span>
              <input
                type="text"
                value={sectionTitle}
                onChange={(event) => setSectionTitle(event.target.value)}
                placeholder="Board & Advisory Experience"
                className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--link)]"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">Opening Lines</span>
              <textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={5}
                placeholder={'Example:\nServed as executive sponsor for a plant-network transformation that improved throughput, quality, and operating cadence.\nBuilt KPI reviews and operating rhythms that made turnaround progress visible to plant and executive leaders.'}
                className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--link)]"
              />
              <span className="text-[11px] leading-5 text-[var(--text-soft)]">
                Use one line per highlight. Each non-empty line becomes a starter bullet in the new section.
              </span>
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddSectionComposer(false)}
              className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-xs font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddSection}
              disabled={!canAddSection}
              className="rounded-lg bg-[var(--link)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Add Section
            </button>
          </div>
        </div>
      )}

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
                  {!showSectionControls && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      item.enabled
                        ? 'bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]'
                        : 'bg-[var(--surface-2)] text-[var(--text-soft)]'
                    }`}>
                      {item.enabled ? 'Included' : 'Hidden'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
                  {item.rationale ?? sectionSecondaryCopy(item.id)}
                </p>
              </div>

              {showSectionControls && (
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
              )}
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
