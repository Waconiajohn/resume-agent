import type {
  CandidateExperience,
  SourceResumeOutline,
  SourceResumePosition,
} from './types.js';

// Keyword-based heading detection — matches "Career Experience", "Areas of Expertise",
// "Education & Certifications", etc. without enumerating every exact string.
const EXPERIENCE_KEYWORDS = /\b(experience|career\s+history|employment|work\s+history|earlier\s+career)\b/i;
const NON_EXPERIENCE_KEYWORDS = /\b(summary|competenc|skill|accomplishment|achievement|expertise|education|certification|award|publication|board|volunteer|affiliation|membership|language|interest|development|honor|civic|community)\b/i;

function isExperienceHeading(line: string): boolean {
  if (line.length > 60 || BULLET_PREFIX_RE.test(line)) return false;
  return EXPERIENCE_KEYWORDS.test(line) && !NON_EXPERIENCE_KEYWORDS.test(line);
}

function isSectionHeading(line: string): boolean {
  if (line.length > 60 || BULLET_PREFIX_RE.test(line)) return false;
  return EXPERIENCE_KEYWORDS.test(line) || NON_EXPERIENCE_KEYWORDS.test(line);
}

// Match ANY non-alphanumeric, non-whitespace character at the start of a line as a bullet prefix.
// This handles all Unicode bullet chars (•●▪◆►etc), dashes, asterisks, and anything PDF tools produce.
const BULLET_PREFIX_RE = /^[^\w\s]\s*/;
const MONTH_PATTERN = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const YEAR_PATTERN = '(?:19|20)\\d{2}';
const MONTH_YEAR_PATTERN = `(?:${MONTH_PATTERN}\\s+${YEAR_PATTERN}|${YEAR_PATTERN})`;
const END_DATE_PATTERN = `(?:Present|Current|${MONTH_YEAR_PATTERN})`;
const DATE_RANGE_RE = new RegExp(`\\b(${MONTH_YEAR_PATTERN})\\s*(?:-|–|—|to)\\s*(${END_DATE_PATTERN})\\b`, 'i');
const TITLE_HINT_RE = /\b(chief|ceo|coo|cto|cio|cfo|president|vice president|vp|director|manager|head|lead|principal|engineer|analyst|consultant|architect|officer|administrator|specialist|supervisor)\b/i;
const LOCATION_RE = /\b(remote|hybrid|onsite|[A-Z][a-z]+,\s*[A-Z]{2})\b/;

export function buildSourceResumeOutline(resumeText: string): SourceResumeOutline {
  const lines = normalizeResumeLines(resumeText);
  const positions = extractStructuredPositions(lines);

  if (positions.length > 0) {
    return {
      positions,
      total_bullets: positions.reduce((sum, position) => sum + position.bullets.length, 0),
      parse_mode: 'structured',
    };
  }

  const bulletLines = lines
    .filter((line) => BULLET_PREFIX_RE.test(line))
    .map((line) => stripBulletPrefix(line));

  if (bulletLines.length > 0) {
    return {
      positions: [{
        company: 'Prior Experience',
        title: 'Career Experience',
        start_date: '',
        end_date: '',
        bullets: bulletLines,
      }],
      total_bullets: bulletLines.length,
      parse_mode: 'generic',
    };
  }

  return {
    positions: [],
    total_bullets: 0,
    parse_mode: 'generic',
  };
}

export function mergeCandidateExperienceWithSourceOutline(
  parsedExperience: CandidateExperience[],
  sourceOutline: SourceResumeOutline,
): CandidateExperience[] {
  const parsed = Array.isArray(parsedExperience) ? parsedExperience : [];
  const sourcePositions = sourceOutline.positions ?? [];

  if (sourcePositions.length === 0) return parsed;
  if (sourceOutline.parse_mode === 'generic' && parsed.length > 1) return parsed;

  const merged: CandidateExperience[] = [];
  const usedParsed = new Set<number>();

  for (const sourcePosition of sourcePositions) {
    const matchIndex = findBestMatchIndex(sourcePosition, parsed, usedParsed);
    const matched = matchIndex >= 0 ? parsed[matchIndex] : undefined;
    if (matchIndex >= 0) usedParsed.add(matchIndex);

    const combinedBullets = mergeBulletLists(sourcePosition.bullets, matched?.bullets ?? []);

    merged.push({
      company: matched?.company || sourcePosition.company,
      title: matched?.title || sourcePosition.title,
      start_date: matched?.start_date || sourcePosition.start_date,
      end_date: matched?.end_date || sourcePosition.end_date,
      bullets: combinedBullets,
      inferred_scope: matched?.inferred_scope ?? {},
    });
  }

  parsed.forEach((entry, index) => {
    if (!usedParsed.has(index)) {
      merged.push(entry);
    }
  });

  return merged;
}

export function getAuthoritativeSourceExperience(
  candidate: { experience?: CandidateExperience[]; source_resume_outline?: SourceResumeOutline },
): CandidateExperience[] {
  const outline = candidate.source_resume_outline;
  if (outline && outline.positions.length > 0) {
    return mergeCandidateExperienceWithSourceOutline(candidate.experience ?? [], outline);
  }
  return candidate.experience ?? [];
}

function normalizeResumeLines(resumeText: string): string[] {
  let text = resumeText.replace(/\r/g, '');

  // Wall-of-text fix: if fewer than 5 newlines in 1000+ chars, the text lost
  // line breaks during PDF paste. Split on triple-spaces and bullet chars.
  const newlineCount = (text.match(/\n/g) || []).length;
  if (text.length > 1000 && newlineCount < 5) {
    // Insert newlines before any non-alphanumeric bullet-like char followed by uppercase
    text = text.replace(/\s{3,}/g, '\n');
    text = text.replace(/([.!?])\s+([A-Z])/g, '$1\n$2');
  }

  const rawLines = text.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Merge lone bullet-character lines with the next line.
  // PDF extraction often puts ● or • on its own line with the text on the next.
  const merged: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    // A line is a "lone bullet" if it's 1-2 chars and is NOT alphanumeric
    if (line.length <= 2 && /[^\w\s]/.test(line) && i + 1 < rawLines.length) {
      merged.push(`${line} ${rawLines[i + 1]}`);
      i++; // skip next line since we merged it
    } else {
      merged.push(line);
    }
  }

  return merged;
}

function extractStructuredPositions(lines: string[]): SourceResumePosition[] {
  const positions: SourceResumePosition[] = [];
  let current: SourceResumePosition | null = null;
  let inExperienceSection = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isSectionHeading(line)) {
      if (isExperienceHeading(line)) {
        inExperienceSection = true;
      } else {
        if (current) {
          positions.push(cleanPosition(current));
          current = null;
        }
        inExperienceSection = false;
      }
      continue;
    }

    const parsedHeader = parsePositionHeader(lines, i, inExperienceSection);
    if (parsedHeader) {
      if (current) positions.push(cleanPosition(current));
      current = parsedHeader.position;
      i = parsedHeader.nextIndex;
      inExperienceSection = true;
      continue;
    }

    if (!current || (!inExperienceSection && positions.length === 0)) {
      continue;
    }

    if (shouldIgnoreSupportingLine(line)) {
      continue;
    }

    if (BULLET_PREFIX_RE.test(line)) {
      current.bullets.push(stripBulletPrefix(line));
      continue;
    }

    if (!isSectionHeading(line) && !DATE_RANGE_RE.test(line)) {
      current.bullets.push(line);
    }
  }

  if (current) positions.push(cleanPosition(current));

  return positions.filter((position) => {
    return Boolean(position.company || position.title || position.bullets.length > 0);
  });
}

function parsePositionHeader(
  lines: string[],
  index: number,
  inExperienceSection: boolean,
): { position: SourceResumePosition; nextIndex: number } | null {
  const line = lines[index];
  const nextLine = lines[index + 1];
  const nextNextLine = lines[index + 2];

  // Bullet lines can precede a real role header; never reinterpret them as headers.
  if (BULLET_PREFIX_RE.test(line)) {
    return null;
  }

  if (DATE_RANGE_RE.test(line) && looksLikeRoleContext(line, nextLine, inExperienceSection)) {
    return {
      position: buildPositionFromHeader(line),
      nextIndex: index,
    };
  }

  if (
    nextLine
    && DATE_RANGE_RE.test(nextLine)
    && looksLikeRoleContext(line, nextNextLine, inExperienceSection)
  ) {
    return {
      position: buildPositionFromHeader(`${line} | ${nextLine}`),
      nextIndex: index + 1,
    };
  }

  return null;
}

function buildPositionFromHeader(header: string): SourceResumePosition {
  const dateMatch = header.match(DATE_RANGE_RE);
  const start_date = dateMatch?.[1]?.trim() ?? '';
  const end_date = dateMatch?.[2]?.trim() ?? '';
  const headerWithoutDates = header.replace(DATE_RANGE_RE, '').replace(/\s+[|•]\s*$/, '').trim();
  const parts = headerWithoutDates
    .split(/\s+[|•]\s+|\s+@\s+|\s+at\s+|\s+[-–—]\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !LOCATION_RE.test(part));

  const titledParts = parts.filter((part) => TITLE_HINT_RE.test(part));
  const title = titledParts[0] ?? parts[0] ?? 'Role';
  const company = parts.find((part) => part !== title) ?? (parts.length > 1 ? parts[1] : 'Prior Experience');

  return {
    company,
    title,
    start_date,
    end_date,
    bullets: [],
    raw_heading: header,
  };
}

function looksLikeRoleContext(
  headerLine: string,
  followingLine: string | undefined,
  inExperienceSection: boolean,
): boolean {
  if (inExperienceSection) return true;
  if (TITLE_HINT_RE.test(headerLine)) return true;
  if (followingLine && (BULLET_PREFIX_RE.test(followingLine) || TITLE_HINT_RE.test(followingLine))) return true;
  return false;
}

function shouldIgnoreSupportingLine(line: string): boolean {
  if (isSectionHeading(line)) return true;
  if (line.length <= 3) return true;
  if (LOCATION_RE.test(line) && line.split(/\s+/).length <= 4) return true;
  // Contact info blocks that repeat mid-resume (common in multi-page PDFs)
  if (/@/.test(line) && /\d{3}/.test(line) && line.length < 120) return true;
  return false;
}

function stripBulletPrefix(line: string): string {
  return line.replace(BULLET_PREFIX_RE, '').trim();
}

function cleanPosition(position: SourceResumePosition): SourceResumePosition {
  return {
    ...position,
    company: position.company.trim(),
    title: position.title.trim(),
    start_date: position.start_date.trim(),
    end_date: position.end_date.trim(),
    bullets: mergeBulletLists(position.bullets, []),
  };
}

function mergeBulletLists(primary: string[], secondary: string[]): string[] {
  // Combine both lists, keeping the longest version of each bullet when
  // one is a substring of another (common when LLM truncates source bullets).
  const all = [...primary, ...secondary]
    .map((b) => b.trim())
    .filter(Boolean);

  const result: string[] = [];

  for (const bullet of all) {
    const lower = bullet.toLowerCase();
    // Check if this bullet is already covered by a longer existing bullet
    const coveredBy = result.findIndex((existing) =>
      existing.toLowerCase().includes(lower),
    );
    if (coveredBy >= 0) continue; // existing bullet already contains this one

    // Check if this bullet covers (is longer than) an existing bullet
    const covers = result.findIndex((existing) =>
      lower.includes(existing.toLowerCase()),
    );
    if (covers >= 0) {
      result[covers] = bullet; // replace with longer version
      continue;
    }

    result.push(bullet);
  }

  return result;
}

function findBestMatchIndex(
  sourcePosition: SourceResumePosition,
  parsed: CandidateExperience[],
  usedParsed: Set<number>,
): number {
  const sourceKey = normalizePositionKey(sourcePosition.company, sourcePosition.title);
  const sourceDateKey = `${sourcePosition.start_date}|${sourcePosition.end_date}`;

  for (let index = 0; index < parsed.length; index += 1) {
    if (usedParsed.has(index)) continue;
    const candidate = parsed[index];
    const candidateKey = normalizePositionKey(candidate.company, candidate.title);
    if (sourceKey && candidateKey && (sourceKey === candidateKey || sourceKey.includes(candidateKey) || candidateKey.includes(sourceKey))) {
      return index;
    }
    const candidateDateKey = `${candidate.start_date}|${candidate.end_date}`;
    if (sourceDateKey !== '|' && sourceDateKey === candidateDateKey) {
      return index;
    }
  }

  return -1;
}

function normalizePositionKey(company: string, title: string): string {
  return `${company}::${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
