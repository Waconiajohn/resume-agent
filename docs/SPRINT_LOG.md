# Sprint Log — Resume Agent

---

# Sprint 0 Retrospective: Dynamic Pipeline (Retroactive)
**Completed:** 2026-02-27

## What was delivered

This sprint covers the 4-phase Dynamic Pipeline work completed before the Scrum framework was adopted. Documented retroactively.

### Phase 1: Evidence Flow — Candidate Voice to Craftsman
- Added `interview_transcript` to `PipelineState`
- Strategist's `interview_candidate` tool persists raw Q&A pairs to pipeline state
- Expanded `classify_fit` evidence fields (career_arc.evidence 500→2000 chars, authentic_phrases 5→10 items)
- Coordinator's `buildCraftsmanMessage()` includes full interview transcript
- Section writer prompt: "Authentic voice beats resume-speak"

### Phase 2: Blueprint Approval Gate
- Feature flag `FF_BLUEPRINT_APPROVAL` (default true, skipped in fast_draft mode)
- `waitForUser('architect_review')` gate between Strategist and Craftsman
- BlueprintReviewPanel: editable positioning angle, section reorder, approve with edits
- Coordinator merges user edits into `state.architect` before Craftsman starts

### Phase 3: Creative Liberation — Strategic Blueprint
- `EvidencePriority` interface: requirement + available_evidence + importance + narrative_note
- `EvidenceAllocation`: `evidence_priorities`, `bullet_count_range`, `do_not_include`
- Architect prompt: strategic guidance, not prescriptive bullets
- Craftsman prompt: "Your Creative Authority" — writer not executor
- Section writer: `hasEvidencePriorities()` branches prompt (strategic vs prescriptive)
- Backward compatible: legacy `bullets_to_write` still supported

### Phase 4: Holistic Quality — Narrative Coherence
- `write_section` builds `crossSectionContext` from scratchpad (300-char excerpts)
- Section writer adds "PREVIOUSLY WRITTEN SECTIONS" block for continuity
- `check_narrative_coherence` tool: story arc, duplication, positioning threading, tonal consistency (0-100)
- `select_template` emits SSE transparency showing selection rationale
- Producer workflow updated with narrative coherence as step 6

### Infrastructure
- Pipeline heartbeat: 5-min interval in `routes/pipeline.ts` prevents stale recovery from killing long runs
- E2E fix: React native setter for textarea fills in zero-height panel layouts

## What went well
- 4-phase delivery was cohesive — each phase built cleanly on the previous one
- Evidence flow and creative liberation produced measurably better resume content
- Blueprint gate gives users meaningful control at the right moment
- Heartbeat fix resolved a critical reliability issue with minimal code

## What went wrong
- No framework in place — work was ad hoc, making it harder to track scope and decisions
- Some phases introduced scope that wasn't clearly bounded upfront
- No formal retrospective at the time

## What to improve next sprint
- Follow the Scrum framework established in CLAUDE.md for all future work
- Bound stories to single-session scope
- Document decisions as ADRs in real-time

## Technical debt identified
- SSE type mismatch (`as never` cast)
- Usage tracking cross-contamination
- MaxListenersExceededWarning on long sessions
- Legacy `agent/` directory still exists for chat route compatibility
