# Agent: LinkedIn Content Writer

**Type:** 2-agent pipeline (Strategist → Writer)
**Domain:** `linkedin-content`
**Feature Flag:** `FF_LINKEDIN_CONTENT`
**Code:** `server/src/agents/linkedin-content/`
**Interactive:** Yes (2 user gates: topic_selection and post_review)
**Platform Number:** Agent #23 in the 33-agent catalog

## Purpose

Analyzes a professional's positioning strategy and evidence library to suggest compelling LinkedIn post topics, then writes authentic thought leadership posts in the user's genuine voice. Posts are rooted in real experience and evidence items, never generic advice.

## Sub-agents

### Strategist
Analyzes the user's platform context to identify expertise areas, then generates 3-5 topic suggestions. Pauses at a gate for the user to select a topic (or provide a custom one).

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_expertise` | MID | Read platform context (positioning_strategy, evidence_items, career_narrative) to extract expertise areas, industry focus, positioning angle, and authentic phrases. |
| `suggest_topics` | MID | Generate N topic suggestions (default 5, range 3-7). Each includes hook line, rationale, expertise area, and evidence references. |
| `present_topics` | LIGHT | Emit `topics_ready` SSE event. No LLM call — pure formatting and emission. |
| `emit_transparency` | — | Live updates during strategy phase. |

### Writer
Writes the post, self-reviews it, and presents it for user approval. Handles revision if the user requests changes.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_post` | PRIMARY | Draft full post (250-400 words): hook + body (3-5 short paragraphs) + CTA + hashtags. 4 style options: story, insight, question, contrarian. |
| `self_review_post` | MID | Score authenticity (0-100), engagement_potential (0-100), keyword_density (0-100). Also extracts hook formula: hook_score (0-100), hook_type (contrarian/specific_number/story_opener/direct_challenge/vulnerable_admission/other), hook_assessment. |
| `revise_post` | PRIMARY | Revise based on user feedback. Can pull specific evidence items if user requests examples. |
| `present_post` | LIGHT | Emit `post_draft_ready` or (after revision) `post_revised` SSE event with full hook analysis fields. |
| `emit_transparency` | — | Live updates during writing phase. |

## Platform Context

Reads from prior sessions:
- `positioning_strategy` — ensures post reinforces the positioning angle
- `evidence_items` — source for specific metrics and stories (up to 8 items used)
- `career_narrative` — used to match the user's authentic voice

## Gate Protocol

### Gate 1: topic_selection (after Strategist)
- Condition: `suggested_topics.length > 0 && !selected_topic`
- Pauses after `present_topics` emits `topics_ready`
- User responds with topic id (string matching a suggestion) or custom text
- `onResponse` resolves to `state.selected_topic`

### Gate 2: post_review (after Writer)
- No explicit condition — triggers after Writer loop completes
- User responds with `true` (approved) or `{feedback: string}` (revision requested)
- If revision: `state.revision_feedback` is set and Writer loop re-runs calling `revise_post` → `self_review_post` → `present_post`

## SSE Events

| Event | When | Fields |
|-------|------|--------|
| `stage_start` / `stage_complete` | Phase boundaries | stage, message, duration_ms? |
| `transparency` | Agent activity | stage, message |
| `topics_ready` | Strategist complete, gate 1 triggered | session_id, topics: TopicSuggestion[] |
| `post_draft_ready` | Writer presents first draft | session_id, post, hashtags, quality_scores, hook_score?, hook_type?, hook_assessment? |
| `post_revised` | Writer presents revised draft | session_id, post, hashtags, quality_scores, hook_score?, hook_type?, hook_assessment? |
| `content_complete` | Pipeline finishes | session_id, post, hashtags, quality_scores, hook_score?, hook_type?, hook_assessment? |
| `pipeline_error` | Error | stage, error |

**Note:** `hook_score`, `hook_type`, and `hook_assessment` were added in Sprint 62 (Session 64). These fields are optional on `post_draft_ready`, `post_revised`, and `content_complete`.

## Hook Formula Analysis

The `self_review_post` tool analyzes the first 210 characters (the "see more" boundary on LinkedIn) for hook effectiveness:

- **hook_score** (0-100): 90+ stops scroll immediately; 70-89 compelling; <70 weak
- **hook_type**: contrarian, specific_number, story_opener, direct_challenge, vulnerable_admission, other
- **hook_assessment**: one sentence on why this hook works or how to improve it

Frontend coaching nudge: if `hookScore < 60`, show `hookAssessment` text in the post review UI.

## Post Quality Scores

Three dimensions (0-100):
- **authenticity** — genuine voice, no buzzwords (90+ = fully specific)
- **engagement_potential** — hook strength, scannability, clear CTA (90+ = stops scroll)
- **keyword_density** — industry keyword coverage (90+ = excellent)

## Persistence

Completed posts are persisted to the `content_posts` table:
- `platform: 'linkedin'`
- `post_type: 'thought_leadership'`
- `topic, content, hashtags, status: 'draft', quality_scores`
- `source_session_id` for traceability

## Post Design Principles

- First 1-2 lines (hook): stop the scroll — no "I'm excited to share..." openers
- Body: 3-5 short paragraphs, one idea each, white space intentional
- CTA: genuine question or invitation, not "Follow me for more"
- Hashtags: 3-5, mix of broad and niche
- Total length: 250-400 words

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]
- [[LinkedIn Profile Editor]]
- [[LinkedIn Optimizer]]
- [[Networking Outreach]] — outreach writer cross-references last 5 approved posts for content-networking synergy

#agent/linkedin-content #status/done #sprint/60
