# Cover-letter fixture harness

Fixture corpus and runner for the cover-letter gpt-5.4-mini comparison work. See `docs/cover-letter-gpt54mini-trial.md` at the repo root for background.

## Directory layout

```
cover-letters/
├── fixtures/          # JSON fixtures (commit these)
│   └── example-banking-cto.json
├── results/           # Per-variant run outputs (gitignored; per-fixture JSON)
│   ├── baseline/
│   └── trial/
└── README.md          # this file
```

## Fixture shape

Each fixture is a single JSON object with:

- `name` — short slug used in filenames + console output
- `description` — free-form note about what makes this fixture interesting (industry, seniority, difficulty)
- `resume_data` — matches `CoverLetterState.resume_data`: `{ name, current_title, key_skills[], key_achievements[] }`
- `jd_analysis` — matches `CoverLetterState.jd_analysis`: `{ company_name, role_title, requirements[], culture_cues[] }`
- `letter_plan` — matches `CoverLetterState.letter_plan`: `{ opening_hook, body_points[], closing_strategy }`

The runner expects `letter_plan` to be pre-computed so the harness exercises only the writer + reviewer tools (the two tools being compared). If you want to include analyst variance in the comparison, run the analyst separately against the same JD+resume and save its output into the fixture.

## Running the comparison

One invocation per variant; each writes JSON-per-fixture into `results/<variant>/`:

```bash
# Baseline: whatever the current env defaults to (Groq, today).
node --import tsx --env-file=.env scripts/cover-letter-comparison.mjs --variant=baseline

# Trial: OpenAI + gpt-5.4-mini. Requires OPENAI_API_KEY + COVER_LETTER_*
# env vars set:
COVER_LETTER_WRITER_PROVIDER=openai \
COVER_LETTER_WRITER_MODEL=gpt-5.4-mini \
COVER_LETTER_REVIEWER_MODEL=gpt-5.4-mini \
  node --import tsx --env-file=.env scripts/cover-letter-comparison.mjs --variant=trial

# Aggregate the two runs into a summary.
node --import tsx --env-file=.env scripts/cover-letter-aggregate.mjs
```

The runner prints per-fixture progress and leaves the detailed outputs on disk. The aggregator emits a markdown table to stdout (redirect to capture).

## Adding real fixtures

Drop JSON files named `<slug>.json` into `fixtures/`. The harness picks them up automatically (no manifest needed). Target ~10 fixtures that span:

- Fortune-50 banking / financial services
- Early-stage SaaS (Series B–D)
- Federal / public sector
- Healthcare operations
- Retail / consumer ops
- Private equity portfolio operations
- Biotech / pharma R&D
- Non-profit senior leadership
- Agency / client services
- Mid-market manufacturing

Bigger spread > bigger volume: 10 diverse fixtures beats 30 similar ones for attribution of quality differences to the model swap.
