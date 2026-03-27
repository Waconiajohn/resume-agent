# Current Sprint

## Sprint Goal

Restore architectural control, reinforce shared contracts, and stop Codex drift in a large agentic executive-career application.

## Why This Sprint Exists

The product has accumulated too many local rescue fixes, room-specific workarounds, and downstream hardening passes for problems that should be solved upstream through:

- shared context
- shared evidence contracts
- shared AI workflow structure
- clearer agent domain ownership

This sprint exists to reassert the intended operating model before more implementation work compounds drift.

## In Scope

- establishing Codex-native governance documents
- defining shared context and shared evidence contracts
- defining the product-wide AI operating model
- defining anti-drift implementation guardrails
- identifying the first shared contracts to implement in code
- auditing active rooms for shared-vs-local misclassification
- sequencing the stabilization and refactor work

## Out of Scope

- broad visual redesign work
- room-by-room polish passes
- one-off copy cleanup that does not reinforce shared contracts
- replacing the full agent runtime
- rewriting low-priority legacy rooms before shared foundations are fixed

## Top Priorities

1. Stop local architectural drift.
2. Make shared context explicit and typed.
3. Make shared evidence rules enforceable across the app.
4. Preserve agent autonomy while tightening shared contracts.
5. Move product logic out of ad hoc room-specific UI behavior.
6. Reduce reliance on downstream rescue hardening.
7. Build one repeatable model for AI-assisted work across active rooms.

## Success Criteria

- Codex has one clear order of authority for implementation decisions.
- Shared context and evidence contracts exist and are specific enough to guide real implementation.
- Shared-vs-local decisions become explicit before code is written.
- Agent autonomy is protected from convenience-driven procedural coding.
- The application moves toward one shared AI/user-task loop instead of multiple room-specific patterns.
- New implementation work can be evaluated against concrete contracts instead of memory and ad hoc judgment.

## Delivery Principles

1. Shared contracts first.
2. Upstream context before downstream rescue.
3. Evidence discipline before artifact polish.
4. Agent responsibilities before UI convenience.
5. One user-task model across active rooms.
6. Strong defaults, not vague philosophy.
7. Local fixes only when a problem is proven to be local.

## Immediate Next Actions

1. Audit the active rooms against the shared AI operating model and classify each workflow gap as shared or local.
2. Implement the first version of the canonical shared context object in server and app types.
3. Implement the first shared evidence object and evidence-level validators.
4. Map resume-v2, LinkedIn, Interview Prep, Job Targeting, and Company Targeting to the shared context contract.
5. Identify which current room-level helpers should be replaced by shared coaching utilities.
6. Add artifact-level quality assertions for representative real sessions so weak outputs are caught earlier.
7. Review agent prompts and route handlers for places where structured context is missing or underused.
8. Remove or isolate UI code that currently contains domain reasoning that belongs in shared contracts or agents.
9. Establish a shared review-and-apply interaction pattern for AI-generated content across active rooms.
10. Rebuild Resume V2 around the document-first model captured in `docs/RESUME_DOCUMENT_FIRST_ROADMAP.md`, with the resume as the only work surface and analysis as support.

## Deferred Items

- full legacy-room cleanup
- broad aesthetics or design polish
- non-critical reference doc cleanup
- lower-priority specialty flows that do not affect the active product loop

## Working Notes

- Resume Builder is still the most advanced reference room, but it should not continue evolving as a one-off exception.
- Career Profile should become the canonical upstream context source for the entire product.
- Hardening remains useful, but only as a safety net once shared contracts are in place.
- Artifact-level QA must become a standard gate for user-visible AI output changes.
- Resume-v2 coaching payloads may carry shared coaching-policy snapshots during migration so downstream consumers can prefer upstream guidance without breaking legacy fallback behavior.
- Resume V2 is now explicitly targeting a document-first workflow: show the before score, generate the strongest tailored resume early, do all work on the resume itself, run final review inline, then promote validated discoveries to the master resume.

## Legacy Migration Note

The first implementation wave should keep live legacy schemas working while introducing canonical contracts:

- `platform_context` stays as a compatibility transport during migration
- `career_profile`, `client_profile`, `positioning_strategy`, `benchmark_candidate`, `gap_analysis`, `career_narrative`, and `evidence_item` should map into `SharedContext`
- truth-verification confidence labels and legacy evidence rows should map into canonical `EvidenceItem`
- resume-v2 `pipeline_data`, room state, and session phase fields should be treated as legacy execution schemas until they can be explicitly mapped into canonical `workflowState` and room adapters

## Wave 1 Implementation Checklist

1. Add canonical code contracts for `SharedContext` and `EvidenceItem` without removing legacy payloads.
2. Introduce one server-side adapter that maps:
   - `platform_context`
   - `career_profile`
   - `client_profile`
   - `positioning_strategy`
   - `benchmark_candidate`
   - `gap_analysis`
   - `career_narrative`
   - `industry_research`
   - `target_role`
   - `evidence_item`
   into canonical shared structures.
3. Thread canonical `shared_context` into a small number of high-leverage products first:
   - Job Finder
   - LinkedIn Content
   - Cover Letter
4. Keep truth-verification confidence labels and legacy evidence arrays intact until their downstream consumers are explicitly migrated.
5. Treat these current live schemas as legacy compatibility layers, not new sources of truth:
   - route-level `platform_context`
   - resume-v2 `pipeline_data`
   - `coach_sessions.pipeline_status`
   - `coach_sessions.pipeline_stage`
   - `coach_sessions.pending_gate`
   - room-local workflow state enums
6. Do not widen the migration beyond adapters and selected consumers until canonical contracts are verified by typecheck and real-session QA.
## Resume-V2 Preservation Layer

- Added a `source_resume_outline` preservation contract to resume-v2 so the original uploaded resume remains an authoritative structural source.
- Candidate Intelligence now builds and carries that outline forward instead of letting deterministic fallback collapse long resumes into a thinner intermediate shape.
- Resume Writer now preserves positions and bullet density against the source outline, not only against possibly truncated `candidate.experience`.
- This is a compatibility-safe first step toward relevance-aware compression; it is intentionally preserving structure before we retune how much older experience should be collapsed.
