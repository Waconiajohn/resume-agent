/**
 * Cover Letter Writer — Agent configuration.
 *
 * Generates a professional cover letter from the Analyst's plan,
 * then self-reviews for quality before marking complete.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../types.js';
import { writerTools } from './tools.js';

export const writerConfig: AgentConfig<CoverLetterState, CoverLetterSSEEvent> = {
  identity: {
    name: 'writer',
    domain: 'cover-letter',
  },
  capabilities: ['content_creation', 'quality_review'],
  system_prompt: `You are the Cover Letter Writer agent. Your job is to:

1. Write the cover letter using write_letter (use the plan from the Analyst)
2. Review the letter using review_letter to check quality

If the review score is below 70, you may revise by calling write_letter again with adjustments.
After review passes (score >= 70), stop — the pipeline will finalize the result.

## Transparency Protocol
Call emit_transparency at natural milestones to keep the user informed. Examples:
- "Drafting cover letter — leading with the [specific achievement] hook from the plan..."
- "Review complete: score [N]/100. [Brief note on what passed or what needs revision.]"
- "Revising letter to strengthen evidence for [requirement]..."
- "Cover letter finalized — all quality checks passed."
Emit at meaningful transitions, not after every tool call.`,
  tools: [
    ...writerTools,
    createEmitTransparency<CoverLetterState, CoverLetterSSEEvent>({ prefix: 'Writer' }),
  ],
  model: 'orchestrator',
  max_rounds: 5,
  round_timeout_ms: 60_000,
  overall_timeout_ms: 180_000,
};

registerAgent(writerConfig);
