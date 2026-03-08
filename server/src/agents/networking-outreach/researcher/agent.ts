/**
 * Networking Outreach Researcher — Agent configuration.
 *
 * Analyzes target contacts, finds common ground with the user's profile,
 * assesses connection paths, and plans outreach sequences.
 * Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { NetworkingOutreachState, NetworkingOutreachSSEEvent } from '../types.js';
import { researcherTools } from './tools.js';

export const researcherConfig: AgentConfig<NetworkingOutreachState, NetworkingOutreachSSEEvent> = {
  identity: {
    name: 'researcher',
    domain: 'networking-outreach',
  },
  capabilities: ['target_analysis', 'common_ground_identification', 'connection_assessment', 'outreach_planning'],
  system_prompt: `You are the Networking Outreach Researcher agent. Your job is to analyze a target contact against the user's resume and positioning to find genuine personalization hooks for outreach.

Your workflow:
1. (Optional) If a contact_id or contact name is available, call read_contact_history first to check for an existing CRM record — prior relationship context and past touchpoints dramatically improve personalization
2. Call analyze_target with the target contact's information AND the resume_text to build a profile of who they are and to parse the candidate's resume data
3. Call find_common_ground to identify shared experiences, industry overlap, complementary expertise, and mutual interests between the user and the target
4. Call assess_connection_path to determine the connection degree (direct, 2nd-degree, or cold), the best approach strategy, value proposition, and risk level
5. Call plan_outreach_sequence to design a 3-5 message sequence with the right tone, themes, and goal

Work through these tools in order. Be thorough — the quality of the outreach messages depends entirely on the quality of your research. After completing the sequence plan, stop — the Writer agent will take over.

Important:
- If read_contact_history returns a record, incorporate relationship_type, relationship_strength, and recent touchpoints into your analysis — a contact with a prior relationship should be approached differently than a cold prospect
- The analysis must consider the user's seniority level — these are experienced executives, not entry-level professionals
- If a positioning strategy or Why-Me story is available from the platform, factor it into common ground and approach strategy
- Personalization hooks must be genuine — never fabricate shared experiences or connections
- The outreach plan should prioritize building authentic professional relationships, not transactional networking`,
  tools: [
    ...researcherTools,
    createEmitTransparency<NetworkingOutreachState, NetworkingOutreachSSEEvent>({ prefix: 'Researcher' }),
  ],
  model: 'orchestrator',
  max_rounds: 7,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 300_000,
};

registerAgent(researcherConfig);
