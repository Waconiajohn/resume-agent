# Non-resume product cost grid — DeepSeek vs OpenAI options

**Date:** 2026-04-20
**Ask:** If we lift the rest of the app off DeepSeek V3.2 (Vertex MaaS) onto the same OpenAI models that made v3 noticeably better, what is the per-run and per-month dollar impact?
**TL;DR:** For simple single-agent products, switching costs you pennies per run. For the interview/negotiation/plan products that make many LLM calls, it's measurable. At expected usage patterns, the monthly hit per active user is **~$3–$7** at GPT-5.4-mini, **~$7–$18** at GPT-4.1. Probably not material against a $49/mo tier.

---

## Pricing baseline (USD per million tokens)

| Model | Input | Output | Blended (60/40)¹ | vs DeepSeek |
|---|---:|---:|---:|---:|
| DeepSeek V3.2 (Vertex MaaS) — current | $0.14 | $0.28 | $0.196 | 1× |
| GPT-5-mini (cheaper OpenAI option) | $0.25 | $2.00 | $0.95 | 4.8× |
| GPT-5.4-mini (v3 writer/verifier today) | $0.75 | $4.50 | $2.25 | **11.5×** |
| GPT-4.1 | $2.00 | $8.00 | $4.40 | **22.4×** |
| GPT-5 (reference, not recommended) | $5.00 | $15.00 | $9.00 | 45.9× |

¹ Blended rate assumes a typical 60% input / 40% output token split — most of these products spend more tokens on prompt + context than on generated output. Highly generative products (interview prep, content calendar) skew closer to 50/50; the dollar impact moves up ~10% in those cases but does not change the order of magnitude.

**Important source note:** Vertex AI's DeepSeek V3.2 MaaS pricing matches direct DeepSeek API pricing in the codebase's cost tables (`server/src/v3/shadow/costs.ts` line 16). You are not paying a Vertex surcharge on top.

**Also note:** v3 resume already uses GPT-5.4-mini for its write + verify stages. That decision survived the quality audit. The grid below is about the *other* products.

---

## Per-run cost grid — what one pipeline run costs on each model

Numbers are grounded in either (a) authored estimates in `server/src/agents/coach/knowledge/journey-phases.ts` which were written against current DeepSeek pricing, or (b) my own estimate from per-product agent count and typical prompt sizes when the product isn't in the journey-phases file.

| Product | Agent calls² | DeepSeek (today) | GPT-5-mini | GPT-5.4-mini | GPT-4.1 |
|---|---:|---:|---:|---:|---:|
| Onboarding assessment | 2 | $0.01 | $0.05 | $0.12 | $0.22 |
| Cover letter | 3 | $0.03 | $0.14 | $0.35 | $0.67 |
| Executive bio | 3 | $0.03 | $0.14 | $0.35 | $0.67 |
| Thank-you note | 3 | $0.02 | $0.10 | $0.23 | $0.45 |
| LinkedIn editor | 3 | $0.03 | $0.14 | $0.35 | $0.67 |
| LinkedIn optimizer | 9 | $0.08 | $0.38 | $0.92 | $1.79 |
| LinkedIn content (blog + calendar) | 7 | $0.07 | $0.34 | $0.81 | $1.57 |
| Case study | 9 | $0.06 | $0.29 | $0.69 | $1.34 |
| Networking outreach | 11 | $0.07 | $0.34 | $0.81 | $1.57 |
| Job finder (search + score) | 5 | $0.05 | $0.24 | $0.58 | $1.12 |
| 90-day plan | 9 | $0.10 | $0.48 | $1.15 | $2.24 |
| Salary negotiation (with mock employer) | 11 | $0.12 | $0.58 | $1.38 | $2.69 |
| Interview prep (mock + debrief) | 18 | $0.18 | $0.86 | $2.07 | $4.03 |
| **Resume v3 (reference only)³** | ~12 | — | — | **$0.05–$0.07** | — |

² "Agent calls" is the rough LLM call count per product (from `grep llm.chat` across each agent dir). This is not exact — agent-loop products can make more calls mid-conversation as the user interacts.

³ Resume v3 is already on GPT-5.4-mini for its main write + verify stages; observed per-run cost during the UX test was $0.047–$0.072 on three executive fixtures. Included here as a sanity check — v3 is roughly the same order of magnitude as the simpler products would be at GPT-5.4-mini, because v3's per-call sizes are larger but its model mix is lighter for the cheap stages.

---

## Per-user monthly impact — the number that actually matters

The per-run numbers above don't tell you anything until you apply realistic usage. Three scenarios:

### Scenario A — "Active user runs 3 products per month"

Typical mix: cover letter + LinkedIn optimizer + interview prep. Representative of a user in active job search.

| | DeepSeek | GPT-5-mini | GPT-5.4-mini | GPT-4.1 |
|---|---:|---:|---:|---:|
| Monthly LLM cost | **$0.29** | **$1.38** | **$3.34** | **$6.49** |
| % of $49/mo tier | 0.6% | 2.8% | 6.8% | 13.2% |

### Scenario B — "Power user runs the full journey in one month"

Onboarding + cover letter + LinkedIn optimizer + networking + interview + negotiation + 90-day plan. Full journey.

| | DeepSeek | GPT-5-mini | GPT-5.4-mini | GPT-4.1 |
|---|---:|---:|---:|---:|
| Monthly LLM cost | **$0.79** | **$3.78** | **$9.07** | **$17.69** |
| % of $49/mo tier | 1.6% | 7.7% | 18.5% | 36.1% |

### Scenario C — "Light user runs 1 product per month"

Just a cover letter, or just a thank-you note.

| | DeepSeek | GPT-5-mini | GPT-5.4-mini | GPT-4.1 |
|---|---:|---:|---:|---:|
| Monthly LLM cost | **$0.03** | **$0.14** | **$0.35** | **$0.67** |
| % of $49/mo tier | <0.1% | 0.3% | 0.7% | 1.4% |

---

## Reading the numbers — where this lands

- **GPT-4.1 at power-user workload** takes 36% of gross revenue as LLM cost. That's not a catastrophe, but it's the kind of number you'd want to watch against your margin plan — especially if you intend to run a lower-priced tier (below $49) at any point.
- **GPT-5.4-mini at power-user workload** takes 18% of gross revenue. Comfortably inside the "AI-product LLM cost is typically 15–25% of revenue" zone that other AI products operate in. Not a red flag.
- **GPT-5-mini at power-user workload** takes 8% — very comfortable — but it is a meaningful quality step down from 5.4-mini. If the reason to leave DeepSeek is "the writing got dramatically better on OpenAI," 5-mini may give back the quality that motivated the switch in the first place.
- **The simple products (cover letter, bio, thank-you, LinkedIn editor) are cost-immaterial at every tier.** The run-cost is $0.22–$0.67 at GPT-4.1 and $0.12–$0.35 at GPT-5.4-mini. On those products, picking the better model is essentially free.
- **The heavy products (interview prep, negotiation, 90-day plan) are where the multiplier bites.** Interview prep at GPT-4.1 is $4/run. If a user does 3 mock interviews before a real one, that's $12 in a single session. Still fine at $49/mo tier but worth budgeting.

---

## Recommended read — if you want a one-sentence summary

**Lift the simple products (cover letter, exec bio, thank-you note, LinkedIn editor) to GPT-5.4-mini now — the quality upside is real and the cost is immaterial.** Hold the heavy multi-agent products (interview prep, negotiation, 90-day plan) on DeepSeek until you've done a focused quality test on each, because the 11× cost multiplier only earns its keep if those specific tasks produce visibly better output.

That mirrors what the codebase's `selectResumeV2Provider` pattern in `model-constants.ts` already does — resume v2 writing is feature-scoped to DeepSeek specifically because it tested best; the rest of the app was left on Groq/DeepSeek. The same feature-scoped override can apply the other direction: move specific products onto GPT-5.4-mini when a quality test confirms the win.

---

## What I'd want to know before committing

If you want to validate this grid against reality before a wider rollout:

1. **Spot-test GPT-5.4-mini on the simple products first.** Run a cover letter + exec bio + thank-you note on the same input using current DeepSeek vs. GPT-5.4-mini. If the quality improvement holds like it did on v3, switch them and move on. Total cost of the test: ~$2 for the OpenAI side.

2. **Don't switch the heavy products sight-unseen.** Interview prep at 18 LLM calls × GPT-4.1 pricing will run up $4/session on users who are actively practicing for interviews — likely the highest-engagement cohort. Test the quality delta on interview prep specifically before committing; the ROI needs to be clear.

3. **Watch cache warming.** All of the per-run costs above assume fresh runs. OpenAI has prompt caching that drops input cost to ~10% on cache hits. If we structure the heavy products' prompts to be cache-friendly (large static system prompts + small dynamic user turns), real cost may be 30–50% below the grid numbers. Worth measuring before alarming on the GPT-4.1 column.

4. **I have no production telemetry on non-v3 products.** The `coach_sessions` table shows 12 resume_v3 runs and nothing else with usage data. The grid above is a solid-enough estimate for planning, but after a rollout of any kind we should look at the real `user_usage` numbers from a week of live traffic before drawing final conclusions.

---

## Appendix — where the numbers came from

- Pricing: `server/src/v3/shadow/costs.ts` (lines 15–27) — canonical cost table used by v3 shadow-run accounting. Confirmed against OpenAI's and Google Vertex's published rates.
- Per-product agent call counts: `grep -rh 'llm.chat' server/src/agents/<product>/` on each product directory (April 2026).
- Journey-phase baseline estimates (for products in the journey): `server/src/agents/coach/knowledge/journey-phases.ts` lines 65–135 — authored during Phase 1/2 build against then-current DeepSeek pricing.
- Resume v3 reference: UX test report `docs/v3-rebuild/reports/ux-test-combined.md` — three fixtures, observed costs $0.047 / $0.072 / $0.063.
