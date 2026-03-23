# AGENTS.md

## Purpose

This is the root operating contract for Codex in this repository.

Its job is to keep implementation work aligned with the actual architecture of the product:

- a production executive-career platform
- a true agentic system, not a rigid wizard
- a shared-context application, not a collection of room-by-room hacks

Codex must treat this file as enforceable operating guidance, not optional reference.

## Repository Mission

Build and maintain an agentic executive career platform that helps mid-level to senior executives, especially age 45+, get rehired by:

- rewriting resumes
- rebuilding LinkedIn profiles
- generating LinkedIn blog and thought-leadership content
- assisting with interview prep
- helping identify and target jobs
- helping pursue specific companies
- coordinating multiple specialized AI agents

The platform must preserve agent creativity and reasoning freedom inside strong shared contracts.

## Order of Authority

1. `AGENTS.md`
2. `/docs/CURRENT_SPRINT.md`
3. `/docs/AI_OPERATING_MODEL.md`
4. `/docs/CODEX_IMPLEMENTATION_GUARDRAILS.md`
5. `/docs/SHARED_CONTEXT_CONTRACT.md`
6. `/docs/SHARED_EVIDENCE_CONTRACT.md`
7. all other docs are reference unless explicitly promoted

If a lower-order document conflicts with a higher-order document, follow the higher-order document.

## Mandatory Startup Reads

Before changing application behavior, AI prompts, workflow structure, shared utilities, room UX, or data contracts, read in this order:

1. `AGENTS.md`
2. `docs/CURRENT_SPRINT.md`
3. `docs/AI_OPERATING_MODEL.md`
4. `docs/CODEX_IMPLEMENTATION_GUARDRAILS.md`
5. `docs/SHARED_CONTEXT_CONTRACT.md`
6. `docs/SHARED_EVIDENCE_CONTRACT.md`
7. relevant feature or architecture docs for the exact room being changed

If the task is clearly local and does not affect shared contracts, still read the first four documents.

## Core Operating Rules

1. Prefer upstream fixes over local patches.
2. Do not reduce agent autonomy unnecessarily.
3. Do not hardcode procedural sequences when contracts and agent responsibilities should drive behavior.
4. Do not create silent schema drift.
5. Do not invent evidence.
6. Do not bury product logic inside ad hoc UI code.
7. Do not solve shared problems room by room unless the problem is truly room-specific.
8. Maintain typed contracts and predictable interfaces.
9. Optimize for user-task clarity over internal pipeline visibility.
10. Use hardening as a safety net, not as the primary architecture.

## Shared vs Local Changes

Use this exact meaning everywhere in the repository.

Treat a change as `shared` if it affects any of the following:

- shared context
- evidence provenance or evidence classification
- AI guidance patterns
- contract schemas
- agent responsibilities
- room-to-room consistency
- review and apply behavior
- user-facing reasoning transparency
- validation or normalization logic reused across rooms

Treat a change as `local` only when it is limited to one room and all of the following are true:

- the issue is confined to one room
- it does not change shared contracts
- it does not duplicate business logic already needed elsewhere
- it does not encode domain reasoning in UI glue
- it does not work around an upstream context or evidence problem

If you are unsure whether a change is shared or local, treat it as shared until proven otherwise.

## Agent System Rules

Agent autonomy means preserving agent domain ownership and reasoning freedom inside typed contracts. The application may assemble context, validate evidence, and govern review and apply, but it must not script agents into brittle step-by-step workers unless there is a real safety requirement.

For requirement taxonomy and coaching-policy work specifically:

- keep the layer contract-driven, not wizard-driven
- classify requirement families
- define evidence expectations
- define fallback policy
- define safety rules
- still leave phrasing and reasoning room for the agents

If a taxonomy or coaching-policy change starts turning into a giant hardcoded decision tree, stop and move the control back into typed contracts plus agent-owned reasoning.

1. Agents should own domain reasoning whenever possible.
2. Shared contracts should constrain agents; they should not script them into brittle step sequences.
3. Do not convert agentic behavior into rigid procedural orchestration for convenience.
4. Prompts may provide structure, boundaries, and output contracts, but should not become pseudo-code checklists unless there is a real safety or determinism need.
5. If a domain rule is important across rooms, encode it in a shared contract or shared validator, not in a single room component.
6. Keep agent outputs distinguishable as:
   - factual candidate history
   - inferred strengths
   - strategic framing
   - benchmark-derived recommendations
   - missing information that still requires user confirmation
7. Any AI-generated artifact that can reach a final user-visible document must pass the shared evidence rules.

## Before You Implement

Answer these questions before writing code:

1. What user task is being improved?
2. Is this a shared issue or a local issue?
3. Which contracts are affected?
4. Is the real problem upstream context, evidence typing, agent output quality, or UI framing?
5. Would a shared contract fix remove the need for multiple local patches?
6. Does this change preserve agent autonomy?
7. Could this introduce unsupported claims, evidence confusion, or schema drift?

If the answers are weak, stop and revisit the shared contracts first.

## Before You Commit

Verify all of the following:

1. The change is correctly classified as shared or local.
2. Shared contracts were updated if their semantics changed.
3. No evidence-free artifact generation path was introduced.
4. No domain reasoning was hidden in UI-only logic without justification.
5. Typed interfaces remain aligned across server, app, and persisted state.
6. Tests cover the real contract or user-facing artifact behavior that changed.
7. The commit summary explains:
   - what changed
   - why it was shared or local
   - what contracts moved
   - what risks remain

## Progress Update Format

Use this exact format in substantive progress updates:

- Goal
- Scope
- Shared or Local
- Files
- Risks
- Next Step
