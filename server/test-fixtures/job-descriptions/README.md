# server/test-fixtures/job-descriptions/

Job description fixtures used by Stage 3 (Strategize) in Phase 4. Structurally mirrors `resumes/`:

```
server/test-fixtures/job-descriptions/
├── README.md                       # this file
├── raw/                            # raw .docx / .pdf / .md job descriptions (gitignored)
└── meta/                           # one <slug>.yaml per JD describing employer, role, discipline
                                    # (gitignored when sensitive)
```

Slugs follow `jd-NN-<employer-role>` (e.g. `jd-01-under-armour-account-manager-wholesale`).

## Why separate from `resumes/`

The classify stage accepts a resume. Feeding it a JD (structurally: an open-role description talking about what the hiring company wants) yields nonsense. Keeping JDs in a sibling corpus makes "don't classify this" a filesystem invariant rather than a prompt-level rule.

## Phase 2.1 context

Fixture-20 in the earlier Phase 2 corpus was an Under Armour job description that the user included with the 19 candidate resumes. It moved here in Phase 2.1 as `jd-01-under-armour-account-manager-wholesale`. The `meta/fixture-20-*.yaml` file that originally marked it `NOT_A_RESUME` was renamed/moved accordingly.

## Phase 4 prerequisites

Stage 3 (Strategize) takes a `StructuredResume` plus a `JobDescription`. The `JobDescription` shape in `server/src/v3/types.ts` carries `text`, `title?`, `company?`. Phase 4 will wire a JD-aware runner that pairs each resume fixture against a chosen JD from this directory (ideally the one that makes the strongest classify/strategize case for that candidate). For Phase 2.1, just getting the JD out of the resumes corpus is the scope.
