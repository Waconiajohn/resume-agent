# CareerIQ v3 Rebuild — Operating Manual

**Version:** 1.1 (2026-04-18)
**Location:** `docs/v3-rebuild/OPERATING-MANUAL.md`
**Precedence:** This manual is authoritative for any work inside `server/src/v3/`, `server/prompts/`, `server/test-fixtures/`, or `docs/v3-rebuild/`. It overrides the following sections of the repo-root `CLAUDE.md` for v3-scoped work only:
- §3 (Agent-First Architecture Mandate) — v3 uses a five-stage pipeline, not an agent runtime
- §4 (Agent Integrity Mandate) — presumes the agent-loop architecture v3 replaces
- §7 (Scrum Workflow) — v3 uses phase kickoffs, not sprints
- §13 (mandatory skill list) — agent-tool-scaffold and sse-event-pipeline skills do not apply to v3; qa-gate, adr-writer, llm-prompt-lab, dead-code-hunter remain relevant
- §14 Prohibition #2 (package install requires prior documentation) — v3 permits autonomous install with phase-report documentation after the fact

All other platform rules (§§1-2, 5-6, 8-12, 15-18) apply to v3 work unchanged.

---

## What this project is

We are rebuilding the CareerIQ resume writer from scratch as a v3 pipeline at `server/src/v3/`, running alongside the existing v2 at `server/src/agents/resume-v2/`. The v3 pipeline replaces approximately 40 agents and ~8,000 lines of TypeScript with 5 stages and roughly 1,500 lines of code plus prompts.

The full plan lives in `docs/v3-rebuild/` (docs 00 through 06). Read all seven before starting any phase. They are the source of truth. This file is a condensed operating manual, not a replacement.

## The core principle

**LLMs handle semantic judgment. Code handles mechanical operations.**

If a decision requires understanding meaning, context, or intent, it is an LLM call. If a decision is purely mechanical (parsing a date string, stripping whitespace, writing JSON), it is code. This is not a preference. It is the architectural foundation.

Regex is acceptable for mechanical string operations. Regex is banned for deciding:
- Whether a block of text is a job entry, career gap note, or section header
- What discipline a candidate works in
- Whether a sentence is "sentence-shaped"
- Whether a company name is a parent umbrella or a standalone employer
- Any other question that requires reading comprehension

If you find yourself writing a regex to answer a semantic question, stop. That is an LLM call. If you are unsure whether a question is semantic or mechanical, assume semantic and route it to an LLM.

## The five stages

1. **Extract** — plaintext out of PDF/DOCX/text. No LLM. No semantics.
2. **Classify** — one LLM call produces structured resume JSON. All parsing judgment happens here.
3. **Strategize** — one LLM call produces positioning strategy for the target JD.
4. **Write** — parallel LLM calls, one per section, produce final content.
5. **Verify** — one LLM call gates quality.

Each stage has one responsibility and one output. Stages do not reach across boundaries. Downstream stages trust upstream output; if upstream is wrong, fix upstream, not downstream.

## Model routing — production runs on Vertex-hosted DeepSeek

This is the economic foundation of the product. CareerIQ retails at $49/month. At scale (multiple resumes per user per month), Opus-priced inference would destroy the margin. Vertex-hosted DeepSeek delivers roughly 1/20th the cost of Opus and approximately 207 tok/s — roughly 10-12x faster than DeepSeek direct.

All v3 stages must route through a provider factory respecting environment configuration, not by importing a specific provider class directly. Stages declare capability requirements in prompt frontmatter; the factory maps capability requirements to configured models per environment.

### Capability requests, not model names

Prompt YAML frontmatter specifies a capability, not a model name:

```yaml
---
stage: classify
capability: strong-reasoning
temperature: 0.2
---
```

Capabilities currently defined:
- `strong-reasoning` — classify, strategize, verify. Production routes to DeepSeek-on-Vertex; development may route to Opus.
- `fast-writer` — write-* section writers. Production routes to DeepSeek-on-Vertex; development may route to Sonnet.

Adding a new capability requires a Decision Log entry explaining why.

### The provider factory

All five LLM stages call through `server/src/v3/providers/factory.ts` (to be implemented). The factory reads `RESUME_V3_PROVIDER` and `RESUME_V3_*_MODEL` env vars and returns a configured provider that satisfies the requested capability. Production default: `vertex` with DeepSeek models. Development override: set env vars to route to Anthropic for comparison runs.

Stages **never** write `import { AnthropicProvider } from ...` or `new AnthropicProvider()`. That pattern is banned. If a stage needs a provider, it requests one from the factory.

### Vertex system-prompt merge

Vertex requires the first message to be role `'user'`, not `'system'`. The v2 `VertexProvider` at `server/src/lib/llm-provider.ts` handles this by merging the prompt's system message into the first user message with a specific separator pattern. v3 prompts are written as if they have separate system and user messages; the provider handles the merge transparently. Prompt authors do not need to special-case Vertex.

### Failover chain

Production failover chain mirrors v2: `RateLimitFailoverProvider(Vertex) → DeepInfra → DeepSeek direct`. On 429 rate-limit responses from Vertex, calls failover to DeepInfra automatically. The chain is visible in logs; failover is not silent, but it is not a user-facing error.

### Schema expansion — per-bullet metadata

v3's `StructuredResume` and `WrittenResume` carry per-bullet metadata matching v2's shape:

```typescript
interface Bullet {
  text: string;
  is_new: boolean;           // written by LLM vs. sourced from original resume
  source?: string;           // reference to source bullet if applicable
  evidence_found: boolean;   // whether a claim traces to source material
  confidence: number;        // 0.0-1.0
}
```

This metadata flows through all stages. Classify populates it during parsing. Write updates `is_new=true` and records `source` references when rewriting. Verify uses the metadata to check claim attribution.

Earlier v3 designs dropped this metadata. That was an error — it meant verify could not check whether claims traced to source material, which is exactly the kind of quality gate verify exists to provide. The metadata is now part of the schema.

### Custom sections

v3 supports custom resume sections beyond the fixed set (summary, accomplishments, competencies, experience, education). Executive resumes routinely include Board Service, Speaking Engagements, Patents, Publications, or similar sections. Classify identifies custom-section candidates from source material; write has a generic section writer that handles them.

This was not in earlier v3 designs. v2 supported custom sections; dropping them in v3 would have shipped a regression for the target executive market. The capability is now in scope for Phase 4.

### Executive soft skills in competencies

v3 allows executive soft skills in the competencies section when framed appropriately. Earlier v3 designs banned them outright. That was an over-correction based on a "no fluff" instinct; in practice, senior executive resumes legitimately include competencies like "strategic vision," "organizational transformation," and "board engagement." ATS systems look for these terms. Banning them shipped worse output than v2.

The competencies write prompt now enforces framing requirements (soft skills must be concrete, role-appropriate, non-generic) rather than banning soft skills wholesale. The framing rules port from v2's COMPETENCIES prompt.

## Shared prompt scaffolding

v2 splices shared rule blocks (`${SOURCE_DISCIPLINE}`, `${JSON_RULES}`) into every prompt from a central location in `knowledge/resume-rules.ts`. One edit propagates to all prompts. This is a real engineering win and v3 preserves it.

v3's prompt loader supports interpolation. Shared rule blocks live in `server/prompts/_shared/` as `.md` fragments. Stage prompts reference them via `{{shared:json-rules}}` or similar syntax. The loader resolves references at load time.

When a rule applies to multiple stages (JSON output format, pronoun policy, common writing constraints), it lives in `_shared/`. When a rule is stage-specific, it stays in the stage prompt. Each shared fragment has its own `<!-- Why: -->` comment explaining the rule's purpose.

## Prompt patterns ported from v2

v2's prompts have been production-tested against DeepSeek-on-Vertex for months. v3 prompts adopt the following patterns where applicable:

**Role-playing openers.** Every prompt starts "You are a [senior/world-class/forensic] X..." rather than "Your task is Y." Role framing produces more reliable output on DeepSeek than abstract task description.

**✓/✗ contrasts over abstract rules.** Teach via concrete good-vs-bad example pairs rather than prose rules. A prompt that says "✓ Correct: 'Led $40M transformation.' ✗ Wrong: 'Was responsible for transformation activities.'" outperforms one that says "Use active voice with specific metrics." DeepSeek especially benefits from this pattern.

**Defensive JSON extraction with retry.** Every LLM call that produces JSON sets `response_format: { type: 'json_object' }` where supported. On JSON parse failure, the provider layer does one targeted retry with the parser error fed back as system-message context. After retry failure, the error surfaces loudly. This is not a silent fallback — it is an explicit retry with context, visible in logs.

**Fence stripping before JSON parse.** DeepSeek and Sonnet both sometimes wrap JSON in markdown code fences despite instructions not to. The provider layer strips ``` fences mechanically before handing the response to `JSON.parse`. This is a mechanical operation, not semantic correction.

## Non-negotiables

- **No silent fallbacks.** If a stage fails definitively (after the one targeted JSON retry), fail loudly and surface the error. The v2 system fell back to deterministic stubs for weeks when Vertex auth expired. That cannot happen again.
- **No guardrail functions.** If a downstream stage needs to "clean up" or "filter" or "backfill" upstream output, the upstream prompt is wrong. Fix the prompt. If you catch yourself writing a function named `filter*`, `sanitize*`, `ensure*`, `coerce*`, `salvage*`, `derive*`, or `trim*ArtifactsFrom*`, stop and ask whether the upstream stage should have produced correct output.
- **No regex for semantic decisions.** See the core principle.
- **Every prompt is a first-class file.** Prompts live in `server/prompts/` as `.md` files with YAML frontmatter. No prompt ever exists as an inline string in TypeScript.
- **Every prompt rule has a "why" comment.** When you add a rule, add an HTML comment below it explaining the failure mode it prevents.
- **Fixtures are the quality gate.** Every change runs against all fixtures in `server/test-fixtures/resumes/` before merge.
- **v3 never imports from v2's agent code.** The `server/src/v3/` tree has zero imports from `server/src/agents/resume-v2/`. v3 does use platform infrastructure in `server/src/lib/` (provider classes, auth helpers, logger) — that's shared, not v2-specific.
- **Stages route through the provider factory, not direct provider imports.** No `new AnthropicProvider()`, `new VertexProvider()`, or equivalent in stage code.

## What you should do autonomously

You are running with `--dangerously-skip-permissions`. Use it. Do not ask for approval on:

- Creating, reading, editing files within `server/src/v3/`, `server/prompts/`, `server/test-fixtures/`, `docs/v3-rebuild/`
- Installing npm packages needed for v3 (propose and install; note in phase report)
- Running tests, the fixture suite, linters, type checks
- Creating commits on the `rebuild/v3` branch
- Iterating on prompts based on fixture results

## What you should not do without asking

- Deleting files (other than scratch work in v3)
- Modifying anything in `server/src/agents/resume-v2/`
- Modifying anything outside v3-scoped paths and this manual
- Force-pushing, rebasing onto main
- Running database migrations
- Incurring non-trivial LLM cost (the cost profile is now ~1/20th of Opus thanks to DeepSeek routing, but a full 19-fixture run across all five stages with prompt iteration can still hit a few dollars; batch iterations meaningfully)
- Committing secrets, API keys, or unredacted fixture PII

## Phase report format

Every phase ends with a report at `docs/v3-rebuild/reports/phase-N-report.md`:

1. **What I built.** File list with one-line descriptions.
2. **What works.** Evidence: fixture pass rates, successful runs, example outputs.
3. **What is uncertain.** Places where you made a judgment call the human should review.
4. **What I deferred.** Anything chosen not to do, and why.
5. **Next phase prerequisites.** What must be true before the next phase starts.
6. **Questions for the human.** Explicit list.

Do not skip the "what is uncertain" section. If certainty on everything, you are not paying attention.

## Handling ambiguity

If a prompt rule in the docs contradicts something you observe in a fixture, note it in the phase report. Do not silently resolve it.

If you find a bug in v2 while inspecting it for reference, log it in the phase report. Do not fix it. v2 is not in scope except as reference material.

If you find a better architectural idea mid-phase, stop and propose it in the phase report. Do not change the architecture unilaterally.

## The one thing to remember

Every time you are tempted to add defensive code to handle bad upstream output, remember: v2 has seventeen guardrail functions and still produces phantom positions, concatenation artifacts, and pronoun mismatches. Guardrails do not work. Correct upstream prompts do.

Fix the prompt. Delete the guardrail. That is the entire architectural thesis.
