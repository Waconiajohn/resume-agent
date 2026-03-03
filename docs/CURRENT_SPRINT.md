# Sprint 19: Groq LLM Provider Integration
**Goal:** Add Groq as an alternative LLM provider to reduce pipeline latency from 15-30 minutes (Z.AI) to 1-3 minutes, at ~54% lower cost. Then optimize model tiers for quality-first agent reasoning.
**Started:** 2026-03-02

## Stories This Sprint
1. [x] Add Groq LLM provider — done
   - Added `GroqProvider` class to `llm-provider.ts`
   - Added Groq model tier mapping and pricing to `llm.ts`
   - Updated provider factory for `LLM_PROVIDER=groq`
   - Added ADR-027, updated changelog
   - All 891 server tests + 416 app tests passing
   - Both `tsc --noEmit` checks clean

2. [x] Groq pipeline hardening — full E2E pipeline on Groq — done
   - Fixed 4 Groq-specific tool calling failures (8B XML format, schema validation, truncated output, multi-tool batching)
   - Changed ORCHESTRATOR model from 8B to Scout for reliable tool calling
   - Added tool validation recovery (`recoverFromToolValidation`) for Groq 400 errors
   - Added parameter coercion (`coerceToolParameters`) for stringified JSON
   - Updated Producer: max_rounds 8→15, loop_max_tokens 2048→8192, prompt de-batching
   - Full pipeline completed in ~1m42s (vs 15-30 min on Z.AI)
   - All 891 server tests passing, both tsc --noEmit clean

3. [x] Upgrade all agent loop models to 70B (Story 1) — done
   - Changed `GROQ_MODEL_ORCHESTRATOR` from Scout 17B to `llama-3.3-70b-versatile`
   - `MODEL_ORCHESTRATOR_COMPLEX` now maps to same model as `MODEL_ORCHESTRATOR` on Groq
   - Changed Craftsman and Producer from `MODEL_ORCHESTRATOR_COMPLEX` → `MODEL_ORCHESTRATOR`
   - Updated Strategist comments to reflect 70B
   - Added missing Groq models to pricing table
   - ADR-028 documents rationale
   - Both `tsc --noEmit` checks clean

4. [x] Adjust timeouts for Groq 70B latency (Story 3) — done
   - Strategist: round 180s→60s, overall 900s→300s
   - Craftsman: round 180s→60s, overall 900s→600s
   - Producer: round 120s→60s, overall 600s→300s
   - GroqProvider chatTimeoutMs: 30s→45s (70B slightly slower than Scout per request)

5. [x] MID tier decision — keep Scout 17B (Story 2) — done
   - Documented in ADR-029: Scout works for non-orchestration tasks (self_review, classify_fit, build_benchmark)
   - Qwen3 32B identified as fallback if quality degrades

6. [x] Reduce prescriptive sequencing in Strategist prompt (Story 4) — done
   - Replaced rigid numbered workflow with goal-oriented guidance
   - Phases kept as recommended workflow, not mandatory sequence
   - Added explicit permission to skip/reorder based on evidence
   - Consolidated scattered ethics rules into single "Non-Negotiable" section

7. [x] Grant Craftsman discretion on quality gates (Story 5) — done
   - Replaced forced waterfall (write→review→anti-patterns→keywords→revise→present)
   - Craftsman now decides which checks are needed per section
   - Strong sections can go directly to present; complex sections get full review
   - check_evidence_integrity still recommended for experience/accomplishment sections
   - Expected reduction: ~30-40 rounds → ~15-20 rounds

8. [x] Strengthen Producer with decision authority (Story 6) — done
   - Producer can now resolve minor formatting/ATS issues directly
   - Added ATS vs authenticity tradeoff guidance (favor authentic voice)
   - Improved template selection with criteria (industry, seniority, career span, density)
   - Only substantive quality failures route to Craftsman for revision

9. [x] Reduce workaround dependence (Story 7) — done
   - Raised `MAX_HISTORY_MESSAGES` from 30→60, `KEEP_RECENT_MESSAGES` from 20→40 (70B has 131K context)
   - Upgraded parameter coercion logging from `info`→`warn` for monitoring
   - Added 70B monitoring notes to tool validation recovery code
   - All workaround code kept as safety nets — no code removed

10. [x] Calibrate E2E tests for Groq (Story 8) — done
    - `pipeline-responder.ts`: POLL_INTERVAL 4s→2s, MAX_WAIT 55min→12min, STAGE_TIMEOUT 10min→3min, advance timeouts 5min→2min
    - `full-pipeline.spec.ts`: First LLM response timeout 5min→60s, added pipeline completion time assertion (<5 min)
    - `playwright.config.ts`: full-pipeline project timeout 60min→15min

11. [x] Update documentation — CLAUDE.md, ARCHITECTURE.md (Story 10) — done
    - CLAUDE.md: Groq as primary provider, dual model routing tables, env vars, known issues, test counts
    - ARCHITECTURE.md: Updated tech stack, provider section, model routing tables, agent loop resilience docs

12. [x] Quality validation E2E tests (Story 9) — done
    - Created `e2e/helpers/pipeline-capture.ts`: DOM scraping utilities for quality scores (ScoreRing aria-labels) and section content (heading + paragraph elements)
    - Created `e2e/fixtures/quality-validation-data.ts`: 2 additional resume/JD fixtures (Marketing VP→CMO, Operations Director→VP)
    - Created `e2e/tests/quality-validation.spec.ts`: serial test suite running 3 pipelines (cloud, marketing, operations), captures scores, asserts ≥60% primary / ≥50% secondary, saves JSON to test-results/
    - Modified `e2e/helpers/pipeline-responder.ts`: `runPipelineToCompletion` now accepts optional `PipelineCaptureData` — captures quality scores when dashboard visible, captures section content before approving
    - Added `quality-validation` project to `playwright.config.ts` (45 min timeout, video+trace)

## Out of Scope (Explicitly)
- SiliconFlow provider (backlog)
- Refactoring ZAIProvider into a generic base class (separate story if needed)
- A/B testing framework between providers
- Removing Z.AI provider (kept as fallback)
- Quality benchmarking of resume content (manual step after validation)
- Usage tracking fix for Groq (separate story)
