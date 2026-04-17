// Stage 1 (extract) unit tests.
// Exercises format detection, DOCX parsing via mammoth, PDF parsing via
// pdf-parse, plain-text pass-through, unrecognized input rejection, and
// post-processing warnings.

import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { extract } from '../../v3/extract/index.js';

describe('extract — text', () => {
  it('passes through utf-8 text with normalized newlines', async () => {
    const result = await extract({
      text: 'Line one\r\nLine two\r\n\r\nParagraph two',
      filename: 'resume.txt',
    });
    expect(result.format).toBe('text');
    expect(result.plaintext).toBe('Line one\nLine two\n\nParagraph two');
    expect(result.warnings).toEqual([]);
  });

  it('collapses runs of 3+ blank lines to 2', async () => {
    const result = await extract({ text: 'A\n\n\n\nB', filename: 'x.txt' });
    expect(result.plaintext).toBe('A\n\nB');
  });

  it('warns when input has replacement characters', async () => {
    const result = await extract({
      text: 'smart \uFFFD apostrophe',
      filename: 'x.txt',
    });
    expect(result.warnings.some((w) => w.includes('replacement'))).toBe(true);
  });

  it('accepts a .md extension as text', async () => {
    const result = await extract({ text: '# Hi', filename: 'x.md' });
    expect(result.format).toBe('text');
    expect(result.plaintext).toBe('# Hi');
  });
});

describe('extract — format detection', () => {
  it('throws when input has neither extension nor signature', async () => {
    await expect(
      extract({ buffer: Buffer.from([0x00, 0x01, 0x02]) }),
    ).rejects.toThrow(/could not determine format/);
  });

  it('uses buffer signature to override a misleading filename', async () => {
    // A "%PDF-1.4" prefix triggers the PDF branch even if the filename says .txt.
    const header = Buffer.from('%PDF-1.4\n%garbage', 'utf8');
    await expect(
      extract({ buffer: header, filename: 'looks-like.txt' }),
    ).rejects.toThrow(/pdf-parse failed/);
  });

  it('requires one of buffer/text/path', async () => {
    await expect(extract({} as never)).rejects.toThrow(/must carry one of/);
  });
});

describe('extract — docx', () => {
  it('fails loudly on a bogus docx buffer', async () => {
    // A buffer that claims to be a zip (PK\x03\x04) but has no valid docx
    // structure. mammoth must reject it, and we surface the rejection.
    const fakeZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('not a real docx'),
    ]);
    await expect(
      extract({ buffer: fakeZip, filename: 'bogus.docx' }),
    ).rejects.toThrow(/mammoth failed to parse DOCX/);
  });
});

describe('extract — normalization', () => {
  it('strips base64 data URIs in markdown image form and bare', async () => {
    // Apply the normalization path directly through the text branch so we
    // don't need a real DOCX — the same normalizePlaintext runs for text.
    const input = [
      'Lutz Johnson',
      '![icon](data:image/png;base64,iVBORw0KGgoAAAAN)',
      'Senior Program Manager',
      'Inline: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA',
      'more content',
    ].join('\n');
    const result = await extract({ text: input, filename: 'x.txt' });
    expect(result.plaintext).not.toMatch(/base64/i);
    expect(result.plaintext).not.toMatch(/iVBORw0KG/);
    expect(result.plaintext).toContain('Lutz Johnson');
    expect(result.plaintext).toContain('Senior Program Manager');
    expect(result.plaintext).toContain('more content');
  });

  it('removes mammoth-style backslash escapes from punctuation', async () => {
    const input = 'Phone: 303\\-807\\-6872 | Email: name\\.test@example\\.com';
    const result = await extract({ text: input, filename: 'x.txt' });
    expect(result.plaintext).toContain('303-807-6872');
    expect(result.plaintext).toContain('name.test@example.com');
  });
});
