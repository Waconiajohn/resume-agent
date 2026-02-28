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

## Out of Scope (Explicitly)
- Master Resume Viewer Page (dedicated UI to browse/delete evidence items)
- Inline editing of master resume content
- Merge audit trail (tracking which session contributed which items)
- Evidence quality scoring
- Cross-session analytics
- H5: Legacy create-master-resume.ts fixes (backlogged)
- Medium/low issues from audit round 2 (backlogged)
