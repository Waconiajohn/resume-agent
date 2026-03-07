# Agent #3: Interview Prep

**Type:** 2-agent pipeline
**Domain:** `interview-prep`
**Feature Flag:** `FF_INTERVIEW_PREP`
**Code:** `server/src/agents/interview-prep/`
**Interactive:** No (autonomous)

## Sub-agents

### Researcher
Resume parsing, JD analysis, company research, interview question sourcing.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `parse_inputs` | No LLM | Parse resume and JD |
| `research_company` | LIGHT/Perplexity | Company background research |
| `find_interview_questions` | LIGHT/Perplexity | Source likely interview questions |

### Writer
Interview prep report writing, career story building, section assembly.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_section` | PRIMARY | Write report sections |
| `self_review_section` | MID | Quality check |
| `build_career_story` | PRIMARY | Craft narrative from experience |
| `assemble_report` | PRIMARY | Compile final report |

## Knowledge Rules

- 11+ rules covering audience, structure, quality, STAR method
- 9 mandatory report sections: company research, elevator pitch, role fit, technical Q&A, behavioral Q&A, 3-2-1 strategy, why-me story, 30-60-90 plan, final tips

## Related

- [[Project Hub]]

#agent/interview-prep
