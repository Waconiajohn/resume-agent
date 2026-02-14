export type SSEEventType =
  | 'connected'
  | 'text_delta'
  | 'text_complete'
  | 'tool_start'
  | 'tool_complete'
  | 'ask_user'
  | 'phase_change'
  | 'phase_gate'
  | 'right_panel_update'
  | 'transparency'
  | 'section_status'
  | 'resume_update'
  | 'export_ready'
  | 'checkpoint'
  | 'error'
  | 'complete'
  | 'heartbeat';

export interface TextDeltaEvent {
  type: 'text_delta';
  content: string;
}

export interface TextCompleteEvent {
  type: 'text_complete';
  content: string;
}

export interface ToolStartEvent {
  type: 'tool_start';
  tool_name: string;
  description: string;
}

export interface ToolCompleteEvent {
  type: 'tool_complete';
  tool_name: string;
  summary: string;
}

export interface AskUserEvent {
  type: 'ask_user';
  tool_call_id: string;
  question: string;
  context: string;
  input_type: 'text' | 'voice' | 'multiple_choice';
  choices?: Array<{ label: string; description?: string }>;
  skip_allowed: boolean;
}

export interface PhaseChangeEvent {
  type: 'phase_change';
  from_phase: string;
  to_phase: string;
  summary: string;
}

export interface ResumeUpdateEvent {
  type: 'resume_update';
  section: string;
  content: string;
  change_type: 'rewrite' | 'add' | 'remove';
}

export interface ExportReadyEvent {
  type: 'export_ready';
  resume: ExportResumeData;
}

export interface ExportResumeData {
  summary: string;
  experience: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date: string;
    location: string;
    bullets: Array<{ text: string; source: string }>;
  }>;
  skills: Record<string, string[]>;
  education: Array<{ institution: string; degree: string; field: string; year: string }>;
  certifications: Array<{ name: string; issuer: string; year: string }>;
  ats_score: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  recoverable: boolean;
  retry_action?: string;
}

export interface CompleteEvent {
  type: 'complete';
  ats_score: number;
  requirements_addressed: number;
  sections_rewritten: number;
}

export interface PhaseGateEvent {
  type: 'phase_gate';
  from: string;
  to: string;
  blocked: boolean;
  reason?: string;
}

export interface RightPanelUpdateEvent {
  type: 'right_panel_update';
  panel_type: string;
  data: Record<string, unknown>;
}

export interface TransparencyEvent {
  type: 'transparency';
  message: string;
}

export interface SectionStatusEvent {
  type: 'section_status';
  section: string;
  status: string;
  score?: number;
}

export type SSEEvent =
  | TextDeltaEvent
  | TextCompleteEvent
  | ToolStartEvent
  | ToolCompleteEvent
  | AskUserEvent
  | PhaseChangeEvent
  | ResumeUpdateEvent
  | ExportReadyEvent
  | ErrorEvent
  | CompleteEvent
  | PhaseGateEvent
  | RightPanelUpdateEvent
  | TransparencyEvent
  | SectionStatusEvent;
