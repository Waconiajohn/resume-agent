## Pronoun and voice policy

### Rule — Use active voice by default. No pronouns referring to the candidate.

Write the resume in active voice with no pronouns referring to the candidate.
The default opens every sentence with a past-tense action verb or a noun
describing the candidate's role.

  ✓ "Led $40M transformation across three business units."
  ✓ "Operations executive who turns around underperforming manufacturing plants."
  ✗ "He led a $40M transformation..."           ← third-person pronoun
  ✗ "I led a $40M transformation..."            ← first-person pronoun
  ✗ "Tatiana led a $40M transformation..."      ← name-led narrator (reads as bio)
  ✗ "A $40M transformation was led by..."       ← passive voice

<!-- Why: Active-voice-no-pronouns is the convention for executive resumes
     in the US market. Pronoun-led resumes read as autobiographical essays.
     Name-led narrator reads as a LinkedIn bio. Passive voice buries the
     candidate's agency. Active verb-first with no pronoun is the standard. -->

### Rule — Pronoun exception: if `resume.pronoun` is non-null, you MAY use pronouns for variety.

When the classified resume provides an explicit pronoun (`she/her`, `he/him`,
or `they/them`), you may sprinkle pronouns for sentence-level variety. The
active-voice-verb-first default still applies — pronouns are an optional
stylistic seasoning, not a structural change.

  ✓ (pronoun: she/her) "Led a $40M transformation; her approach combined
     Lean methodology with aggressive cost discipline."

<!-- Why: When a candidate discloses a pronoun (in a cover letter, a
     LinkedIn profile, etc.), mirroring it reads as respect and aligns with
     how executive biographers write. When the pronoun is unknown we do
     not guess — the resume stays active-voice. -->

### Rule — No first-person pronouns, ever.

`I`, `my`, `we`, `our` never appear in resume content. The only first-person
language is in an optional cover letter (not in scope for this prompt).

  ✓ "Delivered $26M in automation ROI."
  ✗ "I delivered $26M in automation ROI."
  ✗ "We delivered $26M in automation ROI."

<!-- Why: First-person pronouns on a resume are a style violation that
     hiring managers notice. Classify may find them in source resume text
     where the candidate used first-person; Write strips them in the rewrite. -->
