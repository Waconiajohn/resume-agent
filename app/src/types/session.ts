export type CoachPhase =
  | 'setup'
  | 'research'
  | 'analysis'
  | 'interview'
  | 'tailoring'
  | 'review'
  | 'export';

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
