# drift-check

Use this command before or during implementation when there is a risk of architectural drift.

## Review Questions

Inspect whether:

- the solution is shared or local using the `AGENTS.md` definition
- a local patch is hiding an upstream problem
- agent autonomy is being reduced
- UI code is absorbing domain logic
- a new schema or contract is being introduced
- evidence discipline is being weakened
- room-specific logic should be shared

## Output Format

- Drift Risk: Low / Medium / High
- Findings
- Recommended Correction
- Safe Next Step

Be direct. If the current approach is drifting, say so plainly and point to the shared contract or architectural layer that should absorb the fix instead.
