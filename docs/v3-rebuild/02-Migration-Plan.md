# 02 — Migration Plan

## Philosophy

We don't rip out the old system and hope. We build the new system alongside, prove it works on fixtures, then route real traffic to it. If anything regresses, we roll back instantly.

The old system stays running until the new system has demonstrably matched or exceeded it on every fixture. Only then do we retire the old code.

## Prerequisites (Week 0)

These happen before any rearchitecture work begins. They protect the current system while we build the new one.

1. **Lock in current fixes.** Everything deployed today (April 17, 2026) stays deployed. The service account JWT auth, the phantom filters, the bullet trim, the parallel experience writer — these keep the current system functional while we build its replacement.

2. **Create the fixture directory.** `server/test-fixtures/resumes/` with 15-20 real resumes covering diverse cases:
   - Executive with 20+ year career
   - Mid-career professional with career gap
   - Consultant with many short-duration roles
   - International candidate with non-US credentials
   - Technical candidate (engineer, data scientist)
   - Non-technical candidate (sales, marketing, finance)
   - Candidate transitioning industries
   - Candidate with unusual formatting (tables, multiple columns)
   - Candidate with sub-roles under a parent company (U.S. Bank pattern)
   - Female candidate, male candidate, gender-ambiguous name
   - Candidate with certifications that have bled into education in the past

   For each, capture the current system's output as a baseline snapshot.

3. **Create the project in Claude.ai.** Upload all six documents from this project.

4. **Set up the prompt library directory.** `server/prompts/` with a README explaining the structure.

## Week 1: Build Stage 1 and Stage 2

**Goal:** Prove we can replace the current parsing layer (Candidate Intelligence + source outline) with a single LLM classifier that produces better structured output than the current system.

### Day 1-2: Stage 1 (Extract)

Build `server/src/v3/extract/index.ts` — a pure text extractor that handles DOCX, PDF, and pasted text. No semantic interpretation. Use existing libraries (`mammoth`, `pdf-parse`).

Deliverable: A function that takes a file buffer and returns `{ plaintext: string, format: 'docx' | 'pdf' | 'text', warnings: string[] }`.

### Day 3-5: Stage 2 (Classify)

Build `server/src/v3/classify/index.ts` — one LLM call that takes plaintext and returns a fully typed `StructuredResume` object.

Write `server/prompts/classify.v1.md` with the full prompt, including explicit instructions to:
- Distinguish real positions from career gap notes and section headers
- Identify parent-company umbrellas and attach them to their sub-roles
- Extract education separately from certifications
- Identify the candidate's natural-language discipline
- Return confidence scores per field
- Flag ambiguous content for human review

Run classify against all 15-20 fixtures. Compare output to current system. Goal: match or exceed current quality on every fixture for positions, education, certifications, and discipline.

**If classify doesn't match current quality on any fixture, the prompt gets revised until it does. We do not proceed to Week 2 with a regression.**

### Day 6-7: Integration test

Wire Stage 1 → Stage 2 together. Run end-to-end on all fixtures. Compare to baseline snapshots. Document any discrepancies in a decision log entry.

Ship nothing to production this week. This is all parallel development.

## Week 2: Build Stage 3 and Stage 4

### Day 1-2: Stage 3 (Strategize)

Build `server/src/v3/strategize/index.ts` — one LLM call that takes structured resume + JD and returns a strategy document.

Write `server/prompts/strategize.v1.md` that instructs the model to:
- Identify the 3-5 most JD-relevant accomplishments
- Determine the positioning frame (e.g., "consolidator," "builder," "turnaround leader")
- Identify likely hiring manager objections and how to preempt them
- Recommend which roles get most bullet real estate vs. brief treatment
- Output target discipline phrase for use in branded title

### Day 3-5: Stage 4 (Write)

Build `server/src/v3/write/index.ts` with parallel section writers. One prompt file per section:
- `server/prompts/write-summary.v1.md`
- `server/prompts/write-accomplishments.v1.md`
- `server/prompts/write-competencies.v1.md`
- `server/prompts/write-position.v1.md` (called once per position in parallel)

Each prompt enforces the writing constraints (active voice, no pronouns, no inventing metrics, exact bullet count ranges). The prompts trust their own output. No downstream guardrails.

### Day 6-7: Full pipeline integration

Wire Stage 1 → 2 → 3 → 4 together. Run against all fixtures. Compare to current system. Document results.

**Quality gate: the new pipeline must match or exceed the current system on every fixture before proceeding.** Specific measurable criteria:
- Every fixture produces a complete resume (no missing sections)
- Zero phantom positions
- Zero concatenation artifacts
- Pronouns match candidate's apparent gender (or are active-voice)
- Education has no certifications bleeding in
- Discipline in branded title matches candidate's actual field

## Week 3: Build Stage 5 and shadow-deploy

### Day 1-2: Stage 5 (Verify)

Build `server/src/v3/verify/index.ts` — one LLM call that reviews the final resume and returns pass/fail plus specific issues.

Write `server/prompts/verify.v1.md` that instructs the model to check:
- Every numeric claim traces to source material
- No pronouns (unless explicitly active-voice violations)
- Dates are consistent
- No duplicate or near-duplicate bullets within a role
- Summary matches the positioning strategy from Stage 3
- JD keywords are naturally integrated

### Day 3-4: Shadow deployment

Wire the v3 pipeline to run **in parallel with** the v2 (current) pipeline on every real user request. Users continue to see v2 output. V3 runs silently, logs its results, and stores them for comparison. No user-facing change.

This runs for 2-3 days minimum. We want to see v3 handle real-world inputs, not just fixtures.

### Day 5-7: Compare and iterate

Analyze shadow results. Every case where v3 output differs materially from v2 gets reviewed. If v3 is worse, fix v3 (prompts, not code). If v3 is better, note it.

When shadow results show v3 ≥ v2 on 95%+ of real requests, proceed to Week 4.

## Week 4: Cut over and clean up

### Day 1-2: Controlled rollout

Route 10% of traffic to v3. Monitor closely. If error rate or quality issues appear, rollback immediately.

### Day 3-4: Full cutover

Route 100% of traffic to v3. Keep v2 code in the repo as fallback for one more week. Monitor continuously.

### Day 5-7: Deletion

Delete v2 code:
- `server/src/agents/resume-v2/candidate-intelligence/`
- `server/src/agents/resume-v2/resume-writer/` (entire directory, including all guardrail functions)
- `server/src/agents/resume-v2/benchmark-candidate/` (merged into Stage 3)
- `server/src/agents/resume-v2/gap-analysis/` (merged into Stage 3)
- `server/src/agents/resume-v2/source-resume-outline.ts`
- All phantom filter functions
- All bullet trim functions
- All guardrail/coverage functions
- Associated tests

Keep:
- LLM provider code (`server/src/lib/llm-provider.ts` and friends)
- Service account auth (built today)
- Route handlers (updated to call v3)
- Shared types (updated to match v3 output shape)

Rename `server/src/v3/` to `server/src/resume/`. Update imports.

This deletion is not sad. Every line removed is a line that can't break.

## Rollback plan

At any point in weeks 1-4, if v3 produces worse output than v2 on real traffic, we rollback:
- Weeks 1-2: No rollback needed (nothing in production)
- Week 3: Shadow traffic stops; v2 continues serving users
- Week 4: Route flip back to v2 (instant)

v2 code stays in the repo and deployable until Week 4 Day 7 deletion. If a problem surfaces before deletion, we keep v2 and iterate on v3 longer.

## Success metrics

At the end of Week 4, we measure:

- **Pipeline p95 latency:** target under 60 seconds (currently ~113 seconds)
- **Agent count:** target under 10 (currently ~40)
- **Files in `server/src/agents/resume-v2/`:** target zero (directory deleted)
- **Guardrail functions:** target zero
- **Manual patches per week after launch:** target zero
- **User-reported output errors:** target under 5% of pipeline runs

If these aren't hit, the architecture is wrong and we iterate. This is not a "ship and hope" plan.

## What could go wrong

**The LLM classifier (Stage 2) produces worse output than the current parser on complex resumes.** Mitigation: the prompt is iterated during Week 1 until fixtures pass. If after a week we can't hit quality, we stop and rethink before building Stages 3-5.

**The new stages are slower than the current pipeline.** Mitigation: Stage 2 is one call instead of many; Stage 4 is parallel. On paper, v3 should be significantly faster. If it's not, we investigate before cutover.

**Real-world resumes don't match our fixtures.** Mitigation: shadow deployment in Week 3 exposes this before cutover. We add new fixtures for any real resume v3 struggles with.

**LLM costs go up.** Mitigation: measure during shadow. Current system makes many small LLM calls plus many regex-based operations. New system makes ~10 LLM calls total per resume. Total tokens should be similar or lower. If costs spike, we optimize prompts.

**Something breaks that we didn't predict.** Mitigation: rollback plan exists. Fixture suite catches regressions automatically. Shadow deployment catches real-world issues. No one-shot production push.

## What we are NOT doing

- Not adding new features during this migration. The goal is architectural, not feature-driven.
- Not promising user-visible improvements beyond reliability. If v3 produces better resumes, great; if it produces equivalent resumes more reliably, that's also the win.
- Not touching the Chrome extension, the kanban pipeline, the Supabase backend, or any other part of CareerIQ outside the resume writer.
- Not migrating other agents (cover letter, LinkedIn, interview prep) yet. Those are their own projects.
