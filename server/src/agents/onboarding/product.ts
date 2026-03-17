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
import { loadCareerProfileContext } from '../../lib/career-profile-context.js';
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
        const parts = [
          'You are building or refining this candidate\'s Career Profile.',
          'Use the available context to ask only the highest-value questions that will sharpen downstream resume, LinkedIn, job-search, and interview work.',
          '',
        ];

        const resumeText = String((input as Record<string, unknown>).resume_text ?? '');
        if (resumeText.length > 50) {
          parts.push('## Resume (provided)', resumeText, '');
        } else {
          parts.push('## Resume', 'No resume provided yet — this user is starting fresh.', '');
        }

        parts.push(
          'Focus on uncovering role direction, strengths with proof, real constraints, and truthful adjacent positioning.',
          'Keep the first pass concise. Ask 3-5 personalized questions total and avoid repeating what is already well-supported by the resume or prior context.',
        );

        // Distress resources — first invocation only (question generation pass)
        const distress = getDistressFromInput(input);
        if (distress) {
          parts.push('', '## Support Resources', distress.message);
          for (const r of distress.resources) {
            parts.push(`- **${r.name}**: ${r.description} (${r.contact})`);
          }
        }

        if (state.platform_context?.career_profile) {
          parts.push(
            '',
            '## Existing Career Profile',
            JSON.stringify(state.platform_context.career_profile, null, 2),
          );
        }

        if (state.platform_context?.positioning_strategy) {
          parts.push(
            '',
            '## Prior Positioning Strategy',
            JSON.stringify(state.platform_context.positioning_strategy, null, 2),
          );
        }

        if (state.platform_context?.why_me_story) {
          parts.push(
            '',
            '## Existing Why-Me Story',
            JSON.stringify(state.platform_context.why_me_story, null, 2),
          );
        }

        const toneGuidance = getToneGuidanceFromInput(input);
        if (toneGuidance) {
          parts.push(toneGuidance);
        }

        return parts.join('\n');
      }

      if (agentName === 'assessor_evaluation') {
        const parts = [
          'The user has answered the Career Profile assessment questions.',
          '## User Responses',
          JSON.stringify(state.responses, null, 2),
          '',
          'Use the responses, resume, and prior context to refine the candidate\'s direction, strengths, proof themes, constraints, urgency, and coaching tone.',
          'You are responsible for producing an honest client profile that downstream agents can trust.',
        ];

        if (state.platform_context?.career_profile) {
          parts.push(
            '',
            '## Existing Career Profile',
            JSON.stringify(state.platform_context.career_profile, null, 2),
          );
        }

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
          career_profile: state.career_profile,
          summary: state.assessment_summary,
        });
      }

      return {
        client_profile: state.client_profile,
        career_profile: state.career_profile,
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

      try {
        const careerProfile = await loadCareerProfileContext(state.user_id);
        if (careerProfile) {
          state.career_profile = careerProfile;
          await upsertUserContext(
            state.user_id,
            'career_profile',
            careerProfile as unknown as Record<string, unknown>,
            'onboarding',
            state.session_id,
          );
        }
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Onboarding: failed to persist normalized career profile (non-fatal)',
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
