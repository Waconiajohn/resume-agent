/**
 * Virtual Coach Tool — set_coaching_mode
 *
 * Switches the conversation between "guided" (structured step-by-step coaching)
 * and "chat" (free-form exploration). Updates both in-memory state and the
 * coach_conversations DB record, and emits a transparency event so the client
 * can see the shift.
 *
 * No LLM call — pure state mutation. The agent loop is the reasoning layer.
 */

import type { CoachTool } from '../types.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import logger from '../../../lib/logger.js';

const setCoachingModeTool: CoachTool = {
  name: 'set_coaching_mode',
  description:
    'Switch the coaching mode. "guided" mode provides structured step-by-step coaching with explicit ' +
    'recommendations. "chat" mode is free-form conversation for questions, brainstorming, and exploration. ' +
    'Switch to guided when the client needs direction; switch to chat when they want to explore.',
  model_tier: undefined, // No LLM call
  input_schema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['guided', 'chat'],
        description: 'The coaching mode to switch to',
      },
      reason: {
        type: 'string',
        description: "Why you're switching modes (for transparency)",
      },
    },
    required: ['mode'],
  },

  async execute(input, ctx) {
    const state = ctx.getState();
    const newMode = String(input.mode ?? 'guided') as 'chat' | 'guided';
    const reason = String(input.reason ?? '');
    const oldMode = state.mode;

    if (newMode === oldMode) {
      return JSON.stringify({
        status: 'no_change',
        mode: newMode,
        message: `Already in ${newMode} mode.`,
      });
    }

    // Update in-memory state
    ctx.updateState({ mode: newMode });

    // Persist to conversation record — log warning on failure but don't fail the tool
    try {
      await supabaseAdmin
        .from('coach_conversations')
        .update({ mode: newMode })
        .eq('id', state.session_id)
        .eq('user_id', state.user_id);
    } catch (err) {
      logger.warn({ err, userId: state.user_id, sessionId: state.session_id }, 'set_coaching_mode: failed to persist mode change');
    }

    // Emit transparency event
    ctx.emit({
      type: 'transparency',
      stage: 'mode_change',
      message: `Switched from ${oldMode} to ${newMode} mode. ${reason}`.trim(),
    });

    return JSON.stringify({
      status: 'changed',
      old_mode: oldMode,
      new_mode: newMode,
      reason,
      message: `Switched to ${newMode} mode. ${reason}`.trim(),
    });
  },
};

export { setCoachingModeTool };
