# Sprint 7: Commerce Platform — Billing, Discounts, Entitlements & Affiliates
**Goal:** Wire existing billing UI into app routing, fix usage persistence bug, add Stripe promotion codes, build feature entitlements model, implement affiliate marketing system, and decommission legacy agent code.
**Started:** 2026-02-28
**Completed:** 2026-02-28

---

## Track A — Wire Billing UI & Fix Bugs (Stories 1-2)

1. [x] Story 1: Wire PricingPage + BillingDashboard into App Routing — [status: done]
2. [x] Story 2: Fix Usage Persistence Upsert Bug — [status: done]

## Track B — Discount & Promo Codes (Stories 3-4)

3. [x] Story 3: Stripe Promotion Codes Integration — [status: done]
4. [x] Story 4: Promo Code Admin & Webhook Handling — [status: done]

## Track C — Feature Entitlements (Stories 5-7)

5. [x] Story 5: Plan Features & Entitlements Model — [status: done]
6. [x] Story 6: User Feature Overrides — [status: done]
7. [x] Story 7: Wire Entitlements into Pipeline & Exports — [status: done]

## Track D — Affiliate Marketing (Stories 8-10)

8. [x] Story 8: Affiliate Data Model & Referral Tracking — [status: done]
9. [x] Story 9: Affiliate Referral Landing & Signup Flow — [status: done]
10. [x] Story 10: Affiliate Dashboard — [status: done]

## Track E — Legacy Cleanup (Stories 11-12)

11. [x] Story 11: Decommission Legacy `agent/` Directory — [status: done]
12. [x] Story 12: Clean Up Deprecated Chat Route — [status: done]

## Track F — Tests & Documentation (Stories 13-15)

13. [x] Story 13: Billing & Entitlements Tests — [status: done]
14. [x] Story 14: Commerce Documentation — [status: done]
15. [x] Story 15: Sprint 7 Retrospective — [status: done]

---

## Execution Order

**Phase 1 — Wire existing UI + fix bug (parallel):** Stories 1, 2
**Phase 2 — Discount codes (sequential):** Story 3, then Story 4
**Phase 3 — Entitlements (sequential):** Story 5, then 6, then 7
**Phase 4 — Affiliate system (sequential):** Story 8, then 9, then 10
**Phase 5 — Legacy cleanup (sequential):** Story 11, then 12
**Phase 6 — Tests + docs (parallel):** Stories 13, 14, then 15

## Out of Scope (Explicitly)
- Stripe Connect for affiliate payouts (manual payouts for MVP)
- Multi-currency pricing
- Usage-based billing (per-token charging)
- Admin dashboard UI (API-only for admin operations)
- E2E test expansion
- New pipeline stages or agent additions
