# Sprint: LMS + CareerIQ Integration + LinkedIn 360Brew Update

**Goal:** Connect the LMS to CareerIQ's agent data so every lesson is personalized, embed tool launch points in lessons, and upgrade the LinkedIn Content agent to produce 360Brew-optimized document carousels.

**Started:** 2026-04-14

## Epic 1 — LinkedIn Content Agent: Document Carousel Upgrade (Week 1)

### Story 1.1 — PDF Carousel Generation for LinkedIn Posts [done 2026-04-21]
- **As a** CareerIQ user in job search
- **I want** my LinkedIn content agent to produce document carousels (PDF format)
- **So that** my posts reach 3x more people via 360Brew's document post preference
- **Acceptance Criteria:**
  - [x] Agent produces a structured multi-slide carousel (8-12 slides) as primary output — `generate_carousel` tool + `buildCarouselSlides`
  - [x] Each carousel has a cover slide, 6-10 content slides, and a closing CTA slide — 3-type output from `buildCarouselSlides`
  - [x] Output is rendered as a downloadable PDF the user can upload directly to LinkedIn — `app/src/lib/export-carousel-pdf.ts` (jsPDF, A4 landscape, branded)
  - [x] Existing text post output is retained as a secondary format option — `carousel_format: 'text' | 'carousel' | 'both'` (default `both`)
  - [x] Carousel content follows 360Brew topic DNA consistency — Rule 6 in `linkedin-content/knowledge/rules.ts` + `expertise_area` on every topic
- **Test coverage added 2026-04-21:** `carousel-builder.test.ts` (13 tests) + 3 new `generate_carousel` cases in `linkedin-content.test.ts`. Server suite 2551/0.
- **Dependencies:** LinkedIn Content agent, PDF generation library
- **Complexity:** Medium

### Story 1.2 — Interview Authority Method Content Type [done 2026-04-21]
- **As a** CareerIQ user
- **I want** the LinkedIn Content agent to generate posts that answer difficult interview questions
- **So that** hiring managers searching those questions find my content before the interview
- **Acceptance Criteria:**
  - [x] New content type: "Interview Authority" in LinkedIn Content agent — `content_type: 'standard' | 'interview_authority'` state field, product.ts routes `input.content_type`, defaults to `standard`, unknowns normalized to `standard`
  - [x] Agent identifies 5 hardest interview questions for target role — `suggest_interview_authority_topics` strategist tool, prompt demands exactly 5 questions across 5 category archetypes
  - [x] Each question becomes one carousel from evidence library + authentic phrases — writer prompt branches on `content_type === 'interview_authority'`; `evidence_refs` required per topic; `generate_carousel` always called after write per agent instructions
  - [x] Output is genuinely expert, specific to user's experience — writer system prompt mandates 80% real experience / 20% framing, traces every claim to evidence library
  - [x] Carousel format: Question cover slide, 6-8 answer slides, closing value prop — `buildCarouselSlides` handles the 3-part structure; writer uses interview question AS the cover headline
- **Test coverage added 2026-04-21:** 7 new tests in `linkedin-content.test.ts` — `createInitialState` content_type routing (3 cases including unknown-value normalization) + 4 `suggest_interview_authority_topics` cases (5-topic output, iq- id prefix enforcement, invalid-JSON fallback, transparency emission).
- **Dependencies:** Story 1.1, positioning profile, job finder target role, evidence library
- **Complexity:** Medium

### Story 1.3 — 360Brew Optimization Rules in Content Agent [done 2026-04-21]
- **As a** CareerIQ user
- **I want** my LinkedIn content optimized for 360Brew's ranking signals
- **So that** my posts reach hiring managers beyond my immediate network
- **Acceptance Criteria:**
  - [x] Content agent updated with 360Brew rules — `RULE_6_360BREW` in `linkedin-content/knowledge/rules.ts` + combined into `LINKEDIN_CONTENT_RULES` for system-prompt injection; covers hard prohibitions (no external links, no engagement bait, no AI filler phrases), depth over brevity, topic DNA consistency
  - [x] Optimal length: 1,000-1,300 chars for text, 8-12 slides for carousels — named in Rule 6, enforced in writer tools (`write_post` warns under 1,000 / trims over 1,300; `generate_carousel` warns outside 8-12)
  - [x] Content calendar includes recommended posting time — `recommended_posting_time` populated in `finalizeResult`, emitted with `content_complete`, defaults to 8am user timezone (falls back to America/Chicago)
  - [x] Agent avoids AI-sounding filler phrases flagged by 360Brew — Rule 6 lists them explicitly; `detectForbiddenPhrases` retry exists at the Resume V2 layer as the canonical pattern; LinkedIn Content enforces via prompt
  - [x] Each piece categorized by topic DNA tag — `expertise_area` required on every `TopicSuggestion`, both in standard (`suggest_topics`) and interview-authority (`suggest_interview_authority_topics`) paths
- **Test coverage added 2026-04-21:** 7 new tests in `linkedin-content.test.ts` — 5 rule-content assertions (hard prohibitions, length target, slide target, topic DNA, rule composition) + 2 `finalizeResult` posting-time cases (user timezone + default fallback).
- **Dependencies:** User timezone, positioning profile topic area
- **Complexity:** Small

## Epic 2 — LMS Personalization Layer (Weeks 2-4)

### Story 2.1 — Lesson Injection Schema and Renderer [done]
### Story 2.2 — Course 1 Injection: Understanding the System [done]
### Story 2.3 — Course 2 Injection: Super Bowl Story [done]
### Story 2.4 — Course 3 Injection: Resume Mastery [done]
### Story 2.5 — Courses 4-8 Injection [done]
### Story 2.6 — "Launch Tool" Embedded Buttons [done]

## Epic 3 — Hermes Heartbeat Integration (Week 5+)

### Story 3.1 — LinkedIn Content Calendar Heartbeat [not started]
### Story 3.2 — Job Search Heartbeat [not started]

## Out of Scope
- LMS course content creation (content exists, just needs injection)
- Hermes infrastructure (separate repo/service)
- Mobile-specific carousel rendering
