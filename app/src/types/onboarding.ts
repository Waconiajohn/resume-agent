/**
 * App-side types for the Onboarding Assessment Agent.
 *
 * Mirrors the backend types in server/src/agents/onboarding/types.ts.
 * Keep in sync when the backend types change.
 */

export interface AssessmentQuestion {
  id: string;
  question: string;
  category:
    | 'career_context'
    | 'transition_drivers'
    | 'timeline_and_urgency'
    | 'goals_and_aspirations'
    | 'support_needs';
  purpose: string;
  follow_up_trigger?: string;
}

export type FinancialSegment = 'crisis' | 'stressed' | 'ideal' | 'comfortable';
export type CareerLevel = 'mid_level' | 'senior' | 'director' | 'vp' | 'c_suite';
export type EmotionalState =
  | 'denial'
  | 'anger'
  | 'bargaining'
  | 'depression'
  | 'acceptance'
  | 'growth';

export interface ClientProfile {
  career_level: CareerLevel;
  industry: string;
  years_experience: number;
  financial_segment: FinancialSegment;
  emotional_state: EmotionalState;
  transition_type: 'involuntary' | 'voluntary' | 'preemptive';
  goals: string[];
  constraints: string[];
  strengths_self_reported: string[];
  urgency_score: number;
  recommended_starting_point:
    | 'resume'
    | 'linkedin'
    | 'networking'
    | 'interview_prep'
    | 'career_exploration';
  coaching_tone: 'supportive' | 'direct' | 'motivational';
}

export interface AssessmentSummary {
  key_insights: string[];
  financial_signals: string[];
  emotional_signals: string[];
  recommended_actions: string[];
}

export type OnboardingStatus =
  | 'idle'
  | 'connecting'
  | 'generating_questions'
  | 'awaiting_responses'
  | 'evaluating'
  | 'complete'
  | 'error';
