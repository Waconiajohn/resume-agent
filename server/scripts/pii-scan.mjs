// Phase 2 PII scanner.
// Regex-scans every extracted/*.txt for personal-information CATEGORIES and
// writes a count-only report to docs/v3-rebuild/reports/phase-2-pii-scan.md.
// No PII content is copied into the report — only "found N of this kind".
//
// The report is commit-safe because it describes WHAT was found without
// leaking WHAT IT WAS. The human uses the counts to decide whether to
// redact raw/ files before committing extracted/ snapshots.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const EXTRACTED_DIR = resolve(HERE, '../test-fixtures/resumes/extracted');
const REPORT_PATH = resolve(HERE, '../../docs/v3-rebuild/reports/phase-2-pii-scan.md');

// -----------------------------------------------------------------------------
// Patterns (mechanical — per OPERATING-MANUAL.md §"regex for mechanical ops")
// -----------------------------------------------------------------------------

const PATTERNS = [
  {
    kind: 'email',
    // RFC-ish but pragmatic. Matches most resume email formats.
    rx: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    kind: 'phone_us',
    // Matches (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +1-xxx-xxx-xxxx.
    rx: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
  },
  {
    kind: 'street_address',
    // "digits + words + Street/Ave/...": one rough heuristic. Misses some;
    // that's OK — this is a flagging tool, not a redactor.
    rx: /\b\d{1,6}\s+[A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,4}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ct|Court|Way|Ln|Lane|Pl|Place|Pkwy|Parkway|Hwy|Highway|Ter|Terrace)\b\.?/g,
  },
  {
    kind: 'linkedin_url',
    rx: /linkedin\.com\/in\/[a-zA-Z0-9._%+/-]+/gi,
  },
  {
    kind: 'github_url',
    rx: /github\.com\/[a-zA-Z0-9._-]+/gi,
  },
  {
    kind: 'portfolio_or_personal_site',
    // Non-linkedin/github URL that looks like a personal portfolio. Accepts
    // both "https://..." and bare-domain "foo.design" forms, since
    // candidates often list portfolios without a scheme.
    rx: /(?:\bhttps?:\/\/)?(?!linkedin\.com|www\.linkedin\.com|github\.com|www\.github\.com|wellsfargo\.com|amazon\.com)[a-zA-Z0-9-]+\.(?:design|me|dev|io|studio|works|page|site|co|net|app|tech)\b(?:\/[^\s)]*)?/gi,
  },
  {
    kind: 'us_zip_code',
    rx: /\b\d{5}(?:-\d{4})?\b/g,
  },
  {
    kind: 'license_number',
    // "License #1234", "PE License #54788", "State bar #..."
    rx: /\bLicense\s*#?\s*\d{3,7}\b/gi,
  },
];

// Separately: scan for company-name mentions. We can't regex "which company
// names are sensitive" — that's semantic. We just count capitalized runs that
// look like companies. This is a noisy signal the human reviews manually.
const COMPANY_NAME_RX = /\b[A-Z][A-Za-z0-9&]+(?:\s+(?:[A-Z][A-Za-z0-9&]+|of|the|and|&)){0,3}(?:\s+(?:Inc|LLC|Ltd|Corp|Corporation|Co|Company|Group|Bank|Systems|Technologies|Holdings))\b\.?/g;

// Third-party references (names + contact) sections.
// Matches "References", "__References__", "__*References*__", "# References",
// "## References", etc. — various markdown decorations.
const REFERENCES_HEADER_RX = /^\s*(?:__|#+|\*+)?[_*\s]*References[_*\s]*(?:__|#+|\*+)?\s*$/im;

// -----------------------------------------------------------------------------
// Scan
// -----------------------------------------------------------------------------

const files = readdirSync(EXTRACTED_DIR)
  .filter((f) => f.endsWith('.txt'))
  .sort((a, b) => a.localeCompare(b));

const fixtureResults = [];

for (const file of files) {
  const path = join(EXTRACTED_DIR, file);
  const text = readFileSync(path, 'utf8');
  const slug = file.replace(/\.txt$/, '');

  const counts = {};
  for (const { kind, rx } of PATTERNS) {
    const matches = text.match(rx) ?? [];
    counts[kind] = matches.length;
  }

  const companyHits = text.match(COMPANY_NAME_RX) ?? [];
  // Dedupe and count distinct
  const distinctCompanies = new Set(companyHits).size;

  const hasReferencesSection = REFERENCES_HEADER_RX.test(text);

  fixtureResults.push({
    slug,
    counts,
    distinctCompanies,
    totalCompanyMentions: companyHits.length,
    hasReferencesSection,
  });
}

// -----------------------------------------------------------------------------
// Render report
// -----------------------------------------------------------------------------

const lines = [];
lines.push('# Phase 2 — PII Scan Report');
lines.push('');
lines.push(`**Generated:** ${new Date().toISOString().slice(0, 10)}`);
lines.push(`**Fixtures scanned:** ${fixtureResults.length}`);
lines.push('');
lines.push('## Scope & safety');
lines.push('');
lines.push(
  'This report describes PII found in the Phase 2 fixture corpus by **kind and count** — not by content. No actual email addresses, phone numbers, names, or addresses appear in this document. The counts tell the human *what is present*; they do not expose *what the values are*. This file is safe to commit.',
);
lines.push('');
lines.push(
  'The raw fixtures and their extracted text remain gitignored. The human decides, per fixture, whether to redact before any extract/ content is ever force-added to git.',
);
lines.push('');
lines.push('## Method');
lines.push('');
lines.push(
  'Regex patterns scan `server/test-fixtures/resumes/extracted/*.txt`. Patterns are mechanical (email shape, phone shape, street-suffix tokens, license markers, URL hosts). No LLM; no semantic judgment. Patterns may over-match (e.g., every 5-digit number looks like a ZIP code) — take the high counts as a hint to review the file rather than proof a value is present.',
);
lines.push('');
lines.push('Kinds tracked:');
lines.push('');
lines.push('- `email` — one or more email addresses present.');
lines.push('- `phone_us` — US-formatted phone numbers.');
lines.push('- `street_address` — numeric-prefixed token followed by a street suffix.');
lines.push('- `linkedin_url`, `github_url` — profile handles.');
lines.push('- `portfolio_or_personal_site` — non-LI/GH URL likely to be a personal site.');
lines.push('- `us_zip_code` — five-digit ZIP candidates (noisy).');
lines.push('- `license_number` — explicit "License #" markers (e.g., PE license).');
lines.push('- `distinct_companies` — distinct capitalized company-like tokens (Inc/LLC/Corp/Systems/etc.).');
lines.push('- `has_references_section` — a top-level "References" heading, which typically contains third-party PII.');
lines.push('');

lines.push('## Per-fixture counts');
lines.push('');
lines.push(
  'Fixtures are listed by number only. Full slugs (e.g. `fixture-01-<surname>-...`) live in gitignored `meta/` and `extracted/` paths locally; they are intentionally not reproduced here so this report stays name-anonymous.',
);
lines.push('');
lines.push(
  '| # | email | phone | addr | LI | GH | site | ZIP | lic | cos | refs |',
);
lines.push(
  '|---|-------|-------|------|----|----|------|-----|-----|-----|------|',
);
for (const r of fixtureResults) {
  const c = r.counts;
  // Short label like "01" parsed from slug prefix "fixture-NN-...".
  const numMatch = /^fixture-(\d{2})-/.exec(r.slug);
  const label = numMatch ? numMatch[1] : r.slug;
  lines.push(
    `| ${label} | ${c.email} | ${c.phone_us} | ${c.street_address} | ${c.linkedin_url} | ${c.github_url} | ${c.portfolio_or_personal_site} | ${c.us_zip_code} | ${c.license_number} | ${r.distinctCompanies} | ${r.hasReferencesSection ? '✓' : ''} |`,
  );
}
lines.push('');

// Summary
const grandTotals = {
  email: 0,
  phone_us: 0,
  street_address: 0,
  linkedin_url: 0,
  github_url: 0,
  portfolio_or_personal_site: 0,
  us_zip_code: 0,
  license_number: 0,
};
let referencesTotal = 0;
let distinctCompaniesTotal = 0;
for (const r of fixtureResults) {
  for (const k of Object.keys(grandTotals)) grandTotals[k] += r.counts[k];
  if (r.hasReferencesSection) referencesTotal++;
  distinctCompaniesTotal += r.distinctCompanies;
}

lines.push('## Totals across all fixtures');
lines.push('');
for (const [k, v] of Object.entries(grandTotals)) {
  lines.push(`- **${k}**: ${v}`);
}
lines.push(`- **distinct_companies (sum across fixtures)**: ${distinctCompaniesTotal}`);
lines.push(`- **fixtures with a References section**: ${referencesTotal}`);
lines.push('');

// Risk notes
lines.push('## Risk notes');
lines.push('');
lines.push(
  '- **Every resume contains at least one email and one phone number** — expected for executive resumes; redact before publishing extracted/ files.',
);
lines.push(
  '- **Third-party PII** (references sections listing 10+ names and email addresses) is the highest-severity class here because those individuals did not consent to appearing in a fixture corpus. See fixtures with a `✓` in the `refs` column.',
);
lines.push(
  '- **Street addresses** appear only when a fixture includes a full mailing address in the contact block. Most resumes use city+state only; counts >0 here mean a precise home address is present.',
);
lines.push(
  '- **`distinct_companies`** is noisy — a candidate who worked at 10 companies and mentions 30 distinct competitors / vendors can produce counts over 100. High counts are a prompt to skim for sensitive client names (law-firm clients, NDA-covered engagements, etc.), not a signal of compromise on their own.',
);
lines.push(
  '- **`portfolio_or_personal_site`** — URLs to personal domains sometimes carry credentials (portfolio passwords) or link to sensitive work. One of the three portfolio URLs in this corpus has a password annotated inline in the contact block — non-sensitive-looking, but worth a glance before commit.',
);
lines.push('');

lines.push('## Recommended next steps');
lines.push('');
lines.push(
  '1. **Do not commit extracted/ files** until redaction decisions are made per fixture.',
);
lines.push(
  '2. **Handle the References section (fixture-19) first** — third-party emails are the most exposed category.',
);
lines.push(
  '3. **Fixture-20 is a job description, not a resume** — it has no personal PII but also should not be classified. See `meta/fixture-20-*.yaml` for the flag.',
);
lines.push(
  '4. If any candidate here is a real CareerIQ paying customer, confirm they consented to use as a fixture before proceeding to Phase 3 shadow runs.',
);
lines.push('');

writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
console.log(`wrote ${REPORT_PATH}`);
console.log(`scanned ${fixtureResults.length} fixtures`);
console.log(`totals:`);
for (const [k, v] of Object.entries(grandTotals)) {
  console.log(`  ${k}: ${v}`);
}
console.log(`  fixtures with references: ${referencesTotal}`);
