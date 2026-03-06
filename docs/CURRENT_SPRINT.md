# Sprint 24: Re-Audit Theme & Accessibility Fixes
**Goal:** Fix all remaining raw Tailwind semantic colors, missing motion-safe prefixes, aria-label gaps, and jargon found in the second full codebase audit.
**Started:** 2026-03-05

## Stories This Sprint

### Theme Colors — Critical
1. [x] Story 1: Fix raw Tailwind status dot colors in ChatPanel + ChatDrawer (rose/sky/amber/emerald → theme hex) — done
2. [x] Story 2: Fix raw Tailwind colors in WorkspaceShell sidebar status (emerald/amber/orange → theme hex) — done
3. [x] Story 3: Fix raw Tailwind colors in InterviewLayout VictoryMoment + SectionWorkbench approval overlay (emerald → theme hex) — done
4. [x] Story 4: Fix raw Tailwind colors in SectionWorkbench bundled review UI (emerald/sky → theme hex) — done
5. [x] Story 5: Fix raw Tailwind colors in OnboardingSummaryPanel + ResearchDashboardPanel (emerald/amber/rose/sky → theme hex) — done
6. [x] Story 6: Fix raw Tailwind colors in QualityDashboardPanel + BlueprintReviewPanel (amber → theme hex) — done
7. [x] Story 7: Fix raw Tailwind colors in PositioningInterviewPanel (blue/green/amber → theme hex) + QuestionnairePanel (sky/rose) + CompletionPanel (emerald/sky/amber) — done
8. [x] Story 8: Fix ChatMessage icon color (#b8caff → #afc4ff) + IntelligenceActivityFeed border (blue-400 → theme hex) — done

### Accessibility — Medium
9. [x] Story 9: SectionReviewPanel aria-pressed — confirmed correct (already `false` due to narrowing inside `mode !== 'edit'` guard) — done
10. [x] Story 10: Add motion-safe: prefix to WorkbenchProgressDots animate-pulse + SectionWorkbench approval animations — done
11. [x] Story 11: Add aria-label to QualityDashboardPanel CollapsibleSection + fix LandingScreen button type + ResumePanel aria-labels — done

### Copy — Low
12. [x] Story 12: Replace "Action Required" jargon in PositioningInterviewPanel with consumer-friendly label — done

### Bonus Fixes (discovered during implementation)
- Toast.tsx: Replaced all 4 raw Tailwind accent colors with theme hex
- ProcessStepGuideCard.tsx: Replaced border-l tone colors (sky/amber/emerald → theme hex)
- PositioningProfileChoice.tsx: Replaced sky badge colors with theme hex
- SectionsNodeSummary.tsx: Replaced emerald/sky bundle status colors with theme hex
- QuestionsNodeSummary.tsx: Replaced rose/amber/sky/emerald badge colors with theme hex
- WorkbenchSuggestions.tsx: Replaced emerald-400/70 check icon with theme hex
- PipelineIntakeForm.tsx: Replaced emerald-300/80 text with theme hex
- ContextPanel.tsx: Replaced focus-visible:ring-blue-400 with theme hex

## Out of Scope (Explicitly)
- Backend/server changes
- Type safety improvements (logged for later)
- Code quality refactors (logged for later)
- New features
