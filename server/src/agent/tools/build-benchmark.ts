import { llm, MODEL_MID } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import type { SessionContext, BenchmarkCandidate } from '../context.js';
import type { SSEEmitter } from '../loop.js';

export async function executeBuildBenchmark(
  input: Record<string, unknown>,
  ctx: SessionContext,
  emit: SSEEmitter,
): Promise<{ benchmark: BenchmarkCandidate }> {
  const industryResearch = (input.industry_research as string) || '';

  const companyContext = ctx.companyResearch.company_name
    ? `Company: ${ctx.companyResearch.company_name}
Culture: ${ctx.companyResearch.culture || 'Unknown'}
Values: ${ctx.companyResearch.values?.join(', ') || 'Unknown'}
Language style: ${ctx.companyResearch.language_style || 'Unknown'}
Leadership style: ${ctx.companyResearch.leadership_style || 'Unknown'}`
    : 'No company research available';

  const jdContext = ctx.jdAnalysis.job_title
    ? `Job Title: ${ctx.jdAnalysis.job_title}
Must-haves: ${ctx.jdAnalysis.must_haves?.join(', ') || 'None specified'}
Nice-to-haves: ${ctx.jdAnalysis.nice_to_haves?.join(', ') || 'None specified'}
Hidden signals: ${ctx.jdAnalysis.hidden_signals?.join(', ') || 'None identified'}
Seniority: ${ctx.jdAnalysis.seniority_level || 'Unknown'}
Culture cues: ${ctx.jdAnalysis.culture_cues?.join(', ') || 'None identified'}`
    : 'No JD analysis available';

  const response = await llm.chat({
    model: MODEL_MID,
    max_tokens: 4096,
    system: '',
    messages: [
      {
        role: 'user',
        content: `Synthesize a Benchmark Candidate Profile — the ideal candidate this company is looking for.

COMPANY RESEARCH:
${companyContext}

JOB DESCRIPTION ANALYSIS:
${jdContext}

INDUSTRY RESEARCH:
${industryResearch}

Create a detailed profile of exactly who this company wants to hire. Return ONLY valid JSON:
{
  "required_skills": [
    {
      "requirement": "Specific skill or qualification",
      "importance": "critical" | "important" | "nice_to_have",
      "category": "technical" | "leadership" | "domain" | "soft_skills"
    }
  ],
  "experience_expectations": "What experience level and scope they expect",
  "culture_fit_traits": ["Personality traits and work style that fit"],
  "communication_style": "How this person should communicate",
  "industry_standards": ["Standards they should know/follow"],
  "competitive_differentiators": ["What would make a candidate stand out"],
  "language_keywords": ["Exact words and phrases the resume should echo"],
  "ideal_candidate_summary": "A 2-3 sentence description of the perfect candidate"
}`,
      },
    ],
  });

  const rawText = response.text;

  let benchmark: BenchmarkCandidate;
  const parsed = repairJSON<Record<string, unknown>>(rawText);
  if (parsed) {
    benchmark = {
      required_skills: (Array.isArray(parsed.required_skills) ? parsed.required_skills : []).map((s: Record<string, string>) => ({
        requirement: s.requirement,
        importance: s.importance as 'critical' | 'important' | 'nice_to_have',
        category: s.category,
      })),
      experience_expectations: (parsed.experience_expectations as string) ?? '',
      culture_fit_traits: (parsed.culture_fit_traits as string[]) ?? [],
      communication_style: (parsed.communication_style as string) ?? '',
      industry_standards: (parsed.industry_standards as string[]) ?? [],
      competitive_differentiators: (parsed.competitive_differentiators as string[]) ?? [],
      language_keywords: (parsed.language_keywords as string[]) ?? [],
      ideal_candidate_summary: (parsed.ideal_candidate_summary as string) ?? '',
    };
  } else {
    benchmark = {
      required_skills: [],
      experience_expectations: '',
      culture_fit_traits: [],
      communication_style: '',
      industry_standards: [],
      competitive_differentiators: [],
      language_keywords: [],
      ideal_candidate_summary: 'Unable to synthesize benchmark — please try again',
    };
  }

  ctx.benchmarkCandidate = benchmark;

  // Emit to right panel
  emit({
    type: 'right_panel_update',
    panel_type: 'research_dashboard',
    data: {
      company: ctx.companyResearch,
      jd_requirements: {
        must_haves: ctx.jdAnalysis.must_haves,
        nice_to_haves: ctx.jdAnalysis.nice_to_haves,
        seniority_level: ctx.jdAnalysis.seniority_level,
      },
      benchmark,
    },
  });

  return { benchmark };
}
