import { anthropic, MODEL, extractResponseText } from '../../lib/anthropic.js';
import { repairJSON } from '../../lib/json-repair.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { RESUME_ANTI_PATTERNS } from '../resume-guide.js';

export async function executeHumanizeCheck(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{
  authenticity_score: number;
  issues: Array<{ pattern: string; location: string; suggestion: string }>;
  overall_assessment: string;
  age_sensitive_flags: string[];
}> {
  const resumeContent = input.resume_content as string;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `You are an expert at detecting AI-generated text patterns. Your job is to review resume content and identify anything that sounds artificially generated rather than authentically human. Look for:

- Uniform sentence structure (all sentences follow the same pattern)
- Generic buzzwords without specificity ("leveraged", "spearheaded", "drove innovation")
- Overly parallel lists (every bullet starts the same way)
- Lack of natural variation in tone and complexity
- Perfect grammar everywhere (real humans make small stylistic choices)
- Absence of personality or voice
- Too many quantified metrics in a row without narrative
- Corporate-speak that no human would naturally write

Be specific about locations and suggest natural-sounding alternatives.

${RESUME_ANTI_PATTERNS}`,
    messages: [
      {
        role: 'user',
        content: `Review this resume for AI-generated patterns AND resume-specific anti-patterns. Score its authenticity (0-100, where 100 is fully human-sounding).

Pay special attention to these cliches (flag every occurrence):
- "results-oriented leader," "proven track record," "team player"
- "responsible for" (should be replaced with strong action verbs)
- "helped with," "assisted in," "worked on"
- "dynamic leader," "seasoned professional," "self-starter"

Also flag age-sensitive signals separately:
- Graduation years from 20+ years ago
- "30+ years of experience" or similar
- Obsolete technology references
- "References available upon request"

RESUME CONTENT:
${resumeContent}

Return ONLY valid JSON:
{
  "authenticity_score": 85,
  "issues": [
    {
      "pattern": "The specific AI pattern or anti-pattern detected",
      "location": "Where in the resume (section/bullet)",
      "suggestion": "A more natural-sounding alternative"
    }
  ],
  "overall_assessment": "Brief overall assessment of how natural the resume sounds",
  "age_sensitive_flags": ["Any age-bias signals found, listed separately"]
}`,
      },
    ],
  });

  const rawText = extractResponseText(response);

  const parsed = repairJSON<Record<string, unknown>>(rawText);
  let result = {
    authenticity_score: 50,
    issues: [] as Array<{ pattern: string; location: string; suggestion: string }>,
    overall_assessment: 'Unable to complete humanization check — please try again',
    age_sensitive_flags: [] as string[],
  };

  if (parsed) {
    result = {
      authenticity_score: (parsed.authenticity_score as number) ?? 50,
      issues: (parsed.issues as Array<{ pattern: string; location: string; suggestion: string }>) ?? [],
      overall_assessment: (parsed.overall_assessment as string) ?? '',
      age_sensitive_flags: (parsed.age_sensitive_flags as string[]) ?? [],
    };
  }

  // Progressive quality dashboard emit
  ctx.qualityDashboardData = {
    ...ctx.qualityDashboardData,
    authenticity_score: result.authenticity_score,
  };
  emit({
    type: 'right_panel_update',
    panel_type: 'quality_dashboard',
    data: ctx.qualityDashboardData,
  });

  return result;
}
