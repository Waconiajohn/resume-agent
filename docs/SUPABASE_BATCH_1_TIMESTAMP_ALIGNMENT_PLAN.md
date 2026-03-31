# Supabase Batch 1 — Timestamp Alignment Plan

**Date:** 2026-03-27
**Scope:** Repo-local filename alignment only. No SQL content changes. No remote mutations.

---

## Files to Rename (5)

| # | Current Local Filename | New Filename (MCP remote timestamp) |
|---|---|---|
| 1 | `20260311100100_tighten_assessment_rls.sql` | `20260330211757_tighten_assessment_rls.sql` |
| 2 | `20260311100200_add_delete_policies.sql` | `20260330211804_add_delete_policies.sql` |
| 3 | `20260311000000_coach_tables.sql` | `20260330211818_coach_tables.sql` |
| 4 | `20260308290000_job_search_tables.sql` | `20260330211834_job_search_tables.sql` |
| 5 | `20260308300000_watchlist_companies.sql` | `20260330211843_watchlist_companies.sql` |

## Parity Confirmation

These 5 migrations were applied to remote via Supabase MCP `apply_migration` using the exact SQL content from the local files. The remote `statements[1]` is the local SQL verbatim. This is exact parity — no verification needed beyond the apply confirmation.
