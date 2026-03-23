# session-start

Use this command at the beginning of any substantial implementation session.

## Required Reads

Read, in order:

1. `AGENTS.md`
2. `docs/CURRENT_SPRINT.md`
3. `docs/AI_OPERATING_MODEL.md`
4. `docs/CODEX_IMPLEMENTATION_GUARDRAILS.md`

If the task touches context shape, evidence, provenance, drafting, critique, or any AI-generated artifact behavior, also read:

5. `docs/SHARED_CONTEXT_CONTRACT.md`
6. `docs/SHARED_EVIDENCE_CONTRACT.md`

After the authority docs, read any feature-specific or room-specific reference docs directly relevant to the task.

## Output

After reading, summarize:

- current goal
- whether the task is shared or local using the `AGENTS.md` definition
- contracts affected
- likely risks
- first implementation step

Also explicitly check and state:

- whether the planned work is staying contract-driven rather than turning into a hardcoded wizard
- whether requirement taxonomy or coaching-policy logic is only classifying families, evidence expectations, fallback policy, and safety rules while still leaving phrasing and reasoning room for the agents

Keep the summary practical and specific to the task at hand.
