# Sprint 28: Content Calendar Agent (#12)
**Goal:** Build the Content Calendar as Agent #12 — a 2-agent pipeline (Strategist → Writer) that generates a 30-day LinkedIn posting plan from the user's resume, positioning strategy, and industry expertise.
**Started:** 2026-03-06

## Stories This Sprint

### Backend — Types & Knowledge
1. [x] Story 1: Define `ContentCalendarState`, `ContentCalendarSSEEvent`, and content types — **Status: done**
2. [x] Story 2: Write content strategy knowledge rules (post types, frequency, hooks, engagement, hashtags) — **Status: done**

### Backend — Strategist Agent
3. [x] Story 3: Strategist agent config + tools (analyze_expertise, identify_themes, map_audience_interests, plan_content_mix) — **Status: done**

### Backend — Writer Agent
4. [x] Story 4: Writer agent config + tools (write_post, craft_hook, add_hashtags, schedule_post, assemble_calendar) — **Status: done**

### Backend — ProductConfig & Route
5. [x] Story 5: ProductConfig + feature flag + route + index.ts mounting — **Status: done**

### Frontend Integration
6. [x] Story 6: `useContentCalendar` SSE hook + ContentCalendarRoom UI component — **Status: done**

### Tests
7. [x] Story 7: Server tests (36 passing) + app tests (12 passing) — **Status: done**

## Out of Scope (Explicitly)
- LinkedIn OAuth integration (requires separate API access)
- Automated posting to LinkedIn (API integration — separate epic)
- Image/media suggestions for posts (v2 feature)
- Analytics on post performance (requires LinkedIn API)
- A/B testing of post variants (future enhancement)
