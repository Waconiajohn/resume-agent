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

/** Maximum Perplexity calls allowed per session across all researcher tools. */
const MAX_PERPLEXITY_CALLS = 3;

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
    },
    required: ['resume_text', 'job_description'],
  },
  async execute(input, ctx) {
    const resumeText = String(input.resume_text ?? '');
    const jdText = String(input.job_description ?? '');
    const companyHint = String(input.company_name ?? '');

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

    let resumeData;
    try {
      resumeData = JSON.parse(repairJSON(resumeResponse.text) ?? resumeResponse.text);
    } catch {
      resumeData = {
        name: 'Candidate',
        current_title: 'Professional',
        career_summary: '',
        key_skills: [],
        key_achievements: [],
        work_history: [],
      };
    }

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

    let jdAnalysis;
    try {
      jdAnalysis = JSON.parse(repairJSON(jdResponse.text) ?? jdResponse.text);
    } catch {
      jdAnalysis = {
        company_name: companyHint || 'Unknown Company',
        role_title: 'Unknown Role',
        requirements: [],
        culture_cues: [],
        seniority_level: 'other',
      };
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

    if (!companyName || companyName === 'Unknown Company') {
      return JSON.stringify({ success: false, error: 'No company name available for research' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'research',
      message: `Researching ${companyName}...`,
    });

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

    // ── Query 2: Role-specific intelligence (strategic priorities, culture, role impact) ──

    const state = ctx.getState();
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

    let companyResearch;
    try {
      companyResearch = JSON.parse(repairJSON(parseResponse.text) ?? parseResponse.text);
      companyResearch.raw_research = rawResearch;
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
        const roleParsed = JSON.parse(repairJSON(roleParseResponse.text) ?? roleParseResponse.text);
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
