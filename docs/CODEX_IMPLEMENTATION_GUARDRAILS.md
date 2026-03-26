# Codex Implementation Guardrails

## Purpose

This document is the anti-drift implementation guide for Codex.

Its job is to prevent the codebase from sliding back into:

- local patching for shared problems
- brittle procedural workflow logic
- UI-driven business logic
- evidence-free artifact generation
- silent contract drift

## Non-Negotiable Rules

1. Do not patch locally when the cause is shared.
2. Do not reduce agent autonomy for convenience.
3. Do not convert the system into a rigid procedural wizard.
4. Do not move domain reasoning into UI glue code.
5. Do not silently change shared schemas.
6. Do not create evidence-free artifact generation paths.
7. Do not create duplicate room-specific business logic unless justified.
8. Do not invent evidence, metrics, scale, credentials, or chronology.
9. Do not let benchmark guidance masquerade as candidate fact.
10. Do not add AI controls that are not clearly tied to the current user task.
11. Do not let deterministic rescue layers overwrite valid agent-owned priority or placement decisions.
12. Do not let requirement-target metadata masquerade as provenance in the UI or saved state.
13. Do not emit or render fake review gates when the pipeline auto-continues anyway.
14. Do not open more than one edit/review surface for the same user action on the same line.

## Shared vs Local Decision Framework

Use this decision framework before implementing:

Use the same shared-vs-local meaning defined in `AGENTS.md`.

### Shared

The change is shared if it touches:

- context structure
- evidence provenance or evidence classification
- provenance
- review and apply behavior
- AI guidance shape
- agent responsibilities
- room-to-room consistency
- user-facing reasoning transparency
- prompt structure that affects multiple artifacts
- validation or normalization logic reused across rooms

### Local

The change is local only if:

- the issue is confined to one room
- no shared contract meaning changes
- the fix does not duplicate logic needed elsewhere
- the fix does not encode domain reasoning in UI glue
- the cause is not upstream context or evidence weakness

If the issue repeats or is likely to repeat, it is shared.

## Agentic Architecture Guardrails

Agent autonomy means preserving agent domain ownership and reasoning freedom inside typed contracts. The application may constrain inputs, outputs, evidence eligibility, and review-and-apply gates, but it must not replace agent judgment with rigid procedural sequencing unless safety requires it.

For requirement taxonomy and coaching-policy work:

- classify requirement families
- define evidence expectations
- define fallback policy
- define safety rules
- leave final phrasing and domain reasoning room for the agents

Do not let taxonomy or coaching-policy modules turn into giant hardcoded wizards. They should govern contracts, eligibility, and safe fallbacks, not replace agent judgment with brittle scripts.

1. Preserve agent domain ownership.
2. Prefer contract-driven agent behavior over hardcoded procedural sequences.
3. Prompts should provide structured guidance, not rigid scripts, unless safety absolutely requires determinism.
4. Avoid hidden tool pipelines inside route handlers or UI glue.
5. Keep agent inputs typed and explicit.
6. Keep agent outputs typed and reviewable.
7. If a room needs domain reasoning, ask whether that reasoning belongs in a shared agent utility or shared contract first.

## UI and Product Guardrails

1. UI should present the user’s task, not the system’s internal process.
2. AI help should live inside the current action, not in detached button farms.
3. Analysis sections are only justified when they change a decision or next action.
4. Users must not have to infer provenance.
5. Users must not have to infer whether content is final, draft, inferred, benchmark-driven, or still unconfirmed.
6. One active work item should stay visually primary.

## Data and Contract Guardrails

1. Shared contracts must stay typed and predictable.
2. Do not create silent schema drift between server, app, saved state, and prompts.
3. Make required vs optional fields explicit.
4. Distinguish factual history from strategic framing from benchmark recommendations.
5. When a contract changes meaning, update the governing docs and tests before or with the code.

## Evidence Guardrails

1. Every user-facing artifact must respect the shared evidence contract.
2. Unsupported claims must not reach exportable artifacts.
3. Inference must never be silently upgraded into biography.
4. Missing metrics must not become invented metrics.
5. Role requirements must not become implied accomplishments.
6. Benchmark expectations must not become candidate achievements.

## Change Checklist

Before implementation:

- identify whether the issue is shared or local
- identify which contracts are touched
- identify which room adapters are affected
- identify what evidence risk exists

Before merge:

- validate typed contracts
- run focused tests
- verify at least one user-facing artifact or realistic flow if generated text changed
- confirm no shared problem was hidden behind a local patch

## Red Flags

Treat any of these as a pause signal:

- “just one more local fallback”
- “the UI can figure this out later”
- “the agent can infer the rest”
- “we only need this in one room”
- “this output is close enough even if provenance is fuzzy”
- “we can harden it downstream if it goes weird”
- “the requirement text itself is probably good enough as the draft”
- “the validator can just remap the agent output after the fact”
- “the UI label is close enough even if it sounds like provenance”
- “we can emit the question anyway even though the pipeline will auto-approve”

## Required Commit Summary Template

Every substantial commit summary should cover:

- Goal
- Why shared or local
- Contracts touched
- Evidence impact
- Agent autonomy impact
- Risks
- Follow-up needed
