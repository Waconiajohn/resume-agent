import type { FinalResume } from '@/types/resume';
import { resumeToText } from '@/lib/export';
import { buildResumeFilename } from '@/lib/export-filename';

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(text: string, maxLen = 95): string[] {
  if (text.length <= maxLen) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildPdfBlob(text: string): Blob {
  const rawLines = text.split('\n').flatMap((line) => wrapLine(line));
  const linesPerPage = 55;
  const pages: string[][] = [];
  for (let i = 0; i < rawLines.length; i += linesPerPage) {
    pages.push(rawLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['']);

  const objects: string[] = [];
  const addObj = (content: string): number => {
    objects.push(content);
    return objects.length;
  };

  const catalogObj = addObj('');
  const pagesObj = addObj('');
  const pageKids: string[] = [];
  const fontObj = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (const pageLines of pages) {
    const streamLines = [
      'BT',
      '/F1 10 Tf',
      '50 790 Td',
      ...pageLines.map((line, idx) => `${idx === 0 ? '' : 'T* ' }(${escapePdfText(line)}) Tj`),
      'ET',
    ].join('\n');

    const contentObj = addObj(`<< /Length ${streamLines.length} >>\nstream\n${streamLines}\nendstream`);
    const pageObj = addObj(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
    pageKids.push(`${pageObj} 0 R`);
  }

  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${pageKids.length} >>`;
  objects[catalogObj - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
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
    const text = resumeToText(resume);
    const blob = buildPdfBlob(text);
    const filename = buildResumeFilename(resume.contact_info, resume.company_name, 'Resume', 'pdf');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate PDF';
    return { success: false, error: message };
  }
}
