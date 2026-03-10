/**
 * Salary Negotiation Strategist — Tool definitions.
 *
 * 5 tools:
 * - design_strategy: Design the overall negotiation strategy
 * - write_talking_points: Generate evidence-backed talking points
 * - simulate_scenario: Simulate a negotiation scenario
 * - write_counter_response: Write template counter-offer responses
 * - assemble_negotiation_prep: Assemble the full negotiation prep document
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  SalaryNegotiationState,
  SalaryNegotiationSSEEvent,
  TalkingPoint,
  NegotiationScenario,
  ScenarioType,
} from '../types.js';
import { SCENARIO_LABELS } from '../types.js';
import { SALARY_NEGOTIATION_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type StrategistTool = AgentTool<SalaryNegotiationState, SalaryNegotiationSSEEvent>;

// ─── Helpers ───────────────────────────────────────────────────────

function buildStateContext(state: SalaryNegotiationState): string {
  const parts: string[] = [];

  // Offer details
  const offer = state.offer_details;
  parts.push('## Offer Details');
  parts.push(`Company: ${offer.company}`);
  parts.push(`Role: ${offer.role}`);
  if (offer.base_salary != null) parts.push(`Base Salary Offered: $${offer.base_salary.toLocaleString()}`);
  if (offer.total_comp != null) parts.push(`Total Comp Offered: $${offer.total_comp.toLocaleString()}`);
  if (offer.equity_details) parts.push(`Equity: ${offer.equity_details}`);
  if (offer.other_details) parts.push(`Other: ${offer.other_details}`);

  // Current compensation
  if (state.current_compensation) {
    parts.push('\n## Current Compensation');
    if (state.current_compensation.base_salary != null)
      parts.push(`Current Base: $${state.current_compensation.base_salary.toLocaleString()}`);
    if (state.current_compensation.total_comp != null)
      parts.push(`Current Total Comp: $${state.current_compensation.total_comp.toLocaleString()}`);
    if (state.current_compensation.equity) parts.push(`Current Equity: ${state.current_compensation.equity}`);
  }

  // Target context
  if (state.target_context) {
    parts.push('\n## Target Context');
    parts.push(`Target Role: ${state.target_context.target_role}`);
    parts.push(`Industry: ${state.target_context.target_industry}`);
    parts.push(`Seniority: ${state.target_context.target_seniority}`);
  }

  // Resume data
  if (state.resume_data) {
    const rd = state.resume_data;
    parts.push('\n## Candidate');
    parts.push(`Name: ${rd.name}`);
    parts.push(`Current Title: ${rd.current_title}`);
    parts.push(`Summary: ${rd.career_summary}`);
    if (rd.key_skills?.length > 0) parts.push(`Key Skills: ${rd.key_skills.join(', ')}`);
    if (rd.key_achievements?.length > 0) {
      parts.push('Key Achievements:');
      for (const a of rd.key_achievements.slice(0, 5)) {
        parts.push(`- ${a}`);
      }
    }
  }

  // Market research
  if (state.market_research) {
    const mr = state.market_research;
    parts.push('\n## Market Research');
    parts.push(`Role: ${mr.role} | Industry: ${mr.industry} | Geography: ${mr.geography}`);
    parts.push(`Salary Range: P25=$${mr.salary_range.p25.toLocaleString()} | P50=$${mr.salary_range.p50.toLocaleString()} | P75=$${mr.salary_range.p75.toLocaleString()} | P90=$${mr.salary_range.p90.toLocaleString()}`);
    parts.push(`Total Comp Estimate: Low=$${mr.total_comp_estimate.low.toLocaleString()} | Mid=$${mr.total_comp_estimate.mid.toLocaleString()} | High=$${mr.total_comp_estimate.high.toLocaleString()}`);
    parts.push(`Market Context: ${mr.market_context}`);
    parts.push(`Data Confidence: ${mr.data_confidence}`);
  }

  // Leverage points
  if (state.leverage_points && state.leverage_points.length > 0) {
    parts.push('\n## Leverage Points');
    for (const lp of state.leverage_points) {
      parts.push(`- [${lp.strength.toUpperCase()}] ${lp.category}: ${lp.description}`);
      parts.push(`  Talking point: ${lp.talking_point}`);
    }
  }

  // Total comp breakdown
  if (state.total_comp_breakdown && state.total_comp_breakdown.length > 0) {
    parts.push('\n## Total Comp Breakdown');
    for (const cb of state.total_comp_breakdown) {
      parts.push(`- ${cb.component}: Current=${cb.current_value != null ? `$${cb.current_value.toLocaleString()}` : 'N/A'} | Market=$${cb.market_value.toLocaleString()} | Negotiable=${cb.negotiable}`);
    }
  }

  // Platform context
  if (state.platform_context?.positioning_strategy) {
    parts.push('\n## Positioning Strategy');
    parts.push(JSON.stringify(state.platform_context.positioning_strategy, null, 2));
  }
  if (state.platform_context?.why_me_story) {
    parts.push('\n## Why-Me Narrative');
    parts.push(state.platform_context.why_me_story);
  }

  return parts.join('\n');
}

// ─── Tool: design_strategy ────────────────────────────────────────

const designStrategyTool: StrategistTool = {
  name: 'design_strategy',
  description:
    'Design the overall negotiation strategy including approach, opening position, walk-away point, ' +
    'and BATNA based on market research and leverage analysis.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const stateContext = buildStateContext(state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a senior negotiation strategist specializing in executive compensation. You design evidence-based negotiation strategies for mid-to-senior executives (45+).

${SALARY_NEGOTIATION_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Design a comprehensive negotiation strategy based on the following context.

${stateContext}

REQUIREMENTS:
- Determine the optimal approach (collaborative, competitive, or value-anchored) based on the candidate's leverage and market position
- Define a specific opening position with dollar amounts and rationale
- Set a clear walk-away point — the minimum acceptable package
- Articulate the BATNA (Best Alternative to a Negotiated Agreement)
- Ground every recommendation in the market research and leverage points
- Tailor the strategy to executive-level negotiations — peer-level tone, not supplicant

Return JSON:
{
  "approach": "collaborative | competitive | value-anchored — with explanation",
  "opening_position": "Specific opening position with dollar amounts and rationale",
  "walk_away_point": "Minimum acceptable package with specific thresholds",
  "batna": "Best alternative if negotiation fails — be specific and realistic"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        approach: 'value-anchored',
        opening_position: response.text.trim().slice(0, 500),
        walk_away_point: 'Unable to parse — review raw output',
        batna: 'Unable to parse — review raw output',
      };
    }

    const strategy = {
      approach: String(result.approach ?? 'value-anchored'),
      opening_position: String(result.opening_position ?? ''),
      walk_away_point: String(result.walk_away_point ?? ''),
      batna: String(result.batna ?? ''),
    };

    scratchpad.negotiation_strategy = strategy;
    state.negotiation_strategy = strategy;

    return JSON.stringify({
      success: true,
      approach: strategy.approach,
      has_opening_position: strategy.opening_position.length > 0,
      has_walk_away: strategy.walk_away_point.length > 0,
      has_batna: strategy.batna.length > 0,
    });
  },
};

// ─── Tool: write_talking_points ───────────────────────────────────

const writeTalkingPointsTool: StrategistTool = {
  name: 'write_talking_points',
  description:
    'Write specific, evidence-backed talking points the candidate can use in negotiation conversations. ' +
    'Each point includes the topic, what to say, supporting evidence, and tone guidance.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const stateContext = buildStateContext(state);

    const strategyContext = scratchpad.negotiation_strategy
      ? `\n## Negotiation Strategy\n${JSON.stringify(scratchpad.negotiation_strategy, null, 2)}`
      : '';

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a senior negotiation strategist specializing in executive compensation. You write specific, actionable talking points grounded in evidence.

${SALARY_NEGOTIATION_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write negotiation talking points based on the following context.

${stateContext}
${strategyContext}

REQUIREMENTS:
- Generate 5-8 talking points covering: base salary, total comp, equity, role scope, growth trajectory, and any unique leverage
- Each point must include supporting evidence from market research or the candidate's background
- Tone guidance should match the negotiation approach (collaborative vs competitive vs value-anchored)
- Points should be specific enough to use verbatim in conversation, not vague platitudes
- Never fabricate credentials, achievements, or market data
- Calibrate to executive-level dialogue — confident, peer-level, data-driven

Return JSON:
{
  "talking_points": [
    {
      "topic": "area this point addresses",
      "point": "the core talking point — what to actually say",
      "evidence": "supporting data or experience backing this up",
      "tone_guidance": "how to deliver this point"
    }
  ]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = { talking_points: [] };
    }

    const talkingPoints: TalkingPoint[] = Array.isArray(result.talking_points)
      ? result.talking_points.map((tp: Record<string, unknown>) => ({
          topic: String(tp.topic ?? ''),
          point: String(tp.point ?? ''),
          evidence: String(tp.evidence ?? ''),
          tone_guidance: String(tp.tone_guidance ?? ''),
        }))
      : [];

    scratchpad.talking_points = talkingPoints;
    state.talking_points = talkingPoints;

    const leverageCount = state.leverage_points?.length ?? 0;
    const approach = (scratchpad.negotiation_strategy as Record<string, unknown>)?.approach ?? 'value-anchored';

    ctx.emit({
      type: 'strategy_ready',
      approach: String(approach),
      leverage_count: leverageCount,
    });

    return JSON.stringify({
      success: true,
      talking_point_count: talkingPoints.length,
      topics: talkingPoints.map((tp) => tp.topic),
    });
  },
};

// ─── Tool: simulate_scenario ──────────────────────────────────────

const simulateScenarioTool: StrategistTool = {
  name: 'simulate_scenario',
  description:
    'Simulate a negotiation scenario with the employer\'s likely position, recommended response, ' +
    'talking points, risks, and fallback position.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      scenario_type: {
        type: 'string',
        enum: ['initial_offer_response', 'counter_offer', 'final_negotiation'],
        description: 'The type of negotiation scenario to simulate',
      },
    },
    required: ['scenario_type'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const scenarioType = String(input.scenario_type ?? 'initial_offer_response') as ScenarioType;
    const stateContext = buildStateContext(state);

    const strategyContext = scratchpad.negotiation_strategy
      ? `\n## Negotiation Strategy\n${JSON.stringify(scratchpad.negotiation_strategy, null, 2)}`
      : '';

    const existingScenarios = Array.isArray(scratchpad.scenarios) ? scratchpad.scenarios : [];
    const existingContext = existingScenarios.length > 0
      ? `\n## Previously Simulated Scenarios\n${existingScenarios.map((s: Record<string, unknown>) => `- ${String(s.type)}: ${String(s.situation).slice(0, 100)}...`).join('\n')}`
      : '';

    const scenarioLabel = SCENARIO_LABELS[scenarioType] ?? scenarioType;

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a senior negotiation strategist specializing in executive compensation. You simulate realistic negotiation scenarios with actionable guidance.

${SALARY_NEGOTIATION_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Simulate a "${scenarioLabel}" negotiation scenario.

${stateContext}
${strategyContext}
${existingContext}

REQUIREMENTS:
- Describe the specific situation the candidate will face in this scenario
- Predict the employer's likely position and arguments
- Provide a recommended response strategy specific to this scenario
- Include 3-5 specific talking points to use
- Identify 2-3 risks to watch for
- Define a clear fallback position if the primary approach stalls
- Ground recommendations in market data and the candidate's leverage points
- Maintain executive-level tone throughout — confident, professional, never desperate

Return JSON:
{
  "type": "${scenarioType}",
  "situation": "description of this negotiation scenario",
  "recommended_response": "detailed recommended response strategy",
  "talking_points": ["specific point 1", "specific point 2", "..."],
  "risks": ["risk 1", "risk 2"],
  "fallback_position": "what to do if primary approach does not work"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        type: scenarioType,
        situation: response.text.trim().slice(0, 500),
        recommended_response: 'Unable to parse — review raw output',
        talking_points: [],
        risks: [],
        fallback_position: 'Unable to parse — review raw output',
      };
    }

    const scenario: NegotiationScenario = {
      type: scenarioType,
      situation: String(result.situation ?? ''),
      recommended_response: String(result.recommended_response ?? ''),
      talking_points: Array.isArray(result.talking_points)
        ? result.talking_points.map(String)
        : [],
      risks: Array.isArray(result.risks)
        ? result.risks.map(String)
        : [],
      fallback_position: String(result.fallback_position ?? ''),
    };

    // Append to scenarios array
    if (!Array.isArray(scratchpad.scenarios)) {
      scratchpad.scenarios = [];
    }
    (scratchpad.scenarios as NegotiationScenario[]).push(scenario);

    // Update state
    if (!state.scenarios) {
      state.scenarios = [];
    }
    state.scenarios.push(scenario);

    ctx.emit({
      type: 'scenario_complete',
      scenario_type: scenarioType,
      talking_point_count: scenario.talking_points.length,
    });

    return JSON.stringify({
      success: true,
      scenario_type: scenarioType,
      label: scenarioLabel,
      talking_point_count: scenario.talking_points.length,
      risk_count: scenario.risks.length,
      total_scenarios: (scratchpad.scenarios as NegotiationScenario[]).length,
    });
  },
};

// ─── Tool: write_counter_response ─────────────────────────────────

const writeCounterResponseTool: StrategistTool = {
  name: 'write_counter_response',
  description:
    'Write template responses for counter-offering including email templates and verbal scripts ' +
    'calibrated to executive tone.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const stateContext = buildStateContext(state);

    const strategyContext = scratchpad.negotiation_strategy
      ? `\n## Negotiation Strategy\n${JSON.stringify(scratchpad.negotiation_strategy, null, 2)}`
      : '';

    const talkingPointsContext = Array.isArray(scratchpad.talking_points)
      ? `\n## Talking Points\n${(scratchpad.talking_points as TalkingPoint[]).map((tp) => `- ${tp.topic}: ${tp.point}`).join('\n')}`
      : '';

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: `You are a senior negotiation strategist specializing in executive compensation. You write polished counter-offer communications calibrated for executive-level dialogue.

${SALARY_NEGOTIATION_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write counter-offer response templates based on the following context.

${stateContext}
${strategyContext}
${talkingPointsContext}

REQUIREMENTS:
- Write an email template for the initial counter-offer response (200-300 words)
- Write a verbal script for the counter-offer conversation (150-250 words)
- Write a follow-up email template after the counter-offer conversation (100-150 words)
- All templates should use the negotiation strategy and talking points
- Calibrate tone to executive level — confident, professional, collaborative
- Include placeholders for specific numbers (e.g., [TARGET_BASE], [COUNTER_AMOUNT])
- Never sound desperate, entitled, or adversarial
- Frame everything around mutual value creation

Return JSON:
{
  "email_counter_offer": "email template for counter-offer",
  "verbal_script": "verbal script for counter-offer conversation",
  "follow_up_email": "follow-up email after counter-offer conversation"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        email_counter_offer: response.text.trim().slice(0, 1000),
        verbal_script: '',
        follow_up_email: '',
      };
    }

    const counterResponses = {
      email_counter_offer: String(result.email_counter_offer ?? ''),
      verbal_script: String(result.verbal_script ?? ''),
      follow_up_email: String(result.follow_up_email ?? ''),
    };

    scratchpad.counter_responses = counterResponses;

    return JSON.stringify({
      success: true,
      has_email_template: counterResponses.email_counter_offer.length > 0,
      has_verbal_script: counterResponses.verbal_script.length > 0,
      has_follow_up: counterResponses.follow_up_email.length > 0,
    });
  },
};

// ─── Tool: assemble_negotiation_prep ──────────────────────────────

const assembleNegotiationPrepTool: StrategistTool = {
  name: 'assemble_negotiation_prep',
  description:
    'Assemble the complete negotiation preparation document with market research summary, strategy, ' +
    'talking points, scenarios, and counter-offer templates.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_negotiation_prep',
      message: 'Assembling negotiation preparation document...',
    });

    const reportParts: string[] = [];

    // ── Header ──
    reportParts.push('# Negotiation Preparation Report');
    reportParts.push('');
    reportParts.push(`**Company:** ${state.offer_details.company}`);
    reportParts.push(`**Role:** ${state.offer_details.role}`);
    reportParts.push('');

    // ── Market Research Summary ──
    if (state.market_research) {
      const mr = state.market_research;
      const dataConfidence = mr.data_confidence;
      reportParts.push('## Market Research Summary');
      reportParts.push('');
      reportParts.push(`> ⚠️ **AI-Estimated Data:** All compensation figures below are estimated from AI training data, not live market surveys. Confidence: ${dataConfidence}. Cross-check against Glassdoor, Levels.fyi, or industry contacts before negotiating.`);
      reportParts.push('');
      reportParts.push(`| Metric | Value |`);
      reportParts.push(`|--------|-------|`);
      reportParts.push(`| Industry | ${mr.industry} |`);
      reportParts.push(`| Geography | ${mr.geography} |`);
      reportParts.push(`| Company Size | ${mr.company_size} |`);
      reportParts.push(`| Data Confidence | ${mr.data_confidence} |`);
      reportParts.push('');
      reportParts.push('### Salary Range (Base)');
      reportParts.push('');
      reportParts.push(`| Percentile | Amount |`);
      reportParts.push(`|-----------|--------|`);
      reportParts.push(`| 25th | ~$${mr.salary_range.p25.toLocaleString()} |`);
      reportParts.push(`| 50th (Median) | ~$${mr.salary_range.p50.toLocaleString()} |`);
      reportParts.push(`| 75th | ~$${mr.salary_range.p75.toLocaleString()} |`);
      reportParts.push(`| 90th | ~$${mr.salary_range.p90.toLocaleString()} |`);
      reportParts.push('');
      reportParts.push('### Total Compensation Estimate');
      reportParts.push('');
      reportParts.push(`| Range | Amount |`);
      reportParts.push(`|-------|--------|`);
      reportParts.push(`| Low | ~$${mr.total_comp_estimate.low.toLocaleString()} |`);
      reportParts.push(`| Mid | ~$${mr.total_comp_estimate.mid.toLocaleString()} |`);
      reportParts.push(`| High | ~$${mr.total_comp_estimate.high.toLocaleString()} |`);
      reportParts.push('');
      reportParts.push('### Market Context');
      reportParts.push('');
      reportParts.push(mr.market_context);
      reportParts.push('');
    }

    // ── Leverage Points ──
    if (state.leverage_points && state.leverage_points.length > 0) {
      reportParts.push('## Leverage Points');
      reportParts.push('');
      for (const lp of state.leverage_points) {
        reportParts.push(`### ${lp.category} (${lp.strength.toUpperCase()})`);
        reportParts.push('');
        reportParts.push(lp.description);
        reportParts.push('');
        reportParts.push(`> **Talking point:** ${lp.talking_point}`);
        reportParts.push('');
      }
    }

    // ── Compensation Breakdown ──
    if (state.total_comp_breakdown && state.total_comp_breakdown.length > 0) {
      reportParts.push('## Total Compensation Breakdown');
      reportParts.push('');
      reportParts.push(`| Component | Current | Market | Negotiable |`);
      reportParts.push(`|-----------|---------|--------|------------|`);
      for (const cb of state.total_comp_breakdown) {
        const current = cb.current_value != null ? `$${cb.current_value.toLocaleString()}` : 'N/A';
        reportParts.push(`| ${cb.component} | ${current} | $${cb.market_value.toLocaleString()} | ${cb.negotiable ? 'Yes' : 'No'} |`);
      }
      reportParts.push('');
    }

    // ── Negotiation Strategy ──
    const strategy = scratchpad.negotiation_strategy as Record<string, string> | undefined;
    if (strategy) {
      reportParts.push('## Negotiation Strategy');
      reportParts.push('');
      reportParts.push(`**Approach:** ${strategy.approach}`);
      reportParts.push('');
      reportParts.push('### Opening Position');
      reportParts.push('');
      reportParts.push(strategy.opening_position);
      reportParts.push('');
      reportParts.push('### Walk-Away Point');
      reportParts.push('');
      reportParts.push(strategy.walk_away_point);
      reportParts.push('');
      reportParts.push('### BATNA (Best Alternative)');
      reportParts.push('');
      reportParts.push(strategy.batna);
      reportParts.push('');
    }

    // ── Talking Points ──
    const talkingPoints = scratchpad.talking_points as TalkingPoint[] | undefined;
    if (talkingPoints && talkingPoints.length > 0) {
      reportParts.push('## Talking Points');
      reportParts.push('');
      for (let i = 0; i < talkingPoints.length; i++) {
        const tp = talkingPoints[i];
        reportParts.push(`### ${i + 1}. ${tp.topic}`);
        reportParts.push('');
        reportParts.push(`**Point:** ${tp.point}`);
        reportParts.push('');
        reportParts.push(`**Evidence:** ${tp.evidence}`);
        reportParts.push('');
        reportParts.push(`*Tone: ${tp.tone_guidance}*`);
        reportParts.push('');
      }
    }

    // ── Scenarios ──
    const scenarios = scratchpad.scenarios as NegotiationScenario[] | undefined;
    if (scenarios && scenarios.length > 0) {
      reportParts.push('## Negotiation Scenarios');
      reportParts.push('');
      for (const scenario of scenarios) {
        const label = SCENARIO_LABELS[scenario.type] ?? scenario.type;
        reportParts.push(`### ${label}`);
        reportParts.push('');
        reportParts.push(`**Situation:** ${scenario.situation}`);
        reportParts.push('');
        reportParts.push(`**Recommended Response:** ${scenario.recommended_response}`);
        reportParts.push('');
        if (scenario.talking_points.length > 0) {
          reportParts.push('**Talking Points:**');
          for (const tp of scenario.talking_points) {
            reportParts.push(`- ${tp}`);
          }
          reportParts.push('');
        }
        if (scenario.risks.length > 0) {
          reportParts.push('**Risks:**');
          for (const risk of scenario.risks) {
            reportParts.push(`- ${risk}`);
          }
          reportParts.push('');
        }
        reportParts.push(`**Fallback Position:** ${scenario.fallback_position}`);
        reportParts.push('');
        reportParts.push('---');
        reportParts.push('');
      }
    }

    // ── Counter-Offer Templates ──
    const counterResponses = scratchpad.counter_responses as Record<string, string> | undefined;
    if (counterResponses) {
      reportParts.push('## Counter-Offer Templates');
      reportParts.push('');
      if (counterResponses.email_counter_offer) {
        reportParts.push('### Email Counter-Offer');
        reportParts.push('');
        reportParts.push(counterResponses.email_counter_offer);
        reportParts.push('');
      }
      if (counterResponses.verbal_script) {
        reportParts.push('### Verbal Script');
        reportParts.push('');
        reportParts.push(counterResponses.verbal_script);
        reportParts.push('');
      }
      if (counterResponses.follow_up_email) {
        reportParts.push('### Follow-Up Email');
        reportParts.push('');
        reportParts.push(counterResponses.follow_up_email);
        reportParts.push('');
      }
    }

    const report = reportParts.join('\n');

    // ── Quality scoring ──
    let qualityScore = 100;
    if (!strategy) qualityScore -= 25;
    if (!talkingPoints || talkingPoints.length === 0) qualityScore -= 20;
    if (!scenarios || scenarios.length < 3) qualityScore -= 15;
    if (!counterResponses) qualityScore -= 10;
    if (!state.market_research) qualityScore -= 15;
    if (!state.leverage_points || state.leverage_points.length === 0) qualityScore -= 15;
    qualityScore = Math.max(0, qualityScore);

    scratchpad.final_report = report;
    scratchpad.quality_score = qualityScore;
    state.final_report = report;
    state.quality_score = qualityScore;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_negotiation_prep',
      message: `Negotiation prep assembled — ${talkingPoints?.length ?? 0} talking points, ${scenarios?.length ?? 0} scenarios, quality: ${qualityScore}/100`,
    });

    return JSON.stringify({
      success: true,
      report_length: report.length,
      talking_point_count: talkingPoints?.length ?? 0,
      scenario_count: scenarios?.length ?? 0,
      quality_score: qualityScore,
    });
  },
};

// ─── Exports ───────────────────────────────────────────────────────

export const strategistTools: StrategistTool[] = [
  designStrategyTool,
  writeTalkingPointsTool,
  simulateScenarioTool,
  writeCounterResponseTool,
  assembleNegotiationPrepTool,
];
