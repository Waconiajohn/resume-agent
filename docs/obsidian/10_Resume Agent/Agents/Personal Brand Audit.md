# Agent #19: Personal Brand Audit

**Type:** 2-agent pipeline
**Domain:** `personal-brand`
**Feature Flag:** `FF_PERSONAL_BRAND_AUDIT`
**Code:** `server/src/agents/personal-brand/`
**Interactive:** No (autonomous)

## Sub-agents

### Auditor
Brand analysis across multiple channels, consistency scoring.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_resume_brand` | MID | Resume brand signals |
| `analyze_linkedin_brand` | MID | LinkedIn brand signals |
| `analyze_bio_brand` | MID | Bio brand signals |
| `score_consistency` | MID | Cross-channel consistency scoring |

### Advisor
Gap identification, recommendation generation, fix prioritization.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `identify_gaps` | MID | Brand gaps across channels |
| `write_recommendations` | PRIMARY | Improvement recommendations |
| `prioritize_fixes` | MID | Impact vs effort prioritization |
| `assemble_audit_report` | No LLM | Compile audit report |

## Knowledge Rules

- Brand consistency assessment
- Cross-channel messaging alignment
- 6 finding categories
- 8 knowledge rules total
- ConsistencyScores interface (overall, messaging, value prop)

## Output

Brand audit report with consistency scores, gap analysis across resume/LinkedIn/bio, and prioritized improvement recommendations.

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]

#agent/personal-brand
