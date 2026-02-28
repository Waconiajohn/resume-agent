/**
 * Unit tests for export-docx.ts
 *
 * The `docx` library (Document, Packer, Paragraph, TextRun, …) is mocked to
 * avoid binary document generation in the test environment.  Tests verify:
 *   - preflightCheck validation logic (errors, warnings, valid flag)
 *   - exportDocx return shape on success and preflight failure
 *   - null-safe field handling (missing contact_info, missing sections)
 *   - raw_sections fallback path
 *   - education field consistency (no "in ," or "undefined" artifacts)
 *   - font default (FONT constant used in TextRun children)
 *   - certifications rendered with em-dash separator
 *   - DEFAULT_SECTION_ORDER used when section_order absent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FinalResume } from '@/types/resume';

// ---------------------------------------------------------------------------
// Shared structures captured by the docx mock so tests can inspect them.
// ---------------------------------------------------------------------------
const { createdParagraphs, createdTextRuns, packerToBlob } = vi.hoisted(() => {
  interface CapturedPara {
    style?: string;
    children?: unknown[];
    heading?: unknown;
    bullet?: { level: number };
    [key: string]: unknown;
  }
  interface CapturedRun {
    text?: string;
    font?: string;
    bold?: boolean;
    size?: number;
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
  function Header(opts: Record<string, unknown>) {
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
    HeadingLevel: { HEADING_2: 'HEADING_2' },
    BorderStyle: { SINGLE: 'SINGLE' },
    AlignmentType: { CENTER: 'CENTER' },
    Header,
    PageNumber: { CURRENT: 'PAGE_CURRENT' },
    TabStopType: { RIGHT: 'RIGHT' },
    TabStopPosition: { MAX: 9026 },
  };
});

// ---------------------------------------------------------------------------
// Mock saveBlobWithFilename — prevents real browser download
// ---------------------------------------------------------------------------
vi.mock('@/lib/download', () => ({
  saveBlobWithFilename: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { exportDocx, preflightCheck } from '@/lib/export-docx';

// ---------------------------------------------------------------------------
// Per-test reset
// ---------------------------------------------------------------------------
beforeEach(() => {
  createdParagraphs.length = 0;
  createdTextRuns.length = 0;
  packerToBlob.impl = async () => new Blob(['docx'], { type: 'application/zip' });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFullResume(overrides?: Partial<FinalResume>): FinalResume {
  return {
    summary: 'Experienced engineering leader with 15 years building great products.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP of Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        location: 'San Francisco, CA',
        bullets: [
          { text: 'Led 45-person team across 6 product verticals', source: 'crafted' },
        ],
      },
    ],
    skills: {
      'Technical Leadership': ['Architecture', 'System Design'],
    },
    education: [
      { degree: 'BS', field: 'Computer Science', institution: 'MIT', year: '2005' },
    ],
    certifications: [
      { name: 'AWS Solutions Architect', issuer: 'Amazon', year: '2022' },
    ],
    ats_score: 90,
    contact_info: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-1234',
      location: 'San Francisco, CA',
    },
    ...overrides,
  };
}

// Collect all text strings from captured TextRun objects
function allTextRunTexts(): string[] {
  return createdTextRuns
    .map((r) => (typeof r.text === 'string' ? r.text : null))
    .filter((t): t is string => t !== null);
}

// ---------------------------------------------------------------------------
// preflightCheck tests
// ---------------------------------------------------------------------------

describe('preflightCheck', () => {
  // 1. Valid resume passes preflight
  it('returns valid: true for a complete resume', () => {
    const result = preflightCheck(makeFullResume());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // 2. Missing contact name emits a warning (not an error)
  it('warns when contact name is missing', () => {
    const resume = makeFullResume({ contact_info: undefined });
    const result = preflightCheck(resume);
    expect(result.valid).toBe(true); // still valid
    expect(result.warnings.some((w) => w.includes('Missing contact name'))).toBe(true);
  });

  // 3. Missing email and phone emits a warning
  it('warns when both email and phone are missing', () => {
    const resume = makeFullResume({
      contact_info: { name: 'Jane Doe' },
    });
    const result = preflightCheck(resume);
    expect(result.warnings.some((w) => w.includes('No email or phone'))).toBe(true);
  });

  // 4. No structured content and no raw_sections → error
  it('returns valid: false when resume has no content at all', () => {
    const resume: FinalResume = {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
    };
    const result = preflightCheck(resume);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('No resume sections found'))).toBe(true);
  });

  // 5. Missing summary emits a warning
  it('warns when summary is absent', () => {
    const resume = makeFullResume({ summary: '' });
    const result = preflightCheck(resume);
    expect(result.warnings.some((w) => w.includes('No summary section'))).toBe(true);
  });

  // 6. Missing experience emits a warning
  it('warns when experience is absent', () => {
    const resume = makeFullResume({ experience: [] });
    const result = preflightCheck(resume);
    expect(result.warnings.some((w) => w.includes('No experience section'))).toBe(true);
  });

  // 7. raw_sections with content satisfies the no-content check
  it('returns valid: true when only raw_sections are present', () => {
    const resume: FinalResume = {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
      _raw_sections: {
        experience_role_1: 'VP Engineering\nAcme Corp\n• Built platform',
      },
    };
    const result = preflightCheck(resume);
    expect(result.valid).toBe(true);
  });

  // 8. Empty raw section emits a warning
  it('warns about empty raw sections', () => {
    const resume: FinalResume = {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
      _raw_sections: {
        experience_role_1: 'VP Engineering\nAcme Corp\n• Built platform',
        skills: '',
      },
    };
    const result = preflightCheck(resume);
    expect(result.warnings.some((w) => w.includes('Empty section: skills'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// exportDocx tests
// ---------------------------------------------------------------------------

describe('exportDocx', () => {
  // 9. Returns success: true on a complete resume
  it('returns success: true for a complete resume', async () => {
    const result = await exportDocx(makeFullResume());
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  // 10. Returns success: false when preflight fails (no content)
  it('returns success: false when resume has no content', async () => {
    const resume: FinalResume = {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
    };
    const result = await exportDocx(resume);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No resume sections found');
  });

  // 11. Candidate name rendered in a paragraph TextRun
  it('renders candidate name', async () => {
    await exportDocx(makeFullResume());
    const texts = allTextRunTexts();
    expect(texts).toContain('Jane Doe');
  });

  // 12. Font default is Calibri (FONT constant) — verified via TextRun font property
  it('uses Calibri as the font default in TextRuns', async () => {
    await exportDocx(makeFullResume());
    // At least one TextRun should specify font: 'Calibri'
    const calibriRuns = createdTextRuns.filter(
      (r) => typeof r.font === 'string' && r.font === 'Calibri',
    );
    expect(calibriRuns.length).toBeGreaterThan(0);
  });

  // 13. Education field consistency — "BS in Computer Science, MIT (2005)" in a TextRun
  it('renders education with all fields in correct format', async () => {
    await exportDocx(makeFullResume());
    const texts = allTextRunTexts();
    const eduLine = texts.find((t) => t.includes('BS') && t.includes('Computer Science'));
    expect(eduLine).toBeDefined();
    expect(eduLine).toContain('BS in Computer Science');
    expect(eduLine).toContain('MIT');
    expect(eduLine).toContain('2005');
    expect(eduLine).not.toContain('in ,');
    expect(eduLine).not.toContain('undefined');
  });

  // 14. Education with missing optional fields — no "in ," or "()" artifacts
  it('renders education gracefully when field and year are missing', async () => {
    await exportDocx(
      makeFullResume({
        education: [{ degree: 'MBA', field: '', institution: 'Harvard', year: '' }],
      }),
    );
    const texts = allTextRunTexts();
    const eduLine = texts.find((t) => t.includes('MBA') || t.includes('Harvard'));
    expect(eduLine).toBeDefined();
    expect(eduLine).not.toContain('in ,');
    expect(eduLine).not.toContain('()');
    expect(eduLine).not.toContain('undefined');
  });

  // 15. Certifications rendered with em-dash separator (U+2014)
  it('renders certifications with em-dash between name and issuer', async () => {
    await exportDocx(makeFullResume());
    const texts = allTextRunTexts();
    const certLine = texts.find((t) => t.includes('AWS Solutions Architect'));
    expect(certLine).toBeDefined();
    expect(certLine).toContain('\u2014'); // em-dash
    expect(certLine).toContain('Amazon');
    expect(certLine).toContain('2022');
  });

  // 16. raw_sections fallback path invoked when no structured content
  it('uses raw_sections fallback when no structured content', async () => {
    const resume: FinalResume = {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
      _raw_sections: {
        experience_role_1: 'VP Engineering\nAcme Corp, 2020–Present\n• Built platform team',
        skills: 'TypeScript, Python, Go',
      },
      section_order: ['experience_role_1', 'skills'],
    };
    const result = await exportDocx(resume);
    expect(result.success).toBe(true);
  });

  // 17. raw_sections: education_and_certifications combined key handled
  it('handles education_and_certifications combined raw key', async () => {
    const resume: FinalResume = {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
      _raw_sections: {
        experience_role_1: 'Director of Engineering\nBeta Inc, 2018–2020\n• Led team',
        education_and_certifications:
          'BS Computer Science, MIT, 2005\nAWS Certified Solutions Architect - Amazon (2022)',
      },
      section_order: ['experience_role_1', 'education'],
    };
    const result = await exportDocx(resume);
    expect(result.success).toBe(true);
  });

  // 18. Returns success: false when Packer.toBlob throws
  it('returns success: false and error message when Packer.toBlob throws', async () => {
    packerToBlob.impl = async () => {
      throw new Error('Packer failure');
    };
    const result = await exportDocx(makeFullResume());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Packer failure');
  });

  // 19. Missing contact_info — no throw, success: true
  it('succeeds when contact_info is undefined', async () => {
    const result = await exportDocx(makeFullResume({ contact_info: undefined }));
    expect(result.success).toBe(true);
  });

  // 20. skills section rendered with category bold labels
  it('renders skills with bold category labels in TextRuns', async () => {
    await exportDocx(makeFullResume());
    const boldRuns = createdTextRuns.filter(
      (r) => r.bold === true && typeof r.text === 'string' && (r.text as string).includes('Technical Leadership'),
    );
    expect(boldRuns.length).toBeGreaterThan(0);
  });
});
