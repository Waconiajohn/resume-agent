import type { SupabaseClient } from '@supabase/supabase-js';

export type CoachPhase = 'setup' | 'research' | 'analysis' | 'interview' | 'tailoring' | 'review' | 'export';
export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';

export interface CompanyResearch {
  company_name?: string;
  culture?: string;
  values?: string[];
  recent_news?: string[];
  language_style?: string;
  tech_stack?: string[];
  leadership_style?: string;
  raw_research?: string;
}

export interface JDAnalysis {
  job_title?: string;
  must_haves?: string[];
  nice_to_haves?: string[];
  hidden_signals?: string[];
  seniority_level?: string;
  culture_cues?: string[];
  raw_jd?: string;
}

export interface InterviewResponse {
  question: string;
  answer: string;
  context: string;
  timestamp: string;
}

export interface RequirementFit {
  requirement: string;
  classification: 'strong' | 'partial' | 'gap';
  evidence: string;
  strategy?: string;
}

export interface FitClassification {
  requirements?: RequirementFit[];
  strong_count?: number;
  partial_count?: number;
  gap_count?: number;
}

export interface TailoredSections {
  summary?: string;
  experience?: Record<string, unknown>[];
  skills?: Record<string, string[]>;
  education?: string;
  certifications?: string;
  title_adjustments?: Record<string, string>;
}

export interface AdversarialReviewResult {
  overall_assessment?: string;
  risk_flags?: Array<{ flag: string; severity: 'low' | 'medium' | 'high'; recommendation: string }>;
  pass?: boolean;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
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

export interface MasterResumeData {
  summary: string;
  experience: MasterResumeExperience[];
  skills: Record<string, string[]>;
  education: MasterResumeEducation[];
  certifications: MasterResumeCertification[];
  raw_text: string;
}

export interface CoachSession {
  id: string;
  user_id: string;
  job_application_id: string | null;
  master_resume_id: string | null;
  status: SessionStatus;
  current_phase: CoachPhase;
  company_research: CompanyResearch;
  jd_analysis: JDAnalysis;
  interview_responses: InterviewResponse[];
  fit_classification: FitClassification;
  tailored_sections: TailoredSections;
  adversarial_review: AdversarialReviewResult;
  messages: ConversationMessage[];
  pending_tool_call_id: string | null;
  last_checkpoint_phase: string | null;
  last_checkpoint_at: string | null;
  total_tokens_used: number;
  created_at: string;
  updated_at: string;
}

export class SessionContext {
  readonly sessionId: string;
  readonly userId: string;

  jobApplicationId: string | null;
  masterResumeId: string | null;
  masterResumeData: MasterResumeData | null;
  currentPhase: CoachPhase;
  companyResearch: CompanyResearch;
  jdAnalysis: JDAnalysis;
  interviewResponses: InterviewResponse[];
  fitClassification: FitClassification;
  tailoredSections: TailoredSections;
  adversarialReview: AdversarialReviewResult;
  messages: ConversationMessage[];
  pendingToolCallId: string | null;
  totalTokensUsed: number;

  constructor(session: CoachSession) {
    this.sessionId = session.id;
    this.userId = session.user_id;
    this.jobApplicationId = session.job_application_id;
    this.masterResumeId = session.master_resume_id;
    this.masterResumeData = null;
    this.currentPhase = session.current_phase;
    this.companyResearch = session.company_research ?? {};
    this.jdAnalysis = session.jd_analysis ?? {};
    this.interviewResponses = session.interview_responses ?? [];
    this.fitClassification = session.fit_classification ?? {};
    this.tailoredSections = session.tailored_sections ?? {};
    this.adversarialReview = session.adversarial_review ?? {};
    this.messages = session.messages ?? [];
    this.pendingToolCallId = session.pending_tool_call_id;
    this.totalTokensUsed = session.total_tokens_used ?? 0;
  }

  async loadMasterResume(supabase: SupabaseClient): Promise<void> {
    if (!this.masterResumeId) return;

    const { data, error } = await supabase
      .from('master_resumes')
      .select('summary, experience, skills, education, certifications, raw_text')
      .eq('id', this.masterResumeId)
      .single();

    if (error || !data) {
      console.error('Failed to load master resume:', error?.message);
      return;
    }

    this.masterResumeData = data as MasterResumeData;
  }

  addInterviewResponse(question: string, answer: string, context: string) {
    this.interviewResponses.push({
      question,
      answer,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  setPhase(phase: CoachPhase) {
    this.currentPhase = phase;
  }

  addTokens(count: number) {
    this.totalTokensUsed += count;
  }

  buildContextSummary(): string {
    const parts: string[] = [];

    if (this.masterResumeData) {
      const r = this.masterResumeData;
      parts.push('## Candidate Resume');
      if (r.summary) parts.push(`Summary: ${r.summary}`);
      if (r.experience?.length) {
        parts.push('\nExperience:');
        for (const exp of r.experience) {
          parts.push(`- ${exp.title} at ${exp.company} (${exp.start_date} – ${exp.end_date})`);
          for (const b of exp.bullets ?? []) {
            parts.push(`  • ${b.text}`);
          }
        }
      }
      if (r.skills && Object.keys(r.skills).length > 0) {
        parts.push('\nSkills:');
        for (const [category, items] of Object.entries(r.skills)) {
          parts.push(`- ${category}: ${items.join(', ')}`);
        }
      }
      if (r.education?.length) {
        parts.push('\nEducation:');
        for (const edu of r.education) {
          parts.push(`- ${edu.degree} in ${edu.field}, ${edu.institution} (${edu.year})`);
        }
      }
    }

    if (this.companyResearch.company_name) {
      parts.push(`\n## Company Research: ${this.companyResearch.company_name}`);
      if (this.companyResearch.culture) parts.push(`Culture: ${this.companyResearch.culture}`);
      if (this.companyResearch.values?.length) parts.push(`Values: ${this.companyResearch.values.join(', ')}`);
      if (this.companyResearch.language_style) parts.push(`Language style: ${this.companyResearch.language_style}`);
      if (this.companyResearch.leadership_style) parts.push(`Leadership style: ${this.companyResearch.leadership_style}`);
    }

    if (this.jdAnalysis.job_title) {
      parts.push(`\n## Job Analysis: ${this.jdAnalysis.job_title}`);
      if (this.jdAnalysis.must_haves?.length) parts.push(`Must-haves: ${this.jdAnalysis.must_haves.join(', ')}`);
      if (this.jdAnalysis.nice_to_haves?.length) parts.push(`Nice-to-haves: ${this.jdAnalysis.nice_to_haves.join(', ')}`);
      if (this.jdAnalysis.seniority_level) parts.push(`Seniority: ${this.jdAnalysis.seniority_level}`);
    }

    if (this.fitClassification.requirements?.length) {
      parts.push('\n## Fit Classification');
      parts.push(`Strong: ${this.fitClassification.strong_count ?? 0}, Partial: ${this.fitClassification.partial_count ?? 0}, Gaps: ${this.fitClassification.gap_count ?? 0}`);
    }

    if (this.interviewResponses.length > 0) {
      parts.push(`\n## Interview Responses (${this.interviewResponses.length} answers collected)`);
      for (const r of this.interviewResponses) {
        parts.push(`Q: ${r.question}\nA: ${r.answer}`);
      }
    }

    return parts.join('\n');
  }

  toCheckpoint() {
    return {
      current_phase: this.currentPhase,
      company_research: this.companyResearch,
      jd_analysis: this.jdAnalysis,
      interview_responses: this.interviewResponses,
      fit_classification: this.fitClassification,
      tailored_sections: this.tailoredSections,
      adversarial_review: this.adversarialReview,
      messages: this.messages,
      pending_tool_call_id: this.pendingToolCallId,
      total_tokens_used: this.totalTokensUsed,
      last_checkpoint_phase: this.currentPhase,
      last_checkpoint_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}
