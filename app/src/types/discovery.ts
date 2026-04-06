export interface RecognitionStatement {
  career_thread: string;
  role_fit: string;
  differentiator: string;
}

export interface ExcavationQuestion {
  question: string;
  what_we_are_looking_for: string;
  resume_reference?: string;
}

export interface DiscoveryOutput {
  recognition: RecognitionStatement;
  excavation_questions: ExcavationQuestion[];
  profile_gaps: string[];
  hiring_manager_concerns: Array<{ objection: string; neutralization_strategy: string }>;
}

export interface ResumeUpdate {
  section: string;
  bullet_id?: string;
  action: 'highlight' | 'strengthen' | 'add' | 'reorder';
  text?: string;
  position?: number;
}

export interface ExcavationResponse {
  next_question: string | null;
  resume_updates: ResumeUpdate[];
  insight: string;
  complete: boolean;
}

export interface CareerIQProfile {
  career_thread: string;
  exceptional_areas: Array<{ area: string; evidence: string }>;
  role_fit_points: Array<{ point: string; evidence: string }>;
  hiring_manager_concerns: Array<{ concern: string; response: string }>;
}

export interface LiveResumeBullet {
  id: string;
  text: string;
  highlighted: boolean;
  strengthened: boolean;
}

export interface LiveResumeSection {
  id: string;
  company: string;
  title: string;
  dates: string;
  bullets: LiveResumeBullet[];
}

export interface LiveResumeState {
  name: string;
  email: string;
  phone: string;
  summary: string;
  experience: LiveResumeSection[];
  skills: string[];
  education: Array<{ degree: string; institution: string; year?: string }>;
}

export type DiscoverySSEEvent =
  | { type: 'processing_stage'; stage: string; message: string }
  | { type: 'recognition_ready'; data: { session_id: string; discovery: DiscoveryOutput } }
  | { type: 'error'; message: string };
