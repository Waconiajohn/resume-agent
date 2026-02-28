# Sprint 3: Master Resume — Persistent Evidence Accumulation
**Goal:** Enable persistent evidence accumulation across pipeline sessions so the Strategist can skip redundant interview questions for repeat users.
**Started:** 2026-02-27

## Stories This Sprint
1. [x] Story 1: Database Migration — Add `evidence_items` Column — [status: done]
2. [x] Story 2: Auto-Save Master Resume on Pipeline Completion — [status: done]
3. [x] Story 3: Load Master Resume at Pipeline Start — [status: done]
4. [x] Story 4: Inject Master Resume into Strategist Context — [status: done]
5. [x] Story 5: TypeScript Compilation + Unit Tests — [status: done]

## Audit Fix Stories (post-implementation)
6. [x] Story 1 (Audit): Fix shallow copy mutation in mergeMasterResume — [status: done]
7. [x] Story 2 (Audit): Fix Supabase error handling in saveMasterResume — [status: done]
8. [x] Story 3 (Audit): Use UPDATE for merge case instead of INSERT — [status: done]
9. [x] Story 4 (Audit): Fix migration — drop old RPC overload + transaction — [status: done]
10. [x] Story 5 (Audit): Add runtime guards for DB casts — [status: done]
11. [x] Story 6 (Audit): Add size caps on injection + evidence storage — [status: done]
12. [x] Story 7 (Audit): Add evidence_items to POST /resumes — [status: done]
13. [x] Story 8 (Audit): Fix evidence extraction for prose content — [status: done]
14. [x] Story 9 (Audit): Fix merge edge cases — skills + contact info — [status: done]
15. [x] Story 10 (Audit): Fix DB query error in pipeline.ts — [status: done]
16. [x] Story 11 (Audit): Adjust strategist prompt guidance — [status: done]
17. [x] Story 12 (Audit): Add missing test scenarios — [status: done]

## Audit Round 2 Fix Stories (5 critical + 8 high)
18. [x] Story C1: Link new master resume ID back to session — [status: done]
19. [x] Story C2: Remove BEGIN/COMMIT from migration — [status: done]
20. [x] Story C3: Detect zero-row UPDATE in saveMasterResume — [status: done]
21. [x] Story C4+H7+H8+H10: Fix evidence_items validation in POST /resumes — [status: done]
22. [x] Story C5: Add null guard on section.content in extractEvidenceItems — [status: done]
23. [x] Story H1+H2: Deep-clone new role bullets + education/certifications — [status: done]
24. [x] Story H4: Add earlier_career to evidence extraction filter — [status: done]
25. [x] Story H6: Add null guards in buildStrategistMessage — [status: done]
26. [x] Story H9: Cap individual evidence item text length — [status: done]
27. [x] Story Tests: Add 5 new test scenarios for audit round 2 — [status: done]

## Audit Round 3 — Comprehensive Production Hardening (23 fixes)
28. [x] AT-06: Transfer Craftsman scratchpad sections to state.sections — [status: done]
29. [x] AT-10: Fix Producer→Coordinator revision payload mismatch — [status: done]
30. [x] CO-01: Fix revision subscription leak on Producer failure — [status: done]
31. [x] persistSession: Add zero-row UPDATE detection + error handling — [status: done]
32. [x] savePositioningProfile: Add DB error logging — [status: done]
33. [x] Craftsman self_review: Fix false-pass on parse failure — [status: done]
34. [x] Craftsman check_anti_patterns: Fix stateful /g regex — [status: done]
35. [x] Producer cross-section consistency: Fix stateful /g regexes — [status: done]
36. [x] Strategist: Validate suggestions input robustly — [status: done]
37. [x] agent-loop.ts: Skip per-tool timeout for interactive tools — [status: done]
38. [x] agent-bus.ts: Cap messageLog at 500 entries — [status: done]
39. [x] retry.ts: Never retry AbortErrors — [status: done]
40. [x] json-repair.ts: Guard against catastrophic backtracking — [status: done]
41. [x] http-body-guard.ts: Return 400 on invalid JSON — [status: done]
42. [x] session-lock.ts: Reduce renewal interval to 30s — [status: done]
43. [x] llm.ts: Complete TOOL_MODEL_MAP for all agent tools — [status: done]
44. [x] DB: Create claim_pipeline_slot RPC migration — [status: done]
45. [x] pipeline.ts: Fix gate queue double-splice — [status: done]
46. [x] pipeline.ts: Sanitize error leakage via SSE — [status: done]
47. [x] questionnaire-helpers.ts: Fix dead ternary (free_text) — [status: done]
48. [x] export-docx.ts: Apply template font as document default — [status: done]
49. [x] export-docx.ts: Fix education field handling consistency — [status: done]
50. [x] useAgent.ts: Fix isProcessing false during streaming — [status: done]
51. [x] DB: Fix next_artifact_version service-role auth.uid() bypass — [status: done]
52. [x] llm-provider.ts: Fix interrupted stream usage loss — [status: done]
53. [x] export-filename.ts: Sanitize invisible/bidi control characters — [status: done]
54. [x] Tests: Add agent-bus, retry-abort, json-repair-guard tests (17 tests) — [status: done]

## Audit Round 4 — Medium/Low Production Hardening (6 fixes)
55. [x] pipeline.ts: Add .catch() to best-effort async functions — [status: done]
56. [x] pipeline.ts: Cap panel debounce queue at 50 — [status: done]
57. [x] http-body-guard.ts: Ensure reader.releaseLock() in finally — [status: done]
58. [x] pipeline.ts: Log sanitizeBlueprintSlice failures — [status: done]
59. [x] useAgent.ts: Abort controller cleanup on SSE error path — [status: done]
60. [x] sessions.ts: Validate restored messages before access — [status: done]

## Out of Scope (Explicitly)
- Master Resume Viewer Page (dedicated UI to browse/delete evidence items)
- Inline editing of master resume content
- Merge audit trail (tracking which session contributed which items)
- Evidence quality scoring
- Cross-session analytics
- H5: Legacy create-master-resume.ts fixes (backlogged)
- Medium/low issues from earlier audits (backlogged)
