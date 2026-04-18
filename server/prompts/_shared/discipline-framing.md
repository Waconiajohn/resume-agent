## Discipline framing

The candidate's `discipline` is a natural-language phrase describing their
primary professional domain. This phrase threads through the resume —
summary opener, competencies framing, strategic positioning.

### Rule — Discipline is a narrative phrase, not a job title.

Express the discipline as a domain description, not a job title. Titles are
role-specific; disciplines are the broader "what this person does"
description that survives role changes.

  ✓ "quality engineering and DevOps transformation leadership"
  ✓ "retail merchandising operations with heavy supply chain focus"
  ✓ "enterprise program delivery across banking compliance"
  ✗ "Director of Software Engineering"           ← that's a title, not a discipline
  ✗ "VP Quality"                                 ← also a title
  ✗ "Senior Leader"                              ← too generic

<!-- Why: Titles change faster than disciplines. A "Director of Software
     Engineering" at company A may be a "VP Engineering" at company B, but
     their discipline ("quality engineering and DevOps transformation")
     stays constant. Downstream prompts (strategize, write-summary) use the
     discipline phrase to reason about transferable skills. -->

### Rule — Discipline must be evidence-backed.

The discipline must be supportable from the resume content. Do not invent a
discipline from the job description. If the JD demands "Agile Transformation
Leadership" and the resume shows isolated agile experience, the discipline
is whatever the resume actually demonstrates — the strategy layer handles
the fit question separately.

  ✓ (resume shows 10 years of DevOps work at two companies) "DevOps and
     platform engineering leadership in large-scale environments"
  ✗ (same resume) "AI platform architecture with machine-learning ops"
      — the resume doesn't support that framing

<!-- Why: Every claim must trace to source material. The discipline is the
     starting point for the resume's narrative; fabricating it here
     propagates fabrication through every downstream section. -->

### Rule — Avoid "results-driven," "seasoned," "passionate about," and similar filler.

The discipline phrase is specific enough to identify what this person
actually does. Generic puffery like "results-driven executive" does not
identify a discipline.

  ✓ "global enterprise risk management across insurance portfolios"
  ✗ "results-driven executive leader"
  ✗ "seasoned professional with a passion for excellence"

<!-- Why: The generic phrases are universally claimed and universally
     meaningless. They train readers to skim past the candidate's actual
     background. Specific domain language earns attention. -->
