# Phase 2 — PII Scan Report

**Generated:** 2026-04-17
**Fixtures scanned:** 20

## Scope & safety

This report describes PII found in the Phase 2 fixture corpus by **kind and count** — not by content. No actual email addresses, phone numbers, names, or addresses appear in this document. The counts tell the human *what is present*; they do not expose *what the values are*. This file is safe to commit.

The raw fixtures and their extracted text remain gitignored. The human decides, per fixture, whether to redact before any extract/ content is ever force-added to git.

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
| 01 | 1 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |  |
| 02 | 2 | 1 | 0 | 1 | 0 | 2 | 1 | 0 | 2 |  |
| 03 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |  |
| 04 | 2 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 3 |  |
| 05 | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |  |
| 06 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |  |
| 07 | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 2 |  |
| 08 | 1 | 1 | 0 | 1 | 0 | 0 | 6 | 0 | 0 |  |
| 09 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |  |
| 10 | 2 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 |  |
| 11 | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 6 |  |
| 12 | 2 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 3 |  |
| 13 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 3 |  |
| 14 | 1 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 2 |  |
| 15 | 1 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 1 |  |
| 16 | 1 | 1 | 0 | 2 | 0 | 0 | 1 | 1 | 2 |  |
| 17 | 2 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 2 |  |
| 18 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |  |
| 19 | 23 | 1 | 1 | 0 | 0 | 0 | 2 | 0 | 1 | ✓ |
| 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |

## Totals across all fixtures

- **email**: 49
- **phone_us**: 17
- **street_address**: 2
- **linkedin_url**: 23
- **github_url**: 1
- **portfolio_or_personal_site**: 3
- **us_zip_code**: 11
- **license_number**: 1
- **distinct_companies (sum across fixtures)**: 31
- **fixtures with a References section**: 1

## Risk notes

- **Every resume contains at least one email and one phone number** — expected for executive resumes; redact before publishing extracted/ files.
- **Third-party PII** (references sections listing 10+ names and email addresses) is the highest-severity class here because those individuals did not consent to appearing in a fixture corpus. See fixtures with a `✓` in the `refs` column.
- **Street addresses** appear only when a fixture includes a full mailing address in the contact block. Most resumes use city+state only; counts >0 here mean a precise home address is present.
- **`distinct_companies`** is noisy — a candidate who worked at 10 companies and mentions 30 distinct competitors / vendors can produce counts over 100. High counts are a prompt to skim for sensitive client names (law-firm clients, NDA-covered engagements, etc.), not a signal of compromise on their own.
- **`portfolio_or_personal_site`** — URLs to personal domains sometimes carry credentials (portfolio passwords) or link to sensitive work. One of the three portfolio URLs in this corpus has a password annotated inline in the contact block — non-sensitive-looking, but worth a glance before commit.

## Recommended next steps

1. **Do not commit extracted/ files** until redaction decisions are made per fixture.
2. **Handle the References section (fixture-19) first** — third-party emails are the most exposed category.
3. **Fixture-20 is a job description, not a resume** — it has no personal PII but also should not be classified. See `meta/fixture-20-*.yaml` for the flag.
4. If any candidate here is a real CareerIQ paying customer, confirm they consented to use as a fixture before proceeding to Phase 3 shadow runs.

