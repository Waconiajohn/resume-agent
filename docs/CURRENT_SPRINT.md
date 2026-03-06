# Sprint 23: Full Codebase Audit Fixes
**Goal:** Fix all findings from the 6-agent full codebase audit — accessibility, WCAG compliance, copy/jargon, code quality, and visual consistency.
**Started:** 2026-03-05

## Stories This Sprint

### Accessibility — Critical
1. [x] Story 1: Fix raw Tailwind colors breaking dark theme in QualityDashboardPanel (priorityStyles + severityColor) — done
2. [x] Story 2: Fix WCAG 1.4.1 color-only information in WorkbenchKeywordBar — done
3. [x] Story 3: Fix prefers-reduced-motion animation breakage in OnboardingSummaryPanel — done
4. [x] Story 4: Fix stale closure in usePipelineStateManager (accessTokenRef not synced) — done

### Accessibility — Medium
5. [x] Story 5: Add missing type="button", aria-labels, and roles across LiveResumePanel, workbench components, SectionReviewPanel — done
6. [x] Story 6: Fix form accessibility (DesignOptionsPanel arrow key navigation for radiogroup) — done
7. [x] Story 7: Add missing aria-labels/roles to ReviewModeToolbar, CompletionPanel; fix raw Tailwind colors in both — done

### Copy/UX — Medium
8. [x] Story 8: Fix developer jargon in panel-renderer error messages, GapAnalysisPanel, ResearchDashboardPanel, ChatPanel, WorkbenchActionChips, WorkbenchEvidenceCards, LiveResumePanel — done
9. [x] Story 9: (Merged into Stories 7-8 — CompletionPanel toneClass colors, ReviewModeToolbar theme colors) — done

### Code Quality — Medium
10. [x] Story 10: Fix SectionWorkbench duplicate useEffects (merged into single effect with [section, content, reviewToken] deps) — done

## Out of Scope (Explicitly)
- LiveResumeDocument theme colors (intentional light-theme document preview)
- Backend/server changes
- Playwright E2E test updates
- New features
