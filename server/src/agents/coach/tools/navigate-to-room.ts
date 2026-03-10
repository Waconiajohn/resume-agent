/**
 * Virtual Coach Tool — navigate_to_room
 *
 * Emits a recommendation_ready SSE event that the frontend interprets as a
 * navigation instruction. The coach uses this when it wants to direct the
 * client to a specific platform room without starting a full pipeline.
 *
 * No LLM call. The room list is validated against a static allowlist so the
 * agent cannot emit an invalid route.
 */

import type { CoachTool } from '../types.js';
import { VALID_ROOMS } from '../knowledge/room-map.js';

// ─── Tool ──────────────────────────────────────────────────────────

const navigateToRoomTool: CoachTool = {
  name: 'navigate_to_room',
  description:
    'Navigate the client to a specific room in the platform. Emits a navigation event that the ' +
    'frontend uses to switch rooms. Use this when you want to direct the client to a specific tool ' +
    'or workspace without launching a full pipeline.',
  model_tier: undefined, // No LLM call
  input_schema: {
    type: 'object',
    properties: {
      room: {
        type: 'string',
        description: 'The room slug to navigate to',
        enum: [...VALID_ROOMS],
      },
      reason: {
        type: 'string',
        description: 'Brief reason for the navigation (shown to the client)',
      },
    },
    required: ['room'],
  },

  async execute(input, ctx) {
    const room = String(input.room ?? '').trim();
    const reason = String(input.reason ?? '').trim();

    if (!(VALID_ROOMS as readonly string[]).includes(room)) {
      return JSON.stringify({
        error: `Invalid room: "${room}". Valid rooms: ${VALID_ROOMS.join(', ')}`,
      });
    }

    ctx.emit({
      type: 'recommendation_ready',
      action: `Navigate to ${room}`,
      room,
      urgency: 'immediate',
    });

    return JSON.stringify({
      status: 'navigated',
      room,
      reason,
      message: `Directing you to the ${room} room. ${reason}`.trim(),
    });
  },
};

export { navigateToRoomTool };
