// ─── ATS Platform ─────────────────────────────────────────────
export type ATSPlatform = 'GREENHOUSE' | 'LEVER' | 'LINKEDIN' | 'INDEED' | 'WORKDAY' | 'ICIMS' | 'UNKNOWN';

// ─── Extension Messages (discriminated union) ─────────────────
export type ExtensionMessage =
  | { type: 'GET_TAB_STATUS' }
  | { type: 'FETCH_RESUME_FOR_JOB'; payload: { jobUrl: string } }
  | { type: 'GET_RESUME_FOR_CURRENT_PAGE' }
  | { type: 'APPLICATION_SUBMITTED'; payload: { jobUrl: string; platform: ATSPlatform } }
  | { type: 'SET_AUTH'; payload: { token: string; userId: string } }
  | { type: 'LOGOUT' }
  | { type: 'CHECK_AUTH' }
  | { type: 'AI_FIELD_INFERENCE'; payload: AIFieldInferencePayload }
  | { type: 'TRIGGER_FILL' }
  | { type: 'FETCH_RESUME_PDF'; payload: { sessionId: string } };

export interface AIFieldInferencePayload {
  fieldName: string;
  fieldValue: string;
  formSnapshot: FormElementSnapshot[];
  platform: ATSPlatform;
}

export interface FormElementSnapshot {
  index: number;
  tag: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string | null;
  labelText: string;
}

// ─── Tab Status ───────────────────────────────────────────────
export interface TabStatus {
  status: 'RESUME_READY' | 'NO_RESUME' | 'NOT_JOB_PAGE' | 'LOADING' | 'ERROR';
  isJobPage: boolean;
  platform: ATSPlatform;
  url: string;
  resume: ResumePayload | null;
}

// ─── Resume Payload (from CareerIQ API) ───────────────────────
// This mirrors FinalResumePayload from the server but with metadata
export interface ResumePayload {
  summary: string;
  selected_accomplishments?: string;
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
  contact_info?: Record<string, string>;
  section_order?: string[];
  company_name?: string;
  job_title?: string;
  // Extension-specific metadata
  version?: number;
  created_at?: string;
  session_id?: string;
}

// ─── Fill Log ─────────────────────────────────────────────────
export interface FillLogEntry {
  field: string;
  status: 'FILLED' | 'NOT_FOUND' | 'UPLOADED' | 'UPLOAD_FAILED' | 'SKIPPED';
  elementTag?: string;
  error?: string;
}

// ─── Flattened Resume (for form fill) ──────────────────────────
export interface FlattenedResume {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  location?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  current_title?: string;
  current_company?: string;
  cover_letter?: string;
  summary?: string;
  [key: string]: string | undefined;
}
