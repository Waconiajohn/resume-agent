import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext, FitClassification, RequirementFit } from '../context.js';

export async function executeClassifyFit(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ classification: FitClassification }> {
  const requirements = input.requirements as string[];
  const resumeSummary = input.resume_summary as string;
  const resumeExperience = input.resume_experience as string;
  const resumeSkills = input.resume_skills as string;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `Classify how well this candidate matches each requirement.

RESUME:
Summary: ${resumeSummary}
Experience: ${resumeExperience}
Skills: ${resumeSkills}

REQUIREMENTS TO CLASSIFY:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Return ONLY valid JSON:
{
  "requirements": [
    {
      "requirement": "The requirement text",
      "classification": "strong" | "partial" | "gap",
      "evidence": "What in the resume supports this",
      "strategy": "For partial/gap: how to position this"
    }
  ]
}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  let reqs: RequirementFit[] = [];
  try {
    const parsed = JSON.parse(text);
    reqs = (parsed.requirements ?? []).map((r: Record<string, string>) => ({
      requirement: r.requirement,
      classification: r.classification as 'strong' | 'partial' | 'gap',
      evidence: r.evidence,
      strategy: r.strategy,
    }));
  } catch {
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
  return { classification };
}
