import { describe, it, expect } from 'vitest';
import { extractResumeTextFromUpload } from './resume-upload';

describe('extractResumeTextFromUpload', () => {
  it('rejects files over 10MB before parsing', async () => {
    const oversize = new File([new Uint8Array((10 * 1024 * 1024) + 1)], 'resume.pdf', {
      type: 'application/pdf',
    });

    await expect(extractResumeTextFromUpload(oversize)).rejects.toThrow('under 10 MB');
  });

  it('rejects legacy .doc files with clear guidance', async () => {
    const file = new File(['dummy'], 'resume.doc', { type: 'application/msword' });
    await expect(extractResumeTextFromUpload(file)).rejects.toThrow('Legacy .doc files are not supported');
  });

  it('rejects unsupported file extensions', async () => {
    const file = new File(['dummy'], 'resume.rtf', { type: 'application/rtf' });
    await expect(extractResumeTextFromUpload(file)).rejects.toThrow('Unsupported file type');
  });

  it('parses and normalizes plain text uploads', async () => {
    const file = new File(['Line one   \n\n\nLine two\u0000'], 'resume.txt', { type: 'text/plain' });
    await expect(extractResumeTextFromUpload(file)).resolves.toBe('Line one\n\nLine two');
  });
});
