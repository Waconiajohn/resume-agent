/**
 * Profile Setup — shared types
 *
 * Used by intake-agent.ts, synthesizer.ts, interview-runner.ts, and
 * the profile-setup routes.
 */

export interface ProfileSetupInput {
  resume_text: string;
  linkedin_about: string;
  target_roles: string;
  situation: string;
  user_id: string;
  session_id: string;
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
  }>;
}

export interface CareerIQProfileFull {
  career_thread: string;
  top_capabilities: Array<{
    capability: string;
    evidence: string;
    source: 'resume' | 'linkedin' | 'interview' | 'all';
  }>;
  signature_story: {
    situation: string;
    task: string;
    action: string;
    result: string;
    reflection: string;
  };
  honest_answer: {
    concern: string;
    response: string;
  };
  righteous_close: string;
  why_me_final: string;
  target_roles: string[];
  created_at: string;
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
  created_at: number;
  last_active_at: number;
}
