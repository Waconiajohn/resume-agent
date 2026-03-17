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
import type { NetworkingOutreachState, NetworkingOutreachSSEEvent, MessagingMethod } from './types.js';
import { MESSAGING_METHOD_CONFIG } from './types.js';
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
          complete: 'Outreach sequence ready — review your messages before sending',
        },
        onComplete: (scratchpad, state, emit) => {
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (Array.isArray(scratchpad.messages)) {
            state.messages = scratchpad.messages as NetworkingOutreachState['messages'];
          }

          // Emit sequence data for review panel before the gate blocks
          if (state.messages && state.messages.length > 0) {
            emit({
              type: 'sequence_review_ready',
              session_id: state.session_id,
              messages: state.messages,
              target_name: state.target_input?.target_name ?? '',
              target_company: state.target_input?.target_company ?? '',
              quality_score: state.quality_score ?? 0,
            });
            emit({ type: 'pipeline_gate', gate: 'sequence_review' });
          }
        },
        gates: [
          {
            name: 'sequence_review',
            condition: (state) => Array.isArray(state.messages) && state.messages.length > 0,
            onResponse: (response, state) => {
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.feedback === 'string') {
                  state.revision_feedback = resp.feedback;
                } else {
                  state.revision_feedback = undefined;
                }
              }
            },
            requiresRerun: (state) => !!state.revision_feedback,
          },
        ],
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'research',
      platform_context: input.platform_context as NetworkingOutreachState['platform_context'],
      target_input: input.target_input as NetworkingOutreachState['target_input'],
      messaging_method: (input.messaging_method as MessagingMethod | undefined) ?? 'group_message',
      messages: [],
    }),

    buildAgentMessage: async (agentName, state, input) => {
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

        if (state.platform_context?.career_profile) {
          parts.push('', '## Career Profile', JSON.stringify(state.platform_context.career_profile, null, 2));
        }
        if (state.platform_context?.why_me_story) {
          parts.push('', '## Why-Me Story', JSON.stringify(state.platform_context.why_me_story, null, 2));
        }
        if (state.platform_context?.positioning_strategy) {
          parts.push('', '## Positioning Strategy', JSON.stringify(state.platform_context.positioning_strategy, null, 2));
        }

        parts.push(
          '',
          '## Objective',
          'Use the available tools to understand the target, find genuine common ground, judge the right connection path, and plan an outreach sequence that feels personal without sounding forced.',
        );

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
        const method = (state.messaging_method ?? 'group_message') as MessagingMethod;
        const methodConfig = MESSAGING_METHOD_CONFIG[method];
        const parts = [
          'Write the complete outreach sequence using the research data gathered.',
          '',
          `## Messaging Method: ${methodConfig.label}`,
          `Message format: ${
            method === 'connection_request'
              ? 'STRICT 300 character limit. Be extremely concise.'
              : method === 'group_message'
              ? 'Group message format. Can be up to 8000 characters but keep it professional and concise.'
              : 'InMail format. Up to 1900 characters.'
          }`,
          '',
          'Use the available writing tools to produce the full sequence: connection request, follow-up 1, follow-up 2, value offer, meeting request, and one assembled sequence. Each message should respect the method limits and feel naturally connected to the research.',
        ];

        // If the user requested revisions at the review gate, include feedback
        if (state.revision_feedback) {
          parts.push(
            '',
            '## User Revision Requested',
            `The user reviewed the outreach sequence and requested the following changes: "${state.revision_feedback}"`,
            'Rewrite the affected messages to address this feedback, preserve the best personalization hooks, and then rebuild the final sequence.',
          );
        }

        // Cross-reference recent LinkedIn posts for genuine personalization
        try {
          const { data: recentPosts } = await supabaseAdmin
            .from('content_posts')
            .select('topic, content, status, created_at')
            .eq('user_id', state.user_id)
            .in('status', ['approved', 'published'])
            .order('created_at', { ascending: false })
            .limit(5);

          if (recentPosts && recentPosts.length > 0) {
            parts.push('');
            parts.push('## Recent LinkedIn Posts (use these for genuine personalization)');
            for (const p of recentPosts) {
              const postDate = new Date(p.created_at as string).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              parts.push(`- "${p.topic as string}" (${p.status as string}, ${postDate})`);
            }
            parts.push('Reference these naturally when they strengthen the outreach message.');
          }
        } catch {
          // Non-fatal — outreach works without post context
        }

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
