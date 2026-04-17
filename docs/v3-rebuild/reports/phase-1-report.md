# Phase 1 Report — Scaffolding

**Date:** 2026-04-17
**Branch:** `rebuild/v3`
**Scope:** `server/src/v3/`, `server/prompts/`, `server/test-fixtures/`, `docs/v3-rebuild/`

---

## 1. What I built

### `server/src/v3/` — the v3 tree (stubs + plumbing)

| File | Purpose |
|------|---------|
| `index.ts` | Public surface. Re-exports `runPipeline`, `loadPrompt`, `createV3Logger`, error classes, and all types. |
| `types.ts` | `ExtractResult`, `StructuredResume` (contact, positions, education, certifications, skills, career gaps, pronoun, ambiguity flags, per-field confidence), `Strategy`, `WrittenResume`, `VerifyResult`, `PipelineInput`, `PipelineResult`, `LoadedPrompt`. Zero imports from v2. |
| `errors.ts` | `NotImplementedError(stage)` and `PromptLoadError(message, cause)`. |
| `pipeline.ts` | `runPipeline(input)` orchestrator. Wires the five stages in sequence, logs start/end/ms for each, surfaces the first failure loudly. |
| `extract/index.ts` | Stage 1 stub — throws `NotImplementedError('extract')`. Real work lands in Phase 2. |
| `classify/index.ts` | Stage 2 stub — throws `NotImplementedError('classify')`. Phase 3. |
| `strategize/index.ts` | Stage 3 stub. Phase 4. |
| `write/index.ts` | Stage 4 stub. Phase 4. |
| `verify/index.ts` | Stage 5 stub. Phase 4. |
| `prompts/loader.ts` | `loadPrompt(name, options?)`. Reads `server/prompts/<name>.md`, parses YAML frontmatter with `gray-matter`, validates required fields (`stage`, `version` [must be a quoted string], `model`, `temperature` [must be a number]), splits body on `# User message template`. Normalizes YAML date values to UTC `YYYY-MM-DD`. Throws `PromptLoadError` on missing file, bad YAML, or missing/invalid required field. |
| `observability/logger.ts` | `createV3Logger(stage)` — thin wrapper around the platform Pino logger (`server/src/lib/logger.ts`) adding a `v3Stage` tag. One log stream, one format. |
| `test-fixtures/runner.ts` | CLI runner. Discovers fixtures in `server/test-fixtures/resumes/raw/`, runs each through the pipeline, writes per-stage artifacts to `server/test-fixtures/snapshots/<name>/`, diffs against prior snapshots. Supports `--only <name>`, `--prompt-variant <suffix>`, `--fixtures-root`, `--snapshots-root`, `--help`. Exported `runRunner()` also usable from tests. |

### `server/prompts/README.md`

Practical onboarding: directory layout, file format (with the "quote your version string" caveat), add-a-prompt flow, version-bump rules, A/B testing via `--prompt-variant`, and a pointer to doc 03. No prompts ship in Phase 1.

### `server/test-fixtures/resumes/README.md`

Explains the Phase 2 layout (`raw/`, `meta/`, `extracted/`) and the snapshot layout (`snapshots/<name>/{extract,classify,strategy,written,verify}.json`). Documents that `raw/`, `meta/`, `extracted/`, and `snapshots/` are gitignored for PII safety; only the README and the runner are tracked. The runner's Phase 1 invariant ("0 fixtures found") is documented so anyone can verify.

### `server/src/__tests__/v3/` — test suite (17 tests, all passing)

| File | What it covers |
|------|----------------|
| `errors.test.ts` | Both error classes carry the right name, message, and cause. |
| `stages-not-implemented.test.ts` | Each of the five stage stubs throws `NotImplementedError` with the stage name. |
| `pipeline.test.ts` | `runPipeline` surfaces the first stage's `NotImplementedError` rather than swallowing it. |
| `prompt-loader.test.ts` | Happy path; header-missing fallback; missing file; missing required fields; non-string `version`; non-number `temperature`; malformed YAML; empty system message before the user-template header. |
| `fixture-runner.test.ts` | `runRunner({fixturesRoot: empty})` reports `{found:0, passed:0, failed:0, drifted:0, fresh:0}`. |

### Infra edits (allowed per OPERATING-MANUAL.md autonomous scope)

- `server/package.json` — added `"fixtures": "tsx src/v3/test-fixtures/runner.ts"` script.
- `server/package.json` + `server/package-lock.json` — added `gray-matter ^4.0.3` as a runtime dependency (prompt frontmatter parsing).
- `/.gitignore` — added `server/test-fixtures/resumes/{raw,meta,extracted}/` and `server/test-fixtures/snapshots/` to prevent PII commits.

---

## 2. What works

- **Build.** `cd server && npm run build` exits 0. No TypeScript errors in v3.
- **Typecheck.** `npx tsc --noEmit` exits 0 from `server/`.
- **v3 tests.** All 17 tests pass. Full command: `npx vitest run src/__tests__/v3/`.
- **Platform tests baseline.** `npm test` from `server/` reports **2,796 tests across 114 files**: **2,748 pass**, **48 fail**, **0 error out on v3 code**. Every failure is in a pre-existing platform test file (`agent-loop-parallel`, `cover-letter-agents`, `executive-bio-agents`, `thank-you-note-agents`, `sprint11-lifecycle-hooks`, `interview-prep-agents`, etc.). The two root causes are mocked `llm.js` imports that don't export `getModelForTier` and a writer-model assertion (`expected 'orchestrator' → got 'primary'`) — v2/platform concerns, not v3. See §4.
- **Fixture runner clean.** `npm run fixtures` from `server/` prints `0 fixtures found, 0 passed, 0 failed, 0 drifted, 0 new` and exits 0. This satisfies the Phase 1 DoD.
- **No imports from v2.** `grep -rn "resume-v2" server/src/v3/` returns nothing. The clean break holds.

### Evidence snippets

```
$ npm run build
> resume-agent-server@0.1.0 build
> tsc
(exit 0)

$ npm run fixtures
> resume-agent-server@0.1.0 fixtures
> tsx src/v3/test-fixtures/runner.ts
0 fixtures found, 0 passed, 0 failed, 0 drifted, 0 new
(exit 0)

$ npx vitest run src/__tests__/v3/
 Test Files  5 passed (5)
      Tests  17 passed (17)
```

---

## 3. What is uncertain

These are places I made a judgment call. Flagging each for your review.

### 3a. Test file location (colocated vs. `__tests__/v3/`)

The Phase 1 kickoff §1 shows colocated tests (`server/src/v3/extract/extract.test.ts`). The repo's existing `vitest.config.ts` limits discovery to `src/__tests__/**/*.test.ts`. I had three options:

- **A.** Colocate per kickoff, extend `vitest.config.ts` to include `src/v3/**/*.test.ts` — but `vitest.config.ts` is outside the v3 scope defined in OPERATING-MANUAL.md.
- **B.** Colocate per kickoff, leave `vitest.config.ts` alone — tests become dead files, not discovered by vitest.
- **C.** Put tests in `src/__tests__/v3/` matching the existing repo convention.

I picked **C**. The kickoff also says "Match the repo's existing code style…if there's ambiguity, ask," and the repo's convention is `__tests__/`. No file in v3 scope was sacrificed; test discovery works.

**Proposed path forward:** in Phase 2, extend `vitest.config.ts` by adding `src/v3/**/*.test.ts` to the `include` list (one additive line) and move tests to colocation. I did not do this in Phase 1 because it touches a file outside my scope.

Please confirm: (i) colocate in Phase 2 via one-line config extension, (ii) stay in `__tests__/v3/` permanently, or (iii) something else.

### 3b. `gray-matter` moderate vulnerabilities

`npm install gray-matter` reports three pre-existing moderate vulnerabilities in the server tree — **but the vulnerabilities are in `brace-expansion`, `follow-redirects`, and `hono`**, not in gray-matter itself. gray-matter adds no new vulnerabilities. The three are pre-existing on `main`. Noting so you can decide whether to `npm audit fix` on a separate task; I did not touch it because it's out of v3 scope.

### 3c. Prompt loader splits on `# User message template` as a literal header

`splitPromptBody` uses a regex to find the `# User message template` markdown heading. This is a mechanical string operation (locating a literal header), not a semantic decision, so it falls within OPERATING-MANUAL.md's allowed-regex category. Calling it out here because "regex" in v3 code will rightly get scrutiny.

If the heading text ever changes, the split breaks silently by treating the whole body as the system message. I opted against throwing when the header is absent because Stage 5 (verify) may legitimately need no user-message template. Flagging in case you want stricter behavior (throw if `# User message template` missing) — easy to tighten in Phase 3 when the first real prompt lands.

### 3d. YAML type-coercion traps I discovered

Two bugs I hit and fixed (both surfaced by the loader tests I wrote):

1. **`version: 1.0`** parses as numeric `1` in YAML (trailing zero lost), then `String(1) === "1"` collapses semantic meaning. Fixed by requiring `version` to be a quoted string (throws `PromptLoadError` otherwise). doc 03's example shows `version: 1.2` unquoted — that would work accidentally (`1.2` survives as a float) but `version: 1.0` in the same example would fail. The README I wrote quotes `"1.0"`. Consider updating doc 03 for consistency at your convenience; I did not edit docs 00–05.
2. **`last_edited: 2026-04-17`** is parsed by YAML as a Date, then `toString()` TZ-shifts to local time. Fixed by formatting YAML Date values as UTC `YYYY-MM-DD`. Users can write dates naturally.

Both fixes are covered by tests.

### 3e. Fixture runner `--prompt-variant` wiring

The runner accepts `--prompt-variant <suffix>` and logs it, but does not yet pass it to any stage — there are no prompts to pass it to. Phase 3 (classify prompt) will wire this through; I left a `logger.info(…, 'prompt variant requested (not yet wired)')` breadcrumb to make the gap explicit at runtime. If you'd prefer an outright error until the wiring exists, say the word.

### 3f. Pipeline dispatch from the fixture runner with no file I/O

In Phase 1 the runner passes `{filename}` but no `buffer` or `text` to `runPipeline`. Since all stages are stubs, this is moot — the extract stub throws before any I/O matters. Phase 2 will read the fixture file into a `Buffer` and pass it in. I didn't pre-wire the read path to avoid silently committing an implementation that couldn't be verified against real fixtures yet.

### 3g. Platform test failures

48 pre-existing platform test failures exist on `rebuild/v3`. Sample files: `src/__tests__/agent-loop-parallel.test.ts`, `src/__tests__/cover-letter-agents.test.ts`, `src/__tests__/executive-bio-agents.test.ts`, `src/__tests__/thank-you-note-agents.test.ts`, `src/__tests__/sprint11-lifecycle-hooks.test.ts`. Root causes surface in the log:
  - `vi.mock("../lib/llm.js", ...)` returns a mock without a `getModelForTier` export; the live code in `src/agents/runtime/agent-loop.ts:101` calls `getModelForTier`, so mocked tests crash.
  - `writer model is orchestrator` assertions see `'primary'` instead of `'orchestrator'` — a model-tier routing drift.

These are **v2 / platform concerns**, not v3. Per OPERATING-MANUAL.md "If you find a bug in v2 while inspecting it for reference, log it in the phase report. Do not fix it." → logged, not fixed.

---

## 4. Platform debt logged

Tracking the 48 pre-existing platform test failures (§3g) as **[GitHub issue #1](https://github.com/Waconiajohn/resume-agent/issues/1)** so they don't block v3 and so the pattern doesn't get forgotten. Issue body describes the two dominant root causes (partial `vi.mock("../lib/llm.js", …)` missing `getModelForTier` export; writer-model tier drift `'primary'` vs asserted `'orchestrator'`) plus three outlier test files that need individual attention. Owned by whoever maintains the affected agent products; not on the v3 critical path.

This section exists so the audit trail is preserved after the Phase 1 commits are archived.

## 5. What I deferred

- **Moving tests to colocated layout.** Deferred pending 3a decision.
- **Adding `zod` schemas for the type shapes.** `zod` is already a server dependency. Phase 3's classify stage will need a zod schema to validate LLM output against `StructuredResume`. I defined the TS types in Phase 1 but did not add zod schemas yet — writing the schemas without the prompt to test against would be premature.
- **Extending `llm-provider.ts` to support `claude-opus-4-7` / `claude-sonnet-4-6`.** OPERATING-MANUAL.md says "Before Phase 3 begins, verify the provider supports…" — this is Phase 3's precondition check, not a Phase 1 task. I did not inspect `server/src/lib/llm-provider.ts` for Opus/Sonnet coverage in Phase 1.
- **Wiring the fixture runner to read files.** Deferred to Phase 2 alongside the real extract stage.
- **`--prompt-variant` propagation.** Deferred to Phase 3.
- **Fixing the 48 platform test failures.** Out of v3 scope.
- **`npm audit fix`.** Pre-existing moderate vulnerabilities, out of v3 scope.

---

## 6. Next phase prerequisites

Phase 2 ("Fixtures") needs:

- [ ] Raw resume files dropped into `server/test-fixtures/resumes/raw/` (you said you'd do this). The directory does not currently exist — Phase 2 will create it. Alternatively, I can create an empty `raw/` + `.gitkeep` now, but the path is already gitignored so `.gitkeep` would also be ignored; easier to let Phase 2 `mkdir -p` it.
- [ ] Decision on §3a (colocated vs. `__tests__/v3/` tests).
- [ ] The `mammoth` and `pdf-parse` npm packages (Phase 2 will install them per the kickoff, noting them in the phase-2 report).

Nothing in Phase 2 requires touching v2 or any file outside the v3 scope beyond `server/package.json`.

---

## 7. Questions for the human

1. **Test location (§3a).** Colocate via config extension, keep in `__tests__/v3/`, or another layout?
2. **Prompt README caveat vs. doc 03.** I documented the "quote your version string" caveat in `server/prompts/README.md`. doc 03's example still shows unquoted versions. Update doc 03 now, wait until Phase 3 when the first real prompt is written, or leave the caveat only in the README?
3. **Strictness around missing `# User message template` header (§3c).** Current: empty user template. Stricter alternative: throw. Preference?
4. **Whether to pre-create `server/test-fixtures/resumes/raw/`.** As noted in §5 it's gitignored, so a `.gitkeep` would not be tracked. Leave Phase 2 to create the directory on demand?
5. **Do you want the fixture runner to error instead of warn when `--prompt-variant` is passed before any stage consumes it (§3e)?**
6. **Platform test failures (§3g).** Out of v3 scope, but noting the drift here in case you want a separate issue/story opened against `main` to track them.

---

## 8. Commit history for this phase

Intended commits (one logical chunk each, all on `rebuild/v3`):

1. `v3 phase 1: scaffold types, errors, stages, pipeline, logger` — the v3 tree skeleton with stubs.
2. `v3 phase 1: prompt loader + tests` — loader, prompt README, loader tests, YAML-coercion fixes.
3. `v3 phase 1: fixture runner + tests` — runner, fixtures README, npm script, gitignore.
4. `v3 phase 1: report` — this file.

Each commit will satisfy `tsc --noEmit` and `npx vitest run src/__tests__/v3/` independently, so anyone reading the history can check out any intermediate SHA and verify.
