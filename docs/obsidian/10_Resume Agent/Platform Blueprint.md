# Platform Blueprint

> Source: Google Drive `Agentic.AI Company/SYNTHESIS.md` + `platform-product-roadmap.docx` + `agent-architecture-specification.docx`

## Overview

33-agent career coaching platform. The agent runtime (loop, bus, context, protocol) is domain-agnostic. Each product provides typed tools, AgentConfig, product state type, and a coordinator.

## The 33 Agents -- Complete Catalog

### Category 1: Career Positioning (3 agents) -- BUILT

| # | Agent | Status | Pipeline Cost |
|---|-------|--------|--------------|
| 1 | Resume Strategist | Production | ~$0.08 |
| 2 | Resume Craftsman | Production | ~$0.10 |
| 3 | Resume Producer | Production | ~$0.05 |

### Category 2: Document & Positioning Cluster (3 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 4 | Cover Letter Agent | Phase 2 | Targeted cover letters from positioning profile |
| 5 | LinkedIn Profile Editor Agent | Phase 2 | Full profile transformation aligned with resume |
| 6 | LinkedIn Blogging Strategy Agent | Phase 2 | 60-day content calendar with ready-to-publish posts |

### Category 3: Job Discovery Cluster (3 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 7 | Job Finder Agent | Phase 3 | 3-layer job discovery (boards, scraping, network) |
| 8 | Boolean Search Agent | Phase 3 | 30+ title variations with platform-specific syntax |
| 9 | Application Tracker & Pipeline Agent | Phase 3 | Command center with follow-up engine & health reports |

### Category 4: Interview & Relationship Cluster (4 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 10 | Interview Prep Agent | Phase 4 | Company research, question prediction, mock interviews |
| 11 | Salary Negotiation Agent | Phase 4 | Data-driven negotiation strategy & scripts |
| 12 | LinkedIn Networking Agent | Phase 4 | Rule of Four targeting, personalized outreach |
| 13 | References & Recommendations Agent | Phase 4 | Reference selection, briefing docs, LinkedIn rec templates |

### Category 5: Financial Wellness Cluster (3 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 14 | Retirement Planning Agent | Phase 5 | Retirement readiness analysis, planner warm handoff |
| 15 | Emotional Wellness & Mindset Agent | Phase 5 | Background emotional monitoring, cognitive reframing |
| 16 | Skills Gap & Career Pivot Agent | Phase 5 | Skills mapping, upskilling ROI, pivot vs reposition |

### Category 6: Contract Career Track (5 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 17 | Contract Recruiter Database Agent | Phase 3-4 | Build/maintain database of every staffing firm |
| 18 | Contract Resume Distribution Agent | Phase 3-4 | Targeted resume distribution to relevant recruiters |
| 19 | Contract Pipeline Perpetual Motion Agent | Phase 3-4 | Zero-gap deployment, escalating marketing as contract ends |
| 20 | Contract Rate Negotiation Agent | Phase 4 | Rate intelligence, margin awareness, benefits gap calc |
| 21 | Continuous Marketing Engine | Phase 3-4 | Always-on LinkedIn presence, portfolio generation |

### Category 7: Lead Generation & Intelligence (3 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 22 | Executive Job Seeker Sourcing Agent | Phase 7 | WARN Act feeds, layoff signals, lead scoring (0-100) |
| 23 | Company Monitoring Agent | Phase 3-4 | Auto-monitors target companies for new postings |
| 24 | LinkedIn Relationship Mapping Agent | Phase 3-4 | Maps connection network, identifies referral paths |

### Category 8: Content & Marketing (2 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 25 | PR/Blogging Agent | Phase 7 | SEO content generation for career transition keywords |
| 26 | Social Media Content Engine | Phase 7 | Multi-platform content distribution |

### Category 9: Operations (4 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 27 | Client Success & Retention Agent | Phase 7 | Churn prediction, re-engagement, lifecycle management |
| 28 | AI Model Manager Agent | Phase 7 | Model monitoring, cost optimization, technology radar |
| 29 | Token Efficiency Agent | Phase 7 | Prompt compression, caching, batch processing |
| 30 | Platform Orchestrator | All | Routes between agents, manages user journey, surfaces next actions |

### Category 10: B2B Enterprise (3 agents)

| # | Agent | Phase | Description |
|---|-------|-------|-------------|
| 31 | Company Benefits Agent | Phase 6 | Company-specific pension, severance, COBRA, stock context |
| 32 | B2B Reporting Agent | Phase 6 | Automated outcome reports for HR admins |
| 33 | B2B Onboarding Agent | Phase 6 | Batch employee provisioning, welcome kit delivery |

## Agent Numbering: Canonical vs Codebase

The codebase uses a different numbering (treating Resume as 1 product, then sequential). The canonical 33-agent numbering above is from the Google Drive planning docs. Reconciliation needed -- see [[Status]] for details.

## Product Roadmap -- 7 Phases / 12 Months

| Phase | Weeks | Agents | Key Deliverables |
|-------|-------|--------|-----------------|
| 1: Launch & Foundation | 1-4 | Resume (polish) | Production launch, User Positioning Profile, Stripe, onboarding |
| 2: LinkedIn & Cover Letter | 5-12 | #4-6 | First cluster, cross-agent data sharing, B2B demos |
| 3: Job Discovery | 8-16 | #7-9 | Job search command center, daily engagement loop |
| 4: Interview & Networking | 12-20 | #10-13 | Complete career transition toolkit |
| 5: Financial Wellness | 16-24 | #14-16 | Revenue Engine 2 activated |
| 6: B2B Outplacement Portal | 20-28 | #31-33 | Enterprise admin, white-label, SSO, API |
| 7: Platform Intelligence | 24+ | #22-30 | Supporting agents, knowledge graph, scale to 10K+ |

## Agent Cost Targets

Total estimated cost per active user per month (20 sessions): $1.80-$3.50. At $79/mo Pro: 95%+ gross margin on AI delivery.

## Lifecycle Hooks

Route factory `createProductRoutes()` accepts these hooks:

| Hook | Purpose |
|------|---------|
| `onBeforeStart` | Validation, capacity checks |
| `transformInput` | Shape raw request into product state |
| `onEvent` | SSE event processing (panels, artifacts) |
| `onBeforeRespond` | Gate response validation |
| `onRespond` | Gate response handling |
| `onComplete` | Cleanup, platform context persistence |
| `onError` | Error handling, session cleanup |

## Shared Platform Context

`user_platform_context` table stores cross-product data (positioning strategy, evidence library). Products can load context from other products at startup.

## Agent Design Patterns

- **2-agent pipeline** (most common): Research/analyze agent -> writing agent
- **3-agent pipeline** (Resume only): Strategist -> Craftsman -> Producer
- **1-agent pipeline** (Executive Bio, Thank You Note): Single writer agent

All agents except Resume run autonomously (no user gates).

## Cross-Agent Knowledge Graph (Phase 2-3)

Six entity types: User Profile (central), Company, Contact, Job Posting, Market Intelligence, Outcome. Enables proactive opportunity-candidate matching.

## Dashboard (4 Zones)

- **Zone 1 (top):** Personalized greeting + single most important next action (Orchestrator-driven)
- **Zone 2 (left, 60%):** Application pipeline Kanban + momentum ring
- **Zone 3 (right, 40%):** Agent activity feed, each item one-click actionable
- **Zone 4 (bottom):** 4 outcome metrics

## Related

- [[Company Vision]]
- [[Revenue Model]]
- [[Architecture Overview]]
- [[Model Routing]]
- [[Database Evolution]]
- [[B2B Outplacement]]

#type/spec #status/in-progress
