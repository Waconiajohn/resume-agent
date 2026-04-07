/**
 * resume-v2-export — Converts ResumeDraft (v2 pipeline) to FinalResume (export libs)
 */

import type { ResumeDraft } from '@/types/resume-v2';
import type { FinalResume, ContactInfo, MasterResumeExperience, MasterResumeEducation } from '@/types/resume';
import { getEnabledResumeSectionPlan, getResumeCustomSectionMap } from '@/lib/resume-section-plan';

function mapSectionIdToExportKey(sectionId: string): string {
  switch (sectionId) {
    case 'executive_summary':
      return 'summary';
    case 'core_competencies':
      return 'skills';
    case 'selected_accomplishments':
      return 'selected_accomplishments';
    case 'professional_experience':
      return 'experience';
    case 'earlier_career':
      return 'earlier_career';
    default:
      return sectionId;
  }
}

export function resumeDraftToFinalResume(draft: ResumeDraft, opts?: {
  companyName?: string;
  jobTitle?: string;
  atsScore?: number;
}): FinalResume {
  const contact: ContactInfo = {
    name: draft.header.name,
    email: draft.header.email,
    phone: draft.header.phone,
    linkedin: draft.header.linkedin,
  };

  const experience: MasterResumeExperience[] = draft.professional_experience.map(exp => ({
    company: exp.company,
    title: exp.title,
    start_date: exp.start_date,
    end_date: exp.end_date,
    location: '',
    bullets: exp.bullets.map(b => ({ text: b.text, source: 'crafted' })),
  }));

  const education: MasterResumeEducation[] = draft.education.map(ed => ({
    institution: ed.institution,
    degree: ed.degree,
    field: '',
    year: ed.year ?? '',
  }));

  const certifications = draft.certifications.map(c => ({
    name: c,
    issuer: '',
    year: '',
  }));

  // Build raw sections for the export libs' fallback paths
  const rawSections: Record<string, string> = {};

  // Branded title as a subtitle
  if (draft.header.branded_title) {
    rawSections['branded_title'] = draft.header.branded_title;
  }

  // Executive summary
  rawSections['executive_summary'] = draft.executive_summary.content;

  // Core competencies
  if (draft.core_competencies.length > 0) {
    rawSections['core_competencies'] = draft.core_competencies.join(' | ');
  }

  // Selected accomplishments
  if (draft.selected_accomplishments.length > 0) {
    rawSections['selected_accomplishments'] = draft.selected_accomplishments
      .map(a => `• ${a.content}`)
      .join('\n');
  }

  // Scope statements (not in FinalResume experience.bullets — inject into raw)
  draft.professional_experience.forEach((exp, i) => {
    if (exp.scope_statement) {
      rawSections[`experience_scope_${i}`] = exp.scope_statement;
    }
  });

  // Earlier career
  if (draft.earlier_career && draft.earlier_career.length > 0) {
    rawSections['earlier_career'] = draft.earlier_career
      .map(ec => `${ec.title}, ${ec.company} (${ec.dates})`)
      .join('\n');
  }

  const customSections = getResumeCustomSectionMap(draft);
  for (const [sectionId, section] of customSections.entries()) {
    const body = section.lines
      .map((line) => (section.kind === 'bullet_list' ? `• ${line}` : line))
      .join('\n');
    const content = [section.summary, body].filter(Boolean).join('\n');
    if (content.trim().length > 0) {
      rawSections[sectionId] = content;
    }
  }

  const skills: Record<string, string[]> = {};
  if (draft.core_competencies.length > 0) {
    skills['Core Competencies'] = draft.core_competencies;
  }

  const sectionOrder = getEnabledResumeSectionPlan(draft).map((item) => mapSectionIdToExportKey(item.id));

  return {
    summary: draft.executive_summary.content,
    experience,
    skills,
    education,
    certifications,
    selected_accomplishments: draft.selected_accomplishments.length > 0
      ? draft.selected_accomplishments.map(a => a.content).join('\n')
      : undefined,
    ats_score: opts?.atsScore ?? 0,
    contact_info: contact,
    company_name: opts?.companyName,
    job_title: opts?.jobTitle,
    section_order: sectionOrder,
    _raw_sections: rawSections,
  };
}
