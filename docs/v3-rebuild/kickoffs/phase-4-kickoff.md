# Phase 4 — Stages 3, 4, 5 (Strategize, Write, Verify)

Paste this into Claude Code after Phase 3 is complete and classify has been approved at the review checkpoint.

---

You are starting Phase 4 of the CareerIQ v3 rebuild. Re-read `CLAUDE.md`, doc 01, doc 02, and doc 03 before starting. Phase 3's classify is trusted — every downstream stage consumes its output without re-parsing, re-validating, or second-guessing.

## Goal of this phase

Build Stages 3 (Strategize), 4 (Write), and 5 (Verify). Three stages, six prompt files, three stage implementations. By the end of this phase, the v3 pipeline runs end-to-end on every fixture and produces a complete resume with a verification result.

## What to build

### Stage 3 — Strategize

`server/src/v3/strategize/index.ts` exports `async function strategize(resume: StructuredResume, jd: JobDescription): Promise<Strategy>`.

Prompt: `server/prompts/strategize.v1.md`. The prompt instructs the model to:
- Identify the 3-5 accomplishments most relevant to the target JD
- Determine a positioning frame that tells this candidate's story (e.g., "consolidator", "builder", "turnaround leader", "technical specialist-to-leader")
- Identify 2-3 likely hiring manager objections (gaps, career jumps, missing credentials) and how the resume should preempt each
- Recommend which positions get most bullet real estate vs. brief treatment
- Output a target discipline phrase for the branded title in the summary

Model: Opus. Temperature: 0.4. Strategy benefits from some creativity but should stay grounded.

The strategy prompt does not need to be defensive against bad input — classify's output is trusted. The prompt should focus on doing the strategy work well, not on filtering or correcting resume data.

Every rule in the prompt has a "why" comment per doc 03.

### Stage 4 — Write

`server/src/v3/write/index.ts` exports `async function write(resume: StructuredResume, strategy: Strategy): Promise<WrittenResume>`.

Internally, Stage 4 runs parallel section writers:
- `writeSummary(resume, strategy)` — executive summary
- `writeAccomplishments(resume, strategy)` — selected accomplishments section
- `writeCompetencies(resume, strategy)` — core competencies
- `writePosition(position, strategy)` — called once per position, in parallel across all positions

Four prompt files, one per section type:
- `server/prompts/write-summary.v1.md`
- `server/prompts/write-accomplishments.v1.md`
- `server/prompts/write-competencies.v1.md`
- `server/prompts/write-position.v1.md`

Each prompt enforces the resume writing constraints that v2's writers tried to enforce via post-processing guardrails:
- Active voice by default (or consistent gendered pronouns if classify identified gender with high confidence)
- No pronouns in summary unless explicitly desired by style
- No inventing metrics that aren't in the source material
- Bullet count ranges per position (configurable in prompt frontmatter)
- No concatenation artifacts — each bullet is a single coherent statement
- No duplicate or near-duplicate bullets within a role
- JD keywords integrated naturally, never keyword-stuffed

The critical move: each prompt produces clean output directly. No downstream trimmer, no deduplicator, no pronoun corrector. If a prompt produces bad output on a fixture, you iterate the prompt. You do not add a guardrail.

If you find yourself wanting to add a function named `dedupeBullets`, `fixPronouns`, `trimConcatenation`, `ensureMinCount`, or anything in that family, stop. That's the prompt's job. The whole point of this project is that those functions do not exist in v3.

Model: Sonnet is fine for section writers. Temperature: 0.4. These are executing a clear plan.

Parallelize aggressively. Summary, accomplishments, competencies, and every position can all fire concurrently. Stage 4 should complete in roughly the time of the slowest single call.

### Stage 5 — Verify

`server/src/v3/verify/index.ts` exports `async function verify(resume: WrittenResume, source: StructuredResume, strategy: Strategy): Promise<VerifyResult>`.

Prompt: `server/prompts/verify.v1.md`. The prompt instructs the model to check:
- Every numeric claim in the resume traces to source material in the structured resume
- No pronouns unless explicitly allowed by style
- Dates are consistent (no overlapping positions unless source data shows them, no future dates)
- No duplicate or near-duplicate bullets within any role
- Summary aligns with the strategy's positioning frame
- JD keywords are naturally integrated (present in source material, used in appropriate sections)
- No leftover template placeholders or LLM artifacts ("as an AI...", "[INSERT X]", etc.)

Output: `VerifyResult` with `passed: boolean` and `issues: Issue[]` where each issue has severity (error, warning) and a specific description.

When verify fails, the pipeline surfaces the failure to the user with specific issues. It does not silently patch and continue. This is the single most important safety rail — without it, classify or write could degrade and we wouldn't know.

Model: Opus. Temperature: 0.1. Verification is a last-line defense.

### Pipeline wiring

Update `server/src/v3/pipeline.ts` to run all five stages end-to-end. Each stage logs its inputs and outputs via the observability logger. The pipeline result includes every stage's output so debugging a bad run means inspecting the chain, not guessing.

### Fixture evaluation

Run the full pipeline against every fixture. Save per-stage snapshots to `server/test-fixtures/snapshots/<fixture-name>/`. Produce `docs/v3-rebuild/reports/phase-4-eval.md` with:
- Per-fixture: did pipeline complete? Did verify pass? What issues did verify flag?
- Examples of good output (best 3 fixtures, with brief notes on why they're good)
- Examples of weak output (worst 3 fixtures, with diagnosis: which stage is the weak link?)
- Pattern analysis: are there systematic issues across fixtures?

### Iterate

Based on the evaluation, iterate prompts. Bump versions per doc 03. Every iteration re-runs the full suite. Goal: every fixture passes verify with at most minor warnings.

Doc 02's quality gate for this phase is explicit:
- Every fixture produces a complete resume (no missing sections)
- Zero phantom positions
- Zero concatenation artifacts
- Pronouns match candidate's apparent gender (or are active-voice)
- Education has no certifications bleeding in
- Discipline in branded title matches candidate's actual field

Honor this gate. Do not proceed to Phase 5 (shadow deployment) with known regressions.

## Constraints

- Zero guardrail functions. This is the architectural thesis. If you catch yourself wanting one, the upstream prompt is the problem.
- Stages trust upstream output. Write does not re-parse classify's output. Verify checks but does not patch.
- All prompts are files. No inline strings.
- Every prompt rule has a "why" comment.
- Parallelization in Stage 4 must actually parallelize. Wall-clock time matters — the project's non-negotiables include "Total pipeline time under 60 seconds for a typical resume."

## Definition of done

- Four write prompts, one strategize prompt, one verify prompt — all exist and pass fixture suite
- Full pipeline runs end-to-end on every fixture
- Every fixture passes verify with no errors (warnings are okay if documented)
- Pipeline p95 latency is under 60 seconds on a representative fixture
- Zero functions in the v3 codebase whose names contain `filter`, `sanitize`, `ensure`, `coerce`, `salvage`, `derive`, or `trim*Artifact*`
- Phase report written to `docs/v3-rebuild/reports/phase-4-report.md`

## What I will check

- Read 5 full end-to-end resume outputs. Are they good? Would I send them to a hiring manager?
- Grep the v3 codebase for guardrail function names. There should be zero matches.
- Check that verify is catching real issues, not rubber-stamping. If verify passes every fixture with zero warnings ever, verify is too lenient.
- Check timing. Is Stage 4 actually parallel? Is the pipeline under 60 seconds?
- Read the "what is uncertain" section of your report carefully. This is where real issues hide.

If output quality is weak on specific fixtures, we iterate prompts. We do not ship a v3 that regresses against what we know the system could produce.

Begin.
