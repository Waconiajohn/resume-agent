import type { SessionContext } from '../context.js';
import { SECTION_ORDER_KEYS } from '../resume-guide.js';

const SECTION_ALIASES: Record<string, string> = {
  technical_expertise: 'skills',
  core_competencies: 'skills',
  technical_skills: 'skills',
  work_experience: 'experience',
  professional_experience: 'experience',
  work_history: 'experience',
  professional_summary: 'summary',
  executive_summary: 'summary',
  career_highlights: 'selected_accomplishments',
  key_achievements: 'selected_accomplishments',
};

/**
 * Check whether the given section is allowed based on the user-selected
 * design order and current section statuses.
 *
 * Returns null if the section is allowed, or a blocking message string
 * if a prerequisite section has not been completed yet.
 */
export function checkSectionOrder(rawSection: string, ctx: SessionContext): string | null {
  const section = SECTION_ALIASES[rawSection] ?? rawSection;
  const selected = ctx.designChoices.find(d => d.selected);
  const effectiveOrder: string[] = selected?.section_order?.length
    ? selected.section_order
    : [...SECTION_ORDER_KEYS];

  const confirmed = new Set(
    ctx.sectionStatuses
      .filter(s => s.status === 'confirmed' || s.status === 'proposed')
      .map(s => s.section),
  );

  const targetIdx = effectiveOrder.indexOf(section);
  if (targetIdx > 0) {
    const prev = effectiveOrder[targetIdx - 1];
    if (!confirmed.has(prev)) {
      return `BLOCKED: Complete "${prev}" before "${section}". Order: ${effectiveOrder.join(' \u2192 ')}`;
    }
  }

  return null;
}
