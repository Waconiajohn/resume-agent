import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';

export async function executeUpdateRequirementStatus(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ success: boolean; updated_requirement: string; new_classification: string }> {
  const requirement = input.requirement as string;
  const newClassification = input.new_classification as 'strong' | 'partial' | 'gap';
  const evidence = (input.evidence as string) || '';

  // Update the requirement in fitClassification
  if (ctx.fitClassification.requirements) {
    const req = ctx.fitClassification.requirements.find(
      (r) => r.requirement.toLowerCase() === requirement.toLowerCase()
    );
    if (req) {
      const oldClassification = req.classification;
      req.classification = newClassification;
      if (evidence) req.evidence = evidence;

      // Recalculate counts
      ctx.fitClassification.strong_count = ctx.fitClassification.requirements.filter(r => r.classification === 'strong').length;
      ctx.fitClassification.partial_count = ctx.fitClassification.requirements.filter(r => r.classification === 'partial').length;
      ctx.fitClassification.gap_count = ctx.fitClassification.requirements.filter(r => r.classification === 'gap').length;

      // Emit updated gap analysis to right panel
      emit({
        type: 'right_panel_update',
        panel_type: 'gap_analysis',
        data: {
          requirements: ctx.fitClassification.requirements,
          strong_count: ctx.fitClassification.strong_count,
          partial_count: ctx.fitClassification.partial_count,
          gap_count: ctx.fitClassification.gap_count,
          total: ctx.fitClassification.requirements.length,
          addressed: ctx.fitClassification.strong_count,
        },
      });

      return {
        success: true,
        updated_requirement: requirement,
        new_classification: newClassification,
      };
    }
  }

  return {
    success: false,
    updated_requirement: requirement,
    new_classification: newClassification,
  };
}
