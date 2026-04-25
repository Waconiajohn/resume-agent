# Strategy Editorial QA — 2026-04-25

## Test Persona

Professional career strategist reviewing the new editorial effectiveness layer for a 52-year-old VP of Operations who was laid off and is targeting another VP Operations role.

## Stress Scenario

The test case intentionally pressures the system where resume strategists usually add value:

- Source proves `3 manufacturing facilities`, but does not literally say `multi-site`.
- Source proves Oracle ERP implementation, while the JD prefers SAP.
- Source proves operations improvement and KPI cadence, while the JD asks for Lean Six Sigma orientation.
- Source includes a layoff/current-search note that must not read desperate or dated.
- JD is broad and poorly written, requiring inference about the real business problem.

## Career-Strategist Rubric

1. Does the strategy make the candidate more marketable without inventing?
2. Does it distinguish direct proof from reasonable inference and adjacent proof?
3. Does it ask discovery questions where a plausible missing skill may exist?
4. Does it protect against risky claims such as SAP expertise or Lean certification?
5. Does the UI explain the strategic judgment in language a real client can understand?

## Results

### Passed

- The new evidence ladder supports the right human judgment: `3 manufacturing facilities` can become `multi-site manufacturing operations`, while unsupported JD vocabulary still fails.
- Adjacent proof is handled correctly: Oracle ERP can support ERP implementation exposure, not SAP expertise or certification.
- The schema now gives downstream writers and the UI the missing editorial context through `evidenceOpportunities` and `editorialAssessment`.
- The v3 strategy panel now exposes the client-facing judgment as `Strategist read` and `Evidence map`, which is more understandable than internal QA labels.
- Communications agents now share the same truth/effectiveness contract instead of each product improvising its own version.
- A live OpenAI strategy run against the synthetic VP Operations scenario completed successfully with `gpt-5.4-mini`, prompt `strategize.v1` version `1.7`, and final attribution counts of 5 verified / 0 unverified accomplishments.

### Fixed During Live Validation

- The first live run exposed a source-location problem: the strategy could cite truthful position-specific evidence while assigning the accomplishment to the wrong `positionIndex` or to `positionIndex: null`.
- The verifier now performs a second source-location check after broad resume-wide attribution. It keeps the fabrication guard, then verifies that position-specific claim tokens live in the referenced position and that `positionIndex: null` only cites explicit cross-role or custom-section source material.
- The rerun triggered the intended attribution retry on a location-only issue (`totalMissingTokens: 0`) and produced a final clean strategy with 5 verified / 0 unverified accomplishments.

### Full Pipeline Live Validation

- Ran the approved synthetic VP Operations scenario through the full v3 pipeline: classify -> benchmark -> strategize -> write -> verify.
- Final run completed in `25.260s` with estimated cost `$0.072648`.
- Classify preserved the layoff/current-search context as `careerGaps` and `flags` instead of dropping it.
- Write produced a user-facing role date of `2018-Recent` and past-tense bullets, avoiding the earlier implication that the laid-off candidate was still employed.
- Verify passed with `0` errors, `0` warnings, and 8/8 mechanically attributed bullets.
- Final strategy score from `editorialAssessment.callbackPower` was `90`, with a clear market angle around 3 facilities, `$14.8M` cost reduction, and on-time delivery improvement from `82%` to `96%`.

### Additional Blockers Fixed

- Classify now retries transient malformed JSON responses. The live v1.5 classify prompt once returned invalid JSON; the shared structural retry now covers JSON parse and Zod validation failures without silent repair.
- Write now prepares a safe user-facing resume view when a source says both `Present` and recently laid off/currently seeking. It uses `Recent` rather than inventing an exact end date.
- Verify now suppresses false summary-frame warnings when the summary already contains the strategy frame words.

### Interactive Discovery Step

- The strategy panel now turns high-risk or uncertain evidence opportunities into inline discovery questions.
- User answers are sent back as `discovery_answers` and appended to the resume source under a dedicated candidate-provided evidence section for the rerun.
- Classify v1.6 explicitly treats those answers as source evidence without turning the discovery section into a fake position.
- The rerun path preserves the full truth model: classify, benchmark, strategize, write, and verify all see the same new evidence rather than relying on a UI-only override.

### Browser UI Validation — Discovery Loop

- Ran the Atlas VP Operations scenario from the application workspace UI on `http://localhost:5173`.
- First browser run exposed a blocker in the strategize attribution gate: `VP Operations` in the source and `Vice President of Operations` in the strategy field were treated as unsupported, and comma-separated discipline lists manufactured false phrase leaks such as `operations manufacturing`.
- Fixed the attribution matcher so `vice` is role-shape vocabulary and strategy-field n-grams do not cross comma-separated list boundaries.
- Reran from the UI; the pipeline completed all 6 stages and showed `Evidence map` plus `Discovery (1)`.
- Answered the leadership-pipeline discovery prompt with candidate-provided evidence about promoting 3 supervisors and building a CI leader forum, then clicked `Re-run`.
- Discovery rerun completed all 6 stages. The new evidence appeared in the strategy as an emphasized win and the next remaining high-risk gap shifted to post-acquisition / Industry 4.0 discovery, which is the intended iterative strategist behavior.

### Writer Hardening After Browser Validation

- The first post-discovery browser run surfaced one Verify issue on a generated `Continental Manufacturing Corp` bullet involving an unsupported `$4.5M facility expansion` claim.
- Added write-position Rule 2c: numeric claims must stay linked to the source accomplishment they modify; metrics cannot migrate across unrelated source bullets.
- Added a writer-side source-hint attribution retry. If a position bullet says it came from `bullets[N]`, high-risk claim tokens must be present in that cited source bullet, the role title, or the role scope. Otherwise the writer retries once with the exact unsupported tokens named.
- Reran the Atlas scenario through the browser after the hardening. The base run completed all 6 stages with no Review notes.
- Answered the remaining Discovery prompts for Industry 4.0 and post-acquisition integration, then reran. The discovery rerun completed all 6 stages and Review reported `No review notes` / `Safe to export`.

### Knowledge Base Discovery Promotion

- Discovery answers now accumulate across iterative reruns instead of being replaced by the latest answer set.
- Confirmed discovery answers are shown in `Add to knowledge base` as a separate `Confirmed evidence` section.
- Saving selected defaults now sends those answers to the promote API as `candidate_discovery` evidence items, so the user's newly surfaced proof can become reusable master evidence instead of only affecting the current resume run.
- The completed pipeline payload and resumable session snapshot now carry discovery answers, so the promote panel can recover confirmed evidence after a page refresh or session resume.
- Browser smoke after the persistence change: reloaded the Atlas application resume tab, hydrated the saved run, confirmed `Review & pick` rendered and Review still reported `No review notes` / `Safe to export`; no fresh console errors were emitted.

### Residual Risk

- The score label (`84/100`, etc.) is useful, but future UX should explain what drives the score so it does not feel arbitrary.
- Mobile, export, and the live save/promote click path still need a dedicated post-discovery browser pass.

## Strategist Verdict

This is meaningfully stronger than the prior exact-source-only posture. It now behaves more like a senior strategist: truthful, but not timid. It can translate proven scope into market language, preserve adjacent experience without overclaiming, and ask the questions that turn a weak “no” into a defensible “yes.”

The next highest-leverage improvement is an interactive discovery step that appears when `candidate_discovery_needed` or high-risk `adjacent_proof` items are present.
