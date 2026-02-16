import { anthropic, MODEL, extractResponseText } from '../../lib/anthropic.js';
import { repairJSON } from '../../lib/json-repair.js';
import type { SessionContext } from '../context.js';
import type { SSEEmitter } from '../loop.js';
import { ATS_FORMATTING_RULES } from '../resume-guide.js';

export async function executeAtsCheck(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
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

  const rawText = extractResponseText(response);

  const parsed = repairJSON<Record<string, unknown>>(rawText);
  let result = {
    ats_score: 50,
    keyword_matches: [] as Array<{ keyword: string; found: boolean; context?: string }>,
    format_issues: [] as string[],
    recommendations: ['Unable to complete ATS check — please try again'],
    keyword_coverage_pct: 0,
    section_header_issues: [] as string[],
  };

  if (parsed) {
    result = {
      ats_score: (parsed.ats_score as number) ?? 50,
      keyword_matches: (parsed.keyword_matches as Array<{ keyword: string; found: boolean; context?: string }>) ?? [],
      format_issues: (parsed.format_issues as string[]) ?? [],
      recommendations: (parsed.recommendations as string[]) ?? [],
      keyword_coverage_pct: (parsed.keyword_coverage_pct as number) ?? 0,
      section_header_issues: (parsed.section_header_issues as string[]) ?? [],
    };
  }

  // Progressive quality dashboard emit
  ctx.qualityDashboardData = {
    ...ctx.qualityDashboardData,
    ats_score: result.ats_score,
    keyword_coverage: result.keyword_coverage_pct,
  };
  emit({
    type: 'right_panel_update',
    panel_type: 'quality_dashboard',
    data: ctx.qualityDashboardData,
  });

  return result;
}
