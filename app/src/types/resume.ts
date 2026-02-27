export interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
}

export interface MasterResumeExperience {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string;
  bullets: Array<{ text: string; source: string }>;
}

export interface MasterResumeEducation {
  institution: string;
  degree: string;
  field: string;
  year: string;
}

export interface MasterResumeCertification {
  name: string;
  issuer: string;
  year: string;
}

export interface MasterResumeEvidenceItem {
  text: string;
  source: 'crafted' | 'upgraded' | 'interview';
  category?: string;
  source_session_id: string;
  created_at: string;
}

export interface MasterResume {
  id: string;
  user_id: string;
  summary: string;
  experience: MasterResumeExperience[];
  skills: Record<string, string[]>;
  education: MasterResumeEducation[];
  certifications: MasterResumeCertification[];
  contact_info?: ContactInfo;
  raw_text: string;
  version: number;
  is_default?: boolean;
  source_session_id?: string | null;
  evidence_items: MasterResumeEvidenceItem[];
  created_at: string;
  updated_at: string;
}

export interface MasterResumeListItem {
  id: string;
  summary: string;
  version: number;
  is_default?: boolean;
  source_session_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinalResume {
  summary: string;
  experience: MasterResumeExperience[];
  skills: Record<string, string[]>;
  education: MasterResumeEducation[];
  certifications: MasterResumeCertification[];
  selected_accomplishments?: string;
  ats_score: number;
  contact_info?: ContactInfo;
  section_order?: string[];
  company_name?: string;
  job_title?: string;
  _raw_sections?: Record<string, string>;
}
