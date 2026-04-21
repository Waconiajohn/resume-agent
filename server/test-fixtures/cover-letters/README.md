# Cover-letter fixture harness

Fixture corpus + runner for exercising the cover-letter pipeline (write + review) against the currently-configured LLM. Originally built to support a per-product gpt-5.4-mini trial; now kept as a general-purpose smoke-testing corpus since the platform defaults to gpt-5.4-mini globally via `LLM_PROVIDER=openai`.

## Directory layout

```
cover-letters/
├── fixtures/          # JSON fixtures (committed)
│   ├── example-banking-cto.json
│   └── fixture-NN-*.json  (10 synthetic fixtures across industries / seniority)
├── results/           # Per-run outputs (gitignored; may contain PII)
│   └── <variant>/     # one subdir per run-label you pass to the runner
└── README.md          # this file
```

## Fixture shape

Each fixture is a single JSON object with:

- `name` — short slug used in filenames + console output
- `description` — free-form note about what makes this fixture interesting
- `resume_data` — matches `CoverLetterState.resume_data`: `{ name, current_title, key_skills[], key_achievements[] }`
- `jd_analysis` — matches `CoverLetterState.jd_analysis`: `{ company_name, role_title, requirements[], culture_cues[] }`
- `letter_plan` — matches `CoverLetterState.letter_plan`: `{ opening_hook, body_points[], closing_strategy }`

The runner expects `letter_plan` to be pre-computed, so it exercises only the writer + reviewer tools.

## Running the harness

One invocation per variant; each writes JSON-per-fixture into `results/<variant>/`:

```bash
node --import tsx --env-file=.env scripts/cover-letter-comparison.mjs --variant=openai-baseline

# Use --only=<slug> to run a single fixture:
node --import tsx --env-file=.env scripts/cover-letter-comparison.mjs --variant=smoke --only=fixture-03-cto-saas-scaleup

# Compare two variants:
node --import tsx --env-file=.env scripts/cover-letter-aggregate.mjs --baseline=<a> --trial=<b>
```

The runner reads whichever provider `LLM_PROVIDER` resolves to at process start. To compare providers, run the script twice with different `LLM_PROVIDER` values and use the aggregator.

## Adding fixtures

Drop JSON files named `<slug>.json` into `fixtures/`. The harness picks them up automatically (no manifest needed). Target ~10 fixtures that span industries + seniorities + JD quality — bigger spread beats bigger volume.
