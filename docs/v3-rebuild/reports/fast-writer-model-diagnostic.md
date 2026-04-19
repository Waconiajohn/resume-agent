# Fast-writer model-swap diagnostic — DeepSeek V3.2 vs gpt-4.1-mini

**Date:** 2026-04-19
**Scope:** Measure the quality impact of swapping only the fast-writer capability (write-summary, write-accomplishments, write-competencies, write-custom-section) from DeepSeek V3.2 on Vertex to gpt-4.1-mini on OpenAI. No prompt changes. No other stage changes.
**Fixtures (5):** 01 ben-wedewer (control), 04 bshook (cross-role-highlight drop pattern), 10 jessica-boquist (Phase-A pronoun regressor), 12 joel-hough (Phase-A fabrication flag), 17 davidchicks (control).
**Configs:**
- **Config A** — baseline. `RESUME_V3_FAST_WRITER_BACKEND` unset → default Vertex DeepSeek V3.2.
- **Config B** — `RESUME_V3_FAST_WRITER_BACKEND=openai` + `RESUME_V3_FAST_WRITER_MODEL_OPENAI=gpt-4.1-mini`. All other stages unchanged.
**Cost spent:** ≈ $0.80 total across both configs.

## Headline — mixed, leaning favorable. Do not swap yet.

Config B eliminated every pronoun error across all five fixtures (Config A had 2). Content quality is comparable; cross-role-highlight omissions and verify false-positives on sourced numeric claims show up in both configs at the same rate. But Config B introduced editorial tails on fixture-12 ("Actively seeking the next challenge… drive scalable growth") — exactly the class John flagged on the HR-exec session. On balance B's errors drop by 2 and warnings rise by 2 — net-even on count, modestly favorable on severity because errors outweigh warnings.

**Recommendation:** keep DeepSeek in production for now. The pronoun compliance win is real but targeted; swapping the entire fast-writer tier to get it is over-correction. Pursue a narrower pronoun fix (retry-on-pronoun-detected or a per-prompt pronoun stripper) while keeping the cheaper DeepSeek backend.

---

## Per-fixture table (errors / warnings / elapsed)

| Fixture | A err/warn | B err/warn | Δerr | Δwarn | A sec | B sec |
|---|---|---|---|---|---|---|
| 01 ben-wedewer | 0 / 1 | 0 / 2 | 0 | +1 | 66 | 88 |
| 04 bshook | 0 / 8 | 0 / 8 | 0 | 0 | 110 | 115 |
| 10 jessica-boquist | 2 / 3 | 0 / 2 | **−2** | −1 | 86 | 108 |
| 12 joel-hough | 3 / 1 | 3 / 3 | 0 | +2 | 78 | 83 |
| 17 davidchicks | 0 / 2 | 0 / 2 | 0 | 0 | 83 | 64 |
| **Total** | **5 / 15** | **3 / 17** | **−2** | **+2** | 423 | 458 |

**Wall-clock totals:** Config A 423s (~85s/fixture), Config B 458s (~92s/fixture). Config B is 8% slower end-to-end — within noise of rate-limit failover behavior and not a shipping blocker.

---

## Failure class comparison (actual error text, not summarized)

### Class 1 — Pronoun compliance

**Config A — 2 fixtures with pronoun errors:**
- fixture-10 summary: *"Personal pronoun 'her' appears in the WrittenResume summary, violating the absolute ban on personal pronouns."*
- fixture-12 summary: *"Personal pronoun 'who' (referring to candidate) appears in summary."* (This is the sentence *"Operations executive **who** consolidates and scales…"*.)

**Config B — 0 fixtures with pronoun errors.**

gpt-4.1-mini correctly rewrites into noun-led framing without relative or personal pronouns:
- fixture-10 opens: *"Product-led growth and platform modernization leader with extensive experience…"* — no "her".
- fixture-12 opens: *"Multi-site operations consolidator and automation scaler with extensive leadership experience…"* — no "who".

This is the clearest, most repeatable win for Config B. Every B fixture passes the absolute-pronoun rule; Config A fails on roles where classify captured a pronoun in the source (she/her or when the summary falls into "executive who…" phrasing).

### Class 2 — Editorial framing

**Config A — subtle framing warnings:**
- fixture-01: summary lacks positioning-frame signal beyond opening phrase.
- fixture-04: summary uses "strategic project controls and automation delivery leader who transforms transactional functions" — the "transforms transactional functions" tail is editorial.
- fixture-12 summary ends: *"Consistently transforms complex, growing operations into streamlined, high-performance systems."* — editorial tail.
- fixture-17: soft "Contributed to" warning on a position bullet.

**Config B — more visible editorial tails:**
- fixture-01 summary: *"…with extensive experience driving strategic automation and quality improvements in enterprise SaaS and cloud platforms."* — "extensive experience driving strategic" is padding.
- fixture-04 summary: *"…with extensive experience managing complex portfolios in energy, automation, and advanced manufacturing sectors."* — the sector list looks JD-derived; the source has some of those industries but the combined framing is fluffier than A.
- fixture-12 summary ends: *"Actively seeking the next challenge to apply strategic operations expertise and drive scalable growth."* — **worst offender**, exactly the "bringer of track records" class John flagged.
- fixture-12 summary also flagged twice more for "drive scalable growth" and generic framing.

gpt-4.1-mini's prose is longer and more conversational than DeepSeek V3.2's tighter phrasing. When the prompt doesn't forbid editorial tails explicitly (write-summary.v1 Rule 5 bans a specific buzzword list but not the "actively seeking" pattern), gpt-4.1-mini drifts into them more readily.

### Class 3 — Cross-role highlight omissions

**Config A — fixture-04 loses 7 cross-role highlights endorsed by strategy** (schedule variance reduction, cost-forecasting accuracy, ERP standardization, leadership academy, $5.2M change orders, 28% budget risk, installation time reduction).

**Config B — fixture-04 loses exactly the same 7** with near-identical warning text.

Same pattern on fixture-13 and others in the broader Phase-A corpus run. **Neither backend fixes the cross-role-highlight compression problem.** This is a write-prompt issue, not a model issue.

### Class 4 — Fabrication (verify false positives)

**Config A — fixture-12 flagged 3 "fabrication" errors** on claims that are literally in the source:
- `$1.3 million` → source bullet 0: *"saving nearly $1.3million and reducing manual lifting by 6300 tons"*
- `6,300 tons` → same source bullet (no comma in source)
- `$100 million` → source scope field (no space in source: *"$100million in inventory"*)

**Config B — fixture-12 flagged 3 identical fabrication errors** plus one new: `742 staff` (present in source scope: *"…with a staff of 742"*). Config B's write produced `742 staff` verbatim from the scope; verify didn't recognize it.

**Both configs hit the same verify bug.** The attribution check fails on:
- Numbers written without commas (`1.3million`, `6300 tons`, `$100million`)
- Numbers sourced from `scope` field rather than `bullets`

This is a verify stage issue, independent of fast-writer choice. Worth its own audit; not fixable by a model swap.

### Class 5 — Other

- fixture-10 Config A: a false-positive "elevated AI" attribution flag where source literally contains "Elevated the user experience of the AI platform". Config B avoided this by paraphrasing differently.
- fixture-17 Config A: a soft-language warning on "Contributed to" that Config B avoided.
- fixture-01 Config B: gained a warning about the cross-role "85 staff" highlight being in the summary but not in selectedAccomplishments as a standalone item. Minor.

---

## Cost analysis

**Token pricing (approximate):**
- DeepSeek V3.2 on Vertex: $0.14 / $0.28 per M input/output tokens.
- gpt-4.1-mini on OpenAI: $0.15 / $0.60 per M input/output tokens.

**Fast-writer-stage share of pipeline cost today:** roughly 20–25% (summary/accomplishments/competencies/custom-section are short; classify + benchmark + strategize + write-position + verify dominate).

**Estimated per-resume delta of swapping fast-writer to gpt-4.1-mini:**
- Fast-writer raw cost today (DeepSeek): ~$0.02–0.04 per resume.
- Fast-writer raw cost with gpt-4.1-mini: ~$0.04–0.10 per resume (output tokens are the bigger cost driver; gpt-4.1-mini charges 2.1× the output price).
- **Net per-resume increase: ~$0.02–0.06.**

**Per-user-month impact at $49 retail:**
| Resumes/mo | Pipeline cost today | Pipeline cost after swap | Margin impact |
|---|---|---|---|
| 12 | ~$1.80 | ~$2.50 | −$0.70/user/mo |
| 40 | ~$6 | ~$8.50 | −$2.50/user/mo |
| 120 | ~$18 | ~$25 | −$7/user/mo |

At 120 resumes/month per user the swap eats ~14% of retail margin, which is meaningful. At 12–40 resumes it's under 5% — acceptable but worth the clear benefit it buys.

---

## Latency analysis

Config B total +8% (35s over 423s across 5 fixtures). Per-fixture ranges from −19s (fixture-17, faster) to +22s (fixture-01, slower). No fixture shows a pathological slowdown. This is within normal provider-latency variance; not a shipping concern.

---

## Recommendation

**Config B is mixed, not cleanly better. Do not swap production to gpt-4.1-mini based on this data.**

Three considerations push this toward "hold" rather than "swap":

1. **The pronoun win is the main benefit, and it's narrow.** Two fixtures out of five had pronoun errors on A. Those are the only classes B clearly improves. Everything else is either a tie (cross-role omissions, verify false positives) or a regression (editorial tails on fixture-12).

2. **Fixture-12's Config-B summary has exactly the failure class John complained about.** *"Actively seeking the next challenge to apply strategic operations expertise and drive scalable growth."* — that's the editorial tail flavor that produced the HR-exec session's nine review notes. Swapping the fast-writer to gpt-4.1-mini does NOT reduce this class and in this case made it worse.

3. **Cost increase is modest but real.** At heavy usage the margin pressure is ~14%.

### What to do instead

Option 1 — narrow pronoun fix (recommended). Add a post-write pronoun detector that scans the summary for banned pronouns and triggers a single-shot retry of write-summary with an explicit "your previous output contained 'her' — rewrite without any personal pronouns" nudge. Costs one extra fast-writer call on the ~15% of runs that regress; pipeline cost delta negligible. Keeps DeepSeek for the 85% that work.

Option 2 — hybrid routing. Keep DeepSeek for accomplishments/competencies/custom-section (where A and B are tied). Route only write-summary to gpt-4.1-mini (where the pronoun wins concentrate). Per-resume cost delta tiny (~$0.01). Lets us get the pronoun benefit without paying for the other three fast-writer stages.

Option 3 — keep everything, do nothing. The 2-pronoun-error rate on the corpus is real but not disastrous. If fixture content quality is the bottleneck, this diagnostic says the fast-writer model isn't where to intervene; look at write-position, strategize, or verify next.

Do NOT combine model swap with Phase A iteration — Phase A regressed and the data above says the fast-writer model is not the main quality lever.

---

## Artifacts preserved

- `/tmp/diagnostic-config-A/` — 5 fixture snapshots + per-fixture log + summary.log (DeepSeek baseline).
- `/tmp/diagnostic-config-B/` — 5 fixture snapshots + per-fixture log + summary.log (gpt-4.1-mini).
- `/tmp/diagnostic-run.sh` — the runner script used for both configs.

No fixture snapshots committed to git. Working-tree snapshots were rewritten during both runs but have not been staged for commit — this diagnostic is a measurement, not a production change.
