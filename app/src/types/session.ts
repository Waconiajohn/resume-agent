export type CoachPhase =
  | 'onboarding'
  | 'deep_research'
  | 'gap_analysis'
  | 'resume_design'
  | 'section_craft'
  | 'quality_review'
  | 'cover_letter';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';

export interface CoachSession {
  id: string;
  status: SessionStatus;
  current_phase: CoachPhase;
  master_resume_id: string | null;
  job_application_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ToolStatus {
  name: string;
  description: string;
  status: 'running' | 'complete';
  summary?: string;
}

export interface AskUserPromptData {
  toolCallId: string;
  question: string;
  context: string;
  inputType: 'text' | 'voice' | 'multiple_choice';
  choices?: Array<{ label: string; description?: string }>;
  skipAllowed: boolean;
}

export interface PhaseGateData {
  toolCallId: string;
  currentPhase: string;
  nextPhase: string;
  phaseSummary: string;
  nextPhasePreview: string;
}
