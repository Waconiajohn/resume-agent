/**
 * Cover Letter Analyst — Tool definitions.
 *
 * 3 tools for the Analyst agent:
 * - parse_resume_inputs: Extract structured data from resume and JD (shared factory)
 * - match_requirements: Map candidate strengths to JD requirements
 * - plan_letter: Create letter outline with talking points (LLM-based, evidence-grounded)
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../types.js';
import { createParseResumeInputs } from '../../runtime/shared-tools.js';
import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import {
  EVIDENCE_LADDER_RULES,
  HUMAN_EDITORIAL_EFFECTIVENESS_RULES,
} from '../../shared-knowledge.js';
import { COVER_LETTER_RULES } from '../knowledge/rules.js';

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
        requirements: jdText.slice(0, 3000).split(/[.\n]/).slice(0, 20).map(s => s.trim()).filter(Boolean),
        culture_cues: [],
      };
      ctx.scratchpad['jd_analysis'] = state.jd_analysis;
    }

    const jd = state.jd_analysis;

    if (!resume || !jd) {
      return { error: 'Must call parse_resume_inputs first' };
    }

    const skills = resume.key_skills ?? [];

    // Score each skill against each requirement by word overlap.
    // This is purely deterministic — no LLM call needed for matching.
    function wordOverlap(a: string, b: string): number {
      const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      const bWords = b.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      return bWords.filter(w => aWords.has(w)).length;
    }

    const matches = jd.requirements.map((req) => {
      if (skills.length === 0) {
        return { requirement: req, matched_skill: 'transferable experience', strength: 'moderate' as const };
      }
      let bestSkill = skills[0];
      let bestScore = 0;
      for (const skill of skills) {
        const score = wordOverlap(skill, req);
        if (score > bestScore) {
          bestScore = score;
          bestSkill = skill;
        }
      }
      const strength: 'strong' | 'moderate' = bestScore >= 2 ? 'strong' : 'moderate';
      return { requirement: req, matched_skill: bestSkill, strength };
    });

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
    'Create a structured, evidence-grounded plan for the cover letter including opening hook, ' +
    'body talking points (mapped to specific resume evidence), and closing strategy. ' +
    'Uses an LLM to select the strongest concrete proof points from the candidate\'s history. ' +
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
    const resume = state.resume_data;
    const matches = ctx.scratchpad['requirement_matches'] as Array<{ requirement: string; matched_skill: string; strength: 'strong' | 'moderate' }> | undefined;

    if (!jd || !resume) {
      return { error: 'Must call parse_resume_inputs and match_requirements first' };
    }
    if (!matches || matches.length === 0) {
      // match_requirements is a hard precondition — plan_letter's entire
      // premise is "select the strongest match" and there's nothing to
      // select when the scratchpad is empty. Error early rather than
      // producing a generic non-evidence-grounded plan.
      return { error: 'Must call match_requirements before plan_letter' };
    }

    // Build full candidate evidence for the planner — include work history if available
    const resumeWithHistory = resume as typeof resume & {
      work_history?: Array<{ company: string; title: string; duration: string; highlights: string[] }>;
      career_summary?: string;
    };

    const workHistoryBlock = resumeWithHistory.work_history && resumeWithHistory.work_history.length > 0
      ? '\nWORK HISTORY:\n' + resumeWithHistory.work_history.map(
          (role) =>
            `${role.title} at ${role.company} (${role.duration})\n` +
            role.highlights.map((h) => `  - ${h}`).join('\n'),
        ).join('\n\n')
      : '';

    const requirementMatchesBlock = matches && matches.length > 0
      ? '\nREQUIREMENT-SKILL MATCHES:\n' + matches.map(
          m => `- "${m.requirement}" → ${m.matched_skill} (${m.strength} match)`,
        ).join('\n')
      : '';

    const plannerPrompt = `You are a strategic cover letter planner. Your job is to select the strongest, most specific evidence from a candidate's resume and map it to a job description. You create letter plans that ground every talking point in real, verifiable accomplishments.

EVIDENCE-BOUND RULE: Every point in the plan must reference a specific, real piece of evidence from the candidate data below. Do not invent accomplishments, inflate metrics, or create composite achievements. If a requirement lacks exact-match evidence, use the evidence ladder before marking it as a gap.

${EVIDENCE_LADDER_RULES}

${HUMAN_EDITORIAL_EFFECTIVENESS_RULES}

${COVER_LETTER_RULES}

CANDIDATE
Name: ${resume.name}
Current title: ${resume.current_title}
${resumeWithHistory.career_summary ? `Career summary: ${resumeWithHistory.career_summary}\n` : ''}Key skills: ${resume.key_skills.join(', ')}
Key achievements:
- ${resume.key_achievements.join('\n- ')}
${workHistoryBlock}

TARGET ROLE
Company: ${jd.company_name}
Role: ${jd.role_title}
Requirements:
- ${jd.requirements.join('\n- ')}
Culture cues: ${jd.culture_cues.length > 0 ? jd.culture_cues.join(', ') : 'Not specified'}
${requirementMatchesBlock}

Your task: Create a letter plan with:
1. An opening_hook — a single sentence that opens the letter with the candidate's strongest, most specific proof point mapped to the company's most pressing need. This must reference a real accomplishment (with metrics if available, e.g., "reduced churn by 18% at Acme Corp") — never a generic self-description.
2. Three body_points — each must be a specific, evidence-grounded talking point. Format each as: "[specific evidence from the resume] positions me to [address the requirement] at ${jd.company_name}". Include actual numbers, role names, or company names from the work history wherever possible.
3. A closing_strategy — one sentence naming the candidate's single most differentiating factor (a real accomplishment or unique combination of skills from the data) and inviting a conversation.

Return ONLY valid JSON, no markdown fencing, no commentary:
{
  "opening_hook": "A single evidence-grounded opening line that names a real accomplishment",
  "body_points": [
    "Specific evidence point 1 with real details from the resume",
    "Specific evidence point 2 with real details from the resume",
    "Specific evidence point 3 with real details from the resume"
  ],
  "closing_strategy": "Differentiating closing sentence naming the candidate's strongest real asset"
}`;

    try {
      const response = await llm.chat({
        model: MODEL_MID,
        system: 'You are a strategic cover letter planner. Return only valid JSON.',
        messages: [{ role: 'user', content: plannerPrompt }],
        max_tokens: 1024,
        signal: ctx.signal,
        session_id: ctx.sessionId,
      });

      const parsed = repairJSON<{ opening_hook: string; body_points: string[]; closing_strategy: string }>(response.text);

      if (!parsed || typeof parsed.opening_hook !== 'string' || !Array.isArray(parsed.body_points)) {
        logger.warn({ session_id: ctx.sessionId }, 'plan_letter LLM response did not parse — using fallback plan');
        // Fallback: use the top match data to build a minimal plan
        const topMatch = matches?.find(m => m.strength === 'strong') ?? matches?.[0];
        const fallbackPlan = {
          opening_hook: topMatch
            ? `My background in ${topMatch.matched_skill} positions me to address your need for ${topMatch.requirement} at ${jd.company_name}`
            : `My experience as ${resume.current_title} is directly relevant to the ${jd.role_title} role at ${jd.company_name}`,
          body_points: (matches ?? []).slice(0, 3).map(
            m => `${m.matched_skill} maps directly to your requirement for ${m.requirement}`,
          ),
          closing_strategy: `I would welcome a conversation about how my background can drive results for ${jd.company_name}`,
        };
        state.letter_plan = fallbackPlan;
        ctx.scratchpad['letter_plan'] = fallbackPlan;
        return { plan: fallbackPlan, source: 'fallback' };
      }

      const plan = {
        opening_hook: parsed.opening_hook,
        body_points: parsed.body_points.slice(0, 3),
        closing_strategy: parsed.closing_strategy,
      };

      state.letter_plan = plan;
      ctx.scratchpad['letter_plan'] = plan;

      return { plan, source: 'llm' };
    } catch (err) {
      logger.error({ err, session_id: ctx.sessionId }, 'plan_letter LLM call failed');
      return { error: 'Failed to generate letter plan. Please try again.' };
    }
  },
};

// ─── Export ───────────────────────────────────────────────────────────

export const analystTools: CoverLetterTool[] = [
  parseInputsTool,
  matchRequirementsTool,
  planLetterTool,
];
