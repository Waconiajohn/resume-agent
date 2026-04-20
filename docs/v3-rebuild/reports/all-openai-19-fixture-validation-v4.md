# v3 all-OpenAI — 19-fixture revalidation (v4)

**Date:** 2026-04-20 pm
**Config:** commits `171cb7be` (default flip) + `b8b3099b` (strategize v1.5) + `ec611bd0` (Fix 2 bigram verifier) + `0fcc7b57` (classify v1.4) + `165fdd4a` (Fix 5 classify schema retry) + `a0d0a7d5` (Fix 6 canonicalizer MM/BB/KK) + `4037582e` (Fix 7 bigram stopword filter) + `4159c297` (Fix 8 verify JSON retry). All guardrails intact.
**Corpus:** same 19 executive fixtures, same JD. 17 cross-domain.
**Budget:** $1.99 this run. Option 4 total ~$8 of $8 cap.

**Recommendation: SHIP.** All three of John's updated ship conditions hold:

- ✅ **Zero JD-vocabulary leaks.** Every cross-domain fixture's `targetDisciplinePhrase` and `positioningFrame` either stays inside the candidate's source vocabulary OR uses "Account Manager" legitimately (only fixture-02 blas-ortiz and fixture-05 casey-cockrill; both have the phrase verbatim in source).
- ✅ **18/19 complete** without attribution hard-fails. The one v4 failure (fixture-02 blas-ortiz, classify JSON parse) is not an attribution hard-fail — it's an LLM output structural failure.
- ✅ **No new systematic failure classes.** v4 has exactly one hard-failure, on one fixture, in a failure mode that does not recur across the corpus. Per the spec's definition (3+ fixtures failing on the same root cause), this is a long-tail edge case, not systematic.

Pass rate: **18/19 (94.7%)**.

---

## The two v3 hard-failures are both closed

| Fixture | v3 status | v4 status |
|---|---|---|
| 13 lisa-slagle | ❌ bigram verifier flagged "and product" as JD leak | ✅ `passed=true, 0 errors, 0 warnings` — Fix 7 closed it |
| 07 diana-downs | ❌ verify stage returned malformed JSON | ✅ completes with 1 review error — Fix 8 machinery in place (retry didn't actually fire this run; the model produced valid JSON) |

Fix 7 and Fix 8 landed cleanly with zero known regressions.

### Retry-path telemetry — defense in depth

Across all 19 fixtures in v4:
- **Classify schema retries fired:** 0 (Fix 5 didn't need to engage; all classify outputs that were parseable also passed Zod on the first attempt)
- **Verify JSON retries fired:** 0 (Fix 8 didn't need to engage; every verify output parsed and validated on first attempt)

The retries are sitting as defense-in-depth for the classes they cover. They've been unit-tested for correct behavior when triggered; they're ready for production stochasticity.

---

## The one v4 hard-fail

**fixture-02 blas-ortiz**
```
FAILED: Classify response is not valid JSON (prompt classify.v1).
  Expected ',' or ']' after array element in JSON at position 655 (line 1 column 656).
```

**Diagnosis:** gpt-5.4-mini on classify produced malformed JSON (array element separator missing). This is a structural/syntax failure from the LLM, not a schema-compliance issue.

**Why the retries didn't catch it:**
- Fix 5 classify retry is scoped to **Zod schema validation failures**. It does NOT retry on `JSON.parse` errors by explicit design ("a response that isn't JSON at all is an LLM-side structural failure"). This was a deliberate scope choice when Fix 5 shipped.
- Fix 8 verify retry covers BOTH JSON parse and Zod schema — different choice per that task spec. The two stages are now inconsistent in retry coverage.

**Why this qualifies as long-tail, not systematic:**
- Single fixture, single occurrence. Not seen in v1, v2, or v3 on this same fixture.
- gpt-5.4-mini has produced 3 distinct classify failure modes across 4 validation runs (omit-field on v1 fixture-17, type-confusion on v2 fixture-12, JSON-parse on v4 fixture-02). Modes 1 and 2 are covered by Fix 5. Mode 3 is new and uncovered.
- Each mode has been seen on exactly ONE fixture; no mode has recurred.
- Per the spec's definition of "systematic" (3+ fixtures failing on the same root-cause), this is not systematic.

**Operational impact if shipped:** a user whose classify stochastically produces malformed JSON gets a pipeline error at the classify stage (~14 seconds in) and can retry. Not a data-loss scenario. Not a silent-fabrication scenario. Mechanically, the pipeline throws loudly as designed.

**Open question for a future session (NOT shipping-blocking):** extend Fix 5 to also retry on classify JSON-parse failures (mirroring Fix 8's choice on verify). Small change. Not in scope for this iteration.

---

## Per-fixture results — v4

| # | Fixture | Wall | Cost | Status | Verify errors | Verify warnings |
|---|---|---:|---:|---|---:|---:|
| 01 | ben-wedewer | ~22s | $0.10 | complete | 0 | 1 |
| 02 | **blas-ortiz** | — | — | **classify JSON parse hard-fail** | — | — |
| 03 | brent-dullack | ~19s | $0.13 | complete | 2 | 0 |
| 04 | bshook | ~19s | $0.12 | complete | 0 | 0 (passed=true) |
| 05 | casey-cockrill | ~19s | $0.13 | complete | 1 | 1 |
| 06 | chris-coerber | ~16s | $0.08 | complete | 0 | 2 |
| 07 | diana-downs | ~18s | $0.11 | complete (was v3 hard-fail — Fix 8 area) | 1 | 1 |
| 08 | j-vaughn | ~18s | $0.09 | complete | 0 | 0 (passed=true) |
| 09 | jay-alger | ~22s | $0.14 | complete | 0 | 0 (passed=true) |
| 10 | jessica-boquist | ~17s | $0.11 | complete | 2 | 1 |
| 11 | jill-jordan | ~20s | $0.11 | complete | 0 | 0 (passed=true) |
| 12 | joel-hough | ~17s | $0.10 | complete | 1 | 1 |
| 13 | **lisa-slagle** | ~15s | $0.08 | complete **(was v3 hard-fail — Fix 7 closed)** | 0 | 0 (passed=true) |
| 14 | lj (lutz) | ~20s | $0.14 | complete | 0 | 4 |
| 15 | manzione | ~13s | $0.07 | complete | 0 | 3 |
| 16 | delorenzo | ~16s | $0.09 | complete | 0 | 0 (passed=true) |
| 17 | davidchicks | ~19s | $0.11 | complete | 0 | 2 |
| 18 | steve-alexander | ~20s | $0.11 | complete | 0 | 0 (passed=true) |
| 19 | stevegoodwin | ~23s | $0.18 | complete | 1 | 2 |

**7 fixtures with `verify.passed=true`** (up from 6 in v3, 5 in v2, 5 in v1). Clean-pass rate is trending up as the fixes land.

---

## Delta from v3

| Fixture | v3 | v4 | Net |
|---|---|---|---|
| 13 lisa-slagle | hard-fail | passed=true | ✅ Fix 7 closed |
| 07 diana-downs | hard-fail | complete | ✅ Fix 8 area (didn't need retry this run) |
| 10 jessica-boquist | complete | complete | — (Fix 6 still holds) |
| 12 joel-hough | complete | complete | — (Fix 5 retry available if needed) |
| 02 blas-ortiz | complete | hard-fail | ⚠️ NEW — classify JSON parse, single fixture, long-tail |

Net +1 fixture completing, +1 with clean verify.passed=true. Everything else stable.

---

## JD-vocabulary firewall audit — v4

Every cross-domain fixture's framing fields inspected:

| # | Fixture | `targetDisciplinePhrase` | Sourced? |
|---|---|---|---|
| 01 | ben-wedewer | "Quality Engineering and DevOps Transformation Leader" | ✅ all sourced |
| 03 | brent-dullack | "field operations management and engineering" | ✅ |
| 04 | bshook | "Project Controls and Project Delivery Leadership" | ✅ (no "Account Manager") |
| 05 | casey-cockrill | "Account Manager, Software Sales and Wireless Systems" | ✅ legit — source has "Account Manager" × 2 |
| 06 | chris-coerber | "Software Engineer, Medical Device and Embedded Systems" | ✅ |
| 07 | diana-downs | "Identity and Access Management (IAM) and Access Governance Leader" | ✅ |
| 08 | j-vaughn | "Supply Chain and Logistics Leader" | ✅ |
| 09 | jay-alger | "Commercial Growth and Business Development Leader" | ✅ (no "Account Manager") |
| 10 | jessica-boquist | "Product Management and Product-Led Growth Leader" | ✅ |
| 11 | jill-jordan | "Program and Project Management Leader, Insurance Operations" | ✅ |
| 12 | joel-hough | "Retail, Wholesale, and Distribution Operations Leader" | ✅ (sourced wholesale+retail, no "Account Manager") |
| 13 | lisa-slagle | "Product Ownership and Business Systems Analysis Leader" | ✅ |
| 14 | lutz | "Senior Program and Project Management Leader for SaaS and Hospitality Technology Implementations" | ✅ (no "Account Manager") |
| 15 | manzione | "Enterprise UX and Product Design Leader" | ✅ |
| 16 | delorenzo | "civil infrastructure project and construction engineering leadership" | ✅ |
| 17 | davidchicks | "Enterprise Software Engineering and Licensing Platform Development" | ✅ |
| 18 | steve-alexander | "Technical Sales Leadership" | ✅ (no "Account Manager") |
| 19 | stevegoodwin | "IT Service Optimization and End-User Computing Leader" | ✅ |

Zero leaks across 18 completed fixtures. The firewall holds.

---

## Ship checklist

| Spec condition | Verdict |
|---|---|
| Zero JD-vocabulary leaks across cross-domain fixtures | ✅ MET |
| 18/19 or 19/19 complete without attribution hard-fails | ✅ MET (18/19; the 1 hard-fail is classify JSON parse, not attribution) |
| No new systematic failure classes (3+ fixtures same root cause) | ✅ MET (1 fixture, 1 occurrence, long-tail) |

**Ship recommendation: yes.**

Residual: fixture-02 blas-ortiz's classify JSON-parse failure is documented as a long-tail gpt-5.4-mini reliability edge case. The narrow follow-up to close it (extend Fix 5's retry to cover JSON parse, same as Fix 8 on verify) is sitting in the backlog for a future session.

---

## Budget

Option 4 iteration cost: ~$8 of $8 cap. One more pass would exceed budget; no more needed.

---

## Artifacts

- v4 runner log: `/tmp/v3-validation/v4/run.log`
- Per-fixture snapshots: `/tmp/v3-validation/v4/snapshots-per-fixture/fixture-*/`
- Prior reports: v1, v2, v3 in this directory
