import type { ResumeWorkflowSectionStepViewModel, ResumeWorkflowStepKind } from '@/lib/resume-section-workflow';

export type SectionRefineActionId =
  | 'make_stronger'
  | 'make_shorter'
  | 'more_role_specific'
  | 'more_conservative'
  | 'stronger_opening'
  | 'more_executive'
  | 'add_business_impact'
  | 'show_leadership'
  | 'lead_with_proof'
  | 'show_ownership'
  | 'add_clearer_proof'
  | 'translate_to_job'
  | 'less_generic';

export interface SectionRefineActionOption {
  id: SectionRefineActionId;
  label: string;
}

const PRIMARY_ACTIONS: SectionRefineActionOption[] = [
  { id: 'make_stronger', label: 'Make it stronger' },
  { id: 'make_shorter', label: 'Make it shorter' },
  { id: 'more_role_specific', label: 'Make it more role-specific' },
];

const EXEC_SUMMARY_SECONDARY: SectionRefineActionOption[] = [
  { id: 'stronger_opening', label: 'Write a stronger opening' },
  { id: 'more_executive', label: 'Make it more executive' },
  { id: 'more_conservative', label: 'Make it more conservative' },
  { id: 'add_business_impact', label: 'Add stronger business impact' },
  { id: 'show_leadership', label: 'Show leadership more clearly' },
];

const ACCOMPLISHMENTS_SECONDARY: SectionRefineActionOption[] = [
  { id: 'lead_with_proof', label: 'Lead with stronger proof' },
  { id: 'add_clearer_proof', label: 'Add clearer business impact' },
  { id: 'translate_to_job', label: 'Translate this to the job' },
  { id: 'less_generic', label: 'Make it less generic' },
  { id: 'more_conservative', label: 'Make it more conservative' },
];

const EXPERIENCE_SECONDARY: SectionRefineActionOption[] = [
  { id: 'show_ownership', label: 'Show ownership more clearly' },
  { id: 'add_clearer_proof', label: 'Add clearer proof' },
  { id: 'translate_to_job', label: 'Translate this to the job' },
  { id: 'less_generic', label: 'Make it less generic' },
  { id: 'more_conservative', label: 'Make it more conservative' },
];

const COMPETENCIES_SECONDARY: SectionRefineActionOption[] = [
  { id: 'translate_to_job', label: 'Match the job more closely' },
  { id: 'less_generic', label: 'Remove generic phrases' },
  { id: 'make_shorter', label: 'Keep only the strongest keywords' },
  { id: 'more_conservative', label: 'Keep it more conservative' },
];

export function getSectionRefineActions(kind: ResumeWorkflowStepKind): {
  primary: SectionRefineActionOption[];
  secondary: SectionRefineActionOption[];
  editorAssist: SectionRefineActionOption[];
} {
  const secondary = (() => {
    switch (kind) {
      case 'executive_summary':
        return EXEC_SUMMARY_SECONDARY;
      case 'selected_accomplishments':
        return ACCOMPLISHMENTS_SECONDARY;
      case 'experience_role':
      case 'custom_section':
        return EXPERIENCE_SECONDARY;
      case 'core_competencies':
        return COMPETENCIES_SECONDARY;
      default:
        return EXPERIENCE_SECONDARY;
    }
  })();

  return {
    primary: PRIMARY_ACTIONS,
    secondary,
    editorAssist: [
      { id: 'make_shorter', label: 'Shorter' },
      { id: 'make_stronger', label: 'Sharper' },
      { id: 'more_role_specific', label: 'More role-specific' },
      { id: 'more_conservative', label: 'More conservative' },
    ],
  };
}

function sectionLabel(step: ResumeWorkflowSectionStepViewModel): string {
  switch (step.kind) {
    case 'executive_summary':
      return 'executive summary';
    case 'selected_accomplishments':
      return 'selected accomplishments section';
    case 'experience_role':
      return 'experience section';
    case 'core_competencies':
      return 'core competencies section';
    case 'custom_section':
    default:
      return 'resume section';
  }
}

function joinRequirements(step: ResumeWorkflowSectionStepViewModel): string {
  const requirements = step.topRequirements.map((entry) => entry.requirement).filter(Boolean);
  if (requirements.length === 0) return 'the most important role needs already visible in this section';
  if (requirements.length === 1) return requirements[0]!;
  return `${requirements.slice(0, -1).join(', ')}, and ${requirements[requirements.length - 1]}`;
}

export function buildSectionRefineInstruction(
  step: ResumeWorkflowSectionStepViewModel,
  actionId: SectionRefineActionId,
): string {
  const requirementFocus = joinRequirements(step);
  const label = sectionLabel(step);
  const title = step.title;

  const sharedRules = [
    `Rewrite the full ${label}.`,
    `Keep it grounded in the existing evidence and the job fit for ${title}.`,
    'Do not return commentary, bullets about the edit, or helper labels.',
    'Return one finished replacement for the whole section only.',
  ].join(' ');

  switch (actionId) {
    case 'make_stronger':
      return `${sharedRules} Make it hit harder with clearer ownership, sharper wording, and stronger executive voice. Preserve defensible facts and keep ${requirementFocus} visible.`;
    case 'make_shorter':
      return `${sharedRules} Make it tighter and shorter. Cut filler, repetition, and soft phrasing while preserving the strongest proof and the key fit for ${requirementFocus}.`;
    case 'more_role_specific':
      return `${sharedRules} Make it feel more specific to this target role. Mirror the job language naturally and make ${requirementFocus} more obvious without adding unsupported claims.`;
    case 'more_conservative':
      return `${sharedRules} Make it more conservative and more interview-defensible. Dial back stretch language, keep the strongest proof, and avoid anything that could sound overstated.`;
    case 'stronger_opening':
      return `${sharedRules} Rewrite the opening sentence first so it immediately establishes identity, fit, and value. Then make sure the rest of the section flows naturally from that stronger opening. Avoid generic opener patterns.`;
    case 'more_executive':
      return `${sharedRules} Make the voice more senior, board-ready, and executive. Reduce tactical clutter and bring out leadership, scope, and business relevance.`;
    case 'add_business_impact':
      return `${sharedRules} Bring business impact forward. Emphasize outcomes, revenue, growth, efficiency, or customer value already supported by the current evidence.`;
    case 'show_leadership':
      return `${sharedRules} Make leadership more visible. Bring out ownership, influence, team scope, cross-functional leadership, or decision-making already supported by the section context.`;
    case 'lead_with_proof':
      return `${sharedRules} Reorder and rewrite so the strongest proof shows up first. Lead with the most credible evidence for ${requirementFocus}.`;
    case 'show_ownership':
      return `${sharedRules} Make personal ownership clearer. Show what this candidate personally led, drove, or owned instead of letting the wording stay passive or generic.`;
    case 'add_clearer_proof':
      return `${sharedRules} Add clearer proof where the evidence already supports it. Prefer concrete outcomes, scope, cadence, or credibility signals over broad claims.`;
    case 'translate_to_job':
      return `${sharedRules} Translate the experience into the language of this job more directly. Make it easy for a recruiter to connect the section to ${requirementFocus}.`;
    case 'less_generic':
      return `${sharedRules} Remove generic resume phrasing, vague traits, and corporate filler. Make the wording more specific, credible, and human.`;
    default:
      return `${sharedRules} Make it clearer, sharper, and more useful for this role.`;
  }
}

export function getSectionRefineActionLabel(actionId: SectionRefineActionId): string {
  return (
    [...PRIMARY_ACTIONS, ...EXEC_SUMMARY_SECONDARY, ...ACCOMPLISHMENTS_SECONDARY, ...EXPERIENCE_SECONDARY, ...COMPETENCIES_SECONDARY]
      .find((action) => action.id === actionId)?.label
    ?? 'Refine draft'
  );
}
