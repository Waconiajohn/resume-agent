/**
 * Networking Outreach Product — ProductConfig implementation.
 *
 * Agent #13: 2-agent pipeline (Researcher → Writer) that generates
 * personalized LinkedIn connection requests and follow-up message
 * sequences based on resume data, positioning strategy, and target contact.
 * Autonomous — no user gates. Full outreach sequence delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { researcherConfig } from './researcher/agent.js';
import { writerConfig } from './writer/agent.js';
import type { NetworkingOutreachState, NetworkingOutreachSSEEvent } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

export function createNetworkingOutreachProductConfig(): ProductConfig<NetworkingOutreachState, NetworkingOutreachSSEEvent> {
  return {
    domain: 'networking-outreach',

    agents: [
      {
        name: 'researcher',
        config: researcherConfig,
        stageMessage: {
          startStage: 'research',
          start: 'Analyzing target contact and finding common ground...',
          complete: 'Research complete — outreach plan ready',
        },
        onComplete: (scratchpad, state) => {
          // Copy research results from scratchpad to state
          if (scratchpad.target_analysis && !state.target_analysis) {
            state.target_analysis = scratchpad.target_analysis as NetworkingOutreachState['target_analysis'];
          }
          if (scratchpad.common_ground && !state.common_ground) {
            state.common_ground = scratchpad.common_ground as NetworkingOutreachState['common_ground'];
          }
          if (scratchpad.connection_path && !state.connection_path) {
            state.connection_path = scratchpad.connection_path as NetworkingOutreachState['connection_path'];
          }
          if (scratchpad.outreach_plan && !state.outreach_plan) {
            state.outreach_plan = scratchpad.outreach_plan as NetworkingOutreachState['outreach_plan'];
          }
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as NetworkingOutreachState['resume_data'];
          }
          if (scratchpad.target_input && !state.target_input) {
            state.target_input = scratchpad.target_input as NetworkingOutreachState['target_input'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing your personalized outreach sequence...',
          complete: 'Outreach sequence complete',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (Array.isArray(scratchpad.messages)) {
            state.messages = scratchpad.messages as NetworkingOutreachState['messages'];
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'research',
      platform_context: input.platform_context as NetworkingOutreachState['platform_context'],
      target_input: input.target_input as NetworkingOutreachState['target_input'],
      messages: [],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'researcher') {
        const ti = input.target_input as NetworkingOutreachState['target_input'];
        const parts = [
          'Analyze the target contact and the candidate resume to find common ground and plan an outreach sequence.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          '## Target Contact',
          `Name: ${ti?.target_name ?? ''}`,
          `Title: ${ti?.target_title ?? ''}`,
          `Company: ${ti?.target_company ?? ''}`,
        ];

        if (ti?.target_linkedin_url) {
          parts.push(`LinkedIn: ${ti.target_linkedin_url}`);
        }
        if (ti?.context_notes) {
          parts.push(`Context Notes: ${ti.context_notes}`);
        }

        if (state.platform_context?.why_me_story) {
          parts.push('', '## Why-Me Story', JSON.stringify(state.platform_context.why_me_story, null, 2));
        }
        if (state.platform_context?.positioning_strategy) {
          parts.push('', '## Positioning Strategy', JSON.stringify(state.platform_context.positioning_strategy, null, 2));
        }

        parts.push('', 'Call analyze_target first (pass the resume_text along with the target info), then find_common_ground, then assess_connection_path, then plan_outreach_sequence.');

        // Distress resources — first agent only
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        // Emotional baseline tone adaptation
        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      if (agentName === 'writer') {
        const parts = [
          'Write the complete outreach sequence using the research data gathered.',
          '',
          'Follow your workflow exactly:',
          '1. write_connection_request',
          '2. write_follow_up with follow_up_number 1',
          '3. write_follow_up with follow_up_number 2',
          '4. write_value_offer',
          '5. write_meeting_request',
          '6. assemble_sequence',
          '',
          'Do NOT skip any message type in the sequence.',
        ];

        // Emotional baseline tone adaptation
        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'sequence_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
        message_count: state.messages.length,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        messages: state.messages,
        target_analysis: state.target_analysis,
        common_ground: state.common_ground,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        messages: unknown;
        target_analysis: unknown;
        common_ground: unknown;
      };

      try {
        await supabaseAdmin
          .from('networking_outreach_reports')
          .insert({
            user_id: state.user_id,
            target_name: state.target_input?.target_name ?? '',
            target_company: state.target_input?.target_company ?? '',
            target_title: state.target_input?.target_title ?? '',
            report_markdown: data.report,
            quality_score: data.quality_score,
            messages: data.messages,
            target_analysis: data.target_analysis,
            common_ground: data.common_ground,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Networking outreach: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'researcher') {
        if (!state.target_analysis) {
          throw new Error('Researcher did not produce target analysis');
        }
      }
      if (agentName === 'writer') {
        if (!state.final_report) {
          throw new Error('Writer did not produce a final report');
        }
        if (!state.messages || state.messages.length === 0) {
          throw new Error('Writer did not produce any outreach messages');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
