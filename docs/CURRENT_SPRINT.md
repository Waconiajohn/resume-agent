# Sprint 19: Groq LLM Provider Integration
**Goal:** Add Groq as an alternative LLM provider to reduce pipeline latency from 15-30 minutes (Z.AI) to 1-3 minutes, at ~54% lower cost.
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

## Out of Scope (Explicitly)
- SiliconFlow provider (backlog)
- Refactoring ZAIProvider into a generic base class (separate story if needed)
- A/B testing framework between providers
- Removing Z.AI provider (kept as fallback)
- Quality benchmarking of resume content (manual step after deployment)
- Usage tracking fix for Groq (separate story)
