# Agent #20: 90-Day Plan Generator

**Type:** 2-agent pipeline
**Domain:** `ninety-day-plan`
**Feature Flag:** `FF_NINETY_DAY_PLAN`
**Code:** `server/src/agents/ninety-day-plan/`
**Interactive:** No (autonomous)

## Sub-agents

### Researcher
Role context analysis, stakeholder mapping, quick win identification.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_role_context` | MID | Role and company context |
| `map_stakeholders` | MID | Key stakeholder identification |
| `identify_quick_wins` | MID | Early impact opportunities |
| `assess_learning_priorities` | MID | What to learn first |

### Planner
Strategic 90-day plan generation in 3 phases.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_30_day_plan` | PRIMARY | Phase 1: Listen and Learn |
| `write_60_day_plan` | PRIMARY | Phase 2: Contribute and Build |
| `write_90_day_plan` | PRIMARY | Phase 3: Lead and Deliver |
| `assemble_strategic_plan` | No LLM | Compile full plan |

## Knowledge Rules

- Stakeholder prioritization
- Quick win identification
- Phased onboarding strategy
- 8 knowledge rules total

## Output

Strategic 90-day plan with 3 phases:
1. **Days 1-30:** Listen and Learn -- stakeholder meetings, process understanding
2. **Days 31-60:** Contribute and Build -- quick wins, relationship building
3. **Days 61-90:** Lead and Deliver -- strategic initiatives, measurable impact

Includes stakeholder map, quick wins, learning priorities, and success metrics.

## Related

- [[Project Hub]]

#agent/ninety-day-plan
