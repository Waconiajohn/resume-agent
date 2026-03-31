Project root: /Users/johnschrup/resume-agent

# CLAUDE.md — CareerIQ Platform Development Framework

> **This file is the single source of truth for all development on this project.**
> **Claude MUST read and follow every rule in this file for EVERY task, no exceptions.**
> **When in doubt: read this file again before writing a single line of code.**

---

## ⚡ MANDATORY SESSION START — DO THIS FIRST, EVERY TIME

Before touching any code, Claude MUST complete this checklist in order:

1. Read this CLAUDE.md (automatic)
2. Read `CURRENT_SPRINT.md` — know what is active
3. Read `CONVENTIONS.md` — know project patterns
4. Read last 10 entries of `CHANGELOG.md` — know recent changes
5. Read `docs/obsidian/10_Resume Agent/Project Hub.md` — platform context and agent inventory
6. Read `docs/obsidian/10_Resume Agent/Status.md` — current health, concerns, recent decisions
7. If working on a specific agent, read its note from `docs/obsidian/10_Resume Agent/Agents/`
8. Declare: **"I've reviewed the project context. Current sprint is [X], working on [story]."**

This is non-negotiable. No exceptions. No shortcuts.

---

## CORE PRINCIPLES

1. **No vibe coding.** Every line of code traces back to a story in the current sprint.
2. **No code bloat.** Never pile on code to fix mistakes. Find the root cause. Apply the minimal fix.
3. **No memory loss.** Every change is documented. Every decision is logged. Context is externalized, not assumed.
4. **No scope creep.** If it's not in the current sprint, it goes in the backlog. Period.
5. **Agent-first, always.** Every feature must maximize the power of AI agents. Procedural pipelines are a last resort, never a first choice.

---

## 🤖 AGENT-FIRST ARCHITECTURE MANDATE

This platform is built around AI agents. This is not a preference — it is the architecture. Every feature, workflow, and data pipeline must maximize agent autonomy, creativity, and inter-agent communication.

### Before Writing Any Code, Ask These Questions

- Can an agent own this workflow end-to-end?
- Should a **new specialized agent** be created for this capability?
- Are agents communicating results to each other through the knowledge graph and agent bus?
- Is this the most agent-empowered solution possible — or just the easiest one to code?
- If a human had to oversee this, how do we eliminate that dependency through better agent design?

**If a new feature doesn't fit cleanly into an existing agent's domain, propose a new agent first. Do not write procedural code as a workaround.**

### Current Agent Roster — 19 Products, 42 Agents

The platform has **42 deployed agents** across **19 products**. This is the authoritative roster. If you are building a new agent, check this table first.

#### Resume V2 Pipeline (10 agents) — `agents/resume-v2/`
The cornerstone product. Function-based agents sequenced by `orchestrator.ts`. Always on.

| # | Agent | Domain | Model |
|---|-------|--------|-------|
| 1 | Job Intelligence | Extract structured requirements from JD | MID |
| 2 | Candidate Intelligence | Extract candidate background from resume | MID |
| 3 | Benchmark Candidate | Build ideal hire archetype from JD | PRIMARY |
| 4 | Gap Analysis | Identify gaps + creative positioning strategies | PRIMARY |
| 5 | Narrative Strategy | Design resume narrative and positioning angle | PRIMARY |
| 6 | Resume Writer | Write all resume sections | PRIMARY |
| 7 | Truth Verification | Verify claims against original resume | PRIMARY |
| 8 | ATS Optimization | Keyword/phrase matching and compliance | LIGHT |
| 9 | Executive Tone | Polish language, remove AI-speak and filler | MID |
| 10 | Assembly | Merge verification fixes, compute scores (deterministic) | None |

#### Platform Coaching — `agents/coach/`
| Agent | Domain | Model |
|-------|--------|-------|
| Virtual Coach | 8-phase coaching journey orchestrator, client context, pipeline dispatch (14 tools) | MID |

#### Document Cluster

| Product | Agents | Location | Feature Flag |
|---------|--------|----------|-------------|
| Cover Letter | Analyst → Writer | `agents/cover-letter/` | FF_COVER_LETTER |
| Executive Bio | Writer | `agents/executive-bio/` | FF_EXECUTIVE_BIO |
| Thank You Note | Writer | `agents/thank-you-note/` | FF_THANK_YOU_NOTE |
| Case Study | Analyst → Writer | `agents/case-study/` | FF_CASE_STUDY |

#### LinkedIn Cluster

| Product | Agents | Location | Feature Flag |
|---------|--------|----------|-------------|
| LinkedIn Optimizer | Analyzer → Writer | `agents/linkedin-optimizer/` | FF_LINKEDIN_OPTIMIZER |
| LinkedIn Editor | Editor | `agents/linkedin-editor/` | FF_LINKEDIN_EDITOR |
| LinkedIn Content | Strategist → Writer | `agents/linkedin-content/` | FF_LINKEDIN_CONTENT |

#### Job Discovery Cluster

| Product | Agents | Location | Feature Flag |
|---------|--------|----------|-------------|
| Job Finder | Searcher → Ranker | `agents/job-finder/` | FF_JOB_FINDER |
| Job Tracker | Analyst → Writer | `agents/job-tracker/` | FF_JOB_TRACKER |
| Networking Outreach | Researcher → Writer | `agents/networking-outreach/` | FF_NETWORKING_OUTREACH |

#### Interview & Negotiation Cluster

| Product | Agents | Location | Feature Flag |
|---------|--------|----------|-------------|
| Interview Prep | Researcher → Writer + Mock Interviewer (simulation) | `agents/interview-prep/` | FF_INTERVIEW_PREP |
| Salary Negotiation | Researcher → Strategist + Employer (simulation) | `agents/salary-negotiation/` | FF_SALARY_NEGOTIATION |

#### Professional Development Cluster

| Product | Agents | Location | Feature Flag |
|---------|--------|----------|-------------|
| 90-Day Plan | Researcher → Planner | `agents/ninety-day-plan/` | FF_NINETY_DAY_PLAN |
| Content Calendar | Strategist → Writer | `agents/content-calendar/` | FF_CONTENT_CALENDAR |
| Personal Brand Audit | Auditor → Advisor | `agents/personal-brand/` | FF_PERSONAL_BRAND_AUDIT |

#### Onboarding & Financial Cluster

| Product | Agents | Location | Feature Flag |
|---------|--------|----------|-------------|
| Onboarding Assessment | Assessor (gate-based questionnaire) | `agents/onboarding/` | FF_ONBOARDING |
| Retirement Bridge | Assessor (7-dimension + planner warm handoff) | `agents/retirement-bridge/` | FF_RETIREMENT_BRIDGE |

**Patterns:** Most products follow a 2-agent pipeline (research/analyze → write/produce). Simulation agents (Mock Interviewer, Employer) are gate-based interactive. Resume V2 is function-based; all others use the AgentConfig/registerAgent protocol.

### Platform Service Lines (Full Scope)

The platform serves four lines, each powered by its own agent layer:

- **Career Coaching** — Resume (v2), cover letter, exec bio, thank you notes, case studies, LinkedIn (optimizer/editor/content), interview prep, salary negotiation, networking outreach, 90-day plan, content calendar, personal brand audit, job finder, job tracker
- **Outplacement** — Employer-sponsored career transition services (B2B admin portal + white-label)
- **Recruiting** — AI-driven talent matching and sourcing (planned)
- **Retirement Planning** — Financial wellness and planning via Retirement Bridge agent (RIA-integrated)

When building features, consider cross-agent utility. A tool built for the Resume Strategist may serve the LinkedIn Profile agent. Design for reuse.

### Agent Design Standards

When a new agent is needed:

1. Define the agent's **single domain** — what it owns, what it does not own
2. Define its **tool set** — typed tool objects with Zod schemas
3. Define its **model routing tier** — which tier handles reasoning vs. execution
4. Define its **inter-agent communication** — what it sends and receives on the AgentBus
5. Create its Obsidian note in `docs/obsidian/10_Resume Agent/Agents/`
6. Update the agent table in `Project Hub.md`
7. Use `agent-tool-scaffold` skill for all new tools

**Never create agent-like functionality inside a route, utility, or coordinator. Agents own their domains.**

---
AGENT INTEGRITY MANDATE
The architecture is already correct. The threat is implementation drift.
When sub-agents build or modify agents, they default to procedural patterns that
suffocate the app's AI agents. This section defines exactly what those anti-patterns
look like, what the correct patterns look like, and what the hard rules are.
Read this before touching any agent file.

The Core Risk: What Goes Wrong in Coding Sessions
Claude Code sub-agents, when implementing a new agent or modifying an existing one,
will instinctively:

Add numbered step sequences inside buildAgentMessage — hardcoding which tools to
call and in what order
Add hard throws in validateAfterAgent for every missing field — making the pipeline
brittle and killing graceful degradation
Bloat the coordinator with sequencing logic — moving decisions out of agents and into
the orchestrator
Write tool execute() functions that embed multi-step reasoning loops — duplicating
the agent loop's job inside a single tool call

Every one of these is an architecture violation. Each one is a decision that belongs
to the LLM being stripped away and handed to a for loop.

The Runtime Contract (Read This First)
Understanding what the runtime already provides prevents re-implementing it incorrectly.
agent-loop.ts runs the agent. It:

Sends system prompt + tools + current message to the LLM
Executes whatever tools the LLM calls, in the order the LLM decides
Loops until the LLM returns text without tool calls (agent is done) or hits max_rounds
Supports parallel-safe tools via parallel_safe_tools[]
Handles per-round and overall timeouts, retries, and context compaction automatically

The LLM is the sequencer. The loop gives it tools. The LLM decides the order.
product-coordinator.ts sequences agents. It:

Calls buildAgentMessage() to give the agent its initial message
Runs runAgentLoop() — one call, one agent, fully autonomous
Calls phase.onComplete() to transfer scratchpad → state after agent finishes
Evaluates gates and pauses for user input
Never makes content decisions

buildAgentMessage() provides context, not commands. It answers:

"What data does this agent need to do its job?"
NOT "What tools should this agent call in what order?"

system_prompt defines the agent's identity, domain, and goals. It may describe
a typical workflow as guidance (e.g., "usually you'll want to call X before Y"), but
the LLM is free to deviate. It is not a script.
validateAfterAgent() is a safety net for critical pipeline dependencies only.
It is NOT a completeness checklist for every field.

Pattern Reference: CORRECT vs. INCORRECT
buildAgentMessage — Context Provider, Not Commander
❌ WRONG — Numbered step sequence:
typescriptbuildAgentMessage: (agentName, state) => {
  if (agentName === 'analyzer') {
    return [
      'Analyze this LinkedIn profile.',
      '',
      '1. Call parse_resume_inputs with the resume text',
      '2. Call analyze_profile_strength with the parsed data',
      '3. Call identify_gaps to find missing sections',
      '4. Call emit_transparency after each step',
    ].join('\n');
  }
}
This hardcodes tool call sequence in application code. The agent will follow it
mechanically. It cannot adapt, skip redundant steps, or respond intelligently to
intermediate results.
✅ CORRECT — Context with goal:
typescriptbuildAgentMessage: (agentName, state) => {
  if (agentName === 'analyzer') {
    return [
      'Analyze this LinkedIn profile for optimization opportunities.',
      '',
      '## Profile',
      state.linkedin_profile_text,
      '',
      '## Target Role',
      state.target_role ?? 'Not specified',
      '',
      'Identify the most impactful improvements across all sections.',
    ].join('\n');
  }
}
The agent receives the data it needs. The agent decides how to use its tools.
✅ ALSO CORRECT — Single tool hint for a two-phase interaction:
typescriptbuildAgentMessage: (agentName, state) => {
  if (agentName === 'assessor_questions') {
    return [
      'Conduct a retirement readiness assessment for this person.',
      '',
      state.platform_context?.client_profile
        ? `## Client Profile\n${JSON.stringify(state.platform_context.client_profile, null, 2)}`
        : '## Context\nNo prior profile. Generate questions for a general executive in transition.',
      '',
      'Call emit_transparency to let the user know you are preparing their questions, ' +
        'then call generate_assessment_questions to create 5-7 personalized questions.',
    ].join('\n');
  }
}
A single tool hint is acceptable when the agent's entire first-phase job is exactly
one tool call. Do not expand this to multiple tools.
The test: If you find yourself writing 1., 2., 3. or "First call X, then call Y,
then call Z" — stop. Rewrite as a context block with a goal statement.

validateAfterAgent — Safety Net, Not Completeness Gate
❌ WRONG — Throws for every missing field:
typescriptvalidateAfterAgent: (agentName, state) => {
  if (agentName === 'analyzer') {
    if (!state.profile_strength) throw new Error('Missing profile_strength');
    if (!state.gap_list) throw new Error('Missing gap_list');
    if (!state.keyword_coverage) throw new Error('Missing keyword_coverage');
    if (!state.section_scores) throw new Error('Missing section_scores');
  }
}
This makes the pipeline brittle. One graceful degradation (e.g., the agent couldn't
determine keyword coverage on a sparse profile) becomes a fatal error.
✅ CORRECT — Only throws for critical pipeline dependencies:
typescriptvalidateAfterAgent: (agentName, state) => {
  if (agentName === 'analyzer') {
    if (!state.profile_analysis) {
      // The writer cannot run without ANY analysis output
      throw new Error('Analyzer did not produce profile_analysis — writer cannot proceed');
    }
  }
}
The question is: "Can the next agent still do its job if this field is missing?"
If yes → log a warning, continue. If no → throw.
When to use validateAfterAgent:

The next agent will crash or produce nonsense without this specific field
The field represents the entire output of the agent (not one of many outputs)
The agent had the data it needed to produce this field (not a case of sparse input)

When NOT to use validateAfterAgent:

To verify every scratchpad key was written
To enforce completeness of optional analysis outputs
As a substitute for graceful degradation in tool execute() functions


onComplete — Scratchpad → State Transfer
✅ CORRECT — Transfer what's needed, guard against re-transfer:
typescriptonComplete: (scratchpad, state) => {
  if (scratchpad.profile_analysis && !state.profile_analysis) {
    state.profile_analysis = scratchpad.profile_analysis as ProfileAnalysis;
  }
  if (Array.isArray(scratchpad.gap_list) && state.gap_list.length === 0) {
    state.gap_list = scratchpad.gap_list as GapItem[];
  }
}
Guard with !state.field or state.field.length === 0 to prevent re-runs from
overwriting approved state.
❌ WRONG — Writes directly to state from inside a tool execute():
typescript// Inside a tool's execute() function:
ctx.updateState({ profile_analysis: parsed, gap_list: gaps });
Tools write to ctx.scratchpad. State transfer happens in onComplete.
The only exception: tools that need state to be visible to other tools
within the same agent round (rare; document it explicitly if done).

system_prompt — Identity and Guidance, Not Script
✅ CORRECT workflow description:
## YOUR WORKFLOW

You typically proceed like this:
1. Call emit_transparency to let the user know you're working
2. Call analyze_profile to assess the current state
3. Use identify_gaps to find improvement opportunities
4. Call present_findings when you have enough to show the user

Adapt as needed based on what you find. If the profile is missing a section
entirely, skip the gap analysis for that section and note it in your findings.
The word "typically" and "adapt as needed" preserve agent autonomy. Numbered
lists in system prompts are guidance, not commands, because the LLM's context
includes the full conversation and can override them based on tool results.
❌ WRONG in system prompt (sequential commands):
You MUST do these steps in this exact order:
Step 1: Call parse_resume_inputs. Do not proceed until this completes.
Step 2: Call analyze_profile_strength with the result from Step 1.
Step 3: ONLY THEN call identify_gaps.
"MUST", "Do not proceed until", "ONLY THEN" — these turn a language model into
a state machine. Remove them.

Tool execute() Functions — One Job Per Tool
✅ CORRECT — Tool does one thing, returns structured result:
typescriptasync execute(input, ctx) {
  const response = await llm.chat({ model: MODEL_MID, ... });
  const parsed = JSON.parse(repairJSON(response.text) ?? response.text);
  ctx.scratchpad.gap_analysis = parsed;
  return { gaps_found: parsed.gaps.length, signal: parsed.overall_signal };
}
❌ WRONG — Tool embeds a reasoning loop:
typescriptasync execute(input, ctx) {
  // Step 1: Parse
  const parseResponse = await llm.chat({ model: MODEL_LIGHT, ... });
  const parsed = JSON.parse(parseResponse.text);

  // Step 2: Analyze
  const analysisResponse = await llm.chat({ model: MODEL_MID, ... });
  const analysis = JSON.parse(analysisResponse.text);

  // Step 3: Synthesize
  const synthResponse = await llm.chat({ model: MODEL_PRIMARY, ... });
  return JSON.parse(synthResponse.text);
}
Three LLM calls chained in a single tool execute() is three agents compressed
into one tool. Split into three tools. Let the agent loop sequence them.
The only valid multi-LLM-call pattern in a tool execute() is when the second
call depends on the first call's raw output in a way that cannot be broken out
(e.g., a parse-then-validate pattern on untrusted input). Even then, it should
be two tools unless the calls are tightly coupled.

Gates — Belong in ProductConfig, Not Elsewhere
✅ CORRECT — Gate defined in ProductConfig agents[]:
typescriptagents: [
  {
    name: 'writer',
    config: writerConfig,
    gates: [
      {
        name: 'sequence_review',
        condition: (state) => state.outreach_sequence !== undefined,
        onResponse: (response, state) => {
          // Process user feedback
        },
        requiresRerun: (state) => state.revision_feedback !== undefined,
      },
    ],
  },
]
❌ WRONG — Gate logic leaking into system prompt:
## GATE PROTOCOL
When you finish writing, you MUST call present_to_user and then wait.
Do not call any other tools after present_to_user. The pipeline will pause
and resume when the user responds.
The agent does not need to know about gates. It calls present_to_user
(which calls waitForUser internally). The coordinator handles the rest.
The only valid gate reference in a system prompt is a brief factual note
about the interaction model (see the retirement assessor example — it describes
what happens at the gate, not how to manage it).

Hard Rules — Non-Negotiable
These rules have no exceptions. Any code that violates them must be refactored.
Rule 1: buildAgentMessage provides context, not procedure.
No numbered tool sequences. No "First call X, then call Y." The message answers
"what data does this agent need?" — not "what should this agent do step by step?"
Rule 2: validateAfterAgent throws only for critical pipeline dependencies.
If removing a throw wouldn't cause the next agent to fail completely, the throw
does not belong. Warn instead:
typescriptif (!state.secondary_output) {
  logger.warn({ agentName }, 'Secondary output missing — downstream agent will have reduced context');
}
Rule 3: Tools write to ctx.scratchpad. State transfer happens in onComplete.
No ctx.updateState() calls from inside tool execute() unless explicitly necessary
and documented. The exception: interactive tools that gate on state values visible
to other tools in the same round.
Rule 4: A tool execute() makes at most one LLM call.
If a feature requires multiple sequential LLM calls, that is multiple tools.
The agent loop sequences them. Not a single tool's execute().
Rule 5: Gates are declared in ProductConfig.agents[].gates. Nowhere else.
No gate management in system prompts. No waitForUser calls outside of tool
execute() functions. No gate conditions in coordinator logic added outside
the standard GateDef structure.
Rule 6: The coordinator sequences agents. Agents do not sequence each other.
No agent should call runAgentLoop on another agent. No agent should know about
the pipeline order. Inter-agent communication happens through the AgentBus
(ctx.sendMessage()) or through shared state read in buildAgentMessage.

Applying the Guardian: Pre-Implementation Checklist
Before writing any agent file (agent.ts, tools.ts, product.ts), answer each:
AGENT INTEGRITY CHECK:
□ buildAgentMessage: Does it contain numbered steps or tool call sequences? → REMOVE
□ buildAgentMessage: Does it provide the data the agent needs to decide? → GOOD
□ validateAfterAgent: Does it throw for anything other than "next agent cannot run"? → REMOVE
□ validateAfterAgent: Does each throw represent a true pipeline dependency? → GOOD
□ Tool execute(): Does any tool make 2+ sequential LLM calls? → SPLIT INTO MULTIPLE TOOLS
□ Tool execute(): Does any tool call ctx.updateState()? → MOVE TO onComplete unless documented
□ system_prompt: Does it use "MUST", "Step N:", "ONLY THEN"? → REPLACE WITH "typically"
□ Gates: Are any gates defined outside ProductConfig.agents[].gates? → MOVE THEM
□ Agent count: Am I adding logic to the coordinator that an agent should own? → CREATE AN AGENT

Known Existing Violations (Tolerated, Not to Be Replicated)
The following patterns exist in the current codebase and are tolerated as legacy.
They MUST NOT be replicated in new agents or when refactoring existing ones.

| Location | Violation | Status |
|----------|-----------|--------|
| linkedin-optimizer/product.ts buildAgentMessage | Numbered tool sequences in analyzer/writer messages | Tolerated — refactor in backlog |
| personal-brand/product.ts buildAgentMessage | Dynamic toolOrder array injected as instructions | Tolerated — refactor in backlog |
| networking-outreach/product.ts buildAgentMessage | Numbered sequences in researcher/writer messages | Tolerated — refactor in backlog |
| retirement-bridge/product.ts buildAgentMessage (assessor_evaluation) | "Call evaluate_readiness... then call build_readiness_summary" | Tolerated — minimal (2 tools, natural sequence) |
| Multiple validateAfterAgent blocks | Throws for fields that don't gate the next agent | Tolerated — audit in backlog |
The standard for new work is the retirement assessor (assessor_questions phase). It provides
rich context, a single tool hint for a gate-adjacent workflow, emotional tone guidance, and
injection-safe data framing. It does not enumerate a tool sequence beyond the gated phase.

The Self-Test
After writing any agent implementation, read the agent's buildAgentMessage output aloud
as if you are instructing a human researcher. Ask:

"Am I telling them what to figure out, or what steps to take?"

If the answer is "what steps to take" — rewrite it as "what to figure out."
The agent is the reasoning layer. The runtime is the execution layer. The coordinator is the
sequencing layer. Keep them separate.

## 🚫 LEGACY REPO RULE — NON-NEGOTIABLE

An older codebase exists and is accessible for reference. It is **ideas only**.

| ✅ Permitted | ❌ Prohibited |
|-------------|--------------|
| Read it to understand what a feature was trying to accomplish | Copy any code from it |
| Use it to identify logic flows worth reimagining | Adapt or port any of its patterns |
| Draw inspiration for feature scope | Use its architecture as a template |
| Identify gaps the old system had | Treat any of its code as a starting point |

**The old codebase is procedural, non-agent, and pre-AI. Its architecture is incompatible with this platform by design.**

If you find yourself writing something that structurally resembles the old repo — stop. Redesign it agent-first from scratch.

---

## PROJECT STRUCTURE REQUIREMENTS

Every project MUST maintain this directory:

```
/docs/
  BACKLOG.md          ← All epics and stories not yet scheduled
  CURRENT_SPRINT.md   ← Active sprint with stories and acceptance criteria
  SPRINT_LOG.md       ← Completed sprints with retrospectives
  CHANGELOG.md        ← Every change, every session, timestamped
  ARCHITECTURE.md     ← System architecture and conventions
  CONVENTIONS.md      ← Code style, error handling, naming rules
  DECISIONS.md        ← Architecture Decision Records (ADRs)
```

**If these files do not exist, Claude MUST create them before writing any code.**

---

## SCRUM WORKFLOW

### Phase 1: Epic Decomposition

When starting a new feature area:

1. Define the **Epic** (e.g., "LinkedIn Profile Agent")
2. Break it into **Stories** using this format:

```markdown
### Story: [SHORT_TITLE]
- **As a** [user/admin/system]
- **I want to** [specific action]
- **So that** [clear outcome]
- **Acceptance Criteria:**
  - [ ] Criterion 1 (testable, specific)
  - [ ] Criterion 2
- **Estimated complexity:** [Small / Medium / Large]
- **Dependencies:** [list any blockers or prerequisite stories]
```

Stories must be completable in a single focused session. No story should require more than ~300 lines of new code. If it feels too big, split it.

### Phase 2: Sprint Planning

```markdown
# Sprint [NUMBER]: [THEME]
**Goal:** [One sentence describing what this sprint achieves]
**Started:** [Date]

## Stories This Sprint
1. [ ] Story A — [not started / in progress / review / done]
2. [ ] Story B
3. [ ] Story C

## Out of Scope (Explicitly)
- [Things we are NOT doing this sprint]
```

### Phase 3: Build (Per Story)

For EACH story, follow this sequence without exception:

1. **Announce** — State which story is being worked on
2. **Plan** — Outline the approach BEFORE writing code (files to change, approach, risks)
3. **Implement** — Write the minimal code to satisfy acceptance criteria
4. **Test** — Verify each acceptance criterion is met
5. **Document** — Update CHANGELOG.md
6. **Commit format:** `[SPRINT-X][STORY-NAME] Brief description`

### Phase 4: Sprint Retrospective

```markdown
# Sprint [NUMBER] Retrospective
**Completed:** [Date]

## What was delivered
## What went well
## What went wrong
## What to improve next sprint
## Technical debt identified
```

Move completed stories out of CURRENT_SPRINT.md. Plan the next sprint.

---

## CODE QUALITY RULES

### Before Writing Any Code

- [ ] Confirm which story this code belongs to
- [ ] Check CONVENTIONS.md for project patterns
- [ ] Check ARCHITECTURE.md for system constraints
- [ ] Verify no duplicate functionality already exists

### While Writing Code

- **Single Responsibility** — each function/module does ONE thing
- **No dead code** — remove unused imports, functions, variables immediately
- **No commented-out code** — delete it, Git has history
- **Error handling** — every external call (API, DB, file) has explicit error handling per CONVENTIONS.md
- **Naming** — follow CONVENTIONS.md exactly, no ad hoc abbreviations
- **DRY** — search for existing utilities before creating new ones

### Bug Fixing Protocol

**Never pile on code to fix a bug.**

1. **Identify** the root cause (not the symptom)
2. **Explain** the root cause before proposing a fix
3. **Fix** at the root level with minimal change
4. **Verify** the fix doesn't break related functionality
5. **Document** in CHANGELOG.md

If a fix requires more than 20 lines of new code, stop and reassess. The fix is probably wrong.

### Refactoring Rule

Refactoring is always its own story. Never mix refactoring with feature work. Schedule it like any other sprint story.

---

## CONTEXT DRIFT PREVENTION

### Mid-Session Verification (Every 3–5 Significant Changes)

Run this internal check:

```
DRIFT CHECK:
- Am I still working on the assigned story? [yes/no]
- Am I following CONVENTIONS.md? [yes/no]
- Am I following ARCHITECTURE.md? [yes/no]
- Have I introduced code not required by the current story? [yes/no]
- Am I maximizing agent autonomy in this implementation? [yes/no]
- Confidence score: [1-10]
```

If confidence drops below 7:
1. Stop coding
2. Re-read CONVENTIONS.md and ARCHITECTURE.md
3. Review the current story's acceptance criteria
4. State what drifted and correct course

### Post-Implementation Review (Before Declaring "Done")

After completing any batch of implementation work — whether a single story, multiple stories, or autonomous agent work — Claude MUST run a semantic review pass before declaring the work complete. This catches logic bugs, data flow gaps, and semantic errors that TypeScript compilation cannot detect.

Review checklist:
1. **Data flow completeness** — Does every UI input reach the backend? Does every backend response reach the UI?
2. **Edge cases** — Division by zero, empty arrays, null/undefined vs falsy (e.g., `!score` hides score of 0)
3. **Business logic correctness** — Are approvals, gates, and state transitions doing what the user expects?
4. **Event timing** — Are SSE events emitted at the right moment, not one step early/late?
5. **Enum/constant alignment** — Do frontend and backend use the same string values?
6. **Initialization** — Are arrays, objects, and accumulators initialized before first use?
7. **Resource limits** — Are `max_tokens`, `max_rounds`, `slice()` limits sufficient for real-world data?

For autonomous/subagent work: each agent MUST run this review on its own output before completing. The orchestrating session MUST also run a cross-agent review after merging.

### Pre-Commit Hook (Automated)

A Claude Code hook at `.claude/hooks/pre-commit-check.sh` runs automatically before every `git commit`. It compiles both `app/` and `server/` with `tsc --noEmit` and blocks the commit if either fails. This is enforced by `.claude/settings.json` — do not remove or bypass it.

### Session End Protocol

Before ending any session, Claude MUST:

1. Update CHANGELOG.md with all changes made
2. Update story status in CURRENT_SPRINT.md
3. Update `docs/obsidian/10_Resume Agent/Status.md` with current health, concerns, test counts
4. Note any blockers, questions, or concerns for the next session
5. If a story is incomplete, document exactly where it left off

---

## CHANGELOG FORMAT

```markdown
## [DATE] — Session [N]
**Sprint:** [number] | **Story:** [name]
**Summary:** [One sentence]

### Changes Made
- `path/to/file.ext` — [what changed and why]

### Decisions Made
- [Architectural or design decisions with reasoning]

### Known Issues
- [Discovered but not yet fixed]

### Next Steps
- [What the next session should pick up]
```

---

## ARCHITECTURE DECISION RECORDS

```markdown
## ADR-[NUMBER]: [TITLE]
**Date:** [date]
**Status:** [proposed / accepted / deprecated / superseded]
**Context:** [What situation prompted this]
**Decision:** [What was decided]
**Reasoning:** [Why this over alternatives]
**Consequences:** [What this means going forward]
```

---

## OBSIDIAN KNOWLEDGE BASE (`docs/obsidian/`)

The Obsidian vault is the platform's extended memory. It contains navigable reference notes on architecture, all agents, model routing, SSE events, and the platform blueprint.

```
docs/obsidian/
  10_Resume Agent/
    Project Hub.md          ← Central entry point (read at session start)
    Architecture Overview.md
    Platform Blueprint.md
    Model Routing.md
    SSE Event System.md
    Agents/                 ← One note per agent (#1–#20+)
  20_Prompts/               ← Prompt patterns and templates
  30_Specs & Designs/       ← Feature specs, UX flows
  40_Snippets & APIs/       ← Code patterns, API contracts
  Templates/                ← Note templates
```

### Vault Maintenance (Mandatory)

| Event | Action |
|-------|--------|
| New agent built | Create note in `Agents/`, update agent table in `Project Hub.md` |
| Architecture changes | Update `Architecture Overview.md`, `Model Routing.md`, or `SSE Event System.md` |
| Session end | Update `Status.md` with test counts, concerns, decisions |
| New prompt pattern | Add to `20_Prompts/` |
| Significant bug fixed | Add postmortem to `40_Snippets & APIs/` |
| New feature spec | Add to `30_Specs & Designs/` |

Rules: reference don't duplicate, one concept per note, use tags consistently (`#agent/name`, `#status/todo|in-progress|done`, `#type/spec|decision|bug|prompt`, `#sprint/N`).

---

## CLAUDE CODE SKILLS — USE PROACTIVELY

Skills in `~/.claude/skills/` encode this project's patterns. **Use them automatically when the task matches — don't wait to be asked.**

| Trigger | Skill | What it does |
|---------|-------|-------------|
| Adding a new agent tool | **agent-tool-scaffold** | Creates tool def, Zod schema, model routing in llm.ts, agent registration, test file |
| Adding a new SSE event or panel | **sse-event-pipeline** | Creates PanelData union type, backend emission, event handler, panel component, panel-renderer case |
| Before ANY commit | **qa-gate** | Runs tsc (app + server), import resolution, stale closures |
| Starting/ending a session | **scrum-session** | Automates Session Start/End Protocol |
| After implementing any feature | **component-test-gen** | Generates tests with project-specific mocks |
| Creating/modifying DB tables | **supabase-migration** | Generates migration with RLS policies |
| Making architectural decisions | **adr-writer** | Creates ADR in docs/DECISIONS.md |
| Adding error handling | **error-pattern** | Pipeline error emission, Pino logging, Sentry integration |
| Modifying prompts or model routing | **llm-prompt-lab** | Prompt versioning, cost estimation, model-specific handling |
| Suspecting unused code | **dead-code-hunter** | Scans for orphaned components, unused exports, legacy agent code |

### Mandatory Skill Usage

1. **qa-gate** — MUST run before every commit. Both `app` and `server` tsc must pass.
2. **agent-tool-scaffold** — MUST use when adding tools to any agent. The 5-file sequence is error-prone without it — especially the model routing entry in `llm.ts`, which silently falls back to the wrong tier if missing.
3. **sse-event-pipeline** — MUST use when adding new panel types. The 4-file sequence must stay in sync.
4. **scrum-session** — SHOULD use at session start/end.
5. **component-test-gen** — SHOULD generate tests for new components.

### Quality Floor (Do Not Regress Below)

- Server tests: **1,014 passing, 0 failures**
- App tests: **586 passing, 0 failures**
- TypeScript: both `app` and `server` tsc must pass

---

## ABSOLUTE PROHIBITIONS

Claude MUST NEVER:

1. **Write code without an active story** — no sprint active means plan first
2. **Install packages without documenting why** — every dependency gets an ADR
3. **Create "temporary" fixes** — every fix is permanent or it's documented tech debt
4. **Ignore existing patterns** — if the project uses pattern X, new code uses pattern X
5. **Refactor while building features** — always separate stories
6. **Skip the changelog** — every session, every change, documented
7. **Assume context from previous sessions** — always re-read project docs at session start
8. **Add functionality beyond current story scope** — backlog it instead
9. **Use `any` types, `eslint-disable`, or skip error handling** — unless explicitly permitted in CONVENTIONS.md
10. **Delete or overwrite these framework files** — append-only (except CURRENT_SPRINT.md which rotates)
11. **Copy, adapt, or port code from the legacy repository** — ideas only, never code
12. **Build procedural pipelines where an agent could own the work** — agent-first, always
13. **Create a new agent without defining its domain, tools, and AgentBus contracts first**

---

## PRODUCT MISSION

We take mid-level executives and optimally position them for every job they apply to, starting from the premise that they are already highly qualified.

**The process:** Resume intake → job description analysis → benchmark candidate profiling → gap analysis → guided interview to surface real experience → resume crafting that positions the user as the benchmark others are compared to.

**Core insight:** Most executives' professional lives are only ~1% reflected on their resume. There is an enormous amount of real, relevant experience to surface. Executives are better suited for far more roles than they originally believe.

**What we are NOT:** We never fabricate experience, inflate credentials, or misrepresent clients. We better position real skills, abilities, and accomplishments. We better demonstrate why the candidate is a genuine fit.

**The goal:** The finished resume positions the executive so they are viewed as the benchmark candidate — the standard everyone else is measured against.

This philosophy must guide all LLM prompts, tool implementations, and UX decisions.

---

## SESSION PROMPT TEMPLATE

When starting a new coding session, provide:

```
I'm continuing work on CareerIQ / Resume Agent.
Current sprint: [number]
I want to work on: [story name or "next story in sprint"]
```

Claude will then execute the Session Start Protocol above before touching any code.

---

## THE DIAGNOSTIC PROMPT — USE WHEN THINGS FEEL OFF

If at any point you suspect drift or quality degradation, paste this:

```
SYSTEM VERIFICATION CHECK:
Halt current generation.
Review this CLAUDE.md file.
Review CONVENTIONS.md and ARCHITECTURE.md.
Output the exact conventions mandated for this project.
Identify deviations in your last three outputs.
Check: am I maximizing agent architecture, not working around it?
Check: have I pulled anything from the legacy repo?
Self-correct.
Output a confidence score for current alignment (1-10).
Resume only when confidence is 8 or above.
```

---

## TECHNICAL REFERENCE

### Tech Stack

- **Backend:** Hono + Node.js (port 3001)
- **Frontend:** Vite + React 19 + TailwindCSS (port 5173)
- **Database:** Supabase (PostgreSQL) with RLS policies
- **LLM Primary:** Groq (LPU inference, OpenAI-compatible)
- **LLM Fallbacks:** Z.AI GLM, Anthropic Claude (via `LLM_PROVIDER` env var)

### Monorepo Layout

```
app/                          # Frontend (Vite + React 19)
  src/components/panels/      # 11 right-panel components
  src/hooks/                  # useAgent.ts (SSE), usePipeline.ts, useSession.ts, useAuth.ts
  src/types/                  # panels.ts (PanelData union), session.ts, resume.ts
server/                       # Backend (Hono + Node.js)
  src/agents/
    runtime/                  # Agent loop, bus, protocol, context
    knowledge/                # Rules, formatting-guide
    strategist/               # Agent 1: Understanding + intelligence + positioning
    craftsman/                # Agent 2: Content creation + self-review
    producer/                 # Agent 3: QA + document production
    coordinator.ts            # Thin orchestrator (~800 lines)
    types.ts                  # PipelineState, PipelineSSEEvent, agent I/O interfaces
  src/agent/                  # Legacy monolithic loop (being phased out)
  src/routes/                 # pipeline.ts, sessions.ts, resumes.ts
  src/lib/                    # llm.ts, llm-provider.ts, supabase.ts, logger.ts, feature-flags.ts
supabase/
  migrations/                 # Numbered SQL migration files
```

### Dev Commands

- Start server: `cd server && npm run dev` (port 3001)
- Start frontend: `cd app && npm run dev` (port 5173)
- TypeScript check (app): `cd app && npx tsc --noEmit`
- TypeScript check (server): `cd server && npx tsc --noEmit`
- Test credentials: `jjschrup@yahoo.com` / `Scout123`

### Agent Architecture

**Coordinator** (`coordinator.ts`) — Thin orchestration layer. Sequences agents, manages SSE events and gates, routes inter-agent messages. Makes zero content decisions.

**Resume Strategist** — Owns understanding, research, positioning. Runs as agentic loop. Tools: `parse_resume`, `analyze_jd`, `research_company`, `build_benchmark`, `interview_candidate`, `classify_fit`, `design_blueprint`, `emit_transparency`

**Resume Craftsman** — Owns content creation and self-review. Tools: `write_section`, `self_review_section`, `revise_section`, `check_keyword_coverage`, `check_anti_patterns`, `check_evidence_integrity`, `present_to_user`, `emit_transparency`

**Resume Producer** — Owns QA and document production. Tools: `select_template`, `adversarial_review`, `ats_compliance_check`, `humanize_check`, `check_blueprint_compliance`, `verify_cross_section_consistency`, `check_narrative_coherence`, `request_content_revision`, `emit_transparency`

**Agent Runtime** (`server/src/agents/runtime/`):
- `agent-loop.ts` — Core agentic loop: multi-round LLM + tool calling with retries, timeouts
- `agent-bus.ts` — In-memory inter-agent message routing
- `agent-protocol.ts` — Standard types: AgentTool, AgentContext, AgentConfig, AgentMessage
- `agent-context.ts` — Creates runtime context for tools

### Model Routing (Groq — Primary)

| Tier | Model | Cost (per M in/out) | Used For |
|------|-------|---------------------|----------|
| PRIMARY | llama-3.3-70b-versatile | $0.59/$0.79 | Section writing, adversarial review |
| MID | llama-4-scout-17b-16e-instruct | $0.11/$0.34 | Self-review, gap analysis, benchmarking |
| ORCHESTRATOR | llama-3.3-70b-versatile | $0.59/$0.79 | Agent loop reasoning (all 3 agents) |
| LIGHT | llama-3.1-8b-instant | $0.05/$0.08 | Text extraction, JD analysis |

Estimated pipeline cost: ~$0.23/pipeline (Groq) | ~$0.26/pipeline (Z.AI) | Pipeline time: 2–3 min (Groq)

### SSE Event Types

`stage_start` / `stage_complete` | `positioning_question` | `blueprint_ready` | `section_draft` / `section_revised` / `section_approved` | `quality_scores` | `pipeline_gate` | `questionnaire` | `right_panel_update` | `pipeline_complete` / `pipeline_error`

### Panel Types (11)

`onboarding_summary` | `research_dashboard` | `gap_analysis` | `design_options` | `live_resume` | `quality_dashboard` | `completion` | `positioning_interview` | `blueprint_review` | `section_review` | `questionnaire`

### Database Tables

`master_resumes` | `job_applications` | `coach_sessions` | `messages` | `resumes` | `resume_sections` | `user_positioning_profiles` | `user_usage` | `pricing_plans` | `subscriptions` | `waitlist_emails`

### Key Patterns

- **Agentic loop** — Each agent runs multi-round LLM loop. The LLM decides which tools to call and when to stop.
- **Agent tools** — Typed objects `{ name, description, input_schema, execute }`. LLM sees the schema; `execute` runs when called.
- **Inter-agent messaging** — Agents communicate through `AgentBus` using `AgentMessage` format.
- **Self-review loop** — Craftsman writes, self-reviews, then presents to user. Write-review-revise happens autonomously.
- **Pipeline gates** — `waitForUser()` pauses → SSE event → user interacts → `POST /api/pipeline/respond` → resumes.
- **Tool-to-model routing** — `getModelForTool(toolName)` in `llm.ts` maps each tool to the right cost tier.
- **Imports** — `@/` alias for app; `.js` extensions for server (ESM).
- **Error handling** — Pipeline wraps each stage in try/catch, emits `pipeline_error`. Never throw from SSE handlers.
- **TypeScript** — Strict mode. Both `app/` and `server/` must pass `tsc --noEmit`. Avoid `any`.

### Known Issues

- **Bug 16** — Revision loops: agent may re-propose edits after user approves a section
- **Bug 17** — Context forgetfulness on long sessions (mitigated by MAX_HISTORY_MESSAGES=60)
- **Bug 18** — 409 Conflict: frontend sends messages while agent is still processing
- **MaxListenersExceededWarning** — Abort listeners exceed 10 on long sessions
- **PDF Unicode** — Check exports for `?` characters replacing special chars

---

*This framework is version 2.0. Update it through the normal story/sprint process — never ad hoc.*
