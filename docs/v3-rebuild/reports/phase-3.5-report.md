# Phase 3.5 Report — Port to DeepSeek-on-Vertex

**Branch:** `rebuild/v3`
**Completed:** 2026-04-18
**Commits (in order):**
- `5bed4d9d` provider factory, shared scaffolding, defensive JSON
- `7264f17c` schema expansion (Bullet metadata + CustomSection)
- `fbcf6dcf` classify v1.3 port
- `7c3b3be5` VertexProvider.stream() refresh + merge, DeepSeek pricing
- `0385ce57` port Phase 4 prompts (strategize, write-*, verify, custom-section)
- `55e10a4e` nullable optional fields + 19-fixture classify baseline
- `5fefab11` pilot iteration — write-position Rule 1b + verify false-positive fixes

**Budget:** estimated $5-$15. **Actual total:** ~$0.50. (DeepSeek-on-Vertex pricing and the schema-calibration iterations are what kept this well under estimate.)

---

## 1. What was built

### Code
- `server/src/v3/providers/factory.ts` — capability→provider resolver. Production default Vertex-hosted DeepSeek; dev override `RESUME_V3_PROVIDER=anthropic`. Lazy instantiation, per-capability cache.
- `server/src/v3/providers/README.md` — env vars, failover chain, "how to add a capability" guide.
- `server/src/v3/prompts/loader.ts` — extended with `{{shared:...}}` interpolation, nested fragment support, capability-over-model frontmatter (legacy `model:` warns).
- `server/src/v3/classify/index.ts` — refactored to use `getProvider('strong-reasoning')`, `stripMarkdownJsonFence` before `JSON.parse`, richer telemetry (capability, backend).
- `server/src/v3/strategize/index.ts`, `server/src/v3/verify/index.ts` — same factory refactor.
- `server/src/v3/write/index.ts` — factory refactor, plus new parallel runner for `customSections` (one LLM call per identified section, invoking `write-custom-section.v1.md`).
- `server/src/v3/classify/schema.ts`, `server/src/v3/write/schema.ts` — expanded `Bullet` to include `is_new`, `source?`, `evidence_found` (in addition to `confidence`). New `CustomSection` / `WrittenCustomSection` shapes. Optional-string fields relaxed to `.nullable().optional()` to accept DeepSeek's explicit-null pattern.
- `server/src/v3/types.ts` — matching TS types.
- `server/src/v3/observability/logger.ts` — added `'providers'` stage tag.
- `server/src/lib/llm-provider.ts` — `VertexProvider.stream()` now refreshes OAuth token and merges system-prompt into first user message (matching `chat()`). Shared `prepareVertexParams()` helper.
- `server/scripts/ping-vertex.mjs` — one-shot Vertex reachability probe used at task start.
- `server/scripts/classify-fixtures.mjs`, `server/scripts/pipeline-fixtures.mjs` — pricing tables now include DeepSeek rows; pipeline script reads write telemetry's `sections.summary.model` for cost calc.

### Prompts (all versioned)
- `server/prompts/classify.v1.md` → **v1.3** (previous v1.2 archived to `prompts/archive/classify.v1.2.md`). Role opener ("senior resume intelligence analyst"), `{{shared:json-rules}}` + `{{shared:discipline-framing}}` references, ✓/✗ contrasts, bullet metadata emission (is_new=false / evidence_found=true), new Rule 15 for `customSections`.
- `server/prompts/strategize.v1.md` → v1.1. capability + shared refs.
- `server/prompts/write-summary.v1.md` → v1.1. v2's "ghostwriter" framing, XYZ sentence rules, buzzword ban, pronoun-policy + json-rules shared.
- `server/prompts/write-accomplishments.v1.md` → v1.1. capability + shared refs.
- `server/prompts/write-competencies.v1.md` → v1.1. **Reverses v1.0's soft-skill ban.** Accepts concrete executive soft skills ("Cross-Functional Leadership", "Change Management"); rejects personality traits ("Team Player", "Results-Driven"). Framing rules ported from v2's COMPETENCIES.
- `server/prompts/write-position.v1.md` → v1.1, then pilot iteration. Rules 1 / 1b / 2 / 2b tightened to: weight is a CEILING not a quota; do not synthesize bullets beyond source support; default to minimal rewriting. Bullet metadata emitted per-bullet.
- `server/prompts/verify.v1.md` → v1.1, then pilot iteration. Check 1 rebuilt around bullet metadata — uses `source` field (free-form string) as a hint, traces claims to StructuredResume for content check. Checks 3 (dates) and 9 (positionEmphasis round-trip) hardened against DeepSeek false positives. Editorial framing now warnings, not errors.
- `server/prompts/write-custom-section.v1.md` — **new**. Generic writer for Board Service, Patents, Publications, Speaking Engagements, Awards, Volunteer Leadership, etc. Framing rules ported from v2's CUSTOM_SECTIONS.

### Shared fragments (new directory `server/prompts/_shared/`)
- `README.md`
- `json-rules.md` — defensive JSON output + no-fence rule; each rule has a `<!-- Why: -->` comment.
- `pronoun-policy.md` — active-voice default + pronoun handling ported from v2.
- `discipline-framing.md` — how to name the candidate's discipline; ported from v2's `SOURCE_DISCIPLINE` body.

---

## 2. Provider factory behavior

### Capability-based routing
Prompts declare `capability: strong-reasoning` or `capability: fast-writer` in YAML frontmatter. `getProvider(capability)` returns `{ provider, model, backend }`. Stages never import `AnthropicProvider`, `VertexProvider`, etc. directly — that pattern is banned per OPERATING-MANUAL.md.

### Env var contract
- `RESUME_V3_PROVIDER` — `vertex` (default) or `anthropic`.
- `RESUME_V3_STRONG_REASONING_MODEL` — defaults: `deepseek-ai/deepseek-v3.2-maas` (vertex) / `claude-opus-4-7` (anthropic).
- `RESUME_V3_FAST_WRITER_MODEL` — defaults: `deepseek-ai/deepseek-v3.2-maas` (vertex) / `claude-sonnet-4-6` (anthropic).

### Failover chain (vertex backend)
Matches v2's `writerLlm` pattern:
```
RateLimitFailoverProvider(                  # 429s → DeepSeek direct
  VertexProvider,
  DeepSeekProvider, model='deepseek-chat'
)
  → wrapped (when DEEPINFRA_API_KEY) in FailoverProvider(primary, DeepInfraProvider)   # 5xx/timeouts
  → wrapped in DefensiveJsonProvider                                                   # mechanical fence strip + 1 JSON retry
```

### What changed from direct-provider era
Phase 3 classify and Phase 4 (strategize, write-*, verify) all had `new AnthropicProvider()` calls inline. Phase 3.5 replaces all with `getProvider(prompt.capability)`. Phase 4 work was preserved on tag `v3-phase4-opus-prototype` before the port.

### Also added
- **Lazy instantiation** — the factory does NOT call Vertex auth at import time. First `getProvider()` call is the first token fetch.
- **`DefensiveJsonProvider`** — wraps the whole chain. When `response_format: { type: 'json_object' }` is set, strips markdown fences mechanically; if `JSON.parse` still fails, retries once with the parser error fed back as system-message context. After retry failure it throws loudly with both attempts logged. Not a silent fallback.
- **`VertexProvider.stream()` override** — Phase 3.5 surfaced that v2 only ever used `chat()` on Vertex; `stream()` inherited `ZAIProvider.stream()` and did not refresh the token or merge system-prompt into the first user message. v3 classify and every other v3 stage streams, so `stream()` now does both (via shared `prepareVertexParams`).

---

## 3. Shared scaffolding state

Fragments:
- `json-rules.md` — referenced by classify, strategize, all write-*, verify, write-custom-section.
- `pronoun-policy.md` — referenced by write-summary, write-accomplishments, write-position.
- `discipline-framing.md` — referenced by classify, strategize.

Repeated patterns NOT yet extracted (candidates for future fragments):
- "Every metric must trace to source" — currently rewritten in each stage prompt.
- "No template placeholders, no redaction tokens, no AI artifacts" — appears in write-summary, write-accomplishments, write-position, write-custom-section as slightly different wording.
- The ✓/✗ example style itself — fine to keep per-prompt since examples are inherently stage-specific.

---

## 4. Schema changes summary

### Before
```ts
interface Bullet { text: string; confidence: number; }
interface StructuredResume { /* ... no customSections */ }
interface WrittenResume {
  summary: string;
  selectedAccomplishments: string[];
  coreCompetencies: string[];
  positions: WrittenPosition[];
  /* no customSections */
}
interface WrittenPosition { /* ... */ bullets: string[]; }
```

### After (Phase 3.5)
```ts
interface Bullet {
  text: string;
  is_new: boolean;
  source?: string | null;       // free-form locator (e.g. "bullets[0]", "bullets[0] + scope")
  evidence_found: boolean;
  confidence: number;
}

interface CustomSection {
  title: string;
  entries: { text: string; source?: string | null; confidence: number }[];
  confidence: number;
}

interface StructuredResume {
  /* ...existing fields... */
  customSections: CustomSection[];   // NEW
}

interface WrittenCustomSection {
  title: string;
  entries: { text: string; source?: string | null; is_new: boolean; evidence_found: boolean; confidence: number }[];
}

interface WrittenResume {
  summary: string;
  selectedAccomplishments: string[];
  coreCompetencies: string[];
  positions: WrittenPosition[];     // bullets now Bullet[], not string[]
  customSections: WrittenCustomSection[];   // NEW
}

interface DateRange {
  start: string | null;   // was required string; relaxed because DeepSeek emits null for unknown starts
  end: string | null;     // unchanged
  raw: string;
}
```

Optional string fields across the schema were also relaxed to `.nullable().optional()`. DeepSeek prefers explicit `null` where Opus omits the key — both are valid JSON for optional fields.

---

## 5. Prompt porting decisions — per prompt

### classify.v1.3
- **From Opus v1.2 → DeepSeek v1.3.** Role opener added; `{{shared:json-rules}}` replaces the inline JSON rules section; `{{shared:discipline-framing}}` replaces Rule 5's body (Rule 5 is now a one-line pointer).
- ✓/✗ contrasts added to Rules 2, 5, 9, 10, 11, 12 — v2 pattern.
- Bullet schema emits new per-bullet metadata (every classify bullet has `is_new: false`, `evidence_found: true`, optional `source`).
- **Rule 15 new**: `customSections` emission (Board Service, Patents, Speaking Engagements, etc.) with an example.
- All 14 hard rules from v1.2 preserved (stacked-title attribution, cross-role highlights, redaction-token literalism, umbrella handling, etc.).

### strategize.v1.1
- Minimal-change port. Frontmatter updated; `{{shared:json-rules}}` and `{{shared:discipline-framing}}` injected. The six hard rules from v1.0 (emphasized accomplishments, positioning frame, objections, position emphasis, target discipline, notes) remained unchanged — they performed well in Phase 4 pilot.

### write-summary.v1.1
- Role opener reframed as v2's "ghostwriter for a senior executive" language.
- Sentence-structure rules (XYZ formula, one-claim-per-sentence) added with ✓/✗ contrasts.
- Buzzword ban ("spearheaded", "leveraged", "results-driven", etc.) — lexical filter the model can self-check.
- `{{shared:pronoun-policy}}` and `{{shared:json-rules}}` references.

### write-accomplishments.v1.1
- Minimal-change port; shared fragments + capability frontmatter. Rules 1–6 unchanged.

### write-competencies.v1.1 (reversal)
- **Reverts the v1.0 soft-skill ban.** Concrete executive soft skills ("Cross-Functional Leadership", "Change Management", "Organizational Transformation") are now acceptable; personality traits ("Team Player", "Results-Driven", "Detail-Oriented") are rejected via explicit ✗ examples.
- Framing rules ported from v2's COMPETENCIES prompt.
- JD-keyword mirror rule added (Rule 6).

### write-position.v1.1 + iteration
- Initial v1.1 port: role opener, ✓/✗ contrasts, shared refs, bullet metadata emission.
- **Pilot iteration**: Rule 1 rewritten to make weight a CEILING not a quota. Rule 1b added with explicit forbidden patterns and direct ✗ examples.
- **Chunk-1 iteration**: Rule 2 extended with more forbidden-tail patterns ("establishing a culture of X", "driving operational excellence", "Supplier Corrective Action Requests (SCARs)" acronym expansion); Rule 2b ("default to minimal rewriting") added.

### verify.v1.1 + iteration
- Check 1 rebuilt around the new bullet metadata. `source` is a free-form string hint — the verifier uses it to locate source bullets and then checks CONTENT, not FORMAT.
- Check 3 normalizes whitespace + dash types (en-dash vs hyphen) before declaring a date mismatch.
- Check 9 forced explicit set construction before reporting positionEmphasis round-trip errors.
- **Chunk-1 iteration**: editorial framing ("driving operational excellence", "building culture of X") downgraded from error to warning. Acronym expansion and synonym substitution are not errors. Added "two-step check" instruction requiring the verifier to scan all source bullets in the position before emitting an error.
- **Check 10 new**: custom-sections round-trip validation.

### write-custom-section.v1.0 (new)
- Role opener, framing rules ported from v2 CUSTOM_SECTIONS ("TRUTHFULNESS — DO NOT SILENTLY INVENT" section).
- Rule 6 ("10-20% back-off on inferred metrics") ported from v2.
- Output shape includes full bullet metadata (is_new, source, evidence_found, confidence).

---

## 6. Classify v1.2 → v1.3 diff

- Frontmatter: `model: claude-opus-4-7` → `capability: strong-reasoning`.
- System message: adds `{{shared:json-rules}}` (replaces ~15 lines of inline JSON-output rules) and `{{shared:discipline-framing}}` (replaces Rule 5's 20-line body with a one-line pointer + ✓/✗ examples).
- Rule 1 (career gap) — unchanged text, added ✓/✗ contrasts.
- Rule 11 (bullets) — rewritten to cover the new per-bullet metadata emission (every classify bullet has `is_new: false`, `evidence_found: true`, optional `source`).
- Rule 15 **new**: customSections structured emission. Full example added to the example section.
- Schema section updated: bullets now have `is_new`, `source?`, `evidence_found`, `confidence`; new `customSections[]` entry in the top-level output shape.
- Examples: every bullet in every example now shows the extended metadata.

**Structural changes:** ~75 lines of inline "JSON output rules" removed (now referenced from `_shared/`); ~25 lines added for Rule 15 + custom-sections example; ~50 lines of bullet-metadata emission language. Net length similar.

---

## 7. Full-pipeline fixture results

All 19 fixtures processed end-to-end on DeepSeek-on-Vertex (classify v1.3 → strategize v1.1 → write-* v1.1 → verify v1.1, all against JD `jd-01-under-armour-account-manager-wholesale`). Skip-classify mode reused the v1.3 classify baselines.

| # | fixture | category | verify | errors | warnings | stage where errors originated |
|---|---|---|---|---|---|---|
|  1 | 01-ben-wedewer              | executive                        | FAIL |   5 |   3 | positions |
|  2 | 02-blas-ortiz               | executive_international          | PASS |   0 |   9 | — |
|  3 | 03-brent-dullack            | mid_career_with_gap              | FAIL |   5 |   2 | positions, summary |
|  4 | 04-bshook                   | technical_to_management          | FAIL |   2 |   5 | positions |
|  5 | 05-casey-cockrill           | executive                        | FAIL |  16 |  15 | positions, summary |
|  6 | 06-chris-coerber            | technical                        | PASS |   0 |   3 | — |
|  7 | 07-diana-downs              | female_technical_with_template   | FAIL |   6 |   9 | selectedAccomplishments, summary |
|  8 | 08-j-vaughn                 | technical_international          | PASS |   0 |  17 | — |
|  9 | 09-jay-alger                | executive                        | PASS |   0 |   2 | — |
| 10 | 10-jessica-boquist          | consultant_short_tenures         | FAIL |  13 |   5 | positions |
| 11 | 11-jill-jordan              | executive                        | PASS |   0 |   2 | — |
| 12 | 12-joel-hough               | executive_non_technical          | PASS |   0 |   8 | — |
| 13 | 13-lisa-slagle              | female_technical_with_template   | PASS |   0 |   4 | — |
| 14 | 14-lj-2025                  | unusual_formatting               | PASS |   0 |  11 | — |
| 15 | 15-manzione                 | technical_creative               | PASS |   0 |   3 | — |
| 16 | 16-mark-delorenzo           | technical_with_license           | FAIL |  12 |   6 | positions, summary |
| 17 | 17-david-chicks             | technical                        | FAIL |  18 |  11 | positions, summary |
| 18 | 18-steve-alexander          | current_career_gap               | PASS |   0 |   8 | — |
| 19 | 19-steve-goodwin            | unusual_formatting               | FAIL |  26 |  12 | positions |

**Verify pass rate:** 10/19 (53%). Target was 18/19. The target was not met.

**Classify pass rate (structural):** 19/19 (after the two `dates.start` null-tolerance fix). The classify stage is solid; all parsing failures got absorbed by the schema calibration.

**Error stage attribution:** of the 9 fixtures that failed verify, **all 9 had errors originating in `positions[].bullets`** (the per-position writer). 4 fixtures also had errors in `summary`. 1 fixture had errors in `selectedAccomplishments`. No fixture had errors in `competencies` or `customSections` (the competencies reversal + the new custom-section writer both behave well).

## 8. Cost totals

Cost model: DeepSeek V3.2 on Vertex @ $0.14/M input, $0.28/M output.

| Stage | aggregate input tokens (19 fixtures) | aggregate output tokens | aggregate cost |
|---|---|---|---|
| Classify (v1.3, last fresh run) | ~235,000 | ~55,000 | $0.048 |
| Strategize (v1.1, last fresh run) | ~140,000 | ~19,000 | $0.025 |
| Write (v1.1 + pilot iteration, last fresh run) | ~1,420,000 | ~48,000 | $0.213 |
| Verify (v1.1, last fresh run) | ~190,000 | ~20,000 | $0.032 |
| **Full-pipeline per-fixture (last run)** | | | **~$0.015** |
| **Full 19-fixture run aggregate** | | | **~$0.31** |

**Total Phase 3.5 LLM spend (all iteration cycles, pilots, re-runs):** ~$0.50. The estimate was $5-$15; actual is 10x lower. Two reasons:
1. DeepSeek-on-Vertex is cheap (~$0.015/fixture end-to-end, not the ~$1.30 Opus/Sonnet estimate).
2. The schema-calibration fixes (nullable fields, stream-token refresh) absorbed what would have been repeated iteration cycles on classify.

## 9. What's uncertain

### Write-position prompt remains the dominant quality bottleneck

9 of 9 failed fixtures have errors originating in `positions[].bullets`. After three iteration cycles on `write-position.v1.md` (adding Rule 1b, Rule 2b, explicit ✗ patterns, "default to minimal rewriting") the prompt improved some fixtures dramatically (fixture-18: 19 errors → 0; fixture-05: 19 → 6 → 16 — **not monotonically improving**) but did not converge across the full corpus. DeepSeek V3.2 on Vertex has a consistent bias toward adding editorial framing ("driving operational excellence", "establishing a culture of X", "building a foundation for …") to source bullets, and toward padding to the bullet-count ceiling even when source material is thin.

Recommendation for next phase: either (a) restructure write-position around a micro-task chain (one source bullet in, one rewritten bullet out, no cross-bullet synthesis allowed), or (b) move the position writer to `strong-reasoning` capability for bullet-attribution discipline and absorb the cost — still well under budget at Vertex-DeepSeek prices.

### DeepSeek non-determinism at temperature 0.4

Back-to-back runs of the same fixture produce different bullet counts, different synthesis patterns, and different verify results. fixture-01 (pilot iteration 2) passed with 0 errors; fixture-01 (a later run on the same prompts) produced 5 errors. Chunk-1 fixture-05 scored 19 errors; fresh re-run scored 6; another re-run scored 16. Lowering temperature to 0.2 on write-position may help; untested.

### Verify false-positive residue

The verify-v1.1 iteration addressed three specific patterns (source-reference format, date-string equality, positionEmphasis set comparison), but DeepSeek-as-verifier still occasionally emits errors for phrases that DO appear in the source. On fixture-05 the verifier flagged "ensuring on-spec execution" as unsourced even though that exact phrase is in source bullet[1]. The "scan ALL source bullets before emitting an error" instruction did not fully land on DeepSeek.

Recommendation: split verify into two stages — a deterministic substring-presence check (mechanical) that runs first against every is_new:true bullet's `source` reference, and an LLM-check that runs only on the residue. Mechanical substring attribution for roughly 80% of claims would remove DeepSeek verify's bulk of false positives. (This is NOT a guardrail — it is a mechanical check that belongs in code per the core principle.)

### "Editorial framing is a warning, not an error" rule on DeepSeek

The verify prompt explicitly says phrases like "driving operational excellence" should be WARNINGS, not errors. DeepSeek as the verify model ignores this distinction roughly half the time and issues errors anyway. The verify prompt's Rule 4 may need a stronger ✓/✗ table showing what's warning-vs-error; untested.

### Custom sections: fixture coverage

None of the 19 fixtures in the corpus contain custom sections (Board Service, Patents, etc.) per classify's current emission. The custom-section writer ran zero times across the 19 pipeline runs. The code path compiles and round-trips in types; behavior on a real custom-section corpus is unverified.

### Prompt-level temperature changes not explored

Phase 3.5 kept the write prompts at temperature 0.4 (the Phase 4 original). DeepSeek V3.2 is known to stabilize at lower temperatures; a one-shot change to 0.2 on write-position could be a significant quality gain. Not tested this phase.

## 10. What's deferred

- **Write-position v1.2 convergence.** Continuing to iterate on the prompt (in-conversation) hit diminishing returns. A dedicated iteration pass with temperature adjustment and possibly the micro-task-chain restructure is the right approach, not more in-session tweaks.
- **Mechanical substring verify layer.** Not built. Would require a new `server/src/v3/verify/attribution.ts` that does deterministic substring matching for `is_new: true` bullets against their `source` reference, leaving the LLM verify with only the edge cases.
- **Full pipeline cost run on Anthropic backend for quality comparison.** Not done. Would confirm whether the write-position issues are DeepSeek-specific or prompt-structural.
- **JD variety.** All 19 fixtures ran against the same JD (`jd-01-under-armour-account-manager-wholesale`). The strategize outputs would vary against different JDs; the pilot fixture-18 had its positioning frame shift appropriately ("sales leader scaling high-growth accounts") which is a positive signal, but cross-JD coverage is deferred.
- **Loader tests.** The loader's `{{shared:...}}` interpolation, capability-inference warn path, and circular-reference detection have no unit tests yet.
- **Factory tests.** Similarly no unit tests for `getProvider` lazy instantiation, cache behavior, or the `DefensiveJsonProvider` retry path.

## 11. Ready for Phase 4 cleanup or Phase 5 shadow deploy?

**Not ready for Phase 5 shadow deploy.** The 10/19 verify-pass rate would ship visibly degraded output compared to v2's production baseline. Two classes of problem need to be closed first:

1. **Write-position hallucination tendency on DeepSeek** — the dominant source of verify errors. A focused iteration (Phase 4 cleanup) should bring this to the 18/19 target. The prompt has the right shape and rules; it needs convergence testing with temperature adjustment and possibly a structural restructure.
2. **Verify false-positive residue** — the mechanical substring check would take ~50 lines of new code in `verify/attribution.ts` and would retire the bulk of DeepSeek-verify false-positive noise.

**Ready for Phase 4 cleanup work.** The foundation is solid:
- The factory, shared scaffolding, schema expansion, and provider plumbing all work as designed.
- Classify is at 19/19 structural pass.
- The competencies reversal and custom-sections capability are implemented.
- Cost is 1/10th of the budget estimate.
- Every deviation from the Phase 4 Opus-era behavior is documented with ✓/✗ contrasts and `<!-- Why: -->` rationale.

**Suggested next phase scope:**
- One focused iteration on `write-position.v1.md` (likely v1.2 or v2) — including a temperature-0.2 experiment.
- Build the mechanical `verify/attribution.ts` substring-presence check.
- Re-run fixtures; target 18/19 verify pass.
- At that point: consider Phase 5 (shadow deployment) with confidence.

## 12. Questions for the human

1. **Iterate further on write-position now, or defer to a scoped Phase 4 cleanup?** An additional 2-3 hours of prompt iteration (and possibly a temperature change) could plausibly close the gap to 18/19. Doing it inside Phase 3.5 keeps the work together; deferring preserves a clean phase boundary.
2. **Mechanical substring attribution check — OK to build?** It's code that does substring matching for claim attribution; it is NOT a guardrail (it does not repair output, it only labels `is_new: true` bullets whose `source` reference maps cleanly to source content and flags the residue for LLM verify). Phase 3.5 did not build it because it's code, not prompts.
3. **Custom sections corpus gap.** None of the 19 fixtures exercise custom sections. Do we add 1-2 fixtures with Board Service / Patents / Publications blocks to the corpus, or is custom-section validation deferred to post-launch observability?
4. **Anthropic backend as CI sanity check.** Should Phase 4 cleanup include a one-shot 19-fixture run on `RESUME_V3_PROVIDER=anthropic` for comparison, even at the ~$25 cost? That would tell us whether the write-position issues are DeepSeek-specific or prompt-structural.

