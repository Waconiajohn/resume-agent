import { describe, it, expect } from 'vitest';
import { buildResumeFilename } from '@/lib/export-filename';

describe('cover letter filename generation', () => {
  it('generates filename with company name', () => {
    const filename = buildResumeFilename(undefined, 'Acme Corp', 'Cover_Letter', 'pdf');
    expect(filename).toBe('Acme_Corp_Cover_Letter.pdf');
  });

  it('generates filename with contact name and company', () => {
    const filename = buildResumeFilename({ name: 'John Doe' }, 'Acme Corp', 'Cover_Letter', 'txt');
    expect(filename).toBe('John_Doe_Acme_Corp_Cover_Letter.txt');
  });

  it('generates filename without company name', () => {
    const filename = buildResumeFilename(undefined, undefined, 'Cover_Letter', 'pdf');
    expect(filename).toBe('Cover_Letter.pdf');
  });

  it('sanitizes special characters in company name', () => {
    const filename = buildResumeFilename(undefined, 'O\'Brien & Associates LLC', 'Cover_Letter', 'pdf');
    expect(filename).toMatch(/O_Brien_Associates_LLC_Cover_Letter\.pdf/);
  });
});
