/**
 * Discovery Agent — Type Definitions
 *
 * The "Moment of Recognition" discovery flow. Users drop their resume + one job
 * and within 30 seconds the AI speaks first with a recognition statement about
 * who they are.
 */

import type { JobIntelligenceOutput, CandidateIntelligenceOutput, BenchmarkCandidateOutput, HiringManagerObjection } from '../resume-v2/types.js';

export type { JobIntelligenceOutput, CandidateIntelligenceOutput, BenchmarkCandidateOutput, HiringManagerObjection };

export interface DiscoveryInput {
  resume_text: string;
  job_description: string;
  job_url?: string;
  user_id: string;
  session_id: string;
}

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
  hiring_manager_concerns: HiringManagerObjection[];
}

export interface ResumeUpdate {
  section: string;
  bullet_id?: string;
  action: 'highlight' | 'strengthen' | 'add';
  text?: string;
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

export type DiscoverySSEEvent =
  | { type: 'processing_stage'; stage: string; message: string }
  | { type: 'recognition_ready'; data: DiscoveryOutput }
  | { type: 'excavation_response'; data: ExcavationResponse }
  | { type: 'profile_ready'; data: CareerIQProfile }
  | { type: 'resume_highlight'; section: string; bullet_id?: string }
  | { type: 'error'; message: string };

/**
 * In-memory session state for the discovery flow.
 * Keyed by session_id. Holds everything needed to continue an excavation conversation.
 */
export interface DiscoverySessionState {
  user_id: string;
  session_id: string;
  candidate: CandidateIntelligenceOutput;
  job_intelligence: JobIntelligenceOutput;
  benchmark: BenchmarkCandidateOutput;
  discovery: DiscoveryOutput;
  conversation_history: Array<{ role: 'ai' | 'user'; content: string }>;
  excavation_answers: Array<{ question: string; answer: string }>;
  remaining_questions: ExcavationQuestion[];
  created_at: number;
}
