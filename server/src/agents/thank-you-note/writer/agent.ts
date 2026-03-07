/**
 * Thank You Note Writer — Agent configuration.
 *
 * Analyzes interview context and writes personalized thank-you notes
 * for each interviewer. Single agent for Thank You Note Agent #18.
 * Runs autonomously — no user gates.
 */

import type { AgentConfig } from '../../runtime/agent-protocol.js';
import { registerAgent } from '../../runtime/agent-registry.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { ThankYouNoteState, ThankYouNoteSSEEvent } from '../types.js';
import { THANK_YOU_NOTE_RULES } from '../knowledge/rules.js';
import { writerTools } from './tools.js';

export const writerConfig: AgentConfig<ThankYouNoteState, ThankYouNoteSSEEvent> = {
  identity: {
    name: 'writer',
    domain: 'thank-you-note',
  },
  capabilities: ['note_writing', 'interview_analysis', 'personalization', 'format_adaptation'],
  system_prompt: `You are the Thank You Note Writer agent. You analyze interview contexts and write personalized, authentic thank-you notes for each interviewer, tailored to format (email, handwritten, LinkedIn message).

Your quality standard is MUCH higher than generic thank-you generators. Every note must be:
- Grounded in the specific conversation that took place — never generic
- Personalized to the interviewer's role, seniority, and topics discussed
- Written in the candidate's authentic voice with peer-level confidence
- Calibrated to the format's length and tone requirements
- Unique across the note set — no two notes should read alike

Your workflow:
1. Call analyze_interview_context to identify key themes, rapport signals, and personalization opportunities
2. For each interviewer, call write_thank_you_note with the appropriate format and key topics
3. For each note, call personalize_per_interviewer to quality-check tone, personalization depth, and uniqueness
4. Call assemble_note_set to produce the final formatted collection with delivery timing guidance

IMPORTANT: You MUST write a note for EVERY interviewer provided. Each interviewer gets exactly one note. The default format is 'email' unless the interview analysis suggests otherwise (e.g., handwritten for C-suite, LinkedIn message when email unavailable).

For each note, ALWAYS call write_thank_you_note first, then immediately call personalize_per_interviewer for the same interviewer+format before moving to the next interviewer.

CRITICAL QUALITY RULES:
${THANK_YOU_NOTE_RULES}

Work through all steps systematically. Analyze context first, then write and quality-check each note, then assemble the final collection.`,
  tools: [
    ...writerTools,
    createEmitTransparency<ThankYouNoteState, ThankYouNoteSSEEvent>({ prefix: 'Writer' }),
  ],
  model: 'orchestrator',
  max_rounds: 10,
  round_timeout_ms: 60_000,
  overall_timeout_ms: 360_000,
  parallel_safe_tools: ['emit_transparency'],
  loop_max_tokens: 8192,
};

registerAgent(writerConfig);
