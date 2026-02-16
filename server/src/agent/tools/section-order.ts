import type { SessionContext } from '../context.js';
import { SECTION_ORDER_KEYS } from '../resume-guide.js';

/**
 * Check whether the given section is allowed based on the user-selected
 * design order and current section statuses.
 *
 * Returns null if the section is allowed, or a blocking message string
 * if a prerequisite section has not been completed yet.
 */
export function checkSectionOrder(section: string, ctx: SessionContext): string | null {
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
