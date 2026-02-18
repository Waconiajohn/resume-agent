import type { ContactInfo } from '@/types/resume';

function sanitizeFilenameSegment(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function buildResumeFilename(
  contactInfo?: ContactInfo,
  companyName?: string,
  suffix = 'Resume',
  ext: 'txt' | 'docx' | 'pdf' = 'txt',
): string {
  const parts: string[] = [];
  const name = contactInfo?.name?.trim();
  if (name) {
    const names = name.split(/\s+/);
    parts.push(names.map((n) => sanitizeFilenameSegment(n)).filter(Boolean).join('_'));
  }
  if (companyName) {
    parts.push(sanitizeFilenameSegment(companyName));
  }
  parts.push(sanitizeFilenameSegment(suffix) || 'Resume');
  const base = parts.filter(Boolean).join('_') || 'Resume';
  return `${base}.${ext}`;
}
