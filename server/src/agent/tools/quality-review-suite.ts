import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { executeAdversarialReview } from './adversarial-review.js';
import { executeHumanizeCheck } from './humanize-check.js';

export async function executeQualityReviewSuite(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{
  adversarial: Awaited<ReturnType<typeof executeAdversarialReview>>;
  humanize: Awaited<ReturnType<typeof executeHumanizeCheck>>;
}> {
  // Run both checks in parallel — each emits progressive panel updates independently
  const [adversarial, humanize] = await Promise.all([
    executeAdversarialReview(input, ctx, emit),
    executeHumanizeCheck(input, ctx, emit),
  ]);

  // Final combined panel emit with all data merged
  emit({
    type: 'right_panel_update',
    panel_type: 'quality_dashboard',
    data: ctx.qualityDashboardData,
  });

  return { adversarial, humanize };
}
