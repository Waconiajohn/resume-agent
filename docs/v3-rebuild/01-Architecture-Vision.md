# 01 — Architecture Vision

## Core principle

**LLMs handle semantic judgment. Code handles mechanical operations.**

If a task requires understanding meaning, intent, or context, it belongs in an LLM call. If a task is purely mechanical — parsing a date string, stripping whitespace, writing JSON to a file — it belongs in code. Regex is acceptable for mechanical string operations. Regex is not acceptable for deciding whether a block of text is a job, a career gap note, a section header, or a company's legal name. Those are semantic questions.

This principle is the reason for every other decision in this architecture.

## The five stages

The entire resume pipeline collapses to five stages. Each stage has one clear responsibility and one clear output.

### Stage 1: Extract

Takes the user's raw resume (PDF, DOCX, or pasted text) and produces **plain structured text** with minimal formatting. No semantic interpretation. No "this is a job, this is education." Just clean text blocks with mechanical signals preserved — line breaks, dates visible as-is, bullet markers intact.

Responsibility: Get readable text out of whatever the user uploaded.

Input: File or pasted text.
Output: Clean plaintext with structural markers.

This stage is deterministic. It uses libraries like `mammoth` for DOCX and `pdf-parse` for PDF. No LLM calls.

### Stage 2: Classify

One LLM call takes the clean plaintext from Stage 1 and returns a **fully structured resume object**: contact info, positions (with title, company, dates, scope, bullets), education entries, certifications, skills. The LLM also returns a confidence score per field and flags any ambiguous content for review.

Responsibility: Turn text into structured data. All semantic judgment happens here.

Input: Clean plaintext.
Output: Structured resume JSON with per-field confidence scores.

This stage uses the strongest model available (Claude Opus or equivalent). The prompt explicitly instructs the model to distinguish real positions from career gap notes, parent-company headers, section dividers, and other non-position content. It also asks the model to identify the candidate's primary discipline in natural language.

No downstream stage second-guesses this output. If Stage 2 is wrong, we fix Stage 2's prompt, not patch it downstream.

### Stage 3: Strategize

One LLM call takes the structured resume from Stage 2 plus the target job description, and produces a **positioning strategy**: which accomplishments to surface, which roles to emphasize, how to frame the career arc for this specific JD, what objections a hiring manager might have and how the resume should preempt them.

Responsibility: Decide what story this resume should tell for this specific role.

Input: Structured resume + target JD.
Output: Strategy document (bullets to emphasize, framing, objection handling, target discipline).

This is where the Value Audit methodology lives in code. The strategy guides the writing — not as post-processing, but as the plan the writer executes.

### Stage 4: Write

Parallel LLM calls — one per resume section — produce the final written content using the strategy from Stage 3 and the structured data from Stage 2. Sections include summary, selected accomplishments, core competencies, and each position's bullets.

Responsibility: Write the actual resume content.

Input: Structured resume + strategy.
Output: Final resume content per section.

Each section call gets exactly the context it needs: the strategy for that section, the source material for that section, and the writing constraints. No guardrail post-processing. No defensive bullet trimming. The prompt produces clean output, or the prompt gets fixed.

### Stage 5: Verify

One LLM call reviews the final resume for factual accuracy (does every claim trace to source material?), style consistency, tone, and JD fit. Returns pass/fail with specific issues.

Responsibility: Last-mile quality gate.

Input: Final resume + original structured data.
Output: Pass/fail + issue list.

If verification fails, the user sees specific issues (not silent downgrade). They can regenerate a specific section or edit directly.

## What gets removed

Direct kills:
- Candidate Intelligence agent (merged into Stage 2)
- Benchmark Candidate agent (merged into Stage 3, simplified)
- Gap Analysis agent (merged into Stage 3)
- Source resume outline parser (replaced by Stage 2)
- Phantom filters at all three locations (not needed; Stage 2 doesn't produce phantoms)
- Bullet concatenation trimmer (not needed; Stage 4 doesn't produce concatenated bullets)
- Deduplicator (not needed; Stage 4 per-section writers don't duplicate)
- Backfill/coverage restorer (not needed; Stage 4 trusts its own output)
- Scope statement deriver (part of Stage 4 writing)
- Discipline regex (part of Stage 2 classification)
- `filterPhantomExperience`, `filterPhantomEducation` (not needed; Stage 2 output is trusted)
- `trimConcatenationArtifacts` (not needed)
- `ensureMinimumBulletCounts` (not needed)
- `deduplicateWithinRole` (not needed)
- All six "guardrail" functions in the current resume writer

Probable kills:
- Truth Verification as a separate stage (merged into Stage 5)
- Tone scoring as a separate stage (merged into Stage 5)
- ATS scoring (kept but simplified — mechanical keyword match only)
- Candidate Intelligence parallel passes
- `mergeCandidateExperienceWithSourceOutline`

Keep:
- The LLM provider abstraction (Vertex/DeepSeek/Groq with failover)
- The service account JWT auth (built today)
- The Chrome extension for job application auto-fill (unrelated to resume writer)
- The Supabase multi-user backend
- The kanban pipeline (unrelated)

## What gets rebuilt

### Prompts become first-class files

All prompts live in `server/prompts/` as `.md` files with YAML frontmatter:

```
---
stage: classify
version: 1.2
last_edited: 2026-04-18
notes: "Added explicit instruction for career gap detection"
---
[prompt body]
```

Versioning means we can A/B test prompt changes without deploying. Comments mean six months from now, anyone can read the prompt and know why each rule exists.

### Fixtures become the test suite

`server/test-fixtures/resumes/` contains 20+ real resumes (anonymized as needed) with expected-output snapshots. Every PR runs the pipeline against all fixtures automatically. Changes that regress on any fixture fail CI.

This is not optional. It is the difference between shipping and not shipping.

### Observability is explicit

Every stage logs inputs, outputs, and timing. Silent fallbacks are forbidden. If an LLM call fails, the user sees a clear error and the team gets alerted. There is one dashboard that shows: last 100 pipeline runs, success rate per stage, average latency per stage, error patterns.

## Shared prompt scaffolding

v2 splices shared rule blocks (`${SOURCE_DISCIPLINE}`, `${JSON_RULES}`, and others) into every prompt from a central location in `knowledge/resume-rules.ts`. One edit propagates across all prompts that reference the shared block. Nothing gets copy-pasted between prompts. This is genuine engineering value and v3 preserves it.

v3 implements this via the prompt loader. Shared rule blocks live in `server/prompts/_shared/` as `.md` fragments. Stage prompts reference them via a templating syntax (e.g., `{{shared:json-rules}}`). The loader resolves references at load time, producing the full expanded prompt that gets sent to the LLM.

When a rule applies to multiple stages — JSON output format, pronoun policy, common writing constraints, the shared discipline-derivation guidance — it lives in `_shared/`. When a rule is genuinely stage-specific, it stays in the stage prompt. Each shared fragment has its own `<!-- Why: -->` comment explaining the rule's purpose.

Example layout:
```
server/prompts/
├── _shared/
│   ├── json-rules.md           # defensive JSON output enforcement, retry protocol
│   ├── pronoun-policy.md       # active-voice defaults, candidate-name-based pronoun handling
│   ├── discipline-framing.md   # how to describe a candidate's professional discipline
│   └── README.md
├── classify.v1.md              # references {{shared:json-rules}}, {{shared:discipline-framing}}
├── strategize.v1.md            # references {{shared:json-rules}}
├── write-summary.v1.md         # references {{shared:pronoun-policy}}, {{shared:json-rules}}
├── ...
```

Shared fragments are versioned alongside stage prompts. Changing a shared fragment potentially affects many stages; the fixture suite catches regressions across all fixtures for all stages that reference the changed fragment.

## Prompt patterns ported from v2

v2's prompts are production-tested against Vertex-hosted DeepSeek. The patterns below appear consistently across v2 prompts and are proven to produce reliable output on that model. v3 prompts adopt them where applicable.

**Role-playing openers.** v2 prompts begin "You are a [senior/world-class/forensic] X..." rather than "Your task is Y." Role framing produces measurably more reliable output on DeepSeek than abstract task description. Every v3 prompt starts with a role-framed opener.

**✓/✗ contrasts over abstract rules.** v2 teaches via concrete example pairs — `✓ Correct: "Led $40M transformation program across three business units"` next to `✗ Wrong: "Was responsible for various transformation activities"`. This pattern outperforms prose rules in practice, especially on DeepSeek. v3 prompts use this pattern for every constraint that can be usefully exemplified.

**Defensive JSON extraction.** Every v2 prompt that produces JSON sets `response_format: { type: 'json_object' }` on the API call where supported. On JSON parse failure, v2 does one targeted retry with the parser error fed back as system-message context. v3 adopts this pattern at the provider layer so every stage benefits without duplicating logic. The retry is not a silent fallback — it is visible in logs and fails loudly if the second attempt also produces malformed JSON.

**Mechanical fence stripping.** Both DeepSeek and Sonnet occasionally wrap JSON output in ``` code fences despite explicit instructions not to. v2's provider strips fences mechanically before `JSON.parse`. v3 inherits this at the provider layer. This is a mechanical operation (regex-based string manipulation on a known unambiguous pattern), not a semantic correction — it belongs in code per the core principle.

**Per-bullet metadata through the pipeline.** v2 carries `is_new`, `source`, `evidence_found`, and `confidence` on every bullet from parsing through writing through verification. v3's schema matches this. See Decision Log entry 2026-04-18 on schema expansion.

**Custom sections as first-class capability.** v2's `CUSTOM_SECTIONS` writer handles Board Service, Speaking Engagements, Patents, and similar executive resume sections. v3 implements the same capability via a generic custom-section writer invoked when classify identifies a custom section in the source material.

## What this enables at the prompt layer

With shared scaffolding and v2 patterns in place, three things become meaningfully easier:

1. **Prompt quality improvements propagate.** A change to `_shared/json-rules.md` benefits every stage that emits JSON. A change to `_shared/pronoun-policy.md` benefits every stage that writes candidate-referencing prose. No more editing the same rule in five places.

2. **Model changes are localized.** If a future model change (e.g., a new DeepSeek version, or flipping dev to a different provider) requires updated prompt patterns, the updates happen in shared fragments and propagate to stage prompts automatically.

3. **A/B testing is cheap.** Creating a `classify.v2-test.md` that swaps out one shared fragment for a new version lets us test prompt changes across all dependent stages with a single variant flag. The fixture runner's `--prompt-variant` flag handles this today.

## What this enables

Once this architecture is in place, four things become much easier:

1. **Adding new roles or industries.** Currently, "manufacturing operations" is baked into a regex. In the new architecture, it's just text the LLM generates based on the actual resume content. A product manager in biotech gets "biotech product management" without a code change.

2. **Improving quality.** Today, improving summary quality means editing TypeScript, adding guardrail functions, and praying nothing else breaks. In the new architecture, it means editing a markdown file and running the fixture suite.

3. **Debugging production issues.** When a user reports "my resume looks wrong," we can see the exact stage output, the exact prompt version used, and the exact LLM response. We can regenerate with a tweaked prompt in 30 seconds.

4. **Onboarding a new engineer.** Today, understanding the resume writer requires reading 20+ files. In the new architecture, it's five stages, five prompts, one fixture suite.

## Non-negotiables repeated

These are restated from the executive summary because they're the rules that make this architecture work:

- **LLMs for semantic judgment. Code for mechanical operations.**
- **No silent fallbacks.**
- **Every prompt is versioned and commented.**
- **Every fixture passes before shipping.**
- **If a downstream stage needs a guardrail to handle upstream output, the upstream stage is wrong. Fix it there.**
