/**
 * Curated question/prompt template bank for resume section suggestions.
 *
 * Maps gap/evidence/keyword scenarios to user-facing questions and safe revision prompts.
 * Templates use {{placeholder}} syntax — call interpolate() before displaying.
 */

import type { SuggestionIntent } from './types.js';

export interface SuggestionTemplate {
  intent: SuggestionIntent;
  /** Sections this template applies to. Use '*' for any section. */
  section_match: string[];
  scenario:
    | 'requirement_gap'
    | 'requirement_partial'
    | 'unused_evidence'
    | 'keyword_missing'
    | 'no_metrics'
    | 'weak_verbs'
    | 'positioning_misaligned'
    | 'too_long'
    | 'too_short';
  /** User-facing question shown in the workbench. Supports {{placeholder}} tokens. */
  question_template: string;
  /** Safe revision prompt sent to the LLM. Supports {{placeholder}} tokens. */
  revision_template: string;
  option_labels?: { apply: string; skip: string };
  /** Added to the base priority score when selecting suggestions. */
  priority_boost: number;
}

export const SUGGESTION_TEMPLATES: SuggestionTemplate[] = [
  // ─── Summary × requirement_gap ───────────────────────────────────────────
  {
    intent: 'address_requirement',
    section_match: ['summary'],
    scenario: 'requirement_gap',
    question_template:
      "The JD emphasizes '{{requirement}}' but your summary doesn't signal this. Want to address it?",
    revision_template:
      "Naturally weave the requirement '{{requirement}}' into the summary, demonstrating relevant capability without forcing it",
    option_labels: { apply: 'Yes, address it', skip: 'Skip' },
    priority_boost: 3,
  },

  // ─── Summary × positioning_misaligned ────────────────────────────────────
  {
    intent: 'align_positioning',
    section_match: ['summary'],
    scenario: 'positioning_misaligned',
    question_template:
      "Your summary doesn't echo your positioning angle: '{{angle}}'. Strengthen the alignment?",
    revision_template:
      "Strengthen alignment with the positioning angle '{{angle}}' — ensure the summary clearly signals this strategic narrative",
    option_labels: { apply: 'Align it', skip: 'Skip' },
    priority_boost: 0,
  },

  // ─── Summary × keyword_missing ───────────────────────────────────────────
  {
    intent: 'integrate_keyword',
    section_match: ['summary'],
    scenario: 'keyword_missing',
    question_template:
      "The keyword '{{keyword}}' appears in the JD but not your summary. Integrate it?",
    revision_template:
      "Naturally integrate the keyword '{{keyword}}' into the summary",
    option_labels: { apply: 'Add it', skip: 'Skip' },
    priority_boost: 1,
  },

  // ─── Summary × too_long ──────────────────────────────────────────────────
  {
    intent: 'tighten',
    section_match: ['summary'],
    scenario: 'too_long',
    question_template:
      'This summary is {{word_count}} words. Executive summaries work best at 3-4 lines. Tighten?',
    revision_template:
      'Tighten the summary to 3-4 impactful lines maximum — cut anything that doesn\'t add unique value',
    option_labels: { apply: 'Tighten', skip: 'Skip' },
    priority_boost: 0,
  },

  // ─── Experience × requirement_gap ────────────────────────────────────────
  {
    intent: 'address_requirement',
    section_match: ['experience'],
    scenario: 'requirement_gap',
    question_template:
      "The JD requires '{{requirement}}' — this role could demonstrate it. Address it here?",
    revision_template:
      "Address the requirement '{{requirement}}' in this experience section by highlighting relevant accomplishments and responsibilities",
    option_labels: { apply: 'Yes, address it', skip: 'Skip' },
    priority_boost: 3,
  },

  // ─── Experience × requirement_partial ────────────────────────────────────
  {
    intent: 'address_requirement',
    section_match: ['experience'],
    scenario: 'requirement_partial',
    question_template:
      "You have partial evidence for '{{requirement}}'. Strengthen it in this role?",
    revision_template:
      "Strengthen the evidence for '{{requirement}}' — add specifics that demonstrate depth, scope, or measurable outcomes",
    option_labels: { apply: 'Yes, address it', skip: 'Skip' },
    priority_boost: 2,
  },

  // ─── Experience × unused_evidence ────────────────────────────────────────
  {
    intent: 'weave_evidence',
    section_match: ['experience'],
    scenario: 'unused_evidence',
    question_template:
      "Your {{result_excerpt}} achievement isn't reflected in this role. Weave it in?",
    revision_template:
      "Weave in this evidence: {{result_excerpt}}. Connect it naturally to this role's responsibilities and impact",
    option_labels: { apply: 'Weave it in', skip: 'Skip' },
    priority_boost: 1,
  },

  // ─── Experience × no_metrics ─────────────────────────────────────────────
  {
    intent: 'quantify_bullet',
    section_match: ['experience'],
    scenario: 'no_metrics',
    question_template:
      'This bullet describes what you did but not the impact. Add a metric?',
    revision_template:
      'Add specific metrics to quantify the impact — revenue, team size, growth percentages, cost savings, or timeline improvements',
    option_labels: { apply: 'Add metrics', skip: 'Skip' },
    priority_boost: 0,
  },

  // ─── Experience × keyword_missing ────────────────────────────────────────
  {
    intent: 'integrate_keyword',
    section_match: ['experience'],
    scenario: 'keyword_missing',
    question_template:
      "The keyword '{{keyword}}' is in the JD but missing from this role. Add it naturally?",
    revision_template:
      "Naturally integrate the keyword '{{keyword}}' into this experience section",
    option_labels: { apply: 'Add it', skip: 'Skip' },
    priority_boost: 1,
  },

  // ─── Experience × weak_verbs ─────────────────────────────────────────────
  {
    intent: 'strengthen_verb',
    section_match: ['experience'],
    scenario: 'weak_verbs',
    question_template:
      'Some bullets start with passive language. Strengthen with executive action verbs?',
    revision_template:
      'Replace weak or passive verbs with strong executive action verbs that convey leadership and impact',
    option_labels: { apply: 'Strengthen', skip: 'Skip' },
    priority_boost: 0,
  },

  // ─── Skills × keyword_missing ────────────────────────────────────────────
  {
    intent: 'integrate_keyword',
    section_match: ['skills'],
    scenario: 'keyword_missing',
    question_template:
      "The keyword '{{keyword}}' appears in the JD but not your skills. Add it?",
    revision_template:
      "Add the skill '{{keyword}}' to the most relevant category in the skills section",
    option_labels: { apply: 'Add it', skip: 'Skip' },
    priority_boost: 1,
  },

  // ─── Skills × requirement_partial ────────────────────────────────────────
  {
    intent: 'address_requirement',
    section_match: ['skills'],
    scenario: 'requirement_partial',
    question_template:
      "You have partial evidence for '{{requirement}}'. Strengthen it in your skill groupings?",
    revision_template:
      "Strengthen skill groupings to better address '{{requirement}}' — reorganize or add relevant skills",
    option_labels: { apply: 'Yes, address it', skip: 'Skip' },
    priority_boost: 2,
  },

  // ─── Education × too_long ────────────────────────────────────────────────
  {
    intent: 'tighten',
    section_match: ['education'],
    scenario: 'too_long',
    question_template:
      'Education sections should be concise. Tighten to essentials?',
    revision_template:
      'Tighten the education section to essential credentials only — remove verbose descriptions',
    option_labels: { apply: 'Tighten', skip: 'Skip' },
    priority_boost: 0,
  },

  // ─── * × weak_verbs ──────────────────────────────────────────────────────
  {
    intent: 'strengthen_verb',
    section_match: ['*'],
    scenario: 'weak_verbs',
    question_template:
      'Some bullets use passive language. Strengthen with executive action verbs?',
    revision_template:
      'Replace weak or passive verbs with strong executive action verbs that convey leadership and impact',
    option_labels: { apply: 'Strengthen', skip: 'Skip' },
    priority_boost: 0,
  },

  // ─── * × too_long ────────────────────────────────────────────────────────
  {
    intent: 'tighten',
    section_match: ['*'],
    scenario: 'too_long',
    question_template:
      'This section is {{word_count}} words. The target is {{target}}. Tighten?',
    revision_template:
      'Tighten this section — remove filler words and make every word earn its place. Target: {{target}} words',
    option_labels: { apply: 'Tighten', skip: 'Skip' },
    priority_boost: 0,
  },

  // ─── * × no_metrics ──────────────────────────────────────────────────────
  {
    intent: 'quantify_bullet',
    section_match: ['*'],
    scenario: 'no_metrics',
    question_template:
      'This section lacks quantified impact. Add metrics where possible?',
    revision_template:
      'Add specific metrics and numbers to quantify achievements — make the impact concrete and credible',
    option_labels: { apply: 'Add metrics', skip: 'Skip' },
    priority_boost: 0,
  },
];

/**
 * Find all templates that match a given intent and section name.
 *
 * Section-specific templates take precedence — '*' templates are returned only
 * when no section-specific match exists for the same intent.
 */
export function findTemplates(
  intent: SuggestionIntent,
  section: string,
): SuggestionTemplate[] {
  const normalized = section.toLowerCase().replace(/-/g, '_');

  const specific = SUGGESTION_TEMPLATES.filter(
    (t) =>
      !t.section_match.includes('*') &&
      t.section_match.some((s) => normalized.startsWith(s)) &&
      t.intent === intent,
  );

  if (specific.length > 0) return specific;

  // Fall back to wildcard templates for this intent
  return SUGGESTION_TEMPLATES.filter(
    (t) => t.section_match.includes('*') && t.intent === intent,
  );
}

/**
 * Replace {{placeholder}} tokens in a template string with values from vars.
 * Missing keys are replaced with an empty string.
 */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}
