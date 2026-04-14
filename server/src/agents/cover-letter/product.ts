/**
 * Cover Letter Product — ProductConfig implementation.
 *
 * Minimal POC that runs 2 agents (Analyst → Writer) to generate
 * a cover letter from resume + JD inputs. Validates the platform
 * abstraction works for a second product beyond resumes.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { analystConfig } from './analyst/agent.js';
import { writerConfig } from './writer/agent.js';
import type { CoverLetterState, CoverLetterSSEEvent } from './types.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { hasMeaningfulSharedValue } from '../../contracts/shared-context.js';
import {
  renderCareerProfileSection,
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../contracts/shared-context-prompt.js';

export function createCoverLetterProductConfig(): ProductConfig<CoverLetterState, CoverLetterSSEEvent> {
  return {
    domain: 'cover-letter',

    agents: [
      {
        name: 'analyst',
        config: analystConfig,
        stageMessage: {
          startStage: 'analysis',
          start: 'Analyzing resume and job description...',
          complete: 'Analysis complete — letter plan ready',
        },
        onComplete: (scratchpad, state) => {
          // Transfer analyst findings to state if not already set by tools
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as CoverLetterState['resume_data'];
          }
          if (scratchpad.jd_analysis && !state.jd_analysis) {
            state.jd_analysis = scratchpad.jd_analysis as CoverLetterState['jd_analysis'];
          }
          if (scratchpad.letter_plan && !state.letter_plan) {
            state.letter_plan = scratchpad.letter_plan as CoverLetterState['letter_plan'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing your cover letter...',
          complete: 'Cover letter ready for review',
        },
        gates: [
          {
            name: 'letter_review',
            condition: (state) => typeof state.letter_draft === 'string' && state.letter_draft.length > 0,
            onResponse: (response, state) => {
              // Response: true (approved), or { feedback: string } (revision requested),
              // or { edited_content: string } (direct edit)
              if (response === true || response === 'approved') {
                state.revision_feedback = undefined;
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.edited_content === 'string') {
                  state.letter_draft = resp.edited_content;
                  state.revision_feedback = undefined;
                } else if (typeof resp.feedback === 'string') {
                  state.revision_feedback = resp.feedback;
                } else {
                  // H6: Unknown object shape — clear feedback to prevent phantom reruns
                  state.revision_feedback = undefined;
                }
              } else {
                // H6: Falsy or unknown response — clear feedback to prevent phantom reruns
                state.revision_feedback = undefined;
              }
            },
            requiresRerun: (state) => !!state.revision_feedback,
          },
        ],
        onComplete: (scratchpad, state, emit) => {
          if (scratchpad.letter_draft && typeof scratchpad.letter_draft === 'string') {
            state.letter_draft = scratchpad.letter_draft;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (typeof scratchpad.review_feedback === 'string') {
            state.review_feedback = scratchpad.review_feedback;
          }

          // Emit letter for review panel before the gate blocks
          if (state.letter_draft) {
            emit({
              type: 'letter_review_ready',
              session_id: state.session_id,
              letter_draft: state.letter_draft,
              quality_score: state.quality_score,
            });
            emit({ type: 'pipeline_gate', gate: 'letter_review' });
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'analysis',
      platform_context: input.platform_context as CoverLetterState['platform_context'],
      shared_context: input.shared_context as CoverLetterState['shared_context'],
      tone: (input.tone as CoverLetterState['tone']) ?? 'formal',
      // Input data will be parsed by the analyst agent's tools
      resume_data: undefined,
      jd_analysis: undefined,
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'analyst') {
        const sharedContext = state.shared_context;
        const parts = [
          'Analyze the following resume and job description to create a cover letter plan.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          '## Job Description',
          String(input.job_description ?? ''),
          '',
          `Company: ${String(input.company_name ?? 'Unknown')}`,
        ];

        if (
          hasMeaningfulSharedValue(sharedContext?.candidateProfile) ||
          state.platform_context?.career_profile
        ) {
          parts.push(...renderCareerProfileSection({
            heading: '## Career Profile',
            sharedContext,
            legacyCareerProfile: state.platform_context?.career_profile,
          }));
        }

        if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
          parts.push(...renderCareerNarrativeSection({
            heading: '## Career Narrative',
            sharedNarrative: sharedContext?.careerNarrative,
          }));
        }

        if (hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
          parts.push(
            '',
            '## Prior Positioning Strategy (from Resume Strategist)',
            'Use this canonical positioning context to shape which achievements and themes you emphasize.',
            ...renderPositioningStrategySection({
              heading: 'Positioning strategy summary',
              sharedStrategy: sharedContext?.positioningStrategy,
            }),
          );
        } else if (state.platform_context?.positioning_strategy) {
          parts.push(
            '',
            '## Prior Positioning Strategy (from Resume Strategist)',
            'The user has previously completed a resume positioning session. Use this strategy to inform your analysis:',
            ...renderPositioningStrategySection({
              heading: 'Positioning strategy summary',
              legacyStrategy: state.platform_context.positioning_strategy,
            }),
          );
        }

        if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) {
          parts.push(
            '',
            '## Prior Evidence Items',
            'The following canonical evidence items were captured during prior work. Leverage relevant items:',
            ...renderEvidenceInventorySection({
              heading: 'Evidence summary',
              sharedInventory: sharedContext?.evidenceInventory,
              maxItems: 15,
            }),
          );
        } else if (
          state.platform_context?.evidence_items &&
          state.platform_context.evidence_items.length > 0
        ) {
          parts.push(
            '',
            '## Prior Evidence Items',
            'The following evidence items were captured during the resume process. Leverage relevant items:',
            ...renderEvidenceInventorySection({
              heading: 'Evidence summary',
              legacyEvidence: state.platform_context.evidence_items,
              maxItems: 15,
            }),
          );
        }

        parts.push(
          '',
          '## Objective',
          'Use the available tools to parse the resume and job description, identify the strongest evidence-to-requirement matches, and build a letter plan that feels specific to this company. Ground every claim in the source material or saved Career Profile context before you finish the plan.',
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
        const plan = state.letter_plan;
        const tone = state.tone ?? 'formal';

        // Pass the raw source material so the writer can cross-reference claims
        // against the original text and catch anything the Analyst may have missed.
        const rawResume = String(input.resume_text ?? '').trim();
        const rawJd = String(input.job_description ?? '').trim();

        const parts = [
          'Write a professional cover letter based on the analysis plan below.',
          '',
          'The raw resume and job description are included so you can verify every claim',
          'traces to the source material. Do not invent experience, metrics, or accomplishments',
          'that are not present in the resume text.',
          '',
          plan ? `## Letter Plan (from Analyst)\n${JSON.stringify(plan, null, 2)}` : '',
          '',
          rawResume ? `## Source Resume (use this to verify all claims)\n${rawResume}` : '',
          '',
          rawJd ? `## Job Description (use this to verify alignment)\n${rawJd}` : '',
          '',
          `Tone requested by the user: **${tone}**. Pass this value as the tone parameter when calling write_letter.`,
          '',
          'Use the available writing tools to draft a credible, specific letter, then self-review it for clarity, role fit, and tone before presenting it.',
        ];

        // If the user requested revisions at the review gate, include feedback
        if (state.revision_feedback) {
          parts.push(
            '',
            '## User Revision Requested',
            `The user reviewed the cover letter and requested the following changes: "${state.revision_feedback}"`,
            'Revise the draft to address this feedback while keeping the letter specific, truthful, and concise. Re-run your quality check before you finish.',
          );
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
        type: 'letter_complete',
        session_id: state.session_id,
        letter: state.letter_draft ?? '',
        quality_score: state.quality_score ?? 0,
        jd_analysis: state.jd_analysis,
        letter_plan: state.letter_plan,
      });

      return {
        letter: state.letter_draft,
        quality_score: state.quality_score,
        review_feedback: state.review_feedback,
        jd_analysis: state.jd_analysis,
        letter_plan: state.letter_plan,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        letter: string | undefined;
        quality_score: number | undefined;
        review_feedback: string | undefined;
      };

      try {
        const { error } = await supabaseAdmin
          .from('session_workflow_artifacts')
          .insert({
            session_id: state.session_id,
            node_key: 'complete',
            artifact_type: 'cover_letter_result',
            version: 1,
            payload: {
              letter_draft: data.letter ?? '',
              quality_score: data.quality_score ?? 0,
              review_feedback: data.review_feedback ?? '',
              jd_analysis: state.jd_analysis,
              letter_plan: state.letter_plan,
            },
            created_by: 'cover-letter',
          });

        if (error) {
          logger.warn(
            { error: error.message, session_id: state.session_id },
            'Cover letter: failed to persist result to workflow artifacts (non-fatal)',
          );
        }
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), session_id: state.session_id },
          'Cover letter: failed to persist result (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'analyst' && !state.letter_plan) {
        throw new Error('Analyst did not produce a letter plan');
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
