# Prompt: Transparency Protocol

**Agent:** #agent/strategist #agent/craftsman #agent/producer
**Model tier:** ORCHESTRATOR (loop-level, not per-call)
**Last updated:** 2026-03-09

## Purpose

Keeps the user informed during long AI operations by requiring the agent to emit progress updates that explain WHY something is happening, not just WHAT. Prevents the experience of silence feeling like failure during 2-5 minute processing windows.

All three resume agents (Strategist, Craftsman, Producer) include a `## Transparency Protocol` section in their system prompts. The pattern is consistent across agents and is the primary mechanism for the `IntelligenceActivityFeed` component in the frontend.

## System Prompt (Strategist version)

```
## Transparency Protocol

Emit at least one transparency update every 30-60 seconds during long operations. Users
are watching a live process — silence feels like failure. Messages should explain WHY you
are doing something, not just WHAT. Use actual data from the resume, JD, and research when
available. Always pair emit_transparency with your next substantive tool call to save
round-trips.
```

## System Prompt (Craftsman version — section-focused)

```
## Transparency Protocol

Emit at least one transparency update before starting each section and after completing
self-review. Users are watching the resume take shape — messages should explain what you
are doing and why, using the actual section name and evidence counts when available.

Before writing a section:
- "Analyzing the evidence library for [section name] — identifying the strongest proof
  points that map to [N] priority requirements..."
- "Drafting [section name] using [N] evidence items and the candidate's authentic phrasing.
  Targeting [keyword] and [keyword] for ATS coverage..."
- "Starting [section name] — the blueprint calls for [N] bullets emphasizing [strategic
  focus]. Leading with the strongest impact metric..."

During or after writing:
- "Drafted [section name]. Running self-review against [N] quality criteria — checking
  keyword coverage, anti-patterns, and evidence integrity..."
- "Self-review complete for [section name]: score [X]/10. [Criteria met / revisions needed
  for: specific area]..."

During revision:
- "Revising [section name] — strengthening [specific area] based on quality review
  findings. Targeting [keyword] coverage improvement..."

After a section passes:
- "[section name] passed all quality gates. Presenting to you for review..."
- "All [N] sections drafted and self-reviewed. Resume is ready for your review..."
```

## Key Techniques

1. **Data interpolation markers** — Templates include `[section name]`, `[N]`, `[keyword]` to force the agent to use actual values, not generic messages.

2. **Why + What pairing** — Every message explains reasoning, not just action. "Analyzing evidence library FOR [section] — identifying strongest proof points" beats "Analyzing evidence."

3. **Tool call pairing** — Agents are instructed to call `emit_transparency` in the same tool round as the next substantive tool (reduces round-trips on Groq where parallel tools are disabled).

4. **Phase guidance** — Strategist has timing (every 30-60s); Craftsman has phase guidance (before/during/after). Different cadences for different workflow shapes.

5. **Pacing via example messages** — Providing 8-10 example messages per phase in the prompt dramatically improves message quality over generic "be transparent" instructions.

## Frontend Integration

Transparency messages flow through the SSE system:
- Event type: `{ type: 'transparency', stage: string, message: string }`
- Accumulated in `usePipelineStateManager` (capped at 20 messages)
- Rendered in `IntelligenceActivityFeed` — scrollable feed, last 10 visible, graduated opacity
- Also triggered by `stage_start` and `stage_complete` events

## Variations Tested

- Generic "keep the user informed" — produces bland, unhelpful messages
- Example-heavy templates (current) — significantly more specific and useful messages
- Timing-constrained only (every 30s) — often too infrequent for section-writing phase
- Phase-specific cadence (current Craftsman approach) — best UX for section-by-section workflows

## Related

- [[Project Hub]]
- [[SSE Event System]] — `transparency` event
- [[Resume Builder]]

#type/prompt #sprint/16
