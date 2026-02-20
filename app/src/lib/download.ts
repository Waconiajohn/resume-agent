import { saveAs } from 'file-saver';

type ExportExt = 'txt' | 'docx' | 'pdf';

const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);
const MAX_FILENAME_BASE_CHARS = 120;

function sanitizeFilenameBase(filename: string): string {
  const strippedExt = filename
    .trim()
    .replace(/\.(txt|docx|pdf)\s*$/i, '')
    .trim();

  const cleaned = strippedExt
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '');

  const sliced = cleaned.slice(0, MAX_FILENAME_BASE_CHARS).replace(/^[_\.]+|[_\.]+$/g, '');
  let base = sliced || 'Resume';
  if (WINDOWS_RESERVED_NAMES.has(base.toLowerCase())) {
    base = `${base}_file`;
  }
  return base;
}

export function normalizeDownloadFilename(filename: string, ext: ExportExt): string {
  const base = sanitizeFilenameBase(filename);
  return `${base}.${ext}`;
}

export function saveBlobWithFilename(blob: Blob, filename: string, ext: ExportExt): string {
  const safeName = normalizeDownloadFilename(filename, ext);
  try {
    saveAs(blob, safeName);
  } catch {
    // Fallback for environments where file-saver fails unexpectedly.
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  return safeName;
}
