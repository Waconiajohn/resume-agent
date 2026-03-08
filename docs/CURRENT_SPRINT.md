# Sprint 49: Phase 5 — Emotional Intelligence Layer
**Goal:** Add momentum tracking (activity streaks, win celebrations), cognitive reframing (stall detection + coaching nudges), resource library, and "Ask a Coach" human escalation.
**Started:** 2026-03-08

## Context
Phases 1-4 complete. The platform has 17 agents + 2 simulation sub-agents, a fully interactive interview lab and salary negotiation room, and a Kanban command center. Phase 5 adds the emotional intelligence layer from Bible Ch 8 — keeping users motivated during long job searches, detecting when they're stuck, and providing proactive coaching.

The existing emotional baseline infrastructure (Phase 1C, `server/src/lib/emotional-baseline.ts`) provides tone adaptation and distress detection. Phase 5 builds on this with *active* momentum tracking and *proactive* coaching interventions.

## Architecture Decision
- Momentum tracking is **deterministic CRUD** — no LLM needed for activity logging and streak computation
- Cognitive reframing uses **LLM-generated coaching messages** (MODEL_MID) triggered by stall detection heuristics
- Resource library is **static content** organized by coaching methodology topics — no agent needed
- Ask a Coach is **simple CRUD** — structured form stored for human review

## Stories

1. [x] Story 5-1: `user_momentum` DB migration (activities, streaks, wins) — **Status: done**
2. [x] Story 5-2: Momentum CRUD routes + streak computation logic — **Status: done**
3. [x] Story 5-3: Cognitive Reframing engine (stall detection + LLM coaching messages) — **Status: done**
4. [x] Story 5-4: `useMomentum` hook + MomentumCard dashboard component — **Status: done**
5. [x] Story 5-5: Cognitive Reframing nudges in DashboardHome — **Status: done**
6. [x] Story 5-6: Resource Library (static content + searchable + filterable) — **Status: done**
7. [x] Story 5-7: Ask a Coach (form + coaching_requests CRUD) — **Status: done**

## Out of Scope (Explicitly)
- Emotional Wellness Agent (#15 in catalog) — full agent deferred, this sprint adds the infrastructure layer
- Skills Gap & Career Pivot Agent (#16) — Phase 6
- Retirement Planning Agent (#14) — Phase 6
- Gamification beyond streaks/wins (badges, leaderboards, etc.)

---

# Sprint 48: Quick Wins
**Goal:** Cover Letter DOCX export + Dashboard cover-letter integration
**Started:** 2026-03-08 | **Completed:** 2026-03-08

## Stories
1. [x] Story QW-1: Cover Letter DOCX export — **Status: done**
2. [x] Story QW-2: Dashboard cover-letter feed integration — **Status: done**

---

# Sprint 47: Phase 4B — Salary Negotiation Enhancement
**Goal:** Add interactive Counter-Offer Simulation to the Salary Negotiation room and Kanban "Offer" stage trigger.
**Started:** 2026-03-08 | **Completed:** 2026-03-08

## Stories
1. [x] Story 4B-1: Counter-Offer Simulation types + state — **Status: done**
2. [x] Story 4B-2: Employer agent + tools (pushback, coach, evaluate) — **Status: done**
3. [x] Story 4B-3: ProductConfig + route + feature flag — **Status: done**
4. [x] Story 4B-4: `useCounterOfferSim` frontend hook — **Status: done**
5. [x] Story 4B-5: CounterOfferView component — **Status: done**
6. [x] Story 4B-6: Wire into SalaryNegotiationRoom + Kanban trigger — **Status: done**
