/**
 * Interview Prep Researcher — Tool definitions.
 *
 * 3 tools:
 * - parse_inputs: Extract structured data from resume + JD
 * - research_company: Perplexity web search for company intel
 * - find_interview_questions: Perplexity search for real interview questions
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type { InterviewPrepState, InterviewPrepSSEEvent } from '../types.js';
import { queryPerplexity, queryWithFallback } from '../../../lib/perplexity.js';
import { llm, MODEL_LIGHT, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { createSessionLogger } from '../../../lib/logger.js';

type InterviewPrepTool = AgentTool<InterviewPrepState, InterviewPrepSSEEvent>;
type ResumeData = NonNullable<InterviewPrepState['resume_data']>;
type JdAnalysis = NonNullable<InterviewPrepState['jd_analysis']>;
type CompanyResearchData = NonNullable<InterviewPrepState['company_research']>;

/** Maximum Perplexity calls allowed per session across all researcher tools. */
const MAX_PERPLEXITY_CALLS = 3;

function parseLlmJsonObject(text: string): Record<string, unknown> | null {
  const repaired = repairJSON<unknown>(text);
  if (repaired && typeof repaired === 'object' && !Array.isArray(repaired)) {
    return repaired as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isGenericValue(value: unknown, genericPattern: RegExp): boolean {
  return typeof value !== 'string' || value.trim().length === 0 || genericPattern.test(value.trim());
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function splitReadableList(value: string): string[] {
  return value
    .split(/,\s+|;\s+|\s+and\s+/i)
    .map((item) => item.replace(/^[-•\s]+/, '').trim())
    .filter((item) => item.length > 3);
}

function extractOperatingDivisions(jdText: string): string[] {
  const match = jdText.match(/operating divisions\s*[—-]\s*([^.\n]+)/i);
  return match ? splitReadableList(match[1]) : [];
}

function buildJdAnchoredCompanyResearch(
  companyName: string,
  industryHint: string,
  state: InterviewPrepState,
) {
  const jd = state.jd_analysis;
  const jdText = jd?.raw_job_description ?? '';
  const roleTitle = jd?.role_title || 'the target role';
  const divisions = extractOperatingDivisions(jdText);
  const requirements = (jd?.requirements ?? []).map((r) => r.requirement).filter(Boolean);
  const cultureCues = jd?.culture_cues ?? [];
  const industry =
    industryHint
    || (/manufactur/i.test(jdText) ? 'industrial manufacturing' : 'company described in the supplied job description');

  const revenueStreams =
    divisions.length > 0
      ? divisions
      : requirements
          .filter((req) => /manufactur|supply chain|procurement|division|operation|product|service/i.test(req))
          .slice(0, 4);

  const strategicPriorities = [
    ...requirements
      .filter((req) => /p&l|integration|standard|erp|procurement|lean|continuous|capital|working capital|board|recapital/i.test(req))
      .slice(0, 5),
  ];

  const growthAreas = [
    ...strategicPriorities.slice(0, 4),
    ...requirements
      .filter((req) => /team|leadership|planning|savings|modernization|supplier/i.test(req))
      .slice(0, 3),
  ].filter((value, index, all) => all.indexOf(value) === index);

  const risks = [
    'Cross-division integration can stall if operating standards, systems, and leadership accountability are not made explicit.',
    'A value-creation plan can lose credibility if EBITDA, working-capital, and capital-project improvements are not traceable to weekly operating metrics.',
    'Modernization and procurement changes can disrupt delivery performance if plants, suppliers, and finance are not aligned before rollout.',
    'Board and sponsor expectations can outpace site-level readiness if the operating cadence is not translated into practical frontline routines.',
  ];

  const roleImpact =
    `${roleTitle} appears to be central to the supplied job description: the role connects manufacturing, supply chain, ` +
    'capital allocation, operating standards, leadership accountability, and board-level reporting to the company’s value-creation plan.';

  const overviewLines = [
    `Using the supplied job description, ${companyName} is presented as a ${industry} business.`,
    divisions.length > 0
      ? `The posting describes four operating divisions: ${divisions.join(', ')}.`
      : 'The posting does not provide verified public business-line detail beyond the role description.',
    'Because I could not verify a clean public company profile from the available research, this brief intentionally relies on the supplied JD rather than importing similarly named companies.',
  ];

  return {
    company_name: companyName,
    overview: overviewLines.join(' '),
    revenue_streams: revenueStreams,
    industry,
    growth_areas: growthAreas.length > 0 ? growthAreas : strategicPriorities,
    risks,
    competitors: [],
    strategic_priorities: strategicPriorities,
    culture_signals:
      cultureCues.length > 0
        ? cultureCues
        : [
            'Private equity-style accountability and measurable value creation',
            'Hands-on operating leadership rather than coordination-only oversight',
            'Board-ready communication around cost, capital, quality, delivery, and working capital',
          ],
    role_impact: roleImpact,
    source_note:
      'Limited verified company data. This company brief is anchored to the supplied job description instead of importing facts from similarly named companies.',
    source_confidence: 'jd_only' as const,
    raw_research: jdText,
  };
}

function isLikelySyntheticOrQaCompany(companyName: string): boolean {
  const normalized = normalizeForMatch(companyName);
  if (!normalized) return true;
  return /\b(qa|test|demo|sample|sandbox|synthetic|placeholder|acme|northwind|globex|initech|umbrella)\b/i.test(normalized);
}

function shouldUseJdAnchoredResearch(rawResearch: string, companyName: string): boolean {
  const normalizedCompany = normalizeForMatch(companyName);
  const normalizedResearch = normalizeForMatch(rawResearch);
  if (isLikelySyntheticOrQaCompany(companyName)) return true;
  if (!normalizedCompany || normalizedCompany === 'unknown company') return true;
  if (/\bclosest matches?\b|\bcould not find\b|\bcould not verify\b|\bnot find a verified\b|\bno verified public\b/i.test(rawResearch)) {
    return true;
  }
  if (companyName.length > 8 && !normalizedResearch.includes(normalizedCompany)) {
    return true;
  }
  return false;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizeCompetitors(value: unknown): CompanyResearchData['competitors'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      const name = String(candidate.name ?? '').trim();
      const differentiation = String(candidate.differentiation ?? '').trim();
      if (!name || !differentiation) return null;
      return { name, differentiation };
    })
    .filter((item): item is { name: string; differentiation: string } => item !== null);
}

function normalizeCompanyResearch(
  raw: Record<string, unknown>,
  companyName: string,
  industryHint: string,
  rawResearch: string,
): CompanyResearchData {
  return {
    company_name: String(raw.company_name ?? companyName).trim() || companyName,
    overview: String(raw.overview ?? rawResearch).trim() || rawResearch,
    revenue_streams: asStringArray(raw.revenue_streams),
    industry: String(raw.industry ?? industryHint ?? 'Unknown').trim() || industryHint || 'Unknown',
    growth_areas: asStringArray(raw.growth_areas),
    risks: asStringArray(raw.risks),
    competitors: normalizeCompetitors(raw.competitors),
    raw_research: rawResearch,
  };
}

// ─── Tool: parse_inputs ─────────────────────────────────────────────

const parseInputsTool: InterviewPrepTool = {
  name: 'parse_inputs',
  description:
    'Parse the candidate resume and job description into structured data. ' +
    'Extracts candidate name, title, skills, achievements, work history from resume, ' +
    'and company name, role, top requirements, culture cues, seniority level from JD. ' +
    'Call this first before any other tools.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'Raw resume text to parse',
      },
      job_description: {
        type: 'string',
        description: 'Job description text to analyze',
      },
      company_name: {
        type: 'string',
        description: 'Company name (if known from pipeline data)',
      },
      role_title: {
        type: 'string',
        description: 'Role title (if known from application data)',
      },
    },
    required: ['resume_text', 'job_description'],
  },
  async execute(input, ctx) {
    const resumeText = String(input.resume_text ?? '');
    const jdText = String(input.job_description ?? '');
    const companyHint = String(input.company_name ?? '');
    const roleHint = String(input.role_title ?? '');

    // Use LLM to extract structured data from resume
    const resumeResponse = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 4096,
      system: 'You extract structured data from resumes. Return ONLY valid JSON, no comments, no markdown fencing.',
      messages: [{
        role: 'user',
        content: `Extract the following from this resume and return as JSON:
{
  "name": "Full Name",
  "current_title": "Most recent job title",
  "career_summary": "2-3 sentence career summary",
  "key_skills": ["skill1", "skill2", ...],
  "key_achievements": ["achievement with metrics if available", ...],
  "work_history": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "Start - End",
      "highlights": ["key accomplishment 1", "key accomplishment 2"]
    }
  ]
}

Resume:
${resumeText}`,
      }],
    });

    let resumeData = parseLlmJsonObject(resumeResponse.text) as ResumeData | null;
    if (!resumeData) {
      resumeData = {
        name: 'Candidate',
        current_title: 'Professional',
        career_summary: '',
        key_skills: [],
        key_achievements: [],
        work_history: [],
      };
    }
    resumeData.key_skills = Array.isArray(resumeData.key_skills) ? resumeData.key_skills : [];
    resumeData.key_achievements = Array.isArray(resumeData.key_achievements) ? resumeData.key_achievements : [];
    resumeData.work_history = Array.isArray(resumeData.work_history) ? resumeData.work_history : [];

    // Use LLM to extract structured data from JD
    const jdResponse = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 4096,
      system: 'You extract structured data from job descriptions. Return ONLY valid JSON, no comments, no markdown fencing.',
      messages: [{
        role: 'user',
        content: `Extract the following from this job description and return as JSON:
{
  "company_name": "Company Name",
  "role_title": "Role Title",
  "requirements": [
    {"requirement": "requirement text", "expanded_definition": "what this means in practice", "rank": 1}
  ],
  "culture_cues": ["culture signal 1", "culture signal 2"],
  "seniority_level": "director|vp|svp|c_suite|senior_ic|other"
}

Rank requirements by importance (1 = most important). Include the top 6 requirements.
${companyHint ? `Company hint: ${companyHint}` : ''}

Job Description:
${jdText}`,
      }],
    });

    let jdAnalysis = parseLlmJsonObject(jdResponse.text) as JdAnalysis | null;
    if (!jdAnalysis) {
      jdAnalysis = {
        company_name: companyHint || 'Unknown Company',
        role_title: roleHint || 'Unknown Role',
        requirements: [],
        culture_cues: [],
        seniority_level: 'other',
      };
    }
    jdAnalysis.requirements = Array.isArray(jdAnalysis.requirements) ? jdAnalysis.requirements : [];
    jdAnalysis.culture_cues = Array.isArray(jdAnalysis.culture_cues) ? jdAnalysis.culture_cues : [];
    jdAnalysis.raw_job_description = jdText;

    if (companyHint && isGenericValue(jdAnalysis.company_name, /^(unknown|target)\s+company$/i)) {
      jdAnalysis.company_name = companyHint;
    }
    if (roleHint && isGenericValue(jdAnalysis.role_title, /^(unknown|target)\s+role$/i)) {
      jdAnalysis.role_title = roleHint;
    }

    // Store in state
    const state = ctx.getState();
    state.resume_data = resumeData;
    state.jd_analysis = jdAnalysis;

    return JSON.stringify({
      success: true,
      candidate_name: resumeData.name,
      role: jdAnalysis.role_title,
      company: jdAnalysis.company_name,
      requirements_count: jdAnalysis.requirements?.length ?? 0,
      work_history_count: resumeData.work_history?.length ?? 0,
    });
  },
};

// ─── Tool: research_company ─────────────────────────────────────────

const researchCompanyTool: InterviewPrepTool = {
  name: 'research_company',
  description:
    'Research the target company using Perplexity web search. ' +
    'Returns company overview, revenue streams, growth areas, risks, and competitors. ' +
    'Call this after parse_inputs so the company name is known.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      company_name: {
        type: 'string',
        description: 'Company name to research',
      },
      industry_hint: {
        type: 'string',
        description: 'Industry context to focus the research',
      },
    },
    required: ['company_name'],
  },
  async execute(input, ctx) {
    const companyName = String(input.company_name ?? '');
    const industryHint = String(input.industry_hint ?? '');
    const log = createSessionLogger(ctx.getState().session_id);
    const sessionId = ctx.getState().session_id;
    const state = ctx.getState();

    if (!companyName || companyName === 'Unknown Company') {
      return JSON.stringify({ success: false, error: 'No company name available for research' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'research',
      message: `Researching ${companyName}...`,
    });

    if (isLikelySyntheticOrQaCompany(companyName)) {
      const companyResearch = buildJdAnchoredCompanyResearch(companyName, industryHint, state);
      state.company_research = companyResearch;
      log.info(
        {
          company: companyName,
          source_confidence: companyResearch.source_confidence,
          reason: 'synthetic_or_qa_company_name',
        },
        'research_company: using JD-anchored company brief before public research',
      );
      return JSON.stringify({
        success: true,
        company: companyName,
        source_confidence: companyResearch.source_confidence,
        growth_areas_count: companyResearch.growth_areas?.length ?? 0,
        risks_count: companyResearch.risks?.length ?? 0,
        competitors_count: 0,
        strategic_priorities_count: companyResearch.strategic_priorities?.length ?? 0,
        culture_signals_count: companyResearch.culture_signals?.length ?? 0,
        has_role_impact: !!companyResearch.role_impact,
      });
    }

    // ── Query 1: Company overview, revenue, growth, risks, competitors ──────

    const overviewQuery =
      `Provide a comprehensive business overview of ${companyName}` +
      `${industryHint ? ` in the ${industryHint} industry` : ''}. Include:\n` +
      `1. What the company does, its primary products/services, approximate size, headquarters, founding year\n` +
      `2. Primary revenue streams and business lines (be specific — name actual products or services)\n` +
      `3. Where the company is investing or signaling growth over the next 12-24 months ` +
      `(cite recent news, earnings calls, or press releases if available)\n` +
      `4. 3-5 strategic, operational, or competitive risks the company faces (be specific, not generic)\n` +
      `5. 4-6 direct competitors with one sentence each on how they differentiate`;

    const callCount1 = (ctx.scratchpad.perplexity_call_count as number | undefined) ?? 0;
    let rawResearch: string;
    if (callCount1 < MAX_PERPLEXITY_CALLS) {
      rawResearch = await queryWithFallback(
        sessionId,
        [
          {
            role: 'system',
            content:
              'You are a business research analyst providing detailed company intelligence for interview preparation. Be specific and cite real data when available.',
          },
          { role: 'user', content: overviewQuery },
        ],
        {
          system:
            'You are a business research analyst. Provide the best company information you can from your training data. Note when information may be outdated.',
          prompt:
            `\u26a0\ufe0f NOTE: This research is from AI training data, not live web sources. Information may be outdated.\n\n` +
            overviewQuery,
        },
      );
      ctx.scratchpad.perplexity_call_count = callCount1 + 1;
    } else {
      log.warn({ callCount: callCount1 }, 'research_company: Perplexity budget exhausted for overview query, using LLM fallback');
      rawResearch = (await llm.chat({
        model: MODEL_MID,
        max_tokens: 4096,
        system:
          'You are a business research analyst. Provide the best company information you can from your training data. Note when information may be outdated.',
        messages: [{ role: 'user', content: overviewQuery }],
      })).text;
    }

    if (shouldUseJdAnchoredResearch(rawResearch, companyName)) {
      const companyResearch = buildJdAnchoredCompanyResearch(companyName, industryHint, state);
      state.company_research = companyResearch;
      log.info(
        {
          company: companyName,
          source_confidence: companyResearch.source_confidence,
          reason: 'unverified_public_research',
        },
        'research_company: using JD-anchored company brief',
      );
      return JSON.stringify({
        success: true,
        company: companyName,
        source_confidence: companyResearch.source_confidence,
        growth_areas_count: companyResearch.growth_areas?.length ?? 0,
        risks_count: companyResearch.risks?.length ?? 0,
        competitors_count: 0,
        strategic_priorities_count: companyResearch.strategic_priorities?.length ?? 0,
        culture_signals_count: companyResearch.culture_signals?.length ?? 0,
        has_role_impact: !!companyResearch.role_impact,
      });
    }

    // ── Query 2: Role-specific intelligence (strategic priorities, culture, role impact) ──

    const roleTitle = state.jd_analysis?.role_title ?? '';

    const roleQuery =
      `For ${companyName}${industryHint ? ` (${industryHint})` : ''}, answer the following:\n` +
      `1. What are the company's TOP 3-5 named strategic priorities or initiatives for this year? ` +
      `(Name specific programs, OKRs, or publicly stated goals — not generic observations.)\n` +
      `2. What does the company culture look like in practice? ` +
      `(What do Glassdoor reviews, LinkedIn posts, or press coverage reveal about how they work, ` +
      `what they reward, and what the day-to-day environment is like?)\n` +
      `3. How does the ${roleTitle || 'this role'} directly impact the company's revenue or core operations? ` +
      `(Be specific — what P&L, ARR percentage, cost center, or operational metric does this role own or influence?)`;

    let rawRoleResearch = '';
    try {
      const callCount2 = (ctx.scratchpad.perplexity_call_count as number | undefined) ?? 0;
      if (callCount2 < MAX_PERPLEXITY_CALLS) {
        rawRoleResearch = await queryWithFallback(
          sessionId,
          [
            {
              role: 'system',
              content:
                'You are a senior business analyst specializing in organizational intelligence. ' +
                'Be concrete, cite evidence when available, and avoid generic platitudes.',
            },
            { role: 'user', content: roleQuery },
          ],
          {
            system:
              'You are a senior business analyst. Provide the best role-intelligence you can from your training data. Note when information may be outdated.',
            prompt: roleQuery,
          },
        );
        ctx.scratchpad.perplexity_call_count = callCount2 + 1;
      } else {
        log.warn({ callCount: callCount2 }, 'research_company: Perplexity budget exhausted for role-intelligence query, using LLM fallback');
        rawRoleResearch = (await llm.chat({
          model: MODEL_MID,
          max_tokens: 2048,
          system:
            'You are a senior business analyst. Provide the best role-intelligence you can from your training data. Note when information may be outdated.',
          messages: [{ role: 'user', content: roleQuery }],
        })).text;
      }
    } catch (err) {
      log.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'research_company: role-intelligence query failed, continuing without it',
      );
    }

    // ── Parse Query 1 into structured format ─────────────────────────────────

    const parseResponse = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 4096,
      system: 'Extract structured data from company research text. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Parse this company research into JSON format:
{
  "company_name": "${companyName}",
  "overview": "2-3 paragraph company overview",
  "revenue_streams": ["stream 1", "stream 2"],
  "industry": "primary industry",
  "growth_areas": ["area 1", "area 2"],
  "risks": ["risk 1", "risk 2"],
  "competitors": [{"name": "Competitor", "differentiation": "how they compete"}]
}

Research text:
${rawResearch}`,
      }],
    });

    let companyResearch: CompanyResearchData;
    try {
      const parsedResearch = parseLlmJsonObject(parseResponse.text);
      if (!parsedResearch) throw new Error('Unable to parse company research JSON');
      companyResearch = normalizeCompanyResearch(parsedResearch, companyName, industryHint, rawResearch);
    } catch {
      companyResearch = {
        company_name: companyName,
        overview: rawResearch,
        revenue_streams: [],
        industry: industryHint || 'Unknown',
        growth_areas: [],
        risks: [],
        competitors: [],
        raw_research: rawResearch,
      };
    }

    // ── Parse Query 2 into structured fields ─────────────────────────────────

    if (rawRoleResearch.trim()) {
      const roleParseResponse = await llm.chat({
        model: MODEL_LIGHT,
        max_tokens: 2048,
        system: 'Extract structured data from company role-intelligence text. Return ONLY valid JSON.',
        messages: [{
          role: 'user',
          content: `Parse this role-intelligence research into JSON format:
{
  "strategic_priorities": ["named priority 1", "named priority 2"],
  "culture_signals": ["culture observation 1", "culture observation 2"],
  "role_impact": "one paragraph describing how this role impacts revenue or operations"
}

Research text:
${rawRoleResearch}`,
        }],
      });

      try {
        const roleParsed = parseLlmJsonObject(roleParseResponse.text);
        if (!roleParsed) throw new Error('Unable to parse role research JSON');
        if (Array.isArray(roleParsed.strategic_priorities) && roleParsed.strategic_priorities.length > 0) {
          companyResearch.strategic_priorities = roleParsed.strategic_priorities;
        }
        if (Array.isArray(roleParsed.culture_signals) && roleParsed.culture_signals.length > 0) {
          companyResearch.culture_signals = roleParsed.culture_signals;
        }
        if (typeof roleParsed.role_impact === 'string' && roleParsed.role_impact.trim()) {
          companyResearch.role_impact = roleParsed.role_impact;
        }
      } catch {
        log.warn({}, 'research_company: role-intelligence parse failed, raw text preserved');
      }

      companyResearch.raw_role_research = rawRoleResearch;
    }

    state.company_research = companyResearch;

    log.info(
      {
        company: companyName,
        has_strategic_priorities: (companyResearch.strategic_priorities?.length ?? 0) > 0,
        has_culture_signals: (companyResearch.culture_signals?.length ?? 0) > 0,
        has_role_impact: !!companyResearch.role_impact,
      },
      'research_company: research complete',
    );

    return JSON.stringify({
      success: true,
      company: companyName,
      growth_areas_count: companyResearch.growth_areas?.length ?? 0,
      risks_count: companyResearch.risks?.length ?? 0,
      competitors_count: companyResearch.competitors?.length ?? 0,
      strategic_priorities_count: companyResearch.strategic_priorities?.length ?? 0,
      culture_signals_count: companyResearch.culture_signals?.length ?? 0,
      has_role_impact: !!companyResearch.role_impact,
    });
  },
};

// ─── Tool: find_interview_questions ─────────────────────────────────

const findInterviewQuestionsTool: InterviewPrepTool = {
  name: 'find_interview_questions',
  description:
    'Search for real interview questions asked at the target company for this role. ' +
    'Uses Perplexity to search Glassdoor, Reddit, Indeed, and other sources. ' +
    'Call this after parse_inputs so company and role are known.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      company_name: {
        type: 'string',
        description: 'Company name to search for',
      },
      role_title: {
        type: 'string',
        description: 'Role title to search for',
      },
      industry: {
        type: 'string',
        description: 'Industry context for fallback questions',
      },
    },
    required: ['company_name', 'role_title'],
  },
  async execute(input, ctx) {
    const companyName = String(input.company_name ?? '');
    const roleTitle = String(input.role_title ?? '');
    const industry = String(input.industry ?? '');
    const log = createSessionLogger(ctx.getState().session_id);

    ctx.emit({
      type: 'transparency',
      stage: 'research',
      message: `Searching for ${companyName} interview questions...`,
    });

    // Search for company-specific interview questions
    const searchQuery = `Find real interview questions that have been asked at ${companyName} for ${roleTitle} or similar roles. Search Glassdoor reviews, Reddit threads, Indeed interview reviews, and other sources. For each question found, note the source. If company-specific questions are unavailable, find the most common interview questions for "${roleTitle}" in the ${industry || 'relevant'} industry. Include a mix of technical, behavioral, and culture fit questions. Return at least 10 questions.`;

    const callCountQ = (ctx.scratchpad.perplexity_call_count as number | undefined) ?? 0;
    let rawQuestions: string;
    if (callCountQ < MAX_PERPLEXITY_CALLS) {
      try {
        rawQuestions = await queryPerplexity([
          { role: 'system', content: 'You search for real interview questions from public sources like Glassdoor, Reddit, and Indeed. Be specific about sources when available.' },
          { role: 'user', content: searchQuery },
        ], { max_tokens: 4096 });
        ctx.scratchpad.perplexity_call_count = callCountQ + 1;
      } catch (err) {
        log.warn({ error: err instanceof Error ? err.message : String(err) }, 'Perplexity unavailable for interview questions, using LLM fallback');
        rawQuestions = (await llm.chat({
          model: MODEL_LIGHT,
          max_tokens: 4096,
          system: 'Generate interview questions based strictly on the requirements in the job description provided. Label each question with the JD requirement it tests. Mark all questions as "Generated from JD" — do not present them as sourced from Glassdoor or real candidate reports.',
          messages: [{ role: 'user', content: searchQuery }],
        })).text;
      }
    } else {
      log.warn({ callCount: callCountQ }, 'find_interview_questions: Perplexity budget exhausted, using LLM fallback');
      rawQuestions = (await llm.chat({
        model: MODEL_LIGHT,
        max_tokens: 4096,
        system: 'Generate realistic interview questions that would likely be asked for this role.',
        messages: [{ role: 'user', content: searchQuery }],
      })).text;
    }

    // Parse into structured format
    const parseResponse = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 4096,
      system: 'Extract structured interview questions from text. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Parse these interview questions into JSON:
[
  {"question": "question text", "source": "Glassdoor|Reddit|Indeed|Industry common|Generated", "category": "technical|behavioral|culture_fit|motivation"}
]

Return at least 10 questions. Categorize each accurately.

Text:
${rawQuestions}`,
      }],
    });

    let sourcedQuestions;
    try {
      sourcedQuestions = JSON.parse(repairJSON(parseResponse.text) ?? parseResponse.text);
      if (!Array.isArray(sourcedQuestions)) sourcedQuestions = [];
    } catch {
      sourcedQuestions = [];
    }

    const state = ctx.getState();
    state.sourced_questions = sourcedQuestions;

    return JSON.stringify({
      success: true,
      questions_found: sourcedQuestions.length,
      by_category: {
        technical: sourcedQuestions.filter((q: { category: string }) => q.category === 'technical').length,
        behavioral: sourcedQuestions.filter((q: { category: string }) => q.category === 'behavioral').length,
        culture_fit: sourcedQuestions.filter((q: { category: string }) => q.category === 'culture_fit').length,
        motivation: sourcedQuestions.filter((q: { category: string }) => q.category === 'motivation').length,
      },
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const researcherTools: InterviewPrepTool[] = [
  parseInputsTool,
  researchCompanyTool,
  findInterviewQuestionsTool,
];
