# Benchmark Profile Foundation Plan

## Status

- Owner: Codex
- Date: 2026-04-27
- Scope: Make Benchmark Profile the canonical intelligence layer that powers resume tailoring, LinkedIn, job search, networking, interview prep, cover letters, thank-you notes, and follow-up.

## Product Thesis

CareerIQ should not ask users to fill out another blank career form. The user should upload the most comprehensive resume they have, add their LinkedIn profile text or PDF, tell us target roles, and receive a mostly pre-populated Benchmark Profile.

The promise:

- 10-15 minutes up front.
- 75-85% of the Benchmark Profile drafted automatically.
- Every future resume rewrite, LinkedIn section, cover letter, networking message, and interview answer gets faster and sharper because the app already knows the candidate's proof, positioning, risks, and voice.

## Core UX Rule

Every important field starts as one of these states:

- `high_confidence`: pulled directly from resume or LinkedIn.
- `good_inference`: strongly suggested by the evidence, needs quick confirmation.
- `needs_answer`: missing but high value.
- `risky_claim`: do not use in user-facing content until confirmed.

The user should mostly confirm, correct, or answer pointed questions. They should not have to write positioning from scratch.

## Canonical Data Model

Use `career_profile` as the compatibility home, then evolve it into a richer Benchmark Profile contract.

Required top-level sections:

- `source_material`
  - resume text/upload metadata
  - LinkedIn profile text/PDF metadata
  - target roles, industries, location constraints, current situation
- `identity`
  - benchmark candidate headline
  - Why Me story
  - Why Not Me
  - operating identity
  - authentic voice notes
- `targeting`
  - target role families
  - target seniority
  - target industries
  - ideal company environments
  - walk-away criteria
- `proof`
  - signature accomplishments
  - quantified wins
  - scope markers
  - leadership/team/budget/system scale
  - story bank seeds
- `linkedin_brand`
  - current headline/About/experience text
  - five-second audit
  - recruiter keyword map
  - rewritten headline/About options
  - content pillars
  - blog/carousel themes
- `risk_and_gaps`
  - missing proof
  - adjacent skills needing confirmation
  - claims that need safer language
  - interview objections
- `approved_language`
  - approved one-line positioning
  - approved 30-second Why Me
  - approved resume summary language
  - approved LinkedIn opening language
  - approved networking intro
  - phrases to avoid
- `completion`
  - confidence by section
  - pending questions
  - downstream readiness flags

## AI Auto-Creation Targets

Expected first-pass automation from comprehensive resume plus LinkedIn:

- Career history, companies, titles, dates: 90-98%
- Core functions, keywords, tools, domains: 85-95%
- Quantified wins and proof themes: 80-90%
- LinkedIn five-second audit: 85-90%
- Resume/LinkedIn mismatch detection: 80-90%
- Why Me first draft: 75-85%
- Benchmark candidate positioning: 70-85%
- LinkedIn content pillars: 70-85%
- Why Not Me/risk areas: 55-75%
- Target direction: 50-75% unless target roles are explicit

## Discovery Question Strategy

Do not ask broad questions until the AI has already drafted the profile.

Ask only pointed questions that can materially improve downstream output:

- "We found strong Salesforce/platform delivery proof. Should we position you for Product Owner, Business Systems Consultant, or both?"
- "Your resume suggests AI-assisted workflows. Can we safely say that, or should we keep the claim softer?"
- "The strongest proof point appears to be 22,000+ users. Should that lead the LinkedIn About opening?"
- "You have API/backend analysis evidence. Did you own requirements only, or influence technical design?"
- "This profile looks strongest for regulated enterprise environments. Is that the lane you want to pursue?"

Each question should include:

- why we are asking
- evidence we found
- recommended answer
- quick choices
- free-form correction

## Downstream Contract

Every product must load Benchmark Profile through `loadAgentContextBundle` and `sharedContext`.

Required consumers:

- Tailor Resume
  - approved positioning
  - proof themes
  - quantified wins
  - adjacent-skill confirmation status
  - Why Not Me/walk-away signals
- Cover Letter
  - approved Why Me
  - role-specific value prop
  - proof themes
  - voice constraints
- LinkedIn Editor
  - five-second audit
  - keyword map
  - approved headline/About language
  - risky claims to avoid
- LinkedIn Content
  - content pillars
  - proof stories
  - keyword strategy
  - voice notes
- Job Search
  - target role families
  - ideal company environments
  - walk-away criteria
  - benchmark fit markers
- Networking
  - concise positioning
  - target-company relevance
  - proof themes
  - softer adjacent-skill language when unconfirmed
- Interview Prep
  - Why Me
  - Why Not Me
  - risk/objection map
  - signature stories
  - proof gaps to prepare for
- Thank-You and Follow-Up
  - approved voice
  - role-specific value prop
  - interview/context references
  - reusable proof language

If a downstream generator does not consume Benchmark Profile, it is incomplete.

## Implementation Sequence

## Implementation Snapshot — 2026-04-27

Completed in the current rollout:

- Profile Setup now asks for the user's most comprehensive resume and full LinkedIn profile text, with the 10-15 minute setup promise stated up front.
- `career_profile` now supports a backward-compatible `benchmark_profile_v1` payload with identity, proof, LinkedIn brand, risk/gap, approved-language, discovery-question, and downstream-readiness sections.
- Benchmark Profile draft items can be edited, approved, or marked as needing evidence from the Benchmark Profile page.
- Discovery questions can now be answered from the Benchmark Profile page. Saved answers are mapped into shared evidence so downstream agents can use user-confirmed context.
- Shared context now carries Benchmark Profile guidance into resume-adjacent products, LinkedIn profile editing/audit/content, cover letters, networking, interview prep, thank-you notes, follow-up emails, job search ranking, and application tracker follow-ups.
- Downstream prompt formatting now includes a named "Benchmark Profile Direction" block that separates approved language, proof themes, recruiter/search signals, risk areas, and confirmation-needed items.
- Focused validation currently passing:
  - server `tsc --noEmit`
  - app `tsc --noEmit`
  - server `shared-context-prompt` and `career-profile-context` tests
  - app `ProfileReveal` and `useLinkedInProfile` tests

### Phase 1 — Foundation UX and Contract

- Update Profile Setup copy to tell users to upload the most comprehensive resume, not the prettiest resume.
- Set expectation: 10-15 minutes up front saves hours across the job search.
- Treat LinkedIn input as full profile text/PDF, not only the About section.
- Add confidence labels to the intake/reveal data model.
- Keep LinkedIn URL as reference only; do not scrape LinkedIn.

### Phase 2 — Rich Benchmark Profile Draft

- Extend profile setup intake agent to produce structured draft sections:
  - Why Me
  - Why Not Me
  - benchmark candidate statement
  - signature proof
  - recruiter keyword map
  - LinkedIn five-second audit seed
  - content pillars
  - risk and adjacent-proof items
- Persist the result as `career_profile` with backward-compatible fields plus a richer `benchmark_profile` payload.
- Sync legacy `why_me_stories` from the canonical profile for compatibility only.

### Phase 3 — Review and Approval UI

- Rebuild Benchmark Profile page around section states:
  - Drafted
  - Needs confirmation
  - Approved
  - Needs evidence
- Let the user approve or edit high-value language blocks.
- Show "Used by" labels for Resume, LinkedIn, Cover Letter, Networking, Interview, Follow-Up.
- Add a short discovery queue with only high-value questions.

### Phase 4 — Shared Context Upgrade

- Update `loadAgentContextBundle` to load canonical Benchmark Profile first.
- Map Benchmark Profile into:
  - `sharedContext.candidateProfile`
  - `sharedContext.careerNarrative`
  - `sharedContext.positioningStrategy`
  - `sharedContext.benchmarkCandidate`
  - `sharedContext.gapAnalysis`
  - `sharedContext.evidenceInventory`
  - `platformContext.why_me_story`
- Add provenance and confidence metadata so agents know which claims are confirmed.

### Phase 5 — Downstream Enforcement

- Update prompts/tools for all downstream agents to require Benchmark Profile usage.
- Add guardrails:
  - high-confidence claims can be used directly
  - good inferences must be phrased carefully
  - risky claims require confirmation
  - unsupported claims must become questions, not resume bullets
- Add telemetry to record whether each generated artifact used Benchmark Profile context.

### Phase 6 — Validation

Test with:

- Dan Baumann: operations/technical support/global teams scenario.
- Lisa Slagle: Salesforce Product Owner/Business Systems Consultant LinkedIn audit scenario.
- Synthetic 52-year-old laid-off VP Operations scenario.
- Strong resume + weak LinkedIn.
- Weak resume + strong LinkedIn.
- No LinkedIn profile.
- Career transition with adjacent but unconfirmed skills.

Acceptance criteria:

- User receives a useful draft before answering discovery questions.
- Profile setup asks fewer, sharper questions than the current broad form.
- Resume tailoring clearly uses approved Benchmark Profile proof.
- LinkedIn Editor clearly reflects the five-second audit and keyword strategy.
- Cover letters, networking, thank-you notes, and interview prep all reuse the same approved positioning.
- Unsupported claims are surfaced as questions instead of silently invented.
