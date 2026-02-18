import type { FinalResume } from '@/types/resume';

export interface ExportValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateResumeForExport(resume: FinalResume | null): ExportValidationIssue[] {
  if (!resume) {
    return [{ field: 'resume', message: 'Resume data is missing.', severity: 'error' }];
  }

  const issues: ExportValidationIssue[] = [];
  const hasRaw = !!resume._raw_sections && Object.keys(resume._raw_sections).length > 0;
  const hasStructured =
    !!resume.summary?.trim() ||
    (Array.isArray(resume.experience) && resume.experience.length > 0) ||
    (resume.skills && Object.keys(resume.skills).length > 0) ||
    (Array.isArray(resume.education) && resume.education.length > 0) ||
    (Array.isArray(resume.certifications) && resume.certifications.length > 0);

  if (!hasRaw && !hasStructured) {
    issues.push({
      field: 'content',
      message: 'No resume content found to export.',
      severity: 'error',
    });
  }

  if (!resume.contact_info?.name?.trim()) {
    issues.push({
      field: 'contact_info.name',
      message: 'Name is missing. Export file names and headers may be generic.',
      severity: 'warning',
    });
  }

  return issues;
}
