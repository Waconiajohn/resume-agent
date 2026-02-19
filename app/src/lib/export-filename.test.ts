import { describe, expect, it } from 'vitest';
import { buildResumeFilename } from './export-filename';

describe('buildResumeFilename', () => {
  it('builds a stable name with extension', () => {
    const name = buildResumeFilename(
      { name: 'John Schrup' },
      'ScaleTech',
      'Resume',
      'docx',
    );
    expect(name).toBe('John_Schrup_ScaleTech_Resume.docx');
  });

  it('falls back to generic filename when contact/company are missing', () => {
    const name = buildResumeFilename(undefined, undefined, 'Resume', 'pdf');
    expect(name).toBe('Resume.pdf');
  });

  it('preserves extension when truncating long names', () => {
    const longCompany = 'A'.repeat(120);
    const name = buildResumeFilename(
      { name: 'Jane Doe' },
      longCompany,
      'Executive Resume',
      'txt',
    );
    expect(name.endsWith('.txt')).toBe(true);
    expect(name.length).toBeLessThanOrEqual(114); // 110 + ".txt"
  });
});
