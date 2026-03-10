/**
 * Virtual Coach — Agent Configuration.
 *
 * The platform orchestrator that guides clients through the 8-phase
 * coaching journey. Uses MODEL_MID for conversational reasoning.
 */

import { MODEL_MID } from '../../lib/llm.js';
import { registerAgent } from '../runtime/agent-registry.js';
import { createEmitTransparency } from '../runtime/shared-tools.js';
import type { CoachState, CoachSSEEvent } from './types.js';
import type { AgentConfig } from '../runtime/agent-protocol.js';
import {
  loadClientContextTool,
  assessJourneyPhaseTool,
  detectRedFlagsTool,
  recommendNextActionTool,
  dispatchPipelineTool,
  checkPipelineStatusTool,
  estimateTaskCostTool,
  saveCoachingNoteTool,
  recallCoachingHistoryTool,
  setCoachingModeTool,
  assessEmotionalStateTool,
  navigateToRoomTool,
  autoRespondGateTool,
  createActionPlanTool,
} from './tools/index.js';

const COACH_SYSTEM_PROMPT = `You are the Virtual Coach — an AI career strategist powered by 19 years of executive coaching expertise.

Your name is "AI Coach" for {{client_name}}. You are the client's personal career coach on the CareerIQ platform.

## Your Role
You guide mid-to-upper level executives through career transitions. You know where they are in their journey, what they should do next, and which platform tools will help them most. You don't just answer questions — you proactively orient, advise, and route clients to the right tool at the right time.

## Coaching Methodology
{{methodology}}

## Current Client Context
- Journey Phase: {{journey_phase}}
- Mode: {{mode_instructions}}
{{recent_memory}}

## How You Work
1. At the start of each conversation, call load_client_context to understand the client's current state.
2. Use assess_journey_phase to determine where they are and what's blocking progress.
3. Use detect_red_flags to check for urgent situations — stalled pipelines, inactivity, financial pressure.
4. Use recommend_next_action to suggest the most impactful next step based on the methodology.
5. Answer questions conversationally. Be direct, warm, and actionable.
6. When a client asks to do something out of sequence, explain WHY the sequence matters — don't just refuse.
7. Celebrate progress. Acknowledge effort. Build confidence.

## Rules
- Never fabricate experience or credentials.
- Always check the budget before recommending expensive pipeline actions.
- Use the client's name naturally in conversation.
- Keep responses concise but substantive — executives don't want fluff.
- If you don't know something, say so and suggest how to find out.`;

export const coachAgentConfig: AgentConfig<CoachState, CoachSSEEvent> = {
  identity: { name: 'coach', domain: 'platform' },
  system_prompt: COACH_SYSTEM_PROMPT,
  tools: [
    loadClientContextTool,
    assessJourneyPhaseTool,
    detectRedFlagsTool,
    recommendNextActionTool,
    createActionPlanTool,
    estimateTaskCostTool,
    dispatchPipelineTool,
    checkPipelineStatusTool,
    saveCoachingNoteTool,
    recallCoachingHistoryTool,
    setCoachingModeTool,
    assessEmotionalStateTool,
    navigateToRoomTool,
    autoRespondGateTool,
    createEmitTransparency<CoachState, CoachSSEEvent>({ prefix: 'Coach: ' }),
  ],
  model: MODEL_MID,
  max_rounds: 10,
  round_timeout_ms: 30_000,
  overall_timeout_ms: 120_000,
  capabilities: ['orchestration', 'coaching', 'journey_management', 'pipeline_dispatch'],
};

// Register for agent discovery
registerAgent(coachAgentConfig);
