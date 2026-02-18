import { saveAs } from 'file-saver';

type ExportExt = 'txt' | 'docx' | 'pdf';

function ensureExtension(filename: string, ext: ExportExt): string {
  const lower = filename.toLowerCase();
  const wanted = `.${ext}`;
  if (lower.endsWith(wanted)) return filename;
  return `${filename.replace(/\.+$/, '')}${wanted}`;
}

export function saveBlobWithFilename(blob: Blob, filename: string, ext: ExportExt): void {
  const safeName = ensureExtension(filename, ext);
  saveAs(blob, safeName);
}

