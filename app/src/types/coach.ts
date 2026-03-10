/**
 * Virtual Coach — Frontend types.
 */

export type CoachingPhase =
  | 'onboarding'
  | 'positioning'
  | 'resume_ready'
  | 'linkedin_ready'
  | 'job_targeting'
  | 'interview_prep'
  | 'offer_stage'
  | 'complete';

export type CoachMode = 'chat' | 'guided';

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface CoachEvent {
  type: string;
  [key: string]: unknown;
}

export interface CoachConversation {
  messages: CoachMessage[];
  turn_count: number;
  mode: CoachMode;
  created_at?: string;
}

export interface CoachMessageResponse {
  response: string;
  turn_count: number;
  usage: { input_tokens: number; output_tokens: number };
  events: CoachEvent[];
}
