# CareerIQ

AI-powered career coaching platform for mid-to-senior executives. Builds role-specific resumes, LinkedIn profiles, interview prep, and job search tools.

## Quick Start

```bash
# Prerequisites: Node.js 20+, npm

# 1. Install dependencies
cd server && npm install
cd ../app && npm install

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env with your API keys (see Required Keys below)

# 3. Start development
cd server && npm run dev    # Backend on port 3001
cd app && npm run dev       # Frontend on port 5173

# 4. Open http://localhost:5173
# Test credentials: jjschrup@yahoo.com / Scout123
```

## Required Environment Keys

| Key | Purpose | Required |
|-----|---------|----------|
| `SUPABASE_URL` | Database connection | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access | Yes |
| `GROQ_API_KEY` | Primary LLM provider (Groq) | Yes (or ZAI_API_KEY) |
| `ZAI_API_KEY` | Fallback LLM provider (Z.AI) | Recommended |
| `ALLOWED_ORIGINS` | CORS whitelist (production) | Yes in production |
| `VITE_SUPABASE_URL` | Frontend DB connection | Yes |
| `VITE_SUPABASE_ANON_KEY` | Frontend auth | Yes |

See `server/.env.example` for the full list.

## Architecture

**10-agent resume pipeline** with typed I/O:

```
[1] Job Intelligence    ─┐
[2] Candidate Intel     ─┤ parallel
                         ↓
[3] Benchmark Candidate
[4] Gap Analysis
[5] Narrative Strategy
[6] Resume Writer (section-by-section)
[7] Truth Verification  ─┐
[8] ATS Optimization    ─┤ parallel
[9] Executive Tone      ─┘
[10] Assembly (deterministic)
```

- **Backend:** Hono + Node.js (port 3001)
- **Frontend:** Vite + React 19 + Tailwind (port 5173)
- **Database:** Supabase (PostgreSQL) with RLS
- **LLM:** Groq (primary), Z.AI (fallback), with automatic failover
- **Pipeline time:** ~2 min | **Cost:** ~$0.23/run (Groq)

## Key Commands

```bash
# TypeScript check
cd server && npx tsc --noEmit
cd app && npx tsc --noEmit

# Run tests
cd server && npx vitest run    # 2,762 tests
cd app && npx vitest run       # 2,053 tests

# Lint
cd server && npm run lint
cd app && npm run lint
```

## Project Structure

```
app/                    # Frontend (Vite + React 19)
  src/components/       # UI components
  src/hooks/            # React hooks (useAuth, useV2Pipeline, etc.)
  src/lib/              # Utilities (suggestion-scoring, rewrite-queue, export)
  src/types/            # TypeScript types

server/                 # Backend (Hono + Node.js)
  src/agents/resume-v2/ # 10-agent pipeline
  src/lib/              # LLM providers, Supabase, logger
  src/routes/           # API routes
  src/middleware/       # Auth, rate limiting, CORS

supabase/migrations/    # Database schema (93 migrations)
docs/                   # Sprint logs, architecture, decisions
```

## Development Framework

See `CLAUDE.md` for the full development framework including sprint workflow, agent design standards, and code quality rules.
