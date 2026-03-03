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

## Out of Scope (Explicitly)
- SiliconFlow provider (backlog)
- Refactoring ZAIProvider into a generic base class (separate story if needed)
- A/B testing framework between providers
- Removing Z.AI provider (kept as fallback)
- Quality benchmarking (manual step after deployment)
