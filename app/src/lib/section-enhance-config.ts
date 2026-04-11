/**
 * Section-Aware Enhancement Configuration
 *
 * Maps resume section types to their appropriate AI enhancement actions.
 * Executive summaries need different coaching than experience bullets.
 * Each section type has a default action (for auto-enhance) and a full
 * list of available actions with labels and descriptions.
 */

export type SectionType =
  | 'executive_summary'
  | 'core_competency'
  | 'selected_accomplishment'
  | 'experience_bullet'
  | 'scope_statement'
  | 'custom_section_line'
  | 'custom_section_summary';

export type EnhanceAction =
  | 'show_transformation'
  | 'demonstrate_leadership'
  | 'connect_to_role'
  | 'show_accountability';

export interface EnhanceActionConfig {
  action: EnhanceAction;
  label: string;
  description: string;
}

const EXECUTIVE_SUMMARY_ACTIONS: EnhanceActionConfig[] = [
  { action: 'connect_to_role', label: 'Sharpen Opening', description: 'Rewrite the opening to hook a hiring manager in 5 seconds' },
  { action: 'show_transformation', label: 'Add Metrics', description: 'Weave in quantified results from your background' },
  { action: 'demonstrate_leadership', label: 'Strengthen Positioning', description: 'Lead with your strategic leadership value' },
  { action: 'show_accountability', label: 'Match Role Language', description: 'Align phrasing with the target job description' },
];

const EXPERIENCE_BULLET_ACTIONS: EnhanceActionConfig[] = [
  { action: 'show_transformation', label: 'Show Impact', description: 'Emphasize the before/during/after transformation' },
  { action: 'demonstrate_leadership', label: 'Show Leadership', description: 'Foreground people leadership and team development' },
  { action: 'connect_to_role', label: 'Connect to Role', description: 'Align this bullet to the target job requirements' },
  { action: 'show_accountability', label: 'Show Scale', description: 'Emphasize ownership, budget, and accountability scope' },
];

const ACCOMPLISHMENT_ACTIONS: EnhanceActionConfig[] = [
  { action: 'show_transformation', label: 'Quantify Result', description: 'Add specific metrics and measurable outcomes' },
  { action: 'demonstrate_leadership', label: 'Show Transformation', description: 'Frame as a before-and-after story' },
  { action: 'connect_to_role', label: 'Connect to Role', description: 'Align this achievement to the target job' },
];

const COMPETENCY_ACTIONS: EnhanceActionConfig[] = [
  { action: 'connect_to_role', label: 'Match Role Language', description: 'Use exact phrasing from the job description' },
];

const SCOPE_STATEMENT_ACTIONS: EnhanceActionConfig[] = [
  { action: 'show_transformation', label: 'Show Impact', description: 'Emphasize scope and accountability' },
  { action: 'connect_to_role', label: 'Connect to Role', description: 'Align to the target job requirements' },
];

const CUSTOM_SECTION_ACTIONS: EnhanceActionConfig[] = [
  { action: 'show_transformation', label: 'Show Impact', description: 'Emphasize measurable outcomes' },
  { action: 'connect_to_role', label: 'Connect to Role', description: 'Align to the target job requirements' },
];

const SECTION_ACTIONS: Record<SectionType, EnhanceActionConfig[]> = {
  executive_summary: EXECUTIVE_SUMMARY_ACTIONS,
  core_competency: COMPETENCY_ACTIONS,
  selected_accomplishment: ACCOMPLISHMENT_ACTIONS,
  experience_bullet: EXPERIENCE_BULLET_ACTIONS,
  scope_statement: SCOPE_STATEMENT_ACTIONS,
  custom_section_line: CUSTOM_SECTION_ACTIONS,
  custom_section_summary: CUSTOM_SECTION_ACTIONS,
};

const DEFAULT_ACTIONS: Record<SectionType, EnhanceAction> = {
  executive_summary: 'connect_to_role',
  core_competency: 'connect_to_role',
  selected_accomplishment: 'show_transformation',
  experience_bullet: 'show_transformation',
  scope_statement: 'show_transformation',
  custom_section_line: 'connect_to_role',
  custom_section_summary: 'connect_to_role',
};

export function getEnhanceActionsForSection(sectionType: SectionType): EnhanceActionConfig[] {
  return SECTION_ACTIONS[sectionType] ?? EXPERIENCE_BULLET_ACTIONS;
}

export function getDefaultEnhanceAction(sectionType: SectionType): EnhanceAction {
  return DEFAULT_ACTIONS[sectionType] ?? 'show_transformation';
}

/**
 * Derive SectionType from section key and line kind.
 */
export function deriveSectionType(
  sectionKey: string,
  lineKind?: string,
): SectionType {
  if (sectionKey === 'executive_summary') return 'executive_summary';
  if (sectionKey === 'core_competencies') return 'core_competency';
  if (sectionKey === 'selected_accomplishments') return 'selected_accomplishment';
  if (lineKind === 'section_summary') return 'custom_section_summary';
  if (lineKind === 'custom_line') return 'custom_section_line';
  if (lineKind === 'competency') return 'core_competency';
  if (lineKind === 'summary') return 'executive_summary';
  if (sectionKey.startsWith('custom_section:')) return 'custom_section_line';
  // Default: experience bullet
  return 'experience_bullet';
}
