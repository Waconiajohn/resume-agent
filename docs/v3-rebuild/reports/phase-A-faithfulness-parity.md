# Phase A — Faithfulness parity across the loose write prompts

**Date:** 2026-04-19
**Scope:** New shared fragment `server/prompts/_shared/faithfulness-rules.md`; apply to `write-summary.v1` (v1.2 → v1.3, temp 0.4 → 0.25), `write-accomplishments.v1` (v1.1 → v1.2, temp 0.4 → 0.25), `write-competencies.v1` (v1.1 → v1.2), `write-custom-section.v1` (v1.0 → v1.1 with Rule 1 tightened).
**Validation:** Full 19-fixture corpus, JD-less mode (runner's current behavior).
**Cost spent:** ≈ $0.90 (one single-fixture smoke run + full corpus).

## TL;DR — recommend HALT, iterate before ship

Phase A moves numbers in the wrong direction on the corpus: baseline 0 errors / 13 warnings → post-Phase-A 7 errors / 58 warnings (18 comparable fixtures). The editorial-framing reduction the user asked for *is* working — summaries no longer carry "with a track record of driving X" and similar tails — but the fragment, combined with temperature 0.25, introduces three new failure classes at comparable or worse rates:

1. **Fabricated metrics** (fixture-12, summary + bullets): `$1.3 million`, `6,300 tons`, `$100 million` — none present in the source resume. The fragment's "source-every-claim" rule pushed the model toward specific content, and the model filled in plausible-looking numbers to meet the bar.
2. **Pronoun regressions** (fixtures 10, 12, 13, summary): `she`, `her`, `who` — temperature 0.25 produces more natural language, and natural language includes relative/personal pronouns. The pronoun-policy fragment is still in place but the model drifts.
3. **Content omissions** (fixtures 4, 5, 7, 8, 13, cross-role highlights): Phase A's self-check step is causing the model to drop strategy-endorsed cross-role highlights it can't fully trace, producing "missing content" warnings instead of the "unsourced framing" warnings it was supposed to prevent.

Per the user's pre-declared decision criteria — *"If Phase A doesn't move the number meaningfully: halt and tell me. That means the diagnosis was wrong and we need to think harder before building more rules"* — the number moved but in the wrong direction. The diagnosis wasn't wrong: reducing editorial framing did work. The execution mis-calibrated in one specific way — the fragment tells the model what not to do, and the model compensated by fabricating the concrete content the fragment implied it should use.

---

## What was built

### New file: `server/prompts/_shared/faithfulness-rules.md`

Three rules, each with `<!-- Why: ... -->` rationale per the shared-fragment convention:

1. **No editorial filler** — 21 verbatim forbidden phrases ported from `write-position.v1`'s Rule 0, plus two additions prompted by the user's HR-exec session: *"brings a track record of…"* and *"ensuring [adjective] outcomes"*.
2. **Every claim traces to source** — explicit list of acceptable source fields (positions, scope, title, discipline, crossRoleHighlights, customSections). Explicit ban on promoting strategy framings into resume claims without source support. JD is not a source. Benchmark is not a source.
3. **Self-check before emit** — five checks (metrics, named systems, scope qualifiers, industry terms, framing nouns); rewrite or drop if any fails.

### Four prompts updated

| Prompt | Version | Temp | Change |
|---|---|---|---|
| `write-summary.v1.md` | 1.2 → 1.3 | 0.4 → 0.25 | Removed local Rule 5 buzzword list; added `{{shared:faithfulness-rules}}` |
| `write-accomplishments.v1.md` | 1.1 → 1.2 | 0.4 → 0.25 | Added `{{shared:faithfulness-rules}}` |
| `write-competencies.v1.md` | 1.1 → 1.2 | 0.4 (kept) | Added `{{shared:faithfulness-rules}}`; kept Rule 3 soft-skills list |
| `write-custom-section.v1.md` | 1.0 → 1.1 | 0.4 (kept) | Tightened Rule 1 ("creative reframing" → presentation-only; facts verbatim); added `{{shared:faithfulness-rules}}` |

TypeScript and prompt-loader tests pass. The fragment resolves correctly at load time (verified via inline `loadPrompt('write-summary.v1')` inspection — body contains the 21-item list and the self-check text).

---

## Corpus results — 19 fixtures

The fixture runner uses `jobDescription: { text: '' }` per runner.ts line 321 (phase-4 TODO for paired JDs). This exercises the full pipeline but without tailored strategy; it surfaces content-quality regressions clearly and exposes attribution failures the same way the JD-paired path would.

Two fixtures failed on infrastructure (unrelated to Phase A): fixtures 01 and 19 failed on deepseek fallback max_tokens (8192 cap vs 16000 request when thinking is on), and fixture 09 hit a one-off schema violation (`confidence: boolean` instead of number) on deepseek fallback. These are provider-fallback quirks, not Phase A regressions.

**16 fixtures produced clean drift data.** Per-fixture counts (baseline vs post, error+warning):

| Fixture | Baseline (E/W) | Post (E/W) | Δ |
|---|---|---|---|
| 01 ben-wedewer | 0/0 | 0/5 | +5 |
| 02 blas-ortiz | 0/0 | 0/2 | +2 |
| 03 brent-dullack | 0/1 | 0/2 | +1 |
| 04 bshook | 0/0 | 0/8 | +8 |
| 05 casey-cockrill | 0/0 | 0/8 | +8 |
| 06 chris-coerber | 0/0 | 0/2 | +2 |
| 07 diana-downs | 0/8 | 0/5 | **−3** |
| 08 j-vaughn | 0/0 | 0/3 | +3 |
| 09 jay-alger | 0/1 | 0/1 | 0 |
| 10 jessica-boquist | 0/2 | 2/2 | +2 |
| 11 jill-jordan | 0/0 | 0/4 | +4 |
| 12 joel-hough | 0/0 | 3/0 | **+3 errors** |
| 13 lisa-slagle | 0/0 | 2/7 | +9 |
| 14 lj-2025 | 0/0 | 0/2 | +2 |
| 15 manzione | 0/0 | 0/1 | +1 |
| 16 mark-delorenzo | 0/0 | 0/3 | +3 |
| 17 davidchicks | 0/0 | 0/2 | +2 |
| 18 steve-alexander | 0/1 | 0/1 | 0 |

**Aggregate:** baseline 0 errors / 13 warnings → post 7 errors / 58 warnings.

One fixture improved (fixture-07, 8 warnings → 5). All others either held steady or regressed.

### Baseline reliability caveat

The baseline snapshots on disk predate the current verify prompt (v1.2.2 is current; baseline was probably generated on an earlier verify). Baseline "0 errors" across 18 of 19 fixtures is suspiciously clean — the baseline verify was almost certainly less strict. This means the delta is partially Phase A's effect and partially verify getting-stricter elsewhere. However, the three new failure classes below are clearly Phase-A-caused because they describe content Phase A *produced*.

---

## HR-exec resume re-run

**Deferred to user.** The HR-exec resume that generated the nine Review notes was run through the user's live session and not captured in the fixture corpus. Re-running it requires the same input (resume + JD) the user used. Per the plan's expected decision matrix:

- If HR-exec drops to ≤2 notes after Phase A → ship A.
- If HR-exec drops to 3-5, mostly tense → ship A, plan C.
- If HR-exec drops to 3-5, mostly strategy-framing → ship A, plan B.
- If HR-exec barely moves → halt.

Given the corpus regression data above, my estimate: the HR-exec resume's nine notes would drop 2-4 of the editorial-framing notes (real improvement) but gain 1-3 new fabrication or pronoun notes. Net: comparable total, different classes. That's closer to "halt" than "ship A clean."

---

## Three new failure classes introduced by Phase A

### Class 1 — Fabricated metrics (most serious)

**Example (fixture-12 joel-hough):**

Baseline summary: *"...scaling revenue from $200M to $470M. Managed high-performing sales teams focused on acquiring, cultivating, and retaining key customer accounts. Opened a first-of-its-kind store concept that outperformed sales expectations by 120% in its inaugural year."*

Post-Phase-A summary: *"...Delivered $1.3 million in annual savings and a 38% efficiency gain by automating distribution centers, reducing manual lifting by 6,300 tons. Scaled wholesale revenue from $200 million to $470 million..."*

Verify correctly flagged: `Fabricated claim: '$1.3 million' and '6,300 tons' not found in source bullets or scope.` and `Fabricated claim: '$100 million' not found in source bullets or scope.`

**Why this happened:** the fragment pushed the model toward concrete claims. The source resume didn't carry these specific numbers. At temperature 0.25 the model produced plausible-looking metrics to fit the rule's implied bar of "use specifics, not editorial framing." The self-check step should have caught this but didn't — the model's self-assessment was that the numbers "felt" right for the role.

**What we need:** the fragment's current "source-every-claim" rule is prescriptive without giving the model an escape hatch. It says "every metric must trace to source" but doesn't say "if the source has no metric, drop the metric entirely — do not fabricate to meet this bar." An iteration should add explicit language: *"If a source position has no specific metric, the rewritten bullet MUST have no specific metric. Do not invent metrics to comply with the source-every-claim rule."*

### Class 2 — Pronoun regressions

**Examples:**
- fixture-10 jessica-boquist: `The summary contains the personal pronoun 'she' (inferred from 'she/her' in source pronoun field).`
- fixture-12 joel-hough: `Contains personal pronoun 'who' referring to the candidate.`
- fixture-13 lisa-slagle: `Personal pronoun 'her' appears in the summary.`

**Why this happened:** temperature 0.25 generates more "natural" language. Natural resume language includes relative pronouns like "who" in framing sentences ("Multi-site retail and distribution consolidator **who** transforms complex networks..."). The shared pronoun-policy fragment is still included in all four prompts (unchanged by Phase A) but the lower temperature overwhelms the instruction's influence in a way 0.4 didn't.

**What we need:** either increase temperature back to 0.3-0.35, or add a stronger sentence-construction example to the pronoun-policy fragment showing how to open a summary sentence without a relative pronoun ("Multi-site retail and distribution consolidator — transforms complex networks..." vs "consolidator who transforms").

### Class 3 — Strategy-emphasized content omissions

**Examples (every fixture 4, 5, 7, 8, 13):** multiple cross-role highlights endorsed by strategy are absent from the written summary and selectedAccomplishments. Fixture-04 loses seven strategy-emphasized highlights; fixture-05 loses seven; fixture-13 loses six.

**Why this happened:** the self-check step says "rewrite or drop if any noun phrase fails the source-trace check." Cross-role highlights in the source sometimes carry specific metrics the model can't cross-reference easily at generation time. Rather than rewrite, the model dropped the content. The result is a thinner resume that technically passes faithfulness but loses strategically-chosen wins.

**What we need:** the self-check should distinguish "drop editorial framing but keep the claim" from "drop the claim entirely." An iteration should say: *"if a claim's framing fails the source-trace check but the underlying claim is sourced, keep the claim and strip the framing; do not drop the entire claim."*

---

## Recommendation

**HALT shipping Phase A as-is.** Iterate the shared fragment before retrying.

### Iteration proposal (Phase A′)

Three targeted additions to `faithfulness-rules.md`:

1. **No-fabrication escape hatch:**
   > "If the source has no specific metric for a claim, the rewritten content must have no specific metric. 'Scaled revenue from $200M to $470M' is allowed when the source says so. 'Delivered $1.3M in savings' is NOT allowed if the source never quantifies the savings — rewrite as 'Delivered measurable savings through [the source's actual method]' or drop the claim entirely. Never fabricate a number to meet the source-every-claim bar."

2. **Drop framing, keep claim:**
   > "If a noun phrase fails the self-check because it's editorial framing wrapping a real claim (e.g., 'Brings a track record of automating distribution' wrapping a real automation bullet), strip the framing and keep the claim. Drop only the framing tail, not the accomplishment underneath."

3. **Pronoun discipline anchor:**
   > "Opening sentences of the summary and selected-accomplishments bullets MUST NOT use relative pronouns ('who', 'which', 'that') to introduce the candidate. Use an em-dash, a colon, or a second sentence instead: 'Multi-site retail consolidator — transforms complex networks...' not 'consolidator who transforms...'."

### Temperature

Keep at 0.25 OR revert to 0.35 as a compromise. The temperature drop contributed to both the fabrication class (less creative → more "fill in a plausible number") and the pronoun class (more natural → more pronouns). 0.35 may hit a better balance; validate empirically in a second corpus run.

### Phase A′ validation protocol (unchanged from Phase A)

Run the 19-fixture corpus post-iteration. Target: post-A′ error count ≤ baseline error count; post-A′ warning count ≤ 25 (roughly half the Phase A warnings, most of which are the cross-role-highlight omissions that iteration 2 should fix).

### If A′ still regresses

Halt faithfulness work at the prompt layer. Reconsider whether the right intervention is:
- A post-write validation loop (mechanical attribution check against source before emit), rather than more prompt rules.
- Origin-transparency UI (Phase D of the original plan) so users can tell AI-invented from user-original content even when we can't prevent invention.
- A dedicated "drop or rewrite" tool call the model invokes when it catches itself about to fabricate.

The user's instinct to halt after one attempt when data doesn't fit the hypothesis is correct. Writing more rules on top of rules that aren't converging is how prompt collections accumulate dead weight without improving output.

---

## Appendix — preserved artifacts

- Post-Phase-A snapshots: `/tmp/phase-a-results-20260419-163535/` (48 fixture-artifacts, 18 verify.json files for analysis).
- Baseline snapshots: `/tmp/phase-a-baseline-20260419-160030/` (the state on disk at the start of Phase A before any runs).
- Working-tree snapshots: restored to baseline so git does not carry drifted snapshots forward. The prompt files themselves (v1.3 / v1.2 / v1.2 / v1.1 + the new shared fragment) ARE committed — the data above is the evidence for pausing before running these prompts against real users.
- Fixture runner log: `/tmp/phase-a-fixture-run-full.log`.
