# Cover-letter gpt-5.4-mini trial plan

**Status:** Design — foundation code landed 2026-04-21; rewire + trial not yet run.
**Branch:** `rebuild/v3` (commits `af84c4c0` + `cb41f477` + this)
**Prerequisite:** Commits af84c4c0 / cb41f477 (primitive migration + promotion) soaked in production. The handoff at `memory/handoff-2026-04-20-v3-and-gpt54mini-rollout.md` §3 set this gate explicitly.

This document captures how to run the cover-letter gpt-5.4-mini trial — the first per-product migration of a non-v3 agent onto OpenAI. The goal of the trial is to validate (or disqualify) OpenAI for writer-class work outside v3 before touching Resume V2 or any of the high-blast-radius products.

---

## 1. Scope

### What migrates

Two cover-letter writer tools live at `server/src/agents/cover-letter/`:

| File | Tool | Model today | Shape |
|---|---|---|---|
| `writer/tools.ts` | `write_letter` | Groq Qwen3 via global `llm` (`MODEL_PRIMARY`) | Plain text output (the letter body) |
| `writer/tools.ts` | `review_letter` | Groq Scout via global `llm` (`MODEL_MID`) | JSON with `CoverLetterReview` schema |
| `analyst/tools.ts` | `analyze_jd` / `plan_letter` | Groq Scout via global `llm` (`MODEL_MID`) | JSON with analyst schema |

The trial swaps only the two **writer-tier** LLM calls (write + review). The analyst stays on Groq — it's an extraction + planning task where Qwen3 Scout is already adequate and the prose is never user-facing. Scoping this way keeps the A/B surface small enough to actually attribute quality differences to the model change.

### What doesn't migrate

- Analyst (`analyze_jd`, `plan_letter`) — stays on global `llm`.
- Exec-bio, LinkedIn optimizer, salary-negotiation, interview-prep, content-calendar, networking-outreach, personal-brand, 90-day-plan, retirement-bridge, onboarding, job-finder, job-tracker, linkedin-content, linkedin-editor, case-study, thank-you-note — wait for the cover-letter trial to complete before touching any of these.
- Resume V2 writer — already on DeepSeek V3.2 and beat gpt-5.4-mini on the internal 7.0/10 writing benchmark as of 2026-04-14. Do NOT regress that without a fresh head-to-head comparison.

---

## 2. Foundation (this session — 2026-04-21)

Three small additions landed so the trial can proceed by flipping env vars, not by code changes:

### 2.1 OpenAI in the main provider factory

`server/src/lib/llm.ts` — `buildProvider('openai')` now returns an `OpenAIProvider` (the class already existed in `llm-provider.ts`; it was only reachable through v3's own factory before). Reads `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`). No change to default routing.

### 2.2 Feature-scoped `coverLetterWriterLlm`

`server/src/lib/llm.ts` — new exported `coverLetterWriterLlm: LLMProvider` mirroring how `writerLlm` (the DeepSeek-scoped resume writer provider) works:

- Reads `COVER_LETTER_WRITER_PROVIDER` env var.
- If unset or equal to `ACTIVE_PROVIDER`, falls back to global `llm` (Groq today) — this is the no-op default.
- If set, builds the named provider and wraps with `FailoverProvider` so any provider construction error or runtime failure falls back to the global `llm`.

To activate OpenAI for cover-letter writers:

```
export COVER_LETTER_WRITER_PROVIDER=openai
export COVER_LETTER_WRITER_MODEL=gpt-5.4-mini
export OPENAI_API_KEY=sk-...
```

(The `MODEL` env var isn't yet read by anything — see §3 step 2 for where it plugs in.)

### 2.3 Structured-LLM primitive at shared location

`server/src/lib/structured-llm.ts` (commit `cb41f477`) is the retry primitive. Cover-letter's `review_letter` tool (which produces JSON) should wrap its LLM call through the primitive when the trial starts, so gpt-5.4-mini's stochastic schema-compliance issues (the `confidence: true` boolean-for-number class that drove v3's Fix 5) don't hard-fail the review step.

---

## 3. Trial execution — not yet run

The trial is four steps of work, in order. Each one gets its own commit.

### Step 1 — Rewire cover-letter writer tools to the feature-scoped provider

`server/src/agents/cover-letter/writer/tools.ts`:

- Replace `import { llm } from '../../../lib/llm.js'` with `import { coverLetterWriterLlm } from '../../../lib/llm.js'` for the two writer calls.
- Replace hardcoded `MODEL_PRIMARY` / `MODEL_MID` with model IDs read from env: `process.env.COVER_LETTER_WRITER_MODEL ?? MODEL_PRIMARY` and similar for the review tier.
- Don't touch `analyst/tools.ts`.

### Step 2 — Wrap `review_letter` in `structuredLlmCall`

`review_letter` currently does `llm.chat()` → `repairJSON()` → manual schema parse. The migration:

- Import `structuredLlmCall` + `StructuredLlmCallError` from `../../../lib/structured-llm.js`.
- Define a Zod schema for `CoverLetterReview` (if one doesn't exist in `cover-letter/types.ts`, add it there — it's the shape the current code already asserts informally).
- Swap the bespoke retry / error handling for a single `structuredLlmCall` invocation with a review-specific `buildRetryAddendum`.
- Preserve graceful degradation: if `structuredLlmCall` throws, return a default "review unavailable" score rather than propagating — the user-facing impact of a failed review is small; a failed `write_letter` would be larger but it's plain text, no schema.

### Step 3 — 10-fixture harness

New test / script at `server/scripts/cover-letter-comparison.mjs` (mirrors `server/scripts/classify-fixtures.mjs` pattern):

- Reads 10 fixtures from `server/__fixtures__/cover-letters/` — each is a JSON file with `{resume_data, jd_analysis}` (matching `CoverLetterState` input). Start with the resume fixtures already in `/fixtures` + 10 real JDs covering: Fortune-50 banking, early-stage SaaS, federal government, healthcare operations, retail ops, private equity portfolio ops, biotech, non-profit leadership, agency client services, mid-market manufacturing.
- For each fixture, runs the cover-letter pipeline twice: once with the current Groq defaults, once with `COVER_LETTER_WRITER_PROVIDER=openai`.
- Emits a side-by-side comparison JSON per fixture: both letters, token cost, latency, review-stage scores, human-readable diff of criteria notes.
- Outputs an aggregate report: cost delta, latency delta, win/loss/tie count on each of the five review criteria (voice_authenticity, jd_alignment, evidence_specificity, executive_tone, length_appropriateness).

### Step 4 — Go/no-go gate

Pass criteria (all must hold):

1. **Quality:** gpt-5.4-mini wins ≥7/10 fixtures on `evidence_specificity` + `voice_authenticity` (the two criteria where writer quality is most visible). Losses on those two criteria are disqualifying — that's the class of regression we care about.
2. **Cost:** average cost per fixture ≤2× the Groq baseline. gpt-5.4-mini at $0.25/M in + $2/M out vs Qwen3 at $0.29/$0.59 means the output-heavy writer call is ~3× more expensive per letter — acceptable for the quality lift, but monitor.
3. **Reliability:** zero hard failures across the 10 runs. Schema-retry fires are fine (the primitive catches them); un-caught errors are not.
4. **Latency:** p95 wall-clock ≤2× baseline. OpenAI + gpt-5.4-mini latency has been observed at 4–8s for ~500-token outputs on the v3 pipeline — expect similar for cover-letter writer.

If all four pass → commit the rewire + keep the env vars set in production.
If any fail → revert to Groq defaults, document the regression in the memory/handoff, move on to the next product (exec-bio is the natural second candidate — similar pipeline shape).

---

## 4. What NOT to do

Preserving these invariants from the handoff:

- **Do not flip the global `LLM_PROVIDER` to `openai`.** Per-product scoping only. A global flip would pull Resume V2, LinkedIn, job-tracker, everything onto OpenAI at once — that's exactly the mistake Codex correctly flagged on 2026-04-14.
- **Do not touch Resume V2's routing.** DeepSeek V3.2 won the 7.0/10 benchmark; don't regress that on vibes.
- **Do not start step 1 until commits `af84c4c0` + `cb41f477` have soaked in production for at least a couple of real pipeline runs.** The primitive is the safety net that makes the model swap safe; if it has a regression, we need to know that before changing a second product.
- **Do not broaden the trial to other products until cover-letter passes or fails.** The ordered list in the handoff is: cover-letter → exec-bio → LinkedIn optimizer → others. One product at a time.

---

## 5. Rollback

Single env-var change reverts the entire trial: `unset COVER_LETTER_WRITER_PROVIDER` returns the cover-letter tools to Groq. No code revert needed for a rollback — that's the reason the foundation is env-driven.

If step 2 (primitive wrap of `review_letter`) lands and turns out to be buggy, that one is a code revert. The writer-tool rewire (step 1) and the primitive wrap (step 2) should be separate commits for exactly this reason.
