/**
 * Profile Setup — shared types
 *
 * Used by intake-agent.ts, synthesizer.ts, interview-runner.ts, and
 * the profile-setup routes.
 */

import type { CareerProfileV2 } from '../../lib/career-profile-context.js';

export interface ProfileSetupInput {
  resume_text: string;
  linkedin_about: string;
  target_roles: string;
  situation: string;
  user_id: string;
  session_id: string;
}

export interface StructuredExperience {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string;
  scope_statement: string;
  original_bullets: string[];
}

export interface IntakeAnalysis {
  why_me_draft: string;
  career_thread: string;
  top_capabilities: Array<{ capability: string; evidence: string }>;
  profile_gaps: string[];
  primary_concern: string | null;
  interview_questions: Array<{
    question: string;
    what_we_are_looking_for: string;
    references_resume_element: string | null;
    suggested_starters: string[];
  }>;
  structured_experience: StructuredExperience[];
}

export interface InterviewAnswer {
  question_index: number;
  question: string;
  answer: string;
}

export interface InterviewResponse {
  acknowledgment: string;
  next_question: string | null;
  question_index: number;
  complete: boolean;
}

export interface ProfileSetupSessionState {
  user_id: string;
  session_id: string;
  input: ProfileSetupInput;
  intake: IntakeAnalysis;
  answers: InterviewAnswer[];
  completed_profile?: CareerProfileV2 | null;
  provenance_session_id?: string | null;
  created_at: number;
  last_active_at: number;
}
