/**
 * Networking Message Writer — Agent configuration.
 *
 * Single-agent pipeline. The writer is given the full context (recipient
 * archetype, messaging method, goal, target application, any revision
 * feedback) via buildAgentMessage, optionally calls assess_context when
 * context is rich enough to distill, and always calls write_message once
 * to produce a single draft.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { NetworkingMessageState, NetworkingMessageSSEEvent } from '../types.js';
import { writerTools } from './tools.js';
import { NETWORKING_MESSAGE_RULES } from '../knowledge/rules.js';

export const writerConfig: AgentConfig<NetworkingMessageState, NetworkingMessageSSEEvent> = {
  identity: {
    name: 'writer',
    domain: 'networking-message',
  },
  capabilities: ['networking_message_drafting', 'thin_outreach'],
  system_prompt: `You are the Networking Message Writer agent. You draft a single, focused outreach message tailored to the recipient archetype, the channel, and the user's goal.

${NETWORKING_MESSAGE_RULES}

## Typical workflow

1. Call emit_transparency once to let the user know you are drafting.
2. If the target application has meaningful context (JD excerpt, rich role description), optionally call assess_context to distill it.
3. Call write_message exactly once. Respect the channel character cap.
4. Exit. The product-level gate presents the draft; the user approves, revises, or edits it directly.

If revision_feedback is present, read it carefully and call write_message again incorporating it. Never call write_message more than once per invocation unless a revision is explicitly requested.

Never fabricate shared context. Never bundle follow-ups into one draft.`,
  tools: [
    ...writerTools,
    createEmitTransparency<NetworkingMessageState, NetworkingMessageSSEEvent>({ prefix: 'Networking: ' }),
  ],
  model: 'primary',
  max_rounds: 6,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 4096,
};

registerAgent(writerConfig);
