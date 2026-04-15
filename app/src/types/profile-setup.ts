import type { CareerProfileV2 } from '@/types/career-profile';

export type { CareerProfileV2 };

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

export interface InterviewResponse {
  acknowledgment: string;
  next_question: string | null;
  question_index: number;
  complete: boolean;
}

/**
 * CareerIQProfileFull is now an alias for CareerProfileV2.
 * The profile-setup flow returns CareerProfileV2 from the server.
 */
export type CareerIQProfileFull = CareerProfileV2;
