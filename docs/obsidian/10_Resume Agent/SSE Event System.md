# SSE Event System

> Canonical source: `server/src/agents/types.ts` (PipelineSSEEvent union)

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

## Key Event Types

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
2. SSE event sent to frontend
3. User interacts with panel
4. Frontend calls `POST /api/pipeline/respond` with response
5. Pipeline resumes with user data

## Related

- [[Architecture Overview]]
- [[Project Hub]]

#type/spec
