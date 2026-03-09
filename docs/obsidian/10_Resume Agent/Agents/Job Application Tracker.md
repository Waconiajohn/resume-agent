# Agent #14: Job Application Tracker

**Type:** 2-agent pipeline
**Domain:** `job-tracker`
**Feature Flag:** `FF_JOB_TRACKER`
**Code:** `server/src/agents/job-tracker/`
**Interactive:** No (autonomous)

## Sub-agents

### Analyst
Application analysis, fit scoring, follow-up timing, portfolio analytics.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_application` | MID | Assess individual application |
| `score_fit` | MID | Quantitative fit scoring |
| `assess_follow_up_timing` | MID | Optimal follow-up timing |
| `generate_portfolio_analytics` | MID | Cross-application insights |

### Writer
Follow-up message generation and tracker report assembly.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_follow_up_email` | PRIMARY | Follow-up email |
| `write_thank_you` | PRIMARY | Thank you message |
| `write_check_in` | PRIMARY | Status check-in |
| `assess_status` | MID | Application status assessment |
| `assemble_tracker_report` | No LLM | Compile tracker report |

## Output

Batch analysis of multiple applications with fit scores, personalized follow-up messages, and portfolio-level insights.

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]

#agent/job-tracker
