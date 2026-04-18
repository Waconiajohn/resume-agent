// Fixture PII redaction utility.
// MECHANICAL only — no semantic judgment. Used exclusively to scrub
// candidate contact PII from extracted fixture text before the text is
// committed or fed to Phase 3+ stages. The production pipeline does NOT
// redact — real users want their contact info parsed out. This lives in
// server/src/v3/test-fixtures/ to make that distinction explicit.
//
// Inputs: extracted plaintext + the candidate's known name (from meta YAML).
// Outputs: redacted text, per-kind counts, and any residual warnings.
//
// What gets redacted:
//   - candidate_name full match and per-token matches (first, last, each
//     additional form), with word boundaries
//   - email addresses
//   - US-format phone numbers (several formats)
//   - LinkedIn profile URLs
//   - GitHub profile URLs that name the candidate
//   - personal portfolio URLs (bare-domain or https://) that name the candidate
//   - street addresses (numeric-prefixed + street suffix)
//   - References section (everything from the header to end of file)
//
// What does NOT get redacted:
//   - city/state strings ("Minneapolis, MN") — location context matters
//   - company names — public employment record
//   - school names
//   - the candidate's name embedded in a personal-business name like
//     "Jane Smith Consulting LLC" (handled case-by-case via opt-out in meta
//     via `redact_skip_tokens`)
//
// See OPERATING-MANUAL.md §"No silent fallbacks": residual warnings surface
// in the return value; they do NOT mutate the output quietly.

export interface RedactOptions {
  candidateName: string;                 // e.g. "Ben Wedewer"
  additionalNameForms?: string[];        // e.g. ["Benjamin Wedewer"]
  redactSkipTokens?: string[];           // per-fixture escape hatch for short/ambiguous tokens
}

export interface RedactionCount {
  kind:
    | 'full_name'
    | 'name_token'
    | 'email'
    | 'phone'
    | 'linkedin_url'
    | 'github_url'
    | 'personal_site'
    | 'street_address'
    | 'references_section';
  count: number;
  detail?: string;       // e.g. which name token
}

export interface RedactResult {
  redacted: string;
  redactions: RedactionCount[];
  residualWarnings: string[];
}

// -----------------------------------------------------------------------------
// Pattern constants (mechanical)
// -----------------------------------------------------------------------------

const EMAIL_RX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Matches US phone formats seen in the corpus:
// (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +1 xxx.xxx.xxxx, xxx xxx-xxxx.
// Separator characters include ASCII hyphen, period, whitespace, AND Unicode
// hyphen/dash variants (U+2010..2014, U+2212) that word processors emit —
// fixture-10 and fixture-15 use U+2011 non-breaking hyphens. Requires an
// area-code group, so 4-digit-only numbers inside bullets don't false-match.
const PHONE_RX =
  /(?:\+?1[-.\s\u2010-\u2014\u2212]?)?(?:\(\d{3}\)\s?|\d{3}[-.\s\u2010-\u2014\u2212])\d{3}[-.\s\u2010-\u2014\u2212]\d{4}\b/g;

const LINKEDIN_RX = /\[?(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9._%+/-]+\]?(?:\([^)]*\))?/gi;

const GITHUB_RX = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9._-]+/gi;

const STREET_ADDRESS_RX =
  /\b\d{1,6}\s+[A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,4}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ct|Court|Way|Ln|Lane|Pl|Place|Pkwy|Parkway|Hwy|Highway|Ter|Terrace)\b\.?/g;

// "References" heading in any of the markdown variants seen in the corpus.
const REFERENCES_HEADER_RX =
  /^\s*(?:__|#+|\*+)?[_*\s]*References[_*\s]*(?:__|#+|\*+)?\s*$/im;

// Letter-only word boundaries. Using these instead of \b means `_`, `*`,
// digits, and other non-letter chars all count as boundaries — so
// markdown emphasis like "__Diana Downs__" does not block the match.
const LETTER_BOUNDARY_LEFT = '(?<=^|[^A-Za-z])';
const LETTER_BOUNDARY_RIGHT = '(?=[^A-Za-z]|$)';

// Tokens that are too risky to redact standalone — initials, common suffixes,
// academic/credential markers, etc. Augmented by meta's redact_skip_tokens.
const DEFAULT_SKIP_TOKENS = new Set([
  'jr', 'sr', 'ii', 'iii', 'iv',
  'phd', 'mba', 'ms', 'ma', 'ba', 'bs',
  'pmp', 'cpa', 'md', 'do', 'rn', 'pe',
]);

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

export function redactFixture(
  input: string,
  options: RedactOptions,
): RedactResult {
  const redactions: RedactionCount[] = [];
  const residualWarnings: string[] = [];

  let text = input;

  // 1. Strip References section wholesale — third-party PII.
  {
    const match = REFERENCES_HEADER_RX.exec(text);
    if (match) {
      const before = text.slice(0, match.index).trimEnd();
      text = before + '\n';
      redactions.push({ kind: 'references_section', count: 1 });
    }
  }

  // 2. Regex-based PII categories.
  text = countAndReplace(text, EMAIL_RX, '[REDACTED EMAIL]', 'email', redactions);
  text = countAndReplace(text, PHONE_RX, '[REDACTED PHONE]', 'phone', redactions);
  text = countAndReplace(text, STREET_ADDRESS_RX, '[REDACTED ADDRESS]', 'street_address', redactions);
  text = countAndReplace(text, LINKEDIN_RX, '[REDACTED LINKEDIN]', 'linkedin_url', redactions);

  // 3. Candidate-name-aware URLs. GitHub and personal sites get redacted
  //    only when they contain a name token; this avoids over-matching an
  //    employer's company.github.com or a generic portfolio host.
  const nameTokens = deriveNameTokens(
    options.candidateName,
    options.additionalNameForms ?? [],
    options.redactSkipTokens ?? [],
  );

  // GitHub profile URLs — full domain match because every github.com/<handle>
  // in a resume header is the candidate's own handle, in practice.
  text = countAndReplace(text, GITHUB_RX, '[REDACTED URL]', 'github_url', redactions);

  // Personal site URLs that mention any name token — most candidates link a
  // portfolio at firstname-lastname.domain or similar. We look for bare
  // hostnames that contain a name token and replace the full URL.
  text = redactPersonalSites(text, nameTokens, redactions);

  // 4. Candidate name: redact full forms first, then per-token.
  //    We use explicit letter-only boundaries (not \b) because \b treats
  //    `_` and digits as word chars, which means "__Diana Downs__"
  //    markdown emphasis prevents \bDiana\b from matching. Letter-only
  //    boundaries consider `_` a boundary, which is what we want.
  text = redactName(text, options.candidateName, redactions);
  for (const form of options.additionalNameForms ?? []) {
    text = redactName(text, form, redactions);
  }
  for (const token of nameTokens) {
    const rx = new RegExp(
      `${LETTER_BOUNDARY_LEFT}${escapeRx(token)}${LETTER_BOUNDARY_RIGHT}`,
      'gi',
    );
    const matches = text.match(rx) ?? [];
    if (matches.length > 0) {
      text = text.replace(rx, '[REDACTED NAME]');
      redactions.push({ kind: 'name_token', count: matches.length, detail: token });
    }
  }

  // 5. Residual scan: after redaction, check that no email/phone/linkedin
  //    regex still matches. If something leaks (e.g., a PII class we didn't
  //    handle or a pattern variant we missed), surface a warning rather than
  //    silently shipping it.
  const residualEmail = text.match(EMAIL_RX) ?? [];
  const residualPhone = text.match(PHONE_RX) ?? [];
  const residualLinkedin = text.match(LINKEDIN_RX) ?? [];

  if (residualEmail.length > 0) {
    residualWarnings.push(
      `possible email leak: ${residualEmail.length} match(es) after redaction`,
    );
  }
  if (residualPhone.length > 0) {
    residualWarnings.push(
      `possible phone leak: ${residualPhone.length} match(es) after redaction`,
    );
  }
  if (residualLinkedin.length > 0) {
    residualWarnings.push(
      `possible linkedin leak: ${residualLinkedin.length} match(es) after redaction`,
    );
  }

  return { redacted: text, redactions, residualWarnings };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function countAndReplace(
  text: string,
  rx: RegExp,
  replacement: string,
  kind: RedactionCount['kind'],
  bag: RedactionCount[],
): string {
  const matches = text.match(rx) ?? [];
  if (matches.length === 0) return text;
  const out = text.replace(rx, replacement);
  bag.push({ kind, count: matches.length });
  return out;
}

function deriveNameTokens(
  canonical: string,
  additional: string[],
  extraSkip: string[],
): string[] {
  const skip = new Set<string>(DEFAULT_SKIP_TOKENS);
  for (const s of extraSkip) skip.add(s.toLowerCase());

  const raw = [canonical, ...additional].flatMap((n) => n.split(/\s+/));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw) {
    const cleaned = tok.replace(/[^A-Za-z'-]/g, '');
    if (cleaned.length < 3) continue;               // skip initials, "R.", etc.
    if (skip.has(cleaned.toLowerCase())) continue;
    if (seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    out.push(cleaned);
  }
  return out;
}

function redactName(
  text: string,
  name: string,
  bag: RedactionCount[],
): string {
  // Case-insensitive; letter-only boundaries (see LETTER_BOUNDARY_* above).
  // Allow flexible whitespace between tokens so "Ben  Wedewer" and
  // "Ben\nWedewer" both match.
  const tokens = name.split(/\s+/).map(escapeRx);
  if (tokens.length === 0) return text;
  const rx = new RegExp(
    `${LETTER_BOUNDARY_LEFT}${tokens.join('[\\s]+')}${LETTER_BOUNDARY_RIGHT}`,
    'gi',
  );
  const matches = text.match(rx) ?? [];
  if (matches.length === 0) return text;
  bag.push({ kind: 'full_name', count: matches.length, detail: name });
  return text.replace(rx, '[REDACTED NAME]');
}

function redactPersonalSites(
  text: string,
  nameTokens: string[],
  bag: RedactionCount[],
): string {
  if (nameTokens.length === 0) return text;
  // Look for URL-ish tokens containing any name token. Supports both
  // "https://firstname-lastname.design" and bare "firstname.design".
  // We do not redact URLs whose hostname does NOT contain a name token —
  // those might be employer domains or public references.
  let out = text;
  let count = 0;
  const TLDS = 'design|me|dev|io|studio|works|page|site|co|net|app|tech|com|org';
  const urlRx = new RegExp(
    String.raw`(?:\bhttps?:\/\/)?(?:[a-zA-Z0-9-]+\.)*([a-zA-Z0-9-]+)\.(?:${TLDS})\b(?:\/[^\s)]*)?`,
    'gi',
  );
  out = out.replace(urlRx, (match, host: string) => {
    const hostLower = host.toLowerCase();
    const hit = nameTokens.some(
      (tok) => tok.length >= 3 && hostLower.includes(tok.toLowerCase()),
    );
    if (!hit) return match;
    count += 1;
    return '[REDACTED URL]';
  });
  if (count > 0) bag.push({ kind: 'personal_site', count });
  return out;
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
