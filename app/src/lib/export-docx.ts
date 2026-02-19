import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle,
  AlignmentType, Header, PageNumber, TabStopType, TabStopPosition,
} from 'docx';
import type { FinalResume, ContactInfo } from '@/types/resume';
import { DEFAULT_SECTION_ORDER } from '@/lib/constants';
import { buildResumeFilename } from '@/lib/export-filename';
import { saveBlobWithFilename } from '@/lib/download';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
        children: [new TextRun({ text: parts.join('; ') })],
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

  const leftText = parts.join('; ');

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
      const children = category
        ? [
            new TextRun({ text: `${category}: `, bold: true, size: 20, font: FONT }),
            new TextRun({ text: itemText, size: 20, font: FONT }),
          ]
        : [new TextRun({ text: itemText, size: 20, font: FONT })];
      paras.push(
        new Paragraph({
          style: 'BodyText',
          keepNext: true,
          spacing: { after: 60 },
          children,
        }),
      );
    }
    return paras;
  },

  experience: (resume) => {
    if (!Array.isArray(resume.experience) || resume.experience.length === 0) return [];
    const roleSectionKeys = Object.keys(resume._raw_sections ?? {})
      .filter((k) => k.startsWith('experience_role_'))
      .sort((a, b) => {
        const ai = Number.parseInt(a.replace('experience_role_', ''), 10);
        const bi = Number.parseInt(b.replace('experience_role_', ''), 10);
        return ai - bi;
      });
    if (roleSectionKeys.length > 0) {
      const parsedParas = [sectionHeading('Professional Experience')];
      for (const key of roleSectionKeys) {
        const roleText = resume._raw_sections?.[key];
        if (!roleText) continue;
        parsedParas.push(...parseExperienceRoleParagraphs(roleText));
      }
      const earlierCareer = resume._raw_sections?.earlier_career;
      if (earlierCareer) {
        parsedParas.push(...rawSectionToParagraphs('earlier_career', earlierCareer));
      }
      return parsedParas;
    }

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
              text: `${exp.company}${exp.location ? `, ${exp.location}` : ''}`,
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
      // Build line conditionally to avoid "in ," artifact when field/year are empty
      let line = edu.degree;
      if (edu.field) line += ` in ${edu.field}`;
      line += `, ${edu.institution}`;
      if (edu.year) line += ` (${edu.year})`;
      paras.push(
        new Paragraph({
          style: 'BodyText',
          keepLines: true,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: line, size: 20, font: FONT }),
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
      // Build line conditionally to avoid trailing "— " when issuer is empty
      let line = cert.name;
      if (cert.issuer) line += ` \u2014 ${cert.issuer}`;
      if (cert.year) line += ` (${cert.year})`;
      paras.push(
        new Paragraph({
          style: 'BodyText',
          keepLines: true,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: line, size: 20, font: FONT }),
          ],
        }),
      );
    }
    return paras;
  },
};

// ---------------------------------------------------------------------------
// Resume DOCX export
// ---------------------------------------------------------------------------

export async function exportDocx(resume: FinalResume): Promise<{ success: boolean; error?: string }> {
 try {
  const preflight = preflightCheck(resume);
  if (!preflight.valid) {
    return { success: false, error: preflight.errors.join('; ') };
  }
  if (preflight.warnings.length > 0) {
    console.warn('[export-docx] preflight warnings:', preflight.warnings.join('; '));
  }
  return await _exportDocxInner(resume);
 } catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error generating DOCX';
  console.error('[export-docx] Resume export failed:', message);
  return { success: false, error: message };
 }
}

/**
 * Parse experience role text into structured DOCX paragraphs.
 * Detects: Title line, Company/dates line, and bullets.
 *
 * Expected LLM output format for experience_role_*:
 *   Job Title (possibly with adjustment)
 *   Company Name, Location, Start – End
 *   • Bullet 1
 *   • Bullet 2
 */
function parseExperienceRoleParagraphs(text: string): Paragraph[] {
  const paras: Paragraph[] = [];
  // Strip markdown bold/italic markers (e.g. **Chief Technology Officer**)
  const lines = text.split('\n').map(l => l.trim().replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1')).filter(Boolean);

  // Skip section title lines (ALL CAPS or mixed-case) — handled by caller
  let startIdx = 0;
  if (lines[0] && (
    /^[A-Z][A-Z &/]+$/.test(lines[0]) ||
    /^(Experience|Professional Experience|Earlier Career)$/i.test(lines[0])
  )) {
    startIdx = 1;
  }

  let titleLine: string | null = null;
  let companyLine: string | null = null;
  const bullets: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].replace(/\s\|\s/g, ', ');
    // Bullet point
    if (/^[•\-*]\s/.test(line)) {
      bullets.push(line.replace(/^[•\-*]\s*/, ''));
      continue;
    }
    // First non-bullet non-heading is likely the job title
    if (!titleLine) {
      titleLine = line;
      continue;
    }
    // Second non-bullet line is the company/dates line (often has commas/semicolons/legacy pipes)
    if (!companyLine) {
      companyLine = line;
      continue;
    }
    // Any remaining non-bullet text is body text (rare)
    bullets.push(line);
  }

  // Render title line with JobTitle style
  if (titleLine) {
    // Try to extract dates from title line (e.g. "VP Engineering    2020 – Present")
    const dateMatch = titleLine.match(/\s{2,}(\d{4}\s*[–\-]\s*(?:\d{4}|Present|Current))$/i);
    if (dateMatch) {
      const title = titleLine.slice(0, dateMatch.index).trim();
      const dates = dateMatch[1].trim();
      paras.push(
        new Paragraph({
          style: 'JobTitle',
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: title }),
            new TextRun({ children: ['\t'] }),
            new TextRun({ text: dates, bold: false, size: 20, font: FONT, color: '666666' }),
          ],
        }),
      );
    } else {
      paras.push(
        new Paragraph({
          style: 'JobTitle',
          children: [new TextRun({ text: titleLine })],
        }),
      );
    }
  }

  // Render company line
  if (companyLine) {
    // Try to extract dates from company line (e.g. "Acme Corp, Chicago, IL, 2018 – 2020")
    const dateMatch = companyLine.match(/[|,;•\-]?\s*(\d{4}\s*[–\-]\s*(?:\d{4}|Present|Current))$/i);
    if (dateMatch && titleLine && !titleLine.match(/\d{4}/)) {
      const companyPart = companyLine.slice(0, dateMatch.index).replace(/[|,;•\-]?\s*$/, '').trim();
      const dates = dateMatch[1].trim();
      paras.push(
        new Paragraph({
          style: 'CompanyLine',
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: companyPart }),
            new TextRun({ children: ['\t'] }),
            new TextRun({ text: dates, size: 20, font: FONT, color: '666666' }),
          ],
        }),
      );
    } else {
      paras.push(
        new Paragraph({
          style: 'CompanyLine',
          children: [new TextRun({ text: companyLine })],
        }),
      );
    }
  }

  // Render bullets
  for (const bullet of bullets) {
    if (bullet.trim()) {
      paras.push(bulletParagraph(bullet));
    }
  }

  return paras;
}

/**
 * Convert raw section text (pipeline v2) into DOCX paragraphs.
 * Detects section headings (ALL CAPS lines), bullet points, and body text.
 * Dispatches experience_role_* sections to the specialized parser.
 */
function rawSectionToParagraphs(sectionName: string, text: string, isFirstExperienceRole = false): Paragraph[] {
  // Experience role sections get specialized parsing
  if (sectionName.startsWith('experience_role_')) {
    const paras: Paragraph[] = [];
    if (isFirstExperienceRole) {
      paras.push(sectionHeading('PROFESSIONAL EXPERIENCE'));
    }
    paras.push(...parseExperienceRoleParagraphs(text));
    return paras;
  }

  // Earlier career section
  if (sectionName === 'earlier_career') {
    const paras: Paragraph[] = [];
    // Parse as body text with optional bullets
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^[A-Z][A-Z &/]+$/.test(trimmed) && trimmed.length > 2) continue; // skip redundant heading
      if (/^[•\-*]\s/.test(trimmed)) {
        paras.push(bulletParagraph(trimmed.replace(/^[•\-*]\s*/, '')));
      } else {
        paras.push(
          new Paragraph({
            style: 'BodyText',
            children: [new TextRun({ text: trimmed })],
          }),
        );
      }
    }
    return paras;
  }

  const paras: Paragraph[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim().replace(/\s\|\s/g, ', ');
    if (!trimmed) continue;

    // Detect ALL CAPS headings (section titles like "SKILLS", "EXPERIENCE")
    if (/^[A-Z][A-Z &/]+$/.test(trimmed) && trimmed.length > 2) {
      paras.push(sectionHeading(trimmed));
    }
    // Detect bullet points
    else if (/^\s*[•\-*]\s/.test(line)) {
      const clean = trimmed.replace(/^\s*[•\-*]\s*/, '');
      if (clean) paras.push(bulletParagraph(clean));
    }
    // Bold-style lines (likely sub-headings like job titles or skill categories)
    else if (/^[A-Z][A-Za-z &]+:/.test(trimmed) && trimmed.length < 120) {
      const colonIdx = trimmed.indexOf(':');
      paras.push(
        new Paragraph({
          style: 'BodyText',
          keepNext: true,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: trimmed.substring(0, colonIdx + 1) + ' ', bold: true, size: 20, font: FONT }),
            new TextRun({ text: trimmed.substring(colonIdx + 1).trim(), size: 20, font: FONT }),
          ],
        }),
      );
    }
    // Regular body text
    else {
      paras.push(
        new Paragraph({
          style: 'BodyText',
          children: [new TextRun({ text: trimmed })],
        }),
      );
    }
  }

  // If the first line wasn't an ALL CAPS heading, add one from the section name
  const firstLine = lines.find(l => l.trim())?.trim() ?? '';
  const firstLineIsHeading = /^[A-Z][A-Z &/]+$/.test(firstLine) && firstLine.length > 2;
  if (paras.length > 0 && !firstLineIsHeading) {
    const heading = sectionName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    paras.unshift(sectionHeading(heading));
  }

  return paras;
}

async function _exportDocxInner(resume: FinalResume): Promise<{ success: boolean }> {
  const children: Paragraph[] = [];

  // Contact header in document body (NOT in Word header — ATS requirement)
  if (resume.contact_info?.name) {
    children.push(...contactHeaderParagraphs(resume.contact_info));
  }

  const hasStructuredContent =
    !!resume.summary?.trim() ||
    (Array.isArray(resume.experience) && resume.experience.length > 0) ||
    (resume.skills && Object.keys(resume.skills).length > 0) ||
    (Array.isArray(resume.education) && resume.education.length > 0) ||
    (Array.isArray(resume.certifications) && resume.certifications.length > 0);

  if (hasStructuredContent) {
    // Preferred path: structured resume data produces consistent ATS-safe layout.
    const order = resume.section_order ?? DEFAULT_SECTION_ORDER;
    const rendered = new Set<string>();
    for (const sectionName of order) {
      const renderer = sectionRenderers[sectionName];
      if (renderer) {
        children.push(...renderer(resume));
        rendered.add(sectionName);
      }
    }
    for (const sectionName of DEFAULT_SECTION_ORDER) {
      if (rendered.has(sectionName)) continue;
      const renderer = sectionRenderers[sectionName];
      if (renderer) children.push(...renderer(resume));
    }
  } else {
    // Fallback: raw section text from pipeline v2.
    const rawSections = resume._raw_sections ?? {};
    const order = resume.section_order ?? Object.keys(rawSections ?? {});
    let isFirstExpRole = true;
    let renderedCombinedEducation = false;
    for (const sectionName of order) {
      let text = rawSections[sectionName];
      // Bridge split section_order keys to legacy combined raw key.
      if (
        !text
        && !renderedCombinedEducation
        && (sectionName === 'education' || sectionName === 'certifications')
        && rawSections.education_and_certifications
      ) {
        text = rawSections.education_and_certifications;
        renderedCombinedEducation = true;
        children.push(...rawSectionToParagraphs('education_and_certifications', text));
        continue;
      }
      if (text) {
        const isExpRole = sectionName.startsWith('experience_role_');
        children.push(...rawSectionToParagraphs(sectionName, text, isExpRole && isFirstExpRole));
        if (isExpRole) isFirstExpRole = false;
        if (sectionName === 'education_and_certifications') renderedCombinedEducation = true;
      }
    }
    if (!renderedCombinedEducation && rawSections.education_and_certifications) {
      children.push(...rawSectionToParagraphs('education_and_certifications', rawSections.education_and_certifications));
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

  const rawBlob = await Packer.toBlob(doc);
  const blob = new Blob([rawBlob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'docx');
  saveBlobWithFilename(blob, filename, 'docx');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Export preflight validation
// ---------------------------------------------------------------------------

export interface PreflightResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export function preflightCheck(resume: FinalResume): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Contact info
  if (!resume.contact_info?.name) {
    warnings.push('Missing contact name — exported file will use a generic header');
  }
  if (!resume.contact_info?.email && !resume.contact_info?.phone) {
    warnings.push('No email or phone in contact info');
  }

  // Section content
  const rawSections = resume._raw_sections ?? {};
  const sectionKeys = Object.keys(rawSections);
  if (sectionKeys.length === 0 && !resume.summary) {
    errors.push('No resume sections found');
  }

  for (const [key, content] of Object.entries(rawSections)) {
    if (!content || !content.trim()) {
      errors.push(`Empty section: ${key}`);
    }
  }

  // Summary check
  if (!resume.summary && !rawSections.summary) {
    warnings.push('No summary section');
  }

  // Experience check
  const hasExperience =
    (Array.isArray(resume.experience) && resume.experience.length > 0) ||
    sectionKeys.some(k => k.startsWith('experience_role_') || k === 'experience');
  if (!hasExperience) {
    warnings.push('No experience section');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
