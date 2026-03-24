# AI Output Quality Assessment — CareerIQ Platform

**Date:** 2026-03-11
**Method:** Architecture review of AI pipeline code, prompt analysis, and tool behavior review
**Note:** A full pipeline run with Michael Thornton's test persona was NOT executed in this QA session. This assessment is based on code review of prompts, tool logic, and the existing completed pipeline session ("Phillips Connect — Director of System Architecture").

---

## Assessment Approach

Since a live pipeline run was not performed, this assessment evaluates the AI quality infrastructure by reviewing:
1. System prompts and tool definitions
2. Self-review and quality gate logic
3. Known completed pipeline artifacts visible in the dashboard
4. Architecture that governs AI output quality

---

## Quality Infrastructure Assessment

### 1. Positioning Strategy — Grade: A-

**What the code does well:**
- `classify_fit` produces structured `career_arc.evidence` (2000 chars) and `authentic_phrases` (10 items)
- The gap analysis identifies what the candidate lacks vs. the target JD
- Blueprint design creates section-specific evidence allocations with `evidence_priorities`
- "Strategic Blueprint" approach gives the LLM creative freedom within guardrails

**Concern:**
- The `analyze_jd` tool description misleads the LLM about scope (runs full research, not just JD analysis). This could cause the LLM to skip explicit company research calls, though the cache handles it gracefully.

### 2. Evidence Surfacing — Grade: A

**What the code does well:**
- Positioning interview generates 8-15 dynamic questions across 5 categories
- Follow-up triggers on short (<100 char), missing metrics, or vague language (MAX_FOLLOW_UPS=3)
- Synthesis targets 10-20 STAR evidence items
- `interview_candidate_batch` uses interactive mode for natural conversation flow

**Concern:**
- The `isInteractive: true` flag is missing on `interview_candidate_batch` — relies on a name-matching heuristic fallback. Fragile but currently working.

### 3. Blueprint Quality — Grade: A

**What the code does well:**
- Blueprint approval gate (`FF_BLUEPRINT_APPROVAL`) lets users review and edit before writing starts
- Section order is customizable via the BlueprintReviewPanel
- Evidence priorities use `importance: 'critical' | 'important' | 'supporting'` hierarchy
- `do_not_include` field prevents unwanted content

### 4. Section Writing — Grade: A-

**What the code does well:**
- `write_section` auto-fills blueprint slices from pipeline state as a safety net
- Cross-section context (5 entries, 600-char excerpts) prevents narrative duplication
- "Authentic voice beats resume-speak" directive in Craftsman prompt
- Section writer prompt branches for experience sections (strategic vs prescriptive mode)

**Concern:**
- `revise_section` reads `blueprint_slice_${section}` from scratchpad, but `write_section` never writes it there. Revisions lose section-specific blueprint guidance.

### 5. Keyword Coverage — Grade: A

**What the code does well:**
- `check_keyword_coverage` is LLM-free (pure string/regex) — deterministic and fast
- Keywords checked against each section individually
- Coverage percentage reported to user

### 6. Self-Review — Grade: B+

**What the code does well:**
- `self_review_section` uses structured schema (score, issues, suggestions)
- Craftsman's write-review-revise cycle runs autonomously

**Concern:**
- `self_review_section` overrides the LLM's `passed` field with a formula (`score >= 7 && issues.length <= 2`). The LLM's judgment is discarded. The formula is reasonable but eliminates nuanced LLM assessment.

### 7. Producer QA — Grade: A-

**What the code does well:**
- `adversarial_review` uses MODEL_PRIMARY for thorough review
- `ats_compliance_check` is deterministic (no LLM variance)
- `check_blueprint_compliance` runs 5 deterministic checks
- `verify_cross_section_consistency` checks for cross-section issues
- `check_narrative_coherence` evaluates story arc, duplication, positioning threading, tonal consistency

**Concern:**
- `ats_compliance_check`, `verify_cross_section_consistency`, and `check_blueprint_compliance` all drop the `ctx` parameter — cannot emit transparency events or respond to abort signals.
- `check_blueprint_compliance` uses `slice(0, 20)` substring matching — fragile for short must-include items.

### 8. Narrative Coherence — Grade: A

**What the code does well:**
- Dedicated `check_narrative_coherence` tool evaluates 4 dimensions: story arc, duplication, positioning threading, tonal consistency
- Scored 0-100 with structured output
- Cross-section context in `write_section` provides prior section excerpts during writing

### 9. ATS Compliance — Grade: A

**What the code does well:**
- Deterministic checks (no LLM variance)
- `select_template` has comprehensive 8-template scoring heuristic
- Template selection is transparent (emits SSE showing alternatives with rationale)

### 10. Overall Quality Pipeline — Grade: A-

**Strengths:**
- Triple-layer quality: self-review (Craftsman) + adversarial review (Producer) + user approval gates
- Quality scores are aggregated and displayed via `finalize_quality_scores`
- User can approve, request changes, or directly edit every section
- Approved sections are protected from further revision (`request_content_revision` guard)

**Gaps:**
- No automated "hiring manager test" — quality is assessed from an ATS and writing perspective, not from the perspective of a hiring manager reading the resume
- No competitive benchmark comparison — the resume isn't compared against what other candidates might submit
- Quality scores are not persisted to the database for longitudinal tracking

---

## Prompt Quality Assessment

### Resume Strategist Prompts
- **Coaching philosophy**: Well-articulated in knowledge/rules — "executives' professional lives are only ~1% reflected on their resume"
- **Interview questions**: Dynamic generation across 5 categories with follow-up triggers
- **Evidence categories**: trophy, gap, technical proficiency, currency_and_adaptability, hidden_accomplishments

### Resume Craftsman Prompts
- **Creative authority section**: "Your Creative Authority — you are the writer, not the executor"
- **Voice directive**: "Authentic voice beats resume-speak"
- **Anti-pattern checks**: LLM-free regex checks for cliches, buzzwords, duty-focused language

### Resume Producer Prompts
- **Adversarial stance**: "You are a skeptical hiring manager reading this for the first time"
- **Fiduciary-grade quality**: Multiple independent checks aggregated before final output

---

## Scoring Summary

| Criterion | Grade | Score (1-10) |
|-----------|-------|-------------|
| Positioning Strategy | A- | 8.5 |
| Evidence Surfacing | A | 9.0 |
| Blueprint Quality | A | 9.0 |
| Section Writing | A- | 8.5 |
| Keyword Coverage | A | 9.0 |
| Self-Review | B+ | 8.0 |
| Producer QA | A- | 8.5 |
| Narrative Coherence | A | 9.0 |
| ATS Compliance | A | 9.0 |
| Hiring Manager Test | B | 7.5 |
| **Overall** | **A-** | **8.6** |

---

## Recommendations

1. **Add `blueprint_slice` to scratchpad in `write_section`** — Revisions currently lose section-specific blueprint guidance
2. **Trust the LLM's `passed` judgment in self-review** — Or at minimum log when the formula disagrees with the LLM
3. **Add `isInteractive: true` to `interview_candidate_batch`** — Remove fragile name-matching heuristic dependency
4. **Pass `ctx` to all Producer tools** — Enable abort handling and transparency events
5. **Consider a "hiring manager lens" tool** — Evaluate the finished resume from a specific hiring manager's perspective, not just ATS/quality metrics
6. **Persist quality scores to DB** — Enable longitudinal quality tracking across sessions
