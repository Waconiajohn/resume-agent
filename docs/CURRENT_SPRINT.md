# Sprint R4: UI/UX Polish — Playwright Testing Remediation

**Goal:** Fix 9 UI/UX issues found during Session 74 Playwright testing before launch.
**Started:** 2026-03-10
**Findings Reference:** `docs/obsidian/30_Specs & Designs/UI-UX Testing Findings - Session 74.md`

## Stories This Sprint

### Story R4-H1: Username Display — Use Real Name [HIGH]
- **Acceptance Criteria:**
  - [x] `useAuth()` returns `displayName` from `user.user_metadata?.full_name ?? email.split('@')[0] ?? 'there'`
  - [x] `App.tsx` passes `displayName` (not `user.email`) as `userName` to CareerIQScreen
  - [x] Greeting shows real first name; sidebar shows "AI John" not "AI jjschrup@yahoo.com"
  - [x] Tests updated, tsc clean
- **Status:** done

### Story R4-H2: PipelineSummary Data Source Alignment [HIGH]
- **Acceptance Criteria:**
  - [x] PipelineSummary reads from `application_pipeline` table with `stage` column
  - [x] DashboardHome `loadPipelineStats` also reads `application_pipeline`
  - [x] Stage mapping keys match kanban stages
  - [x] tsc clean
- **Status:** done

### Story R4-H3: Error Sessions UX Cleanup [HIGH]
- **Acceptance Criteria:**
  - [x] DashboardHome feed filters out `pipeline_status === 'error'` sessions
  - [x] DashboardSessionCard status badge: "Error" → "Incomplete"
  - [x] SessionHistoryTab filter label: "Error" → "Incomplete"
  - [x] tsc clean
- **Status:** done

### Story R4-M1: Mobile FAB Clears Bottom Nav [MEDIUM]
- **Acceptance Criteria:**
  - [x] CoachDrawer FAB uses `bottom-20` on mobile (clears nav), `bottom-6` on desktop
  - [x] `isMobile` prop passed from CareerIQScreen (already computed via useMediaQuery)
  - [x] tsc clean
- **Status:** done

### Story R4-M2: Session List Pagination [MEDIUM]
- **Acceptance Criteria:**
  - [x] Backend GET /sessions accepts `offset` query param (default 0, positive integer)
  - [x] Backend applies `.range(offset, offset + limit - 1)`, returns `{ sessions, has_more }`
  - [x] SessionHistoryTab shows "Load more" button when `has_more` is true
  - [x] Load more appends results, increments offset
  - [x] tsc clean (app + server)
- **Status:** done

### Story R4-M3: Relative Time Grammar Fix [MEDIUM]
- **Acceptance Criteria:**
  - [x] Returns "1 week ago" for 7–13 days
  - [x] tsc clean
- **Status:** done

### Story R4-M4: Feature-Flagged Routes Return 200 When Disabled [MEDIUM]
- **Acceptance Criteria:**
  - [x] Feature flag guards return `200 { data: null, feature_disabled: true }` instead of 404
  - [x] Frontend hooks check `feature_disabled` flag and return null cleanly
  - [x] Product route factory 403 for disabled products unchanged (POST /start, different path)
  - [x] tsc clean (app + server)
- **Status:** done

### Story R4-L1: Session Title Enrichment [LOW]
- **Acceptance Criteria:**
  - [x] GET /sessions LEFT JOINs `job_applications` via `job_application_id`
  - [x] Enrichment fallback: panel_data → job_applications → null
  - [x] Server tsc clean
- **Status:** done

### Story R4-L2: Add Favicon [LOW]
- **Acceptance Criteria:**
  - [x] SVG favicon in `app/public/favicon.svg`
  - [x] `<link rel="icon">` in `app/index.html`
  - [x] Browser tab shows icon
- **Status:** done

## Out of Scope (Explicitly)
- Resume pipeline UX redesign (Sprints 61-65)
- Frontend rendering of structured completion data
