/**
 * Unit tests for export-pdf.ts
 *
 * jsPDF is mocked to avoid requiring a canvas/DOM renderer.  The tests verify
 * the public `exportPdf` function against:
 *   - section ordering per DEFAULT_SECTION_ORDER and custom section_order
 *   - null-safe / missing field handling
 *   - special character preservation (em-dash, smart quotes, bullet, accented)
 *   - raw_sections fallback path
 *   - sanitizePdfText behaviour (tested indirectly through captured doc.text() calls)
 *   - return value shape on success and on internal error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FinalResume } from '@/types/resume';

// ---------------------------------------------------------------------------
// vi.hoisted creates values BEFORE vi.mock factories run, so the factory can
// reference them safely without the temporal dead zone error.
// ---------------------------------------------------------------------------
const { capturedTexts, outputFn } = vi.hoisted(() => {
  const capturedTexts: string[] = [];
  // Mutable wrapper so tests can swap the output implementation per-test
  const outputFn = {
    impl: (): Blob => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
  };
  return { capturedTexts, outputFn };
});

// ---------------------------------------------------------------------------
// Mock jspdf — constructor must use `function` (not arrow) to support `new`.
// ---------------------------------------------------------------------------
vi.mock('jspdf', () => {
  const instance = {
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    getTextWidth: vi.fn(() => 20),
    splitTextToSize: vi.fn((text: string) => [text]),
    text: vi.fn(function (t: string) {
      capturedTexts.push(t);
    }),
    addPage: vi.fn(),
    setPage: vi.fn(),
    getNumberOfPages: vi.fn(() => 1),
    output: vi.fn(function () {
      return outputFn.impl();
    }),
  };

  return {
    jsPDF: vi.fn(function JsPDFCtor() {
      return instance;
    }),
    // Expose the shared instance so tests can restore implementations after mockClear
    __instance: instance,
  };
});

// ---------------------------------------------------------------------------
// Mock saveBlobWithFilename — prevents real browser download
// ---------------------------------------------------------------------------
vi.mock('@/lib/download', () => ({
  saveBlobWithFilename: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------
import { exportPdf } from '@/lib/export-pdf';
import * as jspdfMod from 'jspdf';

// Access the singleton instance exposed by the factory
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharedInstance = (jspdfMod as any).__instance as {
  setFont: ReturnType<typeof vi.fn>;
  setFontSize: ReturnType<typeof vi.fn>;
  getTextWidth: ReturnType<typeof vi.fn>;
  splitTextToSize: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  addPage: ReturnType<typeof vi.fn>;
  setPage: ReturnType<typeof vi.fn>;
  getNumberOfPages: ReturnType<typeof vi.fn>;
  output: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Per-test setup: clear captured text store and reset call counts, then
// restore all per-method implementations (mockClear removes them).
// ---------------------------------------------------------------------------
beforeEach(() => {
  capturedTexts.length = 0;
  outputFn.impl = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

  sharedInstance.setFont.mockClear();
  sharedInstance.setFontSize.mockClear();
  sharedInstance.addPage.mockClear();
  sharedInstance.setPage.mockClear();
  sharedInstance.getTextWidth.mockClear();
  sharedInstance.splitTextToSize.mockClear();
  sharedInstance.text.mockClear();
  sharedInstance.getNumberOfPages.mockClear();
  sharedInstance.output.mockClear();

  // Re-attach implementations after clear
  sharedInstance.getTextWidth.mockImplementation(() => 20);
  sharedInstance.getNumberOfPages.mockImplementation(() => 1);
  sharedInstance.splitTextToSize.mockImplementation((text: string) => [text]);
  sharedInstance.text.mockImplementation(function (t: string) {
    capturedTexts.push(t);
  });
  sharedInstance.output.mockImplementation(function () {
    return outputFn.impl();
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFullResume(overrides?: Partial<FinalResume>): FinalResume {
  return {
    summary: 'Experienced engineering leader with 15 years building products.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP of Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        location: 'San Francisco, CA',
        bullets: [
          { text: 'Led 45-person team across 6 product verticals', source: 'crafted' },
          { text: 'Reduced deployment time by 60% via CI/CD improvements', source: 'crafted' },
        ],
      },
    ],
    skills: {
      'Technical Leadership': ['Architecture', 'System Design'],
      Programming: ['TypeScript', 'Python'],
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

function captured(): string {
  return capturedTexts.join('\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportPdf', () => {
  // 1. Returns success: true on a complete resume
  it('returns success: true for a complete resume', () => {
    const result = exportPdf(makeFullResume());
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  // 2. Renders candidate name in header (uppercased)
  it('renders candidate name uppercased in header', () => {
    exportPdf(makeFullResume());
    expect(captured()).toContain('JANE DOE');
  });

  // 3. All section headings present and in correct DEFAULT_SECTION_ORDER
  it('renders section headings in DEFAULT_SECTION_ORDER when section_order not specified', () => {
    exportPdf(makeFullResume());
    const text = captured();
    const summaryIdx = text.indexOf('PROFESSIONAL SUMMARY');
    const skillsIdx = text.indexOf('CORE COMPETENCIES');
    const expIdx = text.indexOf('PROFESSIONAL EXPERIENCE');
    const eduIdx = text.indexOf('EDUCATION');
    const certIdx = text.indexOf('CERTIFICATIONS');

    expect(summaryIdx).toBeGreaterThan(-1);
    expect(skillsIdx).toBeGreaterThan(-1);
    expect(expIdx).toBeGreaterThan(-1);
    expect(eduIdx).toBeGreaterThan(-1);
    expect(certIdx).toBeGreaterThan(-1);

    // Order must match DEFAULT_SECTION_ORDER
    expect(summaryIdx).toBeLessThan(skillsIdx);
    expect(skillsIdx).toBeLessThan(expIdx);
    expect(expIdx).toBeLessThan(eduIdx);
    expect(eduIdx).toBeLessThan(certIdx);
  });

  // 4. Custom section_order changes render order
  it('respects a custom section_order', () => {
    const resume = makeFullResume({
      section_order: ['experience', 'skills', 'summary', 'education', 'certifications'],
    });
    exportPdf(resume);
    const text = captured();
    const expIdx = text.indexOf('PROFESSIONAL EXPERIENCE');
    const skillsIdx = text.indexOf('CORE COMPETENCIES');
    const summaryIdx = text.indexOf('PROFESSIONAL SUMMARY');

    expect(expIdx).toBeGreaterThan(-1);
    expect(skillsIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(expIdx).toBeLessThan(skillsIdx);
    expect(skillsIdx).toBeLessThan(summaryIdx);
  });

  // 5. Missing contact_info — no throw, success: true
  it('succeeds with missing contact_info', () => {
    const result = exportPdf(makeFullResume({ contact_info: undefined }));
    expect(result.success).toBe(true);
  });

  // 6. Empty experience array — no PROFESSIONAL EXPERIENCE heading
  it('succeeds when experience is empty and omits experience heading', () => {
    const result = exportPdf(makeFullResume({ experience: [] }));
    expect(result.success).toBe(true);
    expect(captured()).not.toContain('PROFESSIONAL EXPERIENCE');
  });

  // 7. Experience bullets rendered
  it('renders experience bullet text', () => {
    exportPdf(makeFullResume());
    expect(captured()).toContain('Led 45-person team across 6 product verticals');
  });

  // 8. Education with all fields — "BS in Computer Science, MIT (2005)"
  it('renders education with all fields correctly', () => {
    exportPdf(makeFullResume());
    const text = captured();
    expect(text).toContain('BS in Computer Science');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('in ,');
  });

  // 9. Education with missing optional fields — no "in ," or "()" artifacts
  it('renders education gracefully when field and year are missing', () => {
    const result = exportPdf(
      makeFullResume({
        education: [{ degree: 'MBA', field: '', institution: 'Harvard', year: '' }],
      }),
    );
    expect(result.success).toBe(true);
    const text = captured();
    expect(text).toContain('MBA');
    expect(text).toContain('Harvard');
    expect(text).not.toContain('in ,');
    expect(text).not.toContain('()');
  });

  // 10. Certifications rendered with issuer and year
  it('renders certifications with issuer and year', () => {
    exportPdf(makeFullResume());
    const text = captured();
    expect(text).toContain('AWS Solutions Architect');
    expect(text).toContain('Amazon');
    expect(text).toContain('2022');
  });

  // 11. Em-dash (U+2014) preserved
  it('preserves em-dash in text content', () => {
    exportPdf(
      makeFullResume({
        summary: 'Results-driven leader \u2014 recognized for impact.',
      }),
    );
    expect(captured()).toContain('\u2014');
  });

  // 12. Smart quotes (U+201C / U+201D) preserved
  it('preserves smart quotes in text content', () => {
    exportPdf(
      makeFullResume({
        summary: '\u201CHigh-performer\u201D with a proven track record.',
      }),
    );
    const text = captured();
    expect(text).toContain('\u201C');
    expect(text).toContain('\u201D');
  });

  // 13. Accented Latin characters (é, ñ, ü) preserved
  it('preserves accented Latin characters', () => {
    exportPdf(
      makeFullResume({
        summary: 'Caf\u00E9, re\u00E7u, \u00FCber, ma\u00F1ana.',
      }),
    );
    const text = captured();
    expect(text).toContain('\u00E9'); // é
    expect(text).toContain('\u00F1'); // ñ
    expect(text).toContain('\u00FC'); // ü
  });

  // 14. C0 control characters stripped
  it('strips C0 control characters from text', () => {
    exportPdf(
      makeFullResume({
        summary: 'Clean text\u0001\u0007 after control chars.',
      }),
    );
    const text = captured();
    expect(text).not.toContain('\u0001');
    expect(text).not.toContain('\u0007');
  });

  // 15. Zero-width space (U+200B) stripped
  it('strips zero-width space and preserves surrounding letters', () => {
    exportPdf(
      makeFullResume({
        summary: 'No\u200Bwhere',
      }),
    );
    const text = captured();
    expect(text).not.toContain('\u200B');
    expect(text).toContain('Nowhere');
  });

  // 16. raw_sections fallback: experience_role_ keys produce PROFESSIONAL EXPERIENCE
  it('uses raw_sections fallback when no structured content', () => {
    const resume: FinalResume = {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
      _raw_sections: {
        experience_role_1: 'VP Engineering\nAcme Corp, 2020\u2013Present\n\u2022 Built platform team',
        education: 'BS Computer Science, MIT, 2005',
      },
      section_order: ['experience_role_1', 'education'],
    };
    const result = exportPdf(resume);
    expect(result.success).toBe(true);
    expect(captured()).toContain('PROFESSIONAL EXPERIENCE');
  });

  // 17. raw_sections: combined education_and_certifications key rendered
  it('renders combined education_and_certifications from raw_sections', () => {
    const resume: FinalResume = {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
      _raw_sections: {
        experience_role_1: 'Director of Engineering\nBeta Inc, 2018\u20132020\n\u2022 Led team',
        education_and_certifications:
          'BS Computer Science, MIT, 2005\nAWS Certified Solutions Architect - Amazon (2022)',
      },
      section_order: ['experience_role_1', 'education'],
    };
    const result = exportPdf(resume);
    expect(result.success).toBe(true);
    expect(captured()).toContain('EDUCATION AND CERTIFICATIONS');
  });

  // 18. Returns success: false when output() throws
  it('returns success: false and error message when PDF generation throws', () => {
    outputFn.impl = () => {
      throw new Error('jsPDF internal failure');
    };
    const result = exportPdf(makeFullResume());
    expect(result.success).toBe(false);
    expect(result.error).toContain('jsPDF internal failure');
  });

  // 19. Skills rendered as "category: item1, item2"
  it('renders skills with category labels', () => {
    exportPdf(makeFullResume());
    const text = captured();
    expect(text).toContain('Technical Leadership: Architecture, System Design');
  });

  // 20. selected_accomplishments section rendered when present
  it('renders selected_accomplishments section when present', () => {
    exportPdf(
      makeFullResume({
        selected_accomplishments:
          '\u2022 Grew revenue 3x in two years\n\u2022 Launched product used by 1M users',
      }),
    );
    const text = captured();
    expect(text).toContain('SELECTED ACCOMPLISHMENTS');
    expect(text).toContain('Grew revenue 3x in two years');
  });
});
