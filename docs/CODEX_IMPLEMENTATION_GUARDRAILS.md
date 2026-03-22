# Codex Implementation Guardrails

## Why This Exists

The project has repeatedly drifted into local fixes for systemic AI/workflow problems.

This document is the anti-drift checklist for Codex work.

## Before Writing Code

Answer these questions first.

1. Is this a local bug or a repeated product pattern?
2. Which part of the shared AI operating model does it affect?
3. Is the real problem upstream context, evidence typing, UI framing, or a genuine room-only bug?
4. Does this change improve the user’s task, or only the system’s internal explanation?
5. Will the user actually see a better result, or just a cleaner implementation?

If those answers are unclear, do not start with local hardening.

## Anti-Pattern Warnings

Stop if the work is drifting into any of these:

### 1. Rescue coding as the main strategy

Examples:

- generic output generated upstream, then patched repeatedly downstream
- UI complexity added to compensate for weak evidence structure
- one more local fallback instead of improving the shared contract

### 2. AI beside the work instead of inside the work

Examples:

- button farms
- blank prompt boxes
- hidden helper drawers
- secondary AI areas that do not clearly advance the task

### 3. Repeated analysis loops

Examples:

- report, then another report, then a workspace
- multiple sections that restate the same gap
- progress summaries that do not change the next action

### 4. Room-specific reinvention

Examples:

- each room invents new evidence wording
- different provenance labels for the same concept
- inconsistent approve/apply/review behavior

## Required Design Questions

Every AI-assisted flow should make these answers obvious:

- What am I trying to improve?
- What do you already know?
- What is still missing?
- What should I do next?
- How can AI help me right here?
- How do I review or apply the result?

If the user must infer these answers, the flow is not ready.

## When Hardening Is Allowed

Hardening is still valid, but only as:

- malformed output protection
- unsupported claim filtering
- placeholder cleanup
- generic filler replacement
- deterministic fallback generation

Hardening should not be the primary place where product meaning is created.

## Verification Rules

### Local changes

At minimum:

- typecheck
- focused tests

### AI/workflow changes

Also require:

- at least one artifact or browser validation of the user-facing result

### Shared-contract changes

Also require:

- regression coverage for the contract
- at least one representative real or realistic session check if the change affects generated text

## Escalation Rule

Pause and update the shared docs before continuing if:

- the same issue appears across more than one active room
- the change redefines what AI is supposed to do
- the change alters evidence, provenance, or review semantics
- the fix requires introducing a new workflow phase or user mental model

## Shared Docs To Update When Needed

- `AGENTS.md`
- `docs/AI_OPERATING_MODEL.md`
- `docs/CODEX_IMPLEMENTATION_GUARDRAILS.md`
- `docs/APP_WIDE_OVERHAUL_PLAN.md`
- `docs/DECISIONS.md` when an architectural decision changes

