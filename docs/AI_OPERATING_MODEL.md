# AI Operating Model

## Purpose

Define the product-wide AI operating model for this application so that all active rooms share the same structure for context, evidence, guidance, generation, review, and apply.

This document works together with:

- [SHARED_CONTEXT_CONTRACT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/SHARED_CONTEXT_CONTRACT.md)
- [SHARED_EVIDENCE_CONTRACT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/SHARED_EVIDENCE_CONTRACT.md)

## Product Philosophy

This is an agentic executive-career platform, not a rigid wizard.

The system should:

- give agents strong structured context
- preserve agent reasoning freedom inside typed contracts
- keep AI embedded inside the user’s work
- make provenance and evidence explicit
- protect users from unsupported claims or vague generic output

The system should not:

- force users to decode internal pipeline states
- hide product reasoning in UI glue code
- use room-by-room logic where a shared contract should exist
- turn benchmark expectations into candidate history
- turn missing data into asserted fact
- script agents into rigid procedural workers when typed contracts and agent domain ownership should drive behavior

## Core Workflow Loop

Every major AI-assisted workflow should follow this loop:

1. understand goal
2. assemble context
3. classify evidence
4. identify gaps
5. choose best next action
6. generate structured help
7. review with user-facing transparency
8. apply or refine

This loop is the canonical behavior model for active rooms.

## Shared Inputs

All rooms should consume some subset of the shared context contract:

- candidate identity and background
- target role
- target company
- industry context
- source artifacts
- career narrative
- benchmark candidate model
- gap analysis state
- positioning strategy
- evidence inventory
- workflow state
- constraints and provenance

Evidence usage and output eligibility must follow the shared evidence contract.

## Agent Responsibilities

Agent autonomy in this product means preserving agent domain ownership and reasoning freedom inside typed contracts. The application is responsible for assembling context, validating evidence, and governing review and apply. The application is not responsible for replacing agent judgment with brittle procedural sequencing.

Agents are responsible for:

- interpreting structured context
- matching the user goal to available evidence
- identifying what is missing or weak
- producing structured, transparent guidance
- drafting grounded content
- explaining what still requires user confirmation

Agents are not responsible for:

- inventing missing facts
- turning benchmark expectations into candidate biography
- hiding provenance
- deciding product workflow structure in an ad hoc way

The application is responsible for:

- assembling context
- enforcing contract shape
- validating evidence level
- deciding when review or confirmation is required
- keeping AI help embedded inside the current user task

## Room Adapters

Each room adapts the shared model to a specific artifact or objective.

### Resume

- Primary goal:
  - improve a targeted or master resume against a role and benchmark
- Shared inputs consumed:
  - `candidateProfile`, `targetRole`, `targetCompany`, `industryContext`, `sourceArtifacts`, `careerNarrative`, `benchmarkCandidate`, `gapAnalysis`, `positioningStrategy`, `artifactTarget`, `evidenceInventory`, `constraints`, `provenance`, `workflowState`
- Output types:
  - requirement map, rewrite suggestions, edited resume sections, final review concerns
- Special constraints:
  - no unsupported claims, no invented metrics, no hidden provenance
- Common failure mode:
  - role requirements or benchmark expectations get echoed back as if they were candidate proof

### LinkedIn

- Primary goal:
  - align LinkedIn profile sections and supporting content with the target role and career narrative
- Shared inputs consumed:
  - `candidateProfile`, `targetRole`, `targetCompany`, `industryContext`, `careerNarrative`, `positioningStrategy`, `evidenceInventory`, `constraints`, `provenance`, `workflowState`
- Output types:
  - headline, about section, experience rewrites, featured content suggestions
- Special constraints:
  - profile voice must remain authentic and defensible, not sound like a fabricated executive bio
- Common failure mode:
  - generic polished language with weak evidence anchoring

### Blogging/Thought Leadership

- Primary goal:
  - generate thought-leadership content grounded in the candidate’s real expertise and career themes
- Shared inputs consumed:
  - `candidateProfile`, `industryContext`, `careerNarrative`, `positioningStrategy`, `evidenceInventory`, `constraints`, `provenance`, `workflowState`
- Output types:
  - blog outlines, post drafts, series ideas, content positioning themes
- Special constraints:
  - content may generalize expertise but may not fabricate lived experience, board work, or business results
- Common failure mode:
  - benchmark-level sophistication gets mistaken for actual candidate history

### Interview Prep

- Primary goal:
  - prepare grounded, high-quality interview answers using real evidence and clear framing
- Shared inputs consumed:
  - `candidateProfile`, `targetRole`, `targetCompany`, `industryContext`, `sourceArtifacts`, `careerNarrative`, `benchmarkCandidate`, `gapAnalysis`, `positioningStrategy`, `evidenceInventory`, `constraints`, `provenance`, `workflowState`
- Output types:
  - likely questions, answer drafts, gap alerts, follow-up talking points
- Special constraints:
  - answers may strengthen framing, but may not overstate unsupported experience
- Common failure mode:
  - polished answer drafts imply proof the candidate does not actually have

### Job Targeting

- Primary goal:
  - identify strong-fit roles and show the positioning gaps between the candidate and the role
- Shared inputs consumed:
  - `candidateProfile`, `targetRole`, `targetCompany`, `industryContext`, `careerNarrative`, `benchmarkCandidate`, `evidenceInventory`, `constraints`, `provenance`, `workflowState`
- Output types:
  - fit summaries, risk areas, targeting recommendations, next actions
- Special constraints:
  - fit analysis should distinguish between must-have, preferred, and benchmark-only expectations
- Common failure mode:
  - job-fit summaries collapse materially different evidence types into one shallow score

### Company Targeting

- Primary goal:
  - help the user pursue a specific company with grounded positioning and outreach strategy
- Shared inputs consumed:
  - `candidateProfile`, `targetCompany`, `industryContext`, `careerNarrative`, `positioningStrategy`, `evidenceInventory`, `constraints`, `provenance`, `workflowState`
- Output types:
  - company-specific positioning, outreach angles, relationship maps, talking points
- Special constraints:
  - company narrative must remain evidence-based and should not imply inside knowledge or domain depth the candidate lacks
- Common failure mode:
  - aspirational company-fit language gets mistaken for demonstrated company-relevant experience

## Review and Apply Model

All AI-assisted content should move through the same user-facing model:

1. show the target or goal
2. show the strongest known supporting evidence
3. show what is still missing or weak
4. show the suggested draft or next question
5. allow user review and edit
6. apply only after the content is reviewable

AI should help inside that loop, not in a detached helper layer.

Evidence eligibility inside review and apply must stay consistent with [SHARED_EVIDENCE_CONTRACT.md](/Users/johnschrup/Documents/New%20project/resume-agent/docs/SHARED_EVIDENCE_CONTRACT.md):

- `DirectProof` may flow into final artifact copy.
- `StrongAdjacentProof` may flow into final artifact copy only when the wording remains faithful to what the evidence actually proves and any required confirmation has happened.
- `SupportableInference`, `BenchmarkInformedGap`, `UserUnconfirmedClaim`, `Unsupported`, and `HighOverreachRisk` must not be exported as factual artifact copy.
- benchmark-derived guidance must remain labeled as benchmark-derived guidance until it is replaced by candidate-supported proof.

## Contract Dependencies

This operating model depends directly on:

- `SHARED_CONTEXT_CONTRACT`
- `SHARED_EVIDENCE_CONTRACT`

If a room cannot map its behavior to those contracts, it is not aligned with the operating model and must be treated as a refactor target.

## Failure Modes

Common failure modes to watch for:

- context missing upstream, forcing downstream rescue logic
- evidence-free artifact generation
- benchmark guidance rendered as candidate biography
- requirement echoing instead of meaningful next-action coaching
- domain reasoning leaking into UI-only code
- duplicated analysis sections that do not change the next action
- agent prompts becoming rigid pseudo-procedural scripts

## Implementation Notes

- Shared contracts should live in typed code on both server and app sides.
- Room adapters should be explicit and minimal.
- Validation should happen before user-visible artifact rendering.
- Local room code may shape presentation, but shared contracts should define meaning.
- If repeated hardening is needed in multiple rooms, move the logic upstream or into shared validators.
