# Deployment Runbook — Resume Agent Platform

**Last updated:** 2026-03-08
**Sprint:** 52 — Production Foundation

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
| `db_ok` | Supabase connectivity check passed |
| `llm_key_present` | At least one LLM API key is configured |
| `heap_overloaded` | true if heap exceeds `MAX_HEAP_USED_MB` |
| `heap_used_mb` | Current heap usage |

**Readiness probe:** Returns HTTP 200 when `db_ok && llm_key_present && !heap_overloaded && !shuttingDown`. Returns HTTP 503 otherwise. Railway uses this for zero-downtime deploy gating.

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
`app/vercel.json` contains a rewrite rule `/api/*` → backend URL. No CORS needed because requests appear same-origin from the browser's perspective. Limitation: the destination URL is hardcoded in `vercel.json` — Vercel does not support env var interpolation in rewrite rules. Edit `vercel.json` directly if the backend URL changes.

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

## Health Checks Reference

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | Returns `{ status, db_ok, llm_key_present, heap_overloaded, heap_used_mb, cached, checked_at }`. Status is `ok` when all systems nominal. |
| `GET /ready` | None | Returns `{ ready, db_ok, llm_key_ok, heap_overloaded, heap_used_mb }` with HTTP 200 (ready) or HTTP 503 (not ready). Used as Railway readiness probe. |
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
cd server && npx vitest run   # 2,060 tests
cd app && npx vitest run      # 1,011 tests
```
