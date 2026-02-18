import { llm, MODEL_MID } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type { SessionContext, FitClassification, RequirementFit } from '../context.js';
import type { SSEEmitter } from '../loop.js';

/**
 * Normalize classification values from LLM output.
 * Z.AI models may return "Strong", "Strong Match", "strong_match", etc.
 */
function normalizeClassification(raw: unknown): 'strong' | 'partial' | 'gap' {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'strong' || s.includes('strong') || s.includes('exceptional') || s.includes('excellent') || s.includes('direct')) return 'strong';
  if (s === 'partial' || s.includes('partial') || s.includes('moderate') || s.includes('related') || s.includes('meet') || s.includes('indirect') || s.includes('strengthen')) return 'partial';
  return 'gap';
}

export async function executeClassifyFit(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ classification: FitClassification }> {
  const requirements = input.requirements as string[];
  const resumeSummary = input.resume_summary as string;
  const resumeExperience = input.resume_experience as string;
  const resumeSkills = input.resume_skills as string;

  // Build benchmark context for prioritized classification
  const benchmarkContext = ctx.benchmarkCandidate
    ? `BENCHMARK CANDIDATE PROFILE:
Ideal candidate: ${ctx.benchmarkCandidate.ideal_candidate_summary}
Experience expectations: ${ctx.benchmarkCandidate.experience_expectations}
Culture fit traits: ${ctx.benchmarkCandidate.culture_fit_traits.join(', ')}
Communication style: ${ctx.benchmarkCandidate.communication_style}
Language keywords to echo: ${ctx.benchmarkCandidate.language_keywords.join(', ')}
Prioritized requirements:
${ctx.benchmarkCandidate.required_skills.map(s => `- [${s.importance.toUpperCase()}] ${s.requirement} (${s.category})`).join('\n')}`
    : '';

  const response = await llm.chat({
    model: MODEL_MID,
    max_tokens: 8192,
    system: '',
    messages: [
      {
        role: 'user',
        content: `Classify how well this candidate matches each requirement. Use the benchmark profile to assign importance levels and inform positioning strategies with the company's language keywords.

RESUME:
Summary: ${resumeSummary}
Experience: ${resumeExperience}
Skills: ${resumeSkills}

${benchmarkContext ? `${benchmarkContext}\n` : ''}REQUIREMENTS TO CLASSIFY:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

For each requirement, classify the match strength AND assign an importance level based on the benchmark profile. Use the benchmark's language keywords in strategy suggestions. Prioritize critical requirements.

Return ONLY valid JSON:
{
  "requirements": [
    {
      "requirement": "The requirement text",
      "classification": "strong" | "partial" | "gap",
      "importance": "critical" | "important" | "nice_to_have",
      "evidence": "What in the resume supports this",
      "strategy": "For partial/gap: how to position this using the company's language keywords"
    }
  ]
}`,
      },
    ],
  });

  const text = response.text;

  let reqs: RequirementFit[] = [];
  const parsed = repairJSON<{ requirements?: Array<Record<string, string>> }>(text);
  if (parsed?.requirements) {
    reqs = parsed.requirements.map((r) => ({
      requirement: r.requirement,
      classification: normalizeClassification(r.classification ?? r.status ?? r.match),
      importance: (r.importance as 'critical' | 'important' | 'nice_to_have') || undefined,
      evidence: r.evidence,
      strategy: r.strategy,
    }));

    const strong = reqs.filter(r => r.classification === 'strong').length;
    const partial = reqs.filter(r => r.classification === 'partial').length;
    const gap = reqs.filter(r => r.classification === 'gap').length;
    logger.info({ strong, partial, gap, total: reqs.length }, 'Classify-fit classification counts');
  } else {
    logger.warn(
      { rawSnippet: text.substring(0, 500), parsedKeys: parsed ? Object.keys(parsed) : null },
      'Classify-fit JSON parse failed — falling back to all-gap',
    );
    reqs = requirements.map((r) => ({
      requirement: r,
      classification: 'gap' as const,
      evidence: 'Unable to analyze — please try again',
    }));
  }

  const classification: FitClassification = {
    requirements: reqs,
    strong_count: reqs.filter((r) => r.classification === 'strong').length,
    partial_count: reqs.filter((r) => r.classification === 'partial').length,
    gap_count: reqs.filter((r) => r.classification === 'gap').length,
  };

  ctx.fitClassification = classification;

  // Auto-emit gap analysis to right panel so it populates immediately
  emit({
    type: 'right_panel_update',
    panel_type: 'gap_analysis',
    data: {
      requirements: reqs,
      strong_count: classification.strong_count,
      partial_count: classification.partial_count,
      gap_count: classification.gap_count,
      total: reqs.length,
      addressed: classification.strong_count,
    },
  });

  return { classification };
}
