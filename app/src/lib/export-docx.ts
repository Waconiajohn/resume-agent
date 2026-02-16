import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle,
  AlignmentType, Header, PageNumber, TabStopType, TabStopPosition,
} from 'docx';
import { saveAs } from 'file-saver';
import type { FinalResume, ContactInfo } from '@/types/resume';
import type { CoverLetterParagraph } from '@/types/panels';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFilenameSegment(s: string): string {
  // Preserve Unicode letters/numbers (accented chars like é, ñ, ü)
  return s.replace(/[^\p{L}\p{N}]/gu, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function buildFilename(contactInfo?: ContactInfo, companyName?: string, suffix?: string, ext = 'docx'): string {
  const parts: string[] = [];
  const name = contactInfo?.name?.trim();
  if (name) {
    const names = name.split(/\s+/);
    parts.push(names.map(n => sanitizeFilenameSegment(n)).filter(Boolean).join('_'));
  }
  if (companyName) {
    parts.push(sanitizeFilenameSegment(companyName));
  }
  parts.push(suffix ?? 'Resume');
  // Ensure filename doesn't start with underscore when name is missing
  const filename = parts.filter(Boolean).join('_');
  return `${filename}.${ext}`;
}

// ---------------------------------------------------------------------------
// Reusable paragraph styles (Section X-B of formatting guide)
// ---------------------------------------------------------------------------

const FONT = 'Calibri';

const paragraphStyles = [
  {
    id: 'ResumeName',
    name: 'Resume Name',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    paragraph: {
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    },
    run: { bold: true, size: 44, font: FONT },         // 22pt
  },
  {
    id: 'ContactLine',
    name: 'Contact Line',
    basedOn: 'Normal',
    next: 'Normal',
    paragraph: {
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    },
    run: { size: 20, font: FONT, color: '666666' },    // 10pt
  },
  {
    id: 'SectionHeading',
    name: 'Section Heading',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    paragraph: {
      keepNext: true,
      spacing: { before: 300, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
    },
    run: { bold: true, size: 24, font: FONT, color: '444444' },  // 12pt
  },
  {
    id: 'JobTitle',
    name: 'Job Title',
    basedOn: 'Normal',
    next: 'Normal',
    paragraph: {
      keepNext: true,
      keepLines: true,
      spacing: { before: 240, after: 40 },
    },
    run: { bold: true, size: 22, font: FONT },          // 11pt
  },
  {
    id: 'CompanyLine',
    name: 'Company Line',
    basedOn: 'Normal',
    next: 'Normal',
    paragraph: {
      keepNext: true,
      spacing: { after: 60 },
    },
    run: { size: 20, font: FONT, color: '666666' },     // 10pt
  },
  {
    id: 'BulletItem',
    name: 'Bullet Item',
    basedOn: 'Normal',
    next: 'Normal',
    paragraph: {
      keepLines: true,
      spacing: { after: 60 },
      indent: { left: 360, hanging: 360 },
    },
    run: { size: 20, font: FONT },                      // 10pt
  },
  {
    id: 'BodyText',
    name: 'Body Text Resume',
    basedOn: 'Normal',
    next: 'Normal',
    paragraph: {
      spacing: { after: 120 },
      widowControl: true,
    },
    run: { size: 20, font: FONT },                      // 10pt
  },
] as const;

// ---------------------------------------------------------------------------
// Contact header (document body, page 1 only)
// ---------------------------------------------------------------------------

function contactHeaderParagraphs(contactInfo: ContactInfo): Paragraph[] {
  const paras: Paragraph[] = [];

  if (contactInfo.name) {
    paras.push(
      new Paragraph({
        style: 'ResumeName',
        children: [new TextRun({ text: contactInfo.name })],
      }),
    );
  }

  const parts: string[] = [];
  if (contactInfo.email) parts.push(contactInfo.email);
  if (contactInfo.phone) parts.push(contactInfo.phone);
  if (contactInfo.linkedin) parts.push(contactInfo.linkedin);
  if (contactInfo.location) parts.push(contactInfo.location);

  if (parts.length > 0) {
    paras.push(
      new Paragraph({
        style: 'ContactLine',
        children: [new TextRun({ text: parts.join(' | ') })],
      }),
    );
  }

  // Horizontal rule
  paras.push(
    new Paragraph({
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '999999' } },
      children: [],
    }),
  );

  return paras;
}

// ---------------------------------------------------------------------------
// Page 2+ header (Section X-D)
// ---------------------------------------------------------------------------

function pageHeader(contactInfo?: ContactInfo): Header {
  const parts: string[] = [];
  if (contactInfo?.name) parts.push(contactInfo.name);
  if (contactInfo?.email) parts.push(contactInfo.email);
  if (contactInfo?.phone) parts.push(contactInfo.phone);

  const leftText = parts.join(' | ');

  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        children: [
          new TextRun({ text: leftText, size: 18, font: FONT, color: '999999' }),
          new TextRun({ children: ['\t'], size: 18, font: FONT }),
          new TextRun({ text: 'Page ', size: 18, font: FONT, color: '999999' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT, color: '999999' }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    style: 'SectionHeading',
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: text.toUpperCase() })],
  });
}

// ---------------------------------------------------------------------------
// Bullet paragraph with hanging indent
// ---------------------------------------------------------------------------

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    style: 'BulletItem',
    bullet: { level: 0 },
    children: [new TextRun({ text })],
  });
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

type SectionRenderer = (resume: FinalResume) => Paragraph[];

const sectionRenderers: Record<string, SectionRenderer> = {
  summary: (resume) => {
    if (!resume.summary) return [];
    return [
      sectionHeading('Professional Summary'),
      new Paragraph({
        style: 'BodyText',
        children: [new TextRun({ text: resume.summary })],
      }),
    ];
  },

  selected_accomplishments: (resume) => {
    if (!resume.selected_accomplishments) return [];
    const paras = [sectionHeading('Selected Accomplishments')];
    const lines = resume.selected_accomplishments.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const clean = line.replace(/^\s*[•\-*]\s*/, '').trim();
      if (clean) {
        paras.push(bulletParagraph(clean));
      }
    }
    return paras;
  },

  skills: (resume) => {
    if (!resume.skills || typeof resume.skills !== 'object' || Array.isArray(resume.skills)) return [];
    if (Object.keys(resume.skills).length === 0) return [];
    const paras = [sectionHeading('Core Competencies')];
    for (const [category, items] of Object.entries(resume.skills)) {
      const itemText = Array.isArray(items) ? items.join(' \u2022 ') : String(items);
      paras.push(
        new Paragraph({
          style: 'BodyText',
          keepNext: true,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${category}: `, bold: true, size: 20, font: FONT }),
            new TextRun({ text: itemText, size: 20, font: FONT }),
          ],
        }),
      );
    }
    return paras;
  },

  experience: (resume) => {
    if (!Array.isArray(resume.experience) || resume.experience.length === 0) return [];
    const paras = [sectionHeading('Professional Experience')];
    for (const exp of resume.experience) {
      // Job title — keepNext so it stays with company line
      paras.push(
        new Paragraph({
          style: 'JobTitle',
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: exp.title }),
            new TextRun({ children: ['\t'] }),
            new TextRun({
              text: `${exp.start_date} \u2013 ${exp.end_date}`,
              bold: false, size: 20, font: FONT, color: '666666',
            }),
          ],
        }),
      );
      // Company line — keepNext so it stays with first bullet
      paras.push(
        new Paragraph({
          style: 'CompanyLine',
          children: [
            new TextRun({
              text: `${exp.company}${exp.location ? ` | ${exp.location}` : ''}`,
            }),
          ],
        }),
      );
      for (const bullet of exp.bullets ?? []) {
        if (bullet.text?.trim()) {
          paras.push(bulletParagraph(bullet.text));
        }
      }
    }
    return paras;
  },

  education: (resume) => {
    if (!Array.isArray(resume.education) || resume.education.length === 0) return [];
    const paras = [sectionHeading('Education')];
    for (const edu of resume.education) {
      paras.push(
        new Paragraph({
          style: 'BodyText',
          keepLines: true,
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${edu.degree} in ${edu.field}, ${edu.institution}${edu.year ? ` (${edu.year})` : ''}`,
              size: 20,
              font: FONT,
            }),
          ],
        }),
      );
    }
    return paras;
  },

  certifications: (resume) => {
    if (!Array.isArray(resume.certifications) || resume.certifications.length === 0) return [];
    const paras = [sectionHeading('Certifications')];
    for (const cert of resume.certifications) {
      paras.push(
        new Paragraph({
          style: 'BodyText',
          keepLines: true,
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${cert.name} \u2014 ${cert.issuer}${cert.year ? ` (${cert.year})` : ''}`,
              size: 20,
              font: FONT,
            }),
          ],
        }),
      );
    }
    return paras;
  },
};

const DEFAULT_SECTION_ORDER = ['summary', 'selected_accomplishments', 'skills', 'experience', 'education', 'certifications'];

// ---------------------------------------------------------------------------
// Resume DOCX export
// ---------------------------------------------------------------------------

export async function exportDocx(resume: FinalResume): Promise<{ success: boolean; error?: string }> {
 try {
  return await _exportDocxInner(resume);
 } catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error generating DOCX';
  console.error('[export-docx] Resume export failed:', message);
  return { success: false, error: message };
 }
}

async function _exportDocxInner(resume: FinalResume): Promise<{ success: boolean }> {
  const children: Paragraph[] = [];

  // Contact header in document body (NOT in Word header — ATS requirement)
  if (resume.contact_info?.name) {
    children.push(...contactHeaderParagraphs(resume.contact_info));
  }

  // Render sections in design-choice order, falling back to default
  const order = resume.section_order ?? DEFAULT_SECTION_ORDER;
  const rendered = new Set<string>();

  for (const sectionName of order) {
    const renderer = sectionRenderers[sectionName];
    if (renderer) {
      children.push(...renderer(resume));
      rendered.add(sectionName);
    }
  }

  // Render any remaining sections not in the order list
  for (const sectionName of DEFAULT_SECTION_ORDER) {
    if (!rendered.has(sectionName)) {
      const renderer = sectionRenderers[sectionName];
      if (renderer) {
        children.push(...renderer(resume));
      }
    }
  }

  const doc = new Document({
    // Document metadata (Section X-F)
    title: resume.contact_info?.name ? `${resume.contact_info.name} Resume` : 'Resume',
    creator: 'Resume Agent',
    description: resume.contact_info?.name
      ? `Resume for ${resume.contact_info.name}`
      : 'Tailored executive resume',
    // Reusable paragraph styles (Section X-B)
    styles: {
      paragraphStyles: [...paragraphStyles],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
          // Suppress header on page 1 — contact info in body (Section X-D)
          titlePage: true,
        },
        headers: {
          default: pageHeader(resume.contact_info),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = buildFilename(resume.contact_info, resume.company_name, 'Resume');
  saveAs(blob, filename);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Cover Letter DOCX export
// ---------------------------------------------------------------------------

export async function exportCoverLetterDocx(
  paragraphs: CoverLetterParagraph[],
  companyName?: string,
  roleTitle?: string,
  contactInfo?: ContactInfo,
): Promise<{ success: boolean; error?: string }> {
 try {
  const children: Paragraph[] = [];

  // Sender contact block
  if (contactInfo?.name) {
    children.push(
      new Paragraph({
        style: 'ResumeName',
        alignment: AlignmentType.LEFT,
        spacing: { after: 20 },
        children: [new TextRun({ text: contactInfo.name, bold: true, size: 22, font: FONT })],
      }),
    );
    const contactLine: string[] = [];
    if (contactInfo.email) contactLine.push(contactInfo.email);
    if (contactInfo.phone) contactLine.push(contactInfo.phone);
    if (contactInfo.linkedin) contactLine.push(contactInfo.linkedin);
    if (contactInfo.location) contactLine.push(contactInfo.location);
    if (contactLine.length > 0) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: contactLine.join(' | '), size: 20, font: FONT, color: '666666' })],
        }),
      );
    }
  }

  // Date
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          size: 20, font: FONT, color: '666666',
        }),
      ],
    }),
  );

  // Recipient
  if (companyName) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: companyName, size: 20, font: FONT })],
      }),
    );
  }
  if (roleTitle) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: `Re: ${roleTitle}`, size: 20, font: FONT, italics: true })],
      }),
    );
  }

  // Salutation
  const salutation = companyName ? `Dear ${companyName} Hiring Team,` : 'Dear Hiring Manager,';
  children.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: salutation, size: 20, font: FONT })],
    }),
  );

  // Body paragraphs (skip empty)
  for (const para of paragraphs) {
    if (!para.content?.trim()) continue;
    children.push(
      new Paragraph({
        style: 'BodyText',
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: para.content })],
      }),
    );
  }

  // Signature block
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [new TextRun({ text: 'Sincerely,', size: 20, font: FONT })],
    }),
  );
  if (contactInfo?.name) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: contactInfo.name, size: 20, font: FONT })],
      }),
    );
  }

  const doc = new Document({
    title: contactInfo?.name ? `${contactInfo.name} Cover Letter` : 'Cover Letter',
    creator: 'Resume Agent',
    styles: {
      paragraphStyles: [...paragraphStyles],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = buildFilename(contactInfo, companyName, 'Cover_Letter');
  saveAs(blob, filename);
  return { success: true };
 } catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error generating cover letter DOCX';
  console.error('[export-docx] Cover letter export failed:', message);
  return { success: false, error: message };
 }
}
