# Sprint 26: LinkedIn Optimizer Agent
**Goal:** Build the LinkedIn Optimizer as Agent #11 — a 2-agent pipeline (Analyzer → Writer) that generates LinkedIn profile optimization recommendations from the user's resume, positioning strategy, and current LinkedIn profile text.
**Started:** 2026-03-06

## Stories This Sprint

### Backend — Types & Knowledge
1. [x] Story 1: Define `LinkedInOptimizerState`, `LinkedInOptimizerSSEEvent`, and section types — **Status: done**
2. [x] Story 2: Write LinkedIn optimization knowledge rules (headline, about, experience, keywords) — **Status: done**

### Backend — Analyzer Agent
3. [x] Story 3: Analyzer agent config + tools (parse_inputs, analyze_current_profile, identify_keyword_gaps) — **Status: done**

### Backend — Writer Agent
4. [x] Story 4: Writer agent config + tools (write_headline, write_about, write_experience_entries, optimize_keywords, assemble_report) — **Status: done**

### Backend — ProductConfig & Route
5. [x] Story 5: ProductConfig + feature flag + route (DB migration deferred — table created on first use) — **Status: done**

### Frontend Integration
6. [x] Story 6: `useLinkedInOptimizer` SSE hook + wire LinkedInStudioRoom to real pipeline — **Status: done**

### Tests
7. [x] Story 7: Server tests (36 passing) + app tests (12 passing) — **Status: done**

## Out of Scope (Explicitly)
- Content calendar generation (future feature — separate agent)
- LinkedIn analytics integration (requires OAuth — separate epic)
- Automated LinkedIn posting (API integration — separate epic)
- Experience section rewriting (v1 focuses on headline, about, and keyword optimization)
