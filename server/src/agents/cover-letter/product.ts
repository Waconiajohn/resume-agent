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
          complete: 'Cover letter complete',
        },
        onComplete: (scratchpad, state) => {
          if (scratchpad.letter_draft && typeof scratchpad.letter_draft === 'string') {
            state.letter_draft = scratchpad.letter_draft;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }
          if (typeof scratchpad.review_feedback === 'string') {
            state.review_feedback = scratchpad.review_feedback;
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'analysis',
      // Input data will be parsed by the analyst agent's tools
      resume_data: undefined,
      jd_analysis: undefined,
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'analyst') {
        return [
          'Analyze the following resume and job description to create a cover letter plan.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          '## Job Description',
          String(input.job_description ?? ''),
          '',
          `Company: ${String(input.company_name ?? 'Unknown')}`,
          '',
          'Call parse_inputs first, then match_requirements, then plan_letter.',
        ].join('\n');
      }

      if (agentName === 'writer') {
        const plan = state.letter_plan;
        return [
          'Write a professional cover letter based on the analysis plan.',
          '',
          plan ? `## Letter Plan\n${JSON.stringify(plan, null, 2)}` : '',
          '',
          'Call write_letter to generate the letter, then review_letter to check quality.',
        ].join('\n');
      }

      return '';
    },

    finalizeResult: (state, _input, emit) => {
      emit({
        type: 'letter_complete',
        session_id: state.session_id,
        letter: state.letter_draft ?? '',
        quality_score: state.quality_score ?? 0,
      });

      return {
        letter: state.letter_draft,
        quality_score: state.quality_score,
        review_feedback: state.review_feedback,
      };
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
