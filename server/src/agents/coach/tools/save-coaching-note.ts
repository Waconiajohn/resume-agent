/**
 * Virtual Coach Tool — save_coaching_note
 *
 * Persists a coaching insight, decision, milestone, concern, preference,
 * goal, or red flag to the coach_memory table. Notes survive session
 * boundaries and are loaded by recall_coaching_history to give the coach
 * longitudinal memory of each client.
 *
 * No LLM call — pure DB write. The agent loop is the reasoning layer.
 */

import type { CoachTool } from '../types.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import logger from '../../../lib/logger.js';

const saveCoachingNoteTool: CoachTool = {
  name: 'save_coaching_note',
  description:
    'Save an insight, decision, milestone, concern, preference, goal, or red flag to long-term ' +
    'coaching memory. These notes persist across conversations and help you remember important context ' +
    'about the client. Use this when you learn something significant about the client that should ' +
    'inform future conversations.',
  model_tier: undefined, // No LLM call
  input_schema: {
    type: 'object',
    properties: {
      memory_type: {
        type: 'string',
        enum: ['decision', 'insight', 'milestone', 'concern', 'preference', 'goal', 'red_flag'],
        description: 'The type of coaching note',
      },
      content: {
        type: 'string',
        description: 'The note content — what did you learn or decide?',
      },
      context: {
        type: 'string',
        description: 'Optional context — what was happening when this came up?',
      },
    },
    required: ['memory_type', 'content'],
  },

  async execute(input, ctx) {
    const state = ctx.getState();
    const userId = state.user_id;
    const VALID_MEMORY_TYPES = ['decision', 'insight', 'milestone', 'concern', 'preference', 'goal', 'red_flag'] as const;
    const rawType = String(input.memory_type ?? 'insight');
    const memoryType = VALID_MEMORY_TYPES.includes(rawType as typeof VALID_MEMORY_TYPES[number]) ? rawType : 'insight';
    const content = String(input.content ?? '').slice(0, 2000);
    const context = String(input.context ?? '');

    if (!content) {
      return JSON.stringify({ error: 'Content is required for a coaching note' });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('coach_memory')
        .insert({
          user_id: userId,
          memory_type: memoryType,
          content,
          metadata: context ? { context } : {},
          coaching_phase: state.client_snapshot?.journey_phase ?? null,
        })
        .select('id')
        .single();

      if (error) {
        logger.warn({ error: error.message, userId }, 'save_coaching_note: DB insert failed');
        return JSON.stringify({ error: 'Failed to save coaching note' });
      }

      return JSON.stringify({
        status: 'saved',
        memory_id: data?.id ?? null,
        memory_type: memoryType,
        summary: `Saved ${memoryType}: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`,
      });
    } catch (err) {
      logger.error({ err, userId }, 'save_coaching_note: unexpected error');
      return JSON.stringify({ error: 'Failed to save coaching note' });
    }
  },
};

export { saveCoachingNoteTool };
