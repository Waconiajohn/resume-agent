# Resume Agent v2: Multi-Agent Architecture

> **Last updated:** 2026-03-30
> **Status:** Live — reflects the production implementation in `server/src/agents/resume-v2/`
> **Authoritative agent roster:** `CLAUDE.md` (always supersedes this document if they diverge)

## Overview

A pipeline of **10 specialized, stateless agents** organized into **5 stages** with
intra-stage parallelization. Each agent is a single-prompt function — structured JSON in,
structured JSON out. No agent is aware of any other agent. All data passes through the
orchestrator via explicit typed interfaces.

Agents 1-9 each make exactly one LLM call. Agent 10 (Assembly) is fully deterministic
with zero LLM calls.

**Pipeline duration:** ~2-3 minutes (Groq)
**Estimated cost:** ~$0.23-0.25 per session (Groq pricing)

---

## Pipeline Flow

```
User uploads resume + JD
        |
  Stage 1: ANALYSIS
  ┌─────────────────────────────────────────────────┐
  │ [1. Job Intelligence]    ┐                      │
  │       MODEL_MID          ├─ parallel             │
  │ [2. Candidate Intelligence]                     │
  │       MODEL_MID          ┘                      │
  │           ↓                                     │
  │ [3. Benchmark Candidate]   (depends on Agent 1) │
  │       MODEL_PRIMARY                             │
  └─────────────────────────────────────────────────┘
        |
  Stage 2: STRATEGY
  ┌─────────────────────────────────────────────────┐
  │ [4. Gap Analysis]         MODEL_PRIMARY          │
  │           ↓                                     │
  │ [5. Narrative Strategy]   MODEL_PRIMARY          │
  └─────────────────────────────────────────────────┘
        |
        |  >> Gap coaching cards + questions emitted (informational, non-blocking) <<
        |
  Stage 3: WRITING
  ┌─────────────────────────────────────────────────┐
  │ [6. Resume Writer]        MODEL_PRIMARY          │
  │     (writes all sections in one call)           │
  └─────────────────────────────────────────────────┘
        |
  Stage 4: VERIFICATION
  ┌─────────────────────────────────────────────────┐
  │ [7. Truth Verification]  ┐                      │
  │       MODEL_PRIMARY      │                      │
  │ [8. ATS Optimization]    ├─ parallel             │
  │       MODEL_LIGHT        │                      │
  │ [9. Executive Tone]      ┘                      │
  │       MODEL_MID                                 │
  └─────────────────────────────────────────────────┘
        |
  Stage 5: ASSEMBLY
  ┌─────────────────────────────────────────────────┐
  │ [10. Assembly]            No LLM (deterministic) │
  │     Merge fixes, compute scores, hiring mgr scan│
  └─────────────────────────────────────────────────┘
        |
  Pipeline Complete → Export (DOCX/PDF)
```

---

## Stage Types

```typescript
export type V2PipelineStage =
  | 'intake'        // Initial state before pipeline starts
  | 'analysis'      // Agents 1-3
  | 'strategy'      // Agents 4-5
  | 'writing'       // Agent 6
  | 'verification'  // Agents 7-9
  | 'assembly'      // Agent 10
  | 'complete';     // Terminal state
```

---

## Agent 1: Job Intelligence

**Purpose:** Extract structured requirements, hiring manager intent, core competencies,
and language keywords from the job description.

**Model:** MODEL_MID | **max_tokens:** 4096

**Input:** `JobIntelligenceInput` — raw job description text
**Output:** `JobIntelligenceOutput` — structured requirements with importance levels,
language keywords, seniority signals

---

## Agent 2: Candidate Intelligence

**Purpose:** Parse the raw resume into a structured candidate profile. Extract experience
entries, skills, education, certifications, and infer scope (team size, budget, geography).
Detect hidden accomplishments and precursor signals (AI readiness, leadership scope,
inferred metrics).

**Model:** MODEL_MID | **max_tokens:** 4096

**Input:** `CandidateIntelligenceInput` — raw resume text
**Output:** `CandidateIntelligenceOutput` — structured profile with experience, skills,
education, inferred scope, hidden accomplishment signals

**Parallelization:** Runs in parallel with Agent 1 (no dependencies between them).

---

## Agent 3: Benchmark Candidate

**Purpose:** Build the ideal hire archetype from the job description — what a perfect
candidate looks like. Used downstream by Gap Analysis to measure the real candidate
against the benchmark.

**Model:** MODEL_PRIMARY | **max_tokens:** 4096

**Input:** `BenchmarkCandidateInput` — job intelligence output (from Agent 1)
**Output:** `BenchmarkCandidateOutput` — ideal candidate archetype with differentiators

**Dependency:** Requires Agent 1 output. Runs after Agents 1-2 complete.

---

## Agent 4: Gap Analysis

**Purpose:** Compare the candidate (Agent 2) against both the job description (Agent 1)
and the benchmark candidate (Agent 3). Classify every requirement as `strong | partial | missing`.
For non-strong requirements, propose creative positioning strategies backed by real evidence.

**Model:** MODEL_PRIMARY | **max_tokens:** 8192

**Input:** `GapAnalysisInput` — job intelligence, candidate intelligence, benchmark candidate
**Output:** `GapAnalysisOutput`

```typescript
interface GapAnalysisOutput {
  requirements: RequirementGap[];       // Full requirement list with classifications
  coverage_score: number;               // 0-100 blended coverage
  score_breakdown?: {
    job_description: RequirementCoverageBreakdown;
    benchmark: RequirementCoverageBreakdown;
  };
  strength_summary: string;
  critical_gaps: string[];              // Formal credentials only (degrees, certs, licenses)
  pending_strategies: Array<{           // Strategies for user coaching/approval
    requirement: string;
    strategy: GapStrategy;
  }>;
}
```

**Classification scheme:** `GapClassification = 'strong' | 'partial' | 'missing'`
This is the canonical scheme used server-side. Each requirement also carries `importance: 'must_have' | 'important' | 'nice_to_have'`.

**Gap coaching:** After Gap Analysis completes, the orchestrator constructs coaching cards
from `pending_strategies` and emits them as informational SSE events. These are non-blocking —
users validate strategies on the final resume itself (Ultimate Resume mode).

---

## Agent 5: Narrative Strategy

**Purpose:** Design the resume's overall narrative, positioning angle, and "Why Me" story.
Determines section order, evidence allocation priorities, and the strategic framing that
ties all sections together.

**Model:** MODEL_PRIMARY | **max_tokens:** 8192

**Input:** `NarrativeStrategyInput` — all upstream outputs + approved strategies
**Output:** `NarrativeStrategyOutput` — positioning angle, section plan, evidence allocation,
keyword integration map, age protection decisions

---

## Agent 6: Resume Writer

**Purpose:** Write the complete resume — all sections in a single call. Executes the
Narrative Strategy's blueprint with zero strategic discretion. The writer receives the
strategy and produces content.

**Model:** MODEL_PRIMARY | **max_tokens:** 8192

**Input:** `ResumeWriterInput` — narrative strategy, candidate intelligence, gap analysis
**Output:** `ResumeDraftOutput`

```typescript
interface ResumeDraftOutput {
  header: { name, phone, email, linkedin, branded_title };
  executive_summary: { content: string; is_new: boolean };
  core_competencies: string[];
  selected_accomplishments: Array<{
    text: string;
    target_requirement: string;
    source: string;
    confidence: number;
    review_state: string;
  }>;
  professional_experience: Array<{
    company, title, dates, location;
    scope_statement?: string;
    bullets: Array<{ text, target_requirement, source, confidence, review_state }>;
  }>;
  earlier_career?: Array<{ title, company }>;
  education: Array<{ degree, institution, year? }>;
  certifications: string[];
  technical_skills?: string[];
  technologies?: string[];
  area_experience?: string[];
}
```

---

## Agent 7: Truth Verification

**Purpose:** Verify every claim in the resume draft against the original resume text.
No metric, accomplishment, or scope claim should exist without a traceable source.
Creative positioning of real experience is allowed; fabrication is not.

**Model:** MODEL_PRIMARY | **max_tokens:** 8192

**Input:** `TruthVerificationInput` — resume draft + original resume text
**Output:** `TruthVerificationOutput` — per-bullet verification with classifications:
`verified | plausible | unverified | fabricated`, plus `truth_score` (0-100)

**Parallelization:** Runs in parallel with Agents 8 and 9.

---

## Agent 8: ATS Optimization

**Purpose:** Keyword matching and ATS compliance analysis. Measures how well the
resume draft covers the job description's language and flags formatting hazards.

**Model:** MODEL_LIGHT | **max_tokens:** 4096

**Input:** `ATSOptimizationInput` — resume draft + job intelligence keywords
**Output:** `ATSOptimizationOutput` — keyword match score, missing keywords,
placement suggestions, formatting compliance

**Parallelization:** Runs in parallel with Agents 7 and 9.

---

## Agent 9: Executive Tone

**Purpose:** Audit the resume for junior language, AI-generated phrasing ("leveraged,"
"spearheaded"), buzzword density, and voice inconsistency. Suggests specific replacements.

**Model:** MODEL_MID | **max_tokens:** 4096

**Input:** `ExecutiveToneInput` — resume draft text
**Output:** `ExecutiveToneOutput` — flagged phrases with suggested replacements,
tone score, banned phrase detection

**Parallelization:** Runs in parallel with Agents 7 and 8.

---

## Agent 10: Assembly

**Purpose:** Merge all verification, ATS, and tone fixes into the final resume.
Compute combined scores. Generate hiring manager scan simulation (5-8 second scan).
Build positioning assessment if gap analysis is available.

**Model:** None — fully deterministic, zero LLM calls.

**Input:** `AssemblyInput` — resume draft + all verification outputs
**Output:** `AssemblyOutput`

```typescript
interface AssemblyOutput {
  final_resume: ResumeDraftOutput;      // Draft with tone fixes applied
  scores: {
    ats_match: number;                  // 0-100
    truth: number;                      // 0-100
    tone: number;                       // 0-100
  };
  quick_wins: string[];                 // Top 3 improvements
  positioning_assessment?: PositioningAssessment;
  hiring_manager_scan?: HiringManagerScan;
}
```

---

## Model Routing (Groq — Primary Provider)

| Tier | Model ID | Cost (per M tokens in/out) | Used By |
|------|----------|---------------------------|---------|
| PRIMARY | llama-3.3-70b-versatile | $0.59 / $0.79 | Agents 3, 4, 5, 6, 7 |
| MID | llama-4-scout-17b-16e-instruct | $0.11 / $0.34 | Agents 1, 2, 9 |
| ORCHESTRATOR | llama-3.3-70b-versatile | $0.59 / $0.79 | Agent loop reasoning (multi-round agents) |
| LIGHT | llama-3.1-8b-instant | $0.05 / $0.08 | Agent 8 |

**Fallback providers:** Z.AI GLM (~$0.26/session), Anthropic Claude (emergency fallback).
Provider configured via `LLM_PROVIDER` env var. Groq is default.

**Cost estimation:** Blended rate assumes real-world mix (50% LIGHT, 30% MID, 20% PRIMARY).

---

## Pipeline State

```typescript
interface V2PipelineState {
  session_id: string;
  user_id: string;
  current_stage: V2PipelineStage;

  // Inputs
  resume_text: string;
  job_description: string;
  user_context?: string;
  career_profile?: CareerProfileV2;

  // Agent outputs (populated progressively)
  job_intelligence?: JobIntelligenceOutput;
  candidate_intelligence?: CandidateIntelligenceOutput;
  benchmark_candidate?: BenchmarkCandidateOutput;
  gap_analysis?: GapAnalysisOutput;
  narrative_strategy?: NarrativeStrategyOutput;
  resume_draft?: ResumeDraftOutput;
  truth_verification?: TruthVerificationOutput;
  ats_optimization?: ATSOptimizationOutput;
  executive_tone?: ExecutiveToneOutput;
  final_resume?: AssemblyOutput;

  // Pre-optimization baseline
  pre_scores?: PreScores;

  // User decisions
  approved_strategies: ApprovedStrategy[];
  gap_coaching_responses?: GapCoachingResponse[];

  // Cost tracking
  token_usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
}
```

---

## User Interaction Model

The v2 pipeline is **non-blocking by default.** Users do not pause the pipeline
to approve gap strategies mid-run.

**Gap coaching cards** are emitted as informational SSE events after Stage 2 completes.
Users see coaching recommendations (proposed strategies, interview questions, coaching
policies) but the pipeline continues into writing without waiting.

**Users validate on the resume itself** — the "Ultimate Resume" mode. After the pipeline
completes, users review and edit the finished resume, which already incorporates the
agent's best positioning strategies.

**Optional re-run paths:**
- User can re-run with `approved_strategies` (pre-approved from a previous run)
- User can re-run with `gap_coaching_responses` (legacy coaching path)
- User can re-run with `user_context` (Add Context flow — surfaces hidden experience)

---

## SSE Event Types

| Event | Emitted By | Payload |
|-------|-----------|---------|
| `stage_start` | Orchestrator | `{ stage, timestamp }` |
| `stage_complete` | Orchestrator | `{ stage, duration_ms }` |
| `job_intelligence` | Stage 1 | `JobIntelligenceOutput` |
| `candidate_intelligence` | Stage 1 | `CandidateIntelligenceOutput` |
| `benchmark_candidate` | Stage 1 | `BenchmarkCandidateOutput` |
| `pre_scores` | Stage 1/2 | `PreScores` |
| `gap_analysis` | Stage 2 | `GapAnalysisOutput` |
| `gap_coaching` | Stage 2 | `GapCoachingCard[]` |
| `gap_questions` | Stage 2 | `GapQuestion[]` |
| `narrative_strategy` | Stage 2 | `NarrativeStrategyOutput` |
| `resume_draft` | Stage 3 | `ResumeDraftOutput` |
| `verification_complete` | Stage 4 | `TruthVerificationOutput` |
| `assembly_complete` | Stage 5 | `AssemblyOutput` |
| `hiring_manager_scan` | Stage 5 | `HiringManagerScan` |
| `transparency` | Any agent | Inline status messages |
| `pipeline_complete` | Orchestrator | Final state summary |
| `pipeline_error` | Orchestrator | Error details |

---

## File Layout

```
server/src/agents/resume-v2/
  orchestrator.ts                    # Pipeline sequencing, SSE emission, zero content decisions
  types.ts                           # V2PipelineState, all agent I/O interfaces
  source-resume-outline.ts           # Resume parsing for truth verification
  knowledge/
    resume-rules.ts                  # Banned phrases, formatting rules
  job-intelligence/agent.ts          # Agent 1
  candidate-intelligence/agent.ts    # Agent 2
  benchmark-candidate/agent.ts       # Agent 3
  gap-analysis/agent.ts              # Agent 4
  narrative-strategy/agent.ts        # Agent 5
  resume-writer/agent.ts             # Agent 6
  truth-verification/agent.ts        # Agent 7
  ats-optimization/agent.ts          # Agent 8
  executive-tone/agent.ts            # Agent 9
  assembly/agent.ts                  # Agent 10
```

All agents are function-based (single exported async function), not class-based.
No agent uses the multi-round `agent-loop.ts` tool-calling protocol — each is a
single LLM prompt with structured JSON output parsing.

---

## Key Design Principles

1. **Agents are stateless.** JSON in, JSON out. No shared memory between agents.
2. **The orchestrator sequences; agents reason.** The orchestrator makes zero content
   decisions. All expertise is delegated to agents. (See Agent Integrity Mandate in CLAUDE.md.)
3. **Evidence integrity is non-negotiable.** No metric in the final resume exists without
   a traceable source. Truth Verification (Agent 7) enforces this.
4. **Single-prompt agents.** Each agent makes exactly one LLM call (except Assembly,
   which makes zero). Multi-step reasoning belongs in the agent's prompt, not in code loops.
5. **Parallelization where safe.** Agents 1-2 run in parallel (independent inputs).
   Agents 7-9 run in parallel (independent verification dimensions). All other sequencing
   reflects true data dependencies.
6. **Non-blocking user interaction.** Gap coaching is informational. Users validate on
   the finished resume, not mid-pipeline.
7. **Age-protective by default.** Gap Analysis, Narrative Strategy, and Assembly all
   consider age-bias signals. Not a single-agent responsibility.
