# Agent #1: Resume Builder

**Type:** 3-agent pipeline
**Domain:** `resume`
**Feature Flag:** Core (always enabled)
**Code:** `server/src/agents/{strategist,craftsman,producer}/`
**Interactive:** Yes -- multiple user gates (interview, blueprint review, section review)

## Sub-agents

### Strategist
Owns understanding, intelligence, and positioning. Interviews the candidate like a world-class executive recruiter, researches the market, identifies competitive advantages, and designs the resume strategy.

**Tools (8):**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `parse_resume` | LIGHT | Extract structured data from uploaded resume |
| `analyze_jd` | LIGHT | Parse job description requirements |
| `research_company` | PRIMARY | Company/industry research via Perplexity |
| `build_benchmark` | MID | Build benchmark candidate profile |
| `interview_candidate` | PRIMARY | Dynamic positioning interview (8-15 questions) |
| `interview_candidate_batch` | PRIMARY | Batch interview variant |
| `classify_fit` | MID | Gap analysis + career arc + evidence extraction |
| `design_blueprint` | PRIMARY | Strategic blueprint with evidence priorities |

### Craftsman
Owns content creation. Writes each section, self-reviews against quality checklist and anti-patterns, then presents to user. Iterates on feedback.

**Tools (8):**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_section` | PRIMARY | Write resume section content |
| `self_review_section` | MID | Quality check before presenting to user |
| `revise_section` | PRIMARY | Revise based on user or producer feedback |
| `check_keyword_coverage` | No LLM | Verify keyword targets met |
| `check_anti_patterns` | No LLM | Scan for resume cliches |
| `check_evidence_integrity` | LIGHT | Verify claims have evidence backing |
| `present_to_user` | No LLM | Emit section for user review |
| `emit_transparency` | No LLM | Activity feed updates |

### Producer
Owns document production and quality assurance. Selects template, verifies ATS compliance, runs multi-perspective quality checks. Can request Craftsman revisions via message bus.

**Tools (9):**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `select_template` | ORCHESTRATOR | Choose from 5 executive templates |
| `adversarial_review` | PRIMARY | Multi-perspective quality review |
| `ats_compliance_check` | No LLM | ATS compatibility across 5 systems |
| `humanize_check` | LIGHT | Detect AI-sounding language |
| `check_blueprint_compliance` | MID | Verify content matches blueprint |
| `verify_cross_section_consistency` | MID | Check consistency across sections |
| `check_narrative_coherence` | MID | Story arc, tonal consistency |
| `request_content_revision` | No LLM | Request Craftsman revision via bus |
| `emit_transparency` | No LLM | Activity feed updates |

## Knowledge Rules

- `SECTION_GUIDANCE` -- structure + writing rules per section type
- `QUALITY_CHECKLIST` -- multi-dimension quality scoring
- `RESUME_ANTI_PATTERNS` -- cliches, structural issues to avoid
- `AGE_AWARENESS_RULES` -- age-neutral positioning
- `ATS_FORMATTING_RULES` -- ATS compliance requirements
- `resume-formatting-guide.md` -- 756 lines, 5 executive templates

## Key Behaviors

- **Self-review loop:** Craftsman writes -> self-reviews -> revises before presenting to user
- **Blueprint approval gate:** User reviews/edits positioning strategy before writing begins
- **Section-by-section review:** Each section presented individually for approval/feedback/direct edit
- **Inter-agent revision:** Producer can request Craftsman revisions via message bus
- **Evidence flow:** Interview transcript passed to Craftsman with "authentic voice" instructions

## Inter-Agent Communication

Producer sends `REQUEST_REVISION` messages to the Craftsman via `AgentBus` when quality checks fail. The Coordinator subscribes to these bus messages and re-runs the Craftsman loop with the revision request as context.

## Related

- [[Project Hub]]
- [[Architecture Overview]]
- [[Model Routing]]

#agent/resume #agent/strategist #agent/craftsman #agent/producer
