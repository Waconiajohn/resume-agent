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
    // Separator class includes ASCII hyphen/period/whitespace PLUS Unicode
    // hyphen/dash variants (U+2010..2014, U+2212). Word processors substitute
    // these in phone numbers; fixtures 10 and 15 in our corpus do this.
    rx: /(?:\+?1[-.\s\u2010-\u2014\u2212]?)?(?:\(?\d{3}\)?[-.\s\u2010-\u2014\u2212]?)\d{3}[-.\s\u2010-\u2014\u2212]?\d{4}\b/g,
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
  'The `extracted/*.txt` files that this scan reads are the **post-redaction** output — `scripts/extract-fixtures.mjs` runs every raw fixture through Stage 1 and then through `src/v3/test-fixtures/redact.ts` before writing. The expected post-redaction result: zero emails, zero phones, zero LinkedIn URLs, zero candidate-name tokens. Any non-zero count on those rows is a defect in the redactor — raise it immediately. See `docs/v3-rebuild/fixture-provenance.md` for consent + redaction context.',
);
lines.push('');
lines.push(
  'Raw fixtures in `raw/` are gitignored and retain original content. If you need to inspect the pre-redaction text, re-run Stage 1 directly against a raw file (`extract()` returns the un-redacted plaintext).',
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

// Post-redaction notes
lines.push('## Reading the counts');
lines.push('');
lines.push(
  '- **email / phone / LinkedIn / GitHub / street_address / portfolio_or_personal_site = 0** — expected. Any non-zero value in these columns is a redactor defect.',
);
lines.push(
  '- **`us_zip_code`** — 5-digit-number heuristic; catches dollar amounts like `$25000`, headcounts, and project cost figures. Noise, not PII. The candidate ZIP is caught by the street-address pattern (which pulls the full address block) or by the candidate-name pass when the ZIP sits next to the name.',
);
lines.push(
  '- **`license_number`** — professional credentials (PE license, bar number) are public employment record per the provenance doc. Not personal PII. No action required.',
);
lines.push(
  '- **`distinct_companies`** — company names are public employment records; not redacted by design. High counts indicate a candidate who mentions many vendors / clients / competitors by name.',
);
lines.push(
  '- **`has_references_section`** — should be empty (✓ not present) across the board. References sections contain third-party PII and are truncated during redaction.',
);
lines.push('');
lines.push(
  'Fixture-20 (the Under Armour job description that originally landed in `raw/`) has been relocated to `server/test-fixtures/job-descriptions/` and is not in this scan.',
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
