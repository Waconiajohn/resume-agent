# v2 Archaeology

**Tag:** `v2-final-2026-04-19`
**Date:** 2026-04-19
**Status:** v2 source deleted in favor of v3. Retrieve via git tag when needed.

---

## Why v2 was retired

v2's 10-agent resume pipeline (candidate-intelligence, job-intelligence, benchmark-candidate, gap-analysis, narrative-strategy, resume-writer, truth-verification, ats-scoring, tone-scoring, hiring-manager-scan, assembly) shipped at 58-63% fixture pass rate with chronic fabrication, attribution drift, and a coaching-overlay UI that layered complexity without delivering proportional value. The v3 rebuild replaced it with a 6-stage pipeline (extract → classify → benchmark → strategize → write → verify) on a capability-routed provider layer, achieving 19/19 fixture pass at ~$0.10/resume. Full context:

- `docs/v3-rebuild/00-Executive-Summary.md`
- `docs/v3-rebuild/reports/phase-4.13-final-summary.md`
- `docs/v3-rebuild/reports/v3-cutover-shape-audit.md`

John's decision to do a full frontend rebuild (vs. an adapter layer) was based on the v2 coaching-overlay paradigm being wrong at its core, not on a shape mismatch that a thin adapter could bridge.

## What lived in v2 (at the tag)

**Backend** — `server/src/agents/resume-v2/`:
- `orchestrator.ts` — 10-agent pipeline sequencer with ~15 SSE event types
- `candidate-intelligence/` — parse resume into structured background
- `job-intelligence/` — extract JD requirements
- `benchmark-candidate/` — Perplexity-backed ideal-candidate research (v3 replaced this with a GPT-5.4-mini stage, no Perplexity)
- `gap-analysis/` — candidate vs JD vs benchmark, produces requirement_work_items
- `narrative-strategy/` — positioning narrative
- `resume-writer/` — section-by-section write with the coaching-overlay metadata
- `truth-verification/` — claim-by-claim attribution check
- `ats-scoring/` — numerical ATS match score
- `tone-scoring/` — numerical tone score
- `hiring-manager-scan/` — pass/fail + 4 sub-scores + red flags
- `assembly/` — deterministic wrap-up into AssemblyOutput
- `knowledge/` — resume-rules.ts with SOURCE_DISCIPLINE + shared guidance
- `types.ts` — all v2 agent I/O interfaces

**Backend routes** — `server/src/routes/resume-v2-pipeline.ts` (POST /start + GET /:sessionId/stream), `server/src/routes/resume-v2-pipeline-support.ts` (StoredV2Snapshot).

**Frontend** — `app/src/components/resume-v2/`:
- `V2ResumeScreen.tsx` — top-level resume-builder screen
- `V2StreamingDisplay.tsx` — SSE event accumulator + incremental renderer
- `V2IntakeForm.tsx` / `PipelineIntakeForm.tsx` — intake
- `ScoringReport.tsx` + `scoring-report/*` — ats/truth/tone panels
- `scoring-report/HiringManagerScanSection.tsx`
- `BulletCoachingPanel` + related coaching-overlay pieces
- `dev/ResumeV2VisualHarness.tsx`
- `app/src/hooks/useV2Pipeline.ts` — SSE consumer
- `app/src/types/resume-v2.ts` — ResumeDraft, ResumeBullet, AssemblyOutput types
- `app/src/lib/master-resume-promotion.ts` — promotion payload builders (v3 adapted logic into `server/src/v3/master/promote.ts`)
- `app/src/lib/resume-v2-export.ts` — DOCX/PDF export helpers (adapted into v3 where needed)

## How to retrieve a v2 file

```
git show v2-final-2026-04-19:server/src/agents/resume-v2/benchmark-candidate/agent.ts
git show v2-final-2026-04-19:app/src/components/resume-v2/V2StreamingDisplay.tsx
git show v2-final-2026-04-19:server/src/agents/resume-v2/types.ts
```

Or to check out the whole tree at that commit into a scratch directory:

```
git worktree add /tmp/v2-final v2-final-2026-04-19
```

## What was preserved after deletion

The following non-v2 code was explicitly kept because it's used by v3 or other platform features:

- `server/src/lib/*` — llm-provider, logger, supabase, feature-flags, auth middleware, rate-limit middleware, etc.
- `server/src/v3/*` — the whole v3 pipeline
- `server/src/v3/shadow/*` — dormant shadow-deploy infrastructure (unused after v3 cutover; kept for possible revival)
- `server/src/routes/sessions.ts` — still used by legacy chat flows
- `app/src/components/admin/ShadowRunsTab.tsx` — admin review UI (dormant; tied to the shadow infrastructure)
- `supabase/migrations/20260418_create_resume_v3_shadow_runs.sql` — the shadow runs table (empty but preserved)
- `supabase/migrations/20260218232808_add_master_resume_columns_and_rpcs.sql` — `master_resumes` + `create_master_resume_atomic` RPC. v3 uses both.
- `app/src/lib/master-resume-export.ts` and other master-resume utilities shared with non-v2 features

---

**Tag committed with this document. Anything you can't find by searching HEAD, look under `v2-final-2026-04-19`.**
