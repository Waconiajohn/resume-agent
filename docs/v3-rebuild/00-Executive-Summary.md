# CareerIQ Resume Writer v3 — Executive Summary

**Project:** Stack Collapse & LLM-First Rearchitecture
**Owner:** John Schrup
**Tech lead:** Claude (claude.ai)
**Implementation:** Claude Code
**Started:** April 17, 2026

---

## Why we're doing this

The current resume writer produces inconsistent output. Across a single debugging session on April 17, 2026, we identified that every section was silently falling back to deterministic stub output for weeks because Vertex AI auth had expired and nothing alerted us. Below that auth issue, we found seven separate bugs that each required a targeted patch: phantom job entries from career gap notes, parent-company headers parsed as positions, bullet concatenation artifacts, pronoun mismatches, education blobs, regex false-positives in discipline detection, and silent timeouts in the experience writer.

Each patch worked. But every patch added code to protect against bad output from an earlier stage — instead of fixing the earlier stage. The system now has phantom filters at three stages, bullet trimmers, deduplicators, backfill guards, placeholder sanitizers, and scope statement derivers. Most of this exists to defend against itself.

The root cause is architectural: too many stages, too much regex-based semantic judgment, and not enough trust in the LLM to do the work it's good at.

## What we're building

A resume writer with five stages instead of twenty, built on the principle that **LLMs handle semantic judgment and code handles mechanical operations.** No regex for "is this a job?" No keyword matching for "what discipline is this person in?" No defensive post-processing to undo bad parsing.

## What success looks like

- **Works on the first run, every run.** No patching, no "run it three times," no tuning per candidate.
- **Fewer than 10 agents.** Currently ~40. Most will be removed or merged.
- **No silent fallbacks.** When something fails, the user sees it and the team gets alerted.
- **Prompts are first-class artifacts.** Versioned, commented, editable without a deploy.
- **Fixtures cover 20+ real resumes.** Every change is tested against all of them automatically.
- **Total pipeline time under 60 seconds** for a typical resume.

## What this project contains

1. **00-Executive-Summary.md** — this document
2. **01-Architecture-Vision.md** — target architecture with stage-by-stage design
3. **02-Migration-Plan.md** — 4-week sequenced plan from current state to target
4. **03-Prompt-Library-Structure.md** — how prompts should be organized and managed
5. **04-Decision-Log.md** — running log of architectural decisions with reasoning
6. **05-Current-State-Audit.md** — honest assessment of what exists today

## How to use this project

When working in Claude Code, attach the relevant document to the conversation so Claude has the full context. When making architectural decisions, update the Decision Log. When new questions come up, add them to the relevant document rather than letting them live only in chat history.

Every document is a working document. They will be updated as the project progresses.

## Non-negotiables

- **No regression in resume quality** during the migration. The new system must produce output at least as good as the best current runs before the old system is retired.
- **No silent fallbacks.** If a stage fails, fail loudly and alert.
- **LLM calls for semantic judgment. Code for mechanical operations.** No exceptions.
- **Every prompt is versioned, commented, and stored as a first-class file.**
- **Every architectural decision is logged** with the reasoning, even if it seems obvious at the time.
