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
  why_me_final: {
    headline: string; // 1 sentence — the 3-5 second hook
    body: string;     // 2-3 sentences — proof that backs up the headline
  };
  target_roles: string[];
  created_at: string;
}
