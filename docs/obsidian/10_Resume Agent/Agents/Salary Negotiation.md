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

## Related

- [[Project Hub]]

#agent/salary-negotiation
