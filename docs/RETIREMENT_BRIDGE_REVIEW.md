# Retirement Bridge Review

## Current Position

Retirement Bridge should remain a distinct product. It is not just another career deliverable:

- it already has a stronger fiduciary guardrail than the rest of the platform
- it uses a staged assessment flow instead of generic content generation
- it produces a planner-facing handoff artifact rather than a marketing asset
- it belongs under Financial Wellness, not under the general Career Profile execution path

The current backend route in [server/src/routes/retirement-bridge.ts](/Users/johnschrup/Documents/New%20project/resume-agent/server/src/routes/retirement-bridge.ts) loads:

- `client_profile`
- `positioning_strategy`
- `emotional_baseline`

That is directionally right, but it still reflects the older context model more than the newer shared Career Profile contract.

## What Should Stay True

- Keep the fiduciary boundary explicit: the product can surface questions, observations, and planning prompts, but it should not drift into advice.
- Keep Retirement Bridge out of the normal “Career Profile drives everything” story in the UI. It can use profile context, but it should still present itself as a specialized transition-planning tool.
- Keep the assessment -> planner handoff sequence. That is the right structure for trust.

## Main Gaps

1. The route still treats `client_profile` as the main identity source instead of reading `career_profile` first and falling back to legacy context.
2. The UI explains the guardrail, but it does not yet clearly show what transition context the tool is using from Career Profile.
3. The final handoff artifact is useful, but it is not yet surfaced as a first-class saved planning asset inside Financial Wellness.
4. The relationship between emotional baseline, transition risk, and planner handoff is still mostly hidden from the user.

## Recommended Next Slice

### 1. Context upgrade

Update Retirement Bridge to read:

- `career_profile`
- `client_profile` as fallback
- `emotional_baseline`
- `positioning_strategy` only when it adds relevant transition context

This should not make the product feel like a resume tool. It should only use shared context to better understand:

- target transition direction
- seniority
- constraints
- must-haves
- emotional pressure during the transition

### 2. Two-phase UI

Make the product visually clearer as:

1. `Assessment`
2. `Planner Handoff`

That split should be obvious in Financial Wellness so the user understands:

- first we surface the right questions
- then we package the results for a planner conversation

### 3. Stronger handoff artifact

Persist and display a clearer handoff summary with:

- readiness snapshot by dimension
- top planner questions
- major constraints and risks
- what changed since the last assessment

### 4. Explainability

Inside Financial Wellness, show a small “using your transition context” block that explains:

- which parts of Career Profile are relevant here
- which parts are intentionally ignored
- why the tool still stops short of financial advice

## Recommendation

Do not fold Retirement Bridge into the general tool cleanup stream.

Keep it, strengthen the specialized guardrails, and modernize it as a separate Financial Wellness product that can optionally read shared Career Profile context without losing its fiduciary discipline.
