# Deployment Architecture — Resume Agent

## Overview

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Vercel      │       │   Railway     │       │   Supabase    │
│   (Frontend)  │──────▶│   (Backend)   │──────▶│   (Database)  │
│   Vite SPA    │       │   Hono/Node   │       │   PostgreSQL  │
└──────────────┘       └──────────────┘       └──────────────┘
```

- **Frontend**: Vercel — static Vite SPA build
- **Backend**: Railway — Hono + Node.js server
- **Database**: Supabase — PostgreSQL with RLS policies
- **LLM**: Z.AI GLM models (OpenAI-compatible API)

## Frontend (Vercel)

### Build

The frontend is a Vite + React 19 SPA in the `app/` directory. Vercel auto-detects the framework.

### Environment Variables (Vercel Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (publishable) |
| `VITE_API_URL` | Recommended | Full backend URL (e.g., `https://resume-agent-server.up.railway.app`) |

### API Routing

Two modes for reaching the backend:

**Mode 1: Direct API calls (recommended for multi-environment setups)**
- Set `VITE_API_URL` in Vercel environment variables
- The frontend calls the backend directly at build time via `api.ts`
- The server must include the Vercel domain in `ALLOWED_ORIGINS` for CORS
- SSE connections go directly to the backend (no proxy intermediary)

**Mode 2: Vercel rewrite proxy (default)**
- `app/vercel.json` contains a rewrite rule: `/api/*` → backend URL
- No CORS needed (same-origin from browser's perspective)
- **Limitation**: The destination URL is hardcoded in `vercel.json`. Vercel does not support environment variable interpolation in rewrite rules.
- To use a different backend URL, you must edit `vercel.json` directly.

**For staging/production differentiation**, use Mode 1 with different `VITE_API_URL` values per Vercel environment (Preview vs Production).

### Dev Proxy

In development, the Vite dev server proxies `/api/*` to `localhost:3001` (configured in `vite.config.ts`). No `VITE_API_URL` needed locally.

## Backend (Railway)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZAI_API_KEY` | Yes | Z.AI API key for LLM calls |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `PERPLEXITY_API_KEY` | Yes | Perplexity API key for company research |
| `ALLOWED_ORIGINS` | Yes (prod) | Comma-separated list of allowed CORS origins (e.g., `https://resume-agent.vercel.app`) |
| `NODE_ENV` | Auto | Set to `production` by Railway |
| `PORT` | Auto | Set by Railway (default: 3001) |
| `LLM_PROVIDER` | No | `zai` (default when `ZAI_API_KEY` exists) or `anthropic` |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `MAX_HEAP_USED_MB` | No | Memory pressure threshold for 503 responses |
| `REDIS_URL` | No | Redis connection URL (enables Redis-backed rate limiting when `FF_REDIS_RATE_LIMIT=true`) |

### Optional Model Overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `ZAI_MODEL_PRIMARY` | `glm-4.7` | Section writing, synthesis, adversarial review |
| `ZAI_MODEL_MID` | `glm-4.5-air` | Question generation, benchmark, classify-fit |
| `ZAI_MODEL_ORCHESTRATOR` | `glm-4.7-flashx` | Main agent loop reasoning |
| `ZAI_MODEL_LIGHT` | `glm-4.7-flash` | JD analysis, humanize-check, research |

### Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `FF_INTAKE_QUIZ` | `true` | Enable intake questionnaire gate |
| `FF_RESEARCH_VALIDATION` | `true` | Enable research validation gate |
| `FF_GAP_ANALYSIS_QUIZ` | `true` | Enable gap analysis questionnaire gate |
| `FF_QUALITY_REVIEW_APPROVAL` | `true` | Enable quality review approval gate |
| `FF_BLUEPRINT_APPROVAL` | `true` | Enable blueprint review gate |
| `FF_REDIS_RATE_LIMIT` | `false` | Enable Redis-backed rate limiting |

## Database (Supabase)

### Setup

1. Create a Supabase project
2. Run all migrations in `supabase/migrations/` (numbered sequentially)
3. The `moddatetime` extension must be enabled (migration handles this)
4. RLS policies are configured in migrations — the server uses the service role key to bypass RLS

### Key Tables

| Table | Purpose |
|-------|---------|
| `coach_sessions` | Pipeline session state, pipeline stage tracking |
| `messages` | Chat message history |
| `resumes` | Generated resume output |
| `resume_sections` | Individual resume sections |
| `master_resumes` | Uploaded base resumes |
| `job_applications` | Job descriptions and analysis results |
| `user_positioning_profiles` | Saved positioning strategy profiles |
| `user_usage` | Token usage tracking for billing |
| `pricing_plans` | Subscription plan definitions |
| `subscriptions` | User subscription records |
| `session_locks` | Prevents concurrent pipeline runs |

## Local Development

```bash
# Terminal 1: Backend
cd server
cp .env.example .env  # Fill in API keys
npm install
npm run dev            # Starts on port 3001

# Terminal 2: Frontend
cd app
cp .env.example .env  # Fill in Supabase keys
npm install
npm run dev            # Starts on port 5173, proxies /api/* to :3001
```

Test credentials: `jjschrup@yahoo.com` / `Scout123`

## Health Checks

- `GET /health` — Server health (DB connectivity, LLM key presence, memory usage)
- `GET /ready` — Readiness probe (same as health)
- `GET /metrics` — Request metrics, rate limit stats, pipeline stats

## SSE Considerations

The pipeline uses Server-Sent Events (SSE) for real-time updates. Key considerations:

- SSE connections are long-lived (10-30 min for a full pipeline run)
- Railway supports long-lived connections natively
- If using a load balancer, enable sticky sessions to ensure the SSE client connects to the same instance running the pipeline
- See `docs/SSE_SCALING.md` for horizontal scaling strategy
