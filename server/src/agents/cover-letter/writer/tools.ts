/**
 * Cover Letter Writer — Tool definitions.
 *
 * 2 tools for the Writer agent:
 * - write_letter: Generate the cover letter from the analyst's plan
 * - review_letter: Self-review for tone, specificity, and length
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../types.js';

type CoverLetterTool = AgentTool<CoverLetterState, CoverLetterSSEEvent>;

// ─── Tool: write_letter ───────────────────────────────────────────────

const writeLetterTool: CoverLetterTool = {
  name: 'write_letter',
  description:
    'Generate a professional cover letter based on the letter plan from the Analyst. ' +
    'Uses the opening hook, body points, and closing strategy to create a cohesive letter. ' +
    'Stores the draft in state and emits a letter_draft SSE event.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      tone: {
        type: 'string',
        enum: ['professional', 'conversational', 'enthusiastic'],
        description: 'Desired tone for the letter (default: professional)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const plan = state.letter_plan;
    const resume = state.resume_data;
    const jd = state.jd_analysis;

    if (!plan || !resume || !jd) {
      return { error: 'Missing letter plan or input data. Analyst must run first.' };
    }

    const tone = String(input.tone ?? 'professional');

    // In production, this would be an LLM call. For POC, generate a template.
    const letter = [
      `Dear Hiring Manager,`,
      ``,
      `${plan.opening_hook}. As a ${resume.title} with expertise in ${resume.key_skills.slice(0, 3).join(', ')}, I am excited to bring my experience to ${jd.company_name}.`,
      ``,
      ...plan.body_points.map(point =>
        `${point}. This experience directly aligns with your team's needs and demonstrates my ability to deliver measurable results.`
      ),
      ``,
      `${plan.closing_strategy}. I would welcome the opportunity to discuss how my background can contribute to your team's success.`,
      ``,
      `Sincerely,`,
      resume.name,
    ].join('\n');

    state.letter_draft = letter;
    ctx.scratchpad['letter_draft'] = letter;
    ctx.scratchpad['letter_tone'] = tone;

    ctx.emit({
      type: 'letter_draft',
      letter,
    });

    return {
      status: 'drafted',
      word_count: letter.split(/\s+/).length,
      tone,
    };
  },
};

// ─── Tool: review_letter ──────────────────────────────────────────────

const reviewLetterTool: CoverLetterTool = {
  name: 'review_letter',
  description:
    'Self-review the drafted cover letter for tone consistency, specificity, ' +
    'appropriate length (250-400 words), and alignment with the job requirements. ' +
    'Returns a quality score (0-100) and feedback.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const letter = state.letter_draft;

    if (!letter) {
      return { error: 'No letter draft to review. Call write_letter first.' };
    }

    const wordCount = letter.split(/\s+/).length;
    const issues: string[] = [];
    let score = 85;

    // Check length
    if (wordCount < 150) {
      issues.push('Letter is too short — aim for 250-400 words');
      score -= 15;
    } else if (wordCount > 500) {
      issues.push('Letter is too long — trim to under 400 words');
      score -= 10;
    }

    // Check for generic phrases
    const genericPhrases = ['team player', 'hard worker', 'self-starter', 'results-driven'];
    for (const phrase of genericPhrases) {
      if (letter.toLowerCase().includes(phrase)) {
        issues.push(`Remove generic phrase: "${phrase}"`);
        score -= 5;
      }
    }

    // Check personalization
    const jd = state.jd_analysis;
    if (jd && !letter.includes(jd.company_name)) {
      issues.push('Letter does not mention the company name — add personalization');
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));

    state.quality_score = score;
    state.review_feedback = issues.length > 0 ? issues.join('; ') : 'No issues found';
    ctx.scratchpad['quality_score'] = score;
    ctx.scratchpad['review_feedback'] = state.review_feedback;

    return {
      score,
      passed: score >= 70,
      issues,
      word_count: wordCount,
    };
  },
};

// ─── Export ───────────────────────────────────────────────────────────

export const writerTools: CoverLetterTool[] = [
  writeLetterTool,
  reviewLetterTool,
];
