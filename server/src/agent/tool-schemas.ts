import { z } from 'zod';

export const toolSchemas: Record<string, z.ZodType> = {
  research_company: z.object({
    company_name: z.string(),
    job_title: z.string(),
    additional_context: z.string().optional(),
  }),

  analyze_jd: z.object({
    job_description: z.string(),
  }),

  classify_fit: z.object({
    requirements: z.array(z.string()),
    resume_summary: z.string(),
    resume_experience: z.string(),
    resume_skills: z.string(),
  }),

  ask_user: z.object({
    question: z.string(),
    context: z.string(),
    input_type: z.enum(['text', 'multiple_choice']),
    choices: z.array(z.object({
      label: z.string(),
      description: z.string().optional(),
    })).optional(),
    skip_allowed: z.boolean().optional(),
  }),

  generate_section: z.object({
    section: z.string().describe('Section name (e.g. summary, selected_accomplishments, experience, skills, education, certifications, title_adjustments)'),
    current_content: z.string(),
    requirements: z.array(z.string()),
    instructions: z.string(),
  }),

  adversarial_review: z.object({
    resume_content: z.string(),
    job_description: z.string(),
    requirements: z.array(z.string()),
  }),

  create_master_resume: z.object({
    raw_text: z.string(),
  }),

  update_master_resume: z.object({
    master_resume_id: z.string(),
    changes: z.array(z.object({
      section: z.string(),
      action: z.enum(['add', 'update', 'remove']),
      path: z.string(),
      content: z.string(),
      reasoning: z.string(),
    })),
  }),

  export_resume: z.object({
    ats_score: z.number(),
    requirements_addressed: z.number(),
    sections_rewritten: z.number(),
  }),

  research_industry: z.object({
    industry: z.string(),
    role_type: z.string(),
    seniority_level: z.string().optional(),
  }),

  build_benchmark: z.object({
    industry_research: z.string().optional(),
  }),

  update_requirement_status: z.object({
    requirement: z.string(),
    new_classification: z.enum(['strong', 'partial', 'gap']),
    evidence: z.string().optional(),
  }),

  emit_score: z.object({
    section_name: z.string().optional(),
    section_score: z.number().optional(),
  }),

  propose_section_edit: z.object({
    section: z.string().describe('Section name (e.g. summary, selected_accomplishments, experience, skills, education, certifications, title_adjustments)'),
    current_content: z.string(),
    requirements: z.array(z.string()).optional(),
    instructions: z.string().optional(),
  }),

  confirm_section: z.object({
    section: z.string(),
  }),

  humanize_check: z.object({
    resume_content: z.string(),
  }),

  quality_review_suite: z.object({
    resume_content: z.string(),
    job_description: z.string(),
    requirements: z.array(z.string()),
  }),

  save_checkpoint: z.object({
    phase: z.string().optional(),
  }),

  confirm_phase_complete: z.object({
    current_phase: z.string(),
    next_phase: z.string(),
    phase_summary: z.string(),
    next_phase_preview: z.string(),
  }),

  emit_transparency: z.object({
    message: z.string(),
    phase: z.string(),
  }),

  update_right_panel: z.object({
    panel_type: z.enum([
      'onboarding_summary', 'research_dashboard', 'gap_analysis',
      'design_options', 'live_resume', 'quality_dashboard',
    ]),
    data: z.record(z.string(), z.unknown()),
  }),
};
