/**
 * Interview Prep Product — ProductConfig implementation.
 *
 * Agent #10: 2-agent pipeline (Researcher → Writer) that generates
 * comprehensive interview preparation documents from resume + JD.
 * Autonomous — no user gates. Full report delivered at once.
 */

import type { ProductConfig } from '../runtime/product-config.js';
import { researcherConfig } from './researcher/agent.js';
import { writerConfig } from './writer/agent.js';
import type { InterviewPrepState, InterviewPrepSSEEvent } from './types.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import logger from '../../lib/logger.js';
import { getToneGuidanceFromInput, getDistressFromInput } from '../../lib/emotional-baseline.js';

export function createInterviewPrepProductConfig(): ProductConfig<InterviewPrepState, InterviewPrepSSEEvent> {
  return {
    domain: 'interview-prep',

    agents: [
      {
        name: 'researcher',
        config: researcherConfig,
        stageMessage: {
          startStage: 'research',
          start: 'Researching company and sourcing interview questions...',
          complete: 'Research complete — company intel and questions gathered',
        },
        onComplete: (scratchpad, state) => {
          // Transfer any scratchpad data not already set by tools
          if (scratchpad.resume_data && !state.resume_data) {
            state.resume_data = scratchpad.resume_data as InterviewPrepState['resume_data'];
          }
          if (scratchpad.jd_analysis && !state.jd_analysis) {
            state.jd_analysis = scratchpad.jd_analysis as InterviewPrepState['jd_analysis'];
          }
          if (scratchpad.company_research && !state.company_research) {
            state.company_research = scratchpad.company_research as InterviewPrepState['company_research'];
          }
          if (scratchpad.sourced_questions && !state.sourced_questions) {
            state.sourced_questions = scratchpad.sourced_questions as InterviewPrepState['sourced_questions'];
          }
        },
      },
      {
        name: 'writer',
        config: writerConfig,
        stageMessage: {
          startStage: 'writing',
          start: 'Writing your interview preparation report...',
          complete: 'STAR stories ready for review',
        },
        onComplete: (scratchpad, state, emit) => {
          if (scratchpad.final_report && typeof scratchpad.final_report === 'string') {
            state.final_report = scratchpad.final_report;
          }
          if (typeof scratchpad.quality_score === 'number') {
            state.quality_score = scratchpad.quality_score;
          }

          // Emit review data before the gate blocks
          if (state.final_report) {
            emit({
              type: 'star_stories_review_ready',
              session_id: state.session_id,
              report: state.final_report,
              quality_score: state.quality_score ?? 0,
            });
            emit({ type: 'pipeline_gate', gate: 'star_stories_review' });
          }
        },
        gates: [
          {
            name: 'star_stories_review',
            condition: (state) => typeof state.final_report === 'string' && state.final_report.length > 0,
            onResponse: (response, state) => {
              if (response === true || response === 'approved') {
                // Approved — no changes needed
              } else if (response && typeof response === 'object') {
                const resp = response as Record<string, unknown>;
                if (typeof resp.edited_content === 'string') {
                  state.final_report = resp.edited_content;
                } else if (typeof resp.feedback === 'string') {
                  state.revision_feedback = resp.feedback;
                }
              }
            },
          },
        ],
      },
    ],

    createInitialState: (sessionId, userId, input) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'research',
      job_application_id: input.job_application_id as string | undefined,
      platform_context: input.platform_context as InterviewPrepState['platform_context'],
      sections: {} as InterviewPrepState['sections'],
    }),

    buildAgentMessage: (agentName, state, input) => {
      if (agentName === 'researcher') {
        const parts = [
          'Analyze the candidate resume and job description, research the company, and find real interview questions.',
          '',
          '## Resume',
          String(input.resume_text ?? ''),
          '',
          '## Job Description',
          String(input.job_description ?? ''),
          '',
          `Company: ${String(input.company_name ?? 'Unknown')}`,
        ];

        if (state.platform_context?.why_me_story) {
          parts.push(
            '',
            '## Why-Me Story (from CareerIQ)',
            JSON.stringify(state.platform_context.why_me_story, null, 2),
          );
        }

        if (state.platform_context?.positioning_strategy) {
          parts.push(
            '',
            '## Prior Positioning Strategy',
            JSON.stringify(state.platform_context.positioning_strategy, null, 2),
          );
        }

        parts.push('', 'Call parse_inputs first, then research_company, then find_interview_questions.');

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
          'Write the complete interview preparation report using the research data gathered.',
          '',
          'Follow your workflow exactly:',
          '1. write_section + self_review_section for: company_research, elevator_pitch, requirements_fit, technical_questions, behavioral_questions, three_two_one',
          '2. build_career_story for the why_me section',
          '3. write_section + self_review_section for: thirty_sixty_ninety, final_tips',
          '4. assemble_report to combine everything',
          '',
          'Do NOT skip any section. Do NOT skip self-review.',
        ];

        // If the user requested revisions at the review gate, incorporate feedback
        if (state.revision_feedback) {
          parts.push(
            '',
            '## User Revision Requested',
            `The user reviewed the STAR stories and requested the following changes: "${state.revision_feedback}"`,
            'Call assemble_report again incorporating this feedback.',
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
        type: 'report_complete',
        session_id: state.session_id,
        report: state.final_report ?? '',
        quality_score: state.quality_score ?? 0,
      });

      return {
        report: state.final_report,
        quality_score: state.quality_score,
        company_research: state.company_research,
        sourced_questions: state.sourced_questions,
        career_story_questions: state.career_story_questions,
      };
    },

    persistResult: async (state, result) => {
      const data = result as {
        report: string;
        quality_score: number;
        company_research: unknown;
        sourced_questions: unknown;
        career_story_questions: unknown;
      };

      try {
        await supabaseAdmin
          .from('interview_prep_reports')
          .insert({
            user_id: state.user_id,
            job_application_id: state.job_application_id ?? null,
            company_name: state.jd_analysis?.company_name ?? 'Unknown',
            role_title: state.jd_analysis?.role_title ?? 'Unknown',
            report_markdown: data.report,
            quality_score: data.quality_score,
            company_research: data.company_research,
            sourced_questions: data.sourced_questions,
            career_story_questions: data.career_story_questions,
          });
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : String(err), userId: state.user_id },
          'Interview prep: failed to persist report (non-fatal)',
        );
      }
    },

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'researcher') {
        if (!state.resume_data) {
          throw new Error('Researcher did not parse resume data');
        }
        if (!state.jd_analysis) {
          throw new Error('Researcher did not analyze job description');
        }
        // Company research is optional — Perplexity may be unavailable
      }
    },

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
