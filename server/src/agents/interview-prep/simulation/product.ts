/**
 * Mock Interview Simulation Product — ProductConfig implementation.
 *
 * Single-agent pipeline (Interviewer only). Gate-based: the agent pauses
 * once per question for the user to answer, then evaluates and continues.
 *
 * Full mode:     6 questions, mixed behavioral/technical/situational
 * Practice mode: 1 question of a specified type
 *
 * Results are ephemeral — no DB persistence. The simulation_complete SSE
 * event carries the full summary to the frontend.
 */

import type { ProductConfig } from '../../runtime/product-config.js';
import { interviewerConfig } from './interviewer/agent.js';
import type { MockInterviewState, MockInterviewSSEEvent, MockInterviewMode, QuestionType } from './types.js';
import {
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';

export function createMockInterviewProductConfig(): ProductConfig<MockInterviewState, MockInterviewSSEEvent> {
  return {
    domain: 'mock-interview',

    agents: [
      {
        name: 'interviewer',
        config: interviewerConfig,
        stageMessage: {
          startStage: 'interview',
          start: 'Starting your mock interview session...',
          complete: 'Mock interview complete — reviewing your performance',
        },
        onComplete: (scratchpad, state) => {
          // Transfer accumulated evaluations from scratchpad if not already in state
          if (Array.isArray(scratchpad.evaluations) && state.evaluations.length === 0) {
            state.evaluations = scratchpad.evaluations as MockInterviewState['evaluations'];
          }
          if (Array.isArray(scratchpad.questions_asked) && state.questions_asked.length === 0) {
            state.questions_asked = scratchpad.questions_asked as MockInterviewState['questions_asked'];
          }
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => {
      const mode: MockInterviewMode =
        input.mode === 'practice' ? 'practice' : 'full';
      const maxQuestions = mode === 'practice' ? 1 : 6;

      return {
        session_id: sessionId,
        user_id: userId,
        current_stage: 'interview',
        mode,
        max_questions: maxQuestions,
        questions_asked: [],
        evaluations: [],
        current_question_index: 0,
        resume_text: input.resume_text ? String(input.resume_text) : undefined,
        job_description: input.job_description ? String(input.job_description) : undefined,
        company_name: input.company_name ? String(input.company_name) : undefined,
        platform_context: input.platform_context as MockInterviewState['platform_context'],
      };
    },

    buildAgentMessage: (agentName, state, input) => {
      if (agentName !== 'interviewer') return '';

      const parts: string[] = [];

      if (state.mode === 'full') {
        parts.push(
          `Conduct a mock interview with ${state.max_questions} questions. ` +
          `Mix behavioral, technical, and situational question types.`,
          '',
          `For each question follow this exact sequence:`,
          `  generate_interview_question → present_question_to_user → evaluate_answer`,
          '',
          `After all ${state.max_questions} questions are complete, call emit_transparency with ` +
          `a message summarizing overall performance (e.g. average score, top strengths). ` +
          `The system will generate the final summary automatically.`,
        );
      } else {
        // Practice mode: one targeted question
        const questionType: QuestionType =
          input.question_type === 'technical' ? 'technical'
          : input.question_type === 'situational' ? 'situational'
          : 'behavioral';

        parts.push(
          `Conduct a focused practice session with 1 ${questionType} question.`,
          '',
          `Sequence: generate_interview_question (type: ${questionType}) → present_question_to_user → evaluate_answer`,
          '',
          `Provide detailed evaluation feedback — this is a practice session so the candidate ` +
          `wants to understand exactly how to improve their answer.`,
        );
      }

      // Candidate context
      if (state.resume_text) {
        parts.push('', '## Candidate Resume', state.resume_text.slice(0, 3000));
      }
      if (state.job_description) {
        parts.push('', '## Target Job Description', state.job_description.slice(0, 2000));
      }
      if (state.company_name) {
        parts.push('', `## Target Company`, state.company_name);
      }

      // Platform context enrichment
      if (state.platform_context?.career_profile) {
        parts.push(
          '',
          '## Career Profile',
          JSON.stringify(state.platform_context.career_profile, null, 2),
        );
      }
      if (state.platform_context?.positioning_strategy) {
        parts.push(
          '',
          ...renderPositioningStrategySection({
            heading: '## Prior Positioning Strategy (from CareerIQ resume session)',
            legacyStrategy: state.platform_context.positioning_strategy,
          }),
        );
      }
      if (state.platform_context?.why_me_story) {
        parts.push(
          '',
          '## Why-Me Story',
          JSON.stringify(state.platform_context.why_me_story, null, 2),
        );
      }
      if (
        Array.isArray(state.platform_context?.evidence_items) &&
        (state.platform_context?.evidence_items ?? []).length > 0
      ) {
        parts.push(
          '',
          ...renderEvidenceInventorySection({
            heading: '## Evidence Items (use to generate targeted questions)',
            legacyEvidence: state.platform_context?.evidence_items ?? [],
            maxItems: 5,
          }),
        );
      }

      return parts.join('\n');
    },

    finalizeResult: (state, _input, emit) => {
      const evaluations = state.evaluations;
      const totalQuestions = evaluations.length;

      let overallScore = 0;
      const allStrengths: string[] = [];
      const allImprovements: string[] = [];

      if (totalQuestions > 0) {
        overallScore = Math.round(
          evaluations.reduce((sum, e) => sum + e.overall_score, 0) / totalQuestions,
        );

        // Collect unique strengths and improvements across all evaluations
        for (const e of evaluations) {
          for (const s of e.strengths) {
            if (!allStrengths.includes(s)) allStrengths.push(s);
          }
          for (const imp of e.improvements) {
            if (!allImprovements.includes(imp)) allImprovements.push(imp);
          }
        }
      }

      // Generate recommendation based on overall score
      let recommendation: string;
      if (overallScore >= 85) {
        recommendation =
          'Outstanding performance. You are well-prepared for this type of interview. ' +
          'Focus on maintaining this level of specificity and impact in the real interview.';
      } else if (overallScore >= 70) {
        recommendation =
          'Strong performance with room to sharpen your answers. ' +
          'Work on quantifying your impact and ensuring every answer has a clear Result component.';
      } else if (overallScore >= 55) {
        recommendation =
          'Solid foundation. Practice structuring your answers using the STAR framework ' +
          '(Situation, Task, Action, Result) and lead with the business impact you delivered.';
      } else {
        recommendation =
          'Good start. Spend time developing 5-7 core STAR stories from your career that ' +
          'can be adapted to different question types. Specificity and quantification are key.';
      }

      const summary: MockInterviewState['final_summary'] = {
        overall_score: overallScore,
        total_questions: totalQuestions,
        strengths: allStrengths.slice(0, 5),
        areas_for_improvement: allImprovements.slice(0, 5),
        recommendation,
      };

      // Persist final summary to state
      state.final_summary = summary;

      emit({
        type: 'simulation_complete',
        session_id: state.session_id,
        summary,
      });

      return { summary, evaluations };
    },

    // No DB persistence — mock interviews are ephemeral
    persistResult: undefined,

    emitError: (stage, error, emit) => {
      emit({ type: 'pipeline_error', stage, error });
    },
  };
}
