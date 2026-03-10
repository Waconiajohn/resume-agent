# Sprint 61: Resume Pipeline UX — Intelligence Visibility

**Goal:** Surface the rich intelligence data the server already produces to the user. No backend logic changes — only frontend panel redesigns and server-side SSE emission adjustments to send full data instead of summaries.
**Started:** 2026-03-09
**Audit Reference:** `docs/obsidian/30_Specs & Designs/Resume Pipeline UX Audit.md`
**Plan Reference:** `docs/obsidian/30_Specs & Designs/Resume Pipeline UX Redesign Plan.md`

## Stories This Sprint

### Story 61-1: Research Dashboard — Show Full Intelligence
- **As a** user who just uploaded my resume and JD
- **I want to** see the full research results — JD breakdown, company context, benchmark profile
- **So that** I understand what the system learned before it starts asking me questions
- **Acceptance Criteria:**
  - [ ] Company card shows name, industry, size, culture signals (from research_company output)
  - [ ] JD Requirements card shows must-haves, nice-to-haves, implicit requirements (full text, not counts)
  - [ ] Benchmark Profile card shows ideal candidate narrative and section expectations
  - [ ] All data comes from existing server output (no new LLM calls)
  - [ ] Progressive disclosure: summary visible, details in collapsibles
- **Estimated complexity:** Medium
- **Status:** done

### Story 61-2: Gap Analysis — Show Strategy, Not Just Counts
- **As a** user reviewing my fit for a role
- **I want to** see exactly where I'm strong, partial, and gap — with mitigation strategies
- **So that** I understand the positioning strategy before the interview starts
- **Acceptance Criteria:**
  - [ ] Each requirement shows classification (strong/partial/gap) with color coding
  - [ ] Partial fits show "strengthen" instructions
  - [ ] Gaps show mitigation strategies
  - [ ] Why Me / Why Not Me sections visible
  - [ ] User can flag gaps they actually have experience for
- **Estimated complexity:** Large
- **Status:** done

### Story 61-3: Blueprint Review — Expose the Strategy
- **As a** user reviewing my resume blueprint
- **I want to** see evidence allocation, keyword targets, and section rationale
- **So that** I make informed decisions about the resume structure
- **Acceptance Criteria:**
  - [ ] No underscores in section names (fix sectionLabels map)
  - [ ] Evidence allocation visible per section
  - [ ] Keyword targets shown with current vs target counts
  - [ ] Section rationale explains ordering logic
  - [ ] Step indicator contextualizes progress (not arbitrary "Step 5")
- **Estimated complexity:** Medium
- **Status:** done

## Out of Scope (Explicitly)
- Interview redesign (Sprint 62)
- Section writing changes (Sprint 63)
- Navigation unification (Sprint 64)
- New server-side LLM calls or tools
- Backend logic changes to agent tools
