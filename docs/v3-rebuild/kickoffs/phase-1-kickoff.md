# Phase 1 — Scaffolding

Paste this entire message into Claude Code to kick off Phase 1.

---

You are starting Phase 1 of the CareerIQ v3 resume writer rebuild. Before doing anything else, read these files in order:

1. `CLAUDE.md` at the repo root (operating manual, non-negotiables)
2. `docs/v3-rebuild/00-Executive-Summary.md`
3. `docs/v3-rebuild/01-Architecture-Vision.md`
4. `docs/v3-rebuild/02-Migration-Plan.md`
5. `docs/v3-rebuild/03-Prompt-Library-Structure.md`
6. `docs/v3-rebuild/05-Current-State-Audit.md` (skim, for context on what v2 looks like)

You are on the `rebuild/v3` branch. You have `--dangerously-skip-permissions`. Use autonomous judgment on mechanical work. Ask before deleting anything or touching files outside the v3 scope.

## Goal of this phase

Build the bones of v3. No prompts. No LLM calls. No fixtures. Just the directory structure, the prompt loader, the fixture runner skeleton, and the types. This is the scaffolding that every subsequent phase builds on.

## What to build

### 1. Directory structure

Create:

```
server/src/v3/
├── index.ts                 # pipeline entry point, wires stages together
├── types.ts                 # StructuredResume, Strategy, VerifyResult, etc.
├── pipeline.ts              # orchestrates the 5 stages
├── extract/
│   ├── index.ts             # Stage 1 implementation (empty stub for now)
│   └── extract.test.ts
├── classify/
│   ├── index.ts             # Stage 2 stub
│   └── classify.test.ts
├── strategize/
│   ├── index.ts             # Stage 3 stub
│   └── strategize.test.ts
├── write/
│   ├── index.ts             # Stage 4 stub (parallel section writers)
│   └── write.test.ts
├── verify/
│   ├── index.ts             # Stage 5 stub
│   └── verify.test.ts
├── prompts/
│   └── loader.ts            # loads prompt .md files with YAML frontmatter
└── observability/
    └── logger.ts            # per-stage structured logging

server/prompts/
└── README.md                # explains the prompt directory convention per doc 03

server/test-fixtures/
└── resumes/
    └── README.md            # explains the fixture directory convention
```

### 2. The prompt loader

`server/src/v3/prompts/loader.ts` reads a prompt file by name (e.g., `"classify.v1"`), parses YAML frontmatter, and returns:

```typescript
interface LoadedPrompt {
  stage: string;
  version: string;
  model: string;
  temperature: number;
  lastEdited: string;
  lastEditor: string;
  notes: string;
  systemMessage: string;
  userMessageTemplate: string;
}
```

The prompt file format is defined in doc 03. Use a battle-tested YAML parser (gray-matter is ideal). The loader supports variant selection for A/B testing: `loadPrompt("classify.v1")` vs `loadPrompt("classify.v2-test")`.

If a prompt file is missing, throw a loud error. No silent fallback.

### 3. The types

`server/src/v3/types.ts` defines the data shapes that flow between stages. Do not import any type from v2. Start fresh. At minimum:

- `ExtractResult` — output of Stage 1
- `StructuredResume` — output of Stage 2 (positions, education, certifications, skills, contact, discipline, confidence scores)
- `Strategy` — output of Stage 3 (emphasized accomplishments, positioning frame, objections, target discipline phrase)
- `WrittenResume` — output of Stage 4 (summary, accomplishments, competencies, per-position content)
- `VerifyResult` — output of Stage 5 (pass/fail, issues list)

Model them to match the stage descriptions in doc 01. If a shape feels awkward, flag it in your phase report — better to surface early.

### 4. The pipeline orchestrator

`server/src/v3/pipeline.ts` exports `runPipeline(input: PipelineInput): Promise<PipelineResult>`. For now, it wires stubs together. Each stub throws `NotImplementedError` so we can run the pipeline end-to-end and see the first unimplemented stage surface correctly.

Include structured logging at every stage boundary: start time, end time, input summary (not full content, which could be huge), output summary, errors. Use the logger at `server/src/v3/observability/logger.ts`.

### 5. The fixture runner skeleton

Create `server/src/v3/test-fixtures/runner.ts` (or similar path — use your judgment on where it fits). The runner:

1. Discovers all files in `server/test-fixtures/resumes/`
2. For each fixture, runs the v3 pipeline
3. Writes output to `server/test-fixtures/snapshots/<fixture-name>.json`
4. On subsequent runs, diffs against the snapshot and reports changes
5. Supports a `--prompt-variant` flag to swap prompt versions per doc 03
6. Supports a `--only <name>` flag to run a single fixture

The runner does not enforce pass/fail yet — no fixtures exist. It just runs clean and reports "0 fixtures found, 0 passed, 0 failed."

Add an npm script: `"fixtures": "tsx server/src/v3/test-fixtures/runner.ts"` or equivalent for the repo's tooling.

### 6. The README files

`server/prompts/README.md` — short, practical, per doc 03 section "The prompt README."

`server/test-fixtures/resumes/README.md` — explains that real resumes go here (anonymized as needed), and reminds the reader that the fixture directory is in `.gitignore` if the resumes contain PII. Add it to gitignore if not already.

## Constraints

- Do not import anything from `server/src/agents/resume-v2/`.
- Do not modify anything in `server/src/agents/resume-v2/`.
- Do not write any prompts. That is Phase 3's job. Just the loader and the structure.
- Do not write any LLM calls. The stage stubs should throw `NotImplementedError`.
- Every file you create gets a header comment explaining what it is and which doc it implements.
- Match the repo's existing code style (TypeScript config, lint rules, test framework). If there's ambiguity, ask.

## Definition of done

- `npm run build` succeeds
- `npm run test` passes (stubs have placeholder tests that assert `NotImplementedError` is thrown)
- `npm run fixtures` prints "0 fixtures found"
- All files committed with a descriptive commit history on `rebuild/v3`
- Phase report written to `docs/v3-rebuild/reports/phase-1-report.md` per the template in CLAUDE.md

## What I will check when you hand this back

- Does the directory match the spec?
- Does the prompt loader handle malformed YAML correctly (loud error, not silent)?
- Do the types look like they match doc 01's stage descriptions?
- Is the fixture runner runnable end-to-end (even with zero fixtures)?
- Are any imports from v2? (There should be zero.)

Begin.
