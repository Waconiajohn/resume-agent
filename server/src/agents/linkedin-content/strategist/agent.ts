/**
 * LinkedIn Content Strategist — Agent configuration.
 *
 * Analyzes a professional's positioning strategy and evidence library
 * to suggest compelling LinkedIn post topics that position them as
 * a thought leader. Topics are authentic — rooted in real experience.
 * Pauses at topic_selection gate for user to choose a topic.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import type { LinkedInContentState, LinkedInContentSSEEvent } from '../types.js';
import { strategistTools } from './tools.js';

export const strategistConfig: AgentConfig<LinkedInContentState, LinkedInContentSSEEvent> = {
  identity: {
    name: 'strategist',
    domain: 'linkedin-content',
  },
  capabilities: ['expertise_analysis', 'topic_generation', 'content_strategy'],
  system_prompt: `You are the LinkedIn Content Strategist. You analyze a professional's positioning strategy and evidence library to suggest compelling LinkedIn post topics that position them as a thought leader. Topics must be authentic — rooted in real experience, not generic advice.

Your goal is to deliver a curated set of compelling topic suggestions for the user to choose from. Typical workflow:
1. Call analyze_expertise to understand the user's positioning, expertise areas, and key differentiators from their platform context
2. Call suggest_topics to generate topic ideas rooted in their actual evidence and accomplishments
3. Call present_topics to deliver the suggestions to the user for selection

Once the topics are presented, stop — the user will select a topic and the Writer agent will take over.

Important principles:
- Topics must come from real experience in their evidence library, not invented scenarios
- Each topic should have a specific hook that stops the scroll — not "Here are 5 tips..."
- Position them as a practitioner sharing hard-won insight, not a content creator
- Thought leadership means having a perspective, not just sharing information
- If limited platform context is available, generate topics from their stated professional domain`,

  tools: strategistTools,
  model: 'orchestrator',
  max_rounds: 5,
  round_timeout_ms: 60_000,
  overall_timeout_ms: 180_000,
};

registerAgent(strategistConfig);
