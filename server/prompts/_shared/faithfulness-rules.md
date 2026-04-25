## Faithfulness rules (shared)

Three rules every write prompt must enforce. Applies to summary, selected accomplishments, core competencies, custom sections, positions, and single-bullet regeneration. These are consolidated from `write-position.v1`'s tightest discipline so every write stage holds the same bar.

### Rule — No editorial filler. Forbidden phrases.

Never emit any of the following phrases or close variants. These are universal editorial filler that hiring managers skim past, and they are never faithful to a specific source claim.

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
✗ "brings a track record of [anything]" or "brings [X] years of experience"
✗ "ensuring fair and compliant outcomes" or any "ensuring [adjective] outcomes" tail
✗ Any phrase that editorializes without adding source-specific content

If you find yourself writing one of these, delete it and see what the text says without it. If what remains is substantive, keep it. If what remains is empty, you were padding.

<!-- Why: Phase 3.5 and Phase A audits both found the same failure mode — write prompts at higher temperature and without a forbidden-phrases lexicon produce editorial tails that verify correctly flags as unsourced. The prose looks strong but doesn't tie to a specific claim. Banning the phrases outright removes the attractive nuisance before the self-check step. 2026-04-19. -->

### Rule — Every factual claim must trace to candidate evidence.

Every factual claim in your output — every metric, named system, credential, employer, title, scope qualifier, industry term, and outcome — must trace to candidate evidence. Acceptable sources of support:

- A source position's `bullets[]` text
- A source position's `scope`
- A source position's `title`
- The resume's `discipline` field
- `crossRoleHighlights`
- `customSections` entries
- User-supplied questionnaire or evidence-library answers when the calling prompt includes them

Strategy inputs (`positioningFrame`, `targetDisciplinePhrase`, `emphasizedAccomplishments`) are positioning context. They tell you which angle to lean into and which source content to foreground. They do NOT supply claim material. If strategy says the frame is "multi-property hospitality leader" but the source resume never mentions hospitality, you may not write "multi-property hospitality" into the output — drop the industry qualifier and use a frame the source supports.

The job description is not a source of candidate facts. The benchmark is not a source of candidate facts. They can identify needs, business problems, and terminology to mirror when candidate evidence supports it.

You MAY:
- Reorder and tighten source material
- Swap verbs for stronger ones from the source's vocabulary
- Combine two source claims into one sentence when they describe the same accomplishment
- Mirror JD keywords when the source material already supports the claim
- Use reasonable-inference framing when source facts clearly establish it (for example, "3 facilities" can support "multi-site")

You MAY NOT:
- Invent metrics, credentials, direct experience, named systems, or industry terms
- Add frequency/cadence/scope qualifiers the source doesn't state ("weekly", "with department heads", "across enterprise and education sectors")
- Promote a strategy framing into a resume claim without source support
- Expand an abbreviation the source uses only in abbreviated form

<!-- Why: The HR-exec session that triggered this fragment produced notes like "multi-property hospitality leadership" and "complex HR operations leader" in the summary when the source carried neither industry qualifier. The strategy offered them; write-summary faithfully echoed; verify caught it. The fix is write prompts must treat strategy as context, not claim material. 2026-04-19. -->

### Rule — Self-check before emitting JSON.

Before you emit the final JSON, reread each output field and perform this check for every noun phrase:

1. Metrics (dollar figures, percentages, staff counts, time reductions): does the exact figure appear in the source?
2. Named systems, products, or tools: does the source name them?
3. Scope qualifiers ("multi-property," "enterprise," "regional," "cross-functional"): does the source use this qualifier, or do concrete source facts establish it under the evidence ladder?
4. Industry or discipline terms ("hospitality," "healthcare," "fintech," "HR operations"): does the source establish this industry or discipline?
5. Framing nouns in opening sentences ("track record of," "leader who," "consultant with history of"): is this claim supported, or is it an editorial wrap around thinner content?

If any check fails for a specific claim, either rewrite the sentence to remove the unsupported part, or drop the sentence. The mechanical attribution checker downstream will catch what you missed, but catching it here costs nothing and produces a cleaner first draft.

<!-- Why: write-position has this step as its Rule 10 and converged on tighter attribution discipline. The loose-prompt cohort (summary, accomplishments, competencies, custom-section) runs at 4x temperature without this step, and verify was doing the downstream cleanup work. Adding the self-check gives every write stage one final attention pass before emit. 2026-04-19. -->
