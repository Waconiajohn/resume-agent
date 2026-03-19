# Resume V2 Real-Session QA Checklist

Use this checklist when reviewing `resume-v2` against real resumes and real job descriptions. The goal is to judge product quality, not just whether the pipeline technically runs.

## Recommended Test Data

- Resume/browser quality fixtures:
  - [e2e/fixtures/real-resume-data.ts](/Users/johnschrup/Documents/New%20project/resume-agent/e2e/fixtures/real-resume-data.ts)
  - [e2e/fixtures/quality-validation-data.ts](/Users/johnschrup/Documents/New%20project/resume-agent/e2e/fixtures/quality-validation-data.ts)
- Browser validation spec:
  - [e2e/tests/quality-validation.spec.ts](/Users/johnschrup/Documents/New%20project/resume-agent/e2e/tests/quality-validation.spec.ts)

When possible, also run this checklist against 3-5 real user resumes and JDs from different functions and seniority levels.

Current default QA policy:

- The default `qa:real` batch should favor representative customer roles first:
  - IT / cloud / SaaS leadership
  - operations leadership
  - commercial / marketing leadership
- The default batch should dedupe repeated reruns of the same pair.
- Outlier domains should not dominate the acceptance gate. If you need to regression-test an edge case, pass explicit session IDs with `REAL_QA_SESSION_IDS=...` instead of making it part of the default batch.

## Recommended Command

Use the server QA script so the run picks up `.env`, avoids the noisy `DEP0040` toolchain warning, and writes artifacts consistently:

```bash
cd /Users/johnschrup/Documents/New\ project/resume-agent/server
npm run qa:real
```

If you need to run a specific curated set, pass the session IDs explicitly:

```bash
REAL_QA_SESSION_IDS=id-1,id-2,id-3 npm run qa:real
```

## What Good Looks Like

- The app explains what the AI is doing in plain English.
- The rewrite queue prioritizes fixable, high-impact JD items before harder or less actionable items.
- Hard requirements are flagged honestly as risks instead of being disguised as normal proof-building work.
- The benchmark candidate is realistic and useful, not a fantasy unicorn.
- Coaching questions are specific and uncover hidden evidence.
- Suggested language is strong but still defensible.
- Final Review feels like a real recruiter plus hiring-manager pressure test.

## Stage 1: Analyze the Role

Check:

- The app explains that it is reading the JD, extracting requirements, building a benchmark, and comparing the current resume.
- Extracted JD requirements preserve real hard requirements like degrees, licenses, certifications, and years-of-experience thresholds.
- The benchmark candidate stays tied to the actual role and industry.
- The benchmark does not introduce unsupported prestige proxies or unrealistic differentiators.

Questions:

- Did the job intelligence output capture the real must-haves?
- Did it avoid inventing company context or business problems?
- Does the benchmark feel like a strong market candidate rather than a fantasy candidate?

## Stage 2: Fix the Resume

Check:

- `What to Fix Next` is understandable without decoding internal system language.
- The first item feels like the most useful next action.
- Quick wins with nearby evidence surface before benchmark stretch items.
- Hard requirements show up as risks with honest guidance:
  - confirm whether the credential exists
  - add proof if it exists
  - use adjacent framing only if it stays soft and truthful
- `View in Resume` only appears when actual proof exists on the draft.
- The system does not dump the user into a random resume bullet when it cannot honestly place a suggested edit.

Questions:

- Is the queue prioritizing fixability plus JD impact, not just raw severity?
- Are hard gaps separated from normal rewrite work?
- Does each item show one clear next move?

## Coaching Loop

Check:

- The first interaction is one targeted question, not a wall of controls.
- Follow-up questions are specific to the person’s background and the actual gap.
- If one answer is not enough, the system asks the next best question instead of stopping too early.
- Generated rewrite options are credible, specific, and not padded with generic jargon.

Questions:

- Would a normal user understand why they are being asked this question?
- Did the question meaningfully improve the final draft?
- Did the app avoid fabricating experience or credentials?

## Stage 3: Pressure-Test the Draft

Check:

- Final Review does not appear too early.
- The 6-second scan and hiring-manager critique feel distinct and useful.
- Hard requirements missing from the draft are elevated as screen-out risks.
- Benchmark gaps are treated as competitiveness issues, not automatic rejection reasons.

Questions:

- Does Final Review focus primarily on JD fit?
- Are the concerns concrete and actionable?
- Are truly missing hard requirements called out directly?

## Stage 4: Polish and Export

Check:

- Export warnings reflect reality:
  - no Final Review yet
  - Final Review stale
  - unresolved critical concerns
  - unresolved hard requirement risks
- Warning copy is understandable to a normal user.
- The app does not imply that unresolved hard risks have been solved just because the resume is stronger overall.

Questions:

- Would the user understand what still needs attention before export?
- If they export anyway, is the risk clearly explained?

## Content Quality Red Flags

Flag the session if any of these appear:

- Benchmark candidate reads like a fantasy unicorn.
- Missing degree/license/certification is softened as if it were solved.
- Queue recommends a non-fixable credential gap before easier, higher-value proof upgrades.
- Coaching questions are generic or unrelated to the resume.
- Suggested edits sound inflated or legally risky.
- Final Review ignores obvious screening issues.
- The app uses internal terms that a paying customer would not understand.

## Manual Review Scorecard

Rate each real session from 1-5:

- JD requirement quality
- Benchmark realism
- Queue clarity
- Queue prioritization
- Coaching quality
- Rewrite quality
- Final Review realism
- Export/readiness honesty

## Log Template

For each session reviewed, capture:

- Resume / JD pair:
- Target role / company:
- Best thing the app did:
- Biggest quality problem:
- Worst confusing moment in the UI:
- Any hard-gap handling issue:
- Would you trust this output enough to export:
- Recommended follow-up fix:
