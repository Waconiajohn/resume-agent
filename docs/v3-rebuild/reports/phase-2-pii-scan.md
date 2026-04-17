# Phase 2 — PII Scan Report

**Generated:** 2026-04-17
**Fixtures scanned:** 19

## Scope & safety

This report describes PII found in the Phase 2 fixture corpus by **kind and count** — not by content. No actual email addresses, phone numbers, names, or addresses appear in this document. The counts tell the human *what is present*; they do not expose *what the values are*. This file is safe to commit.

The `extracted/*.txt` files that this scan reads are the **post-redaction** output — `scripts/extract-fixtures.mjs` runs every raw fixture through Stage 1 and then through `src/v3/test-fixtures/redact.ts` before writing. The expected post-redaction result: zero emails, zero phones, zero LinkedIn URLs, zero candidate-name tokens. Any non-zero count on those rows is a defect in the redactor — raise it immediately. See `docs/v3-rebuild/fixture-provenance.md` for consent + redaction context.

Raw fixtures in `raw/` are gitignored and retain original content. If you need to inspect the pre-redaction text, re-run Stage 1 directly against a raw file (`extract()` returns the un-redacted plaintext).

## Method

Regex patterns scan `server/test-fixtures/resumes/extracted/*.txt`. Patterns are mechanical (email shape, phone shape, street-suffix tokens, license markers, URL hosts). No LLM; no semantic judgment. Patterns may over-match (e.g., every 5-digit number looks like a ZIP code) — take the high counts as a hint to review the file rather than proof a value is present.

Kinds tracked:

- `email` — one or more email addresses present.
- `phone_us` — US-formatted phone numbers.
- `street_address` — numeric-prefixed token followed by a street suffix.
- `linkedin_url`, `github_url` — profile handles.
- `portfolio_or_personal_site` — non-LI/GH URL likely to be a personal site.
- `us_zip_code` — five-digit ZIP candidates (noisy).
- `license_number` — explicit "License #" markers (e.g., PE license).
- `distinct_companies` — distinct capitalized company-like tokens (Inc/LLC/Corp/Systems/etc.).
- `has_references_section` — a top-level "References" heading, which typically contains third-party PII.

## Per-fixture counts

Fixtures are listed by number only. Full slugs (e.g. `fixture-01-<surname>-...`) live in gitignored `meta/` and `extracted/` paths locally; they are intentionally not reproduced here so this report stays name-anonymous.

| # | email | phone | addr | LI | GH | site | ZIP | lic | cos | refs |
|---|-------|-------|------|----|----|------|-----|-----|-----|------|
| 01 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 02 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2 |  |
| 03 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |  |
| 04 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |  |
| 05 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 06 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |  |
| 07 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |  |
| 08 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 |  |
| 09 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |  |
| 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 |  |
| 12 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 3 |  |
| 13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |  |
| 14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |  |
| 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |  |
| 16 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 2 |  |
| 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |  |
| 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| 19 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |  |

## Totals across all fixtures

- **email**: 0
- **phone_us**: 0
- **street_address**: 0
- **linkedin_url**: 0
- **github_url**: 0
- **portfolio_or_personal_site**: 0
- **us_zip_code**: 10
- **license_number**: 1
- **distinct_companies (sum across fixtures)**: 31
- **fixtures with a References section**: 0

## Reading the counts

- **email / phone / LinkedIn / GitHub / street_address / portfolio_or_personal_site = 0** — expected. Any non-zero value in these columns is a redactor defect.
- **`us_zip_code`** — 5-digit-number heuristic; catches dollar amounts like `$25000`, headcounts, and project cost figures. Noise, not PII. The candidate ZIP is caught by the street-address pattern (which pulls the full address block) or by the candidate-name pass when the ZIP sits next to the name.
- **`license_number`** — professional credentials (PE license, bar number) are public employment record per the provenance doc. Not personal PII. No action required.
- **`distinct_companies`** — company names are public employment records; not redacted by design. High counts indicate a candidate who mentions many vendors / clients / competitors by name.
- **`has_references_section`** — should be empty (✓ not present) across the board. References sections contain third-party PII and are truncated during redaction.

Fixture-20 (the Under Armour job description that originally landed in `raw/`) has been relocated to `server/test-fixtures/job-descriptions/` and is not in this scan.

