import { anthropic, MODEL, extractResponseText } from '../../lib/anthropic.js';
import { repairJSON } from '../../lib/json-repair.js';
import type { SessionContext, JDAnalysis } from '../context.js';

export async function executeAnalyzeJD(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ analysis: JDAnalysis }> {
  const jobDescription = (input.job_description as string).slice(0, 30_000);

  const companyContext = ctx.companyResearch.company_name
    ? `\nCompany context: ${ctx.companyResearch.company_name}
Culture: ${ctx.companyResearch.culture || 'Unknown'}
Values: ${ctx.companyResearch.values?.join(', ') || 'Unknown'}
Language style: ${ctx.companyResearch.language_style || 'Unknown'}`
    : '';

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Parse this job description into structured requirements. Be thorough — capture EVERYTHING a hiring manager would screen for, including implicit requirements.
${companyContext}

JOB DESCRIPTION:
${jobDescription}

Return ONLY valid JSON:
{
  "job_title": "The exact job title",
  "must_haves": ["Explicit hard requirements"],
  "nice_to_haves": ["Stated preferences, bonus qualifications"],
  "hidden_signals": ["Unstated requirements inferred from language"],
  "seniority_level": "junior | mid | senior | staff | director | vp | c-level",
  "culture_cues": ["Cultural expectations from the language used"],
  "raw_jd": "The original JD text"
}`,
      },
    ],
  });

  const text = extractResponseText(response);

  let analysis: JDAnalysis;
  const parsed = repairJSON<Record<string, unknown>>(text);
  if (parsed) {
    analysis = {
      job_title: (parsed.job_title as string) ?? 'Unknown',
      must_haves: (parsed.must_haves as string[]) ?? [],
      nice_to_haves: (parsed.nice_to_haves as string[]) ?? [],
      hidden_signals: (parsed.hidden_signals as string[]) ?? [],
      seniority_level: (parsed.seniority_level as string) ?? 'unknown',
      culture_cues: (parsed.culture_cues as string[]) ?? [],
      raw_jd: jobDescription,
    };
  } else {
    analysis = {
      job_title: 'Unknown',
      must_haves: [],
      nice_to_haves: [],
      hidden_signals: [],
      seniority_level: 'unknown',
      culture_cues: [],
      raw_jd: jobDescription,
    };
  }

  ctx.jdAnalysis = analysis;
  return { analysis };
}
