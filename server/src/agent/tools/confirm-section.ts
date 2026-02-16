import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';

export async function executeConfirmSection(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{
  success: boolean;
  section: string;
  confirmed_count: number;
  total_count: number;
  all_sections_confirmed: boolean;
  next_action?: string;
}> {
  const section = input.section as string;

  const entry = ctx.upsertSectionStatus(section, 'confirmed');

  const confirmedCount = ctx.sectionStatuses.filter(s => s.status === 'confirmed').length;
  const totalCount = ctx.sectionStatuses.length;

  emit({
    type: 'section_status',
    section,
    status: 'confirmed',
    jd_requirements_addressed: entry.jd_requirements_addressed,
  });

  // Check if all required sections from the selected design are now confirmed
  const selectedDesign = ctx.designChoices.find(d => d.selected);
  const requiredSections = selectedDesign?.section_order ?? [];
  const confirmedSections = new Set(
    ctx.sectionStatuses.filter(s => s.status === 'confirmed').map(s => s.section),
  );
  const allConfirmed = requiredSections.length > 0 &&
    requiredSections.every(s => confirmedSections.has(s));

  return {
    success: true,
    section,
    confirmed_count: confirmedCount,
    total_count: requiredSections.length || totalCount,
    all_sections_confirmed: allConfirmed,
    next_action: allConfirmed
      ? 'ALL SECTIONS CONFIRMED. You MUST call confirm_phase_complete with next_phase="quality_review" as your VERY NEXT action. Do NOT generate any other content first.'
      : undefined,
  };
}
