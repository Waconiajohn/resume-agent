# agent-review

Use this command when reviewing whether a proposed change still fits the intended agentic architecture.

## Review Questions

Review whether the change:

- preserves agent domain ownership
- avoids brittle procedural sequencing
- keeps prompts as structured guidance rather than rigid scripts
- preserves evidence and context contract integrity
- avoids hidden tool pipelines
- improves user-facing artifact quality

## Output Format

- Agent Scope
- Autonomy Impact
- Contract Impact
- Evidence Impact
- Risks
- Recommendation

If the change is pushing domain reasoning into UI code or turning agents into scripted pipeline workers, call that out explicitly.
