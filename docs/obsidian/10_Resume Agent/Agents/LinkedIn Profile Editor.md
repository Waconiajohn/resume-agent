# Agent: LinkedIn Profile Editor

**Type:** 1-agent pipeline (per-section gate cycle)
**Domain:** `linkedin-editor`
**Feature Flag:** `FF_LINKEDIN_EDITOR`
**Code:** `server/src/agents/linkedin-editor/`
**Interactive:** Yes (per-section gates: one gate per section, 5 sections total)
**Platform Number:** Agent #22 in the 33-agent catalog

## Purpose

Writes and optimizes all five LinkedIn profile sections in the user's authentic voice. The agent works through sections sequentially, adapting its tone based on previously approved sections to maintain a consistent voice across the full profile. Sections are approved one at a time before the next is written.

## Section Order

```
headline → about → experience → skills → education
```

Defined in `PROFILE_SECTION_ORDER` in `types.ts`. The agent adapts tone as it sees approved sections — the headline sets the voice that flows through about, experience, and so on.

## Sub-agent: Editor (single agent, sequential sections)

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_section` | PRIMARY | Write one LinkedIn profile section. Adapts tone from previously approved sections. Per-section instructions: headline (220 chars, value + keywords), about (300-500 words, hook opener, CTA), experience (Achievement-Impact-Metric bullets, keywords front-loaded), skills (10-15 strategic skills), education (concise, certifications welcome). |
| `self_review_section` | MID | Score section on keyword_coverage (0-100), readability (0-100), and positioning_alignment (0-100). |
| `revise_section` | PRIMARY | Revise based on user feedback. Stores feedback in `state.section_feedback` per section. |
| `present_section` | LIGHT | Emit `section_draft_ready` SSE event for user review. No LLM call. |
| `emit_transparency` | — | Live updates for each section phase. |

## Section-Specific Quality Targets

| Section | Key Constraints |
|---------|----------------|
| `headline` | Max 220 characters; format: [Role] \| [Value Proposition] \| [Keywords]; avoid "Seeking opportunities" |
| `about` | 3-5 paragraphs, 300-500 words; first-person; hook opener (not "I am a..."); CTA at end |
| `experience` | 2-3 most recent roles; 3-5 bullets each; Achievement-Impact-Metric format; metrics from evidence items |
| `skills` | 10-15 skills; ordered by strategic importance; mix technical + soft + industry keywords |
| `education` | Degree + institution + year; executive education and certifications welcome; kept concise |

## Gate Protocol (Per Section)

The product is structured so each section has its own gate cycle:

1. Editor loop runs `write_section(section)` → `self_review_section(section)` → `present_section(section)`
2. Pipeline pauses at gate for this section
3. User responds with `true` (approved) or `{feedback: string}` (revision requested)
4. If approved: `state.sections_completed` gains this section, `state.section_drafts[section]` is set
5. If revision: `state.section_feedback[section]` is set, Editor re-runs `revise_section` → `self_review_section` → `present_section`
6. Gate re-triggers after revision
7. Repeat for next section in order

## Quality Scores (Per Section)

Three dimensions (0-100) in `SectionQualityScores`:
- **keyword_coverage** — industry keyword presence
- **readability** — scannability and structure
- **positioning_alignment** — how well the section serves the positioning strategy

## Pipeline State

Key fields in `LinkedInEditorState`:
- `current_profile` — user's existing LinkedIn profile text (optional, used as reference)
- `analysis` — profile analysis (current_strengths, gaps, keyword_opportunities, tone_observations)
- `sections_completed` — array of approved `ProfileSection` values
- `section_drafts` — `Partial<Record<ProfileSection, string>>` — approved content per section
- `section_feedback` — `Partial<Record<ProfileSection, string>>` — user feedback per section
- `quality_scores` — `Partial<Record<ProfileSection, SectionQualityScores>>`

## SSE Events

| Event | When | Fields |
|-------|------|--------|
| `stage_start` / `stage_complete` | Phase boundaries | stage, message, duration_ms? |
| `transparency` | Agent activity | stage, message |
| `section_draft_ready` | Section presented for review | session_id, section, content, quality_scores |
| `section_revised` | Revision presented for review | session_id, section, content, quality_scores |
| `section_approved` | User approves section | session_id, section |
| `editor_complete` | All sections approved | session_id, sections: Partial<Record<ProfileSection, string>> |
| `pipeline_error` | Error | stage, error |

## Tone Adaptation Mechanism

When `write_section` is called, `buildSectionPrompt()` includes all previously approved sections (up to 500 chars each) under "Previously Approved Sections (adapt tone to match)." This means the first approved section (headline) establishes the voice that all subsequent sections adapt to — creating a coherent, consistent profile voice.

## Cross-Product Context

Reads from prior sessions:
- `positioning_strategy` — ensures profile aligns with resume positioning
- `evidence_items` — source for specific metrics and stories in experience bullets (up to 6 items)
- `career_narrative` — tone reference for authentic voice

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]
- [[LinkedIn Content Writer]] — uses same authentic voice principles
- [[LinkedIn Optimizer]] — batch optimization vs. this agent's interactive section-by-section flow
- [[Resume Builder]] — provides positioning_strategy and evidence_items

#agent/linkedin-editor #status/done #sprint/60
