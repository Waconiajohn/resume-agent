# CareerIQ Platform Architecture — Build-Ready Blueprint
**Version:** 1.0
**Date:** 2026-03-07
**Audience:** Backend architects, senior engineers
**Status:** Authoritative design document

---

## Table of Contents

1. [Architecture Principles](#1-architecture-principles)
2. [Service Architecture — 33-Agent Module Structure](#2-service-architecture)
3. [API Design — Complete Route Map](#3-api-design)
4. [Agent Orchestration — Platform Orchestrator](#4-agent-orchestration)
5. [Cross-Agent Intelligence — Data Flow](#5-cross-agent-intelligence)
6. [B2B Multi-Tenancy](#6-b2b-multi-tenancy)
7. [Financial Planner Integration](#7-financial-planner-integration)
8. [Background Processing](#8-background-processing)
9. [Monitoring and Quality](#9-monitoring-and-quality)
10. [Scale Strategy](#10-scale-strategy)
11. [Security Architecture](#11-security-architecture)
12. [Migration Roadmap](#12-migration-roadmap)

---

## 1. Architecture Principles

### 1.1 What Must Not Change

The existing runtime is well-designed and must be preserved as the foundation. Specifically:

- `AgentTool<TState, TEvent>` / `AgentConfig` / `AgentContext` — the generic protocol
- `runAgentLoop()` — the multi-round LLM + tool loop
- `runProductPipeline()` — the sequential agent phase executor
- `ProductConfig<TState, TEvent>` — the product contract
- `createProductRoutes()` — the route factory
- `AgentBus` / `AgentMessage` — inter-agent messaging protocol
- `AgentRegistry` — domain:name registration

Every new agent, every new product, every B2B extension follows the existing patterns exactly. There are no special paths.

### 1.2 Design Constraints

| Constraint | Implication |
|-----------|-------------|
| Supabase as database | All new tables follow RLS pattern; admin client for server-side |
| Hono as HTTP framework | All routes via `createProductRoutes()` or thin Hono handlers |
| SSE for real-time | No WebSockets; fetch-based SSE with heartbeat |
| ESM imports with `.js` | All server imports use `.js` extension |
| TypeScript strict mode | No `any`; both `app/` and `server/` must pass `tsc --noEmit` |
| No distributed state yet | In-memory bus (`AgentBus`) until Redis flag enabled; single-process |
| Feature flag gate | Every new product gated behind `FF_*` env var |

### 1.3 Guiding Decisions

**Decision:** The Platform Orchestrator (Agent #30) is NOT a pipeline agent — it is a separate stateless recommendation service that reads platform state and returns next-action recommendations. It does not run an agent loop during user interactions. It runs async recalculations after pipeline completions.

**Reasoning:** Injecting a "what should I do next" LLM call into every page load would add 2-5 seconds of latency. Precomputed recommendations stored in DB are read in <50ms.

**Decision:** B2B tenancy is enforced at the database layer via RLS, not at the application layer. The application trusts the user JWT's `organization_id` claim.

**Reasoning:** Application-layer tenant checks are forgettable; RLS policies cannot be bypassed by application bugs.

**Decision:** Financial planner integration is its own micro-domain with dedicated routes, tables, and a lightweight state machine — not an agent pipeline.

**Reasoning:** Financial planner workflows are deterministic (5 gates, fixed state transitions). Running them as agent loops would waste LLM tokens on scripted flows.

---

## 2. Service Architecture

### 2.1 Directory Structure

```
server/src/
├── agents/
│   ├── runtime/                    # UNCHANGED — generic agent infrastructure
│   │   ├── agent-loop.ts
│   │   ├── agent-bus.ts
│   │   ├── agent-bus-redis.ts
│   │   ├── agent-context.ts
│   │   ├── agent-protocol.ts
│   │   ├── agent-registry.ts
│   │   ├── product-config.ts
│   │   ├── product-coordinator.ts
│   │   ├── shared-tools.ts
│   │   └── index.ts
│   │
│   ├── knowledge/                  # UNCHANGED — shared knowledge layer
│   │   ├── rules.ts
│   │   ├── resume-guide.ts
│   │   └── formatting-guide.ts
│   │
│   ├── schemas/                    # UNCHANGED — Zod schemas per agent
│   │
│   # ─── CATEGORY 1: Career Positioning ───────────────────────────────
│   ├── resume/                     # Agent #1-3 product wrapper (BUILT)
│   │   ├── product.ts
│   │   ├── event-middleware.ts
│   │   └── route-hooks.ts
│   ├── strategist/                 # Agent #1 (BUILT)
│   ├── craftsman/                  # Agent #2 (BUILT)
│   ├── producer/                   # Agent #3 (BUILT)
│   │
│   # ─── CATEGORY 2: Document & Positioning ───────────────────────────
│   ├── cover-letter/               # Agent #4 (BUILT)
│   ├── linkedin-optimizer/         # Agent #5 (BUILT)
│   ├── content-calendar/           # Agent #6 (BUILT) — LinkedIn Blogging
│   │
│   # ─── CATEGORY 3: Job Discovery ────────────────────────────────────
│   ├── job-finder/                 # Agent #7 (Phase 3)
│   │   ├── types.ts
│   │   ├── knowledge/rules.ts
│   │   ├── searcher/agent.ts
│   │   ├── searcher/tools.ts
│   │   ├── ranker/agent.ts
│   │   ├── ranker/tools.ts
│   │   └── product.ts
│   ├── boolean-search/             # Agent #8 (Phase 3)
│   │   ├── types.ts
│   │   ├── builder/agent.ts
│   │   ├── builder/tools.ts
│   │   └── product.ts
│   ├── job-tracker/                # Agent #9 (BUILT as #14)
│   │
│   # ─── CATEGORY 4: Interview & Relationship ─────────────────────────
│   ├── interview-prep/             # Agent #10 (BUILT)
│   ├── salary-negotiation/         # Agent #11 (BUILT as #15)
│   ├── networking-outreach/        # Agent #12 (BUILT as #13)
│   ├── references/                 # Agent #13 (Phase 4)
│   │   ├── types.ts
│   │   ├── analyst/agent.ts
│   │   ├── analyst/tools.ts
│   │   ├── writer/agent.ts
│   │   ├── writer/tools.ts
│   │   └── product.ts
│   │
│   # ─── CATEGORY 5: Financial Wellness ───────────────────────────────
│   ├── retirement-bridge/          # Agent #14 (Phase 5)
│   │   ├── types.ts
│   │   ├── analyst/agent.ts        # Financial needs analysis
│   │   ├── analyst/tools.ts
│   │   ├── planner/agent.ts        # Bridge strategy generation
│   │   ├── planner/tools.ts
│   │   └── product.ts
│   ├── emotional-wellness/         # Agent #15 (Phase 5)
│   │   ├── types.ts
│   │   ├── coach/agent.ts
│   │   ├── coach/tools.ts
│   │   └── product.ts
│   ├── skills-gap/                 # Agent #16 (Phase 5)
│   │   ├── types.ts
│   │   ├── analyst/agent.ts
│   │   ├── analyst/tools.ts
│   │   ├── planner/agent.ts
│   │   ├── planner/tools.ts
│   │   └── product.ts
│   │
│   # ─── CATEGORY 6: Contract Career Track ───────────────────────────
│   ├── contract-profile/           # Agent #17 (Phase 3)
│   ├── rate-calculator/            # Agent #18 (Phase 4)
│   ├── contract-proposal/          # Agent #19 (Phase 4)
│   ├── sow-builder/                # Agent #20 (Phase 4)
│   ├── contract-tracker/           # Agent #21 (Phase 4)
│   │
│   # ─── CATEGORY 7: Lead Gen & Intelligence ─────────────────────────
│   ├── talent-sourcing/            # Agent #22 (Phase 3)
│   ├── company-monitor/            # Agent #23 (Phase 3)
│   │   ├── types.ts
│   │   ├── watcher/agent.ts        # Background monitoring loop
│   │   ├── watcher/tools.ts
│   │   ├── reporter/agent.ts
│   │   ├── reporter/tools.ts
│   │   └── product.ts
│   ├── linkedin-mapper/            # Agent #24 (Phase 7)
│   │
│   # ─── CATEGORY 8: Content & Marketing ────────────────────────────
│   ├── pr-blogging/                # Agent #25 (Phase 7)
│   ├── social-media/               # Agent #26 (Phase 7)
│   │
│   # ─── CATEGORY 9: Operations ──────────────────────────────────────
│   ├── client-success/             # Agent #27 (Phase 7)
│   ├── model-manager/              # Agent #28 (Phase 7)
│   ├── token-efficiency/           # Agent #29 (Phase 7)
│   ├── platform-orchestrator/      # Agent #30 — recommendation engine
│   │   ├── types.ts
│   │   ├── scorer.ts               # Priority scoring logic
│   │   ├── recommender.ts          # Next-action recommendation engine
│   │   ├── journey-map.ts          # User journey state machine
│   │   └── worker.ts               # Background recompute worker
│   │
│   # ─── CATEGORY 10: B2B Enterprise ─────────────────────────────────
│   ├── b2b-benefits/               # Agent #31 (Phase 6)
│   ├── b2b-reporting/              # Agent #32 (Phase 6)
│   │   ├── types.ts
│   │   ├── aggregator/agent.ts     # Pulls org-wide engagement metrics
│   │   ├── aggregator/tools.ts
│   │   ├── reporter/agent.ts       # Generates PDF/HTML reports
│   │   ├── reporter/tools.ts
│   │   └── product.ts
│   ├── b2b-onboarding/             # Agent #33 (Phase 6)
│   │   ├── types.ts
│   │   ├── provisioner/agent.ts    # CSV parsing, account creation
│   │   ├── provisioner/tools.ts
│   │   └── product.ts
│   │
│   # ─── Platform Orchestrator ────────────────────────────────────────
│   └── orchestrator/               # Cross-agent journey intelligence
│       ├── types.ts
│       ├── scorer.ts
│       ├── recommender.ts
│       └── worker.ts
│
├── b2b/                            # B2B-specific services (non-agent)
│   ├── tenant-guard.ts             # Org-scoped auth middleware
│   ├── sso-handler.ts              # SAML 2.0 / OIDC handler
│   ├── hris-sync.ts                # Workday/BambooHR/ADP sync
│   ├── roster-importer.ts          # CSV upload → account provisioning
│   ├── report-scheduler.ts         # Automated report delivery
│   └── white-label.ts              # Per-org branding config
│
├── financial-planner/              # Financial planner network (non-agent)
│   ├── types.ts
│   ├── qualification-gate.ts       # 5-gate lead qualification FSM
│   ├── matcher.ts                  # Planner matching algorithm
│   ├── handoff-generator.ts        # Handoff document LLM generation
│   ├── commission-tracker.ts       # Commission state machine
│   └── sla-monitor.ts              # 48h SLA watchdog
│
├── background/                     # Background job workers
│   ├── queue.ts                    # BullMQ queue definitions
│   ├── workers/
│   │   ├── job-match.worker.ts
│   │   ├── company-monitor.worker.ts
│   │   ├── content-calendar.worker.ts
│   │   ├── lead-score.worker.ts
│   │   ├── orchestrator-recompute.worker.ts
│   │   ├── report-delivery.worker.ts
│   │   └── quality-scoring.worker.ts
│   └── scheduler.ts                # Cron-style job scheduling
│
├── rag/                            # RAG infrastructure
│   ├── naive/                      # Phase 1: pgvector
│   │   ├── embedder.ts
│   │   ├── chunker.ts
│   │   └── retriever.ts
│   ├── graph/                      # Phase 2: graph layer (future)
│   │   └── .gitkeep
│   └── agentic/                    # Phase 3: autonomous retrieval (future)
│       └── .gitkeep
│
├── lib/                            # EXTENDED — shared utilities
│   ├── llm.ts                      # UNCHANGED
│   ├── llm-provider.ts             # UNCHANGED
│   ├── supabase.ts                 # UNCHANGED
│   ├── logger.ts                   # UNCHANGED
│   ├── feature-flags.ts            # EXTENDED — add new FF_* flags
│   ├── platform-context.ts         # EXTENDED — add new context types
│   ├── tenant-context.ts           # NEW — org-scoped context helpers
│   ├── cost-tracker.ts             # NEW — per-agent/user cost accumulator
│   ├── quality-scorer.ts           # NEW — automated quality evaluation
│   ├── audit-log.ts                # NEW — immutable audit trail
│   └── sentry.ts                   # UNCHANGED
│
├── middleware/                     # EXTENDED
│   ├── auth.ts                     # UNCHANGED (Supabase JWT)
│   ├── rate-limit.ts               # UNCHANGED
│   ├── subscription-guard.ts       # UNCHANGED
│   ├── tenant-guard.ts             # NEW — B2B org membership check
│   ├── sso-guard.ts                # NEW — SAML/OIDC session check
│   └── audit-middleware.ts         # NEW — request audit logging
│
└── routes/                         # EXTENDED
    ├── product-route-factory.ts    # UNCHANGED — all agent routes use this
    ├── resume-pipeline.ts          # UNCHANGED (Agent #1-3)
    ├── cover-letter.ts             # UNCHANGED (Agent #4)
    ├── [existing agent routes...]  # UNCHANGED
    ├── orchestrator.ts             # NEW — /api/orchestrator/*
    ├── b2b-admin.ts                # NEW — /api/b2b/admin/*
    ├── b2b-enterprise.ts           # NEW — /api/b2b/enterprise/*
    ├── financial-planner.ts        # NEW — /api/financial-planner/*
    ├── background-jobs.ts          # NEW — /api/jobs/* (webhook receivers)
    └── quality.ts                  # NEW — /api/quality/*
```

### 2.2 Agent Registration Pattern

Every agent registers itself on module load. The registry is the single source of truth for agent discovery. This pattern is already in place — no changes needed:

```typescript
// server/src/agents/job-finder/searcher/agent.ts
import { registerAgent } from '../../runtime/agent-registry.js';

export const jobFinderSearcherConfig: AgentConfig<JobFinderState, JobFinderSSEEvent> = {
  identity: { name: 'searcher', domain: 'job-finder' },
  capabilities: ['web_search', 'job_discovery', 'relevance_ranking'],
  system_prompt: JOB_FINDER_SEARCHER_PROMPT,
  tools: [searchJobBoards, filterByFit, rankByRelevance, emitTransparency],
  model: MODEL_MID,
  max_rounds: 8,
  round_timeout_ms: 60_000,
  overall_timeout_ms: 300_000,
};

registerAgent(jobFinderSearcherConfig);
```

### 2.3 Product Configuration Pattern

Every product follows the same `ProductConfig<TState, TEvent>` contract. New agents get a route by implementing this and wiring into `createProductRoutes()`:

```typescript
// server/src/agents/job-finder/product.ts
export function createJobFinderProductConfig(input: JobFinderInput): ProductConfig<JobFinderState, JobFinderSSEEvent> {
  return {
    domain: 'job-finder',
    agents: [
      {
        name: 'searcher',
        config: jobFinderSearcherConfig,
        stageMessage: { startStage: 'search', start: 'Searching job boards...', complete: 'Jobs found' },
        onComplete: (scratchpad, state) => {
          state.raw_jobs = scratchpad.jobs as JobListing[];
        },
      },
      {
        name: 'ranker',
        config: jobFinderRankerConfig,
        stageMessage: { startStage: 'ranking', start: 'Ranking by fit...', complete: 'Ranked results ready' },
        gates: [{ name: 'review_results' }],
      },
    ],
    createInitialState: (sessionId, userId, input) => ({ /* ... */ }),
    buildAgentMessage: (agentName, state, input) => { /* ... */ },
    finalizeResult: (state, input, emit) => { /* ... */ },
    persistResult: async (state, result) => { /* DB write */ },
  };
}
```

### 2.4 Agent Capability Index

The registry's `findByCapability()` method powers the Platform Orchestrator. Agents declare capabilities; the orchestrator queries them to understand what is available and what has run.

```typescript
// Capabilities used across the platform
type AgentCapability =
  | 'resume_writing'        // Agents #1-3
  | 'cover_letter'          // Agent #4
  | 'linkedin_optimization' // Agent #5
  | 'content_creation'      // Agent #6
  | 'job_discovery'         // Agent #7-9
  | 'interview_coaching'    // Agent #10
  | 'salary_strategy'       // Agent #11
  | 'networking'            // Agent #12
  | 'reference_management'  // Agent #13
  | 'financial_planning'    // Agent #14
  | 'emotional_support'     // Agent #15
  | 'skills_assessment'     // Agent #16
  | 'contract_management'   // Agents #17-21
  | 'talent_sourcing'       // Agent #22
  | 'market_intelligence'   // Agent #23
  | 'network_mapping'       // Agent #24
  | 'pr_content'            // Agent #25
  | 'social_media'          // Agent #26
  | 'quality_assurance'     // Agent #3 (producer)
  | 'orchestration'         // Agent #30
  | 'b2b_reporting'         // Agent #32
  | 'b2b_onboarding'        // Agent #33
```

---

## 3. API Design

### 3.1 Route Topology

```
/api/
├── # ─── B2C Agent Pipelines (all via createProductRoutes) ─────────────
│
├── pipeline/                       # Agent #1-3 (Resume)
│   ├── POST   /start
│   ├── GET    /:sessionId/stream
│   └── POST   /respond
│
├── cover-letter/                   # Agent #4
│   ├── POST   /start
│   ├── GET    /:sessionId/stream
│   └── POST   /respond
│
├── linkedin-optimizer/             # Agent #5
│   ├── POST   /start
│   ├── GET    /:sessionId/stream
│   └── POST   /respond
│
├── content-calendar/               # Agent #6
│   ├── POST   /start
│   ├── GET    /:sessionId/stream
│   └── POST   /respond
│
├── job-finder/                     # Agent #7
├── boolean-search/                 # Agent #8
├── job-tracker/                    # Agent #9
├── interview-prep/                 # Agent #10
├── salary-negotiation/             # Agent #11
├── networking-outreach/            # Agent #12
├── references/                     # Agent #13
├── retirement-bridge/              # Agent #14
├── emotional-wellness/             # Agent #15
├── skills-gap/                     # Agent #16
├── contract-profile/               # Agent #17
├── rate-calculator/                # Agent #18
├── contract-proposal/              # Agent #19
├── sow-builder/                    # Agent #20
├── contract-tracker/               # Agent #21
├── talent-sourcing/                # Agent #22
├── company-monitor/                # Agent #23
├── linkedin-mapper/                # Agent #24
├── pr-blogging/                    # Agent #25
├── social-media/                   # Agent #26
│   # All follow identical pattern:
│   ├── POST   /start
│   ├── GET    /:sessionId/stream
│   └── POST   /respond
│
│
├── # ─── Platform Orchestrator ──────────────────────────────────────────
│
├── orchestrator/
│   ├── GET    /recommendations     # Current user's top next actions
│   ├── GET    /journey             # Full journey state for user
│   ├── POST   /acknowledge         # Mark recommendation as seen
│   └── GET    /agent-status        # Which agents have run, completion states
│
│
├── # ─── Data / Sessions ────────────────────────────────────────────────
│
├── sessions/                       # EXISTING
│   ├── GET    /
│   ├── POST   /
│   ├── GET    /:id
│   ├── PATCH  /:id
│   └── DELETE /:id
│
├── resumes/                        # EXISTING
│   ├── GET    /
│   ├── GET    /:id
│   ├── POST   /
│   ├── PATCH  /:id
│   ├── POST   /:id/export-pdf
│   └── GET    /master/:userId
│
├── platform-context/               # Cross-agent intelligence (expand existing)
│   ├── GET    /                    # All context rows for user
│   ├── GET    /:type               # Context rows by type
│   ├── PUT    /:type               # Upsert a context row
│   └── DELETE /:type/:id           # Remove a context row
│
├── evidence-library/               # User's evidence items
│   ├── GET    /                    # All evidence items
│   ├── POST   /                    # Add evidence item
│   ├── PATCH  /:id                 # Update evidence item
│   └── DELETE /:id
│
│
├── # ─── B2B Enterprise ─────────────────────────────────────────────────
│
├── b2b/
│   ├── admin/                      # Admin portal (org admins only)
│   │   ├── GET    /dashboard        # Engagement metrics (no personal content)
│   │   ├── GET    /cohorts          # Employee cohorts
│   │   ├── POST   /cohorts          # Create cohort
│   │   ├── GET    /cohorts/:id/metrics
│   │   ├── POST   /roster/upload    # CSV roster upload
│   │   ├── GET    /roster/status    # Upload processing status
│   │   ├── GET    /reports          # Historical reports
│   │   ├── GET    /reports/:id      # Download report PDF
│   │   ├── POST   /reports/schedule # Schedule automated delivery
│   │   ├── GET    /usage            # Token / cost breakdown
│   │   └── GET    /sla              # SLA compliance dashboard
│   │
│   ├── enterprise/                 # Enterprise config (org owner only)
│   │   ├── GET    /config           # Org configuration
│   │   ├── PATCH  /config           # Update org config
│   │   ├── GET    /branding         # White-label settings
│   │   ├── PUT    /branding         # Update branding
│   │   ├── GET    /sso              # SSO configuration
│   │   ├── PUT    /sso              # Configure SAML/OIDC
│   │   ├── POST   /sso/test         # Test SSO configuration
│   │   ├── GET    /hris             # HRIS integration status
│   │   ├── PUT    /hris             # Configure HRIS API
│   │   └── POST   /hris/sync        # Trigger manual sync
│   │
│   └── onboarding/                 # Agent #33 — B2B Onboarding
│       ├── POST   /start            # Start onboarding agent
│       ├── GET    /:sessionId/stream
│       └── POST   /respond
│
│
├── # ─── Financial Planner Network ──────────────────────────────────────
│
├── financial-planner/
│   ├── qualify/
│   │   ├── POST   /start            # Start qualification flow
│   │   ├── GET    /:flowId/status   # Gate status
│   │   └── POST   /:flowId/respond  # Respond to current gate
│   ├── match/
│   │   └── GET    /:flowId          # Get matched planners
│   ├── handoff/
│   │   ├── POST   /generate         # Generate handoff doc (LLM)
│   │   └── GET    /:id              # Retrieve handoff doc
│   ├── commission/
│   │   ├── GET    /                 # Commission records (planner-scoped)
│   │   └── GET    /:id              # Single commission record
│   └── sla/
│       └── GET    /status           # SLA compliance for planners
│
│
├── # ─── Background Jobs (webhook receivers) ────────────────────────────
│
├── jobs/
│   ├── POST   /orchestrator-recompute  # Trigger after pipeline completion
│   ├── POST   /quality-score           # Trigger quality scoring for session
│   └── GET    /status/:jobId           # Background job status
│
│
├── # ─── Admin / Quality ─────────────────────────────────────────────────
│
├── quality/
│   ├── GET    /scores              # Quality scores by agent/session
│   ├── GET    /agent/:domain       # Per-agent quality aggregate
│   └── POST   /trigger             # Trigger manual quality review
│
├── admin/                          # EXISTING — extend with new endpoints
│   ├── GET    /stats               # Platform stats
│   ├── GET    /pipelines           # Active pipeline overview
│   ├── GET    /costs               # Cost breakdown by agent
│   ├── GET    /errors              # Error rate by agent
│   └── GET    /agents              # Registry dump (all 33 agents)
│
└── # ─── Auth & Billing ──────────────────────────────────────────────────
    ├── auth/                       # Supabase auth passthrough
    ├── billing/                    # EXISTING Stripe
    └── affiliates/                 # EXISTING
```

### 3.2 Standard Route Lifecycle

Every agent pipeline route is created identically:

```typescript
// server/src/routes/job-finder.ts
import { createProductRoutes } from './product-route-factory.js';
import { createJobFinderProductConfig } from '../agents/job-finder/product.js';
import { FF_JOB_FINDER } from '../lib/feature-flags.js';
import type { JobFinderState, JobFinderSSEEvent } from '../agents/job-finder/types.js';

export const jobFinderRouter = createProductRoutes<JobFinderState, JobFinderSSEEvent>({
  inputSchema: jobFinderStartSchema,
  buildProductConfig: (input, sessionId, userId) =>
    createJobFinderProductConfig({ session_id: sessionId, user_id: userId, ...input }),
  featureFlag: FF_JOB_FINDER,
  onBeforeStart: jobFinderBeforeStart,
  transformInput: jobFinderTransformInput,
  onEvent: jobFinderEventMiddleware,
  onComplete: async (sessionId) => unregisterRunningPipeline(sessionId),
  onError: async (sessionId) => unregisterRunningPipeline(sessionId),
});
```

### 3.3 Orchestrator Recommendation Response Shape

```typescript
// GET /api/orchestrator/recommendations
interface OrchestratorRecommendation {
  id: string;
  action_type: AgentCapability;
  agent_domain: string;           // e.g. 'interview-prep'
  priority: 1 | 2 | 3 | 4 | 5;  // 1 = most urgent
  title: string;                  // e.g. "Prepare for your Amazon interview"
  rationale: string;              // e.g. "Resume complete. Interview in 5 days."
  cta_label: string;              // e.g. "Start Interview Prep"
  cta_url: string;                // e.g. "/interview-prep?session=..."
  context_data: Record<string, unknown>; // e.g. { company: 'Amazon', date: '2026-03-12' }
  computed_at: string;
}

interface OrchestratorRecommendationsResponse {
  top_action: OrchestratorRecommendation | null;
  queue: OrchestratorRecommendation[];  // ordered by priority
  journey_completion_pct: number;       // 0-100
  updated_at: string;
}
```

---

## 4. Agent Orchestration — Platform Orchestrator

### 4.1 Orchestrator Design

The Platform Orchestrator (Agent #30) is a **recommendation service**, not an agent pipeline. It has two modes:

1. **Reactive recompute** — triggered as a background job after any pipeline completes. Runs async, completes in <5 seconds. Writes recommendations to DB.
2. **Sync read** — `GET /api/orchestrator/recommendations` reads precomputed recommendations from DB in <50ms.

The orchestrator does NOT run the LLM during a user's page load. It runs the LLM in the background and serves cached results.

### 4.2 Journey State Machine

```
                    ┌──────────────────────────────────────────────────────┐
                    │              USER JOURNEY MAP                        │
                    │                                                      │
                    │  FOUNDATION           APPLICATION        GROWTH      │
                    │  (Agents #1-6)        (Agents #7-13)    (#14-26)     │
                    │                                                      │
                    │  ┌──────────┐         ┌──────────┐     ┌──────────┐ │
                    │  │ Resume   │────────▶│ Job      │────▶│Financial │ │
                    │  │ (#1-3)   │         │ Finder   │     │Wellness  │ │
                    │  └──────────┘         │ (#7-9)   │     │(#14-16)  │ │
                    │        │              └──────────┘     └──────────┘ │
                    │        ▼                   │                        │
                    │  ┌──────────┐              ▼                        │
                    │  │ Cover    │         ┌──────────┐                  │
                    │  │ Letter   │         │ Interview│                  │
                    │  │ (#4)     │         │ Prep     │                  │
                    │  └──────────┘         │ (#10)    │                  │
                    │        │              └──────────┘                  │
                    │        ▼                   │                        │
                    │  ┌──────────┐              ▼                        │
                    │  │ LinkedIn │         ┌──────────┐                  │
                    │  │ (#5-6)   │         │ Salary   │                  │
                    │  └──────────┘         │ Neg (#11)│                  │
                    │                       └──────────┘                  │
                    └──────────────────────────────────────────────────────┘
```

### 4.3 Priority Scoring Algorithm

```typescript
// server/src/agents/platform-orchestrator/scorer.ts

interface JourneyState {
  userId: string;
  completed_agents: AgentCapability[];
  active_job_applications: JobApplication[];
  interview_dates: InterviewDate[];
  last_activity_at: string;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  days_since_last_session: number;
}

interface ScoredAction {
  capability: AgentCapability;
  base_score: number;    // 0-100 from rules
  time_decay: number;    // multiplier 0-1 (urgency from deadlines)
  completion_boost: number; // multiplier based on prerequisites done
  final_score: number;   // base_score * time_decay * completion_boost
}

// Scoring rules (no LLM required for this — pure logic)
const SCORING_RULES: Record<AgentCapability, ScoringRule> = {
  resume_writing: {
    base: 95,
    prerequisite: [],
    // Highest base score — nothing else works without a resume
  },
  cover_letter: {
    base: 80,
    prerequisite: ['resume_writing'],
    // Score boost if active application exists without cover letter
    boost: (state) => state.active_job_applications.filter(j => !j.has_cover_letter).length * 5,
  },
  interview_coaching: {
    base: 90,
    prerequisite: ['resume_writing'],
    // Time-decay multiplier: 2x if interview within 7 days
    time_modifier: (state) => {
      const next = state.interview_dates.sort((a, b) => a.date - b.date)[0];
      if (!next) return 1;
      const daysUntil = (next.date - Date.now()) / 86_400_000;
      if (daysUntil <= 2) return 3;
      if (daysUntil <= 7) return 2;
      return 1;
    },
  },
  // ... all 33 capabilities
};

export function computeRecommendations(state: JourneyState): OrchestratorRecommendation[] {
  const scores: ScoredAction[] = [];

  for (const [capability, rule] of Object.entries(SCORING_RULES)) {
    // Skip if prerequisites not met
    const prereqsMet = rule.prerequisite.every(p => state.completed_agents.includes(p));
    if (!prereqsMet) continue;

    // Skip if already completed (recently)
    if (state.completed_agents.includes(capability) && !rule.repeatable) continue;

    const base = rule.base + (rule.boost?.(state) ?? 0);
    const timeDecay = rule.time_modifier?.(state) ?? 1;
    const completionBoost = prereqsMet ? 1.2 : 0.8;

    scores.push({
      capability,
      base_score: base,
      time_decay: timeDecay,
      completion_boost: completionBoost,
      final_score: Math.min(100, base * timeDecay * completionBoost),
    });
  }

  return scores
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, 5)
    .map((s, i) => buildRecommendation(s, state, i + 1));
}
```

### 4.4 Cross-Agent Trigger Protocol

When a pipeline completes, it posts a job to the background queue which triggers orchestrator recompute. This is the "resume completion triggers LinkedIn suggestion" mechanism.

```typescript
// server/src/agents/resume/route-hooks.ts (extend existing)
// After pipeline completion in onComplete hook:
async function onResumePipelineComplete(sessionId: string, userId: string, state: PipelineState) {
  // 1. Persist platform context (already done)
  await upsertUserContext(userId, 'positioning_strategy', { ... }, 'resume');

  // 2. Trigger orchestrator recompute (NEW)
  await backgroundQueue.add('orchestrator-recompute', {
    userId,
    trigger: 'resume_complete',
    session_id: sessionId,
    completed_capability: 'resume_writing',
  });

  // 3. Trigger company monitoring setup if job applications exist (NEW)
  if (state.job_applications?.length > 0) {
    await backgroundQueue.add('company-monitor-setup', {
      userId,
      companies: state.job_applications.map(j => j.company_name),
    });
  }
}
```

### 4.5 LLM Usage in Orchestrator

The orchestrator uses the LLM in exactly one place: generating the human-readable `title`, `rationale`, and `cta_label` fields for recommendations. This call uses `MODEL_LIGHT` and is cached per recommendation set.

```typescript
// server/src/agents/platform-orchestrator/recommender.ts

async function generateRecommendationText(
  scored: ScoredAction[],
  state: JourneyState,
): Promise<OrchestratorRecommendation[]> {
  // Build structured data for LLM — no agent loop, single direct call
  const prompt = buildRecommendationPrompt(scored, state);

  const response = await llm.chat({
    model: MODEL_LIGHT,
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 512,
    session_id: `orchestrator:${state.userId}`,
  });

  return parseRecommendationText(response.text, scored, state);
}
```

---

## 5. Cross-Agent Intelligence

### 5.1 User Positioning Profile — Central Entity

The User Positioning Profile is the single most important cross-agent data structure. Every agent reads from it and writes to it. It lives in `user_platform_context` with `context_type = 'positioning_strategy'`.

```typescript
// Extends the existing PlatformContextRow content field
interface UserPositioningProfile {
  // Set by Resume Strategist (Agent #1)
  career_arc: {
    label: string;
    evidence: string;
    user_description: string;
  };
  top_capabilities: CapabilityRecord[];
  authentic_phrases: string[];      // LinkedIn uses these verbatim
  positioning_angle: string;        // The headline statement
  target_roles: string[];           // Informs Job Finder (#7)

  // Set by Gap Analyst (Agent #4 internally)
  gap_summary: {
    critical_gaps: string[];
    addressable_gaps: string[];
    coverage_score: number;
  };

  // Set by Interview Prep (Agent #10)
  interview_evidence: InterviewEvidenceRecord[];

  // Set by Salary Negotiation (Agent #11)
  compensation_target: {
    base_min: number;
    base_target: number;
    equity_preference: string;
    negotiation_anchors: string[];
  };

  // Set by Skills Gap (Agent #16)
  skill_development_plan: {
    priority_skills: string[];
    learning_timeline_months: number;
    recommended_courses: CourseRecord[];
  };

  // Enriched by any agent that completes
  last_updated_by: string;          // e.g. 'resume', 'interview-prep'
  last_updated_at: string;
  version: number;
}
```

### 5.2 Evidence Library

The evidence library (STAR stories) is shared across Resume, Cover Letter, Interview Prep, and Case Study agents. It lives in its own table for indexed access.

```sql
-- supabase/migrations/013_evidence_library.sql
CREATE TABLE evidence_library (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  situation       text NOT NULL,
  action          text NOT NULL,
  result          text NOT NULL,
  metrics         jsonb DEFAULT '{}',
  keywords        text[] DEFAULT '{}',
  source_agent    text NOT NULL,          -- which agent created this
  source_session  uuid REFERENCES coach_sessions(id),
  used_in_agents  text[] DEFAULT '{}',    -- which agents have used this
  user_validated  boolean DEFAULT false,
  quality_score   integer,                -- 0-100, set by quality scorer
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_evidence_user ON evidence_library(user_id);
CREATE INDEX idx_evidence_keywords ON evidence_library USING GIN(keywords);

ALTER TABLE evidence_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_user_access ON evidence_library
  FOR ALL USING (user_id = auth.uid());
```

### 5.3 Cross-Agent Context Read Pattern

Every agent that needs prior context reads from `user_platform_context` at the start of its pipeline. The resume product already does this for existing profiles. All new agents follow the same pattern:

```typescript
// In any agent's product.ts createInitialState():
const existingProfile = await getUserContext(userId, 'positioning_strategy');
const evidenceItems = await supabaseAdmin
  .from('evidence_library')
  .select('*')
  .eq('user_id', userId)
  .order('quality_score', { ascending: false })
  .limit(20);

// Pass into initial state — agent reads from state, never from DB directly
state.existing_profile = existingProfile[0]?.content ?? null;
state.evidence_library = evidenceItems.data ?? [];
```

### 5.4 Three-Tier RAG Architecture

#### Phase 1 (Now): Naive RAG — pgvector

```typescript
// server/src/rag/naive/embedder.ts
interface EmbedRequest {
  text: string;
  model?: 'text-embedding-3-small' | 'text-embedding-ada-002';
}

export async function embed(req: EmbedRequest): Promise<number[]> {
  // Use OpenAI embedding endpoint (or Groq when available)
  // Store in supabase pgvector column
}

// server/src/rag/naive/retriever.ts
export async function retrieveRelevantRules(
  query: string,
  limit = 5,
): Promise<RuleChunk[]> {
  const embedding = await embed({ text: query });
  const { data } = await supabaseAdmin.rpc('match_rule_chunks', {
    query_embedding: embedding,
    match_count: limit,
  });
  return data;
}
```

```sql
-- supabase/migrations/014_rag_chunks.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE rule_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_doc  text NOT NULL,    -- e.g. 'resume-guide', 'ats-rules'
  chunk_index integer NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536),
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_rule_chunks_embedding ON rule_chunks USING ivfflat (embedding vector_cosine_ops);

CREATE FUNCTION match_rule_chunks(query_embedding vector, match_count int)
RETURNS TABLE(id uuid, content text, similarity float)
LANGUAGE sql AS $$
  SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity
  FROM rule_chunks
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

#### Phase 2 (Future): Graph RAG

Reserved path: `server/src/rag/graph/`. Will use Apache AGE (PostgreSQL graph extension) to model relationships between evidence items, skills, companies, and job requirements. Interface is designed now so Phase 1 retrievers can be swapped.

```typescript
// server/src/rag/naive/retriever.ts — interface designed for swap
export interface RagRetriever {
  retrieveRelevantRules(query: string, limit?: number): Promise<RuleChunk[]>;
  retrieveRelatedEvidence(skillId: string, limit?: number): Promise<EvidenceItem[]>;
}
```

#### Phase 3 (Future): Agentic RAG

Reserved path: `server/src/rag/agentic/`. An autonomous retrieval agent that decides what to retrieve, retrieves it, evaluates quality, and retrieves again if needed. Built as an `AgentConfig` using the existing runtime.

---

## 6. B2B Multi-Tenancy

### 6.1 Database Schema

```sql
-- supabase/migrations/015_b2b_organizations.sql

CREATE TABLE organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE NOT NULL,
  plan_tier       text NOT NULL CHECK (plan_tier IN ('starter', 'business', 'enterprise')),
  seat_limit      integer NOT NULL DEFAULT 50,
  seats_used      integer NOT NULL DEFAULT 0,
  white_label     jsonb DEFAULT '{}',       -- { logo_url, primary_color, app_name }
  sso_config      jsonb DEFAULT '{}',       -- { provider, entity_id, cert, acs_url }
  hris_config     jsonb DEFAULT '{}',       -- { provider, api_key, sync_enabled }
  feature_flags   jsonb DEFAULT '{}',       -- per-org FF overrides
  billing_id      text,                     -- Stripe customer ID
  contract_start  date,
  contract_end    date,
  sla_tier        text DEFAULT '24h',       -- '24h' | '4h' | '2h'
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE organization_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  cohort_id       uuid REFERENCES organization_cohorts(id),
  invited_at      timestamptz,
  joined_at       timestamptz,
  status          text DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE organization_cohorts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  tags            text[] DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE organization_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_type     text NOT NULL,  -- 'weekly' | 'monthly' | 'quarterly' | 'on_demand'
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text DEFAULT 'pending',
  report_url      text,           -- S3/Storage URL for PDF
  delivered_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- RLS: Members only see their org's data
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_cohorts ENABLE ROW LEVEL SECURITY;

-- Org admins see all members in their org
CREATE POLICY org_admin_access ON organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Members see only their own record
CREATE POLICY org_member_self ON organization_members
  FOR SELECT USING (user_id = auth.uid());
```

### 6.2 JWT Claim Extension

B2B users get `organization_id` and `org_role` injected into their JWT via Supabase's custom claims hook. All RLS policies and middleware read from the JWT — no extra DB query per request.

```typescript
// Supabase auth hook (Edge Function): add-custom-claims
// Runs on every JWT issue/refresh
export default async function addCustomClaims(req: Request) {
  const { user_id } = await req.json();

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user_id)
    .eq('status', 'active')
    .maybeSingle();

  return {
    organization_id: membership?.organization_id ?? null,
    org_role: membership?.role ?? null,
  };
}
```

### 6.3 Tenant Guard Middleware

```typescript
// server/src/middleware/tenant-guard.ts
import type { Context, Next } from 'hono';

export function tenantGuard(requiredRole: 'member' | 'admin' | 'owner' = 'member') {
  return async (c: Context, next: Next) => {
    const user = c.get('user'); // Set by authMiddleware

    // JWT claims already verified by Supabase — trust them
    const orgId = user.app_metadata?.organization_id;
    const orgRole = user.app_metadata?.org_role;

    if (!orgId) {
      return c.json({ error: 'Not a member of any organization' }, 403);
    }

    const roleRank = { member: 0, admin: 1, owner: 2 };
    if (roleRank[orgRole] < roleRank[requiredRole]) {
      return c.json({ error: 'Insufficient organization permissions' }, 403);
    }

    c.set('organizationId', orgId);
    c.set('orgRole', orgRole);
    await next();
  };
}
```

### 6.4 Admin Portal — Engagement Metrics Only

The admin portal never returns personal resume content, chat history, or individual responses. It returns only engagement statistics.

```typescript
// server/src/routes/b2b-admin.ts
// GET /api/b2b/admin/dashboard
app.get('/dashboard', authMiddleware, tenantGuard('admin'), async (c) => {
  const orgId = c.get('organizationId');

  // Aggregated metrics only — never individual content
  const metrics = await supabaseAdmin.rpc('get_org_engagement_metrics', {
    org_id: orgId,
    period_days: 30,
  });

  return c.json({
    active_users: metrics.active_users,
    sessions_started: metrics.sessions_started,
    sessions_completed: metrics.sessions_completed,
    completion_rate: metrics.completion_rate,
    agents_used: metrics.agents_used,        // Which agents, not who used them
    avg_session_duration_minutes: metrics.avg_session_duration_minutes,
    // Never: user names, resume content, chat logs
  });
});
```

```sql
-- Aggregate function — returns org-level stats, never joins to personal content
CREATE FUNCTION get_org_engagement_metrics(org_id uuid, period_days int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'active_users', COUNT(DISTINCT cs.user_id),
    'sessions_started', COUNT(cs.id),
    'sessions_completed', COUNT(cs.id) FILTER (WHERE cs.pipeline_status = 'complete'),
    'completion_rate', ROUND(COUNT(cs.id) FILTER (WHERE cs.pipeline_status = 'complete')::numeric / NULLIF(COUNT(cs.id), 0) * 100, 1),
    'agents_used', array_agg(DISTINCT cs.pipeline_stage ORDER BY cs.pipeline_stage),
    'avg_session_duration_minutes', ROUND(AVG(EXTRACT(EPOCH FROM (cs.updated_at - cs.created_at))/60)::numeric, 1)
  ) INTO result
  FROM coach_sessions cs
  JOIN organization_members om ON om.user_id = cs.user_id
  WHERE om.organization_id = org_id
    AND cs.created_at > now() - make_interval(days => period_days);

  RETURN result;
END;
$$;
```

### 6.5 CSV Roster Upload Flow

```
1. Admin uploads CSV → POST /api/b2b/admin/roster/upload
2. Server validates CSV schema (email, first_name, last_name, cohort optional)
3. Background job: for each row:
   a. Check if Supabase user exists by email
   b. If not: supabase.auth.admin.inviteUserByEmail()
   c. Add to organization_members (role: member)
   d. Add to cohort if specified
4. Return job_id immediately, poll GET /api/b2b/admin/roster/status/:jobId
5. Completion webhook notifies admin via email
```

### 6.6 SSO / SAML Integration

```typescript
// server/src/b2b/sso-handler.ts
import { SAMLProvider } from './saml-provider.js'; // wrapper around node-saml

export class SSOHandler {
  // Called when user hits /auth/sso/:orgSlug
  async initiateLogin(orgSlug: string): Promise<{ redirect_url: string }> {
    const org = await getOrgBySlug(orgSlug);
    const provider = new SAMLProvider(org.sso_config);
    const url = await provider.buildAuthnRequest();
    return { redirect_url: url };
  }

  // Called by SAML callback POST /auth/sso/callback
  async handleCallback(samlResponse: string, orgSlug: string): Promise<{ session_token: string }> {
    const org = await getOrgBySlug(orgSlug);
    const provider = new SAMLProvider(org.sso_config);
    const profile = await provider.validateResponse(samlResponse);

    // Upsert Supabase user, set custom claims, return session
    const user = await upsertSSOUser(profile, org.id);
    const session = await supabaseAdmin.auth.admin.createSession({ user_id: user.id });
    return { session_token: session.data.session?.access_token ?? '' };
  }
}
```

### 6.7 HRIS Integration

```typescript
// server/src/b2b/hris-sync.ts
type HRISProvider = 'workday' | 'bamboohr' | 'adp';

interface HRISEmployee {
  email: string;
  first_name: string;
  last_name: string;
  department?: string;
  employment_status: 'active' | 'terminated';
}

export class HRISSync {
  async syncOrganization(orgId: string): Promise<HRISSyncResult> {
    const org = await getOrgById(orgId);
    const adapter = createHRISAdapter(org.hris_config.provider as HRISProvider, org.hris_config);
    const employees = await adapter.listActiveEmployees();

    // Reconcile: add new, suspend departed
    const result = await reconcileRoster(orgId, employees);

    // Log sync event
    await logHRISSync(orgId, result);
    return result;
  }
}

// Adapters follow same interface — easy to add new HRIS
interface HRISAdapter {
  listActiveEmployees(): Promise<HRISEmployee[]>;
}

class WorkdayAdapter implements HRISAdapter { /* ... */ }
class BambooHRAdapter implements HRISAdapter { /* ... */ }
class ADPAdapter implements HRISAdapter { /* ... */ }

function createHRISAdapter(provider: HRISProvider, config: unknown): HRISAdapter {
  switch (provider) {
    case 'workday': return new WorkdayAdapter(config);
    case 'bamboohr': return new BambooHRAdapter(config);
    case 'adp': return new ADPAdapter(config);
  }
}
```

---

## 7. Financial Planner Integration

### 7.1 Database Schema

```sql
-- supabase/migrations/016_financial_planner.sql

CREATE TABLE financial_planners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  firm            text,
  email           text UNIQUE NOT NULL,
  phone           text,
  geography       text[],           -- states/regions served
  asset_min       integer,          -- minimum asset level (USD)
  asset_max       integer,
  specializations text[],           -- ['retirement', 'executive_comp', 'equity', ...]
  bio             text,
  profile_url     text,
  status          text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  commission_rate numeric(5,4),     -- e.g. 0.0025 = 0.25%
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE planner_referrals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  planner_id      uuid REFERENCES financial_planners(id),
  flow_id         uuid NOT NULL UNIQUE,    -- qualification flow ID
  status          text DEFAULT 'qualifying'
                  CHECK (status IN ('qualifying', 'matched', 'handoff_sent', 'contacted', 'converted', 'closed')),
  qualification   jsonb DEFAULT '{}',      -- gate responses
  current_gate    integer DEFAULT 1,       -- 1-5
  matched_at      timestamptz,
  handoff_doc_id  uuid,
  contacted_at    timestamptz,
  sla_deadline    timestamptz,             -- 48h from handoff
  commission_id   uuid REFERENCES planner_commissions(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE planner_commissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planner_id      uuid NOT NULL REFERENCES financial_planners(id),
  referral_id     uuid NOT NULL REFERENCES planner_referrals(id),
  amount_cents    integer NOT NULL,
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending', 'earned', 'paid', 'voided')),
  earned_at       timestamptz,
  paid_at         timestamptz,
  payment_ref     text,
  created_at      timestamptz DEFAULT now()
);

-- RLS: users see only their own referrals
ALTER TABLE planner_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_user_access ON planner_referrals
  FOR ALL USING (user_id = auth.uid());
```

### 7.2 Five-Gate Qualification FSM

```typescript
// server/src/financial-planner/qualification-gate.ts

export const QUALIFICATION_GATES: QualificationGate[] = [
  {
    gate: 1,
    id: 'career_stage',
    question: 'What best describes your current career situation?',
    type: 'single_choice',
    options: ['Actively job searching', 'Exploring opportunities', 'Recently hired', 'Settled in role'],
    disqualify: [], // All responses proceed
  },
  {
    gate: 2,
    id: 'compensation_level',
    question: 'What is your current or target total compensation range?',
    type: 'single_choice',
    options: ['Under $150K', '$150K-$250K', '$250K-$500K', 'Over $500K'],
    disqualify: ['Under $150K'], // Refer to different resource
    disqualify_message: 'A financial planner may not be the right fit yet. Consider our financial wellness resources.',
  },
  {
    gate: 3,
    id: 'investable_assets',
    question: 'What is your approximate investable asset level (excluding home)?',
    type: 'single_choice',
    options: ['Under $250K', '$250K-$500K', '$500K-$1M', 'Over $1M'],
    disqualify: ['Under $250K'],
  },
  {
    gate: 4,
    id: 'primary_concern',
    question: 'What financial topic is most important to you right now?',
    type: 'multi_choice',
    options: ['Equity/RSU planning', 'Retirement bridge', 'Estate planning', 'Tax optimization', 'Insurance gaps', 'Wealth accumulation'],
    disqualify: [],
  },
  {
    gate: 5,
    id: 'timeline',
    question: 'When would you like to connect with a financial planner?',
    type: 'single_choice',
    options: ['Within 1 week', 'Within 1 month', 'Within 3 months', 'Just exploring'],
    disqualify: ['Just exploring'], // Soft disqualify — save referral for later
    soft_disqualify_message: 'No problem! We will remind you when you are ready.',
  },
];

export class QualificationFSM {
  async processGate(flowId: string, gateNumber: number, response: string): Promise<GateResult> {
    const gate = QUALIFICATION_GATES.find(g => g.gate === gateNumber);
    if (!gate) throw new Error(`Invalid gate: ${gateNumber}`);

    // Check hard disqualification
    if (gate.disqualify.includes(response)) {
      await this.disqualify(flowId, gate.disqualify_message ?? 'Not a match at this time');
      return { status: 'disqualified', message: gate.disqualify_message };
    }

    // Check soft disqualification
    if (gate.soft_disqualify && gate.soft_disqualify_condition?.(response)) {
      await this.softDisqualify(flowId);
      return { status: 'deferred', message: gate.soft_disqualify_message };
    }

    // Persist gate response
    await this.persistGateResponse(flowId, gateNumber, response);

    // Advance to next gate or complete
    if (gateNumber === 5) {
      await this.completeQualification(flowId);
      return { status: 'qualified', next_gate: null };
    }

    return { status: 'proceed', next_gate: gateNumber + 1 };
  }
}
```

### 7.3 Planner Matching Algorithm

```typescript
// server/src/financial-planner/matcher.ts

interface MatchCriteria {
  geographic_state: string;
  asset_level: number;                // USD
  primary_concerns: string[];
  compensation_range: string;
}

export async function matchPlanners(criteria: MatchCriteria): Promise<FinancialPlanner[]> {
  const { data: planners } = await supabaseAdmin
    .from('financial_planners')
    .select('*')
    .eq('status', 'active')
    .contains('geography', [criteria.geographic_state])
    .lte('asset_min', criteria.asset_level)
    .gte('asset_max', criteria.asset_level);

  if (!planners?.length) return [];

  // Score by specialization match
  const scored = planners.map(planner => {
    const specializationScore = criteria.primary_concerns.filter(
      concern => planner.specializations.includes(concern)
    ).length / criteria.primary_concerns.length;

    return { planner, score: specializationScore };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.planner);
}
```

### 7.4 Handoff Document Generation

The handoff document is the one place in the financial planner integration where the LLM runs. It is a single direct LLM call (not an agent loop) using `MODEL_PRIMARY`:

```typescript
// server/src/financial-planner/handoff-generator.ts
export async function generateHandoffDocument(
  referral: PlannerReferral,
  userProfile: UserPositioningProfile,
): Promise<HandoffDocument> {
  const prompt = buildHandoffPrompt(referral, userProfile);

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    system: HANDOFF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2048,
    session_id: `handoff:${referral.id}`,
  });

  const doc = parseHandoffDocument(response.text);

  // Persist to storage and record
  const docUrl = await uploadHandoffPDF(doc, referral.id);
  await supabaseAdmin.from('planner_referrals')
    .update({ handoff_doc_id: doc.id })
    .eq('id', referral.id);

  return doc;
}
```

### 7.5 SLA Monitor

```typescript
// server/src/financial-planner/sla-monitor.ts
// Runs as a background cron job every 15 minutes

export async function checkPlannerSLAs(): Promise<void> {
  const now = new Date();

  // Find referrals in 'handoff_sent' status past SLA deadline
  const { data: overdue } = await supabaseAdmin
    .from('planner_referrals')
    .select('*, financial_planners(*)')
    .eq('status', 'handoff_sent')
    .lt('sla_deadline', now.toISOString());

  for (const referral of overdue ?? []) {
    // Escalate: notify operations team
    await notifyOpsTeam({
      type: 'sla_breach',
      referral_id: referral.id,
      planner_name: referral.financial_planners.name,
      hours_overdue: (now.getTime() - new Date(referral.sla_deadline).getTime()) / 3_600_000,
    });

    // Log SLA breach
    logger.error({ referral_id: referral.id }, 'Planner SLA breach — 48h contact window missed');
  }
}
```

---

## 8. Background Processing

### 8.1 Queue Architecture

**Technology:** BullMQ on Redis. Feature-flagged (`FF_BACKGROUND_QUEUE`). Falls back to in-process `setTimeout` when Redis unavailable (development).

```typescript
// server/src/background/queue.ts
import { Queue, Worker } from 'bullmq';

export const QUEUES = {
  orchestratorRecompute: 'orchestrator-recompute',
  companyMonitor: 'company-monitor',
  contentCalendar: 'content-calendar',
  leadScoring: 'lead-scoring',
  reportDelivery: 'report-delivery',
  qualityScoring: 'quality-scoring',
  slaMonitor: 'sla-monitor',
  hrisSync: 'hris-sync',
} as const;

// Queue definitions with defaults
export const orchestratorQueue = new Queue(QUEUES.orchestratorRecompute, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 500,
  },
});
```

### 8.2 Async vs Real-Time Decision Matrix

| Task | Mode | Trigger | Frequency |
|------|------|---------|-----------|
| Orchestrator recompute | Async background | Pipeline complete | Per completion |
| Company monitoring | Async background | Daily cron | Daily |
| Content calendar generation | Async background | User request | Per request |
| Lead scoring | Async background | New job saved | Per save |
| Quality scoring | Async background | Session complete | Per completion |
| Report delivery (B2B) | Async background | Schedule / cron | Weekly/monthly |
| HRIS sync | Async background | Cron / webhook | Daily |
| SLA monitoring | Async background | Cron every 15min | Continuous |
| Handoff document generation | Real-time (fast LLM) | Qualification complete | Per qualification |
| Recommendation read | Real-time | Page load | Every load |
| Evidence retrieval | Real-time | Agent tool call | Per tool call |
| Resume export PDF | Real-time | User click | Per export |

### 8.3 Worker Pattern

All workers follow the same pattern — they do not run agent loops. Agents run in response to user actions. Background workers do pre-computation and data enrichment.

```typescript
// server/src/background/workers/orchestrator-recompute.worker.ts
import { Worker } from 'bullmq';

const worker = new Worker(QUEUES.orchestratorRecompute, async (job) => {
  const { userId, trigger, completed_capability } = job.data;

  const journeyState = await buildJourneyState(userId);
  const recommendations = computeRecommendations(journeyState);
  const texts = await generateRecommendationText(recommendations, journeyState);

  // Write to DB — frontend reads this cache
  await supabaseAdmin
    .from('user_recommendations')
    .upsert({
      user_id: userId,
      recommendations: texts,
      computed_at: new Date().toISOString(),
      trigger,
    }, { onConflict: 'user_id' });

  logger.info({ userId, trigger, count: texts.length }, 'Orchestrator recompute complete');
}, { connection: redisConnection, concurrency: 20 });
```

### 8.4 Company Monitoring Worker

```typescript
// server/src/background/workers/company-monitor.worker.ts
// Runs daily for each company the user is targeting

const worker = new Worker(QUEUES.companyMonitor, async (job) => {
  const { userId, company_name, session_id } = job.data;

  // Company Monitor uses the agent loop for intelligence gathering
  // This is one case where a background worker runs an agent loop
  const monitorState = await buildCompanyMonitorState(userId, company_name);

  const result = await runProductPipeline(
    createCompanyMonitorProductConfig(monitorState),
    {
      sessionId: session_id,
      userId,
      emit: (event) => { /* no SSE — store events in DB */ },
      waitForUser: async () => { /* no gates in monitoring mode */ },
      input: monitorState,
    },
  );

  await persistMonitoringResults(userId, company_name, result.state);
}, { connection: redisConnection, concurrency: 5 }); // Lower concurrency — these use LLM
```

---

## 9. Monitoring and Quality

### 9.1 Cost Tracking Per Agent

Extend the existing `startUsageTracking()` / `stopUsageTracking()` with per-agent granularity:

```typescript
// server/src/lib/cost-tracker.ts

interface CostRecord {
  user_id: string;
  session_id: string;
  agent_domain: string;
  agent_name: string;
  input_tokens: number;
  output_tokens: number;
  model: string;
  estimated_cost_usd: number;
  recorded_at: string;
}

// Called at agent phase completion in product-coordinator.ts
export async function recordAgentCost(record: CostRecord): Promise<void> {
  await supabaseAdmin.from('agent_cost_log').insert(record);
}
```

```sql
-- supabase/migrations/017_cost_tracking.sql
CREATE TABLE agent_cost_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id),
  session_id          uuid REFERENCES coach_sessions(id),
  agent_domain        text NOT NULL,
  agent_name          text NOT NULL,
  model               text NOT NULL,
  input_tokens        integer NOT NULL,
  output_tokens       integer NOT NULL,
  estimated_cost_usd  numeric(10,6) NOT NULL,
  recorded_at         timestamptz DEFAULT now()
);

CREATE INDEX idx_cost_user ON agent_cost_log(user_id, recorded_at DESC);
CREATE INDEX idx_cost_agent ON agent_cost_log(agent_domain, agent_name, recorded_at DESC);

-- Materialized view for dashboard queries (refresh hourly)
CREATE MATERIALIZED VIEW agent_cost_summary AS
SELECT
  agent_domain,
  agent_name,
  date_trunc('day', recorded_at) AS day,
  COUNT(DISTINCT session_id) AS sessions,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(estimated_cost_usd) AS total_cost_usd,
  AVG(estimated_cost_usd) AS avg_cost_per_session
FROM agent_cost_log
GROUP BY agent_domain, agent_name, date_trunc('day', recorded_at);
```

### 9.2 Quality Scoring Pipeline

Each session gets a quality score 24 hours after completion. This runs as a background job, sampling 10 random sessions per agent per day.

```typescript
// server/src/lib/quality-scorer.ts

interface QualityScore {
  session_id: string;
  agent_domain: string;
  overall_score: number;     // 0-100
  dimensions: {
    coherence: number;        // Output makes sense
    completeness: number;     // All sections/outputs generated
    authenticity: number;     // No fabrication markers
    user_edit_rate: number;   // % of output user edited (lower = better)
    regen_rate: number;       // Did user request regeneration?
  };
  scored_at: string;
  scorer_model: string;
}

// Single LLM call (MODEL_LIGHT) on a sample of outputs
async function scoreSession(sessionId: string): Promise<QualityScore> {
  const session = await loadSessionOutputs(sessionId);
  const sampleOutputs = session.outputs.slice(0, 3); // Cap at 3 outputs

  const prompt = buildQualityScoringPrompt(sampleOutputs);
  const response = await llm.chat({
    model: MODEL_LIGHT,
    system: QUALITY_SCORER_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 256,
    session_id: `quality:${sessionId}`,
  });

  return parseQualityScore(response.text, sessionId);
}
```

### 9.3 Operational Metrics Dashboard

```typescript
// server/src/routes/quality.ts
// GET /api/quality/agent/:domain — aggregate quality for an agent

interface AgentQualityAggregate {
  agent_domain: string;
  period_days: number;
  session_count: number;
  avg_quality_score: number;
  completion_rate: number;        // % sessions that completed (not errored)
  avg_user_edit_rate: number;     // % of outputs users edited
  avg_regen_rate: number;         // % sessions with regenerations
  avg_cost_usd: number;           // Per session
  error_rate: number;             // % sessions with pipeline_error
  p95_duration_seconds: number;   // 95th percentile pipeline duration
}
```

### 9.4 Alert Thresholds

```typescript
// server/src/lib/quality-scorer.ts — alert conditions
const ALERT_THRESHOLDS = {
  error_rate_pct: 2,              // Alert if >2% error rate per hour
  avg_quality_below: 70,          // Alert if quality score drops below 70
  completion_rate_below: 80,      // Alert if completion rate drops below 80%
  avg_cost_above_usd: 0.50,       // Alert if avg session cost exceeds $0.50
  p95_duration_above_seconds: 300, // Alert if 95th percentile exceeds 5 min
};

// Checks run as part of the hourly quality scoring cron job
// Sends to Sentry (already integrated) + optional PagerDuty webhook
```

---

## 10. Scale Strategy

### 10.1 Current Architecture Limits

The existing single-process Hono server with in-memory state has these limits:

| Resource | Current Limit | Reason |
|----------|--------------|--------|
| Concurrent SSE connections | ~1000 | Node.js event loop, memory |
| In-process pipeline tracking | 5000 (`MAX_IN_PROCESS_PIPELINES`) | Map size |
| Agent bus | Single process | In-memory Map |
| Rate limiter | Single process | In-memory counters |
| Session locks | DB-backed | Already multi-process safe |

### 10.2 Horizontal Scale Path

**Phase 1 (0-10K users): Single process, current architecture.**
- Supabase handles the data layer (already scales)
- Add pgBouncer connection pooling (Supabase built-in)
- Increase Node.js memory limit: `--max-old-space-size=4096`
- Rate limiter: flip `FF_REDIS_RATE_LIMIT=true` when >500 concurrent users

**Phase 2 (10K-50K users): Multiple processes, shared Redis.**
```
Load Balancer (sticky sessions for SSE)
   ├── Node process 1 (port 3001)
   ├── Node process 2 (port 3002)
   └── Node process 3 (port 3003)

Shared state:
   ├── Redis — rate limiting, queue, agent bus (FF_REDIS_BUS=true)
   ├── Supabase — all persistent state, session locks
   └── S3/Supabase Storage — PDF exports, handoff docs
```

SSE connections require sticky sessions. Use Nginx `ip_hash` or cookie-based affinity.

**Phase 3 (50K-100K+ users): Separate services.**
```
API Gateway (Nginx / Cloudflare)
   ├── resume-service     (Agents #1-3, highest load)
   ├── agent-service      (All other agents)
   ├── orchestrator-service (Recommendations, read-heavy)
   ├── b2b-service        (Enterprise portal)
   ├── background-service (Workers only, no HTTP)
   └── admin-service      (Internal tools)
```

Each service runs the same codebase with `ENABLED_DOMAINS` env var restricting which agents load. The `AgentRegistry` only registers agents for enabled domains.

### 10.3 Connection Pooling

```typescript
// server/src/lib/supabase.ts — already uses service key
// Add connection pool configuration for high load:

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: {
    schema: 'public',
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    // Supabase JS uses fetch internally — no pool config needed
    // pgBouncer is configured at the Supabase project level
    // Use the pooler connection string in SUPABASE_URL for high load:
    // postgresql://user:pass@db.supabase.co:6543/postgres (port 6543 = pgBouncer)
  },
});
```

### 10.4 Caching Strategy

```
Layer 1: Process memory (fastest, single process only)
  - Model routing table (MODEL_PRIMARY etc.) — static, never expires
  - Agent registry — static, loaded at startup
  - Feature flags — static, reloaded on SIGHUP

Layer 2: Redis (shared, TTL-based)
  - Orchestrator recommendations — TTL 4 hours, invalidated on pipeline complete
  - Org branding config — TTL 1 hour
  - User subscription tier — TTL 15 min (billing cache)
  - Financial planner list — TTL 24 hours

Layer 3: Supabase (persistent)
  - All session state
  - All user data
  - All pipeline results
  - Quality scores
  - Cost logs
```

```typescript
// server/src/lib/cache.ts — simple Redis cache wrapper
export class Cache {
  async get<T>(key: string): Promise<T | null> { /* ... */ }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> { /* ... */ }
  async del(key: string): Promise<void> { /* ... */ }
  async invalidatePattern(pattern: string): Promise<void> { /* ... */ }
}

export const cache = new Cache();

// Usage in orchestrator recommendations:
export async function getRecommendations(userId: string): Promise<OrchestratorRecommendationsResponse> {
  const cacheKey = `recommendations:${userId}`;
  const cached = await cache.get<OrchestratorRecommendationsResponse>(cacheKey);
  if (cached) return cached;

  const data = await loadRecommendationsFromDB(userId);
  await cache.set(cacheKey, data, 14_400); // 4 hours
  return data;
}
```

### 10.5 LLM Rate Limit Management

```typescript
// server/src/lib/llm-provider.ts — extend with per-model rate limiting

const GROQ_RATE_LIMITS = {
  'llama-3.3-70b-versatile': { rpm: 100, tpm: 6_000_000 },
  'meta-llama/llama-4-scout-17b-16e-instruct': { rpm: 300, tpm: 30_000_000 },
  'llama-3.1-8b-instant': { rpm: 500, tpm: 30_000_000 },
};

// At 100K users, 20 sessions/month = 2M sessions/month = ~1,500 sessions/hour
// Average pipeline uses 50 LLM calls on 70B → 75,000 RPM needed
// Groq hard limit: 100 RPM on 70B → requires 750 parallel Groq accounts OR:
//   1. Distribute across providers (Groq + Z.AI + Anthropic)
//   2. Queue at LLM layer — session starts queue, priority by subscription tier
//   3. Intelligent model downgrade: use Scout when 70B is rate-limited
```

---

## 11. Security Architecture

### 11.1 Auth Flows

```
B2C (Individual users):
User → Supabase Auth (email/password or OAuth)
     → JWT with sub (user_id)
     → authMiddleware verifies JWT signature
     → RLS uses auth.uid()

B2B (Organization employees — email/password):
User → Supabase Auth
     → Custom claims hook adds organization_id, org_role
     → JWT with sub + org claims
     → authMiddleware + tenantGuard verify org membership

B2B (SSO):
User → /auth/sso/:orgSlug
     → SSOHandler.initiateLogin() → redirect to IdP
     → IdP → POST /auth/sso/callback (SAML response)
     → SSOHandler.handleCallback() → upsert Supabase user
     → Supabase session with org claims
     → Same JWT path as above
```

### 11.2 Data Classification and Enforcement

```typescript
// Data classification for all tables
type DataClass =
  | 'PUBLIC'      // Can be logged, shown in admin, exported freely
  | 'INTERNAL'    // Platform metrics, can be shown to B2B admins in aggregate
  | 'PERSONAL'    // PII — never in logs, never in B2B admin, encrypt at rest
  | 'SENSITIVE'   // Resume content, financial data — encrypt at rest, audit every access

// Classification map (enforced by code review checklist, not runtime)
const DATA_CLASSIFICATION: Record<string, DataClass> = {
  'coach_sessions.id':                   'INTERNAL',
  'coach_sessions.pipeline_status':      'INTERNAL',
  'coach_sessions.pipeline_stage':       'INTERNAL',
  'coach_sessions.pipeline_state':       'SENSITIVE',  // Contains resume content
  'users.email':                         'PERSONAL',
  'users.id':                            'INTERNAL',
  'resumes.*':                           'SENSITIVE',
  'evidence_library.*':                  'SENSITIVE',
  'user_platform_context.*':             'SENSITIVE',
  'planner_referrals.*':                 'SENSITIVE',
  'planner_commissions.amount_cents':    'SENSITIVE',
  'organizations.name':                  'INTERNAL',
  'organizations.sso_config':            'SENSITIVE',  // Contains SAML certs
  'organizations.hris_config':           'SENSITIVE',  // Contains API keys
  'agent_cost_log.*':                    'INTERNAL',
};
```

### 11.3 RLS Policy Pattern

Every table follows the pattern established in the existing codebase:

```sql
-- Pattern for all new tables:
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- Users access their own rows
CREATE POLICY user_own_access ON new_table
  FOR ALL USING (user_id = auth.uid());

-- B2B org admins access org members' rows (aggregate only, no personal content)
-- Applied at the view/function level, not the table level, for personal content tables

-- Service key (admin client) bypasses all RLS
-- This is the existing Supabase pattern — maintained for all new tables
```

### 11.4 SSRF Protection

The existing SSRF protection in `route-hooks.ts` (DNS resolution check for JD URLs) applies to all products that accept external URLs. Every new agent that fetches external content must use the existing SSRF guard:

```typescript
// Reused from server/src/agents/resume/route-hooks.ts
import { assertSafeUrl } from '../agents/resume/route-hooks.js';

// In any agent tool that fetches external URLs:
async function researchCompany(url: string, ctx: AgentContext): Promise<CompanyData> {
  await assertSafeUrl(url); // Throws if private IP or reserved range
  const data = await fetch(url, { signal: ctx.signal });
  // ...
}
```

### 11.5 Audit Logging

```typescript
// server/src/lib/audit-log.ts

interface AuditEvent {
  actor_id: string;          // user_id performing the action
  actor_org_id?: string;     // organization_id if B2B
  action: string;            // e.g. 'pipeline.start', 'admin.roster.upload'
  resource_type: string;     // e.g. 'session', 'organization', 'referral'
  resource_id: string;
  metadata: Record<string, unknown>; // Non-sensitive context
  ip_address: string;
  user_agent: string;
  timestamp: string;
}

// Immutable — INSERT only, never UPDATE or DELETE
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  await supabaseAdmin.from('audit_log').insert(event);
}
```

```sql
-- supabase/migrations/018_audit_log.sql
CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid NOT NULL,
  actor_org_id  uuid,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   text NOT NULL,
  metadata      jsonb DEFAULT '{}',
  ip_address    inet,
  user_agent    text,
  timestamp     timestamptz DEFAULT now()
);

-- Partition by month for performance at scale
-- For now: index only
CREATE INDEX idx_audit_actor ON audit_log(actor_id, timestamp DESC);
CREATE INDEX idx_audit_org ON audit_log(actor_org_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action, timestamp DESC);

-- No RLS — only service key can read (admin operations only)
-- No UPDATE or DELETE policies — append-only by design
```

### 11.6 HRIS API Key Storage

HRIS config (API keys, credentials) stored in `organizations.hris_config` must be encrypted at rest. Supabase does not encrypt specific columns natively — use application-level encryption:

```typescript
// server/src/b2b/hris-sync.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.HRIS_ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encryptHRISConfig(config: HRISConfig): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptHRISConfig(ciphertext: string): HRISConfig {
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, 16);
  const authTag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as HRISConfig;
}
```

---

## 12. Migration Roadmap

### 12.1 Phase 1 (Now — Agents #1-20 complete)

**Status:** Agents #1-20 built. Runtime is stable.

**Remaining work to complete Phase 1:**
1. Add `FF_*` flags for agents #7-9, #13-16 in `feature-flags.ts` — 1 day
2. Wire remaining agents into `index.ts` via `createProductRoutes()` — 1 day per agent
3. Add `evidence_library` table migration (#013) — 0.5 days
4. Extend `platform-context.ts` with new context types — 1 day
5. Background queue infrastructure (BullMQ setup) — 2 days

### 12.2 Phase 2 (Agents #21-26 + Platform Orchestrator)

**Sequencing:**
1. Platform Orchestrator recommendation engine (no LLM dependency — pure scoring logic) — 3 days
2. Orchestrator recompute background worker — 1 day
3. Agents #21-26 following the established `product.ts` + route factory pattern — 2 days each
4. Company Monitor background worker — 2 days

### 12.3 Phase 3 (B2B Enterprise — Agents #31-33)

**Sequencing:**
1. Organization / membership DB schema (migration #015) — 1 day
2. JWT custom claims hook (Supabase Edge Function) — 1 day
3. `tenantGuard` middleware — 1 day
4. B2B admin routes (engagement metrics only) — 2 days
5. CSV roster importer — 2 days
6. Agent #33 (B2B Onboarding) — 3 days
7. Agent #32 (B2B Reporting) — 3 days
8. SSO handler (SAML) — 3 days
9. HRIS adapters (Workday, BambooHR, ADP) — 2 days each

### 12.4 Phase 4 (Financial Planner Network)

**Sequencing:**
1. Financial planner DB schema (migration #016) — 1 day
2. Qualification FSM — 2 days
3. Planner matching algorithm — 1 day
4. Handoff document generator — 1 day
5. Commission tracker — 2 days
6. SLA monitor cron job — 1 day

### 12.5 Phase 5 (Scale Infrastructure)

Triggered when user count exceeds 5K active monthly:
1. Enable `FF_REDIS_RATE_LIMIT=true` — zero code changes
2. Enable `FF_REDIS_BUS=true` — zero code changes (already built in `agent-bus-redis.ts`)
3. Add `FF_BACKGROUND_QUEUE=true` — BullMQ workers activate
4. Move to multi-process: Nginx sticky-session load balancer
5. Enable pgBouncer connection string in `SUPABASE_URL`

---

## Appendix A: Data Flow Diagrams

### A.1 Resume → LinkedIn Cross-Agent Flow

```
User completes resume pipeline
         │
         ▼
product-coordinator.ts: finalizeResult()
         │
         ├──▶ upsertUserContext('positioning_strategy')   ← writes to DB
         │
         └──▶ backgroundQueue.add('orchestrator-recompute')
                        │
                        ▼
              orchestrator-recompute.worker.ts
                        │
                        ├── buildJourneyState(userId)
                        │       └── reads user_platform_context
                        │           completed agents: ['resume_writing']
                        │
                        ├── computeRecommendations(state)
                        │       └── linkedin_optimization scores high (prereq met)
                        │
                        └── writes to user_recommendations table

User opens dashboard
         │
         ▼
GET /api/orchestrator/recommendations
         │
         ▼
reads user_recommendations from DB (<50ms)
         │
         ▼
Frontend: "Most Important Action Today"
  ┌─────────────────────────────────────┐
  │ Optimize your LinkedIn profile      │
  │ Your resume is complete. Recruiters │
  │ search LinkedIn 3x more than job    │
  │ boards. Make your profile match.    │
  │                                     │
  │ [Start LinkedIn Optimizer]          │
  └─────────────────────────────────────┘

User clicks "Start LinkedIn Optimizer"
         │
         ▼
POST /api/linkedin-optimizer/start
         │
         ▼
createInitialState():
  ├── getUserContext(userId, 'positioning_strategy')
  │       └── reads resume positioning (set by resume pipeline)
  │           authentic_phrases, top_capabilities, positioning_angle
  └── builds LinkedIn optimizer state pre-loaded with positioning data

LinkedIn Optimizer runs — no re-interview needed
Uses the positioning profile from resume pipeline
         │
         ▼
LinkedIn section content matches resume positioning
```

### A.2 B2B Pipeline

```
B2B Admin uploads CSV roster
         │
         ├──▶ POST /api/b2b/admin/roster/upload
         │         tenantGuard('admin') ✓
         │         rosterImporter.validateCSV()
         │         backgroundQueue.add('roster-import')
         │         returns { job_id }
         │
         ▼
Background: roster-import.worker.ts
  For each row:
  ├── supabase.auth.admin.inviteUserByEmail()
  ├── organization_members.insert({ role: 'member' })
  └── email sent to employee

Employee clicks email link
         │
         ▼
Supabase Auth confirms account
JWT issued with organization_id claim
         │
         ▼
Employee uses platform normally
All agent pipelines run as B2C (no difference in agent behavior)
Organization context only affects:
  ├── feature flag overrides (from org.feature_flags)
  ├── branding (white-label logo/colors)
  └── usage tracked under org_id

Admin views dashboard
         │
         ▼
GET /api/b2b/admin/dashboard
  tenantGuard('admin') ✓
  supabase.rpc('get_org_engagement_metrics')
  ├── active_users: 47
  ├── sessions_started: 203
  ├── completion_rate: 84%
  └── agents_used: ['resume', 'cover-letter', 'interview-prep']
  NEVER: individual names, content, or responses
```

### A.3 Financial Planner Referral Flow

```
User completes retirement-bridge agent pipeline
         │
         ▼
Pipeline state includes compensation + asset estimates
         │
         ├──▶ upsertUserContext('positioning_strategy')
         │         includes compensation_target
         │
         └──▶ backgroundQueue.add('orchestrator-recompute')
                        └── financial_planning recommendation scores high

User sees recommendation: "Connect with a Financial Planner"
         │
         ▼
POST /api/financial-planner/qualify/start
  creates planner_referrals row (status: 'qualifying', current_gate: 1)
  returns { flow_id, gate: QualificationGate }
         │
         ▼
Gate 1: "What best describes your career situation?"
User responds → POST /api/financial-planner/qualify/:flowId/respond
QualificationFSM.processGate(flowId, 1, response)
  → proceeds
         │
Gate 2: Compensation level ($250K-$500K) → proceeds
Gate 3: Assets ($500K-$1M) → proceeds
Gate 4: Primary concern (Equity/RSU, Retirement bridge) → proceeds
Gate 5: Timeline (Within 1 month) → qualified
         │
         ▼
qualification complete → status: 'qualified'
         │
         ▼
GET /api/financial-planner/match/:flowId
  matchPlanners({ geography: 'CA', asset_level: 750000, concerns: ['equity', 'retirement'] })
  returns top 3 matched planners
         │
         ▼
User selects planner → POST /api/financial-planner/handoff/generate
  generateHandoffDocument(referral, userProfile)
  ├── LLM call (MODEL_PRIMARY, single call, not agent loop)
  │       Generates: career summary, financial needs, conversation starters
  ├── uploads to Supabase Storage
  └── planner_referrals.status = 'handoff_sent'
      planner_referrals.sla_deadline = now() + 48h
         │
         ▼
Planner receives email with handoff document
SLA monitor cron runs every 15 min:
  if handoff_sent AND sla_deadline < now():
    notifyOpsTeam('sla_breach')

Planner contacts user → status: 'contacted'
User becomes client → status: 'converted'
  commission_tracker.markEarned(commissionId)
```

---

## Appendix B: New TypeScript Interfaces

### B.1 Platform Orchestrator Types

```typescript
// server/src/agents/platform-orchestrator/types.ts

export type AgentCapability =
  | 'resume_writing' | 'cover_letter' | 'linkedin_optimization'
  | 'content_creation' | 'job_discovery' | 'interview_coaching'
  | 'salary_strategy' | 'networking' | 'reference_management'
  | 'financial_planning' | 'emotional_support' | 'skills_assessment'
  | 'contract_management' | 'talent_sourcing' | 'market_intelligence'
  | 'network_mapping' | 'pr_content' | 'social_media'
  | 'quality_assurance' | 'orchestration' | 'b2b_reporting' | 'b2b_onboarding';

export interface JourneyState {
  userId: string;
  completed_agents: AgentCapability[];
  in_progress_agents: AgentCapability[];
  active_job_applications: {
    id: string;
    company_name: string;
    role_title: string;
    applied_at: string;
    has_cover_letter: boolean;
    interview_date?: string;
  }[];
  subscription_tier: 'free' | 'pro' | 'enterprise';
  days_since_last_session: number;
  positioning_profile_complete: boolean;
  evidence_library_size: number;
}

export interface OrchestratorRecommendation {
  id: string;
  action_type: AgentCapability;
  agent_domain: string;
  priority: 1 | 2 | 3 | 4 | 5;
  title: string;
  rationale: string;
  cta_label: string;
  cta_url: string;
  context_data: Record<string, unknown>;
  computed_at: string;
}

export interface ScoringRule {
  base: number;
  prerequisite: AgentCapability[];
  repeatable?: boolean;
  boost?: (state: JourneyState) => number;
  time_modifier?: (state: JourneyState) => number;
}
```

### B.2 B2B Types

```typescript
// server/src/b2b/types.ts

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan_tier: 'starter' | 'business' | 'enterprise';
  seat_limit: number;
  seats_used: number;
  white_label: {
    logo_url?: string;
    primary_color?: string;
    app_name?: string;
    favicon_url?: string;
  };
  sso_config: {
    provider?: 'saml' | 'oidc';
    entity_id?: string;
    acs_url?: string;
    cert?: string;             // PEM encoded — encrypted at rest
    enabled: boolean;
  };
  hris_config: {
    provider?: 'workday' | 'bamboohr' | 'adp';
    api_key_encrypted?: string; // Application-encrypted
    sync_enabled: boolean;
    last_sync_at?: string;
  };
  feature_flags: Record<string, boolean>; // Per-org FF overrides
  sla_tier: '24h' | '4h' | '2h';
  contract_start?: string;
  contract_end?: string;
}

export interface OrgEngagementMetrics {
  active_users: number;
  sessions_started: number;
  sessions_completed: number;
  completion_rate: number;
  agents_used: string[];
  avg_session_duration_minutes: number;
  period_days: number;
  computed_at: string;
  // Explicit: no user names, no session content, no personal data
}
```

### B.3 Financial Planner Types

```typescript
// server/src/financial-planner/types.ts

export interface FinancialPlanner {
  id: string;
  name: string;
  firm?: string;
  email: string;
  phone?: string;
  geography: string[];
  asset_min: number;
  asset_max: number;
  specializations: FinancialSpecialization[];
  bio?: string;
  profile_url?: string;
  status: 'active' | 'inactive' | 'suspended';
  commission_rate: number;
}

export type FinancialSpecialization =
  | 'retirement' | 'equity_compensation' | 'estate_planning'
  | 'tax_optimization' | 'insurance' | 'wealth_accumulation'
  | 'executive_compensation' | 'stock_options' | 'deferred_compensation';

export interface QualificationGate {
  gate: number;
  id: string;
  question: string;
  type: 'single_choice' | 'multi_choice';
  options: string[];
  disqualify: string[];
  disqualify_message?: string;
  soft_disqualify?: boolean;
  soft_disqualify_message?: string;
}

export type GateResult =
  | { status: 'proceed'; next_gate: number }
  | { status: 'qualified'; next_gate: null }
  | { status: 'disqualified'; message: string }
  | { status: 'deferred'; message: string };

export interface HandoffDocument {
  id: string;
  referral_id: string;
  career_summary: string;          // 150 words, generated by LLM
  financial_context: string;       // Compensation range, assets, concerns
  conversation_starters: string[]; // 3 LLM-generated talking points
  next_steps: string[];
  generated_at: string;
  doc_url: string;                 // Storage URL
}
```

---

*This document represents the complete backend architecture for CareerIQ.app at 100K+ users. All patterns extend the existing runtime without modification to core infrastructure files. Build in the sequence specified in Section 12 to maintain working product at each phase.*
