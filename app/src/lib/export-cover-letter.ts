import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { buildResumeFilename } from '@/lib/export-filename';
import { saveBlobWithFilename } from '@/lib/download';

/**
 * Download the cover letter as a plain text file.
 */
export function downloadCoverLetterAsText(letter: string, companyName?: string): string {
  const filename = buildResumeFilename(undefined, companyName, 'Cover_Letter', 'txt');
  const blob = new Blob([letter], { type: 'text/plain;charset=utf-8' });
  return saveBlobWithFilename(blob, filename, 'txt');
}

/**
 * Export the cover letter as a PDF with executive formatting.
 *
 * Uses the same Helvetica/54pt margins convention as the resume PDF export.
 */
export function exportCoverLetterPdf(
  letter: string,
  companyName?: string,
  contactName?: string,
): string {
  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN_LEFT = 54;
  const MARGIN_RIGHT = 54;
  const MARGIN_TOP = 56;
  const MARGIN_BOTTOM = 44;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const LINE_HEIGHT = 16;
  const FONT_SIZE = 11;

  const doc = new jsPDF({
    unit: 'pt',
    format: [PAGE_WIDTH, PAGE_HEIGHT],
  });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(FONT_SIZE);

  let y = MARGIN_TOP;

  // Split letter into paragraphs and render
  const paragraphs = letter.split(/\n{2,}/);

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const lines = doc.splitTextToSize(trimmed, CONTENT_WIDTH) as string[];

    for (const line of lines) {
      if (y + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
        doc.addPage();
        y = MARGIN_TOP;
      }
      doc.text(line, MARGIN_LEFT, y);
      y += LINE_HEIGHT;
    }

    // Paragraph spacing
    y += LINE_HEIGHT * 0.5;
  }

  const filename = buildResumeFilename(
    contactName ? { name: contactName } : undefined,
    companyName,
    'Cover_Letter',
    'pdf',
  );

  const blob = doc.output('blob');
  return saveBlobWithFilename(blob, filename, 'pdf');
}

/**
 * Export the cover letter as a DOCX file.
 *
 * Calibri 11pt, 1-inch margins, each double-newline-separated block becomes
 * a Paragraph. Single newlines within a block become line breaks.
 */
export async function exportCoverLetterDocx(
  letter: string,
  companyName?: string,
  contactName?: string,
): Promise<string> {
  const FONT = 'Calibri';
  const FONT_SIZE = 22; // half-points: 22 = 11pt

  const paragraphs: Paragraph[] = letter.split(/\n{2,}/).flatMap((block) => {
    const trimmed = block.trim();
    if (!trimmed) return [];

    // Split on single newlines to produce TextRun children with breaks
    const lines = trimmed.split('\n');
    const children: TextRun[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        children.push(new TextRun({ break: 1 }));
      }
      children.push(new TextRun({ text: lines[i], font: FONT, size: FONT_SIZE }));
    }

    return [
      new Paragraph({
        spacing: { after: 240 },
        children,
      }),
    ];
  });

  // Emit at least one empty paragraph for an empty letter
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [] }));
  }

  const doc = new Document({
    creator: 'CareerIQ',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: FONT_SIZE },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            // 1440 twips = 1 inch
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const rawBlob = await Packer.toBlob(doc);
  const blob = new Blob([rawBlob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const filename = buildResumeFilename(
    contactName ? { name: contactName } : undefined,
    companyName,
    'Cover_Letter',
    'docx',
  );

  return saveBlobWithFilename(blob, filename, 'docx');
}
