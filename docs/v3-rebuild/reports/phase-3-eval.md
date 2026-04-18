# Phase 3 — Classify Evaluation

**Started:** 2026-04-18
**Prompt under test:** `server/prompts/classify.v1.md`
**Model:** `claude-opus-4-7`
**Corpus:** 19 redacted resume fixtures (Phase 2.1)

---

## Diverse 6-fixture iteration subset

Per the kickoff §2 iteration strategy, a 6-fixture diverse subset carries the prompt development. The six:

| Fixture | Category | What it stress-tests |
|---------|----------|----------------------|
| fixture-01-ben-wedewer-resume-trimmed | executive | Clean baseline; parent-company sub-roles (Travelport ×2, Rocket ×2) |
| fixture-04-bshook-resume-dirpm-primary | technical_to_management | Cert/edu bleed risk (PMP + Lean Six Sigma + MBA + BS in one block) |
| fixture-07-diana-downs-fst-resume-template | female_technical_with_template | Unfilled template placeholders (Rule 10 target) |
| fixture-09-jay-alger-sr-strat-and-bd-ldr | executive | Strongest U.S. Bank umbrella pattern (Collins Aerospace has 5 sub-roles) |
| fixture-14-lj-2025-resume-v1-7-26 | unusual_formatting | Post-base64-strip scrambled layout; subsidiary/acquisition history (Radiant→NCR) |
| fixture-18-steve-alexander-resume-25 | current_career_gap | Tatiana pattern (narrated open-to-work block as current "position") |

**Stopping criterion:** two consecutive 6-fixture runs with no new failure mode → validate against all 19.

---

## Iteration v1.0 → v1.1

### v1.0 — initial run (2026-04-18)

All 6 fixtures classified successfully. Structural numbers:

| Fixture | Positions | Edu | Certs | Gaps | Flags | Confidence | Expected |
|---------|-----------|-----|-------|------|-------|------------|----------|
| 01 | 6 | 1 | 0 | 0 | 1 | 1.00 | 6 positions + 1 BS ✓ |
| 04 | 7 | 2 | 3 | 0 | 1 | 1.00 | 7 + MBA/BS-EE + 3 certs ✓ |
| 07 | 7 | 2 | 0 | 1 ⚠ | 5 | 0.50 | 7 + 2 edu; gap was inferred ⚠ |
| 09 | 8 | 3 | 1 | 0 | 4 | 0.70 | 5 Collins sub-roles + 3 Greatbatch + PMP ✓ |
| 14 | 9 | 2 | 0 | 1 ⚠ | 3 | 0.70 | 9 positions; gap was inferred ⚠ |
| 18 | 7 | 0 | 0 | 1 | 3 | 0.90 | 7 + Tatiana-pattern careerGap ✓ |

**Wins:**

- **Rule 2 (umbrella)** handled perfectly across fixtures 01, 09, 14. fixture-09 correctly produced 5 Collins-Aerospace sub-roles all with `parentCompany: "Collins Aerospace"` and 3 Greatbatch-Medical sub-roles; fixture-14 got the Radiant Systems → NCR acquisition distinction right (Radiant roles have `company: "Radiant Systems Inc.", parentCompany: "NCR Corporation"`).
- **Rule 4 (cert/edu split)** on fixture-04 (the target case): 3 certifications (PMP, LSS Green Belt, LSS Black Belt "in progress") + 2 education (MBA, BS EE) cleanly separated.
- **Rule 10 (template placeholders)** on fixture-07: flagged and excluded the `__The Job Title here__` / `Example-` / `Examples- No more than 15 Bullets` content; skills list is clean.
- **Rule 1 (Tatiana pattern)** on fixture-18: the "Actively pursuing new leadership roles… Available for short-term consulting" May-2025-Present block correctly classified as `careerGaps[0]`, not a position. Explicit flag explains why.
- Discipline strings are natural-language and accurate across all 6: e.g., "quality engineering and DevOps transformation leadership", "aerospace and medical device strategy, business development, and product management", "identity and access management in financial services".

**v1.0 failure modes identified (drove the v1.0 → v1.1 revision):**

1. **Rule 1 over-reach — hallucinated career gaps.** Three forms:
   - fixture-07: classifier inferred a 2012–2014 gap from a chronological jump between Citi (ended 2012) and JPMorgan (started 2014) even though the source says nothing about 2012-2014.
   - fixture-18: similarly flagged a 1996-2000 / 2004 chronological silence between AMX and Monster Cable Products.
   - fixture-14: treated a "Proudest Life Accomplishment" sidebar describing "took on the General Contractor role to complete construction of my mother's retirement home" as a careerGap. That's personal color, not employment narrative.
2. **Invalid flag path format.** fixture-18 emitted `"field": "positions[2000-1996].dates"` — the model got creative with array-index notation. Rule 8's flag schema didn't spell out that paths must be valid dotted paths with integer indices.

**v1.1 revisions:**

- Rule 1 rewritten to **require explicit narrative** for careerGaps and explicitly forbid:
  - Inferring gaps from chronological silence between listed positions
  - Treating personal-project sidebars, hobbies, volunteer work, or interest blurbs as gaps
  - Including military service / full-time education as gaps (those are positions / education)
- Rule 8 schema extended: `field` is a strict dotted path with only object properties, integer array indices, and nested paths. Examples of invalid paths now called out.
- No other changes — v1.0's handling of Rules 2, 4, 6, 10 was solid.

### v1.1 — second run (2026-04-18)

Same 6 fixtures, post-Rule-1-tightening and post-flag-path-contract.

| Fixture | Positions | Edu | Certs | Gaps | Flags | Confidence | Δ from v1.0 |
|---------|-----------|-----|-------|------|-------|------------|-------------|
| 01 | 6 | 1 | 0 | 0 | 2 | 1.00 | unchanged structurally |
| 04 | 7 | 2 | 3 | 0 | 0 | 1.00 | dropped redundant redacted-name flag |
| 07 | 7 | 2 | 0 | **0** | 4 | 0.60 | **gap removed** ✓; speculative-silence now a low-severity flag instead of a fabricated gap entry |
| 09 | 8 | 3 | 1 | 0 | 2 | 0.75 | structural parity, fewer flags, slight confidence bump |
| 14 | 9 | 2 | 0 | **0** | 2 | 0.70 | **"General Contractor" sidebar removed from gaps** ✓ |
| 18 | 7 | 0 | 0 | 1 | 2 | 0.90 | Tatiana gap preserved (correct) ✓; speculative 1996-2000 chronological-silence flag removed ✓ |

All flag field paths in the six outputs are valid dotted paths. No recurrence of the `positions[2000-1996].dates`-style invalid index.

Notable detail: fixture-07's new flag reads
> "Chronological silence between Citi (ended 2012) and JPMorgan Chase (began 2014) is not narrated by the candidate; left unflagged as a career gap per Rule 1, noted here only for reviewer awareness."
The classifier is now correctly **observing** the silence in a low-severity flag without creating a hallucinated gap entry. That's exactly the behavior Rule 1 v1.1 targets.

**No new failure modes.** Proceeding to full 19-fixture validation without further prompt iteration.

### Full 19 — validation run (2026-04-18)

All 19 fixtures classified successfully on v1.1. **Zero hallucinated career gaps across the corpus** (only fixture-18's real Tatiana pattern remains). **Zero phantom positions, zero umbrella-as-position errors, zero cert/edu bleed**. Structural numbers:

| # | Fixture | Positions | Edu | Certs | Gaps | Flags | Conf | Calibration check |
|---|---------|-----------|-----|-------|------|-------|------|-------------------|
| 01 | ben-wedewer | 6 | 1 | 0 | 0 | 0 | 1.00 | clean baseline as expected |
| 02 | blas-ortiz | 10 | 1 | 0 | 0 | 3 | 0.60 | 4 SLB sub-roles + 3 Smith Intl + 3 Halliburton Additional Exp = 10; conf reflects Additional-Experience ambiguity |
| 03 | brent-dullack | 9 | 1 | 0 | 0 | 3 | 0.85 | 9 positions across 1990-2025; USMC 1990-1994 → civilian 2008 silence correctly NOT classified as a gap |
| 04 | bshook | 7 | 2 | 3 | 0 | 0 | 1.00 | cert/edu split target met: 3 certs (PMP, LSS Green, LSS Black in-progress) + 2 edu (MBA, BS EE) |
| 05 | casey-cockrill | 5 | 2 | 1 | 0 | 2 | 0.90 | template-placeholder flags present; ISO auditor cert correctly identified |
| 06 | chris-coerber | 4 | 1 | 0 | 0 | 0 | 1.00 | clean extraction; "Actively pursuing AI/ML" treated as industry-transition note, not gap |
| 07 | diana-downs | 7 | 2 | 0 | 0 | 4 | 0.70 | template placeholders flagged; Protiviti→Maestro ambiguity flagged; conf appropriately lowered |
| 08 | j-vaughn | 3 | 1 | 1 | 0 | 2 | 0.90 | PepsiCo 3 geographic sub-roles correctly captured |
| 09 | jay-alger | 8 | 3 | 1 | 0 | 3 | 0.75 | Collins Aerospace 5 sub-roles + Greatbatch Medical 3 with Enpath acquisition distinction; conf reflects stacked-title bullet ambiguity |
| 10 | jessica-boquist | 6 | 2 | 0 | 0 | 1 | 0.90 | 6 positions incl. AnswerHub duplicate-entry case correctly handled |
| 11 | jill-jordan | 5 | 1 | 6 | 0 | 0 | 1.00 | 6 certs correctly identified (CBA, CPCU, QIDP, Wrike, plus 2 in-progress); clean split from the AAS education |
| 12 | joel-hough | 4 | 1 | 5 | 0 | 2 | 0.75 | 4 positions (Walmart, BJ's, TRS × 2 sub-roles); 5 quasi-cert qualifications (CFSP, Serve-Safe, DiSC trainer, etc.) |
| 13 | lisa-slagle | 3 | 1 | 0 | 0 | 3 | 0.40 | Lowest confidence; "Additional Experience | Various Clients" has no dates; template placeholders flagged |
| 14 | lj-2025 | 9 | 2 | 0 | 0 | 3 | 0.70 | Post-base64-strip extraction; LivePerson 3 + Sage + NCR 2 + Radiant 2 + Assurant = 9; Radiant→NCR acquisition distinction preserved |
| 15 | manzione | 3 | 2 | 0 | 0 | 2 | 0.90 | clean; graduate certificate + BS; portfolio URL caught |
| 16 | mark-delorenzo | 3 | 2 | 7 | 0 | 2 | 0.50 | 7 credentials enumerated (PE license w/ number, OSHA 30, 4 FDOT inspector certs, steel inspection); 3 positions (TranSystems, Jacobs, AIM w/o dates lowers conf) |
| 17 | davidchicks | 6 | 2 | 0 | 0 | 2 | 0.60 | MDiv + BA Math correctly both edu (not confused with certs); Microsoft "Additional experiences" dateless role lowers conf |
| 18 | steve-alexander | 7 | 0 | 0 | 1 | 2 | 0.90 | Tatiana pattern correctly preserved as the only careerGap in the corpus |
| 19 | stevegoodwin | 8 | 1 | 2 | 0 | 2 | 0.80 | 2-column-layout extraction recovered; 8 positions incl. 6 Interactive Intelligence→Genesys sub-roles |

**Quality gate per kickoff §5**:
- ✓ Zero phantom positions (career gap notes, section headers, umbrella lines not parsed as jobs)
- ✓ Zero umbrella-as-position errors
- ✓ Clean separation of education from certifications across all affected fixtures (04, 09, 11, 12, 16, 17)
- ✓ Natural-language discipline on every fixture (spot-checked 19)
- ✓ Calibrated confidence scores (low scores on 13, 16, 17 explained by dateless Additional-Experience entries — genuine ambiguity, not over-caution)

### Mid-run finding: redactor regex miss for Unicode hyphen

Full-corpus end-to-end leak check caught **2 classify snapshots with residual phone numbers** (fixture-10: `919-819-0376`; fixture-15: `(678) 882-6432`). Root cause: the Phase 2.1 redactor and PII scanner use `[-.\s]` in the phone-separator character class, but fixtures 10 and 15 use Unicode **non-breaking hyphen** (`U+2011`) between digit groups — word processors sometimes substitute it for ASCII hyphen in phone numbers. The redactor wasn't even detecting the pattern as a phone.

The prior PII scan report showed `phone_us: 0` because its identical regex had the same blindspot. **Silence was not cleanness** — the scanner was just as blind as the redactor.

Fix:
- `server/src/v3/test-fixtures/redact.ts` phone regex now accepts `[-.\s\u2010-\u2014\u2212]` — all Unicode hyphen/dash variants word processors emit.
- `server/scripts/pii-scan.mjs` same fix for the scanner.
- New test `handles Unicode hyphen separators (U+2011, U+2013)` in `redact.test.ts` covers the specific failing case. 19/19 redact tests pass.
- Re-ran extract-fixtures → re-redacted both affected fixtures → re-ran classify on fixtures 10 and 15 → confirmed zero PII in classify output across all 19 fixtures (Python cross-check).

This was the kind of "silent is not success" failure the Phase 2 kickoff warned about. Flagging prominently.

**No new failure modes from v1.1 itself.** The redactor defect is upstream of classify; classify itself behaved correctly by echoing the (insufficiently-redacted) input into the contact.phone field per Rule 9.

---

## Iteration v1.1 → v1.2 (Phase 3 review decisions)

Approved two additions per the Phase 3 review message:

1. **Rule 13 — cross-role highlights preserved as a new structured field.** A `crossRoleHighlights` array on `StructuredResume` (zod + TypeScript updated). Classify now preserves top-level summary-level accomplishments that span multiple roles — v1.1 dropped Ben Wedewer's "85 staff" claim because it wasn't attributable to a single role and didn't repeat in any per-role bullet. The new rule preserves these with `text`, `sourceContext`, and `confidence`. Stage 3 (Strategize) reads from `crossRoleHighlights` instead of re-deriving from raw resume text.
2. **Rule 14 — stacked-title bullet attribution codified.** When bullets belong to more than one stacked role at the same employer, attribute to the senior-most / most-recent role with `confidence ≤ 0.7`. Do NOT duplicate across stacked roles. This aligns the v1.1 inconsistency (fixture-07 duplicated bullets, fixture-09 attributed to senior) to one canonical approach.

### v1.2 — full run (2026-04-18)

18/19 fixtures succeeded on the first v1.2 pass. Fixture-13 (Lisa Slagle) hit a schema validation failure — Opus emitted 9 crossRoleHighlight entries but forgot `sourceContext` on all of them. **This was one-time non-determinism, not a prompt gap**: 18/19 fixtures emitted `sourceContext` correctly, including fixture-04 with 11 entries. A single retry on fixture-13 succeeded with 5 crossRoleHighlights, all with proper sourceContext, confidence-calibrated.

Structural verification of target behaviors on key fixtures:

- **fixture-01 Ben Wedewer (Rule 13 target)**: 1 crossRoleHighlight:
  `"Built and scaled global engineering and QA teams up to 85 staff."` with `sourceContext: "Technology Leadership Impact section at top of resume, above Experience."` — exactly the v1.1 regression that motivated Rule 13. Fixed.
- **fixture-09 Jay Alger (Rule 14 target — Greatbatch Medical)**: Technical Sales Manager (senior-most, 2012-2013) attributed 5 bullets with `confidence: 0.7`; Senior Project Manager (2006-2012) and Inside Sales Engineer (2004-2005) have empty `bullets` arrays and no duplication. Exactly the canonical senior-attribution pattern.
- **fixture-07 Diana Downs (Rule 14 target — Protiviti/Maestro)**: Classifier MERGED the two consecutive consulting engagements (same analyst, same end client Amalgamated Bank) into a single position with combined title/dates ("Protiviti / Maestro (Consultant for Amalgamated Bank)", "2022 – 2023 / 2023 – 2024"), `confidence: 0.6`, bullets attributed once. Slightly more aggressive than the literal rule wording but fully consistent with the "no duplication" intent. Acceptable.

**Full structural summary for v1.2** (count of crossRoleHighlights added to each line):

| # | Positions | Edu | Certs | Gaps | xrl | Conf | Notes |
|---|-----------|-----|-------|------|-----|------|-------|
| 01 | 6 | 1 | 0 | 0 | 1 | 1.00 | "85 staff" preserved ✓ |
| 02 | 10 | 1 | 0 | 0 | 0 | 0.60 | no cross-role section in source |
| 03 | 9 | 1 | 0 | 0 | 0 | 0.85 | |
| 04 | 7 | 2 | 3 | 0 | 11 | 1.00 | rich "Core Competencies" + "Accomplishments" both captured |
| 05 | 5 | 2 | 1 | 0 | 3 | 0.90 | Accomplishments bullets preserved |
| 06 | 4 | 1 | 0 | 0 | 0 | 1.00 | |
| 07 | 7 | 2 | 0 | 0 | 7 | 0.60 | Accomplishments preserved; Protiviti/Maestro merged |
| 08 | 3 | 1 | 1 | 0 | 7 | 0.85 | |
| 09 | 8 | 3 | 1 | 0 | 0 | 0.70 | Greatbatch Rule 14 verified |
| 10 | 6 | 2 | 0 | 0 | 4 | 0.85 | |
| 11 | 5 | 1 | 6 | 0 | 0 | 1.00 | |
| 12 | 4 | 1 | 3 | 0 | 0 | 0.70 | |
| 13 | 3 | 1 | 0 | 0 | 5 | 0.40 | one-time schema miss on first run; retry clean |
| 14 | 9 | 2 | 0 | 0 | 0 | 0.80 | |
| 15 | 3 | 2 | 0 | 0 | 0 | 0.90 | |
| 16 | 3 | 2 | 7 | 0 | 5 | 0.50 | "Accomplishments" surfaced as xrl |
| 17 | 6 | 2 | 0 | 0 | 2 | 0.60 | two patents correctly landed as xrl (not certs) |
| 18 | 7 | 0 | 0 | 1 | 0 | 0.90 | Tatiana pattern still correct |
| 19 | 8 | 1 | 2 | 0 | 6 | 0.80 | multi-column layout handled |

Phase 3 quality gate still met. No regressions from v1.1.

### Semantic diff gate shipped alongside v1.2

Phase 4 prep: `server/src/v3/test-fixtures/classify-diff.ts` implements the semantic diff thresholds approved in the Phase 3 review:
- Counts of positions / education / certifications / careerGaps / crossRoleHighlights: any change → real diff.
- Discipline primary domain change → real diff; paraphrase at same domain → noise.
- Pronoun change → real diff.
- `overallConfidence` shift beyond ±0.1 → real diff; within → noise.
- Free-text wording (titles, discipline, crossRoleHighlights text) → noise when length delta ≤ ±15% and no negation-token polarity change; otherwise → real diff.

Wired into `classify-fixtures.mjs`: each fixture compares its new snapshot against the prior one and prints `[no diff] / [diff: noise] / [DIFF: REAL]`. Any real diff sets runner exit code 3. 10 new unit tests in `redact-diff.test.ts` cover each threshold class. 54/54 v3 tests pass (44 prior + 10 diff).

---

## Cost trajectory

All runs use `claude-opus-4-7` (streaming path; temperature parameter omitted — Opus 4.7 rejects it with `"temperature is deprecated for this model"`). Published rates as of 2026-04: **$15.00 / million input tokens**, **$75.00 / million output tokens**.

| # | Date (UTC) | Prompt | Fixtures | Input tokens | Output tokens | $ estimate | Notes |
|---|------------|--------|----------|--------------|---------------|------------|-------|
| 1 | 2026-04-18 | v1.0 | 1 (fixture-01 only) | 10,705 | 2,551 | $0.3519 | smoke test |
| 2 | 2026-04-18 | v1.0 | 6 (subset) | 65,009 | 18,721 | $2.3792 | includes fixture-01 again; structural numbers above |
| 3 | 2026-04-18 | v1.1 | 6 (subset) | 69,287 | 17,984 | $2.3881 | post Rule-1 tightening + flag-path schema; no new failure modes |
| 4 | 2026-04-18 | v1.1 | 19 (full) | 220,126 | 59,169 | $7.7396 | full-corpus validation; 19/19 success, 0 failures |
| 5 | 2026-04-18 | v1.1 | 2 (re-run 10, 15) | 22,484 | 4,890 | $0.7040 | re-classify after redactor fix for Unicode hyphen separators |
| 6 | 2026-04-18 | v1.2 | 19 (full, 1 failed at fixture-13 schema) | 240,234 | 56,495 | $7.8399 | v1.2 first run; fixture-13 schema miss (Opus dropped sourceContext on 9 xrl) — 18/19 success |
| 7 | 2026-04-18 | v1.2 | 1 (fixture-13 retry) | 14,919 | 3,412 | $0.4797 | retry succeeded cleanly; one-time non-determinism, not prompt gap |
| 8 | 2026-04-18 | v1.2 | 1 (fixture-01 diff-check verification) | 14,883 | 2,836 | $0.4359 | verify semantic diff check fires `[no diff]` on matching re-run |

**Running total:** $22.8222

Budget approved: **$20–$50**. Current utilization: **46%**. Still room to iterate on pilot Phase 4 prompts.

---

## Provider / platform notes surfaced in Phase 3

1. **`AnthropicProvider.chat()` was not forwarding `temperature`** — one-line platform fix landed in `server/src/lib/llm-provider.ts` (both `chat()` and `stream()` paths). The ZAI branch already did; the Anthropic branch didn't. No caller used temperature on Anthropic before now.
2. **`claude-opus-4-7` rejects the `temperature` parameter** with `400 invalid_request_error: "temperature is deprecated for this model"`. The classify call omits temperature entirely. The prompt YAML's `temperature: 0.2` field is preserved as documentation of intent for any future variant on a model that still honors the parameter. Flagged in the phase 3 report for discussion — if we want deterministic sampling, a different mechanism is needed (e.g., `seed`, extended-thinking budget).
3. **Output volume exceeds non-streaming safety threshold.** The Anthropic SDK refuses non-streaming calls where `max_tokens` could exceed the 10-minute wall-clock safety check. Classify uses the streaming path exclusively. Text is accumulated in memory and parsed once the stream yields `done`.
