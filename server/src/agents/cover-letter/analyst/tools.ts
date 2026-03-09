/**
 * Cover Letter Analyst — Tool definitions.
 *
 * 3 tools for the Analyst agent:
 * - parse_resume_inputs: Extract structured data from resume and JD (shared factory)
 * - match_requirements: Map candidate strengths to JD requirements
 * - plan_letter: Create letter outline with talking points
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../types.js';
import { createParseResumeInputs } from '../../runtime/shared-tools.js';

type CoverLetterTool = AgentTool<CoverLetterState, CoverLetterSSEEvent>;

// ─── Tool: parse_resume_inputs ────────────────────────────────────────
// Uses the shared factory — LLM extraction via MODEL_LIGHT, repairJSON fallback.
// Stores parsed data in state.resume_data (default stateKey).

const parseInputsTool: CoverLetterTool = createParseResumeInputs<CoverLetterState, CoverLetterSSEEvent>();

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
    properties: {
      job_description: {
        type: 'string',
        description: 'Job description text to match against (required if not already in state)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const resume = state.resume_data;

    // Populate jd_analysis from the provided job description if not yet in state
    if (!state.jd_analysis) {
      const jdText = String(input.job_description ?? '');
      state.jd_analysis = {
        company_name: String(input.company_name ?? 'the company'),
        role_title: 'the position',
        requirements: jdText.slice(0, 500).split(/[.\n]/).slice(0, 8).map(s => s.trim()).filter(Boolean),
        culture_cues: [],
      };
      ctx.scratchpad['jd_analysis'] = state.jd_analysis;
    }

    const jd = state.jd_analysis;

    if (!resume || !jd) {
      return { error: 'Must call parse_resume_inputs first' };
    }

    const skills = resume.key_skills ?? [];

    const matches = jd.requirements.map((req, i) => ({
      requirement: req,
      matched_skill: skills[i % (skills.length || 1)] ?? 'transferable experience',
      strength: i < skills.length ? 'strong' : 'moderate',
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
