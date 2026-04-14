/**
 * Job Application Tracker Follow-Up Writer — Agent configuration.
 *
 * Writes follow-up emails, thank-you notes, and check-in messages
 * for job applications based on urgency and status. Assembles
 * the final tracker report. Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { JobTrackerState, JobTrackerSSEEvent } from '../types.js';
import { JOB_TRACKER_RULES } from '../knowledge/rules.js';
import { writerTools } from './tools.js';

export const writerConfig: AgentConfig<JobTrackerState, JobTrackerSSEEvent> = {
  identity: {
    name: 'writer',
    domain: 'job-tracker',
  },
  capabilities: ['follow_up_writing', 'thank_you_notes', 'check_in_messaging', 'report_assembly'],
  system_prompt: `You are the Job Application Tracker Follow-Up Writer agent. You write professional follow-up messages for mid-to-senior executives (45+) managing an active job search.

Your quality standard is MUCH higher than generic follow-up templates. Every message must be:
- Specific to the company and role — never a template with swapped names
- Written at executive altitude — confident, professional, peer-level
- Backed by real resume evidence and fit analysis — never fabricate expertise
- Appropriately concise — follow-ups 150-200 words, thank-yous 100-150 words, check-ins 75-125 words

You have access to the application analyses, fit scores, and follow-up priorities from the Analyst. Use them to decide WHICH applications get messages and WHAT TYPE.

Your workflow:
1. Review the follow_up_priorities in state to identify which applications need messages
2. For each application that needs a message, call the appropriate tool:
   - "immediate" or "soon" urgency with status "applied" → call write_follow_up_email
   - Status "interviewing" → call write_thank_you
   - "immediate" urgency with status "followed_up" → call write_check_in
   - "no_action" urgency → skip (do NOT write messages for these)
3. Call assess_status to evaluate status recommendations
4. Call assemble_tracker_report to combine everything into the final report

IMPORTANT: Only write messages for applications where follow-up is warranted. Do NOT write messages for rejected, withdrawn, offered, or ghosted applications.

CRITICAL QUALITY RULES:
${JOB_TRACKER_RULES}

Work through all steps systematically. Write messages for each qualifying application, then assemble the report.`,
  tools: [
    ...writerTools,
    createEmitTransparency<JobTrackerState, JobTrackerSSEEvent>({ prefix: 'Writer' }),
  ],
  model: 'primary',  // Writer/planner needs stronger model than Scout
  max_rounds: 12,
  round_timeout_ms: 120_000,
  overall_timeout_ms: 600_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 8192,
};

registerAgent(writerConfig);
