# Feature Keep/Cut Matrix

## Goal

Turn the production sweep into an explicit product decision pass:

1. identify the features worth carrying into production
2. identify the features that should be simplified, folded in, or removed
3. avoid deleting anything until the product call is approved

This document is intentionally opinionated. It is based on the current live room model, the recent cleanup work, and the principle that the product should bias toward:

- real hiring outcomes
- real backend-backed workflows
- simple room ownership
- fewer overlapping product identities

## Decision Rules

Every room or subflow is judged against the same questions:

1. Does it help the user get hired faster?
2. Is it backed by real data or a real backend workflow?
3. Does it duplicate a stronger surface?
4. Does it create routing or mental-model confusion?
5. Would a demo video cover the use case better than keeping the feature live?

## Status Key

- `Keep`: production-worthy as an active feature
- `Keep but simplify`: keep the capability, but reduce surface area or fold support tabs in
- `Fold into stronger room`: capability stays, product identity goes away
- `Cut candidate`: should be removed unless there is a strong strategic reason to keep it

## Room-by-Room Review

### Workspace Home

Status: `Keep`

Why:

- It is the orchestrator for the whole product.
- The recent shell cleanup made it much more trustworthy.
- It is required even if individual rooms keep shrinking.

Follow-up:

- Keep tightening entry guidance.
- Do not let Home become a second product room or a dashboard toybox again.

### Career Profile / Your Profile

Status: `Keep`

Why:

- It is the dependency room for gating and positioning across the rest of the app.
- It owns the user story, proof, and profile readiness needed by Resume, LinkedIn, and Interview Prep.

Follow-up:

- Keep it as the grounding layer, not a side product.
- Fold adjacent support concepts into it where possible.

### Resume Builder

Status: `Keep`

Why:

- It is one of the two clearest core product outcomes.
- The architecture is finally coherent enough to treat as core.

Follow-up:

- Continue punch-list hardening, not architecture churn.
- Avoid reintroducing alternate review surfaces.

### LinkedIn Studio

Status: `Keep but simplify`

Why:

- It clearly supports hiring outcomes.
- It now has a much cleaner primary workflow:
  - `Profile`
  - `Write`
  - `Results`

Cut/consolidation candidates inside the room:

- `Content Plan`
- `Library`

Recommendation:

- Keep the underlying capability if it is used.
- Consider folding `Content Plan` and `Library` into the main `Write` or `Results` experience instead of keeping them as first-class tabs.

Decision needed:

- Do you want LinkedIn Studio to remain a broader content workspace, or just a sharper profile-plus-post workflow?

### Job Command Center

Status: `Keep but simplify`

Why:

- It is core to active search.
- The recent cleanup made the room much easier to trust.

Current strong structure:

- `Today`
- `Discover`
- `Pipeline`

Cut/consolidation candidates inside the room:

- any extra discovery branch that duplicates `Smart Matches`
- any watchlist or search support surface that does not clearly outperform the main discovery flow

Recommendation:

- Keep the room.
- Continue pruning subflows that turn discovery into a pile of search toys.

Decision needed:

- If `Discover` still feels too wide in live use, the next cut should be secondary discovery modes, not the room itself.

### Smart Referrals / Network Job Search

Status: `Keep`

Why:

- It is one of the clearest differentiated hiring workflows in the app.
- It is now more coherent after the NI cleanup.

Current canonical model:

- `Import`
- `Connections`
- `Target Titles`
- `Job Matches`
- `Job Scan`
- `Bonus Search`
- `Referral Bonus`
- `Contacts & Outreach`

Consolidation candidate:

- standalone `Networking Hub` as a separate product identity

Recommendation:

- Keep Smart Referrals as the canonical networking/job-search room.
- Continue folding contact and outreach work into it.
- Do not bring back a separate networking product identity if the user experiences it as the same workflow.

Decision needed:

- I recommend retiring the idea of Networking Hub as a separate “thing,” even if the internal component remains.

### Interview Prep

Status: `Keep`

Why:

- It is a strong downstream hiring workflow.
- The room hierarchy is now much more coherent.

Current structure:

- `Prep`
- `Practice`
- `Leave-behinds`
- `Follow-up`

Consolidation candidates:

- separate follow-up tool identities inside the room

Recommendation:

- Keep the room.
- Keep tightening the follow-up family so the user feels one post-interview workflow, not four separate mini-products.

Decision needed:

- None urgent. This looks more like simplification than removal.

### Executive Documents

Status: `Fold into stronger room`

Why:

- The outputs may still be useful.
- The umbrella identity is weaker than the underlying tools.
- It is currently a hidden/support room, which is usually a signal that the product identity is not strong enough.

Current tabs:

- `Executive Bios`
- `Case Studies`

Recommendation:

- Keep `Executive Bio` and `Case Study` capabilities only if they are genuinely used.
- Remove `Executive Documents` as a branded umbrella room and route directly to the tools if needed.

Decision needed:

- Do you want to keep both tools, but lose the umbrella?
- Or is one of those two itself expendable?

### Financial Wellness

Status: `Cut candidate`

Why:

- It is off the main “get hired faster” path.
- It is a hidden room.
- It contains a lot of static/support-style framing and educational content.
- It is the strongest match for “show it in a video, don’t carry it as a live feature.”

Recommendation:

- Cut the room unless you have a clear go-to-market reason to keep it.

Decision needed:

- Keep only if you see this as a deliberate strategic pillar, not a nice-to-have.

### Resume Workshop landing structure

Status: `Keep but simplify`

Why:

- The room helps orient users between:
  - tailored resumes
  - master resume
  - cover letters
  - saved workspaces

Weakness:

- It still behaves a little like a tool switchboard.

Recommendation:

- Keep the capability.
- Continue simplifying the landing choices if live use shows that one or more of these options rarely matter:
  - `Cover Letter`
  - `Job Workspaces`

Decision needed:

- None immediate, but this room should be watched for “too many choices” creep.

## Current Cut Candidates

These are the strongest current candidates for removal or identity collapse.

### 1. Financial Wellness

Recommended action: `Cut`

Why:

- weak alignment with the core hiring promise
- hidden room already
- static/support-heavy

### 2. Executive Documents umbrella room

Recommended action: `Cut the umbrella, keep only the underlying tools if needed`

Why:

- the room identity is weaker than the actual outputs
- hidden room status suggests it is not a strong top-level product

### 3. Networking Hub as a separate product identity

Recommended action: `Fold into Smart Referrals`

Why:

- Smart Referrals is already the stronger canonical flow
- separate networking identity risks duplicating the same workflow in two places

### 4. LinkedIn support tabs as first-class tabs

Recommended action: `Review for consolidation`

Targets:

- `Content Plan`
- `Library`

Why:

- the real workflow is already `Profile -> Write -> Results`
- support tabs should justify their existence

### 5. Secondary discovery branches inside Job Command Center

Recommended action: `Review for further pruning`

Why:

- this room can easily re-grow into overlapping search surfaces
- the recent cleanup improved it specifically by cutting weaker discovery loops

## What I Would Not Cut

These look like the production core:

- Workspace Home
- Career Profile
- Resume Builder
- Smart Referrals
- Job Command Center
- LinkedIn Studio
- Interview Prep

## Recommended Removal Sequence

If the cut candidates are approved, I would remove them in this order:

1. `Financial Wellness`
2. `Executive Documents` umbrella identity
3. `Networking Hub` as a standalone product identity
4. LinkedIn support tabs that do not justify themselves in live use
5. any remaining weak discovery branches inside Job Command Center

## Approval Checklist

Before I delete anything, the product call needed from you is:

1. Keep or cut `Financial Wellness`?
2. Keep `Executive Documents` as a room, or fold its tools into direct routes?
3. Keep `Networking Hub` as a separate identity, or fully collapse it into Smart Referrals?
4. Keep LinkedIn `Content Plan` and `Library` as first-class tabs, or fold them into the main workflow?
5. Should I continue pruning `Discover` if I find more weak subflows inside Job Command Center?

## Next Step

Once those decisions are approved:

1. I will make one removal sweep
2. delete the approved weak surfaces
3. delete dead routing and tests
4. rerun focused suites
5. push the cleanup as one deliberate production-reduction pass
