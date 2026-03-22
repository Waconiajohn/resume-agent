# AGENTS.md — Codex Operating Rules for Resume Agent

This file is the Codex-native operating brief for this repository.

`CLAUDE.md` remains useful project history and platform context, but Codex should treat this file plus the referenced docs below as the active execution contract.

## Mandatory Session Start

Before changing application logic, UX flow, AI prompts, or product architecture, read:

1. `AGENTS.md`
2. `docs/CURRENT_SPRINT.md`
3. `docs/CONVENTIONS.md`
4. `docs/AI_OPERATING_MODEL.md`
5. `docs/CODEX_IMPLEMENTATION_GUARDRAILS.md`
6. `docs/APP_WIDE_OVERHAUL_PLAN.md`
7. Any room- or feature-specific doc directly relevant to the current task

Then state in the first progress update:

- what room / workflow is being touched
- which part of the shared AI operating model it affects
- whether this is an upstream context fix, a shared-contract fix, or a local UI fix

## Core Rule

Do not solve recurring product problems with isolated room-level hardening if the issue is actually shared across the application.

If a problem repeats in Resume Builder, LinkedIn, Interview Prep, Job Search, Cover Letter, or Career Profile, pause and map it back to the shared operating model before writing code.

## Shared Product Contract

Every AI-assisted workflow in the active product must follow this shape:

1. `Goal`
2. `What we know`
3. `What is missing`
4. `Best next action`
5. `AI help inside the action`
6. `Review and apply`

Do not introduce flows that make the user decode:

- internal pipeline phases
- tool sequencing
- duplicate analysis summaries
- mystery AI buttons
- blank prompt boxes

## Codex Stopgaps

These are mandatory anti-drift checks.

### Stopgap 1: No local rescue without root-cause check

Before adding copy cleanup, fallback logic, or UI guardrails, check whether the real problem is:

- missing structured context
- weak evidence classification
- poor requirement typing
- unclear source provenance
- overloaded room-specific workflow design

If yes, fix or document the upstream/shared layer first.

### Stopgap 2: No new AI actions without contract mapping

Every new AI button, helper, or automated step must answer:

- what user task it supports
- what known evidence it uses
- what missing detail it is trying to collect
- what artifact it improves

If those are not explicit, do not ship the action.

### Stopgap 3: No separate "analysis" loops unless they change a decision

Do not add or keep report sections that restate the same conclusion in multiple forms.

Analysis is only justified if it clearly changes:

- the next action
- the suggested draft
- the user’s confidence in the evidence

### Stopgap 4: LLM output is not trusted by default

Grok or any other model may generate:

- placeholder evidence
- vague questions
- label-like rewrites
- unsupported claims
- generic coaching

Code must validate and normalize output before it reaches the user.

### Stopgap 5: Shared fixes beat room-specific drift

If the same concept exists across rooms, prefer a shared contract or shared utility over one-off room logic.

Examples:

- evidence provenance
- requirement typing
- clarifying-question generation
- suggested rewrite quality
- apply/review state handling

## Required Quality Gates

For AI/workflow changes, the minimum validation bar is:

1. typecheck for touched package(s)
2. focused unit/regression tests
3. at least one representative artifact or browser verification for the affected flow

For changes that affect generated user-facing language, verify actual saved artifacts whenever feasible. Do not rely on unit tests alone.

## Architecture Direction

The app is moving toward:

- stronger structured context upstream
- a shared evidence layer
- a shared AI interaction model across rooms
- lighter downstream hardening used only as a safety net

When in doubt, bias toward:

- upstream context quality
- reusable contracts
- clearer user-task framing

Not toward:

- more room-specific phases
- extra helper controls
- local patch layers that hide a systemic issue

