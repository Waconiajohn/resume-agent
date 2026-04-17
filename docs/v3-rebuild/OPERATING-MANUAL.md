# Operating Manual — CareerIQ v3 Resume Writer Rebuild

## Precedence

This manual is authoritative for any work inside `server/src/v3/`, `server/prompts/`, `server/test-fixtures/`, or `docs/v3-rebuild/`.

It overrides the following sections of the repo-root `CLAUDE.md` for v3-scoped work only:

- **§3 — Agent-First Architecture Mandate.** v3 is a five-stage pipeline (extract, classify, strategize, write, verify), not an agent system. The v3 stages are functions that call LLMs, not agents with AgentBus, buildAgentMessage, scratchpad/state transfer, or gate structures.
- **§4 — Agent Integrity Mandate.** Same reason. v3 has no `buildAgentMessage`, no `validateAfterAgent`, no `onComplete` scratchpad→state transfer, and no gates in ProductConfig. Hard Rules 1–6 presume the agent runtime that v3 does not use.
- **§7 — Scrum Workflow.** v3 uses phase kickoffs (`docs/v3-rebuild/kickoffs/phase-N-kickoff.md`) and phase reports (`docs/v3-rebuild/reports/phase-N-report.md`) as its cadence. No `CURRENT_SPRINT.md`, no story format, no sprint retrospectives. Commits on `rebuild/v3` use descriptive messages rather than the `[SPRINT-X][STORY-NAME]` format.
- **§13 — Mandatory skill list.** `agent-tool-scaffold` and `sse-event-pipeline` do not apply to v3 work (no agent tools, no SSE panels in scope). `qa-gate`, `adr-writer`, `llm-prompt-lab`, and `dead-code-hunter` remain relevant and should be used when applicable.
- **§14 Prohibition #2 — "Install packages without documenting why."** v3 permits autonomous install of necessary packages (e.g., `gray-matter` for prompt frontmatter, `mammoth` for DOCX extraction). Each install is documented after the fact in the phase report; no prior ADR required.

All other platform rules (§§1–2, 5–6, 8–12, 15–18 of repo-root `CLAUDE.md`) apply to v3 work unchanged.

When v3 ships, the directory is renamed `server/src/v3/` → `server/src/resume/`, this manual is retired, and the repo-root `CLAUDE.md` becomes authoritative again for all resume work.

---

## What this project is

We are rebuilding the CareerIQ resume writer from scratch as a v3 pipeline at `server/src/v3/`, running alongside the existing v2 at `server/src/agents/resume-v2/`. The v3 pipeline replaces approximately 40 agents and ~8,000 lines of TypeScript with 5 stages and roughly 1,500 lines of code plus prompts.

The full plan lives in `docs/v3-rebuild/` (docs 00 through 05). Read all six before starting any phase. They are the source of truth. This manual is a condensed operating document, not a replacement.

## The core principle

**LLMs handle semantic judgment. Code handles mechanical operations.**

If a decision requires understanding meaning, context, or intent, it is an LLM call. If a decision is purely mechanical (parsing a date string, stripping whitespace, writing JSON), it is code. This is not a preference. It is the architectural foundation.

Regex is acceptable for mechanical string operations. Regex is banned for deciding:
- Whether a block of text is a job entry, career gap note, or section header
- What discipline a candidate works in
- Whether a sentence is "sentence-shaped"
- Whether a company name is a parent umbrella or a standalone employer
- Any other question that requires reading comprehension

If you find yourself writing a regex to answer a semantic question, stop. That is an LLM call. If you are unsure whether a question is semantic or mechanical, assume semantic and route it to an LLM.

## The five stages

1. **Extract** — plaintext out of PDF/DOCX/text. No LLM. No semantics.
2. **Classify** — one LLM call produces structured resume JSON. All parsing judgment happens here.
3. **Strategize** — one LLM call produces positioning strategy for the target JD.
4. **Write** — parallel LLM calls, one per section, produce final content.
5. **Verify** — one LLM call gates quality.

Each stage has one responsibility and one output. Stages do not reach across boundaries. Downstream stages trust upstream output; if upstream is wrong, fix upstream, not downstream.

## Non-negotiables

These are restated from doc 00 because they are the rules that make everything else work.

- **No silent fallbacks.** If a stage fails, fail loudly and surface the error. The v2 system fell back to deterministic stubs for weeks when Vertex auth expired. That cannot happen again. Errors propagate; they do not get swallowed.
- **No guardrail functions.** If a downstream stage needs to "clean up" or "filter" or "backfill" upstream output, the upstream prompt is wrong. Fix the prompt. Do not add a guardrail. If you catch yourself writing a function named `filter*`, `sanitize*`, `ensure*`, `coerce*`, `salvage*`, `derive*`, `trim*ArtifactsFrom*`, or anything in that family, stop and ask whether the upstream stage should have produced correct output in the first place.
- **No regex for semantic decisions.** See the core principle above.
- **Every prompt is a first-class file.** Prompts live in `server/prompts/` as `.md` files with YAML frontmatter. See doc 03. No prompt ever exists as an inline string in TypeScript.
- **Every prompt rule has a "why" comment.** When you add a rule to a prompt, add an HTML comment below it explaining the failure mode it prevents. Rules without rationale get deleted by future edits that don't know why they exist.
- **Fixtures are the quality gate.** Every change runs against all fixtures in `server/test-fixtures/resumes/` before merge. If the fixture suite regresses, the change does not merge. There is no "I'll fix it later."
- **v3 never imports from v2.** The `server/src/v3/` tree has zero imports from `server/src/agents/resume-v2/`. If v3 needs something from v2, copy it into `server/src/v3/` or into `server/src/lib/` as shared infrastructure. The clean break is load-bearing.

## Shared platform infrastructure (v3 exception to the clean-break rule)

v3 never imports from `server/src/agents/resume-v2/`. v3 may (and should) use shared platform infrastructure in `server/src/lib/`:

- **LLM provider.** v3 stages call LLMs via `server/src/lib/llm-provider.ts`, not by importing `@anthropic-ai/sdk` directly. Before Phase 3 begins, verify the provider supports `claude-opus-4-7` and `claude-sonnet-4-6`. If it does not, extend the provider in `lib/` (a small change that benefits the whole platform); do not bypass it in v3.
- **Logger.** `server/src/v3/observability/logger.ts` is a thin wrapper around the platform's existing Pino logger at `server/src/lib/logger.ts`, using `logger.child({ stage: '...' })` for per-stage tagging. One log stream, one format.

These are in `lib/`, not in `agents/resume-v2/`, so they do not violate the clean-break rule.

## What you should do autonomously

You are running with `--dangerously-skip-permissions`. Use it. Do not ask for approval on:

- Creating, reading, editing files within `server/src/v3/`, `server/prompts/`, `server/test-fixtures/`, `docs/v3-rebuild/`
- Installing npm packages needed for v3 (propose the package and install; note it in the phase report)
- Running tests, the fixture suite, linters, type checks
- Creating commits on the `rebuild/v3` branch with descriptive messages
- Iterating on prompts based on fixture results

## What you should not do without asking

- Deleting files (other than in `server/src/v3/` scratch work)
- Modifying anything in `server/src/agents/resume-v2/`
- Modifying anything outside `server/src/v3/`, `server/prompts/`, `server/test-fixtures/`, `docs/v3-rebuild/`, and this manual
- Force-pushing, rebasing onto main, or otherwise rewriting history
- Running database migrations
- Calling external APIs in ways that could incur non-trivial cost (a few thousand LLM tokens is fine; a full fixture-suite run across 20 resumes with Opus needs a heads-up)
- Committing secrets, API keys, or personally identifying information from real resumes

When in doubt, ask.

## What every phase report should contain

At the end of each phase, write a report to `docs/v3-rebuild/reports/phase-N-report.md`:

1. **What I built.** File list with one-line descriptions.
2. **What works.** Evidence: fixture pass rates, successful runs, example outputs.
3. **What is uncertain.** Places where you made a judgment call that the human should review.
4. **What I deferred.** Anything you chose not to do and why.
5. **Next phase prerequisites.** What needs to be true before the next phase starts.
6. **Questions for the human.** Explicit list.

Do not skip the "what is uncertain" section. If you are certain about everything, you are not paying attention.

## How to handle ambiguity

If a prompt rule in the docs contradicts something you observe in a fixture, note the contradiction in your phase report. Do not silently resolve it. The human needs to see the contradiction to decide.

If you find a bug in v2 while inspecting it for reference, log it in the phase report. Do not fix it. v2 is not your concern except as reference material.

If you find a better architectural idea mid-phase, stop and propose it in the phase report. Do not change the architecture unilaterally. Docs 00-05 were thought through; drift happens when individual sessions override the plan without surfacing why.

## Models

- Stage 2 (Classify): use the strongest model available. Default: `claude-opus-4-7`. The classify prompt does all the semantic heavy lifting. Do not cheap out here.
- Stage 3 (Strategize): `claude-opus-4-7`. Strategic judgment benefits from the strongest model.
- Stage 4 (Write): `claude-sonnet-4-6` is fine for section writers. They're executing a clear plan.
- Stage 5 (Verify): `claude-opus-4-7`. Verification is the last line of defense.

Temperature defaults: 0.2 for classify, 0.4 for strategize and write, 0.1 for verify. Tune per prompt in the YAML frontmatter.

## Rollout flag

The production rollout uses `FF_RESUME_V3` as the feature flag name (approved at setup). Shadow-comparison table naming in Supabase will be decided at Phase 5 planning.

## The one thing to remember

Every time you are tempted to add defensive code to handle bad upstream output, remember: v2 has seventeen guardrail functions and still produces phantom positions, concatenation artifacts, and pronoun mismatches. Guardrails do not work. Correct upstream prompts do.

Fix the prompt. Delete the guardrail. That is the entire architectural thesis.
