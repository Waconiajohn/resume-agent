import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';

export async function executeHumanizeCheck(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{
  authenticity_score: number;
  issues: Array<{ pattern: string; location: string; suggestion: string }>;
  overall_assessment: string;
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

Be specific about locations and suggest natural-sounding alternatives.`,
    messages: [
      {
        role: 'user',
        content: `Review this resume for AI-generated patterns. Score its authenticity (0-100, where 100 is fully human-sounding).

RESUME CONTENT:
${resumeContent}

Return ONLY valid JSON:
{
  "authenticity_score": 85,
  "issues": [
    {
      "pattern": "The specific AI pattern detected",
      "location": "Where in the resume (section/bullet)",
      "suggestion": "A more natural-sounding alternative"
    }
  ],
  "overall_assessment": "Brief overall assessment of how natural the resume sounds"
}`,
      },
    ],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    return {
      authenticity_score: parsed.authenticity_score ?? 50,
      issues: parsed.issues ?? [],
      overall_assessment: parsed.overall_assessment ?? '',
    };
  } catch {
    return {
      authenticity_score: 50,
      issues: [],
      overall_assessment: 'Unable to complete humanization check — please try again',
    };
  }
}
