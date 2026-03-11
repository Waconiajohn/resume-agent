/**
 * Retirement Readiness Assessor — Tool definitions.
 *
 * 3 tools:
 * - generate_assessment_questions: Create 5-7 readiness questions across 7 dimensions
 * - evaluate_readiness: Analyze responses per dimension, assign signals, generate planner questions
 * - build_readiness_summary: Synthesize dimension assessments into shareable summary
 *
 * CRITICAL CONSTRAINT: This agent NEVER gives financial advice. Every tool surfaces
 * questions and observations. All financial guidance is deferred to qualified
 * fiduciary planners.
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  RetirementBridgeState,
  RetirementBridgeSSEEvent,
  RetirementQuestion,
  DimensionAssessment,
  RetirementReadinessSummary,
  ReadinessDimension,
  ReadinessSignal,
} from '../types.js';
import { RETIREMENT_BRIDGE_RULES, FIDUCIARY_DISCLAIMER } from '../knowledge/rules.js';
import { llm, MODEL_MID } from '../../../lib/llm.js';
import type { ChatResponse } from '../../../lib/llm-provider.js';
import { repairJSON } from '../../../lib/json-repair.js';

type RetirementTool = AgentTool<RetirementBridgeState, RetirementBridgeSSEEvent>;

// ─── Validation helpers ───────────────────────────────────────────

const VALID_DIMENSIONS: ReadinessDimension[] = [
  'income_replacement',
  'healthcare_bridge',
  'debt_profile',
  'retirement_savings_impact',
  'insurance_gaps',
  'tax_implications',
  'lifestyle_adjustment',
];

const VALID_SIGNALS: ReadinessSignal[] = ['green', 'yellow', 'red'];

// ─── Tool: generate_assessment_questions ──────────────────────────

const generateAssessmentQuestionsTool: RetirementTool = {
  name: 'generate_assessment_questions',
  description:
    'Generate 5-7 retirement readiness questions covering all 7 dimensions. Questions help the ' +
    'user think through their situation — they are NOT diagnostic or advisory. Questions must ' +
    'never ask for specific dollar amounts, account balances, or financial figures.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      client_profile: {
        type: 'object',
        description: 'Optional client profile from onboarding, used to personalize questions.',
      },
      career_context: {
        type: 'string',
        description: 'Optional career context (industry, role, transition type) to tailor questions.',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const clientProfile = input.client_profile as Record<string, unknown> | undefined;
    const careerContext = String(input.career_context ?? '');

    const contextBlock = [
      clientProfile
        ? `## Client Profile\n${JSON.stringify(clientProfile, null, 2)}`
        : '',
      careerContext
        ? `## Career Context\n${careerContext}`
        : '',
    ].filter(Boolean).join('\n\n');

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      signal: ctx.signal,
      session_id: ctx.sessionId,
      system: `You are designing a retirement readiness conversation for a career transitioner. Your questions help them think through their situation — you are NOT a financial advisor and you never give advice.

${RETIREMENT_BRIDGE_RULES}

ABSOLUTE RULES:
- NEVER ask for specific dollar amounts, account balances, or financial figures
- Frame every question as "help you think through" — not diagnostic
- Questions should feel like a thoughtful conversation with a trusted advisor
- Each question must map to exactly one of the 7 readiness dimensions

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Generate 5-7 retirement readiness questions.

${contextBlock || '## No Prior Context\nGenerate general questions appropriate for an executive in career transition.'}

The 7 dimensions to cover (aim to cover all 7, prioritizing the most common concerns):
1. income_replacement — Financial runway and income continuity during transition
2. healthcare_bridge — Health insurance coverage after employer coverage ends
3. debt_profile — Outstanding financial obligations affecting flexibility
4. retirement_savings_impact — Effect of the transition on retirement accounts and vesting
5. insurance_gaps — Other employer-provided insurance coverages
6. tax_implications — Timing-sensitive financial events (options, deferred comp, severance)
7. lifestyle_adjustment — Household budget flexibility during the transition

REQUIREMENTS:
- 5-7 questions total (5 minimum, 7 maximum)
- First question must be easy and non-threatening
- Questions explore readiness without asking for amounts
- Frame as "help you think through" — not advisory
- NEVER ask about specific numbers, balances, or exact figures

Return JSON array:
[
  {
    "id": "rq1",
    "question": "The question text",
    "dimension": "income_replacement|healthcare_bridge|debt_profile|retirement_savings_impact|insurance_gaps|tax_implications|lifestyle_adjustment",
    "purpose": "Internal note about why we're asking this",
    "follow_up_trigger": "Optional: condition for follow-up"
  }
]`,
      }],
    });

    const text = (response as ChatResponse).text;

    let questions: RetirementQuestion[];
    try {
      const parsed = JSON.parse(repairJSON<string>(text) ?? text);
      const arr = Array.isArray(parsed) ? parsed : parsed.questions ?? [];
      questions = arr.map((q: Record<string, unknown>, i: number) => ({
        id: String(q.id ?? `rq${i + 1}`),
        question: String(q.question ?? ''),
        dimension: VALID_DIMENSIONS.includes(q.dimension as ReadinessDimension)
          ? (q.dimension as ReadinessDimension)
          : VALID_DIMENSIONS[i % VALID_DIMENSIONS.length],
        purpose: String(q.purpose ?? ''),
        follow_up_trigger: q.follow_up_trigger ? String(q.follow_up_trigger) : undefined,
      }));
    } catch {
      // Fallback questions if LLM output is malformed
      questions = [
        {
          id: 'rq1',
          question:
            'How would you describe your comfort level with your current financial runway during this career transition?',
          dimension: 'income_replacement',
          purpose: 'Assess income continuity awareness without asking for figures',
        },
        {
          id: 'rq2',
          question:
            "What's your current healthcare situation? Are you on employer coverage, and have you thought about what happens after you leave?",
          dimension: 'healthcare_bridge',
          purpose: 'Surface COBRA awareness and insurance continuity gaps',
        },
        {
          id: 'rq3',
          question:
            'Do you have any financial obligations — like a mortgage or car payments — that affect how quickly you need to find your next role?',
          dimension: 'debt_profile',
          purpose: 'Understand fixed obligations affecting search timeline flexibility',
        },
        {
          id: 'rq4',
          question:
            'Were you contributing to a 401(k) or retirement plan with your employer? Is there anything tied to your employment that you\'d lose or need to roll over?',
          dimension: 'retirement_savings_impact',
          purpose: 'Surface vesting schedules and rollover decisions without giving advice',
        },
        {
          id: 'rq5',
          question:
            'Beyond healthcare, were there other insurance coverages — like life or disability insurance — that your employer provided?',
          dimension: 'insurance_gaps',
          purpose: 'Identify employer-sponsored insurance that will lapse',
        },
        {
          id: 'rq6',
          question:
            'Are there any timing-sensitive financial events, like stock options vesting or deferred compensation, that you need to think about?',
          dimension: 'tax_implications',
          purpose: 'Surface equity/comp events that require awareness without advice',
        },
        {
          id: 'rq7',
          question:
            'How flexible is your household budget during this transition? Are there areas where you\'ve already made adjustments, or would need to?',
          dimension: 'lifestyle_adjustment',
          purpose: 'Understand discretionary budget flexibility and prior adjustments',
        },
      ];
    }

    // Store and emit
    ctx.scratchpad.questions = questions;
    ctx.emit({
      type: 'questions_ready',
      questions,
    });

    return JSON.stringify({ questions, count: questions.length });
  },
};

// ─── Tool: evaluate_readiness ─────────────────────────────────────

const evaluateReadinessTool: RetirementTool = {
  name: 'evaluate_readiness',
  description:
    'Analyze the user\'s responses across all 7 retirement readiness dimensions. For each dimension, ' +
    'assign a readiness signal (green/yellow/red), list observations from their responses, and generate ' +
    '2-3 questions they should bring to a fiduciary planner. NEVER project financial distress from neutral responses.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      responses: {
        type: 'object',
        description: 'Map of question_id to response text',
      },
    },
    required: ['responses'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const responses = input.responses as Record<string, string>;

    // Build Q&A context for the LLM
    const qaContext = (state.questions ?? []).map((q) => {
      const answer = responses[q.id] ?? '';
      return `Q (${q.dimension}): ${q.question}\nA: ${answer}`;
    }).join('\n\n');

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 6144,
      signal: ctx.signal,
      session_id: ctx.sessionId,
      system: `You are analyzing a career transitioner's retirement readiness responses. You surface observations and questions — you do NOT give financial advice.

${RETIREMENT_BRIDGE_RULES}

SIGNAL ASSIGNMENT RULES:
- green: Responses clearly indicate awareness and preparation — no obvious gaps
- yellow: Responses indicate partial awareness or potential gaps worth exploring (DEFAULT when ambiguous)
- red: Responses indicate clear gaps, lack of awareness, or time-sensitive concerns requiring immediate planner attention
- Require 2+ concerning indicators for red — never assign red from a single phrase
- Default to yellow when uncertain — never project worst case onto neutral responses
- Never assign green unless responses clearly and specifically confirm preparedness

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Analyze these retirement readiness responses across the 7 dimensions:

${qaContext}

For each dimension covered in the responses, produce an assessment. If a dimension had no question (not covered), still include it with signal 'yellow' and note "Not assessed in this session."

Return JSON array:
[
  {
    "dimension": "income_replacement|healthcare_bridge|debt_profile|retirement_savings_impact|insurance_gaps|tax_implications|lifestyle_adjustment",
    "signal": "green|yellow|red",
    "observations": ["Observation from their response", "Another observation"],
    "planner_questions": ["Question they should ask their fiduciary planner", "Another question to raise"]
  }
]

REQUIREMENTS:
- All 7 dimensions must appear in the output
- observations: 1-3 neutral, factual observations from what they said (not advice)
- planner_questions: 2-3 specific questions they should raise with a fiduciary planner
- Observations are descriptive, not prescriptive — "You mentioned you haven't reviewed COBRA costs" not "You need to get COBRA immediately"
- planner_questions should help them have a more productive planner conversation`,
      }],
    });

    const text = (response as ChatResponse).text;

    let rawAssessments: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(repairJSON<string>(text) ?? text);
      rawAssessments = Array.isArray(parsed) ? parsed : parsed.assessments ?? [];
    } catch {
      // Fallback: create yellow assessments for all 7 dimensions
      rawAssessments = VALID_DIMENSIONS.map((dim) => ({
        dimension: dim,
        signal: 'yellow',
        observations: ['Assessment could not be fully completed — responses were noted.'],
        planner_questions: ['Please review this area with your fiduciary planner.'],
      }));
    }

    // Normalize and validate each dimension assessment
    const dimensionAssessments: DimensionAssessment[] = VALID_DIMENSIONS.map((dim) => {
      const raw = rawAssessments.find(
        (a) => a.dimension === dim,
      ) ?? {
        dimension: dim,
        signal: 'yellow',
        observations: ['Not assessed in this session.'],
        planner_questions: ['Discuss this area with your fiduciary planner.'],
      };

      const signal: ReadinessSignal = VALID_SIGNALS.includes(raw.signal as ReadinessSignal)
        ? (raw.signal as ReadinessSignal)
        : 'yellow';

      return {
        dimension: dim,
        signal,
        observations: Array.isArray(raw.observations)
          ? (raw.observations as string[]).slice(0, 3)
          : ['No observations recorded.'],
        questions_to_ask_planner: Array.isArray(raw.planner_questions)
          ? (raw.planner_questions as string[]).slice(0, 3)
          : ['Discuss this area with your fiduciary planner.'],
      };
    });

    ctx.scratchpad.dimension_assessments = dimensionAssessments;

    return JSON.stringify({
      dimension_assessments: dimensionAssessments,
      signal_counts: {
        green: dimensionAssessments.filter((d) => d.signal === 'green').length,
        yellow: dimensionAssessments.filter((d) => d.signal === 'yellow').length,
        red: dimensionAssessments.filter((d) => d.signal === 'red').length,
      },
    });
  },
};

// ─── Tool: build_readiness_summary ───────────────────────────────

const buildReadinessSummaryTool: RetirementTool = {
  name: 'build_readiness_summary',
  description:
    'Synthesize all 7 dimension assessments into a RetirementReadinessSummary. Produces key ' +
    'observations, recommended planner topics, and a shareable plain-language summary with ' +
    'a mandatory fiduciary disclaimer footer.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      dimension_assessments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            dimension: { type: 'string' },
            signal: { type: 'string' },
            observations: { type: 'array', items: { type: 'string' } },
            planner_questions: { type: 'array', items: { type: 'string' } },
          },
        },
        description: 'The 7 dimension assessments produced by evaluate_readiness',
      },
    },
    required: ['dimension_assessments'],
  },
  async execute(input, ctx) {
    const scratchpadAssessments = ctx.scratchpad.dimension_assessments;
    const rawAssessments: Record<string, unknown>[] = Array.isArray(input.dimension_assessments)
      ? (input.dimension_assessments as Record<string, unknown>[])
      : Array.isArray(scratchpadAssessments)
        ? (scratchpadAssessments as Record<string, unknown>[])
        : [];

    // Validate dimension assessments
    const dimensionAssessments: DimensionAssessment[] = rawAssessments.map((a) => ({
      dimension: VALID_DIMENSIONS.includes(a.dimension as ReadinessDimension)
        ? (a.dimension as ReadinessDimension)
        : ('income_replacement' as ReadinessDimension),
      signal: VALID_SIGNALS.includes(a.signal as ReadinessSignal)
        ? (a.signal as ReadinessSignal)
        : ('yellow' as ReadinessSignal),
      observations: Array.isArray(a.observations) ? (a.observations as string[]) : [],
      questions_to_ask_planner: Array.isArray(a.questions_to_ask_planner)
        ? (a.questions_to_ask_planner as string[])
        : [],
    }));

    // Determine overall readiness signal — worst signal wins
    const hasRed = dimensionAssessments.some((d) => d.signal === 'red');
    const hasYellow = dimensionAssessments.some((d) => d.signal === 'yellow');
    const overallSignal: ReadinessSignal = hasRed ? 'red' : hasYellow ? 'yellow' : 'green';

    // Build context for LLM synthesis
    const assessmentContext = dimensionAssessments.map((d) => {
      const signalEmoji = d.signal === 'green' ? '●' : d.signal === 'yellow' ? '◐' : '○';
      return `${signalEmoji} ${d.dimension} (${d.signal.toUpperCase()})\n` +
        `Observations: ${d.observations.join('; ')}\n` +
        `Planner questions: ${d.questions_to_ask_planner.join('; ')}`;
    }).join('\n\n');

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      signal: ctx.signal,
      session_id: ctx.sessionId,
      system: `You are synthesizing a retirement readiness assessment. You produce observations and a discussion guide — you do NOT give financial advice.

${RETIREMENT_BRIDGE_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Synthesize these 7 dimension assessments into a summary:

${assessmentContext}

Overall signal: ${overallSignal.toUpperCase()}

Return JSON:
{
  "key_observations": ["3-5 plain-language observations about this person's retirement readiness picture"],
  "recommended_planner_topics": ["3-7 specific topics to raise with a fiduciary planner, ordered by urgency"],
  "shareable_summary": "Multi-paragraph plain-language summary showing signal per dimension and key observations. Ends with fiduciary disclaimer. Suitable for sharing with a planner."
}

REQUIREMENTS:
- key_observations: 3-5 bullets, neutral and factual, no advice
- recommended_planner_topics: Specific enough to guide a productive 30-min planner conversation
- shareable_summary: Use plain language. Show each dimension with its signal indicator (Green/Yellow/Red). Include 1-2 key observations per dimension. End with: "IMPORTANT: This assessment surfaces areas for discussion only. It does not constitute financial advice. Please consult a qualified fiduciary financial planner before making any financial decisions."
- Never use dollar amounts, specific percentages, or prescriptive language in any field`,
      }],
    });

    const text = (response as ChatResponse).text;

    let synthesis: {
      key_observations: string[];
      recommended_planner_topics: string[];
      shareable_summary: string;
    };

    try {
      synthesis = JSON.parse(repairJSON<string>(text) ?? text);
    } catch {
      synthesis = {
        key_observations: [
          'Your assessment has been recorded across all 7 retirement readiness dimensions.',
          'Several areas have been identified as worth discussing with a fiduciary planner.',
        ],
        recommended_planner_topics: [
          'Review your current healthcare coverage options and costs after employer coverage ends',
          'Discuss retirement account rollover options and timing',
          'Review any time-sensitive equity or compensation events',
        ],
        shareable_summary:
          'Retirement readiness assessment completed. Please review the dimension-level findings with your fiduciary planner.\n\n' +
          FIDUCIARY_DISCLAIMER,
      };
    }

    // Enforce fiduciary disclaimer in shareable summary — append if LLM omitted it
    const summaryText = String(synthesis.shareable_summary ?? '');
    if (!summaryText.toLowerCase().includes('fiduciary') && !summaryText.toLowerCase().includes('not financial advice')) {
      synthesis.shareable_summary = summaryText + '\n\n' + FIDUCIARY_DISCLAIMER;
    }

    const summary: RetirementReadinessSummary = {
      overall_readiness: overallSignal,
      dimensions: dimensionAssessments,
      key_observations: Array.isArray(synthesis.key_observations)
        ? synthesis.key_observations.slice(0, 5)
        : [],
      recommended_planner_topics: Array.isArray(synthesis.recommended_planner_topics)
        ? synthesis.recommended_planner_topics.slice(0, 7)
        : [],
      shareable_summary: String(synthesis.shareable_summary ?? ''),
    };

    ctx.scratchpad.readiness_summary = summary;

    ctx.emit({
      type: 'assessment_complete',
      session_id: ctx.getState().session_id,
      summary,
    });

    return JSON.stringify({
      summary,
      message: `Retirement readiness assessment complete. Overall signal: ${overallSignal}. ${
        dimensionAssessments.filter((d) => d.signal === 'red').length
      } dimension(s) flagged for immediate planner discussion.`,
    });
  },
};

// ─── Export ───────────────────────────────────────────────────────

export const assessorTools: RetirementTool[] = [
  generateAssessmentQuestionsTool,
  evaluateReadinessTool,
  buildReadinessSummaryTool,
];
