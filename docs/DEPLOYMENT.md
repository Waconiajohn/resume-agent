# Deployment Runbook — Resume Agent Platform

**Last updated:** 2026-04-30
**Sprint:** Rollout hardening

---

## Architecture Overview

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Vercel      │       │   Railway     │       │   Supabase    │
│   (Frontend)  │──────▶│   (Backend)   │──────▶│   (Database)  │
│   Vite SPA    │       │   Hono/Node   │       │   PostgreSQL  │
└──────────────┘       └──────────────┘       └──────────────┘
                                │
                                ▼
                        ┌──────────────┐
                        │   Groq / Z.AI │
                        │   LLM API     │
                        └──────────────┘
```

- **Frontend**: Vercel — static Vite SPA build, served from CDN
- **Backend**: Railway — Hono + Node.js server, long-lived SSE connections
- **Database**: Supabase — PostgreSQL with RLS policies
- **LLM**: Groq (primary, ~$0.08/pipeline) or Z.AI GLM (fallback)

---

## Prerequisites

Before deploying, verify:

- [ ] Railway account exists with a project configured for the `server/` directory
- [ ] Vercel account exists with a project configured for the `app/` directory
- [ ] Supabase production project created (separate from dev/staging)
- [ ] All DB migrations applied to the production Supabase project (see Database section)
- [ ] Domain DNS configured:
  - `api.careeragent.ai` (or equivalent) pointed to Railway deployment
  - `app.careeragent.ai` (or equivalent) pointed to Vercel deployment
- [ ] Groq API key obtained from console.groq.com (or Z.AI key as fallback)
- [ ] Perplexity API key obtained (required for company research tool)
- [ ] SerpApi API key obtained (required for Broad Search and Insider Jobs structured listings)
- [ ] Serper API key obtained (required while legacy Job Finder remains enabled; supplemental for public-link discovery)
- [ ] Stripe account configured (secret key, webhook secret, pricing plans seeded)
- [ ] Sentry project created and DSN obtained

---

## Step 1: Apply Database Migrations

Apply migrations before deploying application code. The server will fail health checks if the DB schema is out of date.

### Apply all migrations

```bash
# Link Supabase CLI to production project
supabase link --project-ref <production-project-ref>

# Apply all pending migrations
supabase db push --linked
```

### Verify schema is current

```bash
# Should show no diff if all migrations are applied
supabase db diff --linked
```

### RLS policy verification checklist

After migrations, verify in the Supabase Dashboard (Table Editor → Policies):

- [ ] `coach_sessions` — RLS enabled, users can only read/write their own rows
- [ ] `master_resumes` — RLS enabled, users can only read/write their own rows
- [ ] `job_applications` — RLS enabled, per-user access
- [ ] `messages` — RLS enabled, per-session access
- [ ] `resumes` — RLS enabled, per-session access
- [ ] `resume_sections` — RLS enabled, per-session access
- [ ] `user_positioning_profiles` — RLS enabled, per-user access
- [ ] `user_usage` — RLS enabled, per-user read; service role writes
- [ ] `subscriptions` — RLS enabled, per-user read
- [ ] `session_locks` — service role only (no direct user access)
- [ ] `user_platform_context` — RLS enabled, per-user access
- [ ] `retirement_readiness_assessments` — RLS enabled, per-user access
- [ ] `planner_referrals` — RLS enabled, per-user access
- [ ] `b2b_organizations` — RLS enabled, admin-only write
- [ ] `b2b_seats` — RLS enabled, per-user read

The server uses the **service role key** (`SUPABASE_SERVICE_ROLE_KEY`), which bypasses RLS. RLS policies protect the Supabase client-side SDK used in the frontend.

---

## Step 2: Deploy Server (Railway)

### Required Environment Variables

Set these in the Railway project dashboard under Variables.

#### Core infrastructure

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Enables production mode (stricter CORS, no debug output) |
| `PORT` | `3001` | HTTP server port (Railway sets this automatically) |
| `ALLOWED_ORIGINS` | `https://app.careeragent.ai` | Comma-separated list of allowed CORS origins. Must match the Vercel deployment URL exactly. |

#### LLM provider (choose one)

| Variable | Value | Description |
|----------|-------|-------------|
| `LLM_PROVIDER` | `groq` | Primary provider (~$0.08/pipeline, ~2 min). Use `zai` as fallback. |
| `GROQ_API_KEY` | `gsk_...` | Required when `LLM_PROVIDER=groq`. Obtain from console.groq.com. |
| `ZAI_API_KEY` | `...` | Required when `LLM_PROVIDER=zai`. Falls back to Z.AI if `GROQ_API_KEY` is absent. |
| `PERPLEXITY_API_KEY` | `pplx-...` | Required for the `research_company` tool in the Strategist agent. Pipeline degrades gracefully without it but company research will be skipped. |

#### Job and company discovery providers

| Variable | Description |
|----------|-------------|
| `SERPAPI_API_KEY` | Required when `FF_JOB_SEARCH=true` or `FF_NETWORK_INTELLIGENCE=true`. Powers structured public job listings for Broad Search and Insider Jobs. `/ready` fails when this key is missing for launched job surfaces. |
| `SERPER_API_KEY` | Required while `FF_JOB_FINDER=true`. Also used as supplemental public-link discovery for Network Intelligence and job research. |
| `FIRECRAWL_API_KEY` | Optional supplemental career-page/JD scrape provider. Do not treat this as the primary job-board dependency. |

#### Optional Groq model overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_MODEL_PRIMARY` | `llama-3.3-70b-versatile` | Section writing, synthesis, adversarial review |
| `GROQ_MODEL_MID` | `llama-4-scout-17b-16e-instruct` | Self-review, gap analysis, benchmarking |
| `GROQ_MODEL_ORCHESTRATOR` | `llama-3.3-70b-versatile` | Agent loop reasoning (all 3 agents) |
| `GROQ_MODEL_LIGHT` | `llama-3.1-8b-instant` | Text extraction, JD analysis |

#### Database

| Variable | Value | Description |
|----------|-------|-------------|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | Production Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Service role key — bypasses RLS. Never expose client-side. Rotate if leaked. |

#### Observability and operations

| Variable | Example | Description |
|----------|---------|-------------|
| `METRICS_KEY` | `<random-secret>` | Bearer token required to call `GET /metrics`. Generate with `openssl rand -hex 32`. |
| `SENTRY_DSN` | `https://...@sentry.io/...` | Sentry error tracking DSN. Pipeline errors are automatically captured. No-op if unset. |
| `MAX_HEAP_USED_MB` | `512` | Memory pressure threshold in MB. Server returns 503 load-shedding responses when heap exceeds this. Tune based on Railway instance size. |
| `HEALTH_CHECK_CACHE_TTL_MS` | `5000` | How long to cache health check results (ms). Default: 5000. |

#### Billing (Stripe)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`). Billing routes return 503 if unset. |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_...`). Required for payment event processing. |
| `ADMIN_API_KEY` | Bearer token for admin-only endpoints (promo code creation, feature overrides). Generate with `openssl rand -hex 32`. |

#### Optional Redis (horizontal scaling only)

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection URL. Only needed if `FF_REDIS_RATE_LIMIT=true` or `FF_REDIS_BUS=true`. |

#### Feature flags — built agents (set all to `true`)

```
FF_COVER_LETTER=true
FF_NETWORK_INTELLIGENCE=true
FF_INTERVIEW_PREP=true
FF_LINKEDIN_OPTIMIZER=true
FF_CONTENT_CALENDAR=true
FF_NETWORKING_OUTREACH=true
FF_JOB_TRACKER=true
FF_SALARY_NEGOTIATION=true
FF_EXECUTIVE_BIO=true
FF_CASE_STUDY=true
FF_THANK_YOU_NOTE=true
FF_PERSONAL_BRAND_AUDIT=true
FF_NINETY_DAY_PLAN=true
FF_ONBOARDING=true
FF_MOCK_INTERVIEW=true
FF_JOB_FINDER=true
FF_APPLICATION_PIPELINE=true
FF_LINKEDIN_CONTENT=true
FF_LINKEDIN_EDITOR=true
FF_NETWORKING_CRM=true
FF_INTERVIEW_DEBRIEF=true
FF_COUNTER_OFFER_SIM=true
FF_MOMENTUM=true
FF_RETIREMENT_BRIDGE=true
FF_B2B_OUTPLACEMENT=true
```

#### Feature flags — pipeline gates (recommended `true`)

```
FF_BLUEPRINT_APPROVAL=true
FF_INTAKE_QUIZ=true
FF_GAP_ANALYSIS_QUIZ=true
FF_QUALITY_REVIEW_APPROVAL=true
FF_POSITIONING_BATCH=true
```

#### Feature flags — infrastructure (leave `false` unless needed)

```
FF_REDIS_BUS=false
FF_REDIS_RATE_LIMIT=false
FF_SELF_REVIEW_LIGHT=false
```

### Deploy

Railway auto-deploys on push to the connected branch. To deploy manually:

```bash
railway up --service server
```

---

## Step 3: Verify Server Health

After Railway deployment completes, verify the server is healthy before deploying the frontend.

```bash
# Basic health check — expect { "status": "ok" }
curl https://api.careeragent.ai/health

# Readiness probe — expect HTTP 200 with { "ready": true }
curl -i https://api.careeragent.ai/ready

# Metrics (requires METRICS_KEY)
curl -H "Authorization: Bearer <METRICS_KEY>" https://api.careeragent.ai/metrics
```

**Health check response fields:**

| Field | Meaning |
|-------|---------|
| `status` | `ok` or `degraded` |
| `feature_dependencies_ok` | All enabled feature-specific provider dependencies are configured |
| `heap_overloaded` | true if heap exceeds `MAX_HEAP_USED_MB` |
| `heap_used_mb` | Current heap usage |
| `cached` | Whether the DB portion of the health snapshot came from the short health cache |

**Readiness probe:** Returns HTTP 200 when `db_ok && llm_key_ok && feature_dependencies_ok && !heap_overloaded && !shuttingDown`. Returns HTTP 503 otherwise. Railway uses this for zero-downtime deploy gating. Inspect `feature_dependencies` when readiness fails; launched job surfaces should report `SERPAPI_API_KEY` for structured listings and `SERPER_API_KEY` for the legacy Job Finder agent.

Do not proceed to frontend deployment if `/ready` returns 503.

---

## Step 4: Deploy Frontend (Vercel)

### Required Environment Variables

Set these in the Vercel project dashboard under Settings → Environment Variables. Apply to the **Production** environment.

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_API_BASE_URL` | `https://api.careeragent.ai` | Production API URL. Must not have a trailing slash. The frontend uses this for all API and SSE calls. |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Production Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase anonymous key. Safe to expose client-side — RLS policies enforce access control. |

### API routing mode

The frontend supports two modes for reaching the backend:

**Mode 1: Direct API calls (recommended)**
Set `VITE_API_BASE_URL` to the Railway server URL. The frontend calls the backend directly. The server must include the Vercel domain in `ALLOWED_ORIGINS` for CORS. SSE connections go directly to the backend with no proxy intermediary.

**Mode 2: Vercel rewrite proxy**
`app/vercel.json` contains a rewrite rule `/api/*` → backend URL. No CORS needed because requests appear same-origin from the browser's perspective.

> **Manual management required.** The destination URL in `app/vercel.json` is currently hardcoded to `https://resume-agent-server.up.railway.app`. Vercel does not support env var interpolation in rewrite destination URLs. If the Railway backend URL ever changes (e.g., service renamed, project moved, custom domain added), you must edit `app/vercel.json` directly and redeploy the frontend. There is no automatic sync between Railway and this file.

For staging/production differentiation, use Mode 1 with different `VITE_API_BASE_URL` values per Vercel environment (Preview vs Production).

### Deploy

Vercel auto-deploys on push to the connected branch. To deploy manually:

```bash
vercel --prod
```

### Verify end-to-end

After Vercel deployment:

- [ ] Open `https://app.careeragent.ai` — login page loads
- [ ] Log in with test credentials or a real account
- [ ] Start a new pipeline session — confirm SSE stream connects
- [ ] Paste a job description — confirm pipeline starts and progresses
- [ ] Confirm at least one panel renders in the right pane
- [ ] Complete the pipeline through to PDF export

---

## Post-Deploy Verification (Automated)

Run the smoke test suite to verify deployment health:

```bash
# Against production
BASE_URL=https://api.careeragent.ai node server/scripts/smoke-test.mjs

# With authenticated check (uses a test JWT)
BASE_URL=https://api.careeragent.ai SMOKE_TEST_TOKEN=<token> node server/scripts/smoke-test.mjs

# Via npm script (from server/ directory)
cd server && BASE_URL=https://api.careeragent.ai npm run smoke-test
```

The script checks: `/health` (status ok), `/ready` (ready true), and optionally `/api/sessions` (authenticated). Retries 3 times with 2s delay. Exit code 0 on success, 1 on any failure.

---

## Stripe Webhook Configuration

Register a webhook endpoint in the Stripe Dashboard after backend deployment:

```
POST https://api.careeragent.ai/api/billing/webhook
```

Events to enable:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the signing secret (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET` in Railway.

After configuring, seed the `pricing_plans` table with `stripe_price_id` values matching your Stripe product prices. This wires plan selection in the frontend to the correct Stripe Checkout price.

---

## Feature Flag Enablement Strategy

Feature flags default to `false` in `server/src/lib/feature-flags.ts`. Enable them by setting the corresponding env var to `true` in the Railway dashboard. Use this tiered rollout order — lower tiers are safer and should be validated before moving to higher tiers.

---

### Tier 0 — Core Pipeline Gates (default `true`, no action required)

These flags are already `true` by default in code. They are included here for visibility — confirm they are not being overridden to `false` in Railway.

| Flag | Default | Purpose |
|------|---------|---------|
| `FF_BLUEPRINT_APPROVAL` | `true` | Blueprint review gate between Strategist and Craftsman |
| `FF_GAP_ANALYSIS_QUIZ` | `true` | Gap analysis questionnaire gate |
| `FF_QUALITY_REVIEW_APPROVAL` | `true` | Quality review approval gate |
| `FF_POSITIONING_BATCH` | `true` | Batch positioning question generation |

**Verification:** Call `GET /health` and confirm `status: ok`. If any gate flag was accidentally set to `false` in Railway, pipelines will skip user approval steps silently.

---

### Tier 1 — Standalone Agents (enable first)

These agents have no cross-agent dependencies and no financial or B2B implications. Each can be enabled independently. Start here.

| Flag | Agent |
|------|-------|
| `FF_ONBOARDING` | Onboarding Assessment Agent — client profiling and financial segment detection |
| `FF_COVER_LETTER` | Cover Letter Writer — requires a completed resume pipeline session |
| `FF_INTERVIEW_PREP` | Interview Prep Agent |
| `FF_EXECUTIVE_BIO` | Executive Bio Writer |
| `FF_THANK_YOU_NOTE` | Thank You Note Writer |
| `FF_NINETY_DAY_PLAN` | 90-Day Plan Generator |
| `FF_PERSONAL_BRAND_AUDIT` | Personal Brand Audit |
| `FF_CASE_STUDY` | Portfolio / Case Study Generator |

**Enablement:** In Railway dashboard → Variables, set each flag to `true`. No additional infrastructure required. Redeploy is not needed — flags are read at startup via `process.env`.

**Verification after each:** Hit the corresponding `/api/<route>/health` or start a session and confirm the UI surface for that agent appears and routes correctly.

---

### Tier 2 — Cross-Agent and Data-Dependent Features (enable second)

These features depend on platform context produced by Tier 1 agents (primarily positioning strategy from completed resume pipelines) or require external API credentials.

| Flag | Feature | Prerequisites |
|------|---------|---------------|
| `FF_NETWORK_INTELLIGENCE` | Network Intelligence — contact discovery, Insider Jobs, and NI scoring | `SERPAPI_API_KEY`; completed resume pipelines producing `positioning_strategy` in `user_platform_context` |
| `FF_NETWORKING_OUTREACH` | Networking Outreach — personalized outreach message generation | `FF_NETWORK_INTELLIGENCE` enabled and populated data |
| `FF_NETWORKING_CRM` | Networking CRM — contact and relationship tracking | None (standalone CRUD), but most useful alongside `FF_NETWORK_INTELLIGENCE` |
| `FF_JOB_FINDER` | Legacy Job Finder agent | `SERPER_API_KEY` configured in Railway until migrated to the structured listing provider |
| `FF_JOB_SEARCH` | Job Search API — Broad Search structured listings | `SERPAPI_API_KEY` configured in Railway |
| `FF_APPLICATION_PIPELINE` | Application Pipeline — Kanban job tracking CRUD | None (standalone), but pairs with `FF_JOB_FINDER` |
| `FF_JOB_TRACKER` | Job Application Tracker (Agent #14) | None |
| `FF_LINKEDIN_OPTIMIZER` | LinkedIn Optimizer | Completed resume pipeline for positioning input |
| `FF_LINKEDIN_CONTENT` | LinkedIn Content Writer | `FF_LINKEDIN_OPTIMIZER` recommended first |
| `FF_LINKEDIN_EDITOR` | LinkedIn Profile Editor | `FF_LINKEDIN_OPTIMIZER` recommended first |
| `FF_CONTENT_CALENDAR` | Content Calendar | `FF_LINKEDIN_CONTENT` recommended first |
| `FF_INTERVIEW_DEBRIEF` | Interview Debrief | `FF_INTERVIEW_PREP` enabled |

**Enablement:** Set each flag to `true` in Railway. For job search flags, confirm the relevant API keys are present first:

```bash
# Verify job search dependencies before enabling or promoting job surfaces
npm --prefix server run check:ready -- --url=https://api.careeragent.ai
npm --prefix server run check:job-providers
```

**Verification after each:** Run a representative user flow for the feature. For job search, confirm Broad Search and Insider Jobs both return fresh results with a posted-within filter of 30 days or less. For LinkedIn flags, confirm the optimizer produces output when given a completed resume session.

`npm run gate:staging` now runs the live job-provider smoke after `/ready`. The smoke checks both Broad Search and the Insider Jobs company-specific path; override `JOB_PROVIDER_CHECK_*` variables when rehearsing a specific launch persona or geography.

---

### Tier 3 — Advanced, High-Touch, and B2B Features (enable last)

These features have complex dependencies, financial implications, regulatory considerations, or require B2B contract setup. Do not enable in production without completing the listed prerequisites.

| Flag | Feature | Prerequisites and Notes |
|------|---------|------------------------|
| `FF_SALARY_NEGOTIATION` | Salary Negotiation Agent | Review output quality manually before enabling broadly — negotiation advice has reputational risk if poor |
| `FF_MOCK_INTERVIEW` | Mock Interview Simulation | Computationally expensive; monitor Railway CPU/memory after enabling |
| `FF_COUNTER_OFFER_SIM` | Counter-Offer Simulation | Financial scenario modeling — review outputs for accuracy before enabling |
| `FF_INTERVIEW_DEBRIEF` | Interview Debrief (advanced mode) | Pairs with `FF_INTERVIEW_PREP`; requires completed interview sessions in DB |
| `FF_MOMENTUM` | Momentum Tracking — activity streaks, coaching nudges, stall detection | Requires `momentum_events` table migration applied; verify with `supabase db diff --linked` |
| `FF_RETIREMENT_BRIDGE` | Retirement Bridge Assessment Agent | Never provides financial advice (fiduciary guardrails built in); requires `retirement_readiness_assessments` and `planner_referrals` migrations applied. Review planner handoff configuration in `server/src/lib/planner-handoff.ts` before enabling. |
| `FF_B2B_OUTPLACEMENT` | B2B Outplacement Admin Portal | Requires `b2b_organizations`, `b2b_contracts`, `b2b_seats`, `b2b_cohorts` migrations applied. Requires at least one organization record seeded in DB before any employer-facing flows work. Coordinate with sales/ops before enabling. |

**Enablement:** Set the flag to `true` in Railway after completing all prerequisites. For `FF_RETIREMENT_BRIDGE` and `FF_B2B_OUTPLACEMENT`, verify DB migrations are current before enabling:

```bash
supabase db diff --linked   # Should show no diff if all migrations are applied
```

**Post-enable verification for `FF_B2B_OUTPLACEMENT`:** Confirm `GET /api/b2b/organizations` returns 200 (not 404) and that at least one organization record exists in the `b2b_organizations` table before directing employer users to the admin portal.

---

### Infrastructure Flags (do not enable without ops review)

| Flag | Default | When to enable |
|------|---------|---------------|
| `FF_REDIS_BUS` | `false` | Only when running multiple Railway replicas AND agent loops have been made resumable. Requires `REDIS_URL`. See ADR-007. |
| `FF_REDIS_RATE_LIMIT` | `false` | Only when horizontal scaling requires shared rate limit counters. Requires `REDIS_URL`. Falls back to in-memory if Redis is unavailable. |
| `FF_SELF_REVIEW_LIGHT` | `false` | A/B testing only — routes Craftsman self-review to MODEL_LIGHT. Monitor output quality before enabling broadly. |

---

## Health Checks Reference

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | Returns `{ status, shutting_down, feature_dependencies_ok, heap_overloaded, heap_used_mb, cached, checked_at }`. Status is `ok` when all systems nominal. |
| `GET /ready` | None | Returns `{ ready, shutting_down, db_ok, llm_key_ok, feature_dependencies_ok, feature_dependencies, heap_overloaded, heap_used_mb }` with HTTP 200 (ready) or HTTP 503 (not ready). Used as Railway readiness probe. |
| `GET /metrics` | `Bearer <METRICS_KEY>` | Returns request metrics, rate limit stats, pipeline slot stats, session route stats, and health runtime data. Returns 401 if key is wrong, 200 with no auth check if `METRICS_KEY` is unset. |

---

## Rollback Instructions

### Server (Railway)

1. Open the Railway project dashboard
2. Navigate to the `server` service → Deployments tab
3. Find the last known-good deployment
4. Click the three-dot menu → **Rollback to this deployment**
5. Railway will re-deploy the previous image without a code push
6. Verify `/ready` returns 200 after rollback completes

### Frontend (Vercel)

1. Open the Vercel project dashboard
2. Navigate to Deployments
3. Find the last known-good deployment
4. Click the three-dot menu → **Promote to Production**
5. Vercel instantly re-routes production traffic to the previous build

### Database

Migrations are forward-only. There is no automated rollback.

If a migration causes a production incident:

1. Identify the problematic migration file in `supabase/migrations/`
2. Write a **reverse migration** as a new file with the next timestamp (e.g., `20260309000000_reverse_<description>.sql`)
3. The reverse migration must manually undo the schema changes (DROP COLUMN, DROP TABLE, ALTER back, etc.)
4. Apply via `supabase db push --linked`
5. Document the incident and reverse migration in `docs/CHANGELOG.md` and `docs/DECISIONS.md`

> Note: Rolling back application code without rolling back DB migrations can cause schema mismatches. If the DB migration is not yet rolled back, keep the application code that is compatible with the new schema deployed until the reverse migration is written and applied.

---

## SSE Considerations

The pipeline uses Server-Sent Events for real-time updates during 10-30 min pipeline runs.

- Railway supports long-lived HTTP connections natively
- If using a load balancer or multiple Railway replicas, enable sticky sessions so the SSE client reconnects to the same instance running the pipeline
- The frontend uses fetch-based SSE with automatic reconnect on disconnect
- `session_locks` table prevents the same pipeline from running on two instances simultaneously
- See `docs/SSE_SCALING.md` for horizontal scaling strategy

---

## Local Development Reference

```bash
# Terminal 1: Backend
cd server
cp .env.example .env   # Fill in: LLM_PROVIDER, GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev             # Starts on port 3001

# Terminal 2: Frontend
cd app
cp .env.example .env   # Fill in: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev             # Starts on port 5173, proxies /api/* to :3001
```

Test credentials: `jjschrup@yahoo.com` / `Scout123`

TypeScript checks:

```bash
cd server && npx tsc --noEmit
cd app && npx tsc --noEmit
```

Test suites:

```bash
cd server && npx vitest run   # 2,421 tests
cd app && npx vitest run      # 1,433 tests
```
