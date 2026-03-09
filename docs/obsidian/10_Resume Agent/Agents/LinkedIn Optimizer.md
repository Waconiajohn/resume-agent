# Agent #4: LinkedIn Optimizer

**Type:** 2-agent pipeline
**Domain:** `linkedin-optimizer`
**Feature Flag:** `FF_LINKEDIN_OPTIMIZER`
**Code:** `server/src/agents/linkedin-optimizer/`
**Interactive:** No (autonomous)

## Sub-agents

### Analyzer
Resume parsing, current LinkedIn profile analysis, keyword gap identification, recruiter search simulation.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `parse_inputs` | LIGHT | Parse resume text and current LinkedIn profile (headline, about, experience) into structured data. Extract target role/industry/seniority context. Call this first. |
| `analyze_current_profile` | MID | Assess current LinkedIn against resume positioning. Returns headline_assessment, about_assessment, positioning_gaps[], strengths[]. |
| `identify_keyword_gaps` | MID | Find missing keywords for the target role. Returns missing_keywords[], present_keywords[], recommended_keywords[], coverage_score (0-100). |
| `simulate_recruiter_search` | MID | LLM-powered recruiter search simulation with section-weighted scoring: headline (40%), about (25%), experience (25%), skills (10%). Returns overall_score, section_analysis[], missing_keywords[], recommendations[], verdict. Added in Sprint 62. |

### Writer
LinkedIn profile section writing and optimization.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_headline` | PRIMARY | Optimized headline (220 char limit) |
| `write_about` | PRIMARY | About section (1,500-2,400 chars, first-person, hook-first) |
| `write_experience_entries` | PRIMARY | Experience entries (Achievement-Impact-Metric format) |
| `optimize_keywords` | MID | Keyword optimization and placement |
| `assemble_report` | PRIMARY | Final report with all optimized sections |

## Recruiter Search Simulator

Added Sprint 62 (`simulate_recruiter_search` tool). LLM evaluates keyword presence by section with LinkedIn Recruiter weighting:

| Section | Weight | Rationale |
|---------|--------|-----------|
| Headline | 40% | LinkedIn Recruiter prioritizes headline keywords most heavily |
| About | 25% | Second most important for discoverability |
| Experience | 25% | Rich keyword source, especially with achievement bullets |
| Skills | 10% | Endorsement-heavy but lower algorithmic weight |

Output includes per-section keyword lists (found vs. missing), section scores, placement recommendations, and an overall verdict. Stored in `state.recruiter_search_result`.

## Platform Context

Reads from prior sessions:
- `positioning_strategy` — informs keyword targets and profile angle
- `why_me_story` — colleaguesCameForWhat, knownForWhat, whyNotMe — informs about section narrative

## Output

Optimized LinkedIn sections (headline, about, experience) with:
- Keyword coverage analysis (missing vs. present keywords)
- Recruiter search simulation score
- Quality scores per section
- Final assembled optimization report

## Related

- [[Project Hub]]
- [[LinkedIn Content Writer]] — content creation vs. this agent's profile optimization
- [[LinkedIn Profile Editor]] — interactive per-section vs. this agent's autonomous batch

#agent/linkedin-optimizer #status/done #sprint/62
