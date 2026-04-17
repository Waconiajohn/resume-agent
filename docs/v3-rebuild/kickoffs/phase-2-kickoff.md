# Phase 2 — Fixtures

Paste this into Claude Code after Phase 1 is complete and you've done your 15-minute review. Before pasting this, you should have dropped 15-20 real resume files into `server/test-fixtures/resumes/raw/` yourself. Phase 2 assumes the raw files are already present.

---

You are starting Phase 2 of the CareerIQ v3 rebuild. Re-read `docs/v3-rebuild/OPERATING-MANUAL.md` if any session context has been lost. Phase 1's report is at `docs/v3-rebuild/reports/phase-1-report.md`; skim it for context on what was built.

## Goal of this phase

Turn raw resume files in `server/test-fixtures/resumes/raw/` into a usable fixture suite. No prompts, no LLM calls yet. This phase prepares the test substrate.

## What to build

### 1. Fixture metadata

For each file in `server/test-fixtures/resumes/raw/`, create a corresponding metadata file in `server/test-fixtures/resumes/meta/<fixture-name>.yaml`:

```yaml
name: fixture-01-executive-finance
file: raw/fixture-01-executive-finance.docx
category: executive
characteristics:
  - career_length: 20+
  - discipline: finance
  - has_career_gap: false
  - has_sub_roles: false
  - has_international_experience: false
notes: |
  Brief description of what makes this fixture interesting.
  Known edge cases it exercises.
```

Categorize each fixture according to the diversity checklist in doc 02's Week 0 prerequisites:
- Executive with 20+ year career
- Mid-career professional with career gap
- Consultant with many short-duration roles
- International candidate with non-US credentials
- Technical candidate (engineer, data scientist)
- Non-technical candidate (sales, marketing, finance)
- Candidate transitioning industries
- Candidate with unusual formatting (tables, multiple columns)
- Candidate with sub-roles under a parent company (U.S. Bank pattern)
- Female candidate, male candidate, gender-ambiguous name
- Candidate with certifications that have bled into education in the past

You won't know all of these by looking at the files — you'll need to open each one and read it to categorize accurately. That's the point. The categorization makes the fixture suite meaningful.

Report in your phase summary which categories are represented and which are not. If a category is missing, note it. The human can add more fixtures later.

### 2. Anonymization check

Scan each raw fixture file for obvious PII: phone numbers, email addresses, home addresses, specific client company names that might be sensitive. Do not automatically redact — instead, produce a report at `docs/v3-rebuild/reports/phase-2-pii-scan.md` listing what you found per fixture.

The human decides what to redact. You do not redact unilaterally because redaction changes the semantic content the classifier will see.

Add `server/test-fixtures/resumes/raw/` and `server/test-fixtures/resumes/meta/` to `.gitignore` if they contain real resume content. Add a placeholder file (`.gitkeep` or similar) so the directory structure is preserved in git.

### 3. Extract baseline

Run the Stage 1 extractor (which was stubbed in Phase 1 — you will need to implement it for real now, since Stage 1 has no LLM calls and is deterministic) against every fixture. Save the output to `server/test-fixtures/resumes/extracted/<fixture-name>.txt`.

Stage 1 implementation details:
- Use `mammoth` for `.docx`
- Use `pdf-parse` for `.pdf`
- Pass-through for `.txt` and `.md`
- Output format: plaintext with line breaks preserved and bullet markers intact
- Return warnings for anything unusual (multi-column layouts, embedded images, unusual encoding)

Inspect a few extracted outputs by eye. Does the text look clean? Any fixture where extraction is garbage? Flag those in your phase report — they may need the raw file replaced with a cleaner version.

### 4. Fixture runner enhancements

Extend the runner from Phase 1:
- Actually loads fixtures now (reads extracted text + metadata)
- Supports `--filter category=executive` to run subset
- Produces a summary table at end: fixture name, category, status (will be "extracted" for now; "classified" after Phase 3; etc.)
- Saves per-fixture artifacts to `server/test-fixtures/snapshots/<fixture-name>/` so each phase's output is inspectable

## Constraints

- Do not write any prompts. Stage 1 has no LLM calls.
- Do not implement Stages 2-5 yet.
- Never commit raw resume files to git. Commit only the code, the metadata structure, and (if the human confirms resumes are anonymized) the extracted text files.
- If a fixture file is corrupted or unreadable, report it but do not silently skip it. Silent skipping is a v2 pattern we are not repeating.

## Definition of done

- Every raw fixture has a metadata file
- Every raw fixture has an extracted text file
- PII scan report exists and is readable
- Fixture runner lists all fixtures and reports their state
- Phase report written to `docs/v3-rebuild/reports/phase-2-report.md`

## What I will check

- Are the fixture categories balanced, or do I need more fixtures?
- Does extraction look clean on a few random fixtures?
- Does the PII report reveal anything that needs redaction before we proceed?
- Is the metadata structure going to be useful later when we want to ask "how does classify do on fixtures with sub-roles?"

Begin.
