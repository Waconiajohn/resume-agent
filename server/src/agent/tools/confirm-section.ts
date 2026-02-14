import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';

export async function executeConfirmSection(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ success: boolean; section: string; confirmed_count: number; total_count: number }> {
  const section = input.section as string;

  const existing = ctx.sectionStatuses.find(s => s.section === section);
  if (existing) {
    existing.status = 'confirmed';
  } else {
    ctx.sectionStatuses.push({
      section,
      status: 'confirmed',
      jd_requirements_addressed: [],
    });
  }

  const confirmedCount = ctx.sectionStatuses.filter(s => s.status === 'confirmed').length;
  const totalCount = ctx.sectionStatuses.length;

  emit({
    type: 'section_status',
    section,
    status: 'confirmed',
    jd_requirements_addressed: existing?.jd_requirements_addressed ?? [],
  });

  return {
    success: true,
    section,
    confirmed_count: confirmedCount,
    total_count: totalCount,
  };
}
