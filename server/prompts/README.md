# server/prompts/

First-class home for the prompts that power the v3 resume pipeline.

The full rationale lives in [`docs/v3-rebuild/03-Prompt-Library-Structure.md`](../../docs/v3-rebuild/03-Prompt-Library-Structure.md). This README is the practical onboarding.

## Layout

```
server/prompts/
├── README.md                       # this file
├── classify.v1.md                  # Stage 2 — structure resume text
├── strategize.v1.md                # Stage 3 — positioning strategy
├── write-summary.v1.md             # Stage 4a — executive summary
├── write-accomplishments.v1.md     # Stage 4b — selected accomplishments
├── write-competencies.v1.md        # Stage 4c — core competencies
├── write-position.v1.md            # Stage 4d — per-position bullets (parallel)
├── verify.v1.md                    # Stage 5 — quality verification
└── archive/                        # old versions kept for reference
```

Phase 1 ships the loader; the prompt files themselves land in Phase 3 (classify) and Phase 4 (strategize, write, verify).

## File format

Every prompt is a markdown file with YAML frontmatter:

```markdown
---
stage: classify
version: "1.0"
model: claude-opus-4-7
temperature: 0.2
last_edited: 2026-04-17
last_editor: john
notes: |
  v1.0: Initial version.
---

# System

You are ... (system message)

## Hard rules

1. Rule.
   <!-- Why: failure mode this prevents, with a rough date. -->

# User message template

Template body with placeholders like {{resume_text}}.
```

The loader splits the body on the `# User message template` header. Anything before that header is the system message; anything after is the user-message template.

## Adding a new prompt

1. Create `<stage>.v1.md` in this directory.
2. Fill in required frontmatter: `stage`, `version` (as a quoted string like `"1.0"` — unquoted `1.0` gets parsed as the number `1`), `model`, `temperature`.
3. Write the system message. Every rule gets a `<!-- Why: ... -->` HTML comment below it.
4. Write the user-message template below a `# User message template` heading.
5. Run the fixture suite (`npm run fixtures` from `server/`) before committing.

## Bumping a version

- Patch (v1.0 → v1.0.1): typo, formatting, comment-only changes.
- Minor (v1.0 → v1.1): added rule, clarified behavior.
- Major (v1 → v2): behavioral or output-shape change. Full fixture re-validation required.

When you bump, move the old file to `archive/` with its previous version suffix. Never overwrite history.

## A/B testing

Land candidate prompts as `<stage>.v2-test.md` alongside the current version. Use the fixture runner's `--prompt-variant` flag to compare outputs. When the candidate wins across fixtures, rename `v2-test.md` → `v2.md` and archive the previous version.

## Every rule gets a "why"

Rules without rationale get deleted by future edits that don't know why they exist. Include the failure mode, rough date, and (ideally) an example input that would trigger the bug. See [`03-Prompt-Library-Structure.md`](../../docs/v3-rebuild/03-Prompt-Library-Structure.md) §"Why every rule gets a 'why'".
