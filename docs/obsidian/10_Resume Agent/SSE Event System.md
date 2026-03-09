# SSE Event System

> Canonical source: `server/src/agents/types.ts` (PipelineSSEEvent union) and per-product `types.ts` files.

## Event Flow

```
pipeline_start
  -> stage_start (per agent phase)
    -> transparency (activity updates)
    -> questionnaire (user input needed)
    -> positioning_question (interview)
    -> pipeline_gate (pause for user)
    -> section_context + section_draft (content)
    -> section_revised / section_approved
    -> quality_scores
  -> stage_complete
-> pipeline_complete | pipeline_error
```

## Resume Builder Events (Core)

| Event | Purpose | Interactive? |
|-------|---------|-------------|
| `stage_start` / `stage_complete` | Pipeline progress | No |
| `transparency` | Agent activity updates for feed | No |
| `positioning_question` | Interview questions | Yes |
| `questionnaire` | Structured input forms | Yes |
| `pipeline_gate` | Pause for user response | Yes |
| `blueprint_ready` | Blueprint for review | Yes |
| `section_draft` / `section_revised` | Section content | Yes |
| `section_context` | Evidence/keywords for workbench | No |
| `quality_scores` | Review results | No |
| `right_panel_update` | Panel content updates | No |
| `pipeline_complete` / `pipeline_error` | Terminal events | No |

## LinkedIn Content Events

Source: `server/src/agents/linkedin-content/types.ts`

| Event | When | Fields |
|-------|------|--------|
| `stage_start` / `stage_complete` | Phase boundaries | stage, message, duration_ms? |
| `transparency` | Agent activity | stage, message |
| `topics_ready` | Strategist suggests topics, gate triggered | session_id, topics: TopicSuggestion[] |
| `post_draft_ready` | Writer presents first draft | session_id, post: string, hashtags: string[], quality_scores: PostQualityScores, hook_score?: number, hook_type?: string, hook_assessment?: string |
| `post_revised` | Writer presents revised draft | session_id, post: string, hashtags: string[], quality_scores: PostQualityScores, hook_score?: number, hook_type?: string, hook_assessment?: string |
| `content_complete` | Pipeline finishes (terminal) | session_id, post: string, hashtags: string[], quality_scores: PostQualityScores, hook_score?: number, hook_type?: string, hook_assessment?: string |
| `pipeline_error` | Error | stage, error |

**PostQualityScores shape:**
```ts
{
  authenticity: number;       // 0-100: genuine voice, no buzzwords
  engagement_potential: number; // 0-100: hook strength, scannability, CTA
  keyword_density: number;    // 0-100: industry keyword coverage
}
```

**Hook analysis fields** (added Sprint 62): optional on all three post events.
- `hook_score` — 0-100; scores below 60 trigger coaching nudge in frontend
- `hook_type` — enum: contrarian, specific_number, story_opener, direct_challenge, vulnerable_admission, other
- `hook_assessment` — one sentence on why the hook works or how to improve it

## LinkedIn Profile Editor Events

Source: `server/src/agents/linkedin-editor/types.ts`

| Event | When | Fields |
|-------|------|--------|
| `stage_start` / `stage_complete` | Phase boundaries | stage, message, duration_ms? |
| `transparency` | Agent activity | stage, message |
| `section_draft_ready` | Section presented for review, gate triggered | session_id, section: ProfileSection, content: string, quality_scores: SectionQualityScores |
| `section_revised` | Revision presented, gate re-triggered | session_id, section: ProfileSection, content: string, quality_scores: SectionQualityScores |
| `section_approved` | User approves a section | session_id, section: ProfileSection |
| `editor_complete` | All sections done (terminal) | session_id, sections: Partial<Record<ProfileSection, string>> |
| `pipeline_error` | Error | stage, error |

**SectionQualityScores shape:**
```ts
{
  keyword_coverage: number;       // 0-100
  readability: number;            // 0-100
  positioning_alignment: number;  // 0-100
}
```

**ProfileSection** enum: `'headline' | 'about' | 'experience' | 'skills' | 'education'`

## Networking Outreach Events

Source: `server/src/agents/networking-outreach/types.ts`

| Event | When | Fields |
|-------|------|--------|
| `stage_start` / `stage_complete` | Phase boundaries | stage, message, duration_ms? |
| `transparency` | Agent activity | stage, message |
| `message_progress` | Each message being drafted | message_type: OutreachMessageType, status: 'drafting' \| 'reviewing' \| 'complete' |
| `sequence_complete` | Sequence assembled (terminal) | session_id, report: string, quality_score: number, message_count: number |
| `pipeline_error` | Error | stage, error |

**OutreachMessageType** enum: `'connection_request' | 'follow_up_1' | 'follow_up_2' | 'value_offer' | 'meeting_request'`

**MessagingMethod** (added Sprint 63): `'group_message' | 'connection_request' | 'inmail'` — determines char limits injected into writer context.

| Method | Max Chars | Best For |
|--------|-----------|---------|
| `group_message` | 8,000 | Shared LinkedIn group members (free, preferred) |
| `connection_request` | 300 | Direct cold connection with note |
| `inmail` | 1,900 | High-value targets, no shared groups (uses credits) |

## Retirement Bridge Events

Source: `server/src/agents/retirement-bridge/types.ts`

| Event | When | Fields |
|-------|------|--------|
| `stage_start` / `stage_complete` | Phase boundaries | stage, message, duration_ms? |
| `transparency` | Agent activity | stage, message |
| `questions_ready` | Questions generated, gate triggered | questions: RetirementQuestion[] |
| `assessment_complete` | Summary built (terminal) | session_id, summary: RetirementReadinessSummary |
| `pipeline_error` | Error | stage, error |

## Job Finder Events

Source: `server/src/agents/job-finder/types.ts`

| Event | When | Fields |
|-------|------|--------|
| `stage_start` / `stage_complete` | Phase boundaries | stage, message, duration_ms? |
| `transparency` | Agent activity | stage, message |
| `search_progress` | Each search source completes | source: string, jobs_found: number, companies_scanned?: number |
| `match_found` | Top 5 ranked results emitted | title, company, source, match_score |
| `results_ready` | Ranking complete, gate triggered | total_matches, top_fit_score |
| `job_finder_complete` | Results persisted (terminal) | session_id, ranked_count, promoted_count |
| `pipeline_error` | Error | stage, error |

## Panel Types

11 panel types dispatched by `panel-renderer.tsx`:

| Panel | Component |
|-------|-----------|
| `onboarding_summary` | OnboardingSummaryPanel |
| `research_dashboard` | ResearchDashboardPanel |
| `gap_analysis` | GapAnalysisPanel |
| `design_options` | DesignOptionsPanel |
| `live_resume` | LiveResumePanel |
| `quality_dashboard` | QualityDashboardPanel |
| `completion` | CompletionPanel |
| `positioning_interview` | PositioningInterviewPanel |
| `blueprint_review` | BlueprintReviewPanel |
| `section_review` | SectionWorkbench |
| `questionnaire` | QuestionnairePanel |

## Gate Protocol

1. `waitForUser(gateName)` pauses pipeline
2. SSE event sent to frontend (gate-specific event type)
3. User interacts with panel
4. Frontend calls `POST /api/<product>/respond` with response
5. Pipeline resumes with user data

## Related

- [[Architecture Overview]]
- [[Project Hub]]
- [[LinkedIn Content Writer]]
- [[LinkedIn Profile Editor]]
- [[Networking Outreach]]
- [[Retirement Bridge]]
- [[Job Finder]]

#type/spec
