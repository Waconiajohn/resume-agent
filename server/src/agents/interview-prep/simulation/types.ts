/**
 * Mock Interview Simulation — Shared types.
 *
 * Supports the interactive mock interview flow where the agent presents
 * questions one at a time, pauses for user answers, evaluates each answer
 * against the STAR framework, and delivers a performance summary.
 *
 * Pipeline: Interviewer (single agent, gate-based — one gate per question)
 */

import type { BaseState } from '../../runtime/agent-protocol.js';
import type { CareerProfileV2 } from '../../../lib/career-profile-context.js';
import type { SharedContext } from '../../../contracts/shared-context.js';

// ─── Question & Evaluation Types ─────────────────────────────────────

export type QuestionType = 'behavioral' | 'technical' | 'situational';

export type MockInterviewMode = 'full' | 'practice';

export interface InterviewQuestion {
  index: number;
  type: QuestionType;
  question: string;
  /** Why this question was chosen — internal context for the evaluator */
  context?: string;
}

export interface AnswerEvaluation {
  question_index: number;
  question_type: QuestionType;
  question: string;
  answer: string;
  scores: {
    /** Did the answer include Situation, Task, Action, and Result? (0-100) */
    star_completeness: number;
    /** How relevant was the answer to the role and company? (0-100) */
    relevance: number;
    /** Did the answer communicate business impact? (0-100) */
    impact: number;
    /** Were concrete details and metrics included? (0-100) */
    specificity: number;
  };
  overall_score: number;
  strengths: string[];
  improvements: string[];
  /** A brief hint at a stronger answer approach — not a full model answer */
  model_answer_hint?: string;
}

// ─── Pipeline State ───────────────────────────────────────────────────

export interface MockInterviewState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;
  mode: MockInterviewMode;
  /** Total number of questions to ask (6 for full, 1 for practice) */
  max_questions: number;
  questions_asked: InterviewQuestion[];
  evaluations: AnswerEvaluation[];
  current_question_index: number;
  resume_text?: string;
  job_description?: string;
  company_name?: string;
  /** Cross-product context from prior CareerIQ sessions */
  platform_context?: {
    career_profile?: CareerProfileV2;
    positioning_strategy?: Record<string, unknown>;
    why_me_story?: Record<string, unknown>;
    evidence_items?: Record<string, unknown>[];
  };
  /** Canonical shared context, populated alongside legacy platform_context during migration */
  shared_context?: SharedContext;
  final_summary?: {
    overall_score: number;
    total_questions: number;
    strengths: string[];
    areas_for_improvement: string[];
    recommendation: string;
  };
}

// ─── SSE Events ───────────────────────────────────────────────────────

export type MockInterviewSSEEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'question_presented'; question: InterviewQuestion }
  | { type: 'answer_evaluated'; evaluation: AnswerEvaluation }
  | { type: 'simulation_complete'; session_id: string; summary: MockInterviewState['final_summary'] }
  | { type: 'pipeline_error'; stage: string; error: string };
