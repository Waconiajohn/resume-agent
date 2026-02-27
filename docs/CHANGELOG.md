# Changelog — Resume Agent

## 2026-02-27 — Session: Framework & Dynamic Pipeline

**Sprint:** 0 (retroactive) + 1 (framework onboarding)
**Summary:** Completed 4-phase Dynamic Pipeline work, fixed critical infrastructure issues, established Scrum framework.

### Changes Made

#### Dynamic Pipeline — Phase 1: Evidence Flow
- `server/src/agents/types.ts` — Added `interview_transcript` to `PipelineState`
- `server/src/agents/strategist/tools.ts` — `interview_candidate` persists raw Q&A pairs to state
- `server/src/agents/strategist/tools.ts` — `classify_fit` expanded evidence fields (2000 chars, 10 phrases)
- `server/src/agents/coordinator.ts` — `buildCraftsmanMessage()` includes interview transcript
- `server/src/agents/craftsman/tools.ts` — Section writer: "Authentic voice beats resume-speak"

#### Dynamic Pipeline — Phase 2: Blueprint Approval Gate
- `server/src/lib/feature-flags.ts` — Added `FF_BLUEPRINT_APPROVAL` flag
- `server/src/agents/coordinator.ts` — `waitForUser('architect_review')` gate + edit merging
- `app/src/components/panels/BlueprintReviewPanel.tsx` — New panel: edit positioning, reorder sections
- `app/src/components/panels/panel-renderer.tsx` — Blueprint panel integration

#### Dynamic Pipeline — Phase 3: Creative Liberation
- `server/src/agents/types.ts` — `EvidencePriority`, updated `EvidenceAllocation` interfaces
- `server/src/agents/strategist/tools.ts` — Architect prompt: strategic guidance mode
- `server/src/agents/craftsman/prompt.ts` — "Your Creative Authority" section
- `server/src/agents/craftsman/tools.ts` — `hasEvidencePriorities()` branching in section writer

#### Dynamic Pipeline — Phase 4: Holistic Quality
- `server/src/agents/craftsman/tools.ts` — `crossSectionContext` from scratchpad in `write_section`
- `server/src/agents/craftsman/tools.ts` — "PREVIOUSLY WRITTEN SECTIONS" prompt block
- `server/src/agents/producer/tools.ts` — `check_narrative_coherence` tool (new)
- `server/src/agents/producer/tools.ts` — `select_template` SSE transparency
- `server/src/agents/producer/prompt.ts` — Updated workflow with narrative coherence step

#### Infrastructure Fixes
- `server/src/routes/pipeline.ts` — Pipeline heartbeat: 5-min `setInterval` touching `updated_at`
- `e2e/helpers/pipeline-responder.ts` — React native setter for textarea fills in zero-height panels

#### Framework
- `CLAUDE.md` — Added Scrum development framework and anti-drift rules
- `docs/ARCHITECTURE.md` — System architecture documentation (new)
- `docs/CONVENTIONS.md` — Code conventions and patterns (new)
- `docs/DECISIONS.md` — 6 ADRs for existing architectural decisions (new)
- `docs/BACKLOG.md` — Known work items organized as epics/stories (new)
- `docs/CURRENT_SPRINT.md` — Sprint 1: Framework Onboarding (new)
- `docs/SPRINT_LOG.md` — Sprint 0 retrospective (new)
- `docs/CHANGELOG.md` — This file (new)

### Decisions Made
- ADR-001 through ADR-006 documented retroactively (see DECISIONS.md)
- Scrum framework adopted for all future development

### Known Issues
- MaxListenersExceededWarning on long sessions
- 409 conflict errors when frontend sends during processing (Bug 18)
- Revision loop after user approval (Bug 16)
- Context forgetfulness on long sessions (Bug 17)
- PDF Unicode rendering (`?` characters)

### Next Steps
- Complete Sprint 1 (framework onboarding — this session)
- Plan Sprint 2 from backlog (production hardening candidates)
