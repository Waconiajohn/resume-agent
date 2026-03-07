# Project Status

> Updated every session by Claude. This is the living snapshot of where things stand.

## Last Updated
2026-03-07 | Sprint 35 complete

## Current State
- **Sprint 35 complete:** Agents #18-#20 (Thank You Note, Personal Brand Audit, 90-Day Plan) all built and tested
- **No active sprint** -- next sprint not yet planned
- **All systems green** -- tsc clean, no known regressions

## Test Health
- Server: 1,513 tests passing
- App: 790 tests passing
- E2E: 2 tests passing
- TypeScript: both server and app tsc clean

## Active Concerns
- Agents #6-#12 numbering gap -- product directories exist for 13 agents but platform numbering implies 20. Need to reconcile which agents map to #6-#12.
- Known bugs (from CLAUDE.md): revision loops (Bug 16), context forgetfulness on long sessions (Bug 17), 409 conflicts (Bug 18)
- MaxListenersExceededWarning on long sessions still unresolved

## Recent Decisions
- Obsidian vault moved into repo at `docs/obsidian/` as Claude Code's extended memory (2026-03-07)
- Sprint 35 delivered 3 agents in one sprint with 185 new tests

## What's Working Well
- ProductConfig pattern is proven and repeatable -- new agents follow a predictable 5-6 story arc
- Agent runtime is stable -- no runtime bugs across 13 products
- Test coverage floor is holding (was 1,014/586 at baseline, now 1,513/790)

## What Needs Attention
- Frontend for agents #3-#20 -- most have SSE hooks but no dedicated UI beyond the generic pipeline view
- Platform catalog only shows 4 products in the UI (`/tools` route)
- Agents #6-#12 need to be identified and built or removed from the numbering

## Key Metrics
- Total agents built: 13 (of 33 planned)
- Total tests: 2,303 (1,513 server + 790 app)
- Estimated pipeline cost: ~$0.08/run (Groq)
- Pipeline time: ~1m42s (Groq)

#status/in-progress
