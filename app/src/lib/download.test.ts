import { describe, expect, it } from 'vitest';
import { normalizeDownloadFilename } from './download';

describe('normalizeDownloadFilename', () => {
  it('appends requested extension', () => {
    expect(normalizeDownloadFilename('My Resume', 'docx')).toBe('My_Resume.docx');
  });

  it('replaces existing export extension with requested extension', () => {
    expect(normalizeDownloadFilename('Candidate_Resume.txt', 'pdf')).toBe('Candidate_Resume.pdf');
  });

  it('sanitizes illegal filesystem characters', () => {
    expect(normalizeDownloadFilename('John:/\\*?"<>| Resume', 'txt')).toBe('John_Resume.txt');
  });

  it('falls back to Resume for blank or dot-only names', () => {
    expect(normalizeDownloadFilename('   ', 'docx')).toBe('Resume.docx');
    expect(normalizeDownloadFilename('...', 'pdf')).toBe('Resume.pdf');
  });

  it('avoids reserved windows names', () => {
    expect(normalizeDownloadFilename('con', 'txt')).toBe('con_file.txt');
  });
});
