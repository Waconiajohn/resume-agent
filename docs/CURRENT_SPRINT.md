# Sprint: LMS + CareerIQ Integration + LinkedIn 360Brew Update

**Goal:** Connect the LMS to CareerIQ's agent data so every lesson is personalized, embed tool launch points in lessons, and upgrade the LinkedIn Content agent to produce 360Brew-optimized document carousels.

**Started:** 2026-04-14

## Epic 1 — LinkedIn Content Agent: Document Carousel Upgrade (Week 1)

### Story 1.1 — PDF Carousel Generation for LinkedIn Posts [in progress]
- **As a** CareerIQ user in job search
- **I want** my LinkedIn content agent to produce document carousels (PDF format)
- **So that** my posts reach 3x more people via 360Brew's document post preference
- **Acceptance Criteria:**
  - [ ] Agent produces a structured multi-slide carousel (8-12 slides) as primary output
  - [ ] Each carousel has a cover slide, 6-10 content slides, and a closing CTA slide
  - [ ] Output is rendered as a downloadable PDF the user can upload directly to LinkedIn
  - [ ] Existing text post output is retained as a secondary format option
  - [ ] Carousel content follows 360Brew topic DNA consistency
- **Dependencies:** LinkedIn Content agent, PDF generation library
- **Complexity:** Medium

### Story 1.2 — Interview Authority Method Content Type [not started]
- **As a** CareerIQ user
- **I want** the LinkedIn Content agent to generate posts that answer difficult interview questions
- **So that** hiring managers searching those questions find my content before the interview
- **Acceptance Criteria:**
  - [ ] New content type: "Interview Authority" in LinkedIn Content agent
  - [ ] Agent identifies 5 hardest interview questions for target role
  - [ ] Each question becomes one carousel from evidence library + authentic phrases
  - [ ] Output is genuinely expert, specific to user's experience
  - [ ] Carousel format: Question cover slide, 6-8 answer slides, closing value prop
- **Dependencies:** Story 1.1, positioning profile, job finder target role, evidence library
- **Complexity:** Medium

### Story 1.3 — 360Brew Optimization Rules in Content Agent [not started]
- **As a** CareerIQ user
- **I want** my LinkedIn content optimized for 360Brew's ranking signals
- **So that** my posts reach hiring managers beyond my immediate network
- **Acceptance Criteria:**
  - [ ] Content agent updated with 360Brew rules: no external links, no engagement bait, depth over brevity, topic DNA consistency
  - [ ] Optimal length: 1,000-1,300 chars for text, 8-12 slides for carousels
  - [ ] Content calendar includes recommended posting time (8-9am or 2-3pm user timezone)
  - [ ] Agent avoids AI-sounding filler phrases flagged by 360Brew
  - [ ] Each piece categorized by topic DNA tag for consistency
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
