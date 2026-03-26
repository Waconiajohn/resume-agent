# drift-check

Use this command before or during implementation when there is a risk of architectural drift.

## Review Questions

Inspect whether:

- the solution is shared or local using the `AGENTS.md` definition
- a local patch is hiding an upstream problem
- agent autonomy is being reduced
- deterministic rescue logic is overwriting valid agent-owned priority, placement, provenance, or meaning
- UI code is absorbing domain logic
- requirement-target metadata is being confused with provenance
- a new schema or contract is being introduced
- evidence discipline is being weakened
- the workflow is presenting a fake gate even though the pipeline auto-continues
- one click is opening multiple edit or review surfaces
- room-specific logic should be shared

## Output Format

- Drift Risk: Low / Medium / High
- Findings
- Recommended Correction
- Safe Next Step

Be direct. If the current approach is drifting, say so plainly and point to the shared contract or architectural layer that should absorb the fix instead.
