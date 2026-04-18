# Phase 3 Report — Classify

**Date:** 2026-04-18
**Branch:** `rebuild/v3`
**Scope:** `server/src/v3/classify/`, `server/prompts/classify.v1.md`, eval reports, provider adjustments, Phase 2.1 redactor hotfix
**Prompt shipped:** `classify.v1.md` (version 1.1; v1.0 archived)
**Full corpus validated:** 19/19 fixtures classify successfully; zero hallucinated career gaps; quality gate met per kickoff §5.

---

## 1. What I built

### Stage 2 (Classify) — real implementation

| File | Purpose |
|------|---------|
| `server/prompts/classify.v1.md` | The classify prompt. YAML frontmatter (`model: claude-opus-4-7`, `temperature: 0.2` documented-only, `version: "1.1"`). 12 hard rules each with a `<!-- Why: ... -->` comment. Three worked examples (clean resume, U.S. Bank umbrella, Tatiana-pattern career gap). |
| `server/prompts/archive/classify.v1.0.md` | Superseded version kept per `docs/v3-rebuild/03-Prompt-Library-Structure.md` versioning convention. |
| `server/src/v3/classify/index.ts` | `classify()` and `classifyWithTelemetry()`. Loads the prompt via v3 loader, calls `AnthropicProvider.stream()` (accumulating text until `done`), parses JSON, validates against the zod schema, throws `ClassifyError` on every failure mode with enough context to debug. No silent repair. |
| `server/src/v3/classify/schema.ts` | Zod schema for `StructuredResume` mirroring `server/src/v3/types.ts`. Runtime validation gate for the classify output. |

### Fixture runner

| File | Purpose |
|------|---------|
| `server/scripts/classify-fixtures.mjs` | Phase 3 one-shot. Reads `extracted/<slug>.txt` (post-redaction), wraps in `ExtractResult`, calls `classifyWithTelemetry()`, writes `snapshots/<slug>/classify.json` + `classify.telemetry.json`. Supports `--only`, `--subset` (six diverse fixtures), `--filter key=value`, `--prompt-variant`, `--no-write`, `--dry-run`. Emits per-fixture token counts + dollar estimate and a total at end. |

### Platform provider touch-up

| File | Change |
|------|--------|
| `server/src/lib/llm-provider.ts` | `AnthropicProvider.chat()` and `.stream()` now forward `temperature` to the SDK. The ZAI branch already did; the Anthropic branch didn't. Minimal, one-line-per-path edit. Benefits anything that calls the Anthropic provider with a temperature going forward. Noted as a "Shared platform infrastructure" exception per OPERATING-MANUAL.md. |

### Phase 2.1 redactor hotfix (surfaced by Phase 3's full-corpus leak check)

| File | Change |
|------|--------|
| `server/src/v3/test-fixtures/redact.ts` | Phone-separator regex now accepts Unicode hyphen/dash variants (U+2010–U+2014, U+2212). Fixtures 10 and 15 in the corpus use U+2011 non-breaking hyphens that the v1.0 regex missed. |
| `server/scripts/pii-scan.mjs` | Same regex fix; the scanner had the same blindspot, so its "zero phones" result was a false clean. |
| `server/src/__tests__/v3/redact.test.ts` | New test `handles Unicode hyphen separators (U+2011, U+2013)` covering the specific failing case. 18 → 19 redact tests. |

### Obsolete tests removed

- `server/src/__tests__/v3/pipeline.test.ts` — the Phase 1 end-to-end smoke test asserted that `runPipeline` surfaced the first `NotImplementedError` in the chain. With classify real, the chain now requires a live LLM call to reach the next stub; keeping the test would require mocking Anthropic or making a real API call in `npm test`. The fixture runner is the real end-to-end harness now. Removed; tests to follow in Phase 4 (strategize) will use narrower mocks.
- `classify` removed from `src/__tests__/v3/stages-not-implemented.test.ts`. Strategize / write / verify still covered there.

---

## 2. What works

- **`cd server && npx tsc --noEmit`** — exit 0.
- **v3 test suite: 44/44 pass** (43 prior + 1 new Unicode-hyphen redactor test).
- **19/19 fixtures classify successfully** on the final v1.1 prompt. Full-run summary: 220,126 input tokens, 59,169 output tokens, $7.74, zero failures.
- **Quality gate met** per kickoff §5: zero phantom positions, zero umbrella-as-position errors, clean education/certifications split, natural-language discipline, calibrated confidence scores. See `phase-3-eval.md` for the per-fixture table.
- **v1.1 fixes two v1.0 failures surfaced on the 6-fixture subset**: Rule 1 rewritten to require EXPLICIT narrative for career gaps (v1.0 hallucinated 3 gaps from chronological silence or personal-project sidebars); Rule 8 flag-path contract added (v1.0 emitted `positions[2000-1996].dates`).
- **Zero guardrail functions in classify**. `grep -rn 'filter\|sanitize\|ensure\|coerce\|salvage\|derive\|trimArtifacts' server/src/v3/classify/` returns zero matches. The zod schema validation is a gate, not a repair function — failures throw, they do not mutate.
- **Zero candidate PII leakage in classify output across all 19 snapshots** (cross-checked post Phase-2.1-hotfix; see §3g below).

---

## 3. What is uncertain

### 3a. Temperature is silently dropped for Opus 4.7

`claude-opus-4-7` rejects the `temperature` parameter with `400 "temperature is deprecated for this model"`. My classify implementation currently omits `temperature` from the API call entirely. The prompt YAML's `temperature: 0.2` is preserved as documentation of intent.

Consequences:
- Output is non-deterministic across runs. I observed modest variance between v1.0 smoke (fixture-01 alone: 6 positions) and v1.0 subset (fixture-01 inside a larger batch: 7 positions). Classification quality stayed good but structure shifted slightly.
- No way to reproduce a specific output snapshot exactly.

Options for Phase 4 discussion:
1. Accept non-determinism. Calibrate snapshot diffing to be structural (counts, key content) rather than byte-for-byte.
2. Use Anthropic's `extended_thinking` budget or other model controls (need to verify availability on 4.7).
3. Pin to a model that still accepts `temperature` for classify. Tradeoff: quality vs determinism.

Flagging for review before Phase 4.

### 3b. Non-streaming output size limit

The Anthropic SDK refuses `messages.create()` (non-streaming) when `max_tokens` could produce >10 minutes of wall-clock response. Classify uses `max_tokens: 32_000` and had to use the streaming path. This works, but:
- A full-pipeline request (classify + strategize + write + verify) running serially through the streaming path will have looser latency bounds than the `under 60 seconds` target in doc 02.
- Observed per-fixture latency in the 6-subset: 18–40 seconds each. Classify alone. Strategize/write/verify will add more.

Budget implication for Phase 4+: the "pipeline p95 under 60s" goal may need revisiting, or Phase 4 will need aggressive parallelization of the write-stage per-position calls.

### 3c. Cross-role summary highlights get dropped

Ben Wedewer's resume has a "TECHNOLOGY LEADERSHIP IMPACT" block with 4 summary-level bullets at the top, some of which repeat inside specific role bullets (e.g., `$26M` metric) but one of which does not (`85 staff`). Classify correctly did not attribute these to specific roles, and correctly did not emit phantom positions — but there is no field in `StructuredResume` that captures "cross-role summary highlights." Those bullets are lost.

Is this a schema omission or is it Stage 3's (Strategize) job to re-derive them from the corpus of role bullets + the target JD? My read of doc 01 and the kickoff is that Stage 3 owns accomplishment selection, so dropping these at Stage 2 is defensible — but flagging explicitly because one specific claim ("85 staff") is now absent from our structured output for Ben.

Please confirm: do we need a `summaryHighlights: string[]` field on `StructuredResume`, or does Stage 3 re-derive?

### 3d. Pronoun inference is untested on the fixture corpus

Every fixture has `[REDACTED NAME]` in the name field. Rule 6's pronoun-inference logic cannot fire because the classifier never sees a real first name. All 19 fixture outputs have `pronoun: null`, which is the correct fallback per Rule 6 — but the rule itself is validated only by prompt reading, not by empirical runs.

Production resumes will have real names; Rule 6 will fire normally. No action required for Phase 3, but noting so the absence of fixture coverage is explicit.

### 3e. Stacked title + shared bullet attribution

Fixture-07 (Diana Downs) has Protiviti and Maestro listed as two consecutive consulting engagements for the same client (Amalgamated Bank) with one role title header underneath and a shared bullet list. Classify duplicated the bullets under both positions with lowered confidence on the second (Maestro: 0.7 per bullet, overall 0.6) and added high-severity flags.

Fixture-09 (Jay Alger) has a similar Greatbatch Medical stacked-titles pattern (Technical Sales Manager, Sr PM, Inside Sales Engineer) with 5 bullets beneath. Classify attributed the 5 bullets to the most senior role (Technical Sales Manager) with confidence 0.75 per bullet and left the other two with empty bullets arrays + medium-severity flags.

Both outputs are honest — confidence reflects the ambiguity. But the question is whether stacked-title bullet duplication (fixture-07's approach) is better than most-senior-role-gets-everything (fixture-09's approach). The prompt doesn't say. The classifier made two different choices. Flagging as something Phase 4 (Write) will encounter when rewriting these bullets.

### 3f. Classifier emits slightly different outputs across runs

Beyond the fixture-01 count shift mentioned in §3a: expect snapshot diffs between prompt-identical runs. For the fixture suite to be a regression-detection gate (Phase 5), we'll need structural diffing (number of positions, number of gaps, confidence floors) rather than byte-for-byte. Phase 3 doesn't wire this yet — I manually reviewed each snapshot by eye. Phase 4 or 5 should formalize.

### 3g. Phase 2.1 redactor had a Unicode-hyphen blindspot (found and fixed mid-Phase-3)

A full-corpus PII leak check on the classify snapshots caught two residual phone numbers (fixture-10 and fixture-15). Root cause: the phone regex in both `server/src/v3/test-fixtures/redact.ts` and `server/scripts/pii-scan.mjs` used the separator class `[-.\s]` — ASCII only. Fixtures 10 and 15 use Unicode **non-breaking hyphen** (U+2011) between digit groups, which word processors substitute for ASCII hyphen in phone numbers. The redactor wasn't even detecting the pattern as a phone. The PII scanner had the same blindspot, so the prior scan's `phone_us: 0` was a false-clean.

**Fix applied as part of Phase 3:**
- Phone regex in both tools now accepts `[-.\s\u2010-\u2014\u2212]` — covers U+2010 (hyphen), U+2011 (non-breaking hyphen), U+2012 (figure dash), U+2013 (en dash), U+2014 (em dash), U+2212 (minus sign).
- New test `handles Unicode hyphen separators (U+2011, U+2013)` in `redact.test.ts`.
- Re-ran `extract-fixtures.mjs` to re-redact with the fixed regex.
- Re-classified fixtures 10 and 15 (cost: $0.70).
- Independent Python cross-check confirmed: **0/19 classify snapshots contain candidate PII** (names, emails, phones, LinkedIn URLs).

This finding validates the **"silence is not success"** posture from the Phase 2 kickoff: the redactor's zero-residual report was wrong because the scanner had the same blindspot. Whenever the test tool and the production tool share a pattern, the test tool's success is not independent evidence. For Phase 4+ I'll use disparate patterns in any scanner intended to validate a redactor — e.g., pull phone-like heuristics from a different regex library — to avoid this class of recurrence.

---

## 4. What I deferred

- **Mocked-LLM classify unit tests.** Would be nice-to-have for `parseJsonOrThrow` / `validateOrThrow` edge cases, but fixture runs cover the happy path. Phase 4 will add if a specific failure mode keeps surfacing.
- **Snapshot structural diffing.** See §3f. Manual eyeballing used for Phase 3; formalize in Phase 5.
- **Determinism mechanism (§3a).**
- **Cross-role summary field decision (§3c).**
- **Pipeline integration test (mocked LLM).** Removed the Phase 1 smoke test; Phase 4 can add a narrower replacement once stages 3-5 exist.

---

## 5. Platform debt status

No new entries. GitHub issue #1 (48 pre-existing platform test failures on main) unchanged.

---

## 6. Questions for the human

1. **§3a Determinism**: accept non-determinism or pursue a mechanism (extended thinking budget, different model, etc.)?
2. **§3c Cross-role highlights**: schema addition or Stage 3's job?
3. **§3e Bullet attribution on stacked-title blocks**: codify a preference in the prompt (duplicate-with-confidence vs. most-senior-gets-all), or leave as classifier judgment?
4. **Phase 4 prereqs**: are my current Phase 4 assumptions (strategize accepts a StructuredResume + JobDescription; write runs per-section in parallel; verify is a single Opus call) still right? Or has anything shifted?

---

## 7. Commit plan for Phase 3

Six logical chunks, each internally consistent (`tsc --noEmit` green at every commit):

1. **`v3 phase 3: forward temperature through AnthropicProvider`** — one-line platform touch-up in both `chat()` and `stream()`.
2. **`v3 phase 3: zod schema for StructuredResume`** — `server/src/v3/classify/schema.ts` as the runtime validation substrate.
3. **`v3 phase 3: classify prompt v1.1 + implementation`** — the full classify wiring: prompt (+ archived v1.0), `classify/index.ts`, updated `stages-not-implemented.test.ts`, removal of `pipeline.test.ts`.
4. **`v3 phase 3: fixture runner for classify + cost tracking`** — `scripts/classify-fixtures.mjs`.
5. **`v3 phase 3: redactor Unicode-hyphen hotfix`** — phone regex fix in redactor + scanner, new test. Scoped separately because it's a Phase 2.1 defect surfaced by Phase 3's full-corpus leak check. Self-contained.
6. **`v3 phase 3: eval + report`** — the two report documents.

## 8. Review pointers

Spot-check targets for the 60-90 minute review you mentioned:

- `server/prompts/classify.v1.md` — read the 12 hard rules and their `<!-- Why: ... -->` rationales.
- `snapshots/fixture-09-jay-alger-.../classify.json` — the hardest U.S. Bank umbrella case (Collins Aerospace 5 sub-roles + Greatbatch 3 + Enpath acquisition).
- `snapshots/fixture-18-steve-alexander-.../classify.json` — Tatiana career-gap pattern in its purest form.
- `snapshots/fixture-14-lj-2025-.../classify.json` — unusual-formatting case after base64 stripping; Radiant→NCR acquisition preserved.
- `snapshots/fixture-04-bshook-.../classify.json` — cert/edu split with PMP + 2× LSS + MBA + BS EE in a single "Education & Certifications" source block.
- `docs/v3-rebuild/reports/phase-3-eval.md` — per-fixture table + cost trajectory.

Guardrail audit shortcut: `grep -rE 'function (filter|sanitize|ensure|coerce|salvage|derive|trimArtifact)' server/src/v3/classify/` should return zero matches.
