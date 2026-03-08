# B2B Outplacement

> Source: Google Drive — `outplacement-overview-deck.docx`, `outplacement-proposal-template.docx`, `outplacement-delivery-playbook.docx`, `b2b-outreach-campaign-package.docx`

## Overview

CareerIQ's B2B arm (FirstSourceTeam.com) sells AI-powered outplacement to mid-market companies (500-5,000 employees) at ~10% the cost of traditional providers.

## Enterprise Pricing

| Tier | Price/seat/mo | Min Seats | Support SLA |
|------|--------------|-----------|-------------|
| Standard | $29 | 25 | 24h response |
| Plus | $39 | 50 | 4h response |
| Concierge | $49 | 25 | 2h response + human coach |

Volume discounts: 10% (100-249), 15% (250-499), custom (500+).

**Example:** 50 employees, 6 months = $8,700/mo = $52,200 total ($1,044/employee) vs. $250K-$750K traditional.

## Key Metrics (Targets)

| Metric | CareerIQ Target | Industry Average |
|--------|----------------|-----------------|
| Time to first interview | 1-2 weeks | 4-8 weeks |
| ATS pass rate | 85-95% | 20-40% |
| 90-day placement rate | 70-80% | 40-55% |
| Cost per employee (6mo) | $580-$980 | $5,000-$15,000 |
| Onboarding time | 24 hours | 2-4 weeks |

## Implementation Timeline

- Day 0: Admin portal provisioned (2 hours), access email (4 hours)
- Day 1: Employee roster via CSV upload
- Day 2-3: Welcome emails deployed, target 40%+ login within 24h
- Day 3-7: First resumes generated
- Week 2+: Full engagement

## Admin Portal Requirements

- Enrollment dashboard with real-time engagement metrics
- Outcome tracking (applications, interviews, placements)
- Activity heatmap
- Timeline view with at-risk employee flagging
- CSV roster upload + auto-account generation
- Weekly auto-generated PDF reports (Monday by 10 AM)
- Monthly outcome reports (by 5th of month)
- Benchmark comparisons across cohorts
- **Privacy: HR sees engagement metrics, NEVER personal content**

## Escalation Triggers (Platform Must Monitor)

| Trigger | Action |
|---------|--------|
| No login for 7+ days | Automated nudge + flag to admin |
| Stalled pipeline (14+ days) | Escalation to coach (Concierge) or automated intervention |
| Emotional wellness alert | Human coach escalation |
| Approaching severance end (30 days) | Priority re-engagement |
| 3+ poor agent ratings | Quality review + human follow-up |

## SLA Commitments

- Platform availability: 99.9% uptime (6 AM-10 PM local, Mon-Fri)
- No setup fees, no per-resume fees, no hidden costs
- Headcount adjustable monthly with 48-hour notice
- Termination: 30 days written notice
- Post-termination: employees retain read-only access for 90 days
- B2C transition offer: $49/month (discounted from $79) for 3 months

## Company-Specific Data Configuration

Enterprise setup requires loading:
- Benefits information (pension, severance terms)
- COBRA details
- Internal job board access
- Stock option/RSU information
- Company-specific outplacement messaging

## Database Requirements

See [[Database Evolution]] Phase 4:
- `b2b_organizations` (branding, SSO config)
- `b2b_contracts` (seats, pricing, SLA)
- `b2b_employee_cohorts` (groups with outcomes)
- `b2b_outcome_reports` (automated reporting)

## Related

- [[Revenue Model]]
- [[Company Vision]]
- [[Database Evolution]]
- Google Drive: `outplacement-overview-deck.docx`, `outplacement-delivery-playbook.docx`

#type/spec #status/done
