# Agent #4: LinkedIn Optimizer

**Type:** 2-agent pipeline
**Domain:** `linkedin-optimizer`
**Feature Flag:** `FF_LINKEDIN_OPTIMIZER`
**Code:** `server/src/agents/linkedin-optimizer/`
**Interactive:** No (autonomous)

## Sub-agents

### Analyzer
Resume parsing, current LinkedIn profile analysis, keyword gap identification.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `parse_inputs` | No LLM | Parse resume and profile |
| `analyze_current_profile` | MID | Assess current LinkedIn presence |
| `identify_keyword_gaps` | MID | Find missing keywords |

### Writer
LinkedIn profile section writing and optimization.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_headline` | PRIMARY | Optimized headline |
| `write_about` | PRIMARY | About section |
| `write_experience_entries` | PRIMARY | Experience entries |
| `optimize_keywords` | MID | Keyword optimization |
| `assemble_report` | PRIMARY | Final report |

## Output

Optimized LinkedIn sections (headline, about, experience) with keyword coverage analysis and quality scoring.

## Related

- [[Project Hub]]

#agent/linkedin-optimizer
