# Sprint 25: Third Audit — Full Codebase Theme, Motion-Safe & Test Alignment
**Goal:** Fix all remaining raw Tailwind semantic colors in peripheral files, add motion-safe: prefixes to all animate-* classes across the entire codebase, fix aria-labels, update jargon, and align test assertions with Phase 3 copy rewrites.
**Started:** 2026-03-05

## Stories This Sprint

### Theme Colors — Core
1. [x] Story 1: Fix decoration-red-400/30 in LiveResumePanel → #e0abab — done
2. [x] Story 2: Fix emerald/amber/blue semantic colors in App.tsx checkout banners — done

### Theme Colors — Peripheral Files
3. [x] Story 3: Fix SalesPage (6 patterns: red/amber/blue/emerald → theme hex) — done
4. [x] Story 4: Fix PricingPage (3 patterns: emerald → #b5dec2) — done
5. [x] Story 5: Fix BillingDashboard + AffiliateDashboard (emerald/blue/amber → theme hex) — done
6. [x] Story 6: Fix CoverLetterIntakeForm + CoverLetterScreen (rose/emerald/amber → theme hex) — done
7. [x] Story 7: Fix dashboard components (EvidenceItemCard, DashboardSessionCard, ComparisonSectionBlock: blue/emerald/amber → theme hex) — done
8. [x] Story 8: Fix network-intelligence components (JobMatchesList, CsvUploader: blue/green/amber/red → theme hex) — done

### Accessibility — Motion-Safe Prefixes
9. [x] Story 9: Add motion-safe: to all animate-spin across codebase (~15 files) — done
10. [x] Story 10: Add motion-safe: to all animate-pulse across codebase (~15 files) — done
11. [x] Story 11: Add motion-safe: to custom animations in WorkspaceShell (node-complete-pop, node-pulse) — done

### Aria-Labels & Jargon
12. [x] Story 12: Add aria-labels to LiveResumePanel Save/Cancel/Approve/Revise buttons — done
13. [x] Story 13: Replace "Not inferred" → "Not available" in ResearchDashboardPanel — done

### Test Alignment
14. [x] Story 14: Update QualityDashboardPanel.test.tsx — align 14 assertions with Phase 3 renamed headers/labels/colors — done
15. [x] Story 15: Update CompletionPanel.test.tsx — align 7 assertions with Phase 3 renamed headers/labels/aria-labels — done
16. [x] Story 16: Update panel-renderer.test.tsx — align validation message with Phase 3 consumer-friendly copy — done

## Out of Scope (Explicitly)
- Backend/server changes
- LiveResumeDocument.tsx (intentionally light-theme)
- purple-400 in JobMatchesList STATUS_COLORS (no theme equivalent — design decision needed)
