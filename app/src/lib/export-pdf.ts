import { jsPDF } from 'jspdf';
import type { FinalResume } from '@/types/resume';
import { DEFAULT_SECTION_ORDER } from '@/lib/constants';
import { buildResumeFilename } from '@/lib/export-filename';
import { saveBlobWithFilename } from '@/lib/download';

type PdfStyle = 'name' | 'contact' | 'heading' | 'body' | 'bullet' | 'blank';

interface PdfLine {
  text: string;
  style: PdfStyle;
}

interface PdfStyleConfig {
  bold: boolean;
  size: number;
  indent: number;
  lineHeight: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 54;
const MARGIN_RIGHT = 54;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const STYLE_MAP: Record<Exclude<PdfStyle, 'blank'>, PdfStyleConfig> = {
  name: { bold: true, size: 18, indent: 0, lineHeight: 24 },
  contact: { bold: false, size: 10, indent: 0, lineHeight: 14 },
  heading: { bold: true, size: 11, indent: 0, lineHeight: 18 },
  body: { bold: false, size: 10, indent: 0, lineHeight: 14 },
  bullet: { bold: false, size: 10, indent: 16, lineHeight: 14 },
};

/**
 * WinAnsi characters above U+00FF that jsPDF's standard fonts support natively.
 * These must not be fed through the NFKD fallback, which would decompose or
 * strip them.
 *
 * Windows-1252 code page mappings that live above Latin-1:
 *   0x80 → U+20AC (Euro sign)
 *   0x82 → U+201A  0x83 → U+0192  0x84 → U+201E  0x85 → U+2026 (ellipsis)
 *   0x86 → U+2020  0x87 → U+2021  0x88 → U+02C6  0x89 → U+2030
 *   0x8A → U+0160  0x8B → U+2039  0x8C → U+0152
 *   0x8E → U+017D
 *   0x91 → U+2018  0x92 → U+2019  0x93 → U+201C  0x94 → U+201D (smart quotes)
 *   0x95 → U+2022 (bullet)
 *   0x96 → U+2013 (en-dash)  0x97 → U+2014 (em-dash)
 *   0x98 → U+02DC  0x99 → U+2122  0x9A → U+0161  0x9B → U+203A
 *   0x9C → U+0153  0x9E → U+017E  0x9F → U+0178
 */
const WINANSI_ABOVE_FF = new Set([
  '\u20AC', '\u201A', '\u0192', '\u201E', '\u2026', '\u2020', '\u2021',
  '\u02C6', '\u2030', '\u0160', '\u2039', '\u0152', '\u017D',
  '\u2018', '\u2019', '\u201C', '\u201D', '\u2022', '\u2013', '\u2014',
  '\u02DC', '\u2122', '\u0161', '\u203A', '\u0153', '\u017E', '\u0178',
]);

/**
 * Sanitize text for PDF rendering. jsPDF handles WinAnsi encoding for standard
 * fonts, so em-dashes, smart quotes, bullets, and Latin-1 accented characters
 * are preserved. Only truly unsupported characters are converted or stripped.
 *
 * WinAnsi-supported characters that pass through unchanged:
 *   U+2018/U+2019 (smart single quotes), U+201C/U+201D (smart double quotes),
 *   U+2013 (en-dash), U+2014 (em-dash), U+2026 (ellipsis)
 */
export function sanitizePdfText(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/\s\|\s/g, ', ')
    // Uncommon bullet variants → standard bullet (U+2022, in WinAnsi)
    .replace(/[\u2023\u25E6\u2043\u00B7\u2027]/g, '\u2022')
    // Prime / double-prime → ASCII (not in WinAnsi)
    .replace(/\u2032/g, "'")
    .replace(/\u2033/g, '"')
    // Modifier apostrophe → right single quote (WinAnsi)
    .replace(/\u02BC/g, '\u2019')
    // Non-breaking space → regular space
    .replace(/\u00A0/g, ' ')
    // NFKD normalize remaining non-WinAnsi, non-Latin-1 characters.
    // Characters in WINANSI_ABOVE_FF are kept; everything else is decomposed
    // via NFKD and any residual non-Latin-1 codepoints are stripped.
    .replace(/[^\x00-\xFF]/g, (ch) => {
      if (WINANSI_ABOVE_FF.has(ch)) return ch;
      const normalized = ch.normalize('NFKD').replace(/[^\x00-\xFF]/g, '');
      return normalized || '';
    })
    // Strip control characters and invisible Unicode
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\u2028\u2029\uFEFF]/g, '')
    .trim();
}

function parseBulletsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[•\-*]\s*/, ''))
    .filter(Boolean);
}

function parseRawExperienceRole(text: string): PdfLine[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const result: PdfLine[] = [];
  for (const line of lines) {
    if (/^(PROFESSIONAL EXPERIENCE|EXPERIENCE|EARLIER CAREER)$/i.test(line)) continue;
    if (/^[•\-*]\s/.test(line)) {
      const bullet = line.replace(/^[•\-*]\s*/, '').trim();
      if (bullet) result.push({ text: bullet, style: 'bullet' });
      continue;
    }
    result.push({ text: line, style: 'body' });
  }
  result.push({ text: '', style: 'blank' });
  return result;
}

function renderSummary(resume: FinalResume): PdfLine[] {
  if (!resume.summary?.trim()) return [];
  return [
    { text: 'PROFESSIONAL SUMMARY', style: 'heading' },
    ...resume.summary
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ text: line, style: 'body' as const })),
    { text: '', style: 'blank' },
  ];
}

function renderSelectedAccomplishments(resume: FinalResume): PdfLine[] {
  if (!resume.selected_accomplishments?.trim()) return [];
  const bullets = parseBulletsFromText(
    resume.selected_accomplishments.replace(/^\s*SELECTED ACCOMPLISHMENTS\s*/i, ''),
  );
  if (bullets.length === 0) return [];
  return [
    { text: 'SELECTED ACCOMPLISHMENTS', style: 'heading' },
    ...bullets.map((text) => ({ text, style: 'bullet' as const })),
    { text: '', style: 'blank' },
  ];
}

function renderSkills(resume: FinalResume): PdfLine[] {
  const lines: PdfLine[] = [];
  if (resume.skills && typeof resume.skills === 'object' && !Array.isArray(resume.skills)) {
    const entries = Object.entries(resume.skills).filter(([, items]) => {
      return Array.isArray(items) ? items.length > 0 : Boolean(items);
    });
    if (entries.length > 0) {
      lines.push({ text: 'CORE COMPETENCIES', style: 'heading' });
      for (const [category, items] of entries) {
        const itemText = Array.isArray(items) ? items.join(', ') : String(items);
        const text = category ? `${category}: ${itemText}` : itemText;
        lines.push({ text, style: 'body' });
      }
      lines.push({ text: '', style: 'blank' });
    }
  }
  return lines;
}

function renderExperience(resume: FinalResume): PdfLine[] {
  const lines: PdfLine[] = [];
  const rawSections = resume._raw_sections ?? {};
  const roleKeys = Object.keys(rawSections)
    .filter((key) => key.startsWith('experience_role_'))
    .sort((a, b) => {
      const ai = Number.parseInt(a.replace('experience_role_', ''), 10);
      const bi = Number.parseInt(b.replace('experience_role_', ''), 10);
      return ai - bi;
    });

  if (roleKeys.length > 0) {
    lines.push({ text: 'PROFESSIONAL EXPERIENCE', style: 'heading' });
    for (const key of roleKeys) {
      const roleText = rawSections[key];
      if (!roleText?.trim()) continue;
      lines.push(...parseRawExperienceRole(roleText));
    }
    if (rawSections.earlier_career?.trim()) {
      lines.push(...parseRawExperienceRole(rawSections.earlier_career));
    }
    return lines;
  }

  if (!Array.isArray(resume.experience) || resume.experience.length === 0) return [];

  lines.push({ text: 'PROFESSIONAL EXPERIENCE', style: 'heading' });
  for (const exp of resume.experience) {
    const roleLine = `${exp.title || ''}, ${exp.company || ''}`.replace(/^,\s*/, '');
    const dateLine = `${exp.start_date || ''} - ${exp.end_date || 'Present'}${exp.location ? `, ${exp.location}` : ''}`;
    lines.push({ text: roleLine, style: 'body' });
    lines.push({ text: dateLine, style: 'body' });
    for (const bullet of exp.bullets ?? []) {
      if (!bullet.text?.trim()) continue;
      lines.push({ text: bullet.text, style: 'bullet' });
    }
    lines.push({ text: '', style: 'blank' });
  }
  return lines;
}

function renderEducation(resume: FinalResume): PdfLine[] {
  if (!Array.isArray(resume.education) || resume.education.length === 0) return [];
  const lines: PdfLine[] = [{ text: 'EDUCATION', style: 'heading' }];
  for (const edu of resume.education) {
    let text = (edu.degree ?? '').trim();
    if (edu.field?.trim()) text += ` in ${edu.field.trim()}`;
    if (edu.institution?.trim()) text += `${text ? ', ' : ''}${edu.institution.trim()}`;
    if (edu.year?.trim()) text += ` (${edu.year.trim()})`;
    if (text) lines.push({ text, style: 'body' });
  }
  lines.push({ text: '', style: 'blank' });
  return lines;
}

function renderCertifications(resume: FinalResume): PdfLine[] {
  if (!Array.isArray(resume.certifications) || resume.certifications.length === 0) return [];
  const lines: PdfLine[] = [{ text: 'CERTIFICATIONS', style: 'heading' }];
  for (const cert of resume.certifications) {
    let text = cert.name;
    if (cert.issuer) text += ` - ${cert.issuer}`;
    if (cert.year) text += ` (${cert.year})`;
    lines.push({ text, style: 'body' });
  }
  lines.push({ text: '', style: 'blank' });
  return lines;
}

function buildPdfLines(resume: FinalResume): PdfLine[] {
  const lines: PdfLine[] = [];

  const name = resume.contact_info?.name?.trim();
  const contactParts = [
    resume.contact_info?.email,
    resume.contact_info?.phone,
    resume.contact_info?.linkedin,
    resume.contact_info?.location,
  ].filter((part): part is string => Boolean(part?.trim()));

  if (name) lines.push({ text: name.toUpperCase(), style: 'name' });
  if (contactParts.length > 0) lines.push({ text: contactParts.join('; '), style: 'contact' });
  if (name || contactParts.length > 0) lines.push({ text: '', style: 'blank' });

  const hasStructuredContent =
    Boolean(resume.summary?.trim()) ||
    (Array.isArray(resume.experience) && resume.experience.length > 0) ||
    (resume.skills && Object.keys(resume.skills).length > 0) ||
    (Array.isArray(resume.education) && resume.education.length > 0) ||
    (Array.isArray(resume.certifications) && resume.certifications.length > 0);

  if (!hasStructuredContent && resume._raw_sections && Object.keys(resume._raw_sections).length > 0) {
    const rawOrder = resume.section_order ?? Object.keys(resume._raw_sections);
    let renderedExperience = false;
    let renderedCombinedEducation = false;
    for (const sectionName of rawOrder) {
      if (sectionName.startsWith('experience_role_') || sectionName === 'earlier_career') {
        if (!renderedExperience) {
          lines.push(...renderExperience(resume));
          renderedExperience = true;
        }
        continue;
      }

      if (
        !renderedCombinedEducation
        && (sectionName === 'education' || sectionName === 'certifications')
        && resume._raw_sections.education_and_certifications
      ) {
        const combined = resume._raw_sections.education_and_certifications;
        lines.push({ text: 'EDUCATION AND CERTIFICATIONS', style: 'heading' });
        for (const row of combined.split('\n').map((line) => line.trim()).filter(Boolean)) {
          if (/^[•\-*]\s/.test(row)) {
            lines.push({ text: row.replace(/^[•\-*]\s*/, ''), style: 'bullet' });
          } else if (!/^[A-Z][A-Z0-9 &/]+$/.test(row)) {
            lines.push({ text: row, style: 'body' });
          }
        }
        lines.push({ text: '', style: 'blank' });
        renderedCombinedEducation = true;
        continue;
      }

      const rawText = resume._raw_sections[sectionName];
      if (!rawText?.trim()) continue;
      const heading = sectionName.replace(/_/g, ' ').toUpperCase();
      lines.push({ text: heading, style: 'heading' });
      for (const row of rawText.split('\n').map((line) => line.trim()).filter(Boolean)) {
        if (/^[•\-*]\s/.test(row)) {
          lines.push({ text: row.replace(/^[•\-*]\s*/, ''), style: 'bullet' });
        } else if (!/^[A-Z][A-Z0-9 &/]+$/.test(row)) {
          lines.push({ text: row, style: 'body' });
        }
      }
      lines.push({ text: '', style: 'blank' });
      if (sectionName === 'education_and_certifications') {
        renderedCombinedEducation = true;
      }
    }
    if (!renderedCombinedEducation && resume._raw_sections.education_and_certifications) {
      const combined = resume._raw_sections.education_and_certifications;
      lines.push({ text: 'EDUCATION AND CERTIFICATIONS', style: 'heading' });
      for (const row of combined.split('\n').map((line) => line.trim()).filter(Boolean)) {
        if (/^[•\-*]\s/.test(row)) {
          lines.push({ text: row.replace(/^[•\-*]\s*/, ''), style: 'bullet' });
        } else if (!/^[A-Z][A-Z0-9 &/]+$/.test(row)) {
          lines.push({ text: row, style: 'body' });
        }
      }
      lines.push({ text: '', style: 'blank' });
    }
    return lines.length > 0 ? lines : [{ text: 'Resume content unavailable.', style: 'body' }];
  }

  const order = resume.section_order ?? DEFAULT_SECTION_ORDER;
  const rendered = new Set<string>();
  let experienceRendered = false;

  for (const sectionName of order) {
    if (sectionName.startsWith('experience_role_') || sectionName === 'earlier_career') {
      if (!experienceRendered) {
        lines.push(...renderExperience(resume));
        rendered.add('experience');
        experienceRendered = true;
      }
      continue;
    }

    if (sectionName === 'summary') lines.push(...renderSummary(resume));
    if (sectionName === 'selected_accomplishments') lines.push(...renderSelectedAccomplishments(resume));
    if (sectionName === 'skills') lines.push(...renderSkills(resume));
    if (sectionName === 'experience') lines.push(...renderExperience(resume));
    if (sectionName === 'education') lines.push(...renderEducation(resume));
    if (sectionName === 'certifications') lines.push(...renderCertifications(resume));
    rendered.add(sectionName);
  }

  for (const sectionName of DEFAULT_SECTION_ORDER) {
    if (rendered.has(sectionName)) continue;
    if (sectionName === 'summary') lines.push(...renderSummary(resume));
    if (sectionName === 'selected_accomplishments') lines.push(...renderSelectedAccomplishments(resume));
    if (sectionName === 'skills') lines.push(...renderSkills(resume));
    if (sectionName === 'experience') lines.push(...renderExperience(resume));
    if (sectionName === 'education') lines.push(...renderEducation(resume));
    if (sectionName === 'certifications') lines.push(...renderCertifications(resume));
  }

  return lines.length > 0 ? lines : [{ text: 'Resume content unavailable.', style: 'body' }];
}

function buildPdfBlob(resume: FinalResume): Blob {
  const lines = buildPdfLines(resume);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  let y = MARGIN_TOP;

  function applyStyle(style: PdfStyleConfig) {
    doc.setFont('helvetica', style.bold ? 'bold' : 'normal');
    doc.setFontSize(style.size);
  }

  function ensureRoom(height: number) {
    if (y + height <= PAGE_HEIGHT - MARGIN_BOTTOM) return;
    doc.addPage();
    y = MARGIN_TOP;
  }

  for (const line of lines) {
    if (line.style === 'blank') {
      y += 10;
      continue;
    }

    const style = STYLE_MAP[line.style];
    applyStyle(style);

    const baseX = MARGIN_LEFT + style.indent;
    const availableWidth = CONTENT_WIDTH - style.indent;
    const text = sanitizePdfText(line.text);
    if (!text) continue;

    const isBullet = line.style === 'bullet';

    if (isBullet) {
      const prefixWidth = doc.getTextWidth('- ');
      const wrapped: string[] = doc.splitTextToSize(text, availableWidth - prefixWidth);
      for (let i = 0; i < wrapped.length; i++) {
        ensureRoom(style.lineHeight);
        if (i === 0) {
          doc.text(`- ${wrapped[i]}`, baseX, y);
        } else {
          doc.text(wrapped[i], baseX + prefixWidth, y);
        }
        y += style.lineHeight;
      }
    } else {
      const wrapped: string[] = doc.splitTextToSize(text, availableWidth);
      for (const wrappedLine of wrapped) {
        ensureRoom(style.lineHeight);
        doc.text(wrappedLine, baseX, y);
        y += style.lineHeight;
      }
    }

    if (line.style === 'heading') y += 2;
  }

  // Add page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const pageText = `Page ${i} of ${totalPages}`;
    const textWidth = doc.getTextWidth(pageText);
    doc.text(pageText, PAGE_WIDTH - MARGIN_RIGHT - textWidth, PAGE_HEIGHT - MARGIN_BOTTOM + 14);
  }

  return doc.output('blob');
}

export function exportPdf(resume: FinalResume): { success: boolean; error?: string } {
  try {
    const blob = buildPdfBlob(resume);
    const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'pdf');
    saveBlobWithFilename(blob, filename, 'pdf');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate PDF';
    return { success: false, error: message };
  }
}
