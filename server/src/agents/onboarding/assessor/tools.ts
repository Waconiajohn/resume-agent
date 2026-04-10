/**
 * Onboarding Assessor — Tool definitions.
 *
 * 4 tools:
 * - generate_questions: Create 3-5 personalized assessment questions
 * - evaluate_responses: Analyze user answers for key signals
 * - detect_financial_segment: Infer financial segment from indirect signals
 * - build_client_profile: Synthesize everything into the Client Profile
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  OnboardingState,
  OnboardingSSEEvent,
  AssessmentQuestion,
  ClientProfile,
  AssessmentSummary,
  FinancialSegment,
  EmotionalState,
  CareerLevel,
} from '../types.js';
import { ONBOARDING_RULES } from '../knowledge/rules.js';
import { llm, MODEL_MID, MODEL_LIGHT } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type OnboardingTool = AgentTool<OnboardingState, OnboardingSSEEvent>;

// ─── Validation helpers ──────────────────────────────────────────

const VALID_CATEGORIES: AssessmentQuestion['category'][] = [
  'career_context',
  'transition_drivers',
  'timeline_and_urgency',
  'goals_and_aspirations',
  'support_needs',
];

const VALID_FINANCIAL_SEGMENTS: FinancialSegment[] = [
  'crisis',
  'stressed',
  'ideal',
  'comfortable',
];

const VALID_EMOTIONAL_STATES: EmotionalState[] = [
  'denial',
  'anger',
  'bargaining',
  'depression',
  'acceptance',
  'growth',
];

const VALID_CAREER_LEVELS: CareerLevel[] = [
  'mid_level',
  'senior',
  'director',
  'vp',
  'c_suite',
];

// ─── Tool: generate_questions ────────────────────────────────────

const generateQuestionsTool: OnboardingTool = {
  name: 'generate_questions',
  description:
    'Generate 3-5 personalized assessment questions for the user. Questions should be high-signal, ' +
    'conversational, and designed to reveal career context, transition drivers, timeline urgency, ' +
    'goals, and support needs — without directly asking about finances.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'The user\'s resume text if available. Omit or pass empty string if no resume provided.',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const resumeText = String(input.resume_text ?? '');
    const hasResume = resumeText.length > 50;

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      signal: ctx.signal,
      session_id: ctx.sessionId,
      system: `You are a senior career advisor designing an intake assessment. Generate 3-5 questions that feel like a warm conversation, not a form.

${ONBOARDING_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Generate assessment questions for a new user.

${hasResume ? `## Resume Available\n${resumeText.slice(0, 3000)}\n\nSince we have a resume, skip basic career questions and focus on transition context, goals, and what they want next.` : '## No Resume\nNo resume provided — include a question about their most recent role and career level.'}

REQUIREMENTS:
- 3-5 questions total (3 if resume provides strong context, 5 if starting from scratch)
- Each question must be open-ended, answerable in 2-3 sentences
- At least one question about timeline/urgency (reveals financial segment indirectly)
- At least one question about what they want next (not what they had)
- First question should be easy and rapport-building
- NEVER ask about salary, finances, savings, or employment status directly

Return JSON array:
[
  {
    "id": "q1",
    "question": "The question text",
    "category": "career_context|transition_drivers|timeline_and_urgency|goals_and_aspirations|support_needs",
    "purpose": "Internal note about why we're asking this",
    "follow_up_trigger": "Optional: condition for follow-up"
  }
]`,
      }],
    });

    const text = (response).text;

    let questions: AssessmentQuestion[];
    try {
      const parsed = JSON.parse(repairJSON<string>(text) ?? text);
      const arr = Array.isArray(parsed) ? parsed : parsed.questions ?? [];
      questions = arr.map((q: Record<string, unknown>, i: number) => ({
        id: String(q.id ?? `q${i + 1}`),
        question: String(q.question ?? ''),
        category: VALID_CATEGORIES.includes(q.category as AssessmentQuestion['category'])
          ? (q.category as AssessmentQuestion['category'])
          : 'career_context',
        purpose: String(q.purpose ?? ''),
        follow_up_trigger: q.follow_up_trigger ? String(q.follow_up_trigger) : undefined,
      }));
    } catch {
      // Fallback questions if LLM output is malformed
      questions = [
        {
          id: 'q1',
          question: 'Tell me about your most recent role — what did you enjoy most about it?',
          category: 'career_context',
          purpose: 'Establish rapport and understand career identity',
        },
        {
          id: 'q2',
          question: 'What prompted this career transition, and how are you feeling about it?',
          category: 'transition_drivers',
          purpose: 'Understand transition type and emotional state',
        },
        {
          id: 'q3',
          question: 'What does your ideal timeline look like for this transition?',
          category: 'timeline_and_urgency',
          purpose: 'Indirectly reveals financial segment through urgency language',
        },
        {
          id: 'q4',
          question: 'If you could design your next role from scratch, what would it look like?',
          category: 'goals_and_aspirations',
          purpose: 'Forward-looking goals, not backward-looking regrets',
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

// ─── Tool: evaluate_responses ────────────────────────────────────

const evaluateResponsesTool: OnboardingTool = {
  name: 'evaluate_responses',
  description:
    'Analyze the user\'s responses to extract career level, industry, years of experience, goals, ' +
    'constraints, and identify financial and emotional signals from their language.',
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
    const qaContext = state.questions.map((q) => {
      const answer = responses[q.id] ?? '';
      return `Q (${q.category}): ${q.question}\nA: ${answer}`;
    }).join('\n\n');

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      signal: ctx.signal,
      session_id: ctx.sessionId,
      system: `You are a senior career advisor analyzing a client's intake responses. Extract actionable signals for their career coaching profile.

${ONBOARDING_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Analyze these assessment responses:

${qaContext}

Extract and return JSON:
{
  "career_level": "mid_level|senior|director|vp|c_suite",
  "industry": "primary industry",
  "years_experience": number,
  "transition_type": "involuntary|voluntary|preemptive",
  "goals": ["goal1", "goal2"],
  "constraints": ["constraint1", "constraint2"],
  "strengths_self_reported": ["strength1", "strength2"],
  "key_insights": ["insight1", "insight2"],
  "financial_signals": ["signal from their language that indicates financial state"],
  "emotional_signals": ["signal from their language that indicates emotional state"],
  "recommended_actions": ["action1", "action2"]
}

IMPORTANT:
- financial_signals: Look for timeline urgency language, not direct financial statements. "Need to find something soon" vs "taking my time" are financial signals.
- emotional_signals: Look for grief cycle markers — denial, anger, bargaining, depression, acceptance, growth
- career_level: Infer from role titles, scope of responsibility, years mentioned
- transition_type: involuntary if they were laid off/fired, voluntary if they chose to leave, preemptive if their company is struggling`,
      }],
    });

    const text = (response).text;

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(repairJSON<string>(text) ?? text);
    } catch {
      analysis = {
        career_level: 'senior',
        industry: 'Unknown',
        years_experience: 10,
        transition_type: 'unknown',
        goals: [],
        constraints: [],
        strengths_self_reported: [],
        key_insights: ['Unable to fully analyze responses'],
        financial_signals: [],
        emotional_signals: [],
        recommended_actions: ['Schedule detailed intake'],
      };
    }

    const summary: AssessmentSummary = {
      key_insights: Array.isArray(analysis.key_insights)
        ? (analysis.key_insights as string[])
        : [],
      financial_signals: Array.isArray(analysis.financial_signals)
        ? (analysis.financial_signals as string[])
        : [],
      emotional_signals: Array.isArray(analysis.emotional_signals)
        ? (analysis.emotional_signals as string[])
        : [],
      recommended_actions: Array.isArray(analysis.recommended_actions)
        ? (analysis.recommended_actions as string[])
        : [],
    };

    ctx.scratchpad.assessment_summary = summary;
    ctx.scratchpad.evaluation = analysis;

    return JSON.stringify({
      summary,
      career_level: analysis.career_level,
      industry: analysis.industry,
      years_experience: analysis.years_experience,
      transition_type: analysis.transition_type,
      goals: analysis.goals,
      constraints: analysis.constraints,
      strengths_self_reported: analysis.strengths_self_reported,
    });
  },
};

// ─── Tool: detect_financial_segment ──────────────────────────────

const detectFinancialSegmentTool: OnboardingTool = {
  name: 'detect_financial_segment',
  description:
    'Classify the user into a financial segment (crisis/stressed/ideal/comfortable) based on ' +
    'indirect signals. NEVER asks about money — infers from timeline urgency, language patterns, ' +
    'and behavioral cues. Requires at least 2 supporting signals.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      financial_signals: {
        type: 'array',
        items: { type: 'string' },
        description: 'Indirect signals about financial state from response analysis',
      },
      emotional_signals: {
        type: 'array',
        items: { type: 'string' },
        description: 'Emotional state signals that may correlate with financial pressure',
      },
      timeline_language: {
        type: 'string',
        description: 'The user\'s exact language about their timeline preferences',
      },
    },
    required: ['financial_signals'],
  },
  async execute(input, ctx) {
    const financialSignals = Array.isArray(input.financial_signals)
      ? (input.financial_signals as string[])
      : [];
    const emotionalSignals = Array.isArray(input.emotional_signals)
      ? (input.emotional_signals as string[])
      : [];
    const timelineLanguage = String(input.timeline_language ?? '');

    const response = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 1024,
      signal: ctx.signal,
      session_id: ctx.sessionId,
      system: `You classify a job seeker's financial segment from indirect signals. You NEVER see actual financial data.

Segments:
- crisis: "need ASAP", "running out of runway", "bills to pay", panic tone, extreme urgency
- stressed: "want to move quickly", "few months runway", "prefer sooner", moderate urgency
- ideal: "taking my time", "want the right fit", "have flexibility", relaxed but purposeful
- comfortable: "exploring options", "no rush", "might step back", strategic/exploratory

RULES:
- Require at least 2 supporting signals for any segment other than 'ideal'
- Default to 'ideal' when signals are ambiguous
- Never assume worst case

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Classify financial segment from these signals:

Financial signals: ${JSON.stringify(financialSignals)}
Emotional signals: ${JSON.stringify(emotionalSignals)}
Timeline language: "${timelineLanguage}"

Return JSON:
{
  "segment": "crisis|stressed|ideal|comfortable",
  "confidence": "high|medium|low",
  "supporting_signals": ["signal1", "signal2"]
}`,
      }],
    });

    const text = (response).text;

    let result: { segment: string; confidence: string; supporting_signals: string[] };
    try {
      result = JSON.parse(repairJSON<string>(text) ?? text);
    } catch {
      result = { segment: 'ideal', confidence: 'low', supporting_signals: [] };
    }

    // Validate segment
    const segment: FinancialSegment = VALID_FINANCIAL_SEGMENTS.includes(result.segment as FinancialSegment)
      ? (result.segment as FinancialSegment)
      : 'ideal';

    // Enforce minimum 2 signals for non-ideal segments
    const signals = Array.isArray(result.supporting_signals) ? result.supporting_signals : [];
    const finalSegment = (segment !== 'ideal' && signals.length < 2) ? 'ideal' : segment;

    ctx.scratchpad.financial_segment = finalSegment;

    return JSON.stringify({
      segment: finalSegment,
      confidence: result.confidence ?? 'medium',
      supporting_signals: signals,
    });
  },
};

// ─── Tool: build_client_profile ──────────────────────────────────

const buildClientProfileTool: OnboardingTool = {
  name: 'build_client_profile',
  description:
    'Synthesize all assessment data into the final Client Profile. Determines recommended starting ' +
    'point and coaching tone based on financial segment and emotional state.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      career_level: {
        type: 'string',
        enum: ['mid_level', 'senior', 'director', 'vp', 'c_suite'],
        description: 'Inferred career level',
      },
      industry: {
        type: 'string',
        description: 'Primary industry',
      },
      years_experience: {
        type: 'number',
        description: 'Approximate years of experience',
      },
      financial_segment: {
        type: 'string',
        enum: ['crisis', 'stressed', 'ideal', 'comfortable'],
        description: 'Detected financial segment',
      },
      emotional_state: {
        type: 'string',
        enum: ['denial', 'anger', 'bargaining', 'depression', 'acceptance', 'growth'],
        description: 'Detected emotional state',
      },
      transition_type: {
        type: 'string',
        enum: ['involuntary', 'voluntary', 'preemptive'],
        description: 'Type of career transition',
      },
      goals: {
        type: 'array',
        items: { type: 'string' },
        description: 'Career goals extracted from responses',
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Constraints and non-negotiables',
      },
      strengths_self_reported: {
        type: 'array',
        items: { type: 'string' },
        description: 'Self-reported strengths',
      },
    },
    required: ['career_level', 'industry', 'financial_segment', 'emotional_state', 'transition_type'],
  },
  async execute(input, ctx) {
    // Validate enums with fallbacks
    const careerLevel: CareerLevel = VALID_CAREER_LEVELS.includes(input.career_level as CareerLevel)
      ? (input.career_level as CareerLevel)
      : 'senior';

    const financialSegment: FinancialSegment = VALID_FINANCIAL_SEGMENTS.includes(input.financial_segment as FinancialSegment)
      ? (input.financial_segment as FinancialSegment)
      : 'ideal';

    const emotionalState: EmotionalState = VALID_EMOTIONAL_STATES.includes(input.emotional_state as EmotionalState)
      ? (input.emotional_state as EmotionalState)
      : 'acceptance';

    const transitionType = (['involuntary', 'voluntary', 'preemptive'] as const).includes(
      input.transition_type as 'involuntary' | 'voluntary' | 'preemptive',
    )
      ? (input.transition_type as 'involuntary' | 'voluntary' | 'preemptive')
      : 'involuntary';

    // Determine urgency score (1-10)
    const urgencyMap: Record<FinancialSegment, number> = {
      crisis: 9,
      stressed: 7,
      ideal: 5,
      comfortable: 3,
    };
    const urgencyScore = urgencyMap[financialSegment];

    // Determine recommended starting point
    let recommendedStartingPoint: ClientProfile['recommended_starting_point'] = 'resume';
    const goals = Array.isArray(input.goals) ? (input.goals as string[]) : [];
    const goalsText = goals.join(' ').toLowerCase();

    if (goalsText.includes('linkedin') || goalsText.includes('profile') || goalsText.includes('visibility')) {
      recommendedStartingPoint = 'linkedin';
    } else if (goalsText.includes('network') || goalsText.includes('connect') || goalsText.includes('referral')) {
      recommendedStartingPoint = 'networking';
    } else if (goalsText.includes('interview') || goalsText.includes('practice') || goalsText.includes('prep')) {
      recommendedStartingPoint = 'interview_prep';
    } else if (goalsText.includes('pivot') || goalsText.includes('change career') || goalsText.includes('explore') || goalsText.includes('unsure')) {
      recommendedStartingPoint = 'career_exploration';
    }

    // Determine coaching tone
    let coachingTone: ClientProfile['coaching_tone'] = 'direct';
    if (
      financialSegment === 'crisis' ||
      financialSegment === 'stressed' ||
      emotionalState === 'denial' ||
      emotionalState === 'anger' ||
      emotionalState === 'depression'
    ) {
      coachingTone = 'supportive';
    } else if (emotionalState === 'growth') {
      coachingTone = 'motivational';
    }

    const profile: ClientProfile = {
      career_level: careerLevel,
      industry: String(input.industry ?? 'Unknown'),
      years_experience: typeof input.years_experience === 'number' ? input.years_experience : 10,
      financial_segment: financialSegment,
      emotional_state: emotionalState,
      transition_type: transitionType,
      goals,
      constraints: Array.isArray(input.constraints) ? (input.constraints as string[]) : [],
      strengths_self_reported: Array.isArray(input.strengths_self_reported)
        ? (input.strengths_self_reported as string[])
        : [],
      urgency_score: urgencyScore,
      recommended_starting_point: recommendedStartingPoint,
      coaching_tone: coachingTone,
    };

    ctx.scratchpad.client_profile = profile;

    // Note: assessment_complete SSE event is emitted by finalizeResult in product.ts
    // to avoid duplicate emission.

    return JSON.stringify({
      profile,
      message: `Client profile built. Recommended starting point: ${recommendedStartingPoint}. Coaching tone: ${coachingTone}.`,
    });
  },
};

// ─── Export ──────────────────────────────────────────────────────

export const assessorTools: OnboardingTool[] = [
  generateQuestionsTool,
  evaluateResponsesTool,
  detectFinancialSegmentTool,
  buildClientProfileTool,
];
