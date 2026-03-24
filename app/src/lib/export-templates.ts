export type TemplateId = 'ats-classic' | 'executive';

export interface ResumeTemplate {
  id: TemplateId;
  name: string;
  description: string;
}

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: 'ats-classic',
    name: 'ATS-Optimized',
    description: 'Clean, scannable format optimized for applicant tracking systems. Best for online applications.',
  },
  {
    id: 'executive',
    name: 'Executive Presence',
    description: 'Polished design with subtle accent elements. Best for networking, recruiters, and direct submissions.',
  },
];

export const DEFAULT_TEMPLATE_ID: TemplateId = 'ats-classic';
