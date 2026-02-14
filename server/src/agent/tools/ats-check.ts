import { anthropic, MODEL } from '../../lib/anthropic.js';
import type { SessionContext } from '../context.js';
import { ATS_FORMATTING_RULES } from '../resume-guide.js';

export async function executeAtsCheck(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{
  ats_score: number;
  keyword_matches: Array<{ keyword: string; found: boolean; context?: string }>;
  format_issues: string[];
  recommendations: string[];
  keyword_coverage_pct: number;
  section_header_issues: string[];
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
        content: `Perform a detailed ATS (Applicant Tracking System) compatibility check on this resume using expert formatting standards.

${ATS_FORMATTING_RULES}

RESUME CONTENT:
${resumeContent}

JD KEYWORDS TO CHECK:
${jdKeywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}

ADDITIONAL KEYWORDS TO ECHO:
${benchmarkKeywords.join(', ')}

Check for:
1. Keyword presence and density — target 60-80% coverage of JD keywords
2. Keyword placement by section — 3-5 in summary, 10-15 in skills, naturally in experience bullets
3. Format compatibility — section headers must use standard terms (see rules above)
4. ATS-unfriendly elements — tables, images, special characters, unusual formatting
5. Keyword context — keywords must be used in meaningful context, not stuffed
6. Section header compliance — compare against the standard terms listed above

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
  "recommendations": ["Specific actions to improve ATS score"],
  "keyword_coverage_pct": 72,
  "section_header_issues": ["Any non-standard section headers that should be renamed"]
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
      keyword_coverage_pct: parsed.keyword_coverage_pct ?? 0,
      section_header_issues: parsed.section_header_issues ?? [],
    };
  } catch {
    return {
      ats_score: 50,
      keyword_matches: [],
      format_issues: [],
      recommendations: ['Unable to complete ATS check — please try again'],
      keyword_coverage_pct: 0,
      section_header_issues: [],
    };
  }
}
