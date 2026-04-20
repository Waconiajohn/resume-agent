## Forbidden phrases

These phrases are universal executive-resume filler. Hiring managers skim past them. They never tie to a specific claim, so they dilute the accomplishments around them. Never emit any of these or close variants.

The list consolidates `write-position.v1`'s Rule 0 lexicon (21 items) plus four additions surfaced by a 2026-04-19 user-read audit of live fixture output. Each addition cites the specific fixture where the phrase was flagged as a reader-visible tell.

### Base list — from write-position Rule 0

✗ "driving operational excellence"
✗ "establishing a culture of [anything]"
✗ "building a foundation for [anything]"
✗ "fostering an environment of [anything]"
✗ "championing a mindset of [anything]"
✗ "spearheaded"
✗ "leveraged"
✗ "orchestrated"
✗ "driving X growth" (as an unquantified claim)
✗ "expanding brand reach" or "brand presence"
✗ "market penetration" or "regional market leadership"
✗ "solution-based selling" or "consultative sales culture"
✗ "high-performance team culture"
✗ "translating X into actionable Y"
✗ "setting the standard for" or "raising the bar"
✗ "passion for excellence" or "passionate about"
✗ "results-driven" or "proven track record"
✗ "brings a track record of [anything]" or "with a track record of [anything]" or "brings [X] years of experience"
✗ "ensuring fair and compliant outcomes" or any "ensuring [adjective] outcomes" tail
✗ Any phrase that editorializes without adding source-specific content

<!-- Why: write-position's Rule 0 was introduced in Phase 3.5 after DeepSeek kept adding editorial phrases (e.g. "driving operational excellence") that the source didn't support. Verify flagged them as unsupported; a lexical ban the model can self-check eliminates a large fraction of verify errors at the source. 2026-04-18. -->

### Additions from 2026-04-19 user-read audit

✗ "utilizing" or "utilize" — use "using" instead.

<!-- Why: "utilizing" is textbook resume-ese. Nobody uses "utilizing" in speech; hiring managers read it as filler. Audit source: jessica-boquist summary + bullet 4, "Achieved 97% annual customer retention goals by utilizing the JTBD framework..." 2026-04-19. -->

✗ "transformative growth" / "transformative [anything]" / "transformational [anything]"

<!-- Why: Empty adjective when applied to growth or roles. The number or outcome that follows does the work; "transformative" adds no content and reads as padding. Audit source: joel-hough selected-accomplishment 5, "Led cross-functional teams through transformative growth, scaling revenue from $52M to $200M..." — the $52M to $200M is the accomplishment; "transformative" is dilution. 2026-04-19. -->

✗ "thought leader" or "thought leadership"

<!-- Why: Textbook buzzword. If the candidate is genuinely a thought leader, specific accomplishments (speaking engagements, publications, cited work) speak for themselves. Asserting the label directly reads as self-promotion. Audit source: jessica-boquist position bullet at Johnson Controls, "...positioning OpenBlue Workplace as a thought leader." 2026-04-19. -->

✗ "robust" as a filler adjective in front of a business-process noun — e.g. "robust leadership pipeline", "robust training program", "robust framework".

Acceptable in concrete technical-system contexts where "robust" is load-bearing and testable — e.g. "robust fault-tolerant pipeline" or "robust disaster-recovery architecture". Judge from context: if the sentence loses no information when "robust" is deleted, delete it.

<!-- Why: "Robust" added to a business-process noun is padding. The downstream specifics (70 senior managers produced, 88% engagement) are the proof; "robust" adds nothing. Context-dependent rather than a blanket ban because "robust" has legitimate technical uses. Audit source: joel-hough selected-accomplishment 4, "Built a robust leadership pipeline by creating a four-tiered training program that produced 70 senior managers..." — drop "robust" and the claim is unchanged. 2026-04-19. -->

---

If you find yourself writing any of the above, delete it and see what the sentence says without it. If what remains is substantive, keep it. If what remains is empty, you were padding — rewrite the claim with a specific verb and a concrete outcome, or drop it.
