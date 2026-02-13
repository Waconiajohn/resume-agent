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
];
