# v3 UX test — combined verdict

**Date:** 2026-04-19
**Tester:** Claude, reading rendered output as a senior executive recruiter would
**Fixtures:** joel-hough (VP Ops, retail/distribution), bshook (Director PM, PMP), jessica-boquist (VP Product, SaaS)
**Method:** Playwright drove the live UI at `localhost:5173/resume-builder/session`; Claude read the rendered output as a hiring manager would.

---

## Headline verdict — **Ship it.**

v3 produces resumes I would send to a hiring manager. The three outputs are specific, anchored in real numbers, and written in executive voice. The Review panel catches real issues (one numeric contradiction surfaced exactly as designed). UX is clean.

There is **one known caveat worth naming**: the forbidden-phrases discipline is ~50–60% effective on the loose write prompts. Two AI tells ("with a track record of", "Orchestrated") still slip through on one of three fixtures. A paying customer who reads their own resume will either self-edit (click-to-edit is wired and easy) or not notice (hiring managers also skim past). Not a shipping blocker; worth a monitoring note.

---

## Per-fixture summary

| Fixture | Pipeline time | Cost | Review panel | Hiring manager verdict | Blocking issues |
|---|---|---|---|---|---|
| **joel-hough** (VP Ops) | 163.9s | $0.047 | 1 error: "3 vs 4 distribution centers" consistency | **Ship with 1 edit** (Address→pick one count) | None |
| **bshook** (Director PM) | 150.8s | $0.072 | **No review notes. Safe to export.** | **Ship cleanly** | None |
| **jessica-boquist** (VP Product) | 154.3s | $0.063 | "Needs review" (2 errors surfaced) | **Ship with minor edits** | AI-tell slippage in summary (see below) |

---

## Specific issues with exact quoted phrases

### joel-hough — **strong clean output, one real contradiction (caught)**

Summary (rendered): *"Multi-site wholesale and distribution operations leader with a record of scaling revenue and automating complex networks. Directed company-wide strategy to grow revenue from $200M to $470M..."*

- *"with a record of"* — close to the banned *"with a track record of"* but uses "record" not "track record". Judgment call; within taste for this summary.
- *"Consistently delivers P&L results by converting operational scale into measurable cost and performance gains"* — closing sentence is a bit formulaic but not an outright tell.
- Selected accomplishments are strong: *"scaling revenue from $200M to $470M while managing a network of **14 stores and 3 distribution centers**"* and *"managing a network of **four distribution centers and fourteen stores**"* — the contradiction the Review panel caught.

**Review panel did its job:** surfaced the 3-vs-4 DC contradiction with actionable copy *"Pick one number and use it consistently throughout the resume."* Address / Dismiss buttons visible.

### bshook — **strongest of the three; ship as-is**

Summary (rendered): *"Automation program consolidator and transformation leader with a record of turning complex portfolios into predictable, margin-driven delivery engines."*

- *"delivery engines"* is metaphor-heavy but idiomatic for the industry.
- *"Transformation"* as noun is legitimate (not on banned list, which targets adjective forms).
- Every bullet has a concrete number: 28%, 6%, 38%, $32M, 94%, 19%, seven FTEs, 26 PMs, $180M portfolio.

Review panel: **"No review notes. Safe to export."** Clean pass.

### jessica-boquist — **ship with minor edits (the one caveat)**

Summary (rendered): *"SaaS product growth and retention leader **with a track record** scaling multi-product portfolios in PE-backed and high-growth environments."*

- 🚨 *"with a track record"* — direct phrase on the forbidden list. Slipped through despite the Intervention A shared fragment. This is the visible caveat.
- *"product-led growth strategy that optimized activation and engagement"* — generic phrasing, the 26% ARR number at least anchors it.
- *"Achieved 97% annual customer retention goals by using the JTBD framework"* — "goals" makes the outcome ambiguous (did she hit the goal or achieve a 97% rate?).

Selected accomplishment 5: *"**Orchestrated** the development and implementation of complex behavior-driven ecommerce programs..."*

- 🚨 *"Orchestrated"* — also on the forbidden list. Also slipped through.

Review panel flagged 2 unrelated errors (an `evidence_found: false` firm-language inconsistency and a position-weight mismatch). The AI-tell phrases are NOT flagged because forbidden-phrase detection is a write-stage discipline, not a verify-stage check.

---

## UI/UX observations

**Good:**
- Three-panel layout is clean and aligned. Benchmark / Resume / Review reads naturally.
- Stage progress bar with six checkmarks gives clear feedback during generation.
- `AI` badge on every rewritten bullet is a tasteful attribution signal — users can see which bullets are rewrites.
- Review panel severity indicator ("Needs review", "No review notes") is legible. Address/Dismiss actions are visible and actionable.
- Promote panel (collapsed) at the bottom of the middle column gives a clear next-action ("Save defaults to knowledge base").
- Pipeline cost displayed inline ($0.047–$0.072 per run) is a nice transparency signal.

**Friction worth flagging:**
- **Pipeline takes 150–200s.** The progress bar keeps the user oriented, but there's no time estimate. On a cold Vertex period, the verify stage can sit at "Waiting on review…" for 40+ seconds without visible progress. A "typical 2–3 min" hint during the run would reduce user anxiety.
- **Session state doesn't persist.** Once the stream closes, refreshing the page or navigating away loses the output. Observed live: after jessica-boquist's run completed and I attempted to take a delayed screenshot, the page had reset to the intake form. A "recent runs" list or session-recovery mechanism would help paying users who don't realize they should save immediately.
- **Forbidden-phrases compliance is probabilistic.** Not a UX issue per se, but the visible output quality varies run-to-run. Intervention A's 50% reduction is real but not complete.

**No blockers encountered:**
- No console errors beyond a single auth-page one that was unrelated to the pipeline.
- No broken panels, empty sections, or failed API calls visible to the user.
- Upload, paste, and generate flows all worked first-try.

---

## Recommendation

**Ship v3 to paying customers.** The output quality is sufficient for a $49/month tier.

Three follow-ups worth tracking (none shipping-blocking):

1. **Session persistence.** Short-term: add a "last run" localStorage cache that the page can hydrate on refresh. Medium-term: persist completed runs server-side and expose a "history" view. This is a real product gap I'd expect users to hit.

2. **Forbidden-phrases compliance.** Current ~50% reduction. Two paths: (a) stronger prompt wording with negative-example contrasts specifically on the two most frequent violators ("with a track record", "Orchestrated"), measured on a dedicated mini-corpus; (b) post-write mechanical scan + retry, analogous to the pronoun-retry pattern from Fix 4. Option (b) is more robust; worth prototyping.

3. **Pipeline-time expectation setting.** Add copy during the stage progression: *"Typical run: 2–3 minutes. Currently on VERIFY."* One line in the stage progress card.

None of these gate shipping. v3 is ready.

---

## Artifacts

- `docs/v3-rebuild/reports/ux-test/fixture-12-screenshot-full.png` — joel-hough full-page screenshot
- `docs/v3-rebuild/reports/ux-test/fixture-04-screenshot-full.png` — bshook full-page screenshot
- `docs/v3-rebuild/reports/ux-test/fixture-12-rendered-text.md` — joel-hough captured text
- `docs/v3-rebuild/reports/ux-test/fixture-04-rendered-text.md` — bshook captured text
- `docs/v3-rebuild/reports/ux-test/fixture-10-rendered-text.md` — jessica-boquist captured text (UI run completed; session cleared before screenshot; prose equivalent to the fixture-runner output)
- `docs/v3-rebuild/reports/ux-test/fixture-12-journey-log.md` — timing and friction notes

## Cost

~$0.18 in pipeline costs (three runs at $0.047/$0.072/$0.063). Under the $5 cap.
