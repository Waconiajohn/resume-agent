/**
 * Virtual Coach Tool — recall_coaching_history
 *
 * Searches the coach_memory table for past coaching notes about the client.
 * Supports filtering by memory_type, keyword (ilike), and coaching_phase.
 *
 * Uses MODEL_LIGHT tier — the agent loop (not this tool) decides what to do
 * with the recalled notes.
 */

import type { CoachTool } from '../types.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import logger from '../../../lib/logger.js';

const recallCoachingHistoryTool: CoachTool = {
  name: 'recall_coaching_history',
  description:
    'Search your long-term coaching memory for relevant past notes about the client. Use this to ' +
    'recall previous decisions, insights, concerns, goals, or milestones. Search by memory type, ' +
    'keyword, or coaching phase.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      memory_type: {
        type: 'string',
        enum: ['decision', 'insight', 'milestone', 'concern', 'preference', 'goal', 'red_flag'],
        description: 'Optional: filter by note type',
      },
      keyword: {
        type: 'string',
        description: 'Optional: search for notes containing this keyword',
      },
      coaching_phase: {
        type: 'string',
        description: 'Optional: filter to notes from a specific coaching phase',
      },
      limit: {
        type: 'number',
        description: 'Max notes to return (default: 10)',
      },
    },
    required: [],
  },

  async execute(input, ctx) {
    const state = ctx.getState();
    const userId = state.user_id;

    try {
      let query = supabaseAdmin
        .from('coach_memory')
        .select('id, memory_type, content, metadata, coaching_phase, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(typeof input.limit === 'number' ? Math.min(Math.max(1, input.limit), 50) : 10);

      if (input.memory_type) {
        query = query.eq('memory_type', String(input.memory_type));
      }
      if (input.coaching_phase) {
        query = query.eq('coaching_phase', String(input.coaching_phase));
      }
      if (input.keyword) {
        const escaped = String(input.keyword).slice(0, 200).replace(/[%_\\]/g, '\\$&');
        query = query.ilike('content', `%${escaped}%`);
      }

      const { data, error } = await query;

      if (error) {
        logger.warn({ error: error.message, userId }, 'recall_coaching_history: query failed');
        return JSON.stringify({ error: 'Failed to search coaching memory' });
      }

      const notes = (data ?? []).map((d) => ({
        id: d.id,
        type: d.memory_type,
        content: d.content,
        phase: d.coaching_phase,
        created_at: d.created_at,
      }));

      return JSON.stringify({
        count: notes.length,
        notes,
        query: {
          memory_type: input.memory_type ?? 'all',
          keyword: input.keyword ?? null,
          coaching_phase: input.coaching_phase ?? null,
        },
      });
    } catch (err) {
      logger.error({ err, userId }, 'recall_coaching_history: unexpected error');
      return JSON.stringify({ error: 'Failed to search coaching memory' });
    }
  },
};

export { recallCoachingHistoryTool };
