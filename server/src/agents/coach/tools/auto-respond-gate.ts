/**
 * Virtual Coach Tool — auto_respond_gate
 *
 * In guided mode, this tool is informational only — it tells the coach what
 * gate is pending so the coach can advise the user.
 *
 * The tool reads the pending gate data from coach_sessions, uses the coaching
 * methodology to determine an appropriate response, then writes the response
 * directly to the pending_gate_data column — the same mechanism the
 * product-route-factory's POST /respond uses.
 *
 * Gate types the coach can auto-respond to:
 * - architect_review (blueprint approval) — approve with positioning edits
 * - section_review — approve sections that pass quality thresholds
 * - quality_review_approval — approve the final quality review
 *
 * Gates the coach should NOT auto-respond to (require human judgment):
 * - onboarding_assessment — needs the client's personal answers
 * - positioning_interview — needs the client's real experience
 */

import type { CoachTool } from '../types.js';
import { supabaseAdmin } from '../../../lib/supabase.js';
import logger from '../../../lib/logger.js';
import type { PendingGatePayload } from '../../../lib/pending-gate-queue.js';
import { getResponseQueue, withResponseQueue } from '../../../lib/pending-gate-queue.js';
import type { BufferedResponseItem } from '../../../lib/pending-gate-queue.js';

const log = logger.child({ tool: 'auto_respond_gate' });

/** Gates the coach can safely auto-respond to */
const AUTO_RESPONDABLE_GATES = new Set([
  'architect_review',
  'section_review',
  'quality_review_approval',
]);

/** Gates that require human input — never auto-respond */
const HUMAN_ONLY_GATES = new Set([
  'onboarding_assessment',
  'assessment_responses',
  'positioning_interview',
  'positioning_batch',
  'gap_analysis_quiz',
  'intake_quiz',
]);

const autoRespondGateTool: CoachTool = {
  name: 'auto_respond_gate',
  description:
    'Auto-respond to a pipeline gate on behalf of the client. Only use this when the client ' +
    'has explicitly asked you to handle pipeline gates autonomously, or when in autonomous mode. ' +
    'Can auto-respond to: architect_review (blueprint approval), section_review (section approval), ' +
    'quality_review_approval. Cannot auto-respond to: onboarding_assessment, positioning_interview, ' +
    'or any gate that requires the client\'s personal input.',
  model_tier: undefined, // Pure orchestration — no LLM call
  input_schema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The pipeline session ID with the pending gate',
      },
      gate: {
        type: 'string',
        description: 'The gate name to respond to',
      },
      action: {
        type: 'string',
        enum: ['approve', 'approve_with_feedback'],
        description: 'Whether to approve outright or approve with coaching feedback',
      },
      feedback: {
        type: 'string',
        description: 'Optional feedback to include with the approval (for approve_with_feedback)',
      },
    },
    required: ['session_id', 'gate', 'action'],
  },

  async execute(input, ctx) {
    const state = ctx.getState();

    // ─── Mode guard: guided mode cannot auto-respond ──────────
    if (state.mode === 'guided') {
      return JSON.stringify({
        error: 'guided_mode_restriction',
        message: 'In guided mode, gates must be responded to by the user directly.',
      });
    }

    const sessionId = String(input.session_id ?? '').trim();
    const gate = String(input.gate ?? '').trim();
    const action = String(input.action ?? 'approve').trim();
    const feedback = typeof input.feedback === 'string' ? input.feedback.trim() : '';

    if (!sessionId || !gate) {
      return JSON.stringify({ error: 'session_id and gate are required' });
    }

    // ─── Safety check: human-only gates ──────────────────────
    if (HUMAN_ONLY_GATES.has(gate)) {
      return JSON.stringify({
        error: 'human_input_required',
        message: `The "${gate}" gate requires the client's personal input and cannot be auto-responded. ` +
          'Navigate the client to the appropriate room to provide their response.',
        gate,
      });
    }

    // ─── Safety check: unknown gates ─────────────────────────
    if (!AUTO_RESPONDABLE_GATES.has(gate)) {
      return JSON.stringify({
        error: 'unknown_gate',
        message: `The gate "${gate}" is not in the auto-respond allowlist. ` +
          `Allowed gates: ${[...AUTO_RESPONDABLE_GATES].join(', ')}. ` +
          'If this gate should be auto-respondable, it needs to be explicitly added.',
        gate,
      });
    }

    // ─── Verify session exists and belongs to user ───────────
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('coach_sessions')
      .select('id, user_id, pipeline_status, pending_gate, pending_gate_data')
      .eq('id', sessionId)
      .eq('user_id', state.user_id)
      .single();

    if (sessionError || !session) {
      return JSON.stringify({ error: 'Session not found or does not belong to this user' });
    }

    if (session.pipeline_status !== 'running' && session.pipeline_status !== 'waiting') {
      return JSON.stringify({
        error: 'pipeline_not_active',
        message: `Pipeline status is "${session.pipeline_status}" — cannot respond to gates on inactive pipelines.`,
      });
    }

    if (!session.pending_gate) {
      return JSON.stringify({
        error: 'no_pending_gate',
        message: 'This pipeline has no pending gate. It may have already been responded to.',
      });
    }

    if (session.pending_gate !== gate) {
      return JSON.stringify({
        error: 'gate_mismatch',
        message: `Pipeline is waiting on gate "${session.pending_gate}", not "${gate}".`,
        actual_gate: session.pending_gate,
      });
    }

    // ─── Check if already responded ──────────────────────────
    const currentPayload = (session.pending_gate_data ?? {}) as PendingGatePayload;
    if (currentPayload.responded_at) {
      return JSON.stringify({
        status: 'already_responded',
        message: `Gate "${gate}" was already responded to at ${currentPayload.responded_at}.`,
      });
    }

    // ─── Build the gate response ─────────────────────────────
    let gateResponse: unknown;

    switch (gate) {
      case 'architect_review':
        // Approve the blueprint — optionally with positioning feedback
        gateResponse = feedback
          ? { approved: true, edits: { feedback } }
          : true;
        break;

      case 'section_review':
        // Approve the section — optionally with feedback
        gateResponse = feedback
          ? { approved: true, feedback }
          : true;
        break;

      case 'quality_review_approval':
        // Approve the quality review
        gateResponse = true;
        break;

      default:
        gateResponse = true;
    }

    // ─── Write response via response_queue mechanism ─────────
    const currentQueue = getResponseQueue(currentPayload);
    const newItem: BufferedResponseItem = {
      gate,
      response: gateResponse,
      responded_at: new Date().toISOString(),
    };
    const updatedPayload = withResponseQueue(currentPayload, [...currentQueue, newItem]);

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('coach_sessions')
      .update({ pending_gate_data: updatedPayload })
      .eq('id', sessionId)
      .eq('pending_gate', gate)
      .select('id');

    if (updateError) {
      log.error(
        { sessionId, gate, error: updateError.message },
        'auto_respond_gate: failed to write response',
      );
      return JSON.stringify({ error: 'Failed to write gate response' });
    }

    if (!updatedRows || updatedRows.length === 0) {
      log.warn(
        { sessionId, gate },
        'auto_respond_gate: gate cleared between read and write — response not applied',
      );
      return JSON.stringify({
        error: 'gate_changed',
        message: `The "${gate}" gate was cleared between verification and write. The pipeline may have already advanced.`,
      });
    }

    log.info(
      { userId: state.user_id, sessionId, gate, action },
      'auto_respond_gate: gate auto-responded',
    );

    ctx.emit({
      type: 'transparency',
      stage: 'auto_respond',
      message: `Auto-approved "${gate}" gate on the active pipeline${feedback ? ` with feedback: "${feedback}"` : ''}.`,
    });

    return JSON.stringify({
      status: 'responded',
      gate,
      action,
      response: gateResponse,
      message: `Successfully auto-responded to the "${gate}" gate. The pipeline will continue processing.`,
    });
  },
};

export { autoRespondGateTool };
