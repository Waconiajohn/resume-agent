# Platform Deep Audit — Agent Freedom & UX Clarity

> **Date:** 2026-03-09 | **Scope:** 28 agents, 16 SSE tools, 15 rooms, 18 route configs

---

## Executive Summary

Four parallel audits examined: (1) AI agent creative freedom, (2) UI/UX clarity, (3) SSE data flow transparency, (4) platform context completeness. Combined findings: **78 issues** across 4 severity levels.

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Agent Freedom | 1 | 3 | 4 | 1 | 9 |
| UI/UX Clarity | 1 | 4 | 8 | 7 | 20 |
| SSE Data Flow | 1 | 4 | 3 | 2 | 10 |
| Platform Context | 0 | 4 | 3 | 5 | 12 |
| Cross-Cutting | 0 | 5 | 3 | 0 | 8 |
| **Total** | **3** | **20** | **21** | **15** | **59** |

### Top 3 Systemic Issues

1. **Cover Letter agent is not an agent** — `write_letter` is string template concatenation, `review_letter` is heuristic scoring. No LLM calls in the writer.
2. **14 agents scripted with "follow this EXACTLY"** — Defeats the agentic mandate. Agents are template executors, not creative professionals.
3. **13 non-resume tools have zero transparency** — Users see "Loading..." for 2-4 minutes with no insight into what the AI is doing.

---

## Audit 1: Agent Creative Freedom

### Critical
- **CL-1**: Cover Letter `write_letter` is string template, not LLM call. `review_letter` is heuristic-only.

### High
- **AF-1**: 14 agents use "follow this EXACTLY" / "call EXACTLY ONCE in this order" — prescriptive scripting that removes agent autonomy
- **AF-2**: Craftsman tool description "Always call self_review_section immediately after" contradicts system prompt's conditional review
- **AF-3**: AgentBus used for exactly 1 message (Producer→Craftsman) across 16 product domains

### Medium
- **AF-4**: `select_template` is pure keyword heuristic with no LLM reasoning
- **AF-5**: Several creative tools may use MODEL_ORCHESTRATOR instead of MODEL_PRIMARY (unset model_tier)
- **AF-6**: Hardcoded sentence counts, batch sizes, format mandates that agents should own
- **AF-7**: Mock interview `loop_max_tokens: 4096` too low for Q+A+evaluation

### Low
- **AF-8**: maxRounds tight for Cover Letter Writer (5) and LinkedIn Content Writer (8)

---

## Audit 2: UI/UX Clarity

### Critical
- **UX-1**: Mobile CTA broken — `dashboardState === 'strong'` passes `onClick={undefined}`, button does nothing

### High
- **UX-2**: AgentActivityCard is static stub — always shows "No recent agent activity" for all users
- **UX-3**: Interview Lab CompanyResearch and PracticeQuestions panels never populate — permanent empty stubs
- **UX-4**: Personal Brand `findings: BrandFinding[]` data generated but never rendered in room component
- **UX-5**: 11 of 16 rooms inaccessible on mobile

### Medium
- **UX-6**: Silent `catch { /* ignore */ }` on data loads across 8+ rooms — errors look like empty data
- **UX-7**: No output persistence across room navigation — generated reports lost on navigate-away
- **UX-8**: Quality score badges shown without context — no tooltip explaining what score means
- **UX-9**: Disabled submit buttons with no explanation of what's missing (6 rooms)
- **UX-10**: Content Calendar has `targetRole`/`postsPerWeek` params but no UI to set them
- **UX-11**: Previous Calendars listed but unclickable
- **UX-12**: Networking Hub generated outreach in `<pre>` monospace — poor readability
- **UX-13**: Financial Wellness `disqualified` state gives no reason, educational resources have no URLs

### Low
- **UX-14**: Interview Lab shows "TBD" for date/time instead of helpful message
- **UX-15**: `handleReset` wipes form state on error in 90-Day Plan and others
- **UX-16**: No estimated processing time shown in any room
- **UX-17**: LinkedIn Studio no cross-tab status indicator
- **UX-18**: Executive Bio length option ID/label mismatch (`'standard'` vs `'Long'`)
- **UX-19**: Network Intelligence connection check failure routes to upload silently
- **UX-20**: Resume word count uses `length/5` heuristic, not actual word count

---

## Audit 3: SSE Data Flow & Transparency

### Critical
- **SSE-1**: Quality dashboard `details` field always empty — `adversarialReview` emits before `humanize_check`/`check_narrative_coherence` run

### High
- **SSE-2**: 13 non-resume agents have zero transparency protocol instructions — users see nothing during processing
- **SSE-3**: 14/16 tools emit only markdown report string — structured intelligence never reaches users
- **SSE-4**: Cover letter has 5/5 data loss — letter_plan, JD analysis, review feedback all invisible
- **SSE-5**: Salary negotiation has 5/5 data loss — market data, leverage points, scenarios invisible

### Medium
- **SSE-6**: `why_me`/`why_not_me` arrays from `classify_fit` never SSE-emitted
- **SSE-7**: Stage summary messages return `null` for 5 stages that have meaningful data
- **SSE-8**: No agent handoff transparency — 2-agent pipelines show no intermediate results between stages

### Low
- **SSE-9**: Self-review feedback never surfaced for sections that pass review cleanly
- **SSE-10**: Retirement Bridge dimension_assessments not in SSE event (only in DB persist)

---

## Audit 4: Platform Context Completeness

### High
- **PC-1**: Resume pipeline loads ZERO platform context — emotional_baseline, client_profile invisible to Strategist
- **PC-2**: Retirement-bridge product uses `positioning_strategy` but route never loads it (dead code block)
- **PC-3**: Thank-you-note product uses `why_me_story` but route never loads it (dead code block)
- **PC-4**: Cover letter has no `persistResult` — generated letters lost on session close

### Medium
- **PC-5**: Mock interview missing `emotional_baseline` — distress resources and tone guidance are dead paths
- **PC-6**: Onboarding doesn't load prior `client_profile` for returning users
- **PC-7**: `why_me_story` sourced from 2 different tables with no unifying utility

### Low
- **PC-8**: Ninety-day-plan missing `evidence_items` for quick-win identification
- **PC-9**: LinkedIn-editor missing `career_narrative`
- **PC-10**: LinkedIn-content doesn't query `why_me_stories` table
- **PC-11**: Personal-brand loads `career_narrative` as bios but executive-bio never writes to it
- **PC-12**: Cover letter missing `client_profile` context

---

## Cross-Cutting Patterns

### High
- **XC-1**: `onEvent` absent from all non-resume products — no artifact persistence for SSE reconnection
- **XC-2**: `momentumActivityType` naming inconsistent — some have `_completed` suffix, some don't
- **XC-3**: Resume auto-load uses 6 different patterns across rooms
- **XC-4**: `validateAfterAgent` absent from linkedin-content and linkedin-editor
- **XC-5**: No shared `getWhyMeContext(userId)` utility — 3 different query patterns

### Medium
- **XC-6**: No `onComplete` hook on cover-letter route
- **XC-7**: Quality sub-scores (per-bio, per-section, per-case-study) collapsed to single aggregate
- **XC-8**: `buildStageSummaryMessage` returns null for 5 stages with meaningful data

---

## Remediation Plan

### Sprint RA: Agent Freedom & Core Data (Critical + High)
1. CL-1: Rewrite cover letter `write_letter` with real MODEL_PRIMARY LLM call
2. CL-1b: Rewrite cover letter `review_letter` with real MODEL_MID LLM call
3. AF-1: Replace "follow this EXACTLY" in 14 agents with goal-oriented instructions
4. AF-2: Fix craftsman tool description / system prompt conflict
5. SSE-1: Fix quality dashboard details timing bug
6. SSE-2: Add transparency protocol to all 13 non-resume agent prompts
7. PC-1: Add platform context loading to resume pipeline transformInput
8. PC-2: Fix retirement-bridge route to load positioning_strategy
9. PC-3: Fix thank-you-note route to load why_me_story
10. PC-4: Add persistResult to cover letter product config
11. PC-5: Add emotional_baseline to mock-interview transformInput

### Sprint RB: UI/UX Critical + High Fixes
1. UX-1: Fix mobile CTA for strong dashboardState
2. UX-2: Wire AgentActivityCard to real feed data
3. UX-3: Remove or connect Interview Lab stub panels
4. UX-4: Render PersonalBrand findings data
5. UX-6: Replace silent catches with error states (8 rooms)
6. PC-7: Create shared `getWhyMeContext(userId)` utility
7. XC-2: Normalize momentumActivityType naming

### Sprint RC: Medium UX + Data Flow Enrichment
1. UX-7: Add session-level output persistence for generated reports
2. UX-8: Add quality score tooltips
3. UX-9: Add disabled-button tooltips (6 rooms)
4. UX-10: Expose Content Calendar configuration inputs
5. UX-12: Parse networking outreach into per-message cards
6. UX-13: Fix Financial Wellness disqualified state + resource links
7. SSE-8: Emit intermediate results at 2-agent handoff points
8. AF-6: Remove hardcoded structural mandates from agent prompts
