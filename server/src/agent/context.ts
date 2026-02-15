import type { SupabaseClient } from '@supabase/supabase-js';

export type CoachPhase =
  | 'onboarding'
  | 'deep_research'
  | 'gap_analysis'
  | 'resume_design'
  | 'section_craft'
  | 'quality_review'
  | 'cover_letter'
  | 'interview_prep';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';

// Benchmark candidate profile synthesized from JD + research
export interface BenchmarkRequirement {
  requirement: string;
  importance: 'critical' | 'important' | 'nice_to_have';
  category: string; // e.g. 'technical', 'leadership', 'domain', 'soft_skills'
}

export interface BenchmarkCandidate {
  required_skills: BenchmarkRequirement[];
  experience_expectations: string;
  culture_fit_traits: string[];
  communication_style: string;
  industry_standards: string[];
  competitive_differentiators: string[];
  language_keywords: string[];
  ideal_candidate_summary: string;
}

// Section-by-section tracking for Phase 5
export type SectionCraftStatus = 'pending' | 'proposed' | 'revising' | 'confirmed';

export interface SectionStatus {
  section: string;
  status: SectionCraftStatus;
  score?: number; // 0-100
  jd_requirements_addressed: string[];
}

// Design choices for Phase 4
export interface DesignChoice {
  id: string;
  name: string;
  description: string;
  section_order: string[];
  selected: boolean;
}

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
  importance?: 'critical' | 'important' | 'nice_to_have';
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
  selected_accomplishments?: string;
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
  age_bias_risks?: string[];
  checklist_scores?: Record<string, number>;
  checklist_total?: number;
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
  benchmark_candidate: BenchmarkCandidate | null;
  section_statuses: SectionStatus[];
  overall_score: number;
  design_choices: DesignChoice[];
  messages: ConversationMessage[];
  pending_tool_call_id: string | null;
  pending_phase_transition: string | null;
  last_panel_type: string | null;
  last_panel_data: Record<string, unknown> | null;
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
  benchmarkCandidate: BenchmarkCandidate | null;
  sectionStatuses: SectionStatus[];
  overallScore: number;
  designChoices: DesignChoice[];
  messages: ConversationMessage[];
  pendingToolCallId: string | null;
  pendingPhaseTransition: string | null;
  lastPanelType: string | null;
  lastPanelData: Record<string, unknown> | null;
  totalTokensUsed: number;

  constructor(session: CoachSession) {
    this.sessionId = session.id;
    this.userId = session.user_id;
    this.jobApplicationId = session.job_application_id;
    this.masterResumeId = session.master_resume_id;
    this.masterResumeData = null;
    this.currentPhase = session.current_phase;
    // Normalize in case a display name was persisted
    this.setPhase(this.currentPhase);
    this.companyResearch = session.company_research ?? {};
    this.jdAnalysis = session.jd_analysis ?? {};
    this.interviewResponses = session.interview_responses ?? [];
    this.fitClassification = session.fit_classification ?? {};
    this.tailoredSections = session.tailored_sections ?? {};
    this.adversarialReview = session.adversarial_review ?? {};
    this.benchmarkCandidate = session.benchmark_candidate ?? null;
    this.sectionStatuses = session.section_statuses ?? [];
    this.overallScore = session.overall_score ?? 0;
    this.designChoices = session.design_choices ?? [];
    this.messages = session.messages ?? [];
    this.pendingToolCallId = session.pending_tool_call_id;
    this.pendingPhaseTransition = session.pending_phase_transition ?? null;
    this.lastPanelType = session.last_panel_type ?? null;
    this.lastPanelData = session.last_panel_data ?? null;
    this.totalTokensUsed = session.total_tokens_used ?? 0;
  }

  async loadMasterResume(supabase: SupabaseClient): Promise<void> {
    if (!this.masterResumeId) return;

    const { data, error } = await supabase
      .from('master_resumes')
      .select('summary, experience, skills, education, certifications, raw_text')
      .eq('id', this.masterResumeId)
      .eq('user_id', this.userId)
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
    // Normalize display names (e.g. "Deep Research") to internal keys (e.g. "deep_research")
    const PHASE_ALIASES: Record<string, CoachPhase> = {
      'Deep Research': 'deep_research',
      'Gap Analysis': 'gap_analysis',
      'Resume Design': 'resume_design',
      'Section Craft': 'section_craft',
      'Quality Review': 'quality_review',
      'Cover Letter': 'cover_letter',
      'Interview Prep': 'interview_prep',
      'Getting Started': 'onboarding',
      'Onboarding': 'onboarding',
    };
    this.currentPhase = PHASE_ALIASES[phase] ?? phase;
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

    if (this.benchmarkCandidate) {
      parts.push('\n## Benchmark Candidate Profile');
      parts.push(`Ideal candidate: ${this.benchmarkCandidate.ideal_candidate_summary}`);
      parts.push(`Experience expectations: ${this.benchmarkCandidate.experience_expectations}`);
      if (this.benchmarkCandidate.required_skills.length > 0) {
        const critical = this.benchmarkCandidate.required_skills.filter(s => s.importance === 'critical');
        const important = this.benchmarkCandidate.required_skills.filter(s => s.importance === 'important');
        if (critical.length) parts.push(`Critical skills: ${critical.map(s => s.requirement).join(', ')}`);
        if (important.length) parts.push(`Important skills: ${important.map(s => s.requirement).join(', ')}`);
      }
      if (this.benchmarkCandidate.language_keywords.length > 0) {
        parts.push(`Keywords to echo: ${this.benchmarkCandidate.language_keywords.join(', ')}`);
      }
    }

    if (this.interviewResponses.length > 0) {
      parts.push(`\n## Interview Responses (${this.interviewResponses.length} answers collected)`);
      for (const r of this.interviewResponses) {
        parts.push(`Q: ${r.question}\nA: ${r.answer}`);
      }
    }

    // Surface key data from conversation for deep_research phase
    if (this.currentPhase === 'deep_research' && !this.companyResearch.company_name) {
      const userTexts = this.messages
        .filter(m => m.role === 'user' && typeof m.content === 'string')
        .map(m => m.content as string)
        .join('\n');
      if (userTexts) {
        parts.push(`\n## Raw User Input (extract company name, job title, and JD from this):\n${userTexts.substring(0, 3000)}`);
      }
    }

    if (this.sectionStatuses.length > 0) {
      parts.push('\n## Section Status');
      for (const s of this.sectionStatuses) {
        parts.push(`- ${s.section}: ${s.status}${s.score != null ? ` (score: ${s.score})` : ''} — addresses: ${s.jd_requirements_addressed.join(', ') || 'none yet'}`);
      }
    }

    if (this.overallScore > 0) {
      parts.push(`\n## Overall Score: ${this.overallScore}/100`);
    }

    return parts.join('\n');
  }

  getApiMessages(): ConversationMessage[] {
    const KEEP_FIRST = 2;
    const KEEP_LAST = 40;
    const total = this.messages.length;

    if (total <= KEEP_FIRST + KEEP_LAST) {
      return this.messages;
    }

    // Determine safe head boundary: don't end on an assistant message with tool_use
    let headEnd = KEEP_FIRST;
    const lastHead = this.messages[headEnd - 1];
    if (lastHead?.role === 'assistant' && Array.isArray(lastHead.content)) {
      const hasToolUse = lastHead.content.some(
        (b: ContentBlock) => b.type === 'tool_use',
      );
      if (hasToolUse) {
        // Include the next message (which should be the tool_result)
        headEnd = Math.min(headEnd + 1, total - KEEP_LAST);
      }
    }

    // Determine safe tail boundary: don't start on a tool_result message
    let tailStart = total - KEEP_LAST;
    while (tailStart < total) {
      const msg = this.messages[tailStart];
      if (msg?.role === 'user' && Array.isArray(msg.content)) {
        const hasToolResult = msg.content.some(
          (b: ContentBlock) => b.type === 'tool_result',
        );
        if (hasToolResult) {
          // Back up to include the preceding assistant tool_use message
          tailStart = Math.max(tailStart - 1, headEnd);
          break;
        }
      }
      break;
    }

    // If boundaries overlap, just return all messages
    if (tailStart <= headEnd) {
      return this.messages;
    }

    const head = this.messages.slice(0, headEnd);
    const tail = this.messages.slice(tailStart);
    const truncationNote: ConversationMessage = {
      role: 'user',
      content: '[...earlier messages truncated for context window...]',
    };

    return [...head, truncationNote, ...tail];
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
      benchmark_candidate: this.benchmarkCandidate,
      section_statuses: this.sectionStatuses,
      overall_score: this.overallScore,
      design_choices: this.designChoices,
      messages: this.messages,
      pending_tool_call_id: this.pendingToolCallId,
      pending_phase_transition: this.pendingPhaseTransition,
      last_panel_type: this.lastPanelType,
      last_panel_data: this.lastPanelData,
      total_tokens_used: this.totalTokensUsed,
      last_checkpoint_phase: this.currentPhase,
      last_checkpoint_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}
