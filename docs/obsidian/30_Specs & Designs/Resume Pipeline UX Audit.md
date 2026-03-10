# Resume Pipeline UX Audit — Full Findings

#type/spec #status/in-progress #sprint/61

> **Date:** 2026-03-09
> **Trigger:** Manual walkthrough revealed fundamental UX failures across the entire resume pipeline
> **Severity:** Critical — production-blocking
> **Scope:** All 7 pipeline stages, 11 panel types, navigation, data visibility

---

## Executive Summary

The resume pipeline server produces **rich intelligence** — benchmark profiles, gap analysis with mitigation strategies, evidence libraries, keyword maps with density targets, age protection audits — but the frontend only surfaces **10-30% of this data** to the user. The result is a pipeline that feels arbitrary, opaque, and unhelpful despite doing sophisticated work behind the scenes.

**The core problem:** The UI treats the user as a passive observer who clicks "Looks Good" at each step. The methodology demands the user be an active collaborator who understands the strategy, sees the gaps, and contributes evidence to fill them.

---

## Finding 1: Positioning Interview — No Coaching, No Gap Visibility

### What the user sees
- A question with 2-5 suggestion cards labeled "From Resume" / "From JD" / "Inferred"
- A "Why we're asking" collapsible that says: *"This question helps us address: [requirement]. A strong answer here will strengthen your positioning for this role."*
- A textarea for custom answers

### What's wrong

**1a. User never sees the gap map**
- Server-side `identifyRequirementGaps()` classifies each JD requirement as `strong` / `no_metrics` / `no_evidence`
- LLM uses this to decide which questions to ask
- **User never sees this classification** — they don't know WHY they're being asked each question
- File: `positioning-coach.ts:78-122`

**1b. "Why we're asking" is generic**
- Same template for every question: "helps us address [X]"
- Should say: *"Your resume mentions budget management but without specific numbers. This role needs P&L ownership of $50M+. Let's surface your strongest financial leadership example."*
- File: `PositioningInterviewPanel.tsx:205-207`

**1c. No response crafting help**
- Suggestions are 20-120 char labels — not coaching on what a strong answer looks like
- No STAR format guidance during answering
- No real-time feedback (too vague, missing metrics, passive voice)
- Follow-up evaluation runs AFTER submission silently — user doesn't learn from it
- File: `positioning-coach.ts:433-515` (evaluateFollowUp runs post-submission)

**1d. No creative gap solutions**
- When user can't directly fill a gap, system just asks follow-ups
- No alternative framing: *"You don't have direct Salesforce experience, but you used HubSpot and Zoho for 7 years — here's how to position that"*
- `why_not_me` field exists in classify_fit output but UI never shows it
- File: `strategist/tools.ts:662-663`

**1e. Can't combine suggestions**
- User must pick OR type — no way to merge "From Resume" + "From JD" into a hybrid answer
- No AI-assisted response generation from selected elements

### Data available but hidden
- Full requirement gap map (strong/no_metrics/no_evidence per JD requirement)
- Benchmark candidate profile (what the ideal candidate looks like)
- Category coaching context (what each question category is trying to surface)
- Follow-up quality rationale (why an answer was deemed weak)

---

## Finding 2: Research & Intelligence — Invisible to User

### What the user sees
- Brief `OnboardingSummaryPanel` with counts (X skills, Y years, Z companies)
- `ResearchDashboardPanel` exists but receives incomplete data

### What's wrong

**2a. Parsed resume details hidden**
- `parse_resume` returns contact, full experience entries with bullets, skills, scope metadata
- Frontend receives only: `{ experience_count, skills_count, career_span_years, summary }`
- User never confirms: "Yes, these are the right bullets" or "No, this role was actually VP level"
- File: `strategist/tools.ts:35-77`

**2b. JD analysis truncated**
- Full analysis has must-haves, nice-to-haves, implicit requirements, language keywords
- Frontend gets counts + first 15 keywords
- **Implicit requirements** (unstated hiring manager expectations) never reach the user
- File: `strategist/tools.ts:81-151`

**2c. Company research not displayed**
- `research_company` output (industry, size, culture signals) stays in state
- ResearchDashboardPanel has a CompanyCard component but it receives no data
- File: `ResearchDashboardPanel.tsx:98-129`

**2d. Benchmark profile invisible**
- `build_benchmark` produces `ideal_profile`, `section_expectations`, keyword list
- None of this reaches any panel
- User never sees: "Here's what the ideal candidate for this role looks like"
- File: `strategist/tools.ts:229-260`

---

## Finding 3: Gap Analysis — Counts Instead of Strategy

### What the user sees
- `GapAnalysisPanel` with coverage score and collapsible classification counts
- Strong: X, Partial: Y, Gap: Z

### What's wrong

**3a. Mitigation strategies hidden**
- `classify_fit` produces per-requirement: classification, evidence, strengthen instructions, mitigation strategies
- User only sees the count, not: *"For 'supply chain experience' — you have procurement background. We'll reframe your vendor management as supply chain optimization."*
- File: `strategist/tools.ts:649` (stored to state, not emitted)

**3b. Why Me / Why Not Me never shown**
- classify_fit generates `why_me[]` and `why_not_me[]` arrays
- These are the strategic core — what makes this candidate compelling and what needs creative positioning
- Never displayed to user
- File: `strategist/tools.ts:662-663`

**3c. No user collaboration on gaps**
- User should review gaps and say: "Actually, I DO have that experience"
- No interaction model for gap resolution
- System assumes its gap classification is final

---

## Finding 4: Blueprint Review — Skeleton Without Strategy

### What the user sees
- Target role, positioning angle (editable), section order (reorderable)
- Evidence count badge, keyword count badge
- Age protection flags (if any)
- "Looks Good — Start Writing" button

### What's wrong

**4a. Section names show underscores**
- `normalizeSectionName()` converts to `education_and_certifications`
- `sectionLabels` map in BlueprintReviewPanel is missing entries for some canonical names
- Fallback just capitalizes first letter: "Education_and_certifications"
- File: `BlueprintReviewPanel.tsx:62-66`, `architect.ts:525-549`

**4b. Evidence allocation strategy invisible**
- Blueprint contains per-section evidence priorities with importance tiers
- User never sees: "We're leading with your P&L wins in the summary, your team leadership in Experience Role 1"
- File: `architect.ts:139-154` (experience_blueprint hidden)

**4c. Keyword map is just a count**
- Full `keyword_map` has per-keyword density targets, placement guidance, current vs target counts
- User sees: "12 relevant terms included" — meaningless without context
- File: `architect.ts:168-175`

**4d. Global rules invisible**
- Blueprint specifies voice, tone, bullet format, length target, ATS rules
- None shown to user — they can't confirm or adjust strategic decisions
- File: `architect.ts:177-182`

**4e. Step jump confusion**
- 7-stage progress bar + 8-node workspace sidebar = two parallel numbering systems
- Non-interactive stages (research, gap_analysis) complete in seconds
- User perceives: "I was on step 1, now I'm on step 5"
- File: `process-contract.ts:23-94`, `pipeline-stages.ts:9-17`

---

## Finding 5: Section Writing — Feature-Rich but Disconnected

### What the user sees
- Full-screen workbench with content editor
- Action chips: "Sharpen Opening", "Add Metric", "Power Verb", etc.
- Collapsible advanced guidance with evidence cards and keyword bar
- "Looks Good" / "Quick Refine" / direct edit

### What's partially working
- Evidence cards with "Weave In" buttons
- Keyword bar with live coverage tracking
- Section-specific action chips
- 25-deep undo/redo
- Bundled review for faster approval

### What's wrong

**5a. No backward navigation**
- Server-driven progression — user cannot revisit approved sections
- No "Previous Section" button
- Progress dots are read-only indicators, not clickable
- If user approves summary then realizes it's wrong, they're stuck
- File: `SectionWorkbench.tsx:96-105` (resets on section change, no back nav)

**5b. Action chips are generic, not gap-aware**
- "Add Metric" and "Tighten" are good but not strategic
- Should say: *"This section targets the P&L requirement. Your evidence shows $12M budget — make sure that number appears."*
- No connection between action suggestions and the gap analysis

**5c. JD comparison not visible**
- User cannot see which JD requirements this section is targeting
- No split-view showing: "The JD says X → Your section says Y → Gap: Z"
- Evidence cards show requirement mapping but it's buried in collapsible

**5d. Flash/remount on content updates**
- When server reissues section_draft with new content or token, component remounts
- Clears undo/redo, collapses panels, causes visual flash
- File: `SectionWorkbench.tsx:96-105` dependency array

**5e. AI options feel random**
- "Quick Refine" sends: "Please make this section more concise and impactful"
- Not tied to specific deficiencies
- Should contextualize: "This section scores 60% on keyword coverage — refine to include [missing keywords]"

---

## Finding 6: Navigation & Progress — Confusing Dual Systems

### What the user sees
- Top: 7-stage progress bar ("Step X of 7")
- Left: 8-node workspace sidebar (clickable icons)
- These don't match (sidebar has 8 nodes, progress has 7 steps)

### What's wrong

**6a. Two numbering systems**
- Progress bar: 7 stages (intake through quality_review)
- Sidebar: 8 nodes (overview through export/download)
- User can't reconcile "Step 5 of 7" with the sidebar node they're on

**6b. Non-interactive stages feel skipped**
- Research + gap analysis complete in 1-3 minutes with no user interaction
- User sees step jump: 1 → 5
- Should show these steps completing in real-time with meaningful output

**6c. No section-level navigation in writing phase**
- Sidebar shows "Resume Sections" as one node
- Can't navigate to individual sections (Summary, Experience Role 1, etc.)
- No way to revisit approved sections

---

## Finding 7: Quality Dashboard — Arrives Too Late

### What the user sees
- ATS score, authenticity score, keyword coverage — at the END
- By this point, sections are already approved

### What's wrong
- Quality signals should be visible DURING section writing
- Each section should show its individual quality metrics
- User should know "this section has 40% keyword coverage" BEFORE approving it

---

## Data Visibility Summary

| Server Produces | User Sees | Lost |
|---|---|---|
| Full parsed resume with scope metadata | Counts only | 90% |
| JD must-haves + nice-to-haves + implicit requirements | Counts + 15 keywords | 70% |
| Company research + culture signals | Nothing | 100% |
| Benchmark candidate profile | Nothing | 100% |
| Gap classification with mitigation strategies | Counts only | 80% |
| Why Me / Why Not Me analysis | Nothing | 100% |
| Evidence allocation per section | Count badge | 90% |
| Keyword map with density targets | Count badge | 90% |
| Age protection with specific flags | Shown (working) | 0% |
| Section-level quality metrics | End-of-pipeline only | N/A |

---

## Methodology Alignment Check

| Methodology Step | Server Implementation | UI Implementation | Gap |
|---|---|---|---|
| Get resume | parse_resume tool | OnboardingSummaryPanel (counts only) | User can't verify/correct |
| Get JD | analyze_jd tool | Partial display | Implicit requirements hidden |
| Research benchmark | build_benchmark tool | Not displayed | Complete gap |
| Compare to benchmark | classify_fit tool | Counts only | Mitigation strategies hidden |
| Identify fit levels | classify_fit categories | Counts only | No user collaboration |
| Interview for gaps | interview_candidate_batch | Questions shown, no gap context | No coaching |
| Creative gap solutions | why_not_me + mitigation | Not displayed | Complete gap |
| Blueprint with strategy | design_blueprint | Skeleton only | Strategy hidden |
| Write sections with evidence | Craftsman agent | Workbench (partially working) | No JD comparison |
| Quality assurance | Producer agent | End-of-pipeline only | Should be per-section |

---

## Next: See [[Resume Pipeline UX Redesign Plan]] for the sprint-by-sprint remediation plan.
