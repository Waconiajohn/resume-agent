import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';

export async function executeAdversarialReview(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{
  overall_assessment: string;
  risk_flags: Array<{ flag: string; severity: string; recommendation: string }>;
  pass: boolean;
}> {
  const resumeContent = input.resume_content as string;
  const jobDescription = input.job_description as string;
  const requirements = input.requirements as string[];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are a skeptical hiring manager reviewing a resume. Find REAL weaknesses.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeContent}

REQUIREMENTS:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Return ONLY valid JSON:
{
  "overall_assessment": "2-3 sentence brutally honest first impression",
  "risk_flags": [
    { "flag": "What concerns you", "severity": "low | medium | high", "recommendation": "What to do about it" }
  ],
  "pass": true | false,
  "missing_requirements": ["Requirements not adequately addressed"],
  "strongest_points": ["What would make you want to interview this person"]
}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  let result = {
    overall_assessment: 'Unable to complete review',
    risk_flags: [] as Array<{ flag: string; severity: string; recommendation: string }>,
    pass: false,
  };

  try {
    const parsed = JSON.parse(text);
    result = {
      overall_assessment: parsed.overall_assessment ?? result.overall_assessment,
      risk_flags: parsed.risk_flags ?? [],
      pass: parsed.pass ?? false,
    };
  } catch {
    // Use defaults
  }

  ctx.adversarialReview = {
    overall_assessment: result.overall_assessment,
    risk_flags: result.risk_flags.map((f) => ({
      flag: f.flag,
      severity: f.severity as 'low' | 'medium' | 'high',
      recommendation: f.recommendation,
    })),
    pass: result.pass,
  };

  return result;
}
