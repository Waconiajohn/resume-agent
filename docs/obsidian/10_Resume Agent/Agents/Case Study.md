# Agent #17: Case Study

**Type:** 2-agent pipeline
**Domain:** `case-study`
**Feature Flag:** `FF_CASE_STUDY`
**Code:** `server/src/agents/case-study/`
**Interactive:** No (autonomous)

## Sub-agents

### Analyst
Achievement extraction, impact scoring, narrative element identification.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `parse_achievements` | MID | Extract achievements from resume |
| `score_impact` | MID | Score achievement impact |
| `extract_narrative_elements` | MID | Identify story elements |
| `identify_metrics` | LIGHT | Find quantifiable metrics |

### Writer
Case study drafting with consulting-grade formatting.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_case_study` | PRIMARY | Draft case study |
| `add_metrics_visualization` | MID | Metrics context/visualization |
| `quality_review` | MID | Quality review |
| `assemble_portfolio` | No LLM | Compile portfolio |

## Knowledge Rules

- STAR/CAR framework for achievement structuring
- Metrics quantification guidance
- Consulting-grade formatting standards
- 5 case study formats, 6 impact categories

## Output

Portfolio of consulting-grade case studies with before/after metrics, selected from top-impact achievements.

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]

#agent/case-study
