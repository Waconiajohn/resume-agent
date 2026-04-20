# v3 all-GPT-5.4-mini vs current hybrid — validation report

**Date:** 2026-04-20
**Fixtures:** fixture-04-bshook-resume-dirpm-primary, fixture-10-jessica-boquist-core-resume, fixture-12-joel-hough-resume
**JD:** jd-01-under-armour-account-manager-wholesale (stock)
**Env override for candidate:** RESUME_V3_PROVIDER=openai

Baseline = current production hybrid (DeepSeek on Vertex for strong-reasoning + fast-writer; GPT-5.4-mini on OpenAI for deep-writer).
Candidate = all capabilities on GPT-5.4-mini via OpenAI.
Benchmark stage is not exercised by the fixture runner (extract→classify→strategize→write→verify only); totals therefore undercount production runs equally for both sides.

## fixture-04-bshook-resume-dirpm-primary

| Metric | Baseline | Candidate | Delta |
|---|---:|---:|---:|
| Stage-sum time | 138.8s | 32.1s | -106.7s |
| Wall-clock time | 141s | 35s | -106s |
| Total cost | $0.0699 | $0.1250 | $0.0550 |
| Verify passed | true | false | — |
| Verify errors | 0 | 0 | 0 |
| Verify warnings | 0 | 2 | 2 |

### Per-stage breakdown
| Stage | Baseline model | Baseline time | Baseline cost | Candidate model | Candidate time | Candidate cost | Δ time | Δ cost |
|---|---|---:|---:|---|---:|---:|---:|---:|
| classify | deepseek-ai/deepseek-v3.2-maas | 77.4s | $0.0027 | gpt-5.4-mini | 11.9s | $0.0182 | -65.5s | $0.0155 |
| strategize | deepseek-ai/deepseek-v3.2-maas | 49.4s | $0.0032 | gpt-5.4-mini | 16.0s | $0.0211 | -33.3s | $0.0180 |
| write | deepseek-ai/deepseek-v3.2-maas+gpt-5.4-mini | 9.1s | $0.0622 | gpt-5.4-mini | 2.8s | $0.0756 | -6.3s | $0.0134 |
| verify | deepseek-ai/deepseek-v3.2-maas | 2.9s | $0.0019 | gpt-5.4-mini | 1.3s | $0.0100 | -1.6s | $0.0081 |

### Output comparison
**Summary — baseline:**
> Project controls and commercial management leader who transforms complex delivery into predictable financial outcomes. Strengthened execution discipline across four portfolios, improving milestone attainment by 28%, increasing closing gross margin by 6%, and boosting threat mitigation by 38% within one year. Generated $5.2M in change orders and $4M in repeat business through proactive scope management and customer lifecycle engagement. Delivered a $32M automation program during COVID, achieving 19% margin above target and 94% on-time delivery. Built a 30-dashboard Project Command Center delivering real-time visibility into EV, P&L, labor burn, critical path, and risk exposure.

**Summary — candidate:**
> Commercial manager and project delivery leader across energy, automation, and manufacturing. Managed a $20M+ BOP control system and $10M+ retrofit portfolio, overseeing quoting, sales, revenue targets, and full contract execution. Managed a $50M+ portfolio of design-build-integration and commissioning projects across regulated life sciences and consumer products. Fits roles that need account ownership, customer relationship management, and disciplined delivery across complex portfolios.

**Top 3 accomplishments — baseline:**
1. Strengthened execution discipline across four portfolios totaling $180M, improving milestone attainment by 28%, increasing closing gross margin by 6%, and boosting threat mitigation by 38% within one year.
2. Generated $5.2M in change orders and $4M in repeat business through proactive scope management and customer lifecycle engagement across a $180M portfolio.
3. Delivered a $32M automation program across five sites and ten production lines during COVID, achieving 19% margin above target and 94% on-time delivery.

**Top 3 accomplishments — candidate:**
1. Managed a $20M+ Balance-of-Plant control system and a $10M+ retrofit portfolio at Siemens Energy, overseeing quoting, sales, revenue targets, and full contract execution.
2. Managed a $50M+ portfolio of design-build-integration and commissioning projects at Eclipse Automation, spanning small engineered systems through multi-site programs in regulated life sciences and consumer products.
3. Directed commercial management of intercompany work at Eclipse Automation, including quoting, contracts, change orders, and invoicing across global project teams.

**First position — baseline bullets:**
- (rewritten) Built and led a global department delivering project planning, WBS/CBS development, cost control, schedule management, threat mitigation, and escalation support.
- (rewritten) Directed commercial management of intercompany work, including quoting, contracts, change orders, and invoicing.
- (rewritten) Led multiple business transformation initiatives spanning workflow redesign, role clarity, process tools, and ERP upgrades.

**First position — candidate bullets:**
- (rewritten) Directed commercial management of intercompany work, including quoting, contracts, change orders, and invoicing.
- (rewritten) Ensured data integrity and executive visibility through weekly reporting on EV, cost forecasts, critical path, utilization, imminent issues, and sales pipeline.

## fixture-10-jessica-boquist-core-resume

| Metric | Baseline | Candidate | Delta |
|---|---:|---:|---:|
| Stage-sum time | 136.6s | 0.0s | -136.6s |
| Wall-clock time | 146s | —s | — |
| Total cost | $0.0623 | $0.0000 | $-0.0623 |
| Verify passed | false | — | — |
| Verify errors | 3 | — | — |
| Verify warnings | 0 | — | — |

### Per-stage breakdown
| Stage | Baseline model | Baseline time | Baseline cost | Candidate model | Candidate time | Candidate cost | Δ time | Δ cost |
|---|---|---:|---:|---|---:|---:|---:|---:|
| classify | deepseek-ai/deepseek-v3.2-maas | 63.5s | $0.0026 | — | — | — | — | — |
| strategize | deepseek-ai/deepseek-v3.2-maas | 55.2s | $0.0031 | — | — | — | — | — |
| write | deepseek-ai/deepseek-v3.2-maas+gpt-5.4-mini | 13.0s | $0.0546 | — | — | — | — | — |
| verify | deepseek-ai/deepseek-v3.2-maas | 4.9s | $0.0019 | — | — | — | — | — |

### Output comparison
(text not captured)

## fixture-12-joel-hough-resume

| Metric | Baseline | Candidate | Delta |
|---|---:|---:|---:|
| Stage-sum time | 90.0s | 19.3s | -70.7s |
| Wall-clock time | 90s | 22s | -68s |
| Total cost | $0.0429 | $0.0894 | $0.0465 |
| Verify passed | true | false | — |
| Verify errors | 0 | 2 | 2 |
| Verify warnings | 0 | 1 | 1 |

### Per-stage breakdown
| Stage | Baseline model | Baseline time | Baseline cost | Candidate model | Candidate time | Candidate cost | Δ time | Δ cost |
|---|---|---:|---:|---|---:|---:|---:|---:|
| classify | deepseek-ai/deepseek-v3.2-maas | 59.7s | $0.0026 | gpt-5.4-mini | 10.9s | $0.0189 | -48.8s | $0.0163 |
| strategize | deepseek-ai/deepseek-v3.2-maas | 22.3s | $0.0015 | gpt-5.4-mini | 4.4s | $0.0094 | -17.9s | $0.0079 |
| write | deepseek-ai/deepseek-v3.2-maas+gpt-5.4-mini | 5.4s | $0.0372 | gpt-5.4-mini | 2.6s | $0.0522 | -2.8s | $0.0150 |
| verify | deepseek-ai/deepseek-v3.2-maas | 2.5s | $0.0017 | gpt-5.4-mini | 1.3s | $0.0090 | -1.2s | $0.0073 |

### Output comparison
**Summary — baseline:**
> Multi-site wholesale operations leader with a history of scaling complex businesses and managing large, distributed teams. Directed company-wide strategy for a wholesale business, scaling revenue from $200M to $470M. Managed fourteen stores, a corporate office, and three distribution centers across five states with a staff of 742. Boosted average transaction values from $82 to $248 through enhanced customer service models. Brings hands-on, cross-functional collaboration and direct account management to wholesale partnerships.

**Summary — candidate:**
> Multi-site retail and wholesale operations leader with deep experience running store, distribution, and account-focused teams across complex markets. Managed fourteen stores, three distribution centers, and 742 staff while scaling wholesale revenue from $200M to $470M. Regional leadership at The Restaurant Store also managed high-performing sales teams focused on acquiring, cultivating, and retaining key customer accounts. Brings direct fit for wholesale account management by pairing revenue growth, customer ownership, and cross-functional work with sales, marketing, procurement, finance, and IT.

**Top 3 accomplishments — baseline:**
1. Directed company-wide operational strategy for a fast-growing wholesale business, scaling revenue from $200M to $470M while managing a network of 14 stores, 3 distribution centers, and a corporate office across five states.
2. Managed a complex multi-site operation spanning 14 stores, a corporate office, and three distribution centers across five states, directly leading a staff of 742 and four directors.
3. Led cross-functional teams to scale regional revenue from $52M to $200M by managing high-performing sales teams focused on acquiring, cultivating, and retaining key customer accounts.

**Top 3 accomplishments — candidate:**
1. Managed high-performing sales teams focused on acquiring, cultivating, and retaining key customer accounts across 4 business units and 126 staff at The Restaurant Store.
2. Directed company-wide operational strategy for a fast-growing wholesale business, scaling revenue from $200M to $470M while overseeing 14 stores, a corporate office, and 3 distribution centers across 5 states.
3. Led cross-functional teams through growth from $52M to $200M in revenue, partnering across functions to expand operations and improve performance.

**First position — baseline bullets:**
- (rewritten) Added 38% efficiency by adding automation into the distribution center network, saving nearly $1.3 million and reducing manual lifting by 6,300 tons annually.
- (rewritten) Managed fourteen stores, a corporate office, and three distribution centers spanning five states with a staff of 742; directly supervised four directors, four distribution center general managers, and a senior business analyst.
- (rewritten) Directed company-wide operational strategy for a fast-growing wholesale business, scaling revenue from $200M to $470M.

**First position — candidate bullets:**
- (rewritten) Added 38% efficiency by adding automation into the distribution center network, saving nearly $1.3 million and reducing manual lifting by 6,300 tons annually.
- (rewritten) Managed fourteen stores, a corporate office, and three distribution centers spanning five states (PA, NJ, MD, DE, FL) with a staff of 742; directly supervised four directors, four distribution center general managers, and a senior business analyst.
- (rewritten) Directed company-wide operational strategy for a fast-growing wholesale business, scaling revenue from $200M to $470M.

## Totals across three fixtures

| Metric | Baseline | Candidate | Delta |
|---|---:|---:|---:|
| Total stage-sum time | 365.4s | 51.4s | -314.0s |
| Total cost | $0.1751 | $0.2144 | $0.0393 |
| Total verify errors | 3 | 2 | -1 |
| Total verify warnings | 0 | 3 | 3 |
