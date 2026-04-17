# 04 — Decision Log

This document records architectural decisions made during the v3 rearchitecture. Each entry captures what was decided, why, and what alternatives were considered.

The purpose is to preserve reasoning. Six months from now, when someone asks "why did we do X instead of Y," the answer lives here.

## Entry format

Each entry follows this structure:

```
## [Date] — [Title]

**Decision:** [One sentence statement of what we decided]

**Context:** [Brief description of the situation requiring a decision]

**Options considered:**
- Option A: [description, pros, cons]
- Option B: [description, pros, cons]
- Option C: [description, pros, cons]

**Decision made:** [Which option, with the key reasoning]

**Consequences:** [What this enables, what this forecloses, what we'll need to revisit]
```

---

## 2026-04-17 — Turn resume writer into a v3 rearchitecture project

**Decision:** Rather than continue patching the v2 resume writer, we will build a v3 replacement from scratch based on an LLM-first architecture, running in parallel with v2 until v3 proves equivalent or better on all fixtures.

**Context:** During an extended debugging session on April 17, 2026, we identified and fixed eight separate bugs in the v2 resume writer (Vertex auth, experience timeout, phantom positions, education blob, pronouns, discipline regex, concatenation artifacts, backfill). Each fix was a patch over bad upstream output rather than a root-cause fix. The pattern of "guardrail to fix guardrail" indicated the architecture itself was the problem.

**Options considered:**

- **Option A: Continue patching v2.** Pros: incremental, no risk of big rewrite. Cons: each patch creates more complexity; at ~40 agents and 20+ guardrails, the system is harder to reason about each week; "manufacturing operations" type bugs will keep appearing.

- **Option B: Rewrite v2 in place.** Pros: single codebase. Cons: no rollback; high risk; blocks new work during rewrite.

- **Option C: Build v3 alongside v2, shadow deploy, cut over when proven.** Pros: clean architectural restart; no production risk; v2 keeps running; rollback is instant. Cons: temporary complexity (two systems); requires fixture suite upfront.

**Decision made:** Option C. The cost of temporary dual-system complexity is lower than the cost of either continued patching or risky in-place rewriting. The fixture suite is a prerequisite regardless and becomes the quality gate.

**Consequences:**
- Fixture suite must be built before any v3 code (Week 0 prerequisite)
- V2 stays in production for 3-4 weeks while v3 is built
- After cutover, v2 code gets deleted — not kept as legacy
- Other CareerIQ agents (cover letter, LinkedIn, interview prep) are unaffected by this project

---

## 2026-04-17 — LLMs handle semantic judgment; code handles mechanical operations

**Decision:** The core design principle for v3 is that regex and keyword matching are banned for semantic decisions. Any decision requiring understanding of meaning, context, or intent is an LLM call.

**Context:** The v2 system uses regex for "is this a job entry?", "what discipline is this candidate in?", "is this sentence-shaped?", and dozens of other semantic questions. These fail frequently — the "manufacturing operations" regex returning true for any resume with "operations" in it is typical. Each failure generates another guardrail, which generates another failure mode.

**Options considered:**

- **Option A: Better regex.** Pros: cheap, fast, deterministic. Cons: semantic questions have infinite edge cases; we'd spend forever tuning patterns that still break on new resumes.

- **Option B: Rule engines.** Pros: more expressive than regex. Cons: still pattern matching; still breaks on novel inputs; adds new complexity.

- **Option C: LLMs for semantic decisions.** Pros: handles novel inputs gracefully; one call replaces many rules; easier to improve (prompt edit vs. pattern library). Cons: cost per call; latency; requires good prompts.

**Decision made:** Option C. LLMs are now cheap enough and fast enough that the tradeoff favors them for any semantic decision. Stage 2 (classify) is one call that replaces the entire current parsing layer.

**Consequences:**
- Stage 2 requires a strong model (Claude Opus 4.7 or equivalent) and a carefully crafted prompt
- Prompt quality becomes the main lever for output quality
- Prompt library structure (document 03) becomes a critical artifact
- Fixtures verify that LLM classification is reliable across resume types

---

## 2026-04-17 — Prompts become first-class files, not string literals

**Decision:** All prompts live in `server/prompts/*.md` with YAML frontmatter for versioning and metadata. No prompt ever again exists as an inline string in TypeScript.

**Context:** Current v2 prompts are string literals scattered across TypeScript files. Editing a prompt requires a full deploy. There's no version history distinct from code history. Non-engineers can't contribute to prompts. Rules accumulate without context on why they exist.

**Options considered:**

- **Option A: Keep prompts as strings.** Status quo. Cons noted above.

- **Option B: Move prompts to .md files with metadata.** Pros: editable without redeploy (prompt loader reads from disk or config); versioned independently; reviewable; supports comments explaining rules. Cons: adds a loader layer.

- **Option C: Store prompts in a database.** Pros: edit via UI. Cons: adds infrastructure; harder to diff; changes aren't in git history.

**Decision made:** Option B. The loader layer is simple. The benefits (review, versioning, comments, A/B testing) are substantial. Git is the right store for prompts because prompts are effectively code.

**Consequences:**
- Every prompt has a "why" comment next to every rule (see document 03)
- Version bumps are semantically meaningful (major/minor/patch)
- Archive directory preserves old versions for reference
- Fixture suite can run with `--prompt-variant` flag for A/B testing

---

## 2026-04-17 — Fixture-first development is non-negotiable

**Decision:** Before any v3 code is written, a fixture suite of 15-20 real resumes must exist with expected-output snapshots. Every v3 change runs against all fixtures before merge.

**Context:** V2 was debugged manually by running Tatiana's resume repeatedly and eyeballing the output. This doesn't scale. A regression on another candidate would go unnoticed until that candidate reported it.

**Options considered:**

- **Option A: Unit tests only.** Pros: fast. Cons: can't test LLM-based pipelines meaningfully; semantic output doesn't match fixed assertions.

- **Option B: Manual QA.** Pros: flexible. Cons: doesn't scale; doesn't catch regressions between runs.

- **Option C: Snapshot-based fixture suite.** Pros: catches regressions; covers real-world diversity; enables confident refactoring. Cons: upfront cost to build; requires judgment on what constitutes "pass" vs. "acceptable difference."

**Decision made:** Option C. The upfront cost is ~2 days of work. The alternative is forever chasing bugs that were caught by earlier runs that broke later.

**Consequences:**
- Week 0 of the migration is dedicated to fixture creation
- Fixtures include diverse cases: executive, mid-career, consultant, international, technical, non-technical, gender-diverse, career gaps, sub-roles
- Every fixture has a baseline snapshot from the current v2 system
- V3 must match or exceed v2 on every fixture before proceeding to next week

---

## [Template for future entries]

## [YYYY-MM-DD] — [Title]

**Decision:**

**Context:**

**Options considered:**

**Decision made:**

**Consequences:**
