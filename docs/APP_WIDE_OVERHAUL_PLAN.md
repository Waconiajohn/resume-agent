# App-Wide AI Workflow Overhaul Plan

## Objective

Rebuild the active product around one coherent AI-assisted work model instead of room-by-room bespoke flows and downstream rescue logic.

## Problem Statement

The current application has too many places where:

- the system explains itself instead of guiding the user’s task
- AI appears as a side tool instead of an embedded collaborator
- room-specific workflows drift apart
- downstream hardening compensates for weak upstream structure

## Target State

All active rooms should eventually operate on the same shape:

1. goal
2. structured context
3. evidence inventory
4. gap or weakness
5. best next action
6. AI help inside the action
7. review / apply

## Phase 1: Canonical Context Layer

Make Career Profile and shared role context the canonical upstream inputs for all rooms.

Deliverables:

- common context contract
- profession / industry / company / target-artifact inputs
- benchmark / ideal-candidate context format
- room-level adapters

## Phase 2: Shared Evidence Layer

Create or standardize reusable evidence concepts:

- direct proof
- adjacent proof
- unsupported claim
- benchmark-only signal
- must-have gap
- preferred signal
- overreach risk

This layer should serve Resume Builder, LinkedIn, Cover Letter, Interview Prep, and Job Search.

## Phase 3: Shared AI Coaching Contract

Standardize the structure for AI-assisted work items:

- target requirement or target outcome
- source / provenance
- best current evidence
- what is missing
- clarifying question
- suggested draft
- recommended next action
- review/apply state

## Phase 4: Resume Builder As Reference Implementation

Finish stabilizing Resume Builder as the strongest example of the shared model, not a one-off exception.

Focus:

- upstream context quality
- requirement/evidence quality
- rewrite loop quality
- final-review quality

## Phase 5: Migrate Active Rooms

Apply the same interaction model to:

1. LinkedIn
2. Cover Letter
3. Interview Prep
4. Job Search
5. Career Profile editing surfaces

## Phase 6: Remove Legacy Drift

As rooms migrate, remove:

- duplicated progress/report views
- sidecar AI tool palettes
- room-specific provenance labels
- local workflow jargon
- dead summary sections with no action value

## Phase 7: Artifact-Level Quality Gates

Build representative artifact checks for major room families.

Guard against:

- placeholder evidence
- label-style rewrites
- generic question fallbacks
- duplicated summaries
- unclear provenance

## Prioritization Rules

Do first:

- shared context
- shared evidence
- shared coaching contract
- one strong reference room

Do later:

- broad polish
- room-by-room visual cleanup
- local helper tuning without shared-contract impact

## Success Criteria

- AI feels embedded in the work, not bolted on
- users do not have to decode the system’s internal process
- repeated quality problems are solved once in shared layers
- hardening becomes a safety net instead of the primary strategy

