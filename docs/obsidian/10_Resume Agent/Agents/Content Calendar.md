# Agent #5: Content Calendar

**Type:** 2-agent pipeline
**Domain:** `content-calendar`
**Feature Flag:** `FF_CONTENT_CALENDAR`
**Code:** `server/src/agents/content-calendar/`
**Interactive:** No (autonomous)

## Sub-agents

### Strategist
Resume analysis, expertise mapping, audience analysis, content mix planning.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_expertise` | MID | Map domain expertise |
| `identify_themes` | MID | Content theme identification |
| `map_audience_interests` | MID | Target audience analysis |
| `plan_content_mix` | MID | Balance content types |

### Writer
30-day LinkedIn post calendar generation.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_post` | PRIMARY | Draft individual posts |
| `craft_hook` | PRIMARY | Opening hooks |
| `add_hashtags` | LIGHT | Hashtag optimization |
| `schedule_post` | No LLM | Calendar scheduling |
| `assemble_calendar` | No LLM | Compile 30-day calendar |

## Output

30-day LinkedIn content calendar with themes, hooks, hashtags, and scheduling guidance. Content mix: thought leadership, industry insights, personal narrative.

## Related

- [[Project Hub]]

#agent/content-calendar
