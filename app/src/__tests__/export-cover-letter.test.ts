import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildResumeFilename } from '@/lib/export-filename';

// ---------------------------------------------------------------------------
// Shared structures captured by the docx mock so tests can inspect them.
// ---------------------------------------------------------------------------
const { createdParagraphs, createdTextRuns, packerToBlob } = vi.hoisted(() => {
  interface CapturedPara {
    spacing?: { after?: number };
    children?: unknown[];
    [key: string]: unknown;
  }
  interface CapturedRun {
    text?: string;
    font?: string;
    size?: number;
    break?: number;
    [key: string]: unknown;
  }

  const createdParagraphs: CapturedPara[] = [];
  const createdTextRuns: CapturedRun[] = [];
  const packerToBlob = { impl: async (): Promise<Blob> => new Blob(['docx'], { type: 'application/zip' }) };

  return { createdParagraphs, createdTextRuns, packerToBlob };
});

// ---------------------------------------------------------------------------
// Mock the `docx` library
// ---------------------------------------------------------------------------
vi.mock('docx', () => {
  function Paragraph(opts: Record<string, unknown>) {
    createdParagraphs.push({ ...opts });
    return opts;
  }
  function TextRun(opts: Record<string, unknown>) {
    createdTextRuns.push({ ...opts });
    return opts;
  }
  function Document(opts: Record<string, unknown>) {
    return opts;
  }
  const Packer = {
    toBlob: vi.fn(async () => packerToBlob.impl()),
  };

  return {
    Document,
    Packer,
    Paragraph,
    TextRun,
  };
});

// ---------------------------------------------------------------------------
// Mock saveBlobWithFilename — prevents real browser download; returns filename
// ---------------------------------------------------------------------------
vi.mock('@/lib/download', () => ({
  saveBlobWithFilename: vi.fn((_blob: Blob, filename: string) => filename),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { exportCoverLetterDocx } from '@/lib/export-cover-letter';

// ---------------------------------------------------------------------------
// Per-test reset
// ---------------------------------------------------------------------------
beforeEach(() => {
  createdParagraphs.length = 0;
  createdTextRuns.length = 0;
  packerToBlob.impl = async () => new Blob(['docx'], { type: 'application/zip' });
});

// ---------------------------------------------------------------------------
// buildResumeFilename tests (existing)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// exportCoverLetterDocx tests
// ---------------------------------------------------------------------------

describe('exportCoverLetterDocx', () => {
  it('returns a filename ending in .docx', async () => {
    const filename = await exportCoverLetterDocx('Dear Hiring Manager,\n\nThank you for your time.');
    expect(filename).toMatch(/\.docx$/);
  });

  it('includes company name in the filename when provided', async () => {
    const filename = await exportCoverLetterDocx('Dear Hiring Manager,\n\nThank you.', 'Acme Corp');
    expect(filename).toContain('Acme_Corp');
    expect(filename).toMatch(/\.docx$/);
  });

  it('includes contact name in the filename when provided', async () => {
    const filename = await exportCoverLetterDocx(
      'Dear Hiring Manager,\n\nThank you.',
      'Acme Corp',
      'Jane Doe',
    );
    expect(filename).toContain('Jane_Doe');
    expect(filename).toContain('Acme_Corp');
    expect(filename).toMatch(/\.docx$/);
  });

  it('handles empty letter text without throwing', async () => {
    await expect(exportCoverLetterDocx('')).resolves.not.toThrow();
    // Empty input → single empty paragraph emitted
    expect(createdParagraphs.length).toBeGreaterThanOrEqual(1);
  });

  it('splits letter into paragraphs on double newlines', async () => {
    const letter = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    await exportCoverLetterDocx(letter);
    // Expect 3 paragraphs — one per double-newline-separated block
    expect(createdParagraphs.length).toBe(3);
  });

  it('creates a TextRun for each line within a paragraph', async () => {
    const letter = 'Line A\nLine B\nLine C';
    await exportCoverLetterDocx(letter);
    const textRuns = createdTextRuns.filter((r) => typeof r.text === 'string');
    const texts = textRuns.map((r) => r.text as string);
    expect(texts).toContain('Line A');
    expect(texts).toContain('Line B');
    expect(texts).toContain('Line C');
  });

  it('uses Calibri font in TextRuns', async () => {
    await exportCoverLetterDocx('Hello world.');
    const calibriRuns = createdTextRuns.filter(
      (r) => typeof r.font === 'string' && r.font === 'Calibri',
    );
    expect(calibriRuns.length).toBeGreaterThan(0);
  });

  it('uses 11pt font size (22 half-points) in TextRuns', async () => {
    await exportCoverLetterDocx('Hello world.');
    const sizedRuns = createdTextRuns.filter((r) => r.size === 22);
    expect(sizedRuns.length).toBeGreaterThan(0);
  });

  it('includes filename suffix Cover_Letter in the returned filename', async () => {
    const filename = await exportCoverLetterDocx('Some text.', 'Beta Inc');
    expect(filename).toContain('Cover_Letter');
  });
});
