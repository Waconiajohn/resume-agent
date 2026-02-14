import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';

export async function executeAtsCheck(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{
  ats_score: number;
  keyword_matches: Array<{ keyword: string; found: boolean; context?: string }>;
  format_issues: string[];
  recommendations: string[];
}> {
  const resumeContent = input.resume_content as string;

  const jdKeywords = [
    ...(ctx.jdAnalysis.must_haves ?? []),
    ...(ctx.jdAnalysis.nice_to_haves ?? []),
  ];

  const benchmarkKeywords = ctx.benchmarkCandidate?.language_keywords ?? [];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Perform a detailed ATS (Applicant Tracking System) compatibility check on this resume.

RESUME CONTENT:
${resumeContent}

JD KEYWORDS TO CHECK:
${jdKeywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

ADDITIONAL KEYWORDS TO ECHO:
${benchmarkKeywords.join(', ')}

Check for:
1. Keyword presence and density — are the key terms from the JD present?
2. Format compatibility — section headers, date formats, bullet structure
3. ATS-unfriendly elements — tables, images, special characters, unusual formatting
4. Keyword context — are keywords used in meaningful context or just stuffed?

Return ONLY valid JSON:
{
  "ats_score": 85,
  "keyword_matches": [
    {
      "keyword": "The keyword from the JD",
      "found": true,
      "context": "Where/how it appears in the resume"
    }
  ],
  "format_issues": ["Any formatting problems for ATS"],
  "recommendations": ["Specific actions to improve ATS score"]
}`,
      },
    ],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(jsonText);
    return {
      ats_score: parsed.ats_score ?? 50,
      keyword_matches: parsed.keyword_matches ?? [],
      format_issues: parsed.format_issues ?? [],
      recommendations: parsed.recommendations ?? [],
    };
  } catch {
    return {
      ats_score: 50,
      keyword_matches: [],
      format_issues: [],
      recommendations: ['Unable to complete ATS check — please try again'],
    };
  }
}
