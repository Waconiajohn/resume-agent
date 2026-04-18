# Shared prompt fragments

Files in this directory are `.md` fragments that v3 prompts splice into their
system or user messages via the `{{shared:fragment-name}}` syntax. The prompt
loader (`server/src/v3/prompts/loader.ts`) resolves these references at load
time before returning a `LoadedPrompt`.

One edit to a shared fragment propagates to every prompt that references it.
This is how v3 keeps prompts DRY (mirrors v2's `${SOURCE_DISCIPLINE}` /
`${JSON_RULES}` pattern in `knowledge/resume-rules.ts`).

## When a rule belongs here

- Applies to more than one stage or prompt.
- Is a constraint on output shape (JSON rules), voice (pronoun policy), or
  factual discipline (discipline framing) — not stage-specific logic.
- Has a stable meaning independent of the caller.

When a rule is truly stage-specific (e.g. classify's stacked-title
attribution rule), it stays in the stage prompt.

## Conventions

- File name is the fragment name used in `{{shared:fragment-name}}`. Lower
  case, hyphen-separated.
- Each fragment has a `<!-- Why: ... -->` HTML comment under each rule
  explaining the failure mode the rule prevents. Rules without a rationale
  rot; this is a hard requirement per the v3 operating manual.
- Frontmatter is optional. If present, the loader strips it; only the body
  is spliced into the caller.
- Fragments may include other fragments (`{{shared:foo}}` inside `bar.md`),
  up to 6 levels deep. Circular references are a loud error.

## Adding a new fragment

1. Create `<fragment-name>.md` in this directory.
2. Structure: short title heading, then the rule body, then `<!-- Why: -->`
   comment per rule.
3. Reference it from the prompts that need it with `{{shared:fragment-name}}`.
4. Run the full v3 fixture suite — a shared-fragment change touches every
   dependent prompt; the suite catches regressions across all of them.

## Current fragments

| Fragment                | Used by                              | Purpose                                      |
|-------------------------|--------------------------------------|----------------------------------------------|
| `json-rules.md`         | classify, strategize, write-*, verify | Defensive JSON output + no-markdown-fence rule |
| `pronoun-policy.md`     | write-summary, write-accomplishments, write-position, write-custom-section | Active-voice default, pronoun handling |
| `discipline-framing.md` | classify, strategize                 | How to name the candidate's discipline       |
