# Supabase Migration Drift Reconciliation Plan

## Goal

Repair the linked Supabase migration history without risking live schema damage.

This is an operations and source-of-truth cleanup task, not a product-feature task.

## Current State

As of March 30, 2026, `npm run check:migrations` from [server](/Users/johnschrup/resume-agent/server) reports:

- `53` remote-only migrations
- `63` local-only migrations

Important context:

- the new telemetry table is already live
- the current mismatch predates the telemetry rollout
- the repo and remote database have both moved, but not through one clean canonical migration chain
- the telemetry migration now appears under different history entries locally and remotely

This means the product can keep moving, but migration history is no longer trustworthy enough for unattended schema operations.

## Safety Rules

1. Do not delete or rewrite remote migration history casually.
2. Do not force-apply all local migrations to the linked database.
3. Do not mark migrations as repaired until the actual schema state is compared.
4. Treat migration metadata and actual database schema as separate things that both need verification.
5. Make every reconciliation step reversible or at least fully documented before execution.

## What Success Looks Like

1. We can run `npm run check:migrations` and get no unexplained local-only or remote-only entries.
2. The linked database schema matches the intended repository schema.
3. Future `supabase db push --linked` runs are trustworthy again.
4. CI migration drift checks become meaningful instead of permanently noisy.

## Phase 1: Inventory And Snapshot

### Objective

Build one trustworthy picture of:

- local migration files
- remote migration metadata
- live remote schema

### Actions

1. Export the full local migration list from [supabase/migrations](/Users/johnschrup/resume-agent/supabase/migrations).
2. Export the remote migration history seen by the Supabase CLI.
3. Snapshot the remote schema for the important live tables before any repair work.
4. Record the current drift output in an artifact or working note.

### Output

One comparison table with:

- local timestamp
- remote timestamp
- likely equivalent migration
- status: `match`, `rename/timestamp drift`, `local only`, `remote only`, or `needs schema review`

## Phase 2: Classify The Drift

### Objective

Separate harmless history mismatch from real schema divergence.

### Categories

1. `Equivalent but renamed/timestamp-shifted`
2. `Applied remotely but missing locally`
3. `Present locally but never meant for this linked environment`
4. `Real schema divergence`
5. `Unsafe / unknown`

### Focus Areas

Start with the newest mismatches first, especially:

- the telemetry migration pair
- the March 2026 migration cluster
- any migrations touching auth, billing, or resume/session tables

## Phase 3: Decide The Canonical History

### Objective

Choose what the linked environment should consider authoritative going forward.

### Decision Principle

The right answer is not necessarily “make remote look exactly like local” or “make local look exactly like remote.”

The right answer is:

- preserve the live schema that users depend on
- produce one canonical ordered migration history in the repo
- align the linked environment metadata to that history safely

### Likely Outcomes

1. Some remote-only timestamps will map to existing local migrations with different IDs.
2. Some local-only migrations may be obsolete or environment-specific and should not be pushed.
3. Some migrations may need new reconciliation migrations rather than history editing.

## Phase 4: Reconcile In Small Batches

### Objective

Fix the history in narrow, reviewable steps instead of one giant rewrite.

### Recommended Order

1. Reconcile the newest known-safe equivalent migrations first.
2. Re-run drift checks after each small batch.
3. Only then address older clusters.

### Acceptable Tools

- Supabase CLI migration repair workflows
- explicit metadata reconciliation commands
- small follow-up SQL migrations when schema alignment is needed

### Avoid

- bulk force pushes
- blind edits to migration metadata tables
- “just reset the remote” shortcuts

## Phase 5: Verify Schema And Gates

### Objective

Prove that repair work fixed metadata without breaking schema reality.

### Verification

1. `npm run check:migrations`
2. targeted schema spot checks on affected tables
3. key server tests if reconciliation added any new migration files
4. confirm [server/PRODUCTION_GATES.md](/Users/johnschrup/resume-agent/server/PRODUCTION_GATES.md) is now realistic again

## Immediate Next Step

The first actual work item should be an inventory pass, not a repair pass.

Specifically:

1. dump the current local migration filenames
2. dump the current remote migration history
3. pair obviously equivalent migrations
4. isolate the unresolved set

Only after that should we decide whether the next move is:

- metadata repair
- reconciliation migrations
- or retiring some local files from the canonical chain

## Recommendation

Treat this as a dedicated database-ops task with its own branch, notes, and verification loop.

It is worth doing, but it should be done calmly and explicitly.
