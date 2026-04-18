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

## 2026-04-18 — Production routes through Vertex-hosted DeepSeek, not Anthropic models

**Decision:** All v3 LLM stages route through a provider factory that respects environment configuration. Production default is Vertex-hosted DeepSeek. Development environments can override to Anthropic models for comparison runs, but stages never import a specific provider class directly.

**Context:** Phases 1-4 of the v3 rebuild were executed assuming stages would call Anthropic models (Opus for classify/strategize/verify, Sonnet for write-*). On 2026-04-18, during Phase 4 pilot validation, John clarified that CareerIQ production has run on Vertex-hosted DeepSeek since well before the v3 rebuild started. This is not a casual technical preference — it is the economic foundation of the product.

CareerIQ retails at $49/month. At scale (multiple resumes per user per month), Opus-priced inference destroys the margin. Vertex-hosted DeepSeek delivers roughly 1/20th the cost of Opus and approximately 207 tok/s (10-12x faster than DeepSeek direct). v2 encoded months of prompt engineering specifically tuned for DeepSeek-on-Vertex behavior.

The initial v3 planning documents (docs 00-05) mentioned "the Vertex/DeepSeek/Groq failover" as existing infrastructure worth preserving but did not make Vertex-DeepSeek the explicit production target. This decision closes that gap.

**Options considered:**

- **Option A: Hardcode Vertex-DeepSeek in v3 stages.** Pros: simple, matches v2. Cons: loses the ability to run Opus in dev for comparison / debugging; makes model changes require code changes.

- **Option B: Capability-based routing through a provider factory.** Stages declare what kind of model they need (`strong-reasoning`, `fast-writer`); factory maps capability to configured model per environment. Pros: dev can run Opus, production runs DeepSeek, switching is an env var. Cons: slightly more infrastructure.

- **Option C: Continue the current hardcoded-AnthropicProvider pattern.** Requires a separate "production port" project later. Cons: wastes the Phase 3 and Phase 4 work, delays production-realism validation to the end where problems are expensive.

**Decision made:** Option B. The infrastructure cost is small (one factory file, env-var-driven), and the architectural benefit is large: all five stages swap production models with one config change. Dev can run Opus for prompt debugging; production runs DeepSeek; everything else stays identical.

**Consequences:**
- `server/src/v3/providers/factory.ts` becomes a required component
- All five stage implementations (classify, strategize, write-*, verify) refactor their provider imports to use the factory
- Prompt YAML frontmatter changes from `model: claude-opus-4-7` to `capability: strong-reasoning`
- v2's `VertexProvider`, `getVertexAccessToken` (service account JWT), and `RateLimitFailoverProvider` are all keeper components; v3 reuses them via the factory
- Phase 4 work committed on `v3-phase4-opus-prototype` tag needs provider refactor before shipping
- Classify (Phase 3) has the same hardcoded-AnthropicProvider issue and needs the same refactor
- All five stages need fixture re-validation on DeepSeek-on-Vertex before Phase 5 shadow deployment

---

## 2026-04-18 — StructuredResume and WrittenResume carry per-bullet metadata (is_new, source, evidence_found, confidence)

**Decision:** Every bullet in v3's resume data structures carries metadata matching v2's shape: `is_new` (LLM-written vs. sourced), `source` (reference to original bullet if applicable), `evidence_found` (whether claim traces to source material), `confidence` (0.0-1.0). This metadata flows through all stages and is used by verify to check claim attribution.

**Context:** The v2 prompt and Vertex integration inventory (commit f80630f0) surfaced that v2 tracks rich per-bullet metadata through its pipeline, but v3's `StructuredResume` schema only carries `confidence` on source bullets and drops the rest. Claude Code flagged this as "verify loses attribution data it could use."

The inventory is correct. Verify's job is to check that claims trace to source material. Without `is_new` and `source` references, verify cannot distinguish "LLM invented this metric" from "LLM rewrote a sourced bullet." Dropping the metadata means verify is a weaker quality gate than it should be, and weaker than v2's equivalent.

The original v3 schema was my oversight — I modeled the bullet type narrowly without accounting for what verify would need to do with it. The inventory caught it.

**Options considered:**

- **Option A: Keep the narrow v3 schema; have verify infer attribution from content similarity.** Pros: smaller schema. Cons: similarity-based attribution is fuzzy; verify becomes a weaker check; we'd be asking verify to do LLM-based work to reconstruct information we threw away.

- **Option B: Match v2's schema exactly.** Pros: verify can do its job; maintains parity with what v2 already does well; simplifies the port of verify logic. Cons: larger schema, slight overhead in classify and write to populate metadata correctly.

**Decision made:** Option B. Verify is one of the two load-bearing quality gates in v3 (classify being the other). Weakening verify to simplify the schema is the wrong tradeoff. The metadata is cheap to carry.

**Consequences:**
- `Bullet` type in `server/src/v3/types.ts` expands to include `is_new`, `source`, `evidence_found`, `confidence`
- Zod schema in `server/src/v3/classify/schema.ts` updates to match
- Classify prompt is updated to populate metadata during parsing (source bullets get `is_new: false`, original confidence carried through)
- Write prompts are updated to emit metadata for rewritten bullets (`is_new: true`, `source` reference to the bullet it's rewriting, fresh confidence based on how much evidence is in the source)
- Verify prompt is updated to use the metadata for attribution checks (every `is_new: true` bullet's claim must trace to source content via the `source` reference)
- Phase 4 work on `v3-phase4-opus-prototype` needs schema updates before porting to DeepSeek-on-Vertex

---

## 2026-04-18 — Reversing the "v3 bans executive soft skills in competencies" decision; adding custom sections capability

**Decision:** v3's competencies section allows executive soft skills with framing requirements ported from v2. v3 supports custom resume sections (Board Service, Speaking Engagements, Patents, Publications, etc.) via a generic section writer. Both of these reverse earlier v3 design decisions.

**Context:** The v2 prompt inventory (commit f80630f0) surfaced two real divergences from v2 where v3 was shipping worse output by design:

1. **Competencies soft skills.** v2's COMPETENCIES prompt allowed executive soft skills with narrative framing; v3's `write-competencies.v1.md` banned them outright. My reasoning when I wrote the v3 rule was "no fluff, no generic terms." In practice, senior executive resumes legitimately include competencies like "strategic vision," "organizational transformation," "board engagement." ATS systems look for these terms. Banning them made v3 worse than v2 on the target executive market.

2. **Custom sections.** v2 supported arbitrary custom sections via its `CUSTOM_SECTIONS` writer; v3 assumed a fixed section set (summary, accomplishments, competencies, experience, education). Senior executives routinely have Board Service, Speaking Engagements, Patents, or Publications sections. v3 as designed would have shipped without this capability — a regression from v2.

Both decisions were mine. Both were wrong. The inventory caught them before they shipped.

**Options considered for competencies soft skills:**

- **Option A: Keep the v3 ban.** Defend the "no fluff" instinct. Cons: ships worse ATS output than v2; mismatches what executive resumes actually need.
- **Option B: Port v2's framing rules.** v2 allows soft skills when they are concrete, role-appropriate, and non-generic. Reject "team player" and "results-driven"; accept "enterprise program leadership" and "organizational transformation." Pros: matches what v2 already does well; matches market reality. Cons: requires porting the framing rules correctly.

**Decision made for competencies:** Option B. Port v2's framing rules to `write-competencies` in v3. The prompt enforces framing quality (concrete, role-appropriate, non-generic) rather than banning soft skills wholesale.

**Options considered for custom sections:**

- **Option A: Keep v3's fixed section set.** Add custom sections in a future phase. Cons: ships a regression from v2; target market needs custom sections.
- **Option B: Add custom sections to v3 Phase 4.** Classify identifies custom-section candidates from source material; write has a generic section writer that handles them. Cons: scope increase for Phase 4.
- **Option C: Add custom sections as a Phase 5 or post-launch feature.** Cons: means beta / early users see a v3 that's worse than v2 at the feature level.

**Decision made for custom sections:** Option B. Add to Phase 4 scope. The cost is one additional prompt file (`write-custom-section.v1.md`) and a small classify prompt update to emit custom-section candidates. Not adding it means v3 ships a known regression against the target market.

**Consequences:**
- `write-competencies.v1.md` is rewritten to allow soft skills with framing rules ported from v2
- `write-custom-section.v1.md` is added to Phase 4 scope
- Classify schema expands to include `customSections: Array<{ title: string, entries: Array<...> }>` or equivalent
- `StructuredResume` and `WrittenResume` types expand to carry custom sections
- Phase 4 work on `v3-phase4-opus-prototype` needs both updates before porting to DeepSeek-on-Vertex
- Decision-log honesty note: these decisions were initially overcorrections based on the "no fluff" instinct. The correct calibration is "no generic fluff, yes specific executive competencies and genuine custom-section content." Documenting this explicitly so future engineers don't re-introduce the same overcorrection.

---

## 2026-04-18 — Stage coupling is real; every claim-producing stage runs a mechanical attribution check before emitting

**Decision:** Every v3 stage that produces claims (quantitative, qualitative, proper-noun) which flow downstream to another stage MUST run a mechanical substring-attribution check against source material BEFORE emitting its output. If the check finds unattributed claims, the stage retries ONCE with structured context pointing at the offending phrases; a second failure surfaces as a loud error. This pattern is now the template for any future stage that produces content consumed by later stages.

**Context:** Phase 4.5 hybrid validation (see `docs/v3-rebuild/reports/phase-4.5-validation.md`) surfaced a class of bug that no single-stage quality check catches: **stage coupling.** The specific failure:

1. DeepSeek strategize emits `emphasizedAccomplishments.summary` fields that paraphrase source bullets with added causal framing ("by developing pricing strategies").
2. OpenAI write-position is faithful to its input context. It inherits the strategize framing verbatim into bullets.
3. Verify correctly flags the inherited phrases as fabrications — but by then the fabrication has flowed through one complete stage and been amplified.

In pure-DeepSeek (Phase 4 I3), write-DeepSeek was itself embellishing, so the signal was dominated by write-level embellishment and verify's flags looked like write issues. In pure-OpenAI (Phase 4 I4 diagnostic), strategize-OpenAI didn't embellish, so write had clean input and passed. **The hybrid was the configuration that made the coupling visible** by fixing the write side (OpenAI faithfulness) and exposing the upstream side (DeepSeek strategize embellishment).

The diagnostic insight: **one stage becoming more faithful exposes laxity in upstream stages that was previously masked by downstream sloppiness.** Every time we tighten a stage's output discipline, we need to check whether an upstream stage was relying on downstream sloppiness to absorb its embellishments.

**Options considered:**

- **Option A: Tighten the one failing prompt (strategize) and hope the coupling pattern doesn't recur.** Pros: smallest fix; passes this specific test. Cons: the next new stage (LinkedIn writer, cover letter, interview prep) will have the same coupling risk. Patch-by-patch, we keep re-learning the same lesson.

- **Option B: Mechanical attribution check at EVERY claim-producing boundary.** Pros: structural fix; the pattern is the template. Each stage gets responsible for not passing embellishments downstream. The check is cheap (substring match over normalized text, ~1ms per summary). Cons: a few hundred lines of additional code per stage (one extractor call + one retry wrapper).

- **Option C: Add a "superverify" stage that runs mechanical attribution across the whole pipeline's intermediate outputs.** Pros: centralized. Cons: complects the pipeline; turns each stage into a half-trusted source that needs external audit. The per-stage contract is cleaner.

**Decision made:** Option B. Each claim-producing stage owns its output's attribution.

**Consequences:**

- `server/src/v3/verify/attribution.ts` gains `checkStrategizeAttribution` alongside the Phase 4 I2 `checkAttributionMechanically` (written-bullet check). The extractor helpers are shared.
- `server/src/v3/strategize/index.ts` wraps its LLM call with a post-response attribution check + one-retry loop. Matches the JSON-parse-retry pattern already in `DefensiveJsonProvider`.
- `server/prompts/strategize.v1.md` → v1.2: adds Rule 1b (source-traceability contract) with `<!-- Why: -->` comment explicitly naming this Decision Log entry.
- **Pattern applies forward.** The next v3 stage that emits claims consumed downstream (e.g., a narrative layer for the cover letter product) gets the same treatment: mechanical attribution check + one retry + loud failure.
- Verify's own attribution check (Phase 4 I2) is now one instance of this general pattern, not a one-off. The architecture is:
  1. Stage produces output.
  2. Mechanical attribution check runs against source.
  3. If output has unattributed claims, retry ONCE with structured context.
  4. If retry also fails, throw loudly. No silent acceptance.
- Phase 4.6 Step A validated this works for strategize: **0/19 attribution retries fired** on the full fixture corpus, meaning strategize v1.2's prompt-level discipline was sufficient to pass the check on the first attempt. The retry is defense in depth, not load-bearing.
- Phase 4.6 Step A did NOT achieve the 14/19 threshold (11/19) because a SECOND issue class exists — verify LLM compliance with its own Rule 1 — which is orthogonal to stage coupling. That issue gets its own fix, documented separately.

**Limits of this principle:** The mechanical check's extractor is a heuristic. False positives (extracted phrases that differ from source by a function word like "the" or "of") can trigger the retry unnecessarily, or — in verify's case — produce LLM-side confusion when the verifier notices the match but the mechanical check didn't. The extractor needs ongoing calibration; the pattern itself is the architectural principle.

---

## [Template for future entries]

## [YYYY-MM-DD] — [Title]

**Decision:**

**Context:**

**Options considered:**

**Decision made:**

**Consequences:**
