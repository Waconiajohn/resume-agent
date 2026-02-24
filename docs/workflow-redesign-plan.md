# Workflow Redesign Technical Spec

## Status

- Owner: Codex (implementation in progress)
- Date: 2026-02-24
- Scope: UX navigation + durable workflow memory + intake uploads/links + draft-first flow scaffolding

## Problem Summary

The current experience is optimized for a linear SSE-driven panel stream and gate-based pipeline. It produces quality output, but users can get trapped in a step, cannot reliably navigate back/forward, and must answer too many questions before seeing a useful draft.

Current constraints in code:

- App view state is coarse (`landing | intake | coach`) and not workflow-route based.
- Frontend restores only `last_panel_type`/`last_panel_data` from SSE restore.
- Backend persists only latest panel snapshot for reconnect, not versioned workflow artifacts.
- Pipeline gates (`waitForUser`) enforce a strict linear flow in the UI.

## Goals

- Persistent workspace navigation (left rail) with step status.
- Browser back/forward support tied to workflow nodes.
- Jump between workflow parts without losing progress.
- Durable workflow artifacts/checkpoints (server-side).
- Faster time-to-first-draft with optional deeper questioning.
- Better trust through benchmark assumption transparency.
- Better intake UX: resume upload + JD upload/link + saved resume reuse.

## Non-Goals (initial rollout)

- Full replacement of the existing pipeline orchestration in one pass.
- Removing current panel-based SSE events immediately.
- Eliminating gates entirely.

## UX Architecture

### Workspace Shell

Persistent shell for all active sessions:

- Header: back/forward, current node title, session status, active gate CTA
- Left rail: workflow nodes with status and progress
- Main content: node content (panel/artifact/editor)
- Right rail (optional): metrics/status snapshot (reusing `WorkflowStatsRail`)

### Workflow Nodes (v1)

- `overview`
- `benchmark`
- `gaps`
- `questions`
- `blueprint`
- `sections`
- `quality`
- `export`

### Navigation Rules

- URL is source of truth for selected node.
- Browser back/forward changes node route.
- Users may navigate away from an active gate.
- Active gate remains pending server-side.
- UI shows a persistent "Return to active question" banner while gate is pending.
- Locked nodes are visible but not interactive.

## State Model

### 1) Durable Workflow Memory (server / DB)

Persists across reloads/devices:

- node status
- node artifacts (versioned)
- question responses (answered/skipped/deferred)
- benchmark assumptions
- pending gate metadata
- node invalidation / stale dependencies

### 2) Navigable UI State (URL + localStorage)

Persists across reloads on same device:

- selected node
- local view history/cursor
- selected section in section workbench
- shell UI preferences (collapsed nav, panel toggles)

### 3) Ephemeral Runtime State (memory)

- SSE deltas
- active tool statuses/spinners
- unsaved draft edits before explicit save/apply

## Data Model (Supabase / PostgreSQL)

### `session_workflow_nodes`

Tracks per-session workflow nodes and statuses.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references coach_sessions(id) on delete cascade`
- `node_key text not null`
- `status text not null default 'locked'`
- `active_version integer`
- `meta jsonb not null default '{}'::jsonb`
- `updated_at timestamptz not null default now()`
- unique (`session_id`, `node_key`)

Status values:

- `locked`
- `ready`
- `in_progress`
- `blocked`
- `complete`
- `stale`

### `session_workflow_artifacts`

Versioned node artifacts for inspectability and replay.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references coach_sessions(id) on delete cascade`
- `node_key text not null`
- `artifact_type text not null`
- `version integer not null`
- `payload jsonb not null`
- `created_by text not null default 'pipeline'`
- `created_at timestamptz not null default now()`
- unique (`session_id`, `node_key`, `artifact_type`, `version`)

### `session_question_responses`

Stores structured gate/question responses.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references coach_sessions(id) on delete cascade`
- `question_id text not null`
- `stage text not null`
- `status text not null`
- `response jsonb`
- `impact_tag text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique (`session_id`, `question_id`)

`status` values:

- `answered`
- `skipped`
- `deferred`

## API Additions

### `GET /api/workflow/:sessionId`

Returns workspace summary:

- node statuses
- active gate info
- current pipeline stage
- latest artifact summaries
- recommended current node

### `GET /api/workflow/:sessionId/node/:nodeKey`

Returns latest artifacts for one node plus metadata.

### `GET /api/workflow/:sessionId/node/:nodeKey/history`

Returns artifact version list and timestamps.

### `POST /api/workflow/:sessionId/questions/batch-submit`

Submits multiple question responses in one request.

### `POST /api/workflow/:sessionId/questions/defer`

Marks a question as deferred.

### `POST /api/workflow/:sessionId/benchmark/assumptions`

Persists user-edited benchmark assumptions and marks dependent nodes stale.

### `POST /api/workflow/:sessionId/generate-draft-now`

Requests draft-first continuation if minimum required inputs exist.

## Event Contract Changes (SSE, backward-compatible)

Keep current panel events, add workflow events:

- `workflow_node_status`
- `workflow_artifact_updated`
- `workflow_gate_pending`
- `workflow_gate_resolved`

Payload requirements:

- `node_key`
- `status`
- `artifact_type` (when applicable)
- `version` (when applicable)
- `updated_at`

## Frontend Implementation Plan

### New Client Concepts

- `WorkflowNodeKey`
- `WorkspaceRouteState`
- `NodeSnapshot`
- `WorkspaceNavState`

### New Hooks

- `useWorkspaceRoute(sessionId)` for URL sync + popstate support
- `useWorkspaceHistory()` for local node history + cursor persistence
- `useWorkflowSession(sessionId)` for workflow endpoints (Phase 3+)

### New Components

- `WorkspaceShell`
- `WorkspaceNavRail`
- `WorkspaceHeader`
- `ActiveGateBanner`
- `NodeStatusPill`

### Backward Compatibility

Phase 1/2 wraps existing `CoachScreen` and panel renderer. Existing SSE + panels remain source for current content until artifact-backed nodes are rolled out.

## Intake UX Redesign (Uploads + Links + Saved Resume Reuse)

### Resume Input (required)

Supported methods:

- Use saved default resume (existing)
- Use last session resume (new shortcut)
- Upload new file (`.pdf`, `.docx`, `.txt`; `.doc` explicit unsupported message)
- Paste text (fallback)

Notes:

- Existing base resume flows already exist (`master_resumes`, default selection, save-as-base).
- Intake should expose these options directly instead of hiding default resume as prefill-only.

### Job Description Input (required)

Supported methods:

- Paste JD text
- Paste job posting URL (existing behavior, expanded UX)
- Upload JD file (`.pdf`, `.docx`, `.txt`, `.html`)

Future (non-blocking):

- Fetch from ATS exports / email attachments
- Import from supported job boards via provider-specific adapters

### Company Name

- User-entered (current)
- Auto-suggest from URL metadata when available
- Editable before submit

## Draft-First & Question Budget (Phase 4+)

### Mode Selection

User selects one:

- `fast_draft`
- `balanced` (default)
- `deep_dive`

### Question Budget Defaults (v1)

- `fast_draft`: 4-8 targeted questions
- `balanced`: 8-16 targeted questions
- `deep_dive`: existing behavior + follow-ups

### Stop Conditions

Stop additional questioning when:

- requirement coverage confidence reaches threshold
- remaining questions are low expected impact
- user chooses `Generate draft now`

### Gate UX

Every question UI should include:

- why this question matters
- expected impact (e.g., summary + experience section)
- skip/defer option when non-critical

## Benchmark Inspector (Phase 5)

Expose benchmark assumptions and confidence:

- title/seniority target
- industry / niche
- company scale
- functional scope
- key inferred requirements
- confidence and rationale

User can edit assumptions and trigger selective downstream invalidation/regeneration.

## Node Dependency Graph (v1)

- `overview` depends on intake
- `benchmark` depends on intake + research
- `gaps` depends on benchmark + intake
- `questions` depends on gaps
- `blueprint` depends on benchmark + gaps + positioning
- `sections` depends on blueprint + evidence
- `quality` depends on sections
- `export` depends on quality

When upstream assumptions change, downstream nodes become `stale`, not deleted.

## Rollout Phases (Implementation)

### Phase 0: Instrumentation and baselines

- Track time-to-first-draft
- Track question counts (asked/answered/skipped/deferred)
- Track session completion by mode

### Phase 1: Workspace shell + navigation

- Add persistent nav rail
- Add browser back/forward support
- Add jump-to-node UX
- Add active gate banner
- Maintain compatibility with existing panels

### Phase 2: Client-side history + local persistence

- Persist selected node and nav cursor in localStorage
- Persist recent node snapshots for better reload resilience

### Phase 3: Server-side workflow artifacts + endpoints

- Add workflow tables
- Persist versioned artifacts during pipeline
- Add workflow read endpoints

### Phase 4: Draft-first + question budget

- Add mode selection
- Implement question budget enforcement scaffolding
- Add generate-draft-now pathway

### Phase 5: Benchmark inspector + editable assumptions

- Add benchmark assumption artifact and UI
- Add mutation endpoint and downstream invalidation

### Phase 6: Polish / resilience

- Node-aware reconnect behavior
- Better stale-pipeline recovery UX
- Edge-case cleanup

## Test Plan (end-to-end)

- Start session, move between nodes, answer gate, return to gate
- Browser back/forward navigation across nodes
- Refresh during active session and restore node context
- SSE disconnect/reconnect with pending gate
- Upload resume file and JD file
- Paste JD URL and validate resolution
- Reuse saved resume / choose new upload / paste
- Run full pipeline to export
- `tsc --noEmit` for `app` and `server`

## Open Questions

- Should `sections` node expose one route per section (`/sections/:sectionId`) in Phase 1 or Phase 3?
- Do we persist node snapshots directly in `coach_sessions` for fast summary reads, or derive from artifacts?
- Should batch question submit be available for all gate types or only questionnaires/positioning?
