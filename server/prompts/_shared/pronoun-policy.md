## Pronoun and voice policy

### Rule — No personal pronouns referring to the candidate. Ever.

Write the resume in active voice. Personal pronouns (`I`, `me`, `my`, `we`, `our`, `he`, `him`, `his`, `she`, `her`, `hers`, `they`, `them`, `their`, `theirs`) referring to the candidate must NOT appear in the rewritten resume. This applies regardless of what the classified resume reports as `resume.pronoun` — that field is a classification observation about the source text, not a license to carry pronouns forward into the rewrite.

Every sentence opens with a past-tense action verb or a noun describing the candidate's role. Longer sentences use subordinate clauses that continue the same structure.

  ✓ "Led $40M transformation across three business units."
  ✓ "Operations executive who turns around underperforming manufacturing plants."
  ✓ "Delivered $26M in automation ROI by standardizing CI/CD across 15 Agile Release Trains."
  ✗ "He led a $40M transformation..."           ← third-person pronoun (banned)
  ✗ "She delivered $26M..."                      ← third-person pronoun (banned)
  ✗ "They managed a 50-person org..."            ← third-person pronoun (banned)
  ✗ "I led a $40M transformation..."             ← first-person pronoun (banned)
  ✗ "We delivered $26M..."                       ← first-person pronoun (banned)
  ✗ "Tatiana led a $40M transformation..."       ← name-led narrator (reads as bio)
  ✗ "A $40M transformation was led by..."        ← passive voice (buries agency)

For continuation in a compound sentence, repeat the active-verb pattern or rely on an implicit subject — do not introduce a pronoun:

  ✓ "Led a $40M transformation; combined Lean methodology with aggressive cost discipline."
  ✗ "Led a $40M transformation; his approach combined Lean methodology with aggressive cost discipline."

<!-- Why: US executive-resume convention is active voice, no pronouns. Pronoun-led
     resumes read as autobiographical essays; name-led narrator reads as a LinkedIn
     bio; passive voice buries the candidate's agency. Active-verb-first with no
     pronoun is the industry standard that ATS parsers, recruiters, and hiring
     managers all expect. This rule is absolute — there is no "pronoun exception"
     for non-null resume.pronoun. 2026-04-19. -->

### Rule — No first-person pronouns, ever.

`I`, `me`, `my`, `we`, `our` never appear in resume content. The only first-person
language is in an optional cover letter (not in scope for this prompt).

  ✓ "Delivered $26M in automation ROI."
  ✗ "I delivered $26M in automation ROI."
  ✗ "We delivered $26M in automation ROI."

<!-- Why: First-person pronouns on a resume are a style violation that
     hiring managers notice. Classify may find them in source resume text
     where the candidate used first-person; Write strips them in the rewrite. -->
