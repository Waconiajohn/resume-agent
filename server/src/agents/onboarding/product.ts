/**
 * Onboarding Assessment Agent Product — ProductConfig implementation.
 *
 * Agent #1: Single-agent pipeline (Assessor) that conducts a brief 3-5 question
 * personalized assessment, detects financial segment from indirect signals,
 * and builds a ClientProfile stored in platform context for all downstream agents.
 *
 * Has one user gate: after generate_questions, the pipeline pauses for the user
 * to answer. On resume, the assessor evaluates responses and builds the profile.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { assessorConfig } from './assessor/agent.js';
import type { OnboardingState, OnboardingSSEEvent, ClientProfile, AssessmentSummary } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { upsertUserContext } from '../../lib/platform-context.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

export function createOnboardingProductConfig(): ProductConfig<OnboardingState, OnboardingSSEEvent> {
  return {
    domain: 'onboarding',

    agents: [
      // Phase 1: Generate questions, then pause at gate for user answers
      {
        name: 'assessor_questions',
        config: assessorConfig,
        stageMessage: {
          startStage: 'assessment',
          start: 'Starting your personalized assessment...',
          complete: 'Questions ready — waiting for your responses',
        },
        gates: [
          {
            name: 'onboarding_assessment',
            condition: (state) => state.questions.length > 0 && Object.keys(state.responses).length === 0,
            onResponse: (response, state) => {
              // User's question responses come back as Record<string, string>
              if (response && typeof response === 'object' && !Array.isArray(response)) {
                const entries = Object.entries(response as Record<string, unknown>);
                if (entries.length > 0) {
                  state.responses = Object.fromEntries(
                    entries.map(([k, v]) => [k, String(v ?? '')]),
                  );
                }
              }
            },
          },
        ],
        onComplete: (scratchpad, state) => {
          // Transfer questions from scratchpad to state so the gate condition can evaluate
          if (Array.isArray(scratchpad.questions) && state.questions.length === 0) {
            state.questions = scratchpad.questions as OnboardingState['questions'];
          }
        },
      },
      // Phase 2: Evaluate responses (runs after gate passes with user answers)
      {
        name: 'assessor_evaluation',
        config: assessorConfig,
        stageMessage: {
          startStage: 'evaluation',
          start: 'Analyzing your responses...',
          complete: 'Assessment complete — your profile is ready',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.client_profile && !state.client_profile) {
            state.client_profile = scratchpad.client_profile as ClientProfile;
          }
          if (scratchpad.assessment_summary && !state.assessment_summary) {
            state.assessment_summary = scratchpad.assessment_summary as AssessmentSummary;
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'assessment',
      questions: [],
      responses: {},
      platform_context: input.platform_context as OnboardingState['platform_context'],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'assessor_questions') {
        // Phase 1: Generate assessment questions
        const parts = [
          'Conduct a brief onboarding assessment for a new user.',
          '',
        ];

        const resumeText = String((input as Record<string, unknown>).resume_text ?? '');
        if (resumeText.length > 50) {
          parts.push('## Resume (provided)', resumeText, '');
        } else {
          parts.push('## Resume', 'No resume provided yet — this user is starting fresh.', '');
        }

        parts.push('Start by calling generate_questions to create 3-5 personalized assessment questions.');

        // Distress resources — first invocation only (question generation pass)
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        if (state.platform_context?.positioning_strategy) {
          parts.push(
            '',
            '## Prior Positioning Strategy',
            JSON.stringify(state.platform_context.positioning_strategy, null, 2),
          );
        }

        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      if (agentName === 'assessor_evaluation') {
        // Phase 2: Evaluate user responses and build profile
        const parts = [
          '## User Responses',
          'The user has answered the assessment questions. Process their responses now.',
          JSON.stringify(state.responses, null, 2),
          '',
          'Call evaluate_responses with these responses, then detect_financial_segment, then build_client_profile.',
        ];

        if (state.platform_context?.positioning_strategy) {
          parts.push(
            '',
            '## Prior Positioning Strategy',
            JSON.stringify(state.platform_context.positioning_strategy, null, 2),
          );
        }

        // Distress resources — include in evaluation pass too (user responses may reveal distress)
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      // Emit distress resources as a dedicated SSE event (guaranteed delivery)
      const distress = getDistressFromInput(_input);
      if (distress) {
        emit({
          type: 'distress_resources',
          message: distress.message,
          resources: distress.resources,
        });
      }

      if (state.client_profile && state.assessment_summary) {
        emit({
          type: 'assessment_complete',
          session_id: state.session_id,
          profile: state.client_profile,
          summary: state.assessment_summary,
        });
      }

      return {
        client_profile: state.client_profile,
        assessment_summary: state.assessment_summary,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        client_profile: ClientProfile;
        assessment_summary: AssessmentSummary;
      };

      // Persist to onboarding_assessments table
      try {
        await supabaseAdmin
          .from('onboarding_assessments')
          .insert({
            user_id: state.user_id,
            session_id: state.session_id,
            questions: state.questions,
            responses: state.responses,
            client_profile: data.client_profile,
            assessment_summary: data.assessment_summary,
            financial_segment: data.client_profile.financial_segment,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Onboarding: failed to persist assessment (non-fatal)',
        );
      }

      // Persist client profile to platform context for cross-product use
      try {
        await upsertUserContext(
          state.user_id,
          'client_profile',
          data.client_profile as unknown as Record<string, unknown>,
          'onboarding',
          state.session_id,
        );
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Onboarding: failed to persist platform context (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'assessor_evaluation') {
        if (!state.client_profile) {
          throw new Error('Assessor did not produce a client profile');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
