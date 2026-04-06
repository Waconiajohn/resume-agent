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

export interface InterviewResponse {
  acknowledgment: string;
  next_question: string | null;
  question_index: number;
  complete: boolean;
}

export interface CareerIQProfileFull {
  career_thread: string;
  top_capabilities: Array<{
    capability: string;
    evidence: string;
    source: string;
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
