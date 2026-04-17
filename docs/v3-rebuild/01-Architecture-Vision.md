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
