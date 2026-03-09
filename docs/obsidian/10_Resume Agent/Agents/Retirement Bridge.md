# Agent: Retirement Bridge

**Type:** 1-agent pipeline (gate-based, two phases)
**Domain:** `retirement_bridge`
**Feature Flag:** `FF_RETIREMENT_BRIDGE`
**Code:** `server/src/agents/retirement-bridge/`
**Interactive:** Yes (gate-based: generate questions → user responds → evaluate → build summary)
**Phase:** 6 of CareerIQ Master Build Plan

## Purpose

Assesses retirement readiness across 7 dimensions for executives in career transition. Surfaces observations and questions for a qualified fiduciary financial planner — never financial advice. The deliverable is a `RetirementReadinessSummary` stored in platform context and used to facilitate a warm handoff to a certified financial planner.

## Sub-agent: Assessor (runs in two passes)

The same `assessorConfig` runs twice: once to generate questions (and pause), once to evaluate responses and build the summary.

### Phase 1 — assessor_questions
Calls `generate_assessment_questions`, emits `questions_ready`, then pauses at the `retirement_assessment` gate for user responses.

### Phase 2 — assessor_evaluation
Resumes after the gate with user responses in state. Calls `evaluate_readiness`, then `build_readiness_summary`.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `generate_assessment_questions` | MID | Create 5-7 readiness questions across 7 dimensions |
| `evaluate_readiness` | MID | Analyze responses per dimension, assign signals, generate planner questions |
| `build_readiness_summary` | MID | Synthesize dimension assessments into shareable summary with fiduciary disclaimer |

## Knowledge Rules

5 rules injected into the Assessor system prompt (0-4):

| Rule | Subject |
|------|---------|
| Rule 0 (Non-Negotiable) | Fiduciary guardrails — what the agent NEVER and ALWAYS does |
| Rule 1 | 7 assessment dimensions: income_replacement, healthcare_bridge, debt_profile, retirement_savings_impact, insurance_gaps, tax_implications, lifestyle_adjustment |
| Rule 2 | Question design: 5-7 questions, relative framing (never dollar amounts), warmth mandatory |
| Rule 3 | Signal classification: green/yellow/red (requires 2+ independent signals for red, default yellow when ambiguous) |
| Rule 4 | Output formatting: shareable summary structure suitable to hand to a planner |

## Fiduciary Guardrails

This is the most important constraint. The agent is NOT a financial advisor, investment advisor, tax professional, insurance agent, or estate planning attorney. Every rule is subordinate to this.

**Never:**
- Give financial advice ("you should," "I recommend," "consider doing")
- Suggest specific financial products
- Recommend specific actions (withdraw, sell, pay off)
- Provide tax guidance
- Quantify risk or make predictions
- Render judgments about financial adequacy

**Always:**
- Frame outputs as observations: "We noticed..."
- Frame actions as questions the user brings to a planner: "You might ask your planner..."
- Defer specific guidance to a qualified fiduciary
- Include the fiduciary disclaimer verbatim in all shareable outputs

The canonical disclaimer is a constant in `knowledge/rules.ts`: `FIDUCIARY_DISCLAIMER`.

## Gate Protocol

1. Phase 1 runs → agent calls `generate_assessment_questions` → stores questions in scratchpad
2. `product.ts` `onComplete` hook transfers questions from scratchpad to `state.questions`
3. Gate condition: `state.questions.length > 0 && Object.keys(state.responses).length === 0`
4. Pipeline pauses at `retirement_assessment` gate → emits `questions_ready` SSE event
5. User answers questions in frontend (Record<string, string>, keyed by question id)
6. Frontend responds via `POST /api/retirement-bridge/respond`
7. `onResponse` handler stores responses in `state.responses`
8. Phase 2 (assessor_evaluation) runs → calls `evaluate_readiness` → calls `build_readiness_summary`

## Signal System

Three signals (not scores) per dimension:

| Signal | Meaning |
|--------|---------|
| `green` | No concerning indicators — appears well-positioned |
| `yellow` | Worth exploring with a planner — not urgent (DEFAULT when ambiguous) |
| `red` | Warrants prompt professional attention (requires 2+ independent signals) |

**Overall readiness** = worst-case across all 7 dimensions (any red → overall red; any yellow → overall yellow).

## Output Format

**RetirementReadinessSummary** (stored in `user_platform_context` as `retirement_readiness` type):
- `dimensions` — array of 7 `DimensionAssessment` objects, each with signal, observations[], questions_to_ask_planner[]
- `overall_readiness` — worst-case signal
- `key_observations` — 3-5 plain-language observations
- `recommended_planner_topics` — 3-7 specific topics for a fiduciary planner conversation (red first)
- `shareable_summary` — multi-paragraph plain-language text suitable to hand to a planner at a first meeting, with fiduciary disclaimer footer enforced by code

## SSE Events

| Event | When | Fields |
|-------|------|--------|
| `stage_start` | Assessment begins | stage, message |
| `stage_complete` | Phase completes | stage, message, duration_ms? |
| `transparency` | Agent activity updates | stage, message |
| `questions_ready` | Questions generated, gate triggered | questions: RetirementQuestion[] |
| `assessment_complete` | Summary built | session_id, summary: RetirementReadinessSummary |
| `pipeline_error` | Error in any stage | stage, error |

## Persistence

**DB table:** `retirement_readiness_assessments` — stores questions, responses, dimension_assessments, readiness_summary, overall_readiness.

**Platform context:** `upsertUserContext(userId, 'retirement_readiness', summary)` — makes the summary available to all downstream agents (Financial Planner Warm Handoff, etc.).

## Platform Context Integration

Reads from prior sessions:
- `client_profile` (from onboarding) — personalizes question tone and framing
- `positioning_strategy` (from resume pipeline) — surfaces career transition context

Emotional baseline middleware (`emotional-baseline.ts`) is applied to both phases — distress resources included in agent messages if distress signals detected.

## Related

- [[Project Hub]]
- [[Onboarding Assessment]] — provides client_profile
- [[Resume Builder]] — provides positioning_strategy
- [[Platform Blueprint]]
- [[Coaching Methodology]]

#agent/retirement-bridge #status/done #sprint/50
