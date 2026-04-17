# server/test-fixtures/resumes/

Real resumes that the v3 pipeline is tested against. Phase 2 populates this directory; Phase 1 ships only the convention and the runner.

## Layout

```
server/test-fixtures/
├── resumes/
│   ├── README.md                    # this file
│   ├── raw/                         # raw resume files (docx/pdf/txt/md) — gitignored
│   │   └── .gitkeep
│   ├── meta/                        # one <name>.yaml per fixture — gitignored if raw has PII
│   └── extracted/                   # Stage 1 output — committed once anonymization is confirmed
└── snapshots/                       # per-fixture pipeline snapshots, written by the runner
    └── <fixture-name>/
        ├── extract.json
        ├── classify.json
        ├── strategy.json
        ├── written.json
        └── verify.json
```

## PII and commits

**Never commit raw resume files containing real personal information.** `raw/` is gitignored (see `.gitignore` at repo root). Metadata files and extracted text may contain PII depending on anonymization; commit them only after Phase 2's PII scan and a human redaction pass.

## Adding a fixture

1. Drop the raw file in `raw/` using a stable base name (e.g. `fixture-01-executive-finance.docx`).
2. Phase 2 generates `meta/<name>.yaml` with category, characteristics, and notes.
3. Phase 2 runs Stage 1 (deterministic) and writes `extracted/<name>.txt`.
4. Later phases run the full pipeline and write per-fixture snapshots under `snapshots/<name>/`.

## Running

From `server/`:

```
npm run fixtures                     # run every fixture
npm run fixtures -- --only rose-seed # single fixture
npm run fixtures -- --prompt-variant v2-test   # A/B a prompt candidate
```

Phase 1 invariant: with no fixtures present, the runner prints `0 fixtures found, 0 passed, 0 failed, 0 drifted, 0 new` and exits 0.
