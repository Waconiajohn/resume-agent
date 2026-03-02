/**
 * Cover Letter Analyst — Tool definitions.
 *
 * 3 tools for the Analyst agent:
 * - parse_inputs: Extract key points from resume and JD
 * - match_requirements: Map candidate strengths to JD requirements
 * - plan_letter: Create letter outline with talking points
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../types.js';

type CoverLetterTool = AgentTool<CoverLetterState, CoverLetterSSEEvent>;

// ─── Tool: parse_inputs ───────────────────────────────────────────────

const parseInputsTool: CoverLetterTool = {
  name: 'parse_inputs',
  description:
    'Extract key points from the resume text and job description. ' +
    'Identifies candidate name, title, skills, achievements from resume, ' +
    'and company name, role, requirements, culture cues from JD. ' +
    'Stores results in scratchpad.',
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
    },
    required: ['resume_text', 'job_description'],
  },
  async execute(input, ctx) {
    const resumeText = String(input.resume_text ?? '');
    const jdText = String(input.job_description ?? '');

    // Extract basic info from resume (simplified for POC)
    const nameMatch = resumeText.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/m);
    const name = nameMatch ? nameMatch[1] : 'Candidate';

    // Store parsed data in state
    const state = ctx.getState();
    state.resume_data = {
      name,
      title: 'Professional', // Would be LLM-extracted in production
      key_skills: resumeText.slice(0, 500).split(/[,\n]/).slice(0, 10).map(s => s.trim()).filter(Boolean),
      key_achievements: [],
    };
    state.jd_analysis = {
      company_name: String(input.company_name ?? 'the company'),
      role_title: 'the position',
      requirements: jdText.slice(0, 500).split(/[.\n]/).slice(0, 8).map(s => s.trim()).filter(Boolean),
      culture_cues: [],
    };

    ctx.scratchpad['resume_data'] = state.resume_data;
    ctx.scratchpad['jd_analysis'] = state.jd_analysis;

    return {
      status: 'parsed',
      resume_points: state.resume_data.key_skills.length,
      jd_requirements: state.jd_analysis.requirements.length,
    };
  },
};

// ─── Tool: match_requirements ─────────────────────────────────────────

const matchRequirementsTool: CoverLetterTool = {
  name: 'match_requirements',
  description:
    'Map candidate strengths from the parsed resume to JD requirements. ' +
    'Identifies which requirements the candidate can address with evidence, ' +
    'and which are gaps. Returns a matching summary.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const resume = state.resume_data;
    const jd = state.jd_analysis;

    if (!resume || !jd) {
      return { error: 'Must call parse_inputs first' };
    }

    const matches = jd.requirements.map((req, i) => ({
      requirement: req,
      matched_skill: resume.key_skills[i % resume.key_skills.length] ?? 'transferable experience',
      strength: i < resume.key_skills.length ? 'strong' : 'moderate',
    }));

    ctx.scratchpad['requirement_matches'] = matches;

    return {
      total_requirements: jd.requirements.length,
      strong_matches: matches.filter(m => m.strength === 'strong').length,
      moderate_matches: matches.filter(m => m.strength === 'moderate').length,
    };
  },
};

// ─── Tool: plan_letter ────────────────────────────────────────────────

const planLetterTool: CoverLetterTool = {
  name: 'plan_letter',
  description:
    'Create a structured plan for the cover letter including opening hook, ' +
    'body talking points (mapped to requirements), and closing strategy. ' +
    'Stores the plan in state for the Writer agent.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const jd = state.jd_analysis;
    const matches = ctx.scratchpad['requirement_matches'] as Array<{ requirement: string; matched_skill: string }> | undefined;

    if (!jd || !matches) {
      return { error: 'Must call match_requirements first' };
    }

    const plan = {
      opening_hook: `Express enthusiasm for the ${jd.role_title} role at ${jd.company_name}`,
      body_points: matches.slice(0, 3).map(m =>
        `Address "${m.requirement}" with evidence of "${m.matched_skill}"`
      ),
      closing_strategy: `Reiterate fit for ${jd.company_name} culture and request conversation`,
    };

    state.letter_plan = plan;
    ctx.scratchpad['letter_plan'] = plan;

    return { plan };
  },
};

// ─── Export ───────────────────────────────────────────────────────────

export const analystTools: CoverLetterTool[] = [
  parseInputsTool,
  matchRequirementsTool,
  planLetterTool,
];
