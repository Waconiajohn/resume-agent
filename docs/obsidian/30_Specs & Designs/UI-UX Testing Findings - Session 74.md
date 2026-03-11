# UI/UX Testing Findings — Session 74

> **Date:** 2026-03-10
> **Method:** Playwright browser automation (25 screenshots, accessibility snapshots)
> **Scope:** All 16 CareerIQ rooms, landing page, tools page, dashboard, mobile views, sidebar states, coach drawer

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| HIGH | 3 | Data trust, user identity, error confidence |
| MEDIUM | 4 | Mobile overlap, pagination, grammar, console errors |
| LOW | 2 | Session titles, missing favicon |
| **Total** | **9** | |

---

## HIGH Severity

### H1: Username Display Uses Raw Email Everywhere

**Where:** Sidebar coach banner ("AI jjschrup@yahoo.com"), Dashboard greeting ("Good evening, Jjschrup"), all rooms with user reference

**What's wrong:** The platform displays the user's email prefix as their name. "Jjschrup" is capitalized incorrectly (should be "John" or whatever first name is on file). The coach banner shows the full email address "AI jjschrup@yahoo.com" instead of "AI John".

**Impact:** Makes the entire platform feel impersonal and broken. First impression failure. Every room reinforces it.

**Root cause:** `user.email` is being used as display name. No `first_name` / `display_name` field is being populated or read from the user profile.

**Fix approach:**
1. Check if Supabase auth metadata has `full_name` or `first_name` from signup
2. Add a `display_name` column to user profile or read from auth metadata
3. Extract first name from display_name for coach banner ("AI John")
4. Fallback chain: `display_name` → first name from email → "there" (e.g., "Good evening")

---

### H2: Job Command Center Data Mismatch

**Where:** Job Command Center room — Pipeline Summary card vs Application Pipeline kanban

**What's wrong:** The Pipeline Summary card shows "8 active" with breakdown (Discovered: 2, Applied: 3, Interviewing: 2, Offer: 1), but the Application Pipeline kanban board directly above shows all columns at 0 items.

**Impact:** Critical trust violation. User sees two conflicting views of the same data. Undermines confidence in the entire platform's accuracy.

**Root cause:** Pipeline Summary reads from `job_applications` table while the kanban board reads from `application_pipeline` table. These are two different tables with different data.

**Fix approach:**
1. Audit both data sources — determine which is the source of truth
2. Unify the kanban and summary to read from the same table
3. If both tables are needed, ensure they stay in sync or clearly label which is which

---

### H3: Dashboard Shows Nearly All Sessions as "Error"

**Where:** Dashboard home → Agent Activity section, Dashboard sessions page

**What's wrong:** The vast majority of resume sessions show a red "Error" status badge. On the sessions page, almost every row is marked Error.

**Impact:** Even though these may be legitimately failed sessions (dev testing, aborted runs), a new user seeing a wall of errors would lose confidence in the platform immediately. This is a trust and perception issue.

**Fix approach:**
1. Filter out errored sessions from the "Agent Activity" feed on Dashboard home (show only successful or in-progress)
2. On the sessions page, add status filters (All / Active / Completed / Error) with "Active" as default
3. Consider auto-archiving sessions that errored more than 7 days ago
4. Show a friendlier status label: "Incomplete" or "Needs attention" instead of raw "Error"

---

## MEDIUM Severity

### M1: Mobile Coach FAB Overlaps Bottom Navigation

**Where:** Mobile view (375px width) — bottom-right corner

**What's wrong:** The floating "Open AI Coach" button partially obscures the "Resume" label in the bottom navigation bar. On small screens, the FAB sits directly on top of the nav.

**Impact:** Frustrating on mobile. Users may accidentally tap the coach instead of Resume nav, or struggle to tap Resume at all.

**Fix approach:**
1. Increase `bottom` position of FAB when mobile bottom nav is visible (add ~60px offset)
2. Or move FAB to left side on mobile
3. Or hide FAB on mobile and add Coach as a bottom nav tab

---

### M2: No Pagination on Session Lists

**Where:** Dashboard home (Agent Activity), Resume Workshop session list, Dashboard sessions page

**What's wrong:** All 50+ sessions are rendered in a single scrollable list with no pagination, virtual scrolling, or "load more" pattern.

**Impact:** Performance degrades with more sessions. Scroll fatigue. No way to find a specific session without scrolling through everything.

**Fix approach:**
1. Add pagination (20 items per page) or "Load more" button
2. Add search/filter by job title or date
3. Consider virtual scrolling for the sessions page

---

### M3: Grammar Bug — "1 weeks ago"

**Where:** Resume Workshop session list, time-ago labels

**What's wrong:** Displays "1 weeks ago" instead of "1 week ago". The pluralization logic doesn't handle the singular case.

**Impact:** Minor but noticeable polish issue. Undermines professionalism.

**Fix approach:**
1. Find the time-ago formatting function
2. Add singular/plural handling: `${n} ${n === 1 ? 'week' : 'weeks'} ago`

---

### M4: Console 404 Errors for Feature-Flagged APIs

**Where:** Browser console on every page load

**What's wrong:** Multiple API calls return 404 because their features are flagged off:
- `GET /api/momentum/summary` → 404
- `GET /api/momentum/nudges` → 404
- `GET /api/momentum/check-stalls` → 404
- `GET /api/coach/recommend` → 404
- `GET /api/*/reports/latest` → 404 (for each room with session persistence)

**Impact:** Noisy console. Could mask real errors during debugging. Slight performance waste on failed network calls.

**Fix approach:**
1. Frontend hooks should check feature flags before making API calls
2. Or backend should return 200 with empty/default data instead of 404 when feature is off
3. The `usePriorResult` hook and momentum hooks need a flag-aware guard

---

## LOW Severity

### L1: Home Page Sessions All Show Same Title

**Where:** Dashboard home → Agent Activity feed

**What's wrong:** All 5 recent sessions show "Started resume session for Untitled" with identical descriptions. No meaningful differentiation between sessions.

**Impact:** Users can't distinguish between sessions. The activity feed provides no actionable information.

**Fix approach:**
1. Use job title or company name from the session's job application as the session title
2. Fallback: "Resume session" with date/time
3. Show a brief status or progress indicator per session

---

### L2: Missing favicon.ico

**Where:** Browser tab, all pages

**What's wrong:** `GET /favicon.ico` returns 404. Browser shows default/blank icon.

**Impact:** Unprofessional. Missing brand presence in browser tabs and bookmarks.

**Fix approach:**
1. Add a favicon.ico to `app/public/`
2. Add `<link rel="icon">` tags for various sizes in index.html

---

## Positive Observations

- Sidebar navigation is well-organized (5 themed groups work well)
- Coach drawer opens/closes smoothly with guided and chat modes
- Sidebar collapse/expand works correctly
- All 16 rooms load without crashes
- Mobile bottom navigation shows correct 5-tab subset
- Landing page and tools page render cleanly
- Glass morphism design is consistent across rooms
- SSE connection indicators work (green dot visible)

---

## Fix Plan

### Sprint R4: UI/UX Polish (9 stories)

**Priority order based on user impact:**

| # | Story | Severity | Est. Size | Files |
|---|-------|----------|-----------|-------|
| 1 | Fix username display — read display_name from auth metadata | HIGH | Medium | `app/src/hooks/useAuth.ts`, `server/src/middleware/auth.ts`, sidebar, dashboard |
| 2 | Unify Job Command Center data sources | HIGH | Large | `server/src/routes/job-tracker.ts`, `app/src/components/career-iq/JobCommandCenterRoom.tsx` |
| 3 | Filter/soften error sessions on dashboard | HIGH | Small | `app/src/components/career-iq/DashboardHome.tsx`, sessions page |
| 4 | Mobile FAB positioning fix | MEDIUM | Small | `app/src/components/career-iq/CareerIQScreen.tsx` (FAB styles) |
| 5 | Add pagination to session lists | MEDIUM | Medium | `app/src/components/career-iq/DashboardHome.tsx`, Resume Workshop |
| 6 | Fix "1 weeks ago" pluralization | MEDIUM | Small | time-ago utility function |
| 7 | Guard feature-flagged API calls | MEDIUM | Medium | `app/src/hooks/usePriorResult.ts`, momentum hooks |
| 8 | Improve session titles from job data | LOW | Small | `app/src/components/career-iq/DashboardHome.tsx` |
| 9 | Add favicon | LOW | Small | `app/public/`, `index.html` |

**Estimated total:** ~1 sprint (9 stories, mix of S/M/L)

#type/spec #status/todo #sprint/R4
