# 03 — Prompt Library Structure

## Why prompts deserve their own directory

Right now, prompts live as string literals inside TypeScript files. That makes them:

- Hard to edit (requires a deploy)
- Hard to review (buried in implementation code)
- Hard to version (git history is mixed with code changes)
- Hard to A/B test (no mechanism)
- Hard to understand (no room for comments explaining why each rule exists)

In the new architecture, prompts are first-class files. Engineering treats them the way writers treat manuscripts: named, versioned, reviewed, and improvable without touching the code that uses them.

## Directory structure

```
server/prompts/
├── README.md                          # How this directory works
├── classify.v1.md                     # Stage 2 — parse resume text into structured data
├── strategize.v1.md                   # Stage 3 — positioning strategy for JD
├── write-summary.v1.md                # Stage 4a — executive summary
├── write-accomplishments.v1.md        # Stage 4b — selected accomplishments
├── write-competencies.v1.md           # Stage 4c — core competencies
├── write-position.v1.md               # Stage 4d — per-position bullets (called in parallel)
├── verify.v1.md                       # Stage 5 — quality verification
└── archive/                           # Old versions kept for reference
    ├── classify.v0-draft.md
    └── ...
```

Each prompt is a standalone markdown file with a specific structure.

## Prompt file format

```markdown
---
stage: classify
version: 1.2
model: claude-opus-4-7
temperature: 0.2
last_edited: 2026-04-25
last_editor: john
notes: |
  v1.2: Added explicit instruction to treat parent-company headers as umbrellas, not positions.
  v1.1: Added career gap note detection.
  v1.0: Initial version.
---

# System

You are [role description]. Your job is to [specific task].

## Hard rules

1. [Rule with brief rationale in a comment below]
   <!-- Why: We saw parent-company headers being parsed as positions when no title keyword appeared. -->

2. [Rule]
   <!-- Why: ... -->

## Output format

Return valid JSON matching this shape:
[schema]

## Examples

### Good example
[input → expected output]

### Bad example (common failure mode)
[input → what NOT to produce → what TO produce instead]

# User message template

[Template with placeholders: {{candidate_name}}, {{resume_text}}, etc.]
```

## Why every rule gets a "why"

Six months from now, when someone reads a prompt and sees a rule like "never reproduce parent-company headers as positions," they should immediately understand why it's there. Without the rationale, rules get removed by well-meaning edits that don't realize the rule was preventing a specific bug.

Every rule in every prompt has a comment explaining:
- What failure mode this prevents
- When we discovered the failure mode (rough date is fine)
- An example input that would trigger the bug without this rule

This is the prompt equivalent of `// HACK: leave this in place even though it looks redundant, see issue #1234` but with better reasoning.

## Versioning

Prompts are versioned with semantic meaning:

- **Major (v2 → v3):** Fundamental change in behavior or output shape. Requires fixture re-validation.
- **Minor (v1.1 → v1.2):** Added rule, added example, clarified existing behavior. Requires fixture spot-check.
- **Patch (v1.1.0 → v1.1.1):** Typo, formatting, comment-only changes. No fixture re-validation needed.

When you bump a version, the old file goes to `archive/` with its old version number. Never overwrite history.

## A/B testing

Every prompt can be tested A/B by running both versions against the fixture suite and comparing output. Simple mechanism:

```
server/prompts/
├── classify.v1.md       # current production version
├── classify.v2-test.md  # candidate next version
```

The fixture runner accepts a `--prompt-variant` flag. Engineers can compare any two versions without touching production code.

When v2-test proves better across all fixtures, rename it to `classify.v2.md` and move `classify.v1.md` to `archive/`.

## Who can edit prompts

Prompts are code. They get reviewed in pull requests. But the review criteria are different from code reviews:

- Does the change align with the stage's responsibility as defined in 01-Architecture-Vision.md?
- Does every new rule have a "why" comment?
- Do the fixtures still pass?
- Is there a new fixture exercising the behavior the rule addresses?

Non-engineers can propose prompt changes. The review gate is fixture pass/fail, not engineering approval for its own sake.

## Prompt maintenance rituals

**Weekly:** Review the prior week's user-reported issues. For each, determine if it's a prompt issue (edit the prompt) or a code issue (file a bug).

**Monthly:** Review each prompt end-to-end. Remove rules that no longer fire (measurable: no fixtures exercise them). Consolidate overlapping rules. Update examples to reflect current best outputs.

**Quarterly:** Measure prompt quality against fixtures. Compare to last quarter. If quality is flat or degrading, there's a problem to investigate.

## The prompt README

`server/prompts/README.md` lives at the top of the prompt directory and contains:

1. The directory structure (kept in sync with this document)
2. How to add a new prompt
3. How to bump a version
4. How to run the fixture suite against a prompt change
5. The rationale link to this document

It's a short, practical onboarding document for anyone touching prompts.

## What this buys us

Once this structure is in place:

- **Editing a prompt takes 30 seconds**, not a deploy cycle
- **Reading a prompt explains itself** — every rule tells its own story
- **Regressing on a prompt change is caught automatically** by fixtures
- **A/B testing prompt improvements is trivial**, not a project
- **Non-engineers can propose changes** with confidence
- **Onboarding to the resume writer starts with reading prompts**, not decoding TypeScript
