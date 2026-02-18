/**
 * ATS rules shared across the v2 pipeline.
 * These are intentionally concise, machine-checkable constraints that map to
 * the larger formatting guide.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AtsFinding {
  section: string;
  issue: string;
  instruction: string;
  priority: 'high' | 'medium' | 'low';
}

export const ATS_RULEBOOK_SNIPPET = `ATS RULES (MANDATORY):
- Standard section headers only (Professional Summary, Experience, Skills/Core Competencies, Education, Certifications)
- No tables, no columns, no text boxes, no icons/emoji, no decorative symbols
- Keep contact info in body content (not dependent on document header/footer parsing)
- Use plain bullets and straightforward chronology
- Avoid uncommon unicode separators and ornamental punctuation in headings
- Keep language keyword-rich but natural; do not keyword-stuff`;

function loadAtsRulebookExcerpt(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const guidePath = join(currentDir, '..', 'agent', 'resume-formatting-guide.md');
    const raw = readFileSync(guidePath, 'utf8');
    // Keep prompt payload bounded while still including the canonical guide content.
    return raw.slice(0, 12000);
  } catch {
    return ATS_RULEBOOK_SNIPPET;
  }
}

export const ATS_RULEBOOK_PROMPT = `${ATS_RULEBOOK_SNIPPET}

--- BEGIN ATS RULEBOOK EXCERPT ---
${loadAtsRulebookExcerpt()}
--- END ATS RULEBOOK EXCERPT ---`;

const FORBIDDEN_PATTERNS: Array<{ re: RegExp; message: string; section: string; priority: 'high' | 'medium' }> = [
  { re: /\|.{0,40}\|/, message: 'Table-like pipe formatting detected', section: 'formatting', priority: 'high' },
  { re: /[\u2600-\u27BF]/, message: 'Icon/symbol characters detected', section: 'formatting', priority: 'high' },
  { re: /(?:^|\n)\s*Objective\s*$/im, message: 'Objective heading detected; use Professional Summary', section: 'summary', priority: 'medium' },
  { re: /(?:^|\n)\s*Profile\s*$/im, message: 'Non-standard heading "Profile" detected', section: 'summary', priority: 'medium' },
];

const REQUIRED_HEADINGS: Array<{ key: string; re: RegExp }> = [
  { key: 'summary', re: /professional summary/i },
  { key: 'experience', re: /professional experience|experience/i },
  { key: 'skills', re: /core competencies|skills/i },
];

export function runAtsComplianceCheck(fullText: string): AtsFinding[] {
  const findings: AtsFinding[] = [];
  const text = fullText ?? '';

  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.re.test(text)) {
      findings.push({
        section: rule.section,
        issue: rule.message,
        instruction: 'Rewrite the affected content using ATS-safe plain text formatting only.',
        priority: rule.priority,
      });
    }
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!heading.re.test(text)) {
      findings.push({
        section: heading.key,
        issue: `Missing or non-standard ${heading.key} heading`,
        instruction: `Add a standard ATS-safe ${heading.key} section heading and align content under it.`,
        priority: 'medium',
      });
    }
  }

  return findings;
}
