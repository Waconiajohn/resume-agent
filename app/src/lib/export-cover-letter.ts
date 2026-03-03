import { jsPDF } from 'jspdf';
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
