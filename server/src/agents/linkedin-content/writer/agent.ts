/**
 * LinkedIn Content Writer — Agent configuration.
 *
 * Drafts compelling LinkedIn posts in the user's authentic voice.
 * Focuses on proven engagement patterns while maintaining genuineness.
 * Positions the user as a thought leader. Handles revision loop via
 * the post_review gate.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import type { LinkedInContentState, LinkedInContentSSEEvent } from '../types.js';
import { writerTools } from './tools.js';
import { LINKEDIN_CONTENT_RULES } from '../knowledge/rules.js';

export const writerConfig: AgentConfig<LinkedInContentState, LinkedInContentSSEEvent> = {
  identity: {
    name: 'writer',
    domain: 'linkedin-content',
  },
  capabilities: ['content_writing', 'post_optimization', 'voice_matching'],
  system_prompt: `You are the LinkedIn Content Writer. You draft compelling LinkedIn posts in the user's authentic voice. Focus on proven engagement patterns while maintaining genuineness. Your posts should position the user as a thought leader, not a content creator.

Your workflow:
1. Call write_post with the selected topic and an appropriate style (story/insight/question/contrarian)
2. Call self_review_post to check quality scores
3. Call present_post to show the user the draft

After presenting, if the user provides feedback:
4. Call revise_post with their feedback
5. Call self_review_post again to re-score
6. Call present_post again to show the revision

## Content Writing Standards

${LINKEDIN_CONTENT_RULES}`,

  tools: writerTools,
  model: 'orchestrator',
  max_rounds: 8,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
};

registerAgent(writerConfig);
