# 05 — Current State Audit

This document is an honest assessment of the v2 resume writer as it exists on April 17, 2026. It's here so that when we make decisions about what to remove, we have a clear record of what was there and why.

This audit is not a criticism of past work. It's a snapshot to inform future work.

## System scope

The v2 resume writer is one part of the CareerIQ platform. This audit covers only the resume generation pipeline. It does not cover:
- Chrome extension (job auto-fill)
- Kanban pipeline (job tracking)
- Supabase backend (auth, storage)
- Other agents (cover letter, LinkedIn optimizer, interview prep, etc.)

## Stages currently in the pipeline

Based on codebase exploration during the April 17 debugging session, the v2 resume writer includes (approximately) these stages, executed in sequence:

1. **Job Intelligence** — parses the target job description, extracts required skills, seniority, industry
2. **Candidate Intelligence** — parses the user's resume into structured data (experience, education, certifications, skills)
3. **Source Resume Outline** — deterministic regex-based parser that produces a parallel structured view of the resume for cross-validation
4. **Benchmark Candidate** — calls Perplexity for industry research on the role
5. **Gap Analysis** — compares candidate's experience against JD requirements
6. **Section Writer** — 5 parallel LLM calls generate summary, accomplishments, competencies, custom sections, and experience content
7. **Resume Writer Assembly** — assembles sections into the final resume structure, applies guardrails
8. **Truth Verification** — checks that claims trace to source material
9. **Tone Scoring** — scores the resume for tone
10. **ATS Scoring** — scores the resume for ATS compatibility
11. **Hiring Manager Scan** — final read-through

## Agents/modules count

Best estimate: 33-48 specialized agents, based on CLAUDE.md documentation and code exploration. Exact count requires a full audit.

## Guardrail functions identified

During debugging, we identified these post-processing guardrail functions:

- `filterPhantomExperience` — rejects phantom positions (6 rules after April 17 fixes)
- `filterPhantomEducation` — rejects phantom education entries (6 rules after April 17 fixes)
- `ensureMinimumBulletCounts` — backfills bullets from source when LLM writes too few
- `deduplicateWithinRole` — removes near-duplicate bullets
- `ensureBulletMetadata` — fills in missing metadata on bullets
- `ensureDatePopulation` — backfills missing or "undefined" date strings
- `trimConcatenationArtifacts` — truncates bullets at period+space+lowercase boundary
- `deriveSourceBackedDiscipline` — keyword-matches discipline from resume text
- `mergeCandidateExperienceWithSourceOutline` — reconciles two parallel parses
- `coerceExperienceArray` — type-coerces experience entries
- `coerceEducationArray` — type-coerces education entries
- `salvageEducationFromResume` — deterministic regex-based education extraction fallback
- `sanitizePlaceholderLeakage` — strips template placeholders that leak through
- `extractStructuredPositions` — regex-based position extraction
- `parsePositionHeader` — regex-based title/company parser
- `looksLikeUmbrellaHeader` — regex-based umbrella detection (added April 17)
- `extractUmbrellaCompany` — extracts company name from umbrella header

Each exists because an upstream stage produces bad output and the system needs to clean it up downstream.

## Bugs observed during April 17 debugging

Documented here as evidence of the pattern, not as blame:

1. **Vertex AI auth expiring silently** — every section fell back to deterministic stub output for an unknown period before anyone noticed.
2. **Career gap notes parsed as job entries** — the text "Tatiana took time off to care for a parent..." became a position with that entire sentence as the title/company.
3. **Parent-company headers parsed as positions** — `U.S. Bank | Minneapolis, MN | 2014-2024` became a standalone position with `title: "U.S. Bank"` and `company: "U.S. Bank"`.
4. **"manufacturing operations" regex false-positive** — any resume containing "operations" (banking, finance, healthcare) got tagged as manufacturing.
5. **Education blob** — entire work history text blob rendered under the Bachelor's degree entry; certifications list merged into institution field.
6. **Pronoun mismatches** — summary used "He eliminated..." for a female candidate named Rose; "His approach..." for Tatiana.
7. **Bullet concatenation artifacts** — bullets like "Improved X through data-driven analysis. and leading an effort to improve Y" where two source fragments got joined without cleanup.
8. **Duplicate bullets per role** — the `ensureMinimumBulletCounts` function backfilled 38 original bullets on top of 8 LLM-written bullets, producing 46-bullet roles.
9. **Experience section timeout** — serial LLM call for all positions timed out at 60 seconds, falling back to deterministic output for the largest section.
10. **Education frontend rendering** — structured education array was being overwritten with a raw string by `handleResumeUpdate`, causing the entire work history to render under the Education header.

Each was fixed during the April 17 session. Each fix was a patch over bad upstream output. None addressed why the upstream produced bad output.

## What's working well

This audit isn't all critique. Several things in v2 are solid and worth preserving:

- **LLM provider abstraction.** The Vertex/DeepSeek/Groq failover logic is well-designed. The 429 retry-with-backoff is working. This is keeper code.
- **Service account JWT auth** (built April 17). Finally solved the Vertex token expiry problem permanently. Keeper.
- **Parallel experience writer** (built April 17). Dropped timeout risk and cut wall time significantly. Keeper (will be reimplemented as Stage 4).
- **Agent-first mandate in CLAUDE.md.** The discipline around not defaulting to procedural patterns is valuable and should carry into v3.
- **Session state persistence.** Supabase-backed session state works reliably.
- **SSE streaming to frontend.** Real-time section updates work well. Keep this pattern in v3.
- **Chrome extension integration.** The normalized job URL as matching key is a good design. Unrelated to the resume writer rewrite.
- **Kanban pipeline.** Works. Unrelated to this project.

## What's unclear

Things that need investigation before being removed:

- **Truth Verification's actual output.** Does it catch real issues or is it theater?
- **Tone scoring methodology.** What does "tone score 76" mean? How is it calculated?
- **ATS scoring accuracy.** Does it correlate with real ATS pass-through rates or is it a heuristic?
- **Hiring Manager Scan.** What does it do that isn't already done by Verify?
- **Benchmark Candidate's role.** Does the Perplexity research materially improve output, or is it decorative?

These get answered during the Week 1 classify rebuild when we look at what information each stage actually contributes.

## What's clearly unnecessary in v3

Based on this audit, these are certain removals:

- All 17+ guardrail/coercion/salvage functions listed above
- The dual-parse system (Candidate Intelligence + Source Resume Outline)
- The merge step that reconciles the two parses
- All regex-based semantic matching (discipline, umbrella, phantom detection)
- Separate Candidate Intelligence, Benchmark, Gap Analysis stages (merged into Stages 2-3)

## Technical debt beyond the resume writer

Noticed during debugging but out of scope for this project:

- **OpenAI embeddings returning 403** — falling back to keyword matching, not critical but should be fixed or removed
- **Groq JSON validation failures** — recovered via `repairJSON` but indicates prompt issues
- **Three agent tools without `model_tier`** — defaulting to MODEL_ORCHESTRATOR, cosmetic but should be specified
- **Missing pre-commit hook** — `.claude/hooks/pre-commit-check.sh: No such file or directory` warnings suggest a referenced hook was deleted or never committed

These aren't v3 resume writer concerns. They're noted here so they don't get forgotten.

## Lines of code estimate

Rough estimate of code that will be deleted when v2 is retired:

- `server/src/agents/resume-v2/resume-writer/`: ~3,000 lines (agent, section-writer, guardrails)
- `server/src/agents/resume-v2/candidate-intelligence/`: ~1,500 lines
- `server/src/agents/resume-v2/benchmark-candidate/`: ~800 lines
- `server/src/agents/resume-v2/gap-analysis/`: ~600 lines
- `server/src/agents/resume-v2/source-resume-outline.ts`: ~500 lines
- Assembly, Truth Verification, Tone, ATS, Hiring Manager Scan: ~1,500 lines combined

Total: approximately 7,000-8,000 lines of TypeScript removed. Replaced by roughly 1,500-2,000 lines of v3 code plus 500-1,000 lines of prompts.

Net: a significantly smaller codebase.

## Commitment

This audit is recorded so that when we reach Week 4 and it's time to delete v2 code, we do it without hesitation. Every line deleted is a line that can't break. The work put into v2 taught us what not to do, and that lesson is now embedded in v3's design. Nothing is lost.
