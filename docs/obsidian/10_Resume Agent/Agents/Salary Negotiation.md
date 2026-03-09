# Agent #15: Salary Negotiation

**Type:** 2-agent pipeline
**Domain:** `salary-negotiation`
**Feature Flag:** `FF_SALARY_NEGOTIATION`
**Code:** `server/src/agents/salary-negotiation/`
**Interactive:** No (autonomous)

## Sub-agents

### Researcher
Compensation research, market position analysis, leverage identification.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `research_compensation` | LIGHT/Perplexity | Market comp data |
| `analyze_market_position` | MID | Where candidate sits in market |
| `identify_leverage_points` | MID | Negotiation leverage |
| `assess_total_comp` | MID | Total compensation analysis |

### Strategist
Negotiation strategy design, talking points, scenario simulations.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `design_strategy` | PRIMARY | Overall negotiation strategy |
| `write_talking_points` | PRIMARY | Key talking points |
| `simulate_scenario` | PRIMARY | 3 scenario variants |
| `write_counter_response` | PRIMARY | Counter-offer templates |
| `assemble_negotiation_prep` | PRIMARY | Final prep document |

## Output

Compensation research, leverage analysis, negotiation strategy with talking points, 3 scenario simulations (initial offer response, counter offer, final negotiation).

## Counter-Offer Simulation Sub-Product

**Code:** `server/src/agents/salary-negotiation/simulation/`
**Domain:** `counter-offer-simulation`

An interactive simulation product built alongside Salary Negotiation. The Employer agent presents realistic pushback one round at a time (one gate per round), the user responds with their counter, the agent evaluates their negotiation technique, and delivers a coaching summary.

### Modes
- `full` — 3 rounds (initial_response → counter → final)
- `single_round` — 1 round for quick technique practice

### Pipeline
Single agent (`employer`) with gate-per-round pattern. `CounterOfferSimState` tracks all rounds.

### Employer Tools

| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `generate_pushback` | MID | Generate realistic employer pushback for the current round. Returns employer_statement, employer_tactic (anchoring/budget_constraints/time_pressure/etc.), and coaching_hint shown before the user responds. |
| `evaluate_response` | MID | Evaluate the user's negotiation response. Scores: confidence (0-100), value_anchoring (0-100), specificity (0-100), collaboration (0-100). Returns overall_score, what_worked[], what_to_improve[], coach_note (carries into next round). |
| `build_coaching_summary` | MID | Compile final performance summary. Returns overall_score, best_round, strengths[], areas_for_improvement[], recommendation. |

### Offer Context (Input)
- `offer_company`, `offer_role` — company and role being negotiated
- `offer_base_salary?`, `offer_total_comp?` — the initial offer values
- `target_salary?` — what the user is trying to reach

### SSE Events (Simulation)

| Event | Fields |
|-------|--------|
| `pushback_presented` | pushback: EmployerPushback |
| `response_evaluated` | evaluation: UserResponseEvaluation |
| `simulation_complete` | session_id, summary: CounterOfferSimState['final_summary'] |

### Cross-Product Context
Reads `positioning_strategy`, `why_me_story`, and `market_research` (from a prior salary negotiation report, if available) from platform context. Coaching_hint surfaces relevant anchoring strategies from the market data.

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]
- [[Interview Prep]] — mock interview follows the same gate-per-question pattern

#agent/salary-negotiation #status/done
