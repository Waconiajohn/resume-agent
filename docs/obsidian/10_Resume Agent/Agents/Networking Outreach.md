# Agent #13: Networking Outreach

**Type:** 2-agent pipeline
**Domain:** `networking-outreach`
**Feature Flag:** `FF_NETWORKING_OUTREACH`
**Code:** `server/src/agents/networking-outreach/`
**Interactive:** No (autonomous)

## Sub-agents

### Researcher
Target contact analysis, common ground identification, connection path assessment.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_target` | MID | Assess target contact |
| `find_common_ground` | MID | Identify shared interests/connections |
| `assess_connection_path` | MID | Evaluate best approach |
| `plan_outreach_sequence` | MID | Design message sequence |

### Writer
Personalized multi-touch message sequence generation.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_connection_request` | PRIMARY | Initial connection message |
| `write_follow_up` | PRIMARY | Follow-up messages (2 variants) |
| `write_value_offer` | PRIMARY | Value-first message |
| `write_meeting_request` | PRIMARY | Meeting request |
| `assemble_sequence` | No LLM | Compile 5-message sequence |

## Output

5-message outreach sequence: connection request, 2 follow-ups, value offer, meeting request. Value-first, authentically personalized.

## Related

- [[Project Hub]]

#agent/networking-outreach
