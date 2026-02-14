import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';

export async function executeEmitScore(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ score: number; breakdown: Record<string, number> }> {
  const sectionScore = input.section_score as number | undefined;
  const sectionName = input.section_name as string | undefined;

  // If a section-specific score is provided, update that section's status
  if (sectionName && sectionScore != null) {
    const existing = ctx.sectionStatuses.find(s => s.section === sectionName);
    if (existing) {
      existing.score = sectionScore;
    }

    emit({
      type: 'section_status',
      section: sectionName,
      status: existing?.status ?? 'pending',
      score: sectionScore,
      jd_requirements_addressed: existing?.jd_requirements_addressed ?? [],
    });
  }

  // Calculate overall score from fit classification + section scores
  let fitScore = 0;
  if (ctx.fitClassification.requirements?.length) {
    const total = ctx.fitClassification.requirements.length;
    const strong = ctx.fitClassification.strong_count ?? 0;
    const partial = ctx.fitClassification.partial_count ?? 0;
    fitScore = Math.round(((strong + partial * 0.5) / total) * 100);
  }

  let sectionAvg = 0;
  const sectionScores = ctx.sectionStatuses.filter(s => s.score != null);
  if (sectionScores.length > 0) {
    sectionAvg = Math.round(
      sectionScores.reduce((acc, s) => acc + (s.score ?? 0), 0) / sectionScores.length
    );
  }

  // Weighted: 40% fit, 60% section scores (or 100% fit if no sections yet)
  const overallScore = sectionScores.length > 0
    ? Math.round(fitScore * 0.4 + sectionAvg * 0.6)
    : fitScore;

  ctx.overallScore = overallScore;

  emit({
    type: 'score_change',
    score: overallScore,
    fit_score: fitScore,
    section_avg: sectionAvg,
  });

  return {
    score: overallScore,
    breakdown: {
      fit_score: fitScore,
      section_avg: sectionAvg,
    },
  };
}
