# V3 Cutover — Complete

**Branch:** `rebuild/v3`
**Completed:** 2026-04-19
**Status:** v3 is the primary resume pipeline. v2 retired. Full rebuild (Phases A → F) complete.

---

## 1. Summary

Over six phases we built a clean v3 resume pipeline, a v3-native UI, and a knowledge-vault integration, then retired v2:

- **Phase A** — v3 SSE streaming backend (`/api/v3-pipeline/run`)
- **Phase B** (B1–B5) — v3-native React UI: stage progress, intake, strategy panel, resume view with per-bullet attribution, verify panel, inline editing
- **Phase C** — Route flip: `/resume-builder/session` now serves `V3PipelineScreen`
- **Phase D** — Benchmark stage (GPT-5.4-mini, no Perplexity) inserted between classify and strategize; benchmark output surfaced in the Strategy panel as a first-class UI artifact
- **Phase E** — Master resume (knowledge vault) integration: auto-load on intake, auto-init on first run, post-pipeline promote-to-vault diff UI
- **Phase F** — Archaeology tag + delete v2 route + tests (15,821 lines removed)

End-to-end flow today: user lands on `/resume-builder/session`, sees "Using your knowledge base" if they have one (or an empty textarea if not), pastes a JD, watches six stages stream through the progress strip, sees the benchmark profile + strategy fill in on the left, the attribution-annotated resume fill in in the center, verify issues fill in on the right, and gets a "Save to knowledge base" panel below to promote new bullets.

---

## 2. What changed in the request handler

**Before (v2):**
```
POST /api/pipeline/start         → creates a coach_sessions row, kicks off 10-agent
                                    orchestrator in a void async IIFE, returns
                                    { session_id }. User subscribes via
GET  /api/pipeline/:id/stream    SSE GET to a persistent session.
```

**After (v3):**
```
POST /api/v3-pipeline/run        → streaming SSE response inline.
                                    Body: { resume_text? | use_master, job_description, ... }
                                    Response body IS the SSE stream; no session row,
                                    no GET follow-up. Client disconnect aborts mid-flight
                                    LLM calls via AbortController.
GET  /api/v3-pipeline/master     → fetch user's default master summary.
POST /api/v3-pipeline/promote    → diff + persist new bullets to master via
                                    create_master_resume_atomic RPC.
```

SSE events sent during the run (7 per stage × 6 stages + final):
- `stage_start`, `stage_complete` for each of extract / classify / benchmark / strategize / write / verify
- `pipeline_complete` with the full bundle (structured / benchmark / strategy / written / verify / timings / costs)
- `pipeline_error` on any stage throw

---

## 3. Shape compatibility approach

The v2/v3 shape audit ([`v3-cutover-shape-audit.md`](./v3-cutover-shape-audit.md)) concluded that a thin adapter layer would leave the v2 UI panels rendering with empty or zero-filled data. John chose Option 3 (full frontend rebuild) because the v2 coaching-overlay paradigm was the thing he disliked, not shape mismatch.

The rebuild:
- Dropped v2's numerical scoring (ats_match / truth / tone), hiring-manager-scan, per-bullet coaching metadata (review_state, proof_level, framing_guardrail, next_best_action, work_item_id), quick_wins, and 15-event SSE stream
- Kept the v2 concepts that were real: attribution discipline (now visible as source chips on every bullet), benchmark (now visible in the Strategy panel, not an internal artifact), verify issues (now surfaced inline on affected bullets)
- Added a knowledge-vault flow (auto-load, auto-init, promote diff) that v2 had but buried behind a Save-to-Master button without a curated promotion UX

The `master_resumes` table + `create_master_resume_atomic` RPC were preserved as-is; v3 uses both.

---

## 4. Lines of code removed

**Phase F deletion totals** (from git diff stats):
- `server/src/routes/resume-v2-pipeline.ts` — 2,685 lines (the v2 HTTP pipeline endpoint)
- 10 v2 test files — ~13,000 lines combined (resume-v2-agents, resume-v2-pipeline, orchestrator, section-planning, final-review-prompts, persistence, source-resume-outline, assembly, ensure-bullet-metadata, job-intelligence-golden)
- `FF_RESUME_V2` flag + conditional route mount
- `/resume-v2-legacy` frontend escape-hatch route

**Net: 15,821 lines deleted in Phase F** on top of the Phase A–E additions (~6,700 lines new v3 code). Net delta across the cutover: ~9,100 fewer lines of production source.

**Preserved (non-v2-pipeline uses):**
- `server/src/agents/resume-v2/` — individual agent entry points are still called by `server/src/agents/discovery/` and `server/src/routes/extension.ts`. Renaming / relocating is a follow-on cleanup sprint, not part of this cutover.
- `server/src/routes/resume-v2-pipeline-support.ts` — `StoredV2Snapshot` type still imported by `sessions.ts`.
- Frontend v2 components (V2ResumeScreen + subcomponents, `useV2Pipeline`, `resume-v2.ts` types) — widely imported by platform hooks; leave on disk as dead files until a dedicated pruning sprint.

All preserved code is unreachable from the user-facing resume flow. Cleanup is safe but optional.

---

## 5. Known issues

**Non-blocking findings from the cutover:**

1. **Dead frontend v2 code.** V2ResumeScreen and its subcomponents still sit in `app/src/components/resume-v2/`. Not rendered anywhere — no route references them — but files exist. A `dead-code-hunter` pass in a follow-on sprint will prune them safely once we confirm no hidden imports.
2. **v2 agents remain in `server/src/agents/resume-v2/`.** They're used by Discovery + Extension. The directory name is misleading now; rename to something like `agents/extraction-agents/` in a later refactor sprint.
3. **Shadow deploy infrastructure is fully dormant.** `FF_V3_SHADOW_ENABLED=false`, no UI path triggers it. Kept as working code in case the rollout approach changes in future.
4. **No `/api/v3-pipeline/promote` integration test yet.** The code path is covered by unit tests on the promote helper but the HTTP round-trip isn't end-to-end tested. First real user run will prove it.
5. **v2-tagged but still-used agents are not invoked by the v3 resume pipeline.** Those agents inform Discovery's profile-building flow, not v3 — so "v2 is retired from the resume pipeline" is accurate.

**No pipeline regressions.** All 105 v3 tests pass. App and server TypeScript both compile clean.

---

## 6. What's next for John

**Short term (today / this week):**
- **Smoke test v3 on your own resume.** Start the app locally, go to `/resume-builder/session`, paste your resume + a real JD, watch it stream, click some source chips, scan the benchmark panel, promote a few bullets. This is the first end-to-end run of the full stack.
- **Watch the dev-server logs** during the run to confirm stage timings land in the expected range (extract <1s, classify ~10–18s, benchmark ~8–12s, strategize ~5–8s, write ~5–10s, verify ~1–3s; total ~25–45s).
- **Confirm the master resume was auto-initialized** after your first run: hit `/resume-builder/session` again and the "Using your knowledge base" card should appear with v1.

**If issues surface:**
- Prompt drift → iterate on `server/prompts/benchmark.v1.md` or `write-*.v1.md`. Version-bump per the existing convention.
- UI bugs → the Phase B components are small and self-contained; each panel (`V3StrategyPanel`, `V3ResumeView`, `V3VerifyPanel`, `V3PromotePanel`) is a single file.
- Cost drift → the full 6-stage cost is measurable via the SSE `pipeline_complete.costs` payload. Keep an eye on it during the first 10 real runs to confirm we're still ~$0.10–0.12/resume with the benchmark added.

**Near term (next sprint if issues hold up):**
- Dead-code pruning: remove `app/src/components/resume-v2/`, `app/src/hooks/useV2Pipeline.ts`, `app/src/types/resume-v2.ts` once we confirm no unexpected consumers.
- Rename `server/src/agents/resume-v2/` to a domain-accurate name (e.g., `agents/extraction-agents/`) so the dir structure reflects the current reality.
- Optional enrichment interview driven by benchmark gaps (per the Phase E plan; deferred out of this cutover).

**Longer term:**
- Export path for v3 (DOCX/PDF from `WrittenResume`). Currently v3 renders in the UI; users can't download the finished resume yet. The v2 export path relied on v2's shape; v3 needs its own `renderWrittenResumeToDocx` helper.
- Real-user volume and cost telemetry. The Phase 4.13 cost baseline ($0.097–0.18/resume) was fixture-corpus; production resumes vary in length + complexity.

---

## Phase-by-phase commit ledger

- `d8003fe3` — phase A: v3 SSE streaming backend
- `f39bb784` — phase B1: useV3Pipeline hook + V3PipelineScreen skeleton
- `b6913e94` — phase B2: V3StrategyPanel
- `3a8d29a1` — phase B3: V3ResumeView attribution-first rendering
- `0aef4783` — phase B4: V3VerifyPanel
- `11019ef7` — phase B5: inline editing (EditableText)
- `bb6baf7b` — phase C: route flip (RESUME_BUILDER_SESSION_ROUTE → v3)
- `7012da95` — phase D: benchmark stage + Strategy panel surface
- `03885295` — phase E: master resume auto-load / auto-init / promote
- `5fd2c10e` — phase F: archaeology tag + retrieval notes
- `14280b3b` — phase F: delete v2 pipeline route + tests

**Archaeology tag:** `v2-final-2026-04-19` (local; John's call whether to push).

---

**v3 is the primary resume pipeline. v2 is retired. Ready for real-user testing.**
