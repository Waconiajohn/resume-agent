export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'research_company',
    description: 'Research a company using web search. Returns culture, values, recent news, language style, tech stack, and leadership expectations.',
    input_schema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'The company name to research' },
        job_title: { type: 'string', description: 'The target job title for context' },
        additional_context: { type: 'string', description: 'Any additional context to focus the research' },
      },
      required: ['company_name', 'job_title'],
    },
  },
  {
    name: 'analyze_jd',
    description: 'Parse a job description into structured requirements. Extracts must-haves, nice-to-haves, hidden signals, seniority expectations, and culture cues.',
    input_schema: {
      type: 'object',
      properties: {
        job_description: { type: 'string', description: 'The full job description text' },
      },
      required: ['job_description'],
    },
  },
  {
    name: 'classify_fit',
    description: 'Compare the candidate resume against job requirements. Classifies each requirement as strong match, partial match, or gap.',
    input_schema: {
      type: 'object',
      properties: {
        requirements: { type: 'array', items: { type: 'string' }, description: 'List of job requirements to classify' },
        resume_summary: { type: 'string', description: 'The candidate resume summary' },
        resume_experience: { type: 'string', description: 'The candidate experience section as text' },
        resume_skills: { type: 'string', description: 'The candidate skills as text' },
      },
      required: ['requirements', 'resume_summary', 'resume_experience', 'resume_skills'],
    },
  },
  {
    name: 'ask_user',
    description: 'Ask the candidate a question and wait for their response. This pauses the agent loop until the user replies.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the candidate' },
        context: { type: 'string', description: 'Why you are asking this question' },
        input_type: { type: 'string', enum: ['text', 'multiple_choice'], description: 'How the candidate should respond' },
        choices: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, description: { type: 'string' } },
            required: ['label'],
          },
          description: 'Required when input_type is multiple_choice',
        },
        skip_allowed: { type: 'boolean', description: 'Whether the candidate can skip this question. Default true.' },
      },
      required: ['question', 'context', 'input_type'],
    },
  },
  {
    name: 'generate_section',
    description: 'Generate or rewrite a resume section. Uses company research, interview responses, and fit analysis to create tailored content.',
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['summary', 'experience', 'skills', 'education', 'certifications', 'title_adjustments'], description: 'Which resume section to generate' },
        current_content: { type: 'string', description: 'The current content of this section' },
        requirements: { type: 'array', items: { type: 'string' }, description: 'Key requirements this section should address' },
        instructions: { type: 'string', description: 'Specific instructions for how to rewrite this section' },
      },
      required: ['section', 'current_content', 'requirements', 'instructions'],
    },
  },
  {
    name: 'adversarial_review',
    description: 'Review the resume as a skeptical hiring manager. Identifies risk flags, weak spots, missing evidence, and potential rejections.',
    input_schema: {
      type: 'object',
      properties: {
        resume_content: { type: 'string', description: 'The full tailored resume content' },
        job_description: { type: 'string', description: 'The original job description' },
        requirements: { type: 'array', items: { type: 'string' }, description: 'The extracted requirements list' },
      },
      required: ['resume_content', 'job_description', 'requirements'],
    },
  },
  {
    name: 'create_master_resume',
    description: 'Create a master resume from pasted resume text. The text will be parsed and structured by AI.',
    input_schema: {
      type: 'object',
      properties: {
        raw_text: { type: 'string', description: 'The full resume text pasted by the candidate' },
      },
      required: ['raw_text'],
    },
  },
  {
    name: 'update_master_resume',
    description: 'Merge accepted changes back into the master resume for future applications. Creates a new version with change tracking.',
    input_schema: {
      type: 'object',
      properties: {
        master_resume_id: { type: 'string', description: 'The master resume ID to update' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              section: { type: 'string' },
              action: { type: 'string', enum: ['add', 'update', 'remove'] },
              path: { type: 'string' },
              content: { type: 'string' },
              reasoning: { type: 'string' },
            },
            required: ['section', 'action', 'path', 'content', 'reasoning'],
          },
          description: 'The changes to apply to the master resume',
        },
      },
      required: ['master_resume_id', 'changes'],
    },
  },
  {
    name: 'export_resume',
    description: 'Assemble the final tailored resume and send it to the frontend for download.',
    input_schema: {
      type: 'object',
      properties: {
        ats_score: { type: 'number', description: 'The estimated ATS compatibility score (0-100)' },
        requirements_addressed: { type: 'number', description: 'Number of job requirements addressed' },
        sections_rewritten: { type: 'number', description: 'Number of sections rewritten' },
      },
      required: ['ats_score', 'requirements_addressed', 'sections_rewritten'],
    },
  },
  {
    name: 'research_industry',
    description: 'Research industry benchmarks and standards for a specific role type. Returns typical qualifications, salary ranges, key skills, career paths, and competitive differentiators.',
    input_schema: {
      type: 'object',
      properties: {
        industry: { type: 'string', description: 'The industry to research (e.g., "enterprise SaaS", "fintech", "healthcare")' },
        role_type: { type: 'string', description: 'The type of role (e.g., "VP of Engineering", "Product Manager")' },
        seniority_level: { type: 'string', description: 'The seniority level (e.g., "senior", "director", "vp")' },
      },
      required: ['industry', 'role_type'],
    },
  },
  {
    name: 'build_benchmark',
    description: 'Synthesize company research, JD analysis, and industry research into a Benchmark Candidate Profile — the ideal candidate the company is looking for. Updates the right panel with the research dashboard.',
    input_schema: {
      type: 'object',
      properties: {
        industry_research: { type: 'string', description: 'Industry research text from research_industry tool' },
      },
      required: [],
    },
  },
  {
    name: 'update_requirement_status',
    description: 'Mark a requirement as addressed with new evidence. Updates the gap analysis dashboard on the right panel.',
    input_schema: {
      type: 'object',
      properties: {
        requirement: { type: 'string', description: 'The requirement text to update' },
        new_classification: { type: 'string', enum: ['strong', 'partial', 'gap'], description: 'The new classification' },
        evidence: { type: 'string', description: 'New evidence supporting this classification' },
      },
      required: ['requirement', 'new_classification'],
    },
  },
  {
    name: 'emit_score',
    description: 'Calculate and emit the overall readiness score. Can also set a section-specific score.',
    input_schema: {
      type: 'object',
      properties: {
        section_name: { type: 'string', description: 'Optional section to set score for' },
        section_score: { type: 'number', description: 'Score for the section (0-100)' },
      },
      required: [],
    },
  },
  {
    name: 'propose_section_edit',
    description: 'Generate a diff-annotated section proposal showing original vs proposed text with per-change reasoning and JD requirement tags. Updates the live resume editor on the right panel.',
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['summary', 'experience', 'skills', 'education', 'certifications', 'title_adjustments'], description: 'Which resume section to propose edits for' },
        current_content: { type: 'string', description: 'The current content of this section' },
        requirements: { type: 'array', items: { type: 'string' }, description: 'Key requirements this section should address' },
        instructions: { type: 'string', description: 'Specific instructions for the edit' },
      },
      required: ['section', 'current_content'],
    },
  },
  {
    name: 'confirm_section',
    description: 'Mark a section as user-confirmed after they approve it. Tracks progress through section craft.',
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'The section name that was confirmed' },
      },
      required: ['section'],
    },
  },
  {
    name: 'humanize_check',
    description: 'Check resume content for AI-generated patterns. Returns authenticity score and specific suggestions for making the text sound more natural and human.',
    input_schema: {
      type: 'object',
      properties: {
        resume_content: { type: 'string', description: 'The full resume content to check' },
      },
      required: ['resume_content'],
    },
  },
  {
    name: 'ats_check',
    description: 'Perform detailed ATS compatibility analysis. Checks keyword presence, format compatibility, and provides specific recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        resume_content: { type: 'string', description: 'The full resume content to check' },
      },
      required: ['resume_content'],
    },
  },
  {
    name: 'generate_cover_letter_section',
    description: 'Generate a single paragraph of a cover letter. Works paragraph by paragraph for collaborative iteration.',
    input_schema: {
      type: 'object',
      properties: {
        paragraph_type: { type: 'string', enum: ['opening', 'body_1', 'body_2', 'closing'], description: 'Which paragraph to generate' },
        instructions: { type: 'string', description: 'Specific instructions for this paragraph' },
        previous_paragraphs: { type: 'array', items: { type: 'string' }, description: 'Previously confirmed paragraphs for flow continuity' },
      },
      required: ['paragraph_type'],
    },
  },
  {
    name: 'generate_interview_answer',
    description: 'Generate a STAR-format answer framework for an interview question using the candidate\'s actual experience.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The interview question' },
        category: { type: 'string', description: 'Question category (e.g., "technical", "behavioral", "leadership")' },
        existing_questions: {
          type: 'array',
          items: { type: 'object' },
          description: 'Previously generated questions for right panel continuity',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'save_checkpoint',
    description: 'Save the current session state to the database. Call this at natural boundaries.',
    input_schema: {
      type: 'object',
      properties: {
        phase: { type: 'string', description: 'The current phase to checkpoint' },
      },
      required: ['phase'],
    },
  },
  {
    name: 'confirm_phase_complete',
    description: 'Request user confirmation before advancing to the next phase. This pauses the agent loop until the user confirms. Present a summary of what was accomplished in this phase and what the next phase will cover.',
    input_schema: {
      type: 'object',
      properties: {
        current_phase: { type: 'string', description: 'The phase being completed' },
        next_phase: { type: 'string', description: 'The phase to advance to' },
        phase_summary: { type: 'string', description: 'Summary of what was accomplished in this phase' },
        next_phase_preview: { type: 'string', description: 'Brief preview of what the next phase will cover' },
      },
      required: ['current_phase', 'next_phase', 'phase_summary', 'next_phase_preview'],
    },
  },
  {
    name: 'emit_transparency',
    description: 'Show the user what you are doing and why it matters. Use before expensive operations to build trust and set expectations. Use Margaret-friendly language (tailored, strengthened, positioned, aligned).',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The transparency message explaining what is happening and why' },
        phase: { type: 'string', description: 'The current phase for context' },
      },
      required: ['message', 'phase'],
    },
  },
  {
    name: 'update_right_panel',
    description: 'Send data to the right panel for the current phase. The panel_type determines which sub-component renders the data.',
    input_schema: {
      type: 'object',
      properties: {
        panel_type: {
          type: 'string',
          enum: ['onboarding_summary', 'research_dashboard', 'gap_analysis', 'design_options', 'live_resume', 'quality_dashboard', 'cover_letter', 'interview_prep'],
          description: 'Which panel sub-component to target',
        },
        data: {
          type: 'object',
          description: 'The data payload for the panel. Shape depends on panel_type.',
        },
      },
      required: ['panel_type', 'data'],
    },
  },
];

// Phase-scoped tool availability
export const PHASE_TOOLS: Record<string, string[]> = {
  onboarding: [
    'ask_user', 'create_master_resume', 'save_checkpoint',
    'confirm_phase_complete', 'emit_transparency', 'update_right_panel',
  ],
  deep_research: [
    'ask_user', 'research_company', 'analyze_jd', 'research_industry', 'build_benchmark',
    'save_checkpoint', 'confirm_phase_complete', 'emit_transparency', 'update_right_panel',
  ],
  gap_analysis: [
    'ask_user', 'classify_fit', 'update_requirement_status', 'emit_score',
    'save_checkpoint', 'confirm_phase_complete', 'emit_transparency', 'update_right_panel',
  ],
  resume_design: [
    'ask_user', 'save_checkpoint',
    'confirm_phase_complete', 'emit_transparency', 'update_right_panel',
  ],
  section_craft: [
    'ask_user', 'generate_section', 'propose_section_edit', 'confirm_section', 'emit_score',
    'save_checkpoint', 'confirm_phase_complete', 'emit_transparency', 'update_right_panel',
  ],
  quality_review: [
    'ask_user', 'adversarial_review', 'humanize_check', 'ats_check',
    'generate_section', 'propose_section_edit', 'emit_score',
    'save_checkpoint', 'confirm_phase_complete', 'emit_transparency', 'update_right_panel',
  ],
  cover_letter: [
    'ask_user', 'generate_cover_letter_section',
    'save_checkpoint', 'confirm_phase_complete', 'emit_transparency', 'update_right_panel',
  ],
  interview_prep: [
    'ask_user', 'generate_interview_answer', 'export_resume', 'update_master_resume',
    'save_checkpoint', 'emit_transparency', 'update_right_panel',
  ],
};

export function getToolsForPhase(phase: string): ToolDefinition[] {
  const allowedNames = PHASE_TOOLS[phase];
  if (!allowedNames) return toolDefinitions;
  return toolDefinitions.filter(t => allowedNames.includes(t.name));
}
