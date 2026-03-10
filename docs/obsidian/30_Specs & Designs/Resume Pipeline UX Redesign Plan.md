# Resume Pipeline UX Redesign Plan

#type/spec #status/proposed #sprint/61

> **Companion to:** [[Resume Pipeline UX Audit]]
> **Goal:** Make every panel in the resume pipeline surface the intelligence the server produces, give the user meaningful control, and align the UX with the coaching methodology.
> **Principle:** The user is a collaborator, not a spectator. Every screen must answer: "What did the system find? What does it mean for me? What should I do?"

---

## Design Principles for Every Panel

1. **Show the WHY** — Every recommendation, question, or suggestion must explain its reasoning
2. **Surface the data** — If the server produced it, the user should see it (or a meaningful summary)
3. **Enable collaboration** — User can confirm, correct, or enhance the system's findings
4. **Connect to strategy** — Every element ties back to: benchmark, gap analysis, positioning angle
5. **Progressive disclosure** — Lead with what matters, expand for detail
6. **No dead ends** — User can always navigate back, see context, and understand where they are

---

## Sprint 61: Intelligence Visibility (Foundation)

> **Goal:** Surface the data the server already produces. No backend changes — pure frontend.

### Story 61-1: Research Dashboard — Show What We Found

**As a** user who just uploaded my resume and JD
**I want to** see the full research results — JD breakdown, company context, benchmark profile
**So that** I understand what the system learned before it starts asking me questions

**Changes:**
- `ResearchDashboardPanel.tsx` — populate all 3 cards with actual data:
  - **Company Card**: company name, industry, size, culture signals (from `research_company` output)
  - **JD Requirements Card**: full must-haves, nice-to-haves, implicit requirements (not just counts)
  - **Benchmark Profile Card**: ideal candidate narrative, section expectations, key differentiators
- Server: emit `right_panel_update` with full research data (currently only partial)
- Add "What This Means" summary at top: *"This role needs a [seniority] leader with [top 3 requirements]. Here's what we found..."*

**Acceptance Criteria:**
- [ ] Company card shows name, industry, size, 3-5 culture signals
- [ ] JD card shows categorized requirements (must-have / nice-to-have / implicit) with full text
- [ ] Benchmark card shows ideal candidate narrative and section expectations
- [ ] All data comes from existing server output (no new LLM calls)
- [ ] Progressive disclosure: summary visible, details in collapsibles

---

### Story 61-2: Gap Analysis — Show Strategy, Not Just Counts

**As a** user reviewing my fit for a role
**I want to** see exactly where I'm strong, where I'm partial, and where the gaps are — with mitigation strategies
**So that** I understand the positioning strategy before the interview starts

**Changes:**
- `GapAnalysisPanel.tsx` — complete redesign:
  - **Strong fits** (green): requirement + evidence + where it appears on resume
  - **Partial fits** (yellow): requirement + what's there + what needs strengthening
  - **Gaps** (red): requirement + mitigation strategy OR "we'll address this in the interview"
  - **Why Me section**: 3-5 compelling reasons with evidence
  - **Why Not Me section**: 1-3 honest gaps with reframe strategies
- Server: emit full `classify_fit` output including `mitigation`, `strengthen`, `why_me`, `why_not_me`

**Acceptance Criteria:**
- [ ] Each requirement shows classification with color coding
- [ ] Partial fits show "strengthen" instructions
- [ ] Gaps show mitigation strategies (not just "gap")
- [ ] Why Me / Why Not Me sections visible
- [ ] User can mark: "I actually have this experience" on gaps (stores for interview)

---

### Story 61-3: Blueprint Review — Expose the Strategy

**As a** user reviewing my resume blueprint
**I want to** see the evidence allocation strategy, keyword targets, and section rationale
**So that** I can make informed decisions about the resume structure

**Changes:**
- `BlueprintReviewPanel.tsx`:
  - Fix section name display (add missing entries to `sectionLabels` map)
  - **Evidence Allocation section**: show which evidence goes to which section and why
  - **Keyword Strategy section**: show keyword map with target densities, not just count
  - **Section Rationale**: for each section, show WHY it's in this position
  - **Global Rules preview**: voice, tone, format decisions the system made
  - Unify step numbering: show meaningful progress, not arbitrary "Step 5"

**Acceptance Criteria:**
- [ ] No underscores in section names
- [ ] Evidence allocation visible per section
- [ ] Keyword targets shown with current vs target counts
- [ ] Section rationale explains ordering logic
- [ ] Step indicator contextualizes progress ("Research complete, interview complete, now planning")

---

## Sprint 62: Interview Redesign (Core Methodology)

> **Goal:** Transform the positioning interview from a question-picker into a coaching session.

### Story 62-1: Gap-Driven Question Context

**As a** user answering interview questions
**I want to** see which gap this question is trying to fill and why it matters
**So that** I give targeted, strategic answers instead of generic responses

**Changes:**
- `PositioningInterviewPanel.tsx`:
  - Before questions start: show gap summary panel (*"We identified 3 gaps and 4 areas to strengthen. These questions help you fill them."*)
  - Per question: replace generic "helps us address" with gap-specific context
    - *"Your resume shows budget management but no specific numbers. This role needs P&L ownership of $50M+. What's the largest budget you've managed?"*
  - Show requirement importance: critical / important / nice-to-have
  - Show benchmark comparison: *"The benchmark candidate has 15+ years of system architecture. You have 12 — let's surface what makes your experience exceptionally deep."*
- Server: include `gap_type`, `benchmark_context`, and `importance` in question payload

**Acceptance Criteria:**
- [ ] Pre-interview summary shows gap count and what interview aims to accomplish
- [ ] Each question shows specific gap it addresses with benchmark context
- [ ] Importance level visible (critical vs nice-to-have)
- [ ] User understands exactly what a strong answer should contain

---

### Story 62-2: Response Crafting Assistance

**As a** user who knows what gap I'm trying to fill but struggles to articulate it
**I want to** get AI help crafting a strong, specific response
**So that** my evidence is compelling and complete

**Changes:**
- `PositioningInterviewPanel.tsx`:
  - **Combine suggestions**: select multiple → "Combine into one answer" button → AI merges
  - **Craft with AI**: button that takes selected suggestions + custom text → AI generates polished STAR response
  - **Real-time feedback**: as user types, show live quality indicators:
    - Has metrics? (Yes/No)
    - Specific or vague? (indicator)
    - STAR complete? (Situation / Task / Action / Result checkboxes)
  - **Example of strong answer**: collapsible showing what a benchmark-level response looks like (anonymized)
- Server: new `craft_response` tool or extend `infer-field` endpoint for response assistance

**Acceptance Criteria:**
- [ ] Can select 2+ suggestions and combine them with AI
- [ ] "Help me write this" generates STAR-format response from user's rough input
- [ ] Live quality indicators show metrics presence, specificity, completeness
- [ ] Example strong answers visible per question category

---

### Story 62-3: Creative Gap Solutions

**As a** user who doesn't have direct experience in a required area
**I want to** see creative ways to position adjacent experience
**So that** I can credibly address the gap instead of leaving it empty

**Changes:**
- `PositioningInterviewPanel.tsx`:
  - When question targets a `no_evidence` gap:
    - Show "Creative Positioning" card with 2-3 alternative angles
    - *"You don't have direct Salesforce experience, but your 7 years with HubSpot and Zoho demonstrate CRM mastery across platforms. Consider: 'While my primary CRM experience is with HubSpot and Zoho, the underlying workflows — pipeline management, lead scoring, reporting — transfer directly.'"*
  - When user says "I don't have this":
    - Offer "Skip with strategy" → system generates a mitigation approach for the resume
    - Store as acknowledged gap with reframe strategy
- Server: include `mitigation_suggestions` in question payload for gap-type questions

**Acceptance Criteria:**
- [ ] Gap questions show 2-3 alternative positioning angles
- [ ] Each angle includes example phrasing the user can adapt
- [ ] "I don't have this" option generates mitigation strategy (not just skip)
- [ ] Acknowledged gaps with strategies stored for Craftsman to use

---

## Sprint 63: Section Writing Overhaul

> **Goal:** Make section writing strategic and navigable.

### Story 63-1: JD Requirements Split View

**As a** user reviewing a section draft
**I want to** see which JD requirements this section targets alongside the content
**So that** I can judge whether the section effectively addresses what the employer needs

**Changes:**
- `SectionWorkbench.tsx`:
  - Add collapsible "Requirements This Section Targets" panel (always visible, not buried in advanced)
  - For each targeted requirement: show requirement text + current match status (addressed / partial / missing)
  - Live update as content changes (same pattern as keyword bar)
  - Color coding: green (addressed in content), yellow (partially), red (not yet)

**Acceptance Criteria:**
- [ ] Requirements panel visible alongside section content
- [ ] Each requirement shows match status with color coding
- [ ] Status updates in real-time as user edits content
- [ ] Clear connection between what was written and what the JD demands

---

### Story 63-2: Section-Level Quality Metrics

**As a** user approving a section
**I want to** see quality metrics for THIS section before I approve
**So that** I don't approve weak sections that hurt my overall score

**Changes:**
- `SectionWorkbench.tsx`:
  - Add quality indicators in the section header/sidebar:
    - Keyword coverage for this section (X/Y required terms)
    - Evidence strength (metrics present, quantified impact)
    - ATS compatibility signals
  - If keyword coverage < 70%: show warning before approval
  - If no metrics in experience bullets: suggest adding them

**Acceptance Criteria:**
- [ ] Keyword coverage shown per section with target
- [ ] Warning if approving section with low keyword coverage
- [ ] Evidence strength indicator visible
- [ ] Metrics prompts for experience sections without numbers

---

### Story 63-3: Section Navigation — Go Back

**As a** user who approved a section but now wants to revisit it
**I want to** click on a completed section and see/edit it
**So that** I can fix issues I notice after seeing later sections

**Changes:**
- `SectionWorkbench.tsx` + `WorkbenchProgressDots.tsx`:
  - Make progress dots clickable for completed sections
  - Click → show approved content in read-only view with "Request Revision" button
  - "Request Revision" reopens the section as a gate
- Server: new gate type `section_revision_request` that re-enters Craftsman for that section

**Acceptance Criteria:**
- [ ] Completed section dots are clickable
- [ ] Clicking shows approved content with revision option
- [ ] Revision request re-enters the writing/review flow for that section
- [ ] Other sections' progress is preserved

---

## Sprint 64: Navigation & Progress Unification

> **Goal:** One coherent progress system that makes sense to users.

### Story 64-1: Unified Progress System

**As a** user going through the pipeline
**I want to** see one clear progress indicator that tells me where I am and what's next
**So that** I never feel lost or confused about step numbering

**Changes:**
- Replace dual system (7-stage bar + 8-node sidebar) with unified model
- Sidebar nodes become the single source of truth
- Progress bar reflects sidebar state, not separate stage numbering
- Non-interactive stages show brief activity indicator: *"Analyzing job description... done (45s)"*
- Interactive stages highlight clearly: *"Your input needed"*

**Acceptance Criteria:**
- [ ] Single progress system (no "Step 5 of 7" vs "Node 4 of 8" confusion)
- [ ] Non-interactive stages show completion in real-time
- [ ] Interactive stages clearly marked
- [ ] User always knows: where they are, what's happening, what's next

---

### Story 64-2: Interview Recap Panel

**As a** user who just completed the positioning interview
**I want to** see a summary of what I said and what evidence was captured
**So that** I can confirm the system heard me correctly before it builds the blueprint

**Changes:**
- New panel type: `interview_recap`
- Shows after interview completes, before blueprint:
  - All Q&A pairs organized by category
  - Evidence items extracted with STAR breakdown
  - Gaps addressed vs gaps still open
  - "The system will now design your resume based on this evidence"
- User can flag: "This answer is wrong" or "Add more context"

**Acceptance Criteria:**
- [ ] Recap panel appears after interview completion
- [ ] All Q&A pairs visible organized by category
- [ ] Evidence items shown with extracted STAR elements
- [ ] User can correct or enhance before proceeding

---

## Sprint 65: Polish & Integration

### Story 65-1: Action Chips — Gap-Aware Suggestions

Replace generic "Add Metric" / "Tighten" chips with context-aware suggestions:
- *"Add P&L number (target requirement: budget ownership)"*
- *"Strengthen team leadership evidence (partial match for requirement)"*
- *"Include [specific keyword] — missing from this section"*

### Story 65-2: Onboarding Summary — Full Parse Review

Replace count-only OnboardingSummaryPanel with full parse review:
- Experience entries with key bullets
- Skills categorized
- Scope signals (team size, budget, geography)
- User can correct: "This role was actually Director level, not Manager"

### Story 65-3: Quality During Writing — Live Quality Rail

Show running quality metrics alongside section writing:
- Overall ATS score (updating as sections are approved)
- Keyword coverage across all sections (cumulative)
- Evidence usage (X of Y evidence items used so far)
- Requirements addressed (X of Y JD requirements covered)

---

## Implementation Order & Dependencies

```
Sprint 61 (Foundation — no backend changes)
  61-1: Research Dashboard ← data already available, just needs emission
  61-2: Gap Analysis redesign ← needs classify_fit full emission
  61-3: Blueprint Strategy exposure ← needs blueprint full emission

Sprint 62 (Interview — needs server changes)
  62-1: Gap-driven context ← needs question payload enrichment
  62-2: Response crafting ← needs new AI endpoint or tool
  62-3: Creative gap solutions ← needs mitigation_suggestions in payload

Sprint 63 (Section Writing — mixed frontend/backend)
  63-1: JD split view ← frontend only (data in section_context)
  63-2: Section quality metrics ← may need per-section quality emission
  63-3: Section navigation back ← needs new gate type on server

Sprint 64 (Navigation)
  64-1: Unified progress ← frontend refactor
  64-2: Interview recap ← new panel type + SSE event

Sprint 65 (Polish)
  65-1: Gap-aware chips ← frontend + context enrichment
  65-2: Full parse review ← frontend + emission
  65-3: Live quality rail ← frontend + cumulative tracking
```

---

## Critical Files Reference

| File | What Changes |
|------|-------------|
| `app/src/components/panels/ResearchDashboardPanel.tsx` | Full data population |
| `app/src/components/panels/GapAnalysisPanel.tsx` | Complete redesign |
| `app/src/components/panels/BlueprintReviewPanel.tsx` | Strategy exposure, fix labels |
| `app/src/components/panels/PositioningInterviewPanel.tsx` | Gap context, crafting help |
| `app/src/components/SectionWorkbench.tsx` | JD split view, navigation, quality |
| `app/src/components/workbench/WorkbenchProgressDots.tsx` | Clickable completed sections |
| `app/src/components/workbench/WorkbenchActionChips.tsx` | Gap-aware suggestions |
| `app/src/components/panels/OnboardingSummaryPanel.tsx` | Full parse review |
| `app/src/components/panels/panel-renderer.tsx` | New panel types |
| `app/src/constants/pipeline-stages.ts` | Unified progress |
| `app/src/constants/process-contract.ts` | Step labeling |
| `server/src/agents/resume/event-middleware.ts` | Full data emission |
| `server/src/agents/strategist/tools.ts` | Enriched question payloads |
| `server/src/agents/knowledge/positioning-coach.ts` | Gap context in questions |

---

## Success Criteria

After all 5 sprints, a user going through the pipeline should:

1. **See** the full research results (JD breakdown, benchmark, company context)
2. **Understand** where they're strong and where the gaps are
3. **Know** why each interview question is being asked and what a strong answer looks like
4. **Get help** crafting responses, including creative solutions for gaps
5. **Review** the positioning strategy with full evidence allocation before writing starts
6. **See** JD requirements alongside each section during writing
7. **Navigate** freely between sections, including back to approved ones
8. **Know** section quality before approving (keywords, evidence, ATS)
9. **Never feel lost** — one clear progress system, always know what's next
10. **Feel like a collaborator** — not a passive clicker
