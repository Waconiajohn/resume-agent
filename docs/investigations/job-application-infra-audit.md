# Job Application Infrastructure Audit — Approach C Buildability

**Date:** 2026-04-21
**Scope:** Investigation only. No code changes.
**Sibling doc:** `state-reset-and-export-plan.md` (where Approach C was originally estimated at 2-3 weeks).
**Status:** Complete. Recommendation at the end.

---

## TL;DR

**~70% of the infrastructure for Approach C already exists.** `job_applications` table has been in the initial schema since day 0. `coach_sessions` (including v3's session store) has a `job_application_id` FK. Thank-you note, salary negotiation, 90-day plan, interview prep, LinkedIn optimizer, and debrief all already accept and persist `job_application_id`. A `/workspace/job/:jobId` URL route and a real `JobWorkspaceScreen` component exist.

**What's missing is primarily frontend wiring (products don't receive/pass the application ID) and a single thorny architectural question: there are TWO "application" entities in the schema — `job_applications` and `application_pipeline` — with product FKs split across them.**

**Revised effort estimate: 1-2 weeks of focused work**, most of it glue + one day to resolve the entity unification. Original estimate was 2-3 weeks assuming a from-scratch build.

**Recommendation: proceed with a modified Approach C** (Recommendation B in the task spec). The modification is adding a Phase 0 to resolve the two-entity split before scoping products to a single canonical parent. Approach A ("Start Fresh" button) is still worth shipping as a 2-3 hour stopgap for users hitting the bug TODAY.

---

## Part 1 — Infrastructure audit

### 1.1 — Existing job application primitives

**Database tables (three of them — and the split is real):**

| Table | Since | Purpose | User-id scoped | Status |
|---|---|---|---|---|
| `job_applications` | Initial schema (`001_initial_schema.sql:31`) | Parent entity — user, company, role, JD text, URL, status | Yes | Referenced by 7 product tables via FK. No dedicated CRUD route. |
| `application_pipeline` | Phase 3A (`20260308213226_*.sql`) | Kanban tracking — 8 stages, stage_history, applied_date, next_action | Yes | `/api/applications/*` CRUD + frontend kanban UI live behind `FF_APPLICATION_PIPELINE`. |
| `resume_application_links` | Chrome ext handoff (`20260404_*.sql`) | Serialized resume payloads keyed by job URL for the "Apply to This Job" form-autofill flow | Yes | Read by Chrome extension; indexed by `(user_id, job_url, created_at DESC)`. Separate concern from workspace scoping. |

`job_applications` is the older, simpler, product-scoped parent. `application_pipeline` is the newer, richer, kanban-specific entity. They're decoupled (no FK either direction), and product tables have FKs to both in confusing ways (see 1.3).

**Server routes:**

| Route | File | Mount | Feature flag | What it does |
|---|---|---|---|---|
| `/api/applications/*` | `server/src/routes/application-pipeline.ts` (line 72+) | `server/src/index.ts:336` | `FF_APPLICATION_PIPELINE` | Full CRUD over `application_pipeline`. List, create, update (stage move), delete. Production-ready. |
| `/api/thank-you-note` | `server/src/routes/thank-you-note.ts:31, 50-55` | Mounted | `FF_THANK_YOU_NOTE` | Accepts optional `job_application_id`, persists to `coach_sessions.job_application_id`. |
| `/api/salary-negotiation` | `server/src/routes/salary-negotiation.ts:39, 49-54` | Mounted | `FF_SALARY_NEGOTIATION` | Same pattern — accepts + persists. |
| `/api/interview-debrief` | `server/src/routes/interview-debrief.ts:62-68, 122-123` | Mounted | FF-gated | Accepts `job_application_id` for filtering past debriefs. |
| `/api/cover-letter` | `server/src/routes/cover-letter.ts:23-29` | Mounted | `FF_COVER_LETTER` | **Does NOT accept `job_application_id`.** Schema currently: session_id, resume_text, job_description, company_name, tone. |
| `/api/v3-pipeline/run` | `server/src/routes/v3-pipeline.ts:43-48` | Mounted | (flag gated) | **Does NOT accept `job_application_id`.** v3 writes to `coach_sessions` via added v3 columns, but no application link today. |

**Frontend URL routing:**

| Route | Element | What it shows |
|---|---|---|
| `/workspace/job/:jobId` | `JobWorkspaceRoute` → `JobWorkspaceScreen` | **Already scopes a view by `jobApplicationId`** — reads applications via `useApplicationPipeline`, filters sessions, shows per-application resume + cover-letter modals, handles stage transitions. 155 lines of working code. |
| `/workspace?room=resume&focus=cover-letter` | `ResumeWorkshopRoom` + `CoverLetterScreen` | The non-scoped, singleton path that state-reset-and-export-plan.md identified as broken. |
| `/resume-builder/session?sessionId=X` | Resume V2 / V3 builder | Session-scoped, remounts on sessionId change. **Does not link to a job application today** — session is standalone. |

**Frontend state:**

| Concept | Hook | What it does | App link? |
|---|---|---|---|
| `useApplicationPipeline` | `app/src/hooks/useApplicationPipeline.ts` | CRUD against `/api/applications` (the pipeline kanban table). Exposes `applications`, `fetchApplications`, `moveToStage`. | Yes — full wiring already. |
| `JobWorkspaceScreen` | `app/src/components/career-iq/JobWorkspaceScreen.tsx` | Reads jobApplicationId from URL, loads sessions, finds the matching record, renders `JobWorkspaceView`. | Yes — already built. |

### 1.2 — Chrome extension + kanban

**Chrome extension:**

- Table: `resume_application_links`
- Keyed by `(user_id, job_url, created_at DESC)` — not by a stable application ID.
- The extension reads via `GET /api/extension/ready-resume?job_url=...` and injects into form fields.
- Status field: `'ready'` → `'applied'`.
- **Does NOT currently create a `job_applications` or `application_pipeline` row.** It's a handoff mechanism, not a tracking entity. Separate concern from workspace scoping.

**Kanban pipeline:**

- Table: `application_pipeline`
- Route: `/api/applications/*` (yes, confusingly named — it manages `application_pipeline`, not `job_applications`)
- Frontend: `useApplicationPipeline` hook, `JobCommandCenterRoom.tsx` kanban board, `JobWorkspaceScreen.tsx` per-application view.
- Status: working, behind `FF_APPLICATION_PIPELINE`.

**Critical finding: the two "application" entities are NOT linked.** `application_pipeline` rows have no FK to `job_applications` and vice versa. `networking_contacts.application_id` references `application_pipeline(id)`. `coach_sessions.job_application_id` references `job_applications(id)`. A user could have:
- A kanban card tracking "Senior PM @ Acme" in `application_pipeline`
- A separate `job_applications` row also for "Senior PM @ Acme" (created when the user runs a coach session)
- These two rows know nothing about each other

This is exactly the halt condition the task spec flagged: **"two competing 'application' concepts that would collide — this is a design decision before implementation."** Surfacing now (see Part 3).

### 1.3 — Supabase schema — FK wiring map

All product-report tables that foreign-key to an application entity:

**References `job_applications(id)`:**

| Table | Migration | FK action |
|---|---|---|
| `coach_sessions` | `001_initial_schema.sql:61` | `ON DELETE SET NULL` |
| `master_resume_history` | `001_initial_schema.sql:98` | `ON DELETE SET NULL` |
| `interview_prep_reports` | `20260308213844_*.sql:8` | `ON DELETE SET NULL` |
| `linkedin_optimization_reports` | `20260307052758_*.sql:17` | `ON DELETE SET NULL` |
| `thank_you_note_reports` | `20260317121500_*.sql:14` | `ON DELETE SET NULL` |
| `ninety_day_plan_reports` | `20260317121500_*.sql:26` | `ON DELETE SET NULL` |
| `salary_negotiation_reports` | `20260317121500_*.sql:38` | `ON DELETE SET NULL` |

**References `application_pipeline(id)`:**

| Table | Migration | FK action |
|---|---|---|
| `networking_contacts` | `20260308310000_*.sql:2` | `ON DELETE SET NULL` |
| `interview_debriefs` | `20260308213215_*.sql:7` | Nullable, comment says "FK to application_pipeline" (not enforced) |

**No FK, but related:**

- `resume_application_links` — Chrome-ext handoff; not product workspace state.
- V3's `coach_sessions.v3_pipeline_output` — added `20260420_add_v3_session_state.sql`; reuses `coach_sessions.job_application_id` by inheritance.

**What would need to migrate for Approach C:** Nothing, if we pick `job_applications` as the canonical entity — 7 of 9 product FKs already point there. Only `networking_contacts.application_id` and `interview_debriefs.job_application_id` would need to re-point (and we'd likely fold `application_pipeline`'s stage/tracking columns into `job_applications`).

### 1.4 — v3 sessionId vs job_applications

Key finding: **v3 is NOT stateless anymore.** I caught an out-of-date docstring. The route's intro comment still claims "Stateless by design (Phase A) — no session_id, no DB row" (`v3-pipeline.ts:10`), but migration `20260420_add_v3_session_state.sql` added six v3-specific columns to `coach_sessions` (`v3_pipeline_output`, `v3_jd_text`, `v3_jd_title`, `v3_jd_company`, `v3_resume_source`, `v3_edited_written`). The migration comment explicitly chose to **extend `coach_sessions` rather than create a new table**, with this rationale (line 10-14):

> "v3 already writes a coach_sessions row at pipeline start for billing. Adding the pipeline output to the same row is one fewer write and no join on lookup."

So the schema answer to the task spec's Path 1 vs Path 2 question is **already Path 2 in spirit**: v3 sessions live in `coach_sessions`, which already has `job_application_id` FK. v3 just doesn't populate that FK yet — nothing passes it from the frontend.

**What a v3 session contains today:**
- The coach_sessions row with `product_type = 'resume_v3'`
- `v3_pipeline_output` (full structured/benchmark/strategy/written/verify/timings/costs bundle)
- `v3_jd_text` / `v3_jd_title` / `v3_jd_company`
- `v3_resume_source` ('master' or 'upload')
- `v3_edited_written` (user edits to the output)

**Is a v3 session 1:1 with a resume generation attempt, or can it span multiple?**

It's 1:1 with a generation attempt today. A user running the pipeline twice for the same job produces two coach_sessions rows. If Approach C wants to group "multiple resume iterations for one application" under one parent, the current schema supports it — multiple coach_sessions rows pointing to one job_applications row is exactly what the existing FK structure models.

**Path 1 vs Path 2 for Approach C:**

Path 2 (new job_applications parent, coach_sessions are children) is **already the current design.** It just isn't being USED that way because:
1. No frontend flow passes a `job_application_id` when starting a session.
2. No UI lets the user pick which application a new session belongs to.
3. `/api/applications` manages the wrong table (`application_pipeline` instead of `job_applications`).

---

## Part 2 — Buildability assessment

### 2.1 — What exists already

- ✅ **`job_applications` table** with full schema + RLS — 90% of the parent entity
- ✅ **`coach_sessions.job_application_id` FK** — most product state already has the path to an application
- ✅ **7 product-report tables FK-link to `job_applications`** — thank-you, interview prep, LinkedIn opt, 90-day plan, salary negotiation, master resume history, coach sessions
- ✅ **Thank-you, salary, debrief, prep routes accept `job_application_id`** in their API schemas — backend is ready
- ✅ **`/workspace/job/:jobId` frontend route + JobWorkspaceScreen component** — URL-scoped per-application view exists
- ✅ **`useApplicationPipeline` hook** — CRUD + state management on frontend
- ✅ **Kanban UI (`JobCommandCenterRoom`)** — user-visible application list, stage management
- ✅ **v3 already persists to coach_sessions** — the scoping spine v3 needs to join the application model

### 2.2 — What's missing (and effort)

Ordered roughly by blocking → nice-to-have:

1. **Resolve the two-entity split (`job_applications` vs `application_pipeline`).** **BLOCKING.** Can't scope products to "the application" cleanly when there are two parents. Effort: 1-2 days (migration design + migration script + test + coordinated rename).
2. **Cover letter route accept `job_application_id`.** Effort: 30 min (1-line schema, 2-line persist).
3. **V3 pipeline route accept `job_application_id`.** Effort: 30 min (same pattern).
4. **Frontend products receive `jobApplicationId` from route params.** Update `CoverLetterScreen`, `ThankYouNoteScreen`, `InterviewPrepRoom`, etc. to read from `useParams()` and pass to their start-pipeline calls. Effort: 1 day (~6 products × ~1 hour each).
5. **React Router remount-on-change.** The URL needs to be shaped so a key change triggers component remount, clearing hook state. This is what solves the state-reset bug "for free." `/workspace/job/:jobId/cover-letter` instead of `/workspace?room=resume&focus=cover-letter`. Effort: 0.5 day (routing refactor + `ErrorBoundary` key updates).
6. **"Create new application" flow.** When a user uploads a new resume + paste a JD, create the `job_applications` row first, then attach the product session to it. Effort: 0.5 day (intake-form tweak + API call).
7. **"My Applications" list view.** Already partially exists via kanban, but the natural entry point should be an application picker at the top of `ResumeWorkshopRoom`. Effort: 0.5 day.
8. **Application switcher UX.** Small header component with the current application's name + a dropdown to switch. Effort: 0.5 day.
9. **Backfill existing data (optional).** If there are production coach_sessions without a job_application_id, decide whether to backfill or leave dangling. Effort: 0.5 day to write a safe migration.

### 2.3 — Revised effort estimate

**Total: 1-2 weeks** (5-8 working days).

- Phase 0 (entity unification): 1-2 days
- Phases 1-4 (route + frontend + navigation): 3-5 days
- Buffer for integration issues: 1-2 days

Down from the original 2-3 week estimate. **Delta: ~1 week faster** because most of the schema and routing primitives are already in place; the remaining work is glue + one design decision.

### 2.4 — Risks and unknowns

| Risk | Category | Notes |
|---|---|---|
| Which entity is canonical — `job_applications` or `application_pipeline`? | **KNOWN** | Real decision. Recommendation below. Either direction is doable but changes ~30% of the migration shape. |
| Networking data migration | **KNOWN** | `networking_contacts.application_id` FKs `application_pipeline`. If canonical becomes `job_applications`, need a data migration joining on `(user_id, company_name, role_title)` — which may not uniquely match. |
| Interview-debrief data | **KNOWN** | Same FK issue as networking. Lower blast-radius since debriefs are post-interview. |
| Existing `coach_sessions` rows with NULL `job_application_id` | **KNOWN** | Most rows will be null today. They can stay null (orphaned sessions, viewable via the current non-scoped UI) or be retroactively grouped. Not a blocker. |
| Chrome-extension handoff re-keying | **KNOWN** | `resume_application_links.job_url` is the join key, not `job_application_id`. After Approach C, we can ALSO store the application_id for a cleaner handoff, but existing extension flows keep working without change. |
| Does the billing code use `coach_sessions.job_application_id`? | **SUSPECTED** | If billing attributes cost to an application, unifying entities could cause attribution gaps. Quick grep needed. Did NOT grep in this investigation. |
| Does anything else assume `application_pipeline` exclusively? | **SUSPECTED** | Kanban board surely does. A few hooks might. Frontend `useApplicationPipeline` is only-kanban. Need to audit callers. |
| Authentication/sharing boundaries | **KNOWN — not a risk** | Both tables have `user_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` + RLS policies. No shared-application concept anywhere. Clean. |
| Concurrent session edits | **UNKNOWN** | If a user has two tabs open on the same application, do they stomp each other's edits? Current code doesn't lock. Approach C doesn't make this worse. |

### 2.5 — Proposed build phases

**Phase 0 — Resolve the entity split (1-2 days)**

Recommended canonical: **`job_applications`**. Reasons:
- 7 of 9 product FKs already point at it
- Older (initial schema) — less churn for existing data
- Simpler shape; the kanban columns (stage, stage_history, next_action, source, applied_date) can be added to it via one ALTER TABLE
- `application_pipeline` becomes either (a) dropped with its columns migrated, or (b) retained as a kanban-specific view

Migration work:
- Add kanban columns to `job_applications` (`stage`, `stage_history`, `source`, `next_action`, `next_action_due`, `score`, `applied_date`, `last_touch_date`)
- Migrate `application_pipeline` rows into `job_applications` (join by `(user_id, company_name, role_title)` or leave both tables; drop `application_pipeline` in a later commit)
- Re-point `networking_contacts.application_id` and `interview_debriefs.job_application_id` to `job_applications(id)`
- Rename `/api/applications` to `/api/job-applications` — or keep the route and update the underlying table
- Update `useApplicationPipeline` to read from the new source

Independently shippable: yes. After Phase 0, every product that references an application uses one canonical parent.

**Phase 1 — Route and hook plumbing (2-3 days)**

- Add `job_application_id` to cover-letter and v3 route schemas (30 min + 30 min)
- Add `job_application_id` to all the product frontend hooks' `startPipeline()` call signatures
- Update `CoverLetterScreen`, `ThankYouNoteScreen`, etc. to accept `jobApplicationId` prop
- URL refactor: new routes `/workspace/application/:applicationId/resume`, `/workspace/application/:applicationId/cover-letter`, etc.
- Add `key={applicationId}` or nested routes so React Router remounts on application change

Independently shippable: yes. After Phase 1, switching applications via URL clears all product state automatically (solves the state-reset bug as a side effect).

**Phase 2 — Navigation + list UX (1-2 days)**

- "My applications" list at `/workspace/applications` (or as the default `/workspace` view)
- Application switcher component in the header of any per-application screen
- "Create new application" intake flow (product intake form becomes "new application" with company/role/JD fields)
- Dashboard tile pointing at the newest application

Independently shippable: yes.

**Phase 3 — Cleanup + data migration (1 day)**

- Backfill or ignore existing coach_sessions without job_application_id
- Drop `application_pipeline` table (if Phase 0 migrated data)
- Remove feature flag `FF_APPLICATION_PIPELINE` if kanban is now always-on
- Update CLAUDE.md agent list + Obsidian notes

Independently shippable: yes.

**Phase 4 — Stretch: resume V3 pipeline auto-creates application (0.5-1 day)**

- When a user runs the v3 pipeline with a new company/role, auto-create a `job_applications` row and set the FK.
- The user's "kanban" populates automatically from each run.
- Users can still create applications manually for jobs they haven't generated a resume for yet.

---

## Part 3 — Recommendation

**Recommendation B — Proceed with a modified Approach C.**

Modification: add Phase 0 (entity unification) to the front of the original plan. Original plan was: foundation / v3 integration / cover letter / remaining products / navigation. Modified plan is: **unify / plumb / navigate / clean up**.

### Why B, not A or C

**Not Recommendation A (Proceed with C as-scoped):** The task spec's original C plan assumed building the foundation from scratch. We now know the foundation is 70% built, but there's a wrinkle (two-entity split) that the original plan didn't account for. "As-scoped" would skip the entity decision and risk a half-finished migration.

**Not Recommendation C (Fall back to Approach A):** The infrastructure IS present enough that building C is within reach at 1-2 weeks. Approach A ("Start Fresh" button) is a UX Band-Aid; it doesn't route state by application, doesn't let users jump between multiple applications, doesn't restore past work, doesn't solve the conceptual problem. It's a stopgap.

### Honest assessment

- **What's genuinely ready:** the data model, the per-application URL pattern, the view component for an application workspace, the kanban + hook infrastructure. That's the hard part.
- **What's genuinely missing:** frontend glue to pass applicationId through the product pipelines, an intake-form refactor to create applications up front, and the entity decision.
- **What's risky:** the two-entity decision. Done wrong (or deferred), it becomes tech debt that blocks every future product integration. Done now (Phase 0), it's a 1-2 day focused migration.

### Suggested sequencing

1. **Ship Approach A this week** (2-3 hours) as a stopgap. Users hitting the bug TODAY need a working escape hatch, and A doesn't conflict with C — the "Start Fresh" button becomes either redundant (once C clears state on URL change) or a useful manual override.

2. **Start Approach C next sprint** with a 1-2 week budget. Phase 0 first (entity decision + migration), then plumbing and navigation. The original 2-3 week estimate becomes 1-2 weeks given what's already in place.

3. **Plan for Phase 4** (v3 pipeline auto-creates application) as an opportunistic polish pass once Phases 0-3 are in production for a week or two.

### Final timeline estimate

| Work | Effort | Sequencing |
|---|---|---|
| Approach A — "Start Fresh" button (stopgap) | 2-3 hours | This week |
| Approach C Phase 0 — entity unification | 1-2 days | Next sprint, day 1 |
| Approach C Phases 1-2 — route plumbing + navigation | 3-5 days | Days 2-6 |
| Approach C Phase 3 — cleanup + data migration | 1 day | Day 7 |
| Approach C Phase 4 — v3 auto-create (stretch) | 0.5-1 day | Day 8 if time |
| **Total** | **~1-2 weeks** | |

### Halt conditions (as addressed)

- ✅ **Codebase mostly-complete job application architecture that just needs wiring:** Yes — see above. Surfaced.
- ✅ **Competing "application" concepts:** Yes — `job_applications` vs `application_pipeline`. Design decision needed (recommended resolution in Phase 0 above). Surfaced.
- ⚠️ **Existing user data migration:** Will need the Phase 0 migration. Low risk given both tables have `user_id` + RLS + no shared concepts; `networking_contacts.application_id` re-pointing is the only data-sensitive move. Scoped.
- ✅ **State-reset bug more serious than already found:** No. The bug is same-tab React state persistence, not cross-user leakage. Confirmed.
- ✅ **Budget exceeded:** No. Investigation used only file reads and grep; zero LLM calls.

---

## Appendix — Artifacts referenced

**Migrations reviewed:**
- `supabase/migrations/001_initial_schema.sql` (job_applications, coach_sessions, master_resume_history)
- `supabase/migrations/20260307052758_linkedin_optimization_reports.sql`
- `supabase/migrations/20260308213215_interview_debriefs.sql`
- `supabase/migrations/20260308213226_application_pipeline.sql`
- `supabase/migrations/20260308213844_interview_prep_reports.sql`
- `supabase/migrations/20260308310000_networking_application_link.sql`
- `supabase/migrations/20260317121500_job_workspace_asset_links.sql`
- `supabase/migrations/20260404_resume_application_links.sql`
- `supabase/migrations/20260420_add_v3_session_state.sql`

**Server routes reviewed:**
- `server/src/routes/application-pipeline.ts` (CRUD over application_pipeline)
- `server/src/routes/cover-letter.ts` (no job_application_id today)
- `server/src/routes/thank-you-note.ts` (accepts + persists)
- `server/src/routes/salary-negotiation.ts` (accepts + persists)
- `server/src/routes/interview-debrief.ts` (accepts + filters)
- `server/src/routes/v3-pipeline.ts` (no job_application_id today; uses coach_sessions via v3 columns)

**Frontend reviewed:**
- `app/src/App.tsx:720-731` (/workspace/job/:jobId route)
- `app/src/components/career-iq/JobWorkspaceRoute.tsx`
- `app/src/components/career-iq/JobWorkspaceScreen.tsx`
- `app/src/hooks/useApplicationPipeline.ts` (referenced; not fully read)
- `app/src/types/session.ts:16` (job_application_id on CoachSession)
