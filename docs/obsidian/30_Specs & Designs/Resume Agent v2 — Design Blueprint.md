# Resume Agent v2 — Design Blueprint

> **Status:** Draft — March 11, 2026
> **Author:** John Schrup + Claude
> **Purpose:** Complete redesign of the resume agent as a truly agentic system

---

## The Problem

The current resume agent treats AI like an assembly-line worker. A cheap orchestrator LLM decides what tools to call, questions come out generic, stages flash by unreadable, and the pipeline freezes after writing "John Doe" as the header. A single good prompt to ChatGPT produces better results than the entire 3-agent pipeline.

## The Vision

**The app is a conduit to AI, not a constraint on it.**

The system should behave like a **strategic positioning engine** — not a resume generator. AI agents do the heavy lifting. The user reviews, edits, and approves the output. The result should feel like it was written by a $3,000 executive resume writer.

---

## What the User Experiences

### Step 1: Input (30 seconds)

User pastes two things:
- Their resume
- The job description

That's it. No company name field (extracted from JD). No workflow mode selector. No LinkedIn URL. Just the two documents that matter.

### Step 2: AI Works (60-90 seconds)

The system runs the full analysis and produces a complete first draft. The user sees meaningful progress — not flashing stage labels, but actual intermediate output appearing:

1. **"Here's what they're looking for"** — Job intelligence summary appears (10s)
2. **"Here's what you bring"** — Candidate strengths surface (10s)
3. **"Here's the benchmark"** — What the ideal candidate looks like (10s)
4. **"Here's your positioning"** — Gap analysis + narrative strategy (15s)
5. **"Here's your resume"** — Full draft appears, section by section (30-45s)

Each of these stays visible. Nothing flashes by. The user can scroll up and read any stage while later stages are still generating. Think ChatGPT streaming — output accumulates, it doesn't replace.

### Step 3: Review the Draft

The user now has:
- A complete 2-page resume draft
- A "Why Me" positioning story
- A gap analysis showing strong/partial/missing alignment
- An ATS match score

The resume is displayed as a full document. The user can click any section to edit it. AI assistance buttons appear on hover/selection:

| Button | What it does |
|--------|-------------|
| **Strengthen** | More impactful language, stronger verbs |
| **+ Metrics** | Add quantified results |
| **Shorten** | Compress while preserving meaning |
| **+ Keywords** | Inject JD keywords naturally |
| **Rewrite** | Full rewrite of selected text |
| **Custom** | Free-text instruction ("make this more executive") |
| **"Not my voice"** | Rewrite preserving candidate's authentic tone |

Each edit updates the ATS score in real time.

### Step 4: Add Context (Optional)

After reviewing the draft and gap analysis, the user may realize the agents missed something — experience they have but didn't emphasize on their resume, or context that changes how a gap should be framed. A simple text area lets them add anything:

> "I also managed a $6M annual budget at CWT but never put it on my resume"
> "My HubSpot experience is comparable to what they want with Salesforce"
> "I led the offshore transition — that's the centralization experience they're looking for"

When the user submits additional context, the system **re-runs the Resume Writer Agent** with the enriched evidence. The updated resume shows `(New)` markers on changed content, and the gap analysis and ATS score update accordingly.

This is lightweight — no interview, no questions, no gates. Just "tell us what we missed" and the agents do the rest.

### Step 5: Export

Download as DOCX (primary, ATS-optimized) or PDF. Clean, single-column, modern formatting.

---

## The Agent Team

### Analysis Agents (run in parallel, ~10-15s)

#### 1. Job Intelligence Agent
**Input:** Job description text
**Output:** Structured intelligence — required competencies, strategic responsibilities, cultural signals, seniority level, business problems, hidden hiring signals, extracted company name
**Model:** MODEL_MID
**Key rule:** Ignore HR fluff. Identify what the hiring manager actually cares about.

#### 2. Candidate Intelligence Agent
**Input:** Resume text
**Output:** Structured profile — career themes, leadership scope, quantified outcomes, industry depth, technologies, operational scale, career span, contact info
**Model:** MODEL_MID
**Key rule:** Convert narrative into quantified achievements. Detect hidden accomplishments. Parse contact info accurately (no "John Doe" ever).

#### 3. Benchmark Candidate Agent
**Input:** Job Intelligence output + industry context
**Output:** The ideal candidate profile for this specific role — what the hiring manager pictures when they imagine the perfect hire
**Model:** MODEL_PRIMARY
**Key rule:** Build a realistic hiring archetype, not a fantasy. This is the target the resume must match.
**This is the most important agent in the system.**

### Strategy Agents (sequential, ~15s)

#### 4. Gap Analysis Agent
**Input:** Candidate Intelligence + Benchmark Candidate + Job Intelligence
**Output:** Requirement-by-requirement classification (strong/partial/missing), with evidence for each. For every partial or missing requirement, a **creative positioning strategy**.
**Model:** MODEL_PRIMARY
**Key rule:** Never fabricate experience. But be *creatively aggressive* about reframing real experience to close gaps.

**Creative Strategy Examples:**

| Gap Type | Strategy |
|----------|----------|
| "No budget management experience" | Do the math: "Managed team of 40 at ~$85K avg = $3.4M payroll budget." Infer from scope. |
| "Requires Salesforce" but candidate has HubSpot/Zoho | Position as: "Enterprise CRM platforms including HubSpot and Zoho CRM" — same functional domain |
| "PMP certification required" but candidate has 15 years of PM | Position as: "Extensive project and program leadership with working knowledge of PMI methodologies" |
| "Revenue accountability" but candidate ran support ops | Reframe: support operations that enabled revenue retention, customer lifetime value, upsell |
| "Call center centralization" but candidate standardized processes | Reframe: "Led initiatives to standardize operations across distributed teams" — that IS centralization work |
| "AI automation experience" but candidate implemented knowledge bases | Position knowledge base as: "automation-ready knowledge infrastructure enabling future AI/RAG capabilities" |

The agent doesn't just classify gaps — it **solves them** by finding the closest real experience and proposing how to position it. The Resume Writer Agent then uses these strategies to craft bullets that truthfully address each requirement.

#### 5. Narrative Strategy Agent
**Input:** Gap Analysis + Candidate Intelligence + Job Intelligence
**Output:** Primary positioning narrative ("Enterprise Transformation Leader"), supporting themes, "Why Me" story, branded title line
**Model:** MODEL_PRIMARY
**Key rule:** Only choose narratives supported by real evidence.

### Creation Agent (the big one, ~30-45s)

#### 6. Resume Writer Agent
**Input:** Everything from agents 1-5 + resume rules knowledge base
**Output:** Complete 2-page resume following the executive resume rulebook
**Model:** MODEL_PRIMARY
**Key behavior:** This is not a tool-calling loop. This is one powerful prompt with full context that produces a complete resume. The agent has creative authority within the strategic guardrails set by the Narrative Strategy Agent.

**Resume structure (per rulebook):**
1. Header (name, phone, email, LinkedIn URL, branded title line)
2. Executive Summary (3-5 lines, pitch + scale + marquee accomplishments)
3. Core Competencies (9-12 hard skills mirroring JD keywords)
4. Selected Accomplishments (3-6 quantified career highlights)
5. Professional Experience (reverse-chronological, last 10-15 years detailed)
6. Earlier Career (condensed — company, title, dates only)
7. Education & Certifications (no graduation dates for 45+ candidates)

### Verification Agents (run in parallel, ~10s)

#### 7. Truth Verification Agent
**Input:** Resume draft + original resume + candidate intelligence
**Output:** Claim-by-claim verification. Every bullet maps to source data. Flag any hallucinated metrics or fabricated experience.
**Model:** MODEL_MID
**Key rule:** 100% of claims must trace to candidate source data.

#### 8. ATS Optimization Agent
**Input:** Resume draft + job description keywords
**Output:** ATS match score, missing keywords, keyword placement suggestions, formatting compliance check
**Model:** MODEL_LIGHT
**Key rule:** Optimize without keyword-stuffing. Readability for humans comes first.

#### 9. Executive Tone Agent
**Input:** Resume draft
**Output:** Tone audit — flag junior language, AI-generated phrasing, generic filler, passive voice. Suggest replacements.
**Model:** MODEL_MID
**Banned phrases:** "results-oriented leader," "motivated professional," "dynamic team player," "proven track record," "responsible for," "helped," "assisted," "supported"

### Assembly

#### 10. Resume Assembly Agent
**Input:** Verified, ATS-optimized, tone-audited resume draft
**Output:** Final formatted document ready for export
**Model:** None (deterministic formatting)
**Key rule:** Max 2 pages. Single-column. Clean ATS formatting. DOCX primary format.

### Orchestrator
Coordinates the flow. Thin. Makes zero content decisions. Sequences the agents, passes output between them, manages SSE events to the frontend.

---

## The Editing UX

### Principle: The Output IS the Interface

Don't build panels *about* the resume. Show the resume. Let users edit it directly.

### Inline AI Actions

When the user selects text or clicks a section, a floating toolbar appears:

**Quick actions:** Strengthen | + Metrics | Shorten | + Keywords | Rewrite | Custom | "Not my voice"

Each action:
1. Sends the selected text + full resume context + JD to the LLM
2. Returns the replacement text
3. Shows a diff (original vs. new) with Accept/Reject
4. Updates ATS score in real time
5. Adds to undo/redo stack

### `(New)` Enhancement Markers

Any AI-added content that wasn't in the original resume is tagged with `(New)`. The user can:
- Accept individual enhancements
- Reject individual enhancements
- See exactly what was added vs. what came from their original material

### Live Scoring

A persistent sidebar or header bar shows:
- **ATS Match Score** (keywords found / keywords required)
- **Truth Score** (verified claims / total claims)
- **Top 3 Quick Wins** (easiest improvements to make)

These update after every edit.

---

## What We Keep

| Component | Status | Notes |
|-----------|--------|-------|
| Agent runtime (`agents/runtime/`) | Keep | agent-loop, agent-bus, agent-protocol all solid |
| SSE event system | Keep | Real-time pipeline communication works |
| Supabase schema + RLS | Keep | Database layer is sound |
| Model routing / LLM provider | Keep | Provider-agnostic, cost-tiered |
| Hono server framework | Keep | Routes, middleware, auth |

## What We Rebuild

| Component | Action | Why |
|-----------|--------|-----|
| Strategist/Craftsman/Producer agents | Replace | Expand to 10 specialized agents |
| Coordinator | Simplify | Thin orchestrator, no content decisions |
| All prompts | Rewrite | Quality prompts that produce complete output, not fragments |
| Pipeline intake form | Rebuild | Two fields: resume + JD. That's it. |
| Panel system (11 panel types) | Replace | Streaming output + inline editing |
| Section-by-section review | Replace | Full document view with inline AI actions |
| Blueprint approval gate | Remove | Strategy shown as context, not a gate |
| Positioning interview | Remove | Gap Analysis Agent handles this creatively; optional "add context" text box for user input |
| Test suite | Rebuild | Real E2E tests in CI. Kill the mock theatre. |

---

## Resume Knowledge Base

The agents internalize these rules (from Perplexity research):

### Document Format
- 2 pages for mid-level executives
- Reverse-chronological, single-column, minimalist
- DOCX primary (ATS compatibility)

### Section Rules
- **Header:** Name, phone, email, LinkedIn, branded title line targeting the role you WANT
- **Executive Summary:** 3-5 lines. Pitch line + scale indicators + 1-2 marquee accomplishments. No "results-oriented leader" garbage.
- **Core Competencies:** 9-12 hard skills/strategic themes. Mirror JD keywords. Include digital/AI fluency signal.
- **Selected Accomplishments:** 3-6 quantified highlights. Action Verb + What You Did + Measurable Result.
- **Professional Experience:** 4-7 bullets per recent role. Scope statement above bullets. CAR method. Quantify across money/time/volume/scope.
- **Earlier Career:** Company, title, dates. No bullets. Never >20 years detailed.
- **Education:** No graduation dates for candidates 45+. No high school.

### Writing Rules
- Never say "responsible for" — start with strong action verbs
- Every bullet shows impact, not just activity
- Prefer metrics across 4 categories: money, time, volume, scope
- Speak like a leader: "drove," "championed," "influenced" — not "helped," "assisted," "supported"
- Authentic voice over resume-speak
- Write for humans first, ATS second

### Age-Proofing (Critical for 45-60)
- Remove graduation dates
- Don't lead with "25+ years of experience"
- Drop outdated technologies
- Modern template and email address

### Guardrails
- Never fabricate experience or inflate credentials
- Metrics must be verified or user-confirmed
- Prefer reframing over inventing
- Every claim traces to source data

---

## Open Questions

1. **How does the thematic agent work?** Match company language/values/culture signals from JD into resume tone. Lower priority but worth designing a slot for.

2. **What model handles the Resume Writer Agent?** This is the most demanding prompt — full resume generation with context from 5 prior agents. Needs MODEL_PRIMARY or even a more capable model.

3. **How do we handle the "Why Me" story in the UI?** Separate panel? Part of the gap analysis display? Collapsible card above the resume?

4. **Export format details?** DOCX template design, font choices, spacing. Need to match "modern, clean, ATS-friendly" standard.

5. ~~How does "Add Context" re-draft work?~~ **RESOLVED:** Re-run Gap Analysis (with new context merged into Candidate Intelligence), then Narrative Strategy, then Resume Writer, then Verification agents. The full strategy layer re-runs because new context can change gap classifications and positioning.

6. ~~How aggressive should the Gap Analysis Agent be?~~ **RESOLVED:** Present creative strategies as **suggestions the user confirms**. For inferred numbers (like budgets from team sizes), back off 10-20% from the math to land on a number the candidate can comfortably defend. Example: team of 40 × $85K avg = $3.4M → suggest "$3M+ payroll budget" so the candidate doesn't get caught overstating in an interview. The user sees each strategy and approves/rejects before it's used in the draft.

---

## Codebase Inventory — Keep / Delete / Modify

### Server — DELETE (entire current resume pipeline)

| Path | Replaced By |
|------|-------------|
| `agents/strategist/` (entire dir) | Job Intelligence, Candidate Intelligence, Benchmark agents |
| `agents/craftsman/` (entire dir) | Resume Writer agent |
| `agents/producer/` (entire dir) | Truth Verification, ATS Optimization, Executive Tone agents |
| `agents/coordinator.ts` | New thin Orchestrator |
| `agents/resume/` (product.ts, event-middleware.ts, route-hooks.ts) | New pipeline config |
| `agents/schemas/` | New agent output schemas |
| `agents/knowledge/` | New resume rules knowledge base |
| `agents/architect.ts` | Narrative Strategy agent |
| `agents/positioning-coach.ts` | Gap Analysis agent |
| `agents/section-writer.ts` | Resume Writer agent (full document, not per-section) |
| `agents/intake.ts`, `agents/research.ts` | Job/Candidate Intelligence agents |
| `agents/gap-analyst.ts`, `agents/quality-reviewer.ts` | Dedicated verification agents |
| `agents/master-resume-merge.ts` | Not needed |
| `agents/ats-rules.ts`, `agents/section-suggestion*.ts` | Rebuilt into agent knowledge |
| `routes/resume-pipeline.ts` | New pipeline route |

### Server — KEEP (platform infrastructure)

| Path | Notes |
|------|-------|
| `agents/runtime/` (all 10 files) | Agent loop, bus, protocol, context — foundation |
| `agents/coach/`, `agents/onboarding/`, `agents/retirement-bridge/` | Other products untouched |
| `routes/product-route-factory.ts` | Reusable for new pipeline |
| `routes/sessions.ts`, all non-resume routes | Platform routes |
| `lib/llm.ts`, `lib/llm-provider.ts` | Model routing infrastructure |
| `lib/supabase.ts`, `lib/logger.ts` | Core libs |
| All middleware | Platform infrastructure |

### Server — MODIFY

| Path | Change |
|------|--------|
| `index.ts` | Remove old pipeline import lines |
| `lib/feature-flags.ts` | Remove pipeline-specific flags |
| `agents/types.ts` | New agent I/O interfaces for 10-agent system |

### Frontend — DELETE (panel system + pipeline UX)

| Component | Replaced By |
|-----------|-------------|
| All 11 panel components + `panel-renderer.tsx` | Streaming accumulation UX |
| `SectionWorkbench/` (5 sub-components) | Inline editing on resume document |
| `CoachScreen`, `InterviewLayout`, `ModeTransition` | New simplified flow |
| `ChatPanel`, `ChatDrawer`, `AskUserPrompt` | Not in new flow |
| `usePipelineStateManager`, `useSSEEventHandlers` | New streaming hooks |
| `useWorkflowSession`, `useWorkspaceNavigation`, `useUIMode` | Simplified navigation |
| `WorkspaceShell` | Simpler layout |
| `panels.ts` types, `workflow` types, pipeline constants | New type system |

### Frontend — KEEP (platform + design system)

| Component | Notes |
|-----------|-------|
| `Glass*` design primitives | Design system foundation |
| Auth components (`AuthGate`, `useAuth`) | Platform auth |
| All CareerIQ rooms + hooks | Other products untouched |
| Export libs (docx, pdf, cover letter) | Needed for Step 5: Export |
| `useSSEConnection`, `sse-parser` | SSE infrastructure (adapt for streaming) |
| `SalesPage`, `PricingPage`, `BillingDashboard` | Platform pages |
| All `lib/` utilities | Platform infrastructure |

### Frontend — MODIFY (primary targets)

| Component | Change |
|-----------|--------|
| **`LiveResumeDocument.tsx`** | Add inline AI editing toolbar, `(New)` markers, click-to-edit |
| `QualityDashboardPanel.tsx` | Adapt for live ATS score sidebar |
| `Header.tsx` | Simplified for new flow |
| `useAgent.ts` | Rebuild for streaming accumulation model |
| `useSession.ts` | Adapt for new pipeline |
| `App.tsx` | New routing for simplified flow |

---

## Success Criteria

The rebuild is successful when:

1. A user can paste a resume + JD and get a complete, high-quality draft in under 2 minutes
2. The output quality matches what John gets manually from ChatGPT with his best prompts
3. The Gap Analysis Agent creatively closes gaps that a naive system would mark as "missing" — inferring budgets, reframing adjacent experience, positioning working knowledge
4. Inline editing with AI assistance feels natural and fast
5. No "John Doe." No frozen pipelines. No flashing stages. No useless questions about information already on the resume.
6. A real user (not a mock test) can go from start to exported DOCX in under 10 minutes
7. The "Add Context" flow lets users surface hidden experience and see it integrated into the resume within seconds
