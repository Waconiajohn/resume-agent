# Database Migrations

## Naming Convention

All **new** migrations must use the Supabase timestamp format:

```
YYYYMMDDHHMMSS_description.sql
```

Example: `20260224190000_add_workflow_artifacts_and_nodes.sql`

### Legacy files

Files numbered `001_` through `012_` are legacy migrations from early development.
They **must not** be renamed — Supabase tracks applied migrations by filename,
and renaming would cause them to be re-applied or skipped.

### Creating a new migration

```bash
# Via Supabase CLI (recommended — auto-generates timestamp):
supabase migration new description_here

# Manual:
# Use format YYYYMMDDHHMMSS_short_description.sql
# e.g. 20260225143000_add_user_preferences.sql
```

### CI check

The `check-migration-naming.mjs` script runs in CI and warns if any new file
does not follow the timestamp convention. Legacy `NNN_` files are grandfathered.
