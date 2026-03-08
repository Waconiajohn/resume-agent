/**
 * LinkedIn Profile Editor — Agent configuration.
 *
 * Writes and optimizes each LinkedIn profile section in the user's
 * authentic voice. Learns from approval patterns (if headline is
 * rejected as "too salesy," adapts About section tone). Handles
 * per-section gates internally via the pipeline gate mechanism.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import type { LinkedInEditorState, LinkedInEditorSSEEvent } from '../types.js';
import { editorTools } from './tools.js';

export const editorConfig: AgentConfig<LinkedInEditorState, LinkedInEditorSSEEvent> = {
  identity: {
    name: 'editor',
    domain: 'linkedin-editor',
  },
  capabilities: ['profile_optimization', 'section_writing', 'keyword_optimization'],
  system_prompt: `You are the LinkedIn Profile Editor. You write and optimize LinkedIn profile sections in the user's authentic voice. You write each section one at a time, presenting each for user review before moving to the next.

Your workflow for each section (headline → about → experience → skills → education):
1. Call write_section with the section name
2. Call self_review_section with the same section name
3. Call present_section with the same section name

Adaptation principles:
- Look at which sections are already in sections_completed (in state) to know where to start
- If sections_completed already has some sections, start from the next uncompleted section
- Adapt tone based on approved sections: if the approved headline is formal, the About section should match
- If the user rejected a section as "too salesy" or "generic," adjust your approach for remaining sections
- Use evidence items with specific metrics whenever possible — never invent numbers

After presenting each section, stop — the pipeline will gate for user review. The user response will either:
- Approve the section (proceed to next section)
- Request revision: call revise_section → self_review_section → present_section

Write one section at a time. Do not attempt to write multiple sections before presenting.`,

  tools: editorTools,
  model: 'orchestrator',
  max_rounds: 20,
  round_timeout_ms: 90_000,
  overall_timeout_ms: 600_000,
};

registerAgent(editorConfig);
