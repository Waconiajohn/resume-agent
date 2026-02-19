import { describe, expect, it } from 'vitest';
import { validateResumeForExport } from './export-validation';
import type { FinalResume } from '../types/resume';

describe('validateResumeForExport', () => {
  it('returns an error when resume payload is missing', () => {
    const issues = validateResumeForExport(null);
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('treats missing contact name as warning, not blocking error', () => {
    const resume: FinalResume = {
      summary: 'Experienced operator.',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      selected_accomplishments: '',
      ats_score: 80,
      contact_info: { name: '', email: 'candidate@example.com' },
      _raw_sections: { summary: 'Experienced operator.' },
      section_order: ['summary'],
    };

    const issues = validateResumeForExport(resume);
    expect(issues.some((i) => i.field === 'contact_info.name' && i.severity === 'warning')).toBe(true);
    expect(issues.some((i) => i.severity === 'error')).toBe(false);
  });
});
