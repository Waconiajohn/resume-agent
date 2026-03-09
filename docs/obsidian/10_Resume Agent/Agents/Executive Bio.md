# Agent #16: Executive Bio

**Type:** 1-agent pipeline
**Domain:** `executive-bio`
**Feature Flag:** `FF_EXECUTIVE_BIO`
**Code:** `server/src/agents/executive-bio/`
**Interactive:** No (autonomous)

## Sub-agents

### Writer
Bio analysis and multi-format generation.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_positioning` | MID | Analyze candidate positioning |
| `write_bio` | PRIMARY | Write bio in target format |
| `quality_check_bio` | MID | Quality review |
| `assemble_bio_collection` | No LLM | Compile all formats |

## Output

5 bio formats at 1-2 lengths each:
- Speaker bio
- Board bio
- Advisory bio
- Professional bio
- LinkedIn featured bio

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]

#agent/executive-bio
