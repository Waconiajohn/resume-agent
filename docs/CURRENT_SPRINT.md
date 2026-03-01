# Sprint 9: AI API Latency Reduction
**Goal:** Reduce pipeline wall-clock time by 15-40% through safe, integrity-preserving optimizations targeting Z.AI API latency.
**Started:** 2026-03-01
**Completed:** 2026-03-01

---

## Stories

1. [x] Story 1: Parallel Tool Execution in Agent Loop — [status: done]
2. [x] Story 2: Downgrade adversarial_review to MODEL_MID — [status: done]
3. [x] Story 3: Strategist Prompt — Instruct Tool Batching — [status: done]
4. [x] Story 4: Adaptive max_tokens — [status: done]
5. [x] Story 5: Producer Prompt — Instruct Parallel Check Batching — [status: done]
6. [x] Story 6: Feature Flag for self_review_section on MODEL_LIGHT — [status: done]
7. [x] Story 7: Tests and Documentation — [status: done]

---

## Out of Scope (Explicitly)
- Changing the 3-agent sequential flow (hard data dependencies)
- Redis/persistent caching (infrastructure change)
- Streaming in pipeline (UX change, not real latency)
- Provider switching
