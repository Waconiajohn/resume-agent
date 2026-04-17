# Phase 3 — Stage 2 (Classify)

Paste this into Claude Code after Phase 2 is complete and you've reviewed the fixture suite. This is the load-bearing phase of the entire rebuild. The quality of Stage 2's output determines whether the whole v3 architecture works.

---

You are starting Phase 3 of the CareerIQ v3 rebuild. Re-read `docs/v3-rebuild/OPERATING-MANUAL.md`, doc 01 (architecture vision), and doc 03 (prompt library structure) before starting. Phase 2's fixture suite is at `server/test-fixtures/resumes/`.

## Goal of this phase

Build Stage 2 (Classify): one LLM call that takes clean plaintext and returns a fully structured `StructuredResume` object. This one prompt replaces the entire v2 parsing layer — Candidate Intelligence, Source Resume Outline, Benchmark Candidate's parsing work, all the guardrails, all the regex. Everything.

The architectural thesis of the whole rebuild lives or dies here. If classify works, the rest of the pipeline is straightforward. If classify is wrong, every downstream stage inherits the wrongness.

## What to build

### 1. The classify prompt (v1)

Create `server/prompts/classify.v1.md` per the format in doc 03. The prompt instructs Claude (Opus) to read a resume's plaintext and return JSON matching the `StructuredResume` type.

The prompt must address every failure mode that v2 exhibited, per doc 05's "Bugs observed during April 17 debugging" section. Each of these is a hard rule in the prompt with a "why" comment:

1. **Career gap notes are not positions.** If the text describes time off, caregiving, sabbatical, travel, or any non-employment period, it is a `careerGap` entry, not a `position`. Never invent a title/company from gap narrative text.

2. **Parent-company umbrellas are not positions.** When a single company has sub-roles beneath it (classic example: `U.S. Bank | Minneapolis, MN | 2014-2024` followed by multiple titles at that company), the parent line is an umbrella and the sub-lines are the positions. The umbrella's company name propagates to each sub-position. The umbrella does not become its own position.

3. **Section headers are not positions.** "Professional Experience", "Work History", "Career Highlights" are section dividers, not jobs.

4. **Education and certifications are distinct.** A PMP, SHRM-CP, AWS cert, or similar credential is a `certification`, never an `education` entry. Conversely, an MBA or BS degree is `education`, never a `certification`. Do not merge lists.

5. **Discipline is descriptive natural language.** Do not select from a fixed list. Read the entire resume and state the candidate's primary discipline in a short phrase that a hiring manager would recognize: "finance operations", "biotech product management", "healthcare revenue cycle", "enterprise SaaS sales". Do not say "manufacturing operations" unless the resume is actually about manufacturing.

6. **Pronouns come from the candidate's apparent gender, if inferable, or default to active voice.** If the first name is strongly gendered (the prompt may use a model's pronoun inference), note the likely pronoun in the output for downstream use. If ambiguous, note `null` — downstream writers will use active voice.

7. **Dates are real dates.** If a date is "2018-Present", represent it faithfully. Do not default missing dates to "undefined" or to placeholder strings.

8. **Confidence scores per field.** For every field the classifier extracts, return a confidence score (0.0-1.0). Low confidence fields get flagged for the human.

Every rule has a `<!-- Why: ... -->` comment below it explaining the failure mode, with a rough date of when we saw the bug (April 17, 2026, for all of these). See doc 03 for the exact format.

The prompt includes at least three examples:
- One "clean" resume input with expected clean output
- One "tricky" input exercising the U.S. Bank umbrella pattern with expected output
- One "career gap" input exercising the Tatiana pattern with expected output

### 2. The classify implementation

`server/src/v3/classify/index.ts` exports `async function classify(extracted: ExtractResult): Promise<StructuredResume>`. Internally:

1. Load `classify.v1.md` via the prompt loader
2. Inject the extracted plaintext into the user message template
3. Call the LLM provider with the prompt's declared model and temperature
4. Parse the response as JSON
5. Validate against the `StructuredResume` type (zod or similar)
6. On parse failure: throw a loud error. Do not attempt to repair JSON silently. Report the raw response.
7. On validation failure: throw a loud error with the specific validation issues.
8. Log inputs (length only, not content), outputs (summary), timing, errors.

No fallback. No "if LLM fails, use regex." No silent anything. If classify fails, the pipeline fails visibly.

### 3. The fixture evaluation

Run classify against every fixture. For each, save the output to `server/test-fixtures/snapshots/<fixture-name>/classify.json`.

Produce a report `docs/v3-rebuild/reports/phase-3-classify-eval.md` with:
- Per-fixture: number of positions extracted, number with confidence <0.7, any flagged ambiguities
- Pattern analysis across fixtures: are there systematic failure modes?
- Specific regressions vs. what a correct extraction would look like (you will need to read each fixture yourself and compare)

### 4. Iterate on the prompt

Based on the evaluation, iterate the prompt. Bump versions per doc 03's semantic versioning rules. Move old versions to `server/prompts/archive/`. Keep iterating until:

- Every fixture produces zero phantom positions
- Every fixture produces zero umbrella-as-position errors
- Every fixture correctly separates education from certifications
- Every fixture's discipline field reads naturally and accurately
- Every fixture's confidence scores look calibrated (low scores flag real ambiguity)

Doc 02 is explicit: "If classify doesn't match current quality on any fixture, the prompt gets revised until it does. We do not proceed to Week 2 with a regression." Honor this.

### 5. The "why this is hard" awareness

Some fixtures will have legitimate ambiguity. A resume entry that says "Consulting engagements, 2020-2022" with sub-bullets is genuinely unclear — is it one position with multiple projects, or several short positions? The prompt should handle this by choosing a reasonable structure and flagging low confidence, not by pretending certainty.

If you find a fixture where no reasonable prompt can classify it correctly, that is a signal. Report it. The human decides whether to add clarifying prompt rules, add an example, or accept the ambiguity as a known limitation.

## Constraints

- This is the most expensive phase in terms of LLM tokens. Classify is Opus. Running 20 fixtures repeatedly as you iterate will cost real money. Batch your iterations: make several prompt changes, run the full suite once, analyze, iterate. Do not run the full suite after every tiny edit.
- Do not add any guardrails to classify's output. If classify produces phantoms, fix the prompt. Do not add a phantom filter in code. This is the entire architectural thesis; breaking it in the first real stage invalidates the project.
- Do not repair LLM output. If the LLM returns malformed JSON, the response surfaces to the human. Silent repair is a v2 pattern.
- Do not second-guess classify downstream. Future phases trust its output.

## Definition of done

- `classify.v1.md` (or v1.N) exists and is the current version
- All fixtures classify without error
- All fixtures produce structurally correct output (zero phantoms, zero umbrella-as-position, clean separation of education/certs)
- Evaluation report is complete and honest about remaining uncertainty
- Phase report written to `docs/v3-rebuild/reports/phase-3-report.md`

## What I will check

This is the most important review checkpoint of the project. I will:

- Spot-check 5 fixtures end-to-end, reading the raw resume and comparing to classify's output
- Look for systematic issues in the "what is uncertain" section of your report
- Verify zero guardrail functions exist in the classify directory
- Verify the prompt file has "why" comments on every rule
- Check that prompt iteration history is preserved in `archive/`

If I find a regression, we iterate the prompt further. We do not proceed to Phase 4 with known classify issues.

Begin.
