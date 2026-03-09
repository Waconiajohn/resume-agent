# Prompt: Creative Authority

**Agent:** #agent/craftsman
**Model tier:** PRIMARY (section writing)
**Last updated:** 2026-03-09

## Purpose

Gives the Craftsman explicit creative freedom within the strategic guardrails set by the Strategist's blueprint. Without this section, the agent tends to execute blueprint instructions mechanically rather than making narrative and stylistic decisions like a skilled writer.

## System Prompt (from CRAFTSMAN_SYSTEM_PROMPT)

```
## Your Creative Authority

You are a writer, not an executor. The blueprint gives you the strategy — the positioning
angle, the evidence priorities, the narrative arc. You decide:
- Which evidence is most compelling for each bullet
- How to structure the narrative within each section
- Which authentic phrases to weave in and where
- How to build momentum across the section

If the blueprint provides evidence_priorities (strategic mode), you have full creative
freedom within the strategic guardrails. The priorities tell you WHAT requirements to
address and which evidence is available. You decide HOW to write each bullet.

If the blueprint provides bullets_to_write (legacy mode), treat them as guidance —
improve for narrative impact and authentic voice rather than executing them mechanically.
```

## Context: Two Blueprint Modes

The Craftsman handles two blueprint formats (introduced as part of Dynamic Pipeline Phase 3):

### Strategic Mode (evidence_priorities)
The blueprint provides `EvidencePriority` objects — each specifying:
- `requirement` — the JD requirement to address
- `available_evidence[]` — evidence items from the interview and resume
- `importance` — critical/important/supporting
- `narrative_note?` — strategic guidance from the Strategist

In this mode the Craftsman has maximum creative freedom. It knows WHAT to address and WHAT evidence is available, but decides HOW to write every word.

### Legacy Mode (bullets_to_write)
The blueprint provides specific bullet drafts. The Craftsman is instructed to improve these for narrative impact rather than execute them mechanically. This prevents robotic transcription of blueprint bullets.

## Key Techniques

1. **Writer framing** — "You are a writer, not an executor" reframes the agent's role from instruction-follower to creative decision-maker. This consistently produces more fluid, narrative-driven content.

2. **Decision authority list** — Explicitly listing what the Craftsman decides (evidence selection, structure, phrase placement, momentum) prevents the agent from deferring those decisions back to the blueprint.

3. **Backward compatibility** — The two-mode design means old blueprints (bullets_to_write) still work but are treated as guidance, while new strategic blueprints get maximum creative engagement.

4. **Authentic voice companion** — Companion to the "Using the Candidate's Voice" prompt section, which instructs the Craftsman to use the interview transcript as raw material and preserve candidate phrasing.

## Interaction with Evidence Priorities

The `EvidencePriority` interface (in `types.ts`) was introduced in Sprint 13 / Dynamic Pipeline Phase 3:

```ts
interface EvidencePriority {
  requirement: string;
  available_evidence: string[];
  importance: 'critical' | 'important' | 'supporting';
  narrative_note?: string;
}
```

The `hasEvidencePriorities()` function in `craftsman/tools.ts` detects which mode the blueprint is using and branches the section-writing prompt accordingly.

## Variations Tested

- No creative authority section — agent mechanically transcribes blueprint bullets, flat voice
- Overspecified creative authority — agent ignores quality checks ("I decide everything")
- Current version — correct balance: creative freedom within evidence-integrity and quality constraints

## Related

- [[Project Hub]]
- [[Resume Builder]]
- [[Self-Review Loop]] — creative freedom paired with quality gate constraints
- [[Transparency Protocol]] — transparency emitted around creative decisions

#type/prompt #sprint/13
