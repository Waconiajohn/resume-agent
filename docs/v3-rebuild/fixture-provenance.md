# Fixture Provenance

**Scope:** `server/test-fixtures/resumes/` and `server/test-fixtures/job-descriptions/`
**Established:** 2026-04-18

## Consent

All 20 fixtures in the Phase 2 corpus were sourced from CareerIQ customers who agreed to a Terms of Service that permits product-improvement use of submitted materials. Consent is confirmed at the account level; this is not a narrow per-document grant.

- **19 resume fixtures** at `server/test-fixtures/resumes/raw/` — candidate resumes.
- **1 job description fixture** at `server/test-fixtures/job-descriptions/raw/` — relocated from the original resumes corpus in Phase 2.1 because the classify stage must not treat a JD as a resume. See `server/test-fixtures/job-descriptions/README.md`.

## Redaction (defense in depth)

Candidate contact PII is scrubbed from the `extracted/*.txt` that every downstream phase reads. Redaction is a fixture-corpus hardening step — **the production pipeline does not redact**, because real users want their contact info parsed out by Stage 2 (Classify) into the `contact` field of `StructuredResume`.

Kinds redacted:

- Full candidate name (and first/last/initial tokens) → `[REDACTED NAME]`
- Email addresses → `[REDACTED EMAIL]`
- Phone numbers, all common US formats → `[REDACTED PHONE]`
- Street addresses (when present) → `[REDACTED ADDRESS]`
- `linkedin.com/in/<handle>` URLs → `[REDACTED LINKEDIN]`
- `github.com/<handle>` URLs and personal portfolio domains that name the candidate → `[REDACTED URL]`
- Third-party References sections (fixture-19 had 11 external contacts) — truncated at the header.

Kinds intentionally **not** redacted:

- City / state (location context matters for Stage 2 discipline inference)
- Company names the candidate worked for — public employment record
- School names — public credential
- Professional licenses (e.g., PE license numbers) — public credential

The redactor lives at `server/src/v3/test-fixtures/redact.ts`. It is pure mechanical regex; see the file's header comment for the full rule set. Unit tests at `server/src/__tests__/v3/redact.test.ts` cover email/phone/LinkedIn/GitHub/name/emphasis/References behavior.

Redaction runs as part of `scripts/extract-fixtures.mjs` — every fixture goes `raw.docx → Stage 1 extract() → redactFixture(...) → extracted/<slug>.txt`. The script fails loudly if a fixture's meta YAML is missing or doesn't carry `candidate_name`.

## What's in git and what isn't

**Gitignored** (local only; `raw/` files retain original content):

- `server/test-fixtures/resumes/raw/`
- `server/test-fixtures/resumes/meta/`
- `server/test-fixtures/resumes/extracted/`
- `server/test-fixtures/resumes/fixture-map.json`
- `server/test-fixtures/job-descriptions/raw/`
- `server/test-fixtures/job-descriptions/meta/`
- `server/test-fixtures/job-descriptions/extracted/`
- `server/test-fixtures/snapshots/`

**Tracked:**

- `server/test-fixtures/resumes/README.md` — fixture layout conventions.
- `server/test-fixtures/job-descriptions/README.md` — JD corpus conventions.
- All v3 code (`src/v3/`), the redactor, the tests, the scripts.
- `docs/v3-rebuild/reports/phase-2-pii-scan.md` — post-redaction counts; name-anonymous.
- This document.

## Post-redaction invariant

`npm run fixtures` followed by `node scripts/pii-scan.mjs` must produce a scan report with `email = 0`, `phone_us = 0`, `linkedin_url = 0`, `github_url = 0`, `street_address = 0`, `portfolio_or_personal_site = 0`, and zero fixtures with a References section. Any non-zero value is a redactor defect — fix upstream (the redactor), do not add exceptions to the scan or to the extracted text.

`us_zip_code` and `license_number` may be non-zero without concern — the former is a 5-digit-number heuristic that matches dollar amounts; the latter is professional licensing, which is public record.

## If a candidate later revokes consent

Delete their file from `raw/`, delete their `meta/<slug>.yaml`, and delete their `extracted/<slug>.txt`. Re-run `npm run fixtures`. Their fixture is gone from the corpus within seconds. No rewriting of snapshots is required because snapshots in `test-fixtures/snapshots/` are already gitignored and only regenerate on demand from the fixtures present at run time.

## Phase 3 notes

When Stage 2 (Classify) runs against these fixtures, its output for `contact.email`, `contact.phone`, and `contact.linkedin` will be literal `[REDACTED EMAIL]`, `[REDACTED PHONE]`, `[REDACTED LINKEDIN]` strings. That is expected and not a defect — we are testing semantic parsing of resume *content*, not contact extraction. The `[REDACTED …]` tokens in classify output pass through into strategy and write; verify should not flag them as leftover template placeholders (add a specific allowance if needed).
