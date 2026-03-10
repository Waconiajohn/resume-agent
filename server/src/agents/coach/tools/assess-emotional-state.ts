/**
 * Virtual Coach Tool — assess_emotional_state
 *
 * Evaluates the client's emotional state from their recent messages using
 * MODEL_MID. Returns grief cycle stage, financial stress tier, confidence
 * and energy levels, and a recommended voice register.
 *
 * Used when the agent detects a shift in the client's emotional state or
 * wants to calibrate its communication approach.
 */

import type { CoachTool } from '../types.js';
import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';

const assessEmotionalStateTool: CoachTool = {
  name: 'assess_emotional_state',
  description:
    "Evaluate the client's emotional state based on their recent messages. Returns an assessment of " +
    'their emotional baseline (grief cycle stage, financial stress level, confidence level) and a ' +
    'recommended voice register. Use this when you sense the client\'s emotional state has shifted.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      recent_messages: {
        type: 'string',
        description: "The client's recent messages to analyze (last 3-5 messages)",
      },
      observed_signals: {
        type: 'string',
        description:
          "Any specific signals you've noticed (e.g., \"client seems frustrated\", \"energy has dropped\")",
      },
    },
    required: ['recent_messages'],
  },

  async execute(input, ctx) {
    const recentMessages = String(input.recent_messages ?? '').slice(0, 3000);
    const observedSignals = String(input.observed_signals ?? '').slice(0, 500);

    if (!recentMessages) {
      return JSON.stringify({ error: 'recent_messages is required' });
    }

    const observedBlock = observedSignals
      ? `\nCOACH OBSERVATIONS: ${observedSignals}`
      : '';

    try {
      const response = await llm.chat({
        model: MODEL_MID,
        system:
          "You are an emotional intelligence analyst for a career coaching platform. Assess the client's " +
          'emotional state from their messages. Return ONLY valid JSON matching the schema below — no ' +
          'commentary, no markdown fencing.',
        messages: [
          {
            role: 'user',
            content:
              `Analyze the emotional state of this career coaching client based on their recent messages.\n\n` +
              `MESSAGES:\n${recentMessages}${observedBlock}\n\n` +
              `Return JSON:\n` +
              `{\n` +
              `  "grief_stage": "denial|anger|bargaining|depression|acceptance|growth",\n` +
              `  "financial_segment": "crisis|stressed|ideal|comfortable|unknown",\n` +
              `  "confidence_level": "low|moderate|high",\n` +
              `  "energy_level": "low|moderate|high",\n` +
              `  "recommended_register": "strategic_advisor|coach_motivator|operational_guide",\n` +
              `  "key_signals": ["signal 1", "signal 2"],\n` +
              `  "coaching_note": "Brief observation about what the client needs right now"\n` +
              `}`,
          },
        ],
        max_tokens: 512,
        signal: ctx.signal,
        session_id: ctx.sessionId,
      });

      const parsed = repairJSON<Record<string, unknown>>(response.text);

      if (!parsed) {
        logger.warn({ sessionId: ctx.sessionId }, 'assess_emotional_state: JSON parse failed, using defaults');
        return JSON.stringify({
          grief_stage: 'unknown',
          confidence_level: 'moderate',
          recommended_register: 'coach_motivator',
          note: 'Could not parse emotional assessment — defaulting to supportive approach',
        });
      }

      return JSON.stringify({
        grief_stage: parsed.grief_stage ?? 'unknown',
        financial_segment: parsed.financial_segment ?? 'unknown',
        confidence_level: parsed.confidence_level ?? 'moderate',
        energy_level: parsed.energy_level ?? 'moderate',
        recommended_register: parsed.recommended_register ?? 'coach_motivator',
        key_signals: Array.isArray(parsed.key_signals) ? parsed.key_signals : [],
        coaching_note: String(parsed.coaching_note ?? ''),
      });
    } catch (err) {
      logger.error({ err, sessionId: ctx.sessionId }, 'assess_emotional_state: LLM call failed');
      return JSON.stringify({
        grief_stage: 'unknown',
        confidence_level: 'moderate',
        recommended_register: 'coach_motivator',
        note: 'Emotional assessment failed — defaulting to supportive approach',
      });
    }
  },
};

export { assessEmotionalStateTool };
