import type { ContactInfo } from '@/types/resume';

// Invisible and bidirectional control characters that must be stripped from
// filename segments before further processing.  The download layer (download.ts)
// applies NFKC normalization and a second pass, so this is defense-in-depth.
// Ranges covered:
//   U+0000-U+001F  C0 control characters
//   U+007F         DEL
//   U+200B-U+200F  zero-width chars and directional marks
//   U+202A-U+202E  bidirectional embedding / override controls
//   U+2066-U+2069  bidirectional isolate controls
//   U+FEFF         BOM / zero-width no-break space
const FILENAME_INVISIBLE_RE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

function sanitizeFilenameSegment(s: string): string {
  return s
    .normalize('NFKC')
    .replace(FILENAME_INVISIBLE_RE, '')
    .replace(/[^\p{L}\p{N}]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
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
