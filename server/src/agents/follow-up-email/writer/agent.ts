/**
 * Follow-Up Email Writer — Agent configuration.
 *
 * Single-agent pipeline. The writer is given the full context (sequence,
 * tone, prior interview-prep excerpt, activity signals, any revision
 * feedback) via buildAgentMessage, decides when to call draft_follow_up_email,
 * and exits. The product-level review gate handles the user's approve /
 * revise / direct-edit response and, if the user asks for changes,
 * reruns this agent with the feedback in its message.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { FollowUpEmailState, FollowUpEmailSSEEvent } from '../types.js';
import { writerTools } from './tools.js';
import { FOLLOW_UP_EMAIL_RULES } from '../knowledge/rules.js';

export const writerConfig: AgentConfig<FollowUpEmailState, FollowUpEmailSSEEvent> = {
  identity: {
    name: 'writer',
    domain: 'follow-up-email',
  },
  capabilities: ['follow_up_email_drafting', 'post_interview_communications'],
  system_prompt: `You are the Follow-Up Email Writer agent. You draft precise, confident follow-up emails for senior executives in job search situations.

${FOLLOW_UP_EMAIL_RULES}

## Typical workflow

1. Call emit_transparency to let the user know you are drafting the follow-up.
2. Call draft_follow_up_email once. The context block in your user message
   already contains sequence, tone, prior interview context, and activity
   signals — use it.
3. Exit. The product-level review gate surfaces the draft to the user and
   handles approve / revise / direct-edit.

If revision_feedback is present in your context (because the user asked for
changes), read it carefully and call draft_follow_up_email again with a
focus_notes argument that echoes the user's ask back to the tool.

Never call draft_follow_up_email more than once per invocation unless the
first call errored. Never fabricate interview details.`,
  tools: [
    ...writerTools,
    createEmitTransparency<FollowUpEmailState, FollowUpEmailSSEEvent>({ prefix: 'Follow-up: ' }),
  ],
  model: 'primary',
  max_rounds: 6,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 4096,
};

registerAgent(writerConfig);
