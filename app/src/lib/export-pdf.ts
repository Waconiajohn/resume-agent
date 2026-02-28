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
  font: 'F1' | 'F2';
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
  name: { font: 'F2', size: 18, indent: 0, lineHeight: 24 },
  contact: { font: 'F1', size: 10, indent: 0, lineHeight: 14 },
  heading: { font: 'F2', size: 11, indent: 0, lineHeight: 18 },
  body: { font: 'F1', size: 10, indent: 0, lineHeight: 14 },
  bullet: { font: 'F1', size: 10, indent: 16, lineHeight: 14 },
};

function sanitizePdfText(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/\s\|\s/g, ', ')
    // Translate common Unicode punctuation to ASCII equivalents
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")     // smart single quotes, prime
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')      // smart double quotes, double prime
    .replace(/[\u2013\u2014]/g, '-')                   // en-dash, em-dash
    .replace(/[\u2026]/g, '...')                       // ellipsis
    .replace(/[\u2022\u2023\u25E6\u2043]/g, '-')      // bullets
    .replace(/[\u00B7\u2027]/g, '-')                   // middle dot variants
    .replace(/[\u00A0]/g, ' ')                         // non-breaking space
    .replace(/[\u2019\u02BC]/g, "'")                   // modifier apostrophe
    .replace(/[\u00AE]/g, '(R)')                       // registered
    .replace(/[\u2122]/g, '(TM)')                      // trademark
    .replace(/[\u00A9]/g, '(C)')                       // copyright
    .replace(/[\u00BD]/g, '1/2')                       // vulgar fraction 1/2
    .replace(/[\u00BC]/g, '1/4')                       // vulgar fraction 1/4
    .replace(/[\u00BE]/g, '3/4')                       // vulgar fraction 3/4
    // Strip only actual control characters and problematic invisible characters.
    // Preserve all printable Unicode (accented chars, CJK, etc.).
    // U+0000-U+0008, U+000B-U+000C, U+000E-U+001F: C0 controls (keep \t \n \r)
    // U+007F: DEL
    // U+200B-U+200F: zero-width chars
    // U+2028-U+2029: line/paragraph separators
    // U+FEFF: BOM / zero-width no-break space
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\u2028\u2029\uFEFF]/g, '')
    .trim();
}

function escapePdfText(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function maxCharsForWidth(width: number, fontSize: number): number {
  const approxCharWidth = fontSize * 0.52;
  return Math.max(18, Math.floor(width / approxCharWidth));
}

function wrapByWord(text: string, maxChars: number): string[] {
  const normalized = sanitizePdfText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
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

      // Bridge split section_order keys to the combined raw key.
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

function drawTextCommand(font: 'F1' | 'F2', size: number, x: number, y: number, text: string): string {
  return [
    'BT',
    `/${font} ${size} Tf`,
    `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
    `(${escapePdfText(text)}) Tj`,
    'ET',
  ].join('\n');
}

function layoutPages(lines: PdfLine[]): string[] {
  const pages: string[][] = [[]];
  let pageIndex = 0;
  let y = PAGE_HEIGHT - MARGIN_TOP;

  function ensureRoom(requiredHeight: number) {
    if (y - requiredHeight >= MARGIN_BOTTOM) return;
    pageIndex += 1;
    pages.push([]);
    y = PAGE_HEIGHT - MARGIN_TOP;
  }

  function pushCommand(command: string) {
    pages[pageIndex].push(command);
  }

  for (const line of lines) {
    if (line.style === 'blank') {
      ensureRoom(10);
      y -= 10;
      continue;
    }

    const style = STYLE_MAP[line.style];
    const baseX = MARGIN_LEFT + style.indent;
    const availableWidth = CONTENT_WIDTH - style.indent;
    const maxChars = maxCharsForWidth(availableWidth, style.size);
    const wrapped = wrapByWord(line.text, maxChars);
    if (wrapped.length === 0) continue;

    for (let i = 0; i < wrapped.length; i++) {
      const row = wrapped[i];
      const isBullet = line.style === 'bullet';
      const continuedBullet = isBullet && i > 0;
      const bulletPrefix = isBullet && i === 0 ? '- ' : '';
      const text = `${bulletPrefix}${row}`;
      const extraIndent = continuedBullet ? 10 : 0;
      const x = baseX + extraIndent;

      ensureRoom(style.lineHeight);
      pushCommand(drawTextCommand(style.font, style.size, x, y, text));
      y -= style.lineHeight;
    }

    if (line.style === 'heading') y -= 2;
  }

  return pages.map((commands, idx) => {
    const pageNumber = `Page ${idx + 1} of ${pages.length}`;
    const footerX = PAGE_WIDTH - MARGIN_RIGHT - 70;
    const footerY = MARGIN_BOTTOM - 14;
    return [
      ...commands,
      drawTextCommand('F1', 9, footerX, footerY, pageNumber),
    ].join('\n');
  });
}

function buildPdfBlob(resume: FinalResume): Blob {
  const pageStreams = layoutPages(buildPdfLines(resume));
  const encoder = new TextEncoder();

  const objects: string[] = [];
  const addObject = (content: string): number => {
    objects.push(content);
    return objects.length;
  };

  const catalogObj = addObject('');
  const pagesObj = addObject('');
  const fontNormalObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageKids: string[] = [];

  for (const stream of pageStreams) {
    const streamLength = encoder.encode(stream).length;
    const contentObj = addObject(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
    const pageObj = addObject(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontNormalObj} 0 R /F2 ${fontBoldObj} 0 R >> >> /Contents ${contentObj} 0 R >>`,
    );
    pageKids.push(`${pageObj} 0 R`);
  }

  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${pageKids.length} >>`;
  objects[catalogObj - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;

  const header = '%PDF-1.4\n';
  let pdf = header;
  let byteCount = encoder.encode(header).length;
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(byteCount);
    const objStr = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    pdf += objStr;
    byteCount += encoder.encode(objStr).length;
  }

  const xrefOffset = byteCount;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
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
