# Sprint 34: Portfolio / Case Study Agent (#17)
**Goal:** Build the Portfolio / Case Study Agent as Agent #17 — a 2-agent pipeline (Achievement Analyst → Case Study Writer) that selects top achievements, extracts full narratives, and produces consulting-grade case studies with quantified impact.
**Started:** 2026-03-07

## Stories This Sprint

### Backend — Types & Knowledge
1. [x] Story 1: Define `CaseStudyState`, `CaseStudySSEEvent`, format/impact types, and 8 writing knowledge rules — **Status: done**

### Backend — Achievement Analyst Agent
2. [x] Story 2: Achievement Analyst agent config + tools (parse_achievements, score_impact, extract_narrative_elements, identify_metrics) — **Status: done**

### Backend — Case Study Writer Agent
3. [x] Story 3: Case Study Writer agent config + tools (write_case_study, add_metrics_visualization, quality_review, assemble_portfolio) — **Status: done**

### Backend — ProductConfig & Route
4. [x] Story 4: ProductConfig + FF_CASE_STUDY + route + DB migration — **Status: done**

### Frontend Integration
5. [x] Story 5: `useCaseStudy` SSE hook — **Status: done**

### Tests
6. [x] Story 6: Server tests (49) + app tests (12) — **Status: done**

## Out of Scope (Explicitly)
- PDF/DOCX export of case studies
- Case study templates marketplace
- Client-facing presentation mode
- Video case study generation
- Achievement import from LinkedIn API
