import type { ContactInfo } from '@/types/resume';

function sanitizeFilenameSegment(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function clampSegment(s: string, maxLen = 40): string {
  return s.length > maxLen ? s.slice(0, maxLen) : s;
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
    parts.push(clampSegment(names.map((n) => sanitizeFilenameSegment(n)).filter(Boolean).join('_')));
  }
  if (companyName) {
    parts.push(clampSegment(sanitizeFilenameSegment(companyName)));
  }
  parts.push(clampSegment(sanitizeFilenameSegment(suffix) || 'Resume'));
  const rawBase = parts.filter(Boolean).join('_') || 'Resume';
  // Keep filename portable and preserve extension even after truncation.
  const base = rawBase.length > 110 ? rawBase.slice(0, 110).replace(/_+$/g, '') : rawBase;
  return `${base || 'Resume'}.${ext}`;
}
