# Changelog — Resume Agent

## 2026-03-05 — Session 27
**Sprint:** 25 | **Stories:** Third Audit — Full Codebase Theme, Motion-Safe & Test Alignment (Stories 1-16)
**Summary:** Fixed all remaining raw Tailwind semantic colors in peripheral files (SalesPage, PricingPage, BillingDashboard, AffiliateDashboard, CoverLetter*, dashboard/*, network-intelligence/*), added motion-safe: prefixes to every animate-spin and animate-pulse across ~30 files, fixed aria-labels on LiveResumePanel buttons, replaced jargon in ResearchDashboardPanel, and aligned all 22 failing test assertions with Phase 3 copy rewrites. Fourth audit pass found and fixed 28 remaining `red-*` semantic color instances across 16 files + 2 missing motion-safe: on celebration animations. 426/426 tests passing, `tsc --noEmit` clean.

### Changes Made — Core
- `app/src/components/GlassButton.tsx` — animate-spin → motion-safe:animate-spin
- `app/src/components/panels/SectionWorkbench.tsx` — animate-pulse + animate-[shimmer] → motion-safe:
- `app/src/components/panels/CompletionPanel.tsx` — animate-spin (3) → motion-safe:animate-spin
- `app/src/components/ChatPanel.tsx` — animate-spin (5) → motion-safe:animate-spin
- `app/src/components/ChatDrawer.tsx` — animate-spin → motion-safe:animate-spin
- `app/src/components/workspace/WorkspaceShell.tsx` — 3 custom animations → motion-safe:
- `app/src/components/panels/LiveResumePanel.tsx` — aria-labels on Save/Cancel/Approve/Revise buttons; decoration-red-400/30 → #e0abab
- `app/src/components/panels/ResearchDashboardPanel.tsx` — "Not inferred" → "Not available" (4 instances)
- `app/src/App.tsx` — emerald/amber checkout banners → theme hex; animate-spin → motion-safe:

### Changes Made — Peripheral
- `app/src/components/SalesPage.tsx` — 6 edits: red/amber/blue/emerald → theme hex
- `app/src/components/PricingPage.tsx` — 3 edits: emerald → #b5dec2
- `app/src/components/BillingDashboard.tsx` — StatusBadge + usage bar colors → theme hex
- `app/src/components/AffiliateDashboard.tsx` — emerald-400 (5) + blue-500 → theme hex
- `app/src/components/cover-letter/CoverLetterIntakeForm.tsx` — rose/amber → theme hex
- `app/src/components/cover-letter/CoverLetterScreen.tsx` — rose/emerald/amber → theme hex + motion-safe:
- `app/src/components/dashboard/EvidenceItemCard.tsx` — SOURCE_CONFIG colors → theme hex
- `app/src/components/dashboard/DashboardSessionCard.tsx` — StatusBadge colors → theme hex
- `app/src/components/dashboard/ComparisonSectionBlock.tsx` — emerald border/badge → #b5dec2
- `app/src/components/network-intelligence/JobMatchesList.tsx` — STATUS_COLORS → theme hex + motion-safe:
- `app/src/components/network-intelligence/CsvUploader.tsx` — drag/upload/complete colors → theme hex + motion-safe:

### Changes Made — Motion-Safe Additions (~20 files)
- PipelineIntakeForm, ResumePanel, LandingScreen, GlassSkeleton, PartialResumePreview, MasterResumeTab, ResumeComparisonModal, SessionResumeModal, EvidenceLibraryTab, SessionHistoryTab, ConnectionsBrowser, TargetTitlesManager, NetworkIntelligenceTab, CompanyCard

### Changes Made — Fourth Audit: red-* Semantic Colors (28 instances across 16 files)
- `app/src/components/AuthGate.tsx` — text-red-400 → #e0abab
- `app/src/components/SalesPage.tsx` — 3 edits: border/bg/text red-400/500/300 → #e0abab
- `app/src/components/PricingPage.tsx` — 2 error banners: red-300/500/200 → #e0abab
- `app/src/components/ResumePanel.tsx` — error banner: red-300/500/100 → #e0abab
- `app/src/components/BillingDashboard.tsx` — 3 edits: cancelled status + error icon + action error → #e0abab
- `app/src/components/PipelineIntakeForm.tsx` — 4 edits: error banner + 3 inline errors → #e0abab
- `app/src/components/LandingScreen.tsx` — 2 error banners → #e0abab
- `app/src/components/dashboard/DashboardScreen.tsx` — error banner → #e0abab
- `app/src/components/dashboard/DashboardSessionCard.tsx` — error status dot/text + delete hover → #e0abab
- `app/src/components/dashboard/ExperienceCard.tsx` — 2 delete button hovers → #e0abab
- `app/src/components/dashboard/EvidenceItemCard.tsx` — delete button hover → #e0abab
- `app/src/components/dashboard/SkillsCategoryCard.tsx` — 2 delete button hovers → #e0abab
- `app/src/components/dashboard/MasterResumeTab.tsx` — error banner → #e0abab
- `app/src/components/dashboard/SessionResumeModal.tsx` — error banner → #e0abab
- `app/src/components/dashboard/ResumeComparisonModal.tsx` — error banner → #e0abab
- `app/src/components/network-intelligence/CsvUploader.tsx` — error text → #e0abab
- `app/src/components/network-intelligence/TargetTitlesManager.tsx` — delete hover → #e0abab
- `app/src/components/panels/CompletionPanel.tsx` — 2 celebration animations → motion-safe:

### Changes Made — Test Alignment
- `app/src/__tests__/panels/QualityDashboardPanel.test.tsx` — 14 assertions updated: header → "Your Resume Quality Score", labels → consumer names, colors → theme hex, section titles → Phase 3 names
- `app/src/__tests__/panels/CompletionPanel.test.tsx` — 7 assertions updated: header → "Your Resume Is Ready!", "Reqs Met" → "Requirements Met", button selectors → aria-labels, "Save As Base Resume" → "Save for Future Applications"
- `app/src/__tests__/panels/panel-renderer.test.tsx` — validation message → "Still loading your resume plan..."

### Decisions Made
- purple-400 in JobMatchesList STATUS_COLORS (applied status) left as-is — no theme equivalent exists, needs design decision
- LiveResumeDocument.tsx remains out of scope (intentionally light-theme for print preview)

### Next Steps
- Run fourth full codebase audit to verify zero findings remain
- Continue audit-fix-re-audit cycle until clean

## 2026-03-05 — Session 26
**Sprint:** 24 | **Stories:** Re-Audit Theme & Accessibility Fixes (Stories 1-12 + bonus)
**Summary:** Fixed all findings from the second full codebase audit — 12 stories + 8 bonus fixes covering raw Tailwind semantic color replacements (rose/sky/amber/emerald/blue/indigo/green → theme hex), motion-safe prefixes, aria-labels, and jargon across 26 files. `tsc --noEmit` passes clean.

### Changes Made
- `app/src/components/ChatPanel.tsx` — Stories 1, 8: Replaced rose/sky/amber/emerald status dot and text colors with theme hex (#e0abab, #afc4ff, #dfc797, #b5dec2)
- `app/src/components/ChatDrawer.tsx` — Story 1: Replaced status dot colors + added motion-safe:animate-pulse
- `app/src/components/ChatMessage.tsx` — Story 8: #b8caff → #afc4ff on User icon
- `app/src/components/IntelligenceActivityFeed.tsx` — Story 8: border-blue-400/40 → border-[#afc4ff]/40
- `app/src/components/workspace/WorkspaceShell.tsx` — Story 2: Replaced emerald/amber/orange status + gate banner colors
- `app/src/components/InterviewLayout.tsx` — Story 3: Replaced emerald VictoryMoment colors → #b5dec2
- `app/src/components/panels/SectionWorkbench.tsx` — Stories 3, 4, 10: Massive replace_all of emerald/sky badge + overlay colors; added motion-safe: on approval animations
- `app/src/components/panels/OnboardingSummaryPanel.tsx` — Story 5: Confidence badge colors (emerald/amber/rose → theme hex)
- `app/src/components/panels/ResearchDashboardPanel.tsx` — Story 5: Research status tone colors (sky/amber/emerald → theme hex)
- `app/src/components/panels/QualityDashboardPanel.tsx` — Stories 6, 11: Amber badge colors + aria-label on CollapsibleSection
- `app/src/components/panels/BlueprintReviewPanel.tsx` — Story 6: Amber badge/text colors → #dfc797
- `app/src/components/panels/PositioningInterviewPanel.tsx` — Stories 7, 12: Blue/green/amber/indigo → theme hex; "Action Required" → "Select Your Answer"
- `app/src/components/panels/QuestionnairePanel.tsx` — Story 7: sky/rose badge + amber text colors → theme hex
- `app/src/components/panels/CompletionPanel.tsx` — Story 7: emerald/sky/amber colors → theme hex
- `app/src/components/panels/SectionReviewPanel.tsx` — Story 9: Confirmed aria-pressed={false} correct (TypeScript narrowing)
- `app/src/components/panels/workbench/WorkbenchProgressDots.tsx` — Story 10: animate-pulse → motion-safe:animate-pulse
- `app/src/components/LandingScreen.tsx` — Story 11: type="button" on dashboard link + toast emerald → #b5dec2
- `app/src/components/ResumePanel.tsx` — Story 11: title → aria-label on 3 export buttons
- `app/src/components/Toast.tsx` — Bonus: All 4 accent styles (red/amber/blue/emerald → theme hex)
- `app/src/components/shared/ProcessStepGuideCard.tsx` — Bonus: border-l tone colors → theme hex
- `app/src/components/PositioningProfileChoice.tsx` — Bonus: sky badge → #afc4ff
- `app/src/components/SectionsNodeSummary.tsx` — Bonus: emerald/sky bundle status → theme hex
- `app/src/components/QuestionsNodeSummary.tsx` — Bonus: rose/amber/sky/emerald badges → theme hex
- `app/src/components/panels/workbench/WorkbenchSuggestions.tsx` — Bonus: emerald-400/70 check icon → #b5dec2/70
- `app/src/components/PipelineIntakeForm.tsx` — Bonus: emerald-300/80 text → #b5dec2/80
- `app/src/components/panels/ContextPanel.tsx` — Bonus: focus-visible:ring-blue-400 → #afc4ff

### Decisions Made
- SectionReviewPanel aria-pressed={false} is correct — the Edit button is only rendered inside `mode !== 'edit'` guard, so TypeScript narrows the type and `mode === 'edit'` would be unreachable
- LiveResumeDocument.tsx intentionally uses raw Tailwind colors (light-theme document preview) — kept out of scope

### Next Steps
- Run third full codebase audit to verify zero raw Tailwind semantic colors remain
- Continue audit-fix-re-audit cycle until clean

## 2026-03-05 — Session 25
**Sprint:** 23 | **Stories:** Full Codebase Audit Fixes (Stories 1-10)
**Summary:** Fixed all findings from the 6-agent full codebase audit — 10 stories covering accessibility, WCAG compliance, copy/jargon rewrites, theme color consistency, and code quality. All critical and medium findings resolved.

### Changes Made
- `app/src/components/panels/QualityDashboardPanel.tsx` — Story 1: Replaced raw Tailwind colors (red-500, amber-500, emerald-500) with theme hex colors (#e0abab, #dfc797, #b5dec2) in priorityStyles and severityColor.
- `app/src/components/panels/workbench/WorkbenchKeywordBar.tsx` — Story 2: Fixed WCAG 1.4.1 color-only information by adding shape symbols (✓ met, ◐ partial), aria-labels, type="button", replaced yellow-400 with theme #dfc797.
- `app/src/components/panels/OnboardingSummaryPanel.tsx` — Story 3: Fixed prefers-reduced-motion breakage with motion-safe: prefix on card stagger animation.
- `app/src/hooks/usePipelineStateManager.ts` — Story 4: Fixed stale closure by adding useEffect to sync accessTokenRef with accessToken prop changes. Added useEffect import.
- `app/src/components/panels/LiveResumePanel.tsx` — Story 5/8: Added type="button" to 7 buttons, replaced title attrs with aria-labels, fixed "JD Alignment" → "Job Alignment".
- `app/src/components/panels/workbench/WorkbenchEvidenceCards.tsx` — Story 5/8: Added type="button" and aria-labels to 3 buttons, renamed "Evidence Library" → "Your Achievements".
- `app/src/components/panels/SectionReviewPanel.tsx` — Story 5: Added type="button" to quick fix chip buttons.
- `app/src/components/panels/DesignOptionsPanel.tsx` — Story 6: Added arrow key navigation (Up/Down/Left/Right) for radiogroup with focus management.
- `app/src/components/ReviewModeToolbar.tsx` — Story 7: Replaced raw Tailwind colors (emerald-400, blue-400) with theme hex (#a8d7b8, #afc4ff). Added role="img" + aria-labels to status dots.
- `app/src/components/panels/CompletionPanel.tsx` — Story 7/9: Replaced raw Tailwind colors in toneClass (red→#e0abab, amber→#dfc797, emerald→#b5dec2). Added motion-safe: prefix to stat badge animations.
- `app/src/components/panels/panel-renderer.tsx` — Story 8: Rewrote all developer-facing error messages to consumer-friendly "Still loading..." messages.
- `app/src/components/panels/ResearchDashboardPanel.tsx` — Story 8: "Research Dashboard" → "Role Research", "Research running in background" → "Researching in the background", "JD Requirements" → "Job Requirements".
- `app/src/components/ChatPanel.tsx` — Story 8: "Current Work Product" → "Current View", "Connected (idle)" → "Ready".
- `app/src/components/panels/workbench/WorkbenchActionChips.tsx` — Story 8: "ATS Keyword"/"Embed Keywords" → "Add Key Terms", removed "ATS" from instructions.
- `app/src/components/panels/GapAnalysisPanel.tsx` — Story 8: "Strong" → "Strong Match", "Partial" → "Partial Match", "Gap" → "Needs Attention".
- `app/src/components/panels/SectionWorkbench.tsx` — Story 10: Merged two duplicate useEffects into single effect with [section, content, reviewToken] deps.

### Decisions Made
- Merged Stories 8 and 9 since the remaining copy jargon from Story 9 was addressed as part of Stories 7-8 edits
- useSession.ts "localStorage logging" finding from audit was a false positive — no console.log exists
- process-contract.ts default cases are intentional fallbacks, not code quality issues

### Next Steps
- Re-audit per user request: repeat full codebase audit until zero findings remain

## 2026-03-05 — Session 24
**Sprint:** 22 | **Stories:** Accessibility & Dead Code Cleanup (Stories 1-6)
**Summary:** WCAG AA compliance pass — keyboard navigation, focus management, color independence. Plus dead code removal from PipelineIntakeForm.

### Changes Made
- `app/src/components/workspace/WorkspaceShell.tsx` — Story 1: Added skip-to-content link (sr-only + focus:not-sr-only), added id="main-content" to main element. Story 2: Added onFocusCapture/onBlurCapture handlers to sidebar for keyboard expand/collapse. Story 4: Status dots now have distinct shapes per status (filled circle=complete, rounded square=blocked, ring=in_progress, diamond=stale, hollow circle=ready, dash=locked) for WCAG 1.4.1 color independence.
- `app/src/components/ChatDrawer.tsx` — Story 3: Added focus trap with top/bottom sentinel divs that redirect focus back into the drawer. Changed role="complementary" to role="dialog". Added drawerRef for querying focusable elements.
- `app/src/components/panels/SectionWorkbench.tsx` — Story 5: Rewrote ~20 jargon labels in bundled review section. "Bundled Review"→"Grouped Sections", "Action required: this section is in the review set"→"Please review this section", "What To Do"→"Your Next Step", "Current bundle"→"Current group", "Review set progress"→"Your progress", "auto-approved by mode"→"auto-approved", "Approve Remaining Review Set"→"Approve All Remaining", and more.
- `app/src/components/PipelineIntakeForm.tsx` — Story 6: Removed ~140 lines of dead code: defaultEvidenceTargetForMode function, 5 dead state variables (workflowMode, minimumEvidenceTarget, minimumEvidenceTargetTouched, resumePriority, seniorityDelta), dead useEffect, and entire {false && (...)} Advanced Options block. Hardcoded defaults in handleSubmit. Fixed remaining "JD" abbreviations.

### Decisions Made
- Focus trap uses sentinel div pattern (tabIndex={0} + onFocus redirect) rather than a library — minimal, no new dependencies
- Status dot shapes chosen for maximum visual distinctness at 6px: circle, square, ring, diamond, hollow, dash
- PipelineIntakeForm dead code fully removed rather than commented — git has history per CLAUDE.md rules

### Next Steps
- Sprint 22 complete — plan Sprint 23
- Consider Playwright E2E test updates for renamed labels (out of scope this sprint)

## 2026-03-05 — Session 23
**Sprint:** 21 | **Stories:** UX Overhaul — "Margaret Can Understand" (Stories 1-19)
**Summary:** Transformed the entire frontend from a developer dashboard into a premium consultation experience for non-technical executives. Four phases: narrative + de-jargon, layout simplification, copy rewrite + victory moments, and polish + progressive disclosure. Followed by a comprehensive 6-agent UI/UX audit that found 16 Critical, 48 Medium, 53 Low issues — applied fixes for all Critical and most Medium issues. 25 files modified, 3 orphaned files deleted, frontend-only (no backend changes).

### Changes Made — Phase 1: Narrative + De-Jargon
- `app/src/components/InterviewLayout.tsx` — Removed InterviewStepper and DraftReadinessBadge. Added NarrativeStatusLine (phase-mapped warm messages), VictoryMoment component (emerald-accented auto-dismiss), and welcome narrative during processing dead zones.
- `app/src/components/ModeTransition.tsx` — Added review→edit transition, expanded interview→review to warm bridging copy, increased display duration from 300ms to 1200ms.
- `app/src/components/panels/QuestionnairePanel.tsx` — Renamed batch labels to consumer language ("Getting to Know You", "Closing the Gaps"), removed jargon pills, renamed buttons ("Submit Answers", "Next"), replaced "Draft Now" with "I'm Ready — Start Writing" + confirmation dialog.
- `app/src/components/GlassButton.tsx` — Changed disabled:opacity-45 to disabled:opacity-30 disabled:border-dashed disabled:shadow-none for better visibility on dark backgrounds.
- `app/src/components/IntelligenceActivityFeed.tsx` — Added CONSUMER_MESSAGE_MAP (15 regex→replacement pairs) translating developer log messages to friendly language.
- `app/src/constants/pipeline-stages.ts` — Renamed all stage labels to consumer language.
- `app/src/constants/phases.ts` — Rewrote all PHASE_LABELS from "Step N: Technical Term" to plain language.

### Changes Made — Phase 2: Layout Simplification
- `app/src/components/workspace/WorkspaceShell.tsx` — Removed back/forward nav arrows and props, removed footerRail prop, simplified status badges (complete→"✓", blocked→"Your turn").
- `app/src/components/CoachScreen.tsx` — Removed developer sections from ContextPanel (draft readiness, WorkflowReplanBanner, BenchmarkInspectorCard, WorkflowPreferencesCard, WorkflowStatsRail). Rewrote contextPanelTitle mapping to consumer language.
- `app/src/components/ChatDrawer.tsx` — Moved from bottom-left to bottom-right, increased button to h-12, added "Need Help?" text label.

### Changes Made — Phase 3: Copy Rewrite + Victory Moments
- `app/src/constants/process-contract.ts` — Added victoryMessage field to ProcessStepContract. Rewrote all 7 contracts in warm "we" language with victory messages.
- `app/src/types/workflow.ts` — Renamed all WORKFLOW_NODES labels to consumer language.
- `app/src/components/panels/OnboardingSummaryPanel.tsx` — Header: "Resume Snapshot" → "Here's What We Found"
- `app/src/components/panels/GapAnalysisPanel.tsx` — Header: "Gap Analysis" → "How Your Experience Matches"
- `app/src/components/panels/SectionReviewPanel.tsx` — Header: "Section Review" → "Review This Section"
- `app/src/components/panels/QualityDashboardPanel.tsx` — Header: "Quality Dashboard" → "Your Resume Quality Score"
- `app/src/components/panels/BlueprintReviewPanel.tsx` — Header: "Resume Blueprint" → "Your Resume Plan"

### Changes Made — Phase 4: Polish + Progressive Disclosure
- `app/src/components/PipelineIntakeForm.tsx` — "New Resume Session" → "Let's Build Your Resume", "Start Resume Session" → "Let's Get Started", simplified JD placeholder, hid Advanced Options.
- `app/src/components/panels/CompletionPanel.tsx` — "Session Complete" → "Your Resume Is Ready!", added ATS victory message, removed developer diagnostics, added "What To Do Next" section.
- `app/src/components/panels/SectionWorkbench.tsx` — Added contextual micro-help text, progressive disclosure for power-user bundle options.
- `app/src/components/ReviewModeToolbar.tsx` — Consumer copy for status messages.

### Changes Made — Phase 5: UI/UX Audit (Story 19)
- `app/src/components/panels/QualityDashboardPanel.tsx` — Fixed raw Tailwind colors to theme hex, rewrote 9 jargon labels (Evidence Integrity→Proof Strength, Blueprint Compliance→Plan Alignment, ATS Findings→Hiring System Findings, etc.)
- `app/src/components/panels/CompletionPanel.tsx` — "ATS validation" → friendly language, "Reqs Met" → "Requirements Met", "Save As New Default Base" → "Save as My Main Resume", added aria-labels to export buttons.
- `app/src/components/InterviewLayout.tsx` — Added aria-live/role="alert" to dynamic elements, increased victory duration 1.5s→3s, removed unused draftReadiness prop, added phase narratives for section_review/revision/positioning_profile_choice.
- `app/src/components/panels/BlueprintReviewPanel.tsx` — "evidence pts" → "key achievements", "keywords targeted" → "relevant terms", transparency disclaimer rewritten.
- `app/src/components/panels/GapAnalysisPanel.tsx` — "Requirements Addressed" → "How Well You Match", added role="progressbar" with aria attributes, rewrote "misclassified" callout.
- `app/src/components/CoachScreen.tsx` — Rewrote benchmark/replan toast jargon, added focus-visible ring to floating button, removed draftReadiness prop pass.
- `app/src/components/shared/ProcessStepGuideCard.tsx` — "System does" → "What we're doing", "You do" → "What you can do".
- `app/src/constants/pipeline-stages.ts` — Fixed revision mapping inconsistency, unified labels with warmer "Your" variants.
- `app/src/constants/phases.ts` — Added missing positioning_profile_choice, fixed section_review tone.
- `app/src/constants/process-contract.ts` — Polished quality_review victory message.
- `app/src/components/panels/OnboardingSummaryPanel.tsx` — Replaced "parse" jargon, "Initial Strengths" → "Your Standout Strengths".
- `app/src/components/ChatDrawer.tsx` — Status labels rewritten to consumer language.
- `app/src/components/workspace/WorkspaceShell.tsx` — "Action waiting" → "Your input is needed".
- `app/src/components/GlassButton.tsx` — Added aria-busy when loading.
- `app/src/components/panels/SectionReviewPanel.tsx` — Added aria-pressed to Edit button.
- `app/src/components/IntelligenceActivityFeed.tsx` — Added role="log" + aria-live, changed fallback to hide unmatched dev messages.
- `app/src/components/ModeTransition.tsx` — Fixed JS/CSS timer mismatch.
- `app/src/components/PipelineIntakeForm.tsx` — Fixed "JD" abbreviation in error message.

### Deleted
- `e2e/tests/manual-takeover.spec.ts` — Removed temporary test script.
- `app/src/components/WorkflowStatsRail.tsx` — Orphaned (218 lines), zero imports.
- `app/src/components/BenchmarkInspectorCard.tsx` — Orphaned (399 lines), zero imports.
- `app/src/components/CoachScreenBanners.tsx` — Orphaned (entire file), zero imports.

### Decisions Made
- All changes are frontend presentation layer only — no backend, SSE, or DB changes.
- Warm "we" language throughout, targeting non-technical executive persona ("Margaret").
- VictoryMoment auto-dismisses after 3s between phase transitions (increased from 1.5s for readability).
- Advanced pipeline options hidden rather than removed to preserve power-user access path.
- Unmatched developer log messages now show "Working on your resume..." instead of raw text.
- `revision` phase consistently maps to `section_writing` across all three mapping files.

### Known Issues
- Playwright E2E test selectors may need updating for renamed labels (backlog).
- WorkspaceShell sidebar lacks keyboard accessibility (needs onFocus/onBlur).
- ChatDrawer lacks focus trap when expanded.
- SectionWorkbench bundled review copy still uses some system-state language (needs design decision).
- Color-only status dots need shape/icon differentiation per WCAG 1.4.1.

### Next Steps
- Commit all changes and merge to main.
- Update Playwright test selectors for renamed labels.
- Plan Sprint 22: Accessibility deep dive (keyboard nav, focus traps, skip links).

## 2026-03-04 — Session 22
**Sprint:** 20 | **Story:** Progressive Disclosure UI (Stories 1-8)
**Summary:** Implemented 3-mode progressive disclosure UI that shows the right interface for each pipeline phase: Interview Mode (centered panel, no document), Review Mode (document with inline approve/edit/reject controls), and Edit Mode (full inline editing). Replaced static document-always layout with mode-conditional rendering driven by a new `useUIMode` hook.

### Changes Made
- `app/src/hooks/useUIMode.ts` — **Created.** Maps pipeline phases to `UIMode` enum (`interview`/`review`/`edit`). Includes 500ms debounce for fast_draft to prevent interview→review flash. Derives mode from snapshot phase when viewing historical nodes.
- `app/src/types/workflow.ts` — Re-exports `UIMode` type for convenience.
- `app/src/components/InterviewLayout.tsx` — **Created.** Full-height centered panel container for interview phases. Includes 5-step progress stepper (intake→architect), renders `SafePanelContent` in a glass card, shows positioning profile choice and draft readiness inline.
- `app/src/components/ReviewModeToolbar.tsx` — **Created.** Slim toolbar above document in review mode showing section dots (completed/active/pending) and current section status label.
- `app/src/components/ModeTransition.tsx` — **Created.** Animated wrapper for mode transitions. Interview→review shows "Your resume is taking shape..." interstitial. Review→edit uses simple crossfade. Respects `prefers-reduced-motion`. Properly cleans up timeouts on unmount and mode changes.
- `app/src/components/CoachScreen.tsx` — **Major modification.** Replaced static `mainPanel` with mode-conditional rendering: InterviewLayout for interview phases, document+ContextPanel for review/edit. Added `useUIMode` hook call. Guarded auto-open logic to skip in interview mode. Added review mode handlers (`handleApproveSection`, `handleQuickFixSection`) that wire inline review bar to pipeline responses. Passes new review/edit props to LiveResumeDocument.
- `app/src/components/panels/LiveResumeDocument.tsx` — Added `InlineReviewBar` sub-component (approve/quickfix/edit buttons, light theme, Cmd+Enter keyboard shortcut scoped to avoid text inputs). Added `QuickFixPopover` with 6 predefined chips + custom textarea. Added `EditModeHint` that auto-dismisses after 5s. New props: `reviewMode`, `reviewSection`, `reviewToken`, `onApproveSection`, `onQuickFixSection`, `editModeHint`.
- `app/src/index.css` — Added keyframes: `mode-fade-out`, `mode-fade-in`, `edit-hint-fade` (5s auto-dismiss).
- `app/src/__tests__/useUIMode.test.ts` — **Created.** 17 unit tests covering all phase→mode mappings, null/undefined handling, unknown phase fallback.

### Decisions Made
- Interview phases render in a centered InterviewLayout instead of showing an empty document shell — users see focused question flow without distraction.
- Review mode adds inline approve/quickfix/edit controls directly on the active section in the document, reducing reliance on the slide-over ContextPanel.
- Mode transitions use lightweight CSS keyframes rather than a heavy animation library.
- `useUIMode` debounces the interview→review transition by 500ms to prevent visual flash during fast_draft mode where phases fly through sub-second.

### QA Fixes Applied
- Fixed ModeTransition timeout cleanup (memory leak on unmount)
- Fixed stale children closure in ModeTransition by using ref
- Fixed prevModeRef timing bug in transition message lookup
- Removed unused `useMemo` import from InterviewLayout
- Scoped Cmd+Enter keyboard shortcut to skip INPUT/TEXTAREA/contentEditable elements
- Made InlineReviewBar Edit button functional (programmatically clicks section edit button)

### Known Issues
- `autoOpenGuardRef` in CoachScreen is `null` on first render — self-corrects via subsequent effect, but may cause brief context panel flash on initial load in interview mode
- The 500ms debounce in `useUIMode` means InterviewLayout briefly persists while the pipeline is already in section_writing — InterviewLayout renders with no panel data during this window

### Next Steps
- Manual E2E verification across all 3 modes
- Consider adding Playwright tests for mode transitions

## 2026-03-03 — Session 21
**Sprint:** 19 | **Story:** Quality-First Model Strategy — All Phases (Stories 1-8, 10)
**Summary:** Upgraded all three agent loops from Scout 17B (Preview) to llama-3.3-70b-versatile (GA) for reasoning, adjusted timeouts for Groq latency, documented MID tier decision, refined all three agent prompts for goal-oriented autonomy, raised history compaction thresholds, calibrated E2E tests for Groq's sub-second inference, and updated all project documentation to reflect Groq as primary provider.

### Changes Made
- `server/src/lib/llm.ts` — Changed `GROQ_MODEL_ORCHESTRATOR` default from `meta-llama/llama-4-scout-17b-16e-instruct` to `llama-3.3-70b-versatile`. Updated `MODEL_ORCHESTRATOR_COMPLEX` to map to `GROQ_MODEL_ORCHESTRATOR` (now same as `MODEL_ORCHESTRATOR` on Groq). Added 3 Groq models to pricing table (Scout free tier, DeepSeek R1 70B, Mistral Saba 24B).
- `server/src/agents/strategist/agent.ts` — Updated model comment to reflect 70B. Reduced `round_timeout_ms` from 180s→60s, `overall_timeout_ms` from 900s→300s.
- `server/src/agents/craftsman/agent.ts` — Changed import and model from `MODEL_ORCHESTRATOR_COMPLEX` to `MODEL_ORCHESTRATOR`. Reduced `round_timeout_ms` from 180s→60s, `overall_timeout_ms` from 900s→600s.
- `server/src/agents/producer/agent.ts` — Changed import and model from `MODEL_ORCHESTRATOR_COMPLEX` to `MODEL_ORCHESTRATOR`. Reduced `round_timeout_ms` from 120s→60s, `overall_timeout_ms` from 600s→300s.
- `server/src/lib/llm-provider.ts` — Increased GroqProvider `chatTimeoutMs` from 30s→45s (70B may take slightly longer than Scout per request).
- `docs/DECISIONS.md` — Added ADR-028 (Model Tier Restructure — 70B for Agent Orchestration) and ADR-029 (MID Tier — Keep Scout 17B for Non-Orchestration Tasks).

### Model Tier Map (After Phase 1)
| Tier | Model | Price (in/out/M) | Used For |
|------|-------|-------------------|----------|
| PRIMARY | llama-3.3-70b-versatile | $0.59/$0.79 | Section writing, adversarial review |
| MID | llama-4-scout-17b | $0.11/$0.34 | Self-review, gap analysis, benchmarking |
| ORCHESTRATOR | llama-3.3-70b-versatile | $0.59/$0.79 | Agent loop reasoning (upgraded from Scout) |
| LIGHT | llama-3.1-8b-instant | $0.05/$0.08 | Text extraction, JD analysis |

### Decisions Made
- **70B for all agent loops (ADR-028):** The agent brain deciding tool sequencing should be as capable as the hands writing content. At ~$0.23/pipeline, still cheaper than Z.AI's ~$0.26.
- **Keep Scout 17B for MID (ADR-029):** Scout's tool-calling quirks don't affect MID tasks (self_review, classify_fit, build_benchmark). Qwen3 32B is fallback if quality degrades.
- **Reduced timeouts:** Groq 70B responds in <5s typically. Old Z.AI-era timeouts (3-15 min) were unnecessarily generous.

### Phase 2 Changes (Prompt Refinement)
- `server/src/agents/strategist/prompts.ts` — Replaced rigid 6-step numbered workflow with goal-oriented guidance. Phases kept as recommended workflow, not mandatory. Added "Ethics — Non-Negotiable" consolidated section. Removed scattered "never fabricate" warnings. Added explicit permission: "You may skip or reorder phases when the evidence already supports it."
- `server/src/agents/craftsman/prompts.ts` — Replaced forced waterfall (write→self-review→anti-patterns→keywords→revise→evidence→present) with discretionary quality checks. Strong sections can go directly to present_to_user. Complex sections still get full review. Added: "You are a world-class resume writer. Trust your craft." check_evidence_integrity still recommended for experience/accomplishment sections.
- `server/src/agents/producer/prompts.ts` — Added decision authority: Producer resolves minor formatting/ATS issues directly without routing to Craftsman. Added ATS vs authenticity tradeoff: "favor authenticity if the candidate's language is specific and distinctive." Improved template selection with criteria (industry match, seniority level, career span, content density).

### Phase 3 Changes (Infrastructure & Testing)
- `server/src/agents/runtime/agent-loop.ts` — Raised `MAX_HISTORY_MESSAGES` from 30→60, `KEEP_RECENT_MESSAGES` from 20→40 (70B has 131K context, compaction should rarely trigger). Upgraded parameter coercion logging from `info`→`warn` for monitoring. Updated comments noting 70B should reduce coercion frequency.
- `server/src/lib/llm-provider.ts` — Added monitoring note to `recoverFromToolValidation()` comment: with 70B as orchestrator, recovery should trigger rarely.
- `e2e/helpers/pipeline-responder.ts` — Calibrated all timeouts for Groq: POLL_INTERVAL 4s→2s, MAX_WAIT 55min→12min, STAGE_TIMEOUT 10min→3min, POST_RESPONSE_DELAY 5s→3s, section/questionnaire advance timeouts 5min→2min, poll intervals 5s→3s.
- `e2e/tests/full-pipeline.spec.ts` — Reduced first LLM response timeout from 5min→60s. Added pipeline completion time assertion: `expect(pipelineDurationMs).toBeLessThan(5 * 60_000)`.
- `playwright.config.ts` — Reduced full-pipeline project timeout from 60min→15min.

### Known Issues
- Resume writing quality with 70B orchestrator + refined prompts needs validation against previous runs
- Workaround code (tool validation recovery, parameter coercion) kept as safety nets — monitor warn-level logs across 5+ pipeline runs to verify 70B reduces trigger frequency
- `MODEL_ORCHESTRATOR_COMPLEX` export kept for backward compatibility but is now identical to `MODEL_ORCHESTRATOR` on Groq
- Craftsman discretion on quality checks may reduce quality for edge cases — monitor first 3-5 pipeline runs
- E2E test timing assertion (<5 min) may need adjustment if pipeline includes many user gates

### Phase 4 Changes (Documentation)
- `CLAUDE.md` — Updated Technical Overview: Groq is primary provider. Updated env vars section with `GROQ_API_KEY` and `GROQ_MODEL_*` overrides. Replaced single Z.AI model routing table with dual Groq/Z.AI tables. Updated LLM Provider section to describe GroqProvider. Updated Known Issues: replaced Z.AI latency/coercion with Groq-specific workaround monitoring notes. Updated Testing section with current test counts and Groq timing.
- `docs/ARCHITECTURE.md` — Updated tech stack table: Groq primary, Z.AI+Anthropic fallback, E2E ~2-3 min. Replaced single model routing table with dual Groq/Z.AI tables with ADR references. Updated LLM Provider section to describe GroqProvider (timeouts, parallel tool calls, recovery). Added Agent Loop Resilience subsection documenting history compaction, parameter coercion, and JSON comment stripping.

### Phase 4 Changes (Quality Validation — Story 9)
- `e2e/helpers/pipeline-capture.ts` — NEW: DOM scraping utilities for quality validation. `captureQualityScores(page)` extracts primary scores from ScoreRing `aria-label` attributes and secondary metrics from label/value text rows. `captureSectionContent(page)` extracts section title (h2/h3) and content lines (p.text-sm elements). All using `page.evaluate()` to bypass zero-height panel layout.
- `e2e/fixtures/quality-validation-data.ts` — NEW: 2 additional resume/JD fixtures for quality validation — Marketing VP→CMO (Meridian Consumer Brands, $450M CPG) and Operations Director→VP (Atlas Manufacturing Group, $320M manufacturer). Exports `QUALITY_FIXTURES` array with `QualityFixture` interface.
- `e2e/tests/quality-validation.spec.ts` — NEW: Serial test suite running 3 pipelines (cloud-director, marketing-vp, operations-director), each with capture. Asserts: pipeline <5 min, primary scores ≥60%, secondary scores ≥50%, sections captured. Saves per-fixture JSON to `test-results/quality-validation/`. Summary test logs all results.
- `e2e/helpers/pipeline-responder.ts` — Added optional `PipelineCaptureData` parameter to `runPipelineToCompletion()`. When provided: captures quality scores on `quality_dashboard` detection, captures section content before each `section_review` approval. Backward compatible — existing tests pass no capture object.
- `playwright.config.ts` — Added `quality-validation` project (45 min timeout, video+trace). Excluded from default `chromium` project.

### Next Steps
- Run `npx playwright test --project=quality-validation` to execute quality validation
- Review captured JSON outputs in `test-results/quality-validation/`
- Compare Groq 70B output quality against previous Scout-orchestrated runs
- Monitor warn-level logs for workaround trigger frequency across pipeline runs

## 2026-03-03 — Session 20
**Sprint:** 19 | **Story:** Groq Pipeline Hardening — Full E2E on Groq
**Summary:** Fixed 4 Groq-specific tool calling failures and achieved a full end-to-end pipeline on Groq in ~1m42s (vs 15-30 min on Z.AI). All three agent phases (Strategist, Craftsman, Producer) now work on Groq.

### Changes Made
- `server/src/lib/llm.ts` — Changed `GROQ_MODEL_ORCHESTRATOR` from 8B (`llama-3.1-8b-instant`) to Scout (`meta-llama/llama-4-scout-17b-16e-instruct`) — 8B is unreliable for tool calling on Groq (generates XML format, stringifies parameters). Added `MODEL_ORCHESTRATOR_COMPLEX` constant that maps to Scout (MID) on Groq, flashx (ORCHESTRATOR) on Z.AI — for agent loops with complex nested tool schemas.
- `server/src/lib/llm-provider.ts` — Added `disableParallelToolCalls` config option to `ZAIConfig`, sends `parallel_tool_calls: false` and `strict: false` on tool definitions for Groq. Added `recoverFromToolValidation()` method that extracts tool calls from Groq's `tool_use_failed` 400 responses — handles both JSON arrays and XML-format (`<function=name>{params}</function>`) failed generations. Added `extractToolCallsFromTruncatedArray()` for recovering first valid tool call from output-truncated multi-tool arrays. Recovery limits to first tool call to enforce sequential execution semantics.
- `server/src/agents/runtime/agent-loop.ts` — Added `coerceToolParameters()` function that defensively parses stringified JSON parameters back to objects/arrays based on the tool's input_schema. Applied to both sequential and parallel tool execution paths.
- `server/src/agents/craftsman/tools.ts` — Fixed `evidence_sources` schema in `write_section`: removed `type: 'object'` constraint, added normalize logic to convert array evidence to object map in execute function. Scout model sends arrays instead of objects.
- `server/src/agents/craftsman/agent.ts` — Changed model from `MODEL_ORCHESTRATOR` to `MODEL_ORCHESTRATOR_COMPLEX` for reliable tool calling with complex nested section schemas on Groq.
- `server/src/agents/producer/agent.ts` — Changed model to `MODEL_ORCHESTRATOR_COMPLEX`. Increased `max_rounds` from 8 to 15 (sequential tool calling on Groq needs more rounds). Increased `loop_max_tokens` from 2048 to 8192 (adversarial_review passes entire assembled resume as parameter).
- `server/src/agents/producer/prompts.ts` — Removed "Batch independent checks in the same round" instruction from Producer prompt. Changed to "Call each tool individually — the runtime handles parallel execution when safe." This prevents Groq models from generating multi-tool responses that exceed output limits.
- `server/src/lib/json-repair.ts` — Added `stripJsonComments()` function to strip `//` and `/* */` comments from LLM-generated JSON before parsing. Llama models sometimes add comments to JSON output.

### Decisions Made
- **8B → Scout for ORCHESTRATOR on Groq**: `llama-3.1-8b-instant` generates XML-style `<function=name>{params}</function>` instead of proper tool_calls format ~20% of the time. This is unfixable at the prompt level. Scout handles tool schemas correctly. 8B kept for LIGHT tier (non-tool-calling tasks).
- **Recovery-first strategy for tool validation**: Rather than trying to prevent all Groq validation errors, we recover from them. `recoverFromToolValidation()` extracts the first tool call from Groq's `failed_generation` field, supporting both JSON and XML formats.
- **First-tool-only recovery**: When recovering from truncated multi-tool outputs, take only the first complete tool call. The model will call remaining tools in subsequent rounds. This is safer than trying to parse incomplete JSON.
- **Prompt-level sequential enforcement**: Telling the model to "call each tool individually" is more reliable than relying on Groq's `parallel_tool_calls: false` parameter, which the model doesn't always respect.

### Pipeline Performance (Groq vs Z.AI)
| Phase | Z.AI | Groq |
|-------|------|------|
| Strategist (intake + interview) | 5-15 min | ~32s |
| Craftsman (3 sections + review) | 5-10 min | ~39s |
| Producer (quality review) | 3-5 min | ~31s |
| **Total** | **15-30 min** | **~1m 42s** |

### Known Issues
- Groq `llm_provider` column in DB still shows 'zai' (cosmetic — the `LLM_PROVIDER` env var controls actual provider)
- Usage tracking shows 0 tokens for Groq pipeline (flush timing issue — usage accumulator may not persist before session cleanup)
- Resume writing quality with llama-3.3-70b-versatile needs validation against Z.AI glm-4.7 baseline

### Next Steps
- Run 3-5 additional pipelines to validate stability
- A/B compare resume writing quality (Groq vs Z.AI)
- Fix usage tracking persistence for Groq (shorter flush intervals)
- Consider reducing heartbeat/stale thresholds for Groq's faster pipelines

## 2026-03-02 — Session 19
**Sprint:** 19 | **Story:** Add Groq LLM Provider
**Summary:** Added Groq as an alternative LLM provider to reduce pipeline latency from 15-30 min to an estimated 1-3 min, at ~54% lower cost.

### Changes Made
- `server/src/lib/llm-provider.ts` — Extended `ZAIConfig` with optional `providerName`, `chatTimeoutMs`, `streamTimeoutMs` fields (backward compatible). Made `ZAIProvider.name` configurable via constructor. Replaced hardcoded timeouts (180s/300s) with instance fields. Added `GroqProvider` class extending `ZAIProvider` with 30s/60s timeouts and Groq base URL.
- `server/src/lib/llm.ts` — Added Groq model constants (`GROQ_MODEL_PRIMARY`, etc.) with env var overrides. Made `MODEL_PRIMARY/MID/ORCHESTRATOR/LIGHT` exports provider-aware via `ACTIVE_PROVIDER` detection. Added Groq model pricing (5 models). Updated `createProvider()` factory to support `LLM_PROVIDER=groq`. Updated `getDefaultModel()` to handle Groq.
- `docs/DECISIONS.md` — Added ADR-027: Groq as Alternative LLM Provider for Latency Reduction

### Decisions Made
- ADR-027: Groq over SiliconFlow — proven LPU infrastructure, deterministic latency, OpenAI-compatible API
- Default Groq model mapping: PRIMARY → llama-3.3-70b-versatile (production), MID → llama-4-scout (preview), ORCHESTRATOR/LIGHT → llama-3.1-8b-instant (production)
- Extended ZAIProvider rather than duplicating ~200 lines — configurable timeouts via constructor is a backward-compatible change, not a refactoring

### Known Issues
- Llama 4 Scout is in "Preview" status on Groq — may have availability limits
- Llama 4 Maverick not currently listed in Groq production models (pricing in MODEL_PRICING for reference)
- Resume writing quality with llama-3.3-70b-versatile needs validation against Z.AI glm-4.7 baseline
- Groq has rate limits that may affect high-volume usage (check console.groq.com for current limits)

### Next Steps
- Set `LLM_PROVIDER=groq` and `GROQ_API_KEY=<key>` in `server/.env` to activate
- Run 3-5 full pipelines comparing Groq output quality vs Z.AI baseline
- If 70B writing quality is insufficient, try `GROQ_MODEL_PRIMARY=meta-llama/llama-4-maverick-17b-128e-instruct` or `GROQ_MODEL_PRIMARY=qwen/qwen3-32b`
- Consider reducing heartbeat interval and stale pipeline thresholds for faster Groq pipelines

## 2026-03-02 — Session 18
**Sprint:** 18 | **Story:** Cover Letter Frontend + Tech Debt
**Summary:** Delivered a complete cover letter frontend connecting to the existing 2-agent backend pipeline, cleaned up 2 tech debt items.

### Changes Made
- `app/src/components/ChatPanel.tsx` — Removed orphaned `runtimeMetrics` prop from interface and destructuring
- `app/src/components/ChatDrawer.tsx` — Removed orphaned `runtimeMetrics` prop from interface, destructuring, and ChatPanel pass-through
- `app/src/components/WorkflowStatsRail.tsx` — Removed orphaned `runtimeMetrics` prop from interface and destructuring
- `app/src/components/CoachScreen.tsx` — Removed `runtimeMetricsSummary` variable and 3 `runtimeMetrics` prop pass-throughs
- `app/src/components/panels/SectionWorkbench.tsx` — Fixed `hidden xs:inline` to `hidden sm:inline` (xs: not a valid Tailwind breakpoint)
- `app/src/types/platform.ts` — Changed cover letter status from `coming_soon` to `active`, route from `/tools/cover-letter` to `/cover-letter`
- `app/src/App.tsx` — Added `'cover-letter'` to View type, URL routing (mount + popstate + navigateTo), CoverLetterScreen import and render block, ToolsScreen onNavigate pass-through for `/cover-letter`
- `app/src/components/cover-letter/CoverLetterIntakeForm.tsx` — New component: 3-field intake form (resume_text min 50, job_description min 1, company_name min 1) with validation, glass morphism styling
- `app/src/components/cover-letter/CoverLetterScreen.tsx` — New component (~180 lines): internal state machine (intake/running/complete/error), activity feed with graduated opacity, letter display with quality badge, PDF + text export buttons, "Write Another" flow
- `app/src/hooks/useCoverLetter.ts` — New hook (~220 lines): startPipeline (POST + SSE connect), handles 6 CoverLetterSSEEvent types, reconnect with exponential backoff (max 3), AbortController cleanup, reset for re-use
- `app/src/lib/export-cover-letter.ts` — New module: `downloadCoverLetterAsText()` and `exportCoverLetterPdf()` using existing buildResumeFilename + jsPDF (Helvetica, 54pt margins)
- `server/src/lib/feature-flags.ts` — Updated FF_COVER_LETTER comment to note frontend availability
- `docs/DECISIONS.md` — Added ADR-024 (own screen), ADR-025 (new hook), ADR-026 (cover-letter view)

### Decisions Made
- ADR-024: Own CoverLetterScreen rather than reusing CoachScreen — cover letter is a straight-through flow with no gates, CoachScreen's 728-line complexity is unnecessary
- ADR-025: New useCoverLetter hook rather than configurable useSession — useSession has 13 resume-specific operations, cover letter needs only 3
- ADR-026: cover-letter as its own View/URL rather than a /tools/* sub-route — consistent with resume routing pattern

### Known Issues
- FF_COVER_LETTER must be set to `true` in `server/.env` for the backend routes to be active
- DOCX export not implemented (backlogged)
- Cover letter sessions not shown in dashboard history

### Next Steps
- Sprint 18 retrospective
- Enable FF_COVER_LETTER in production when ready
- Backlog: cover letter DOCX export, dashboard integration

## 2026-03-02 — Session 17
**Sprint:** 17 | **Story:** Fix 9 Failing E2E Tests
**Summary:** Fixed 9 E2E test failures across 3 files caused by ambiguous selectors, outdated text assertions, and a broken Supabase query in the dashboard test.

### Changes Made
- `e2e/tests/workbench-fallback.spec.ts` — `getByText('Refine')` → `getByText('Refine', { exact: true })` on 2 assertions. The non-exact match resolved to 3 elements (ProcessStepGuideCard body, ActionChips label, and footer button).
- `e2e/tests/workbench-suggestions.spec.ts` — 8 selector fixes: `Looks Good` → `Next Section` (hidden span via `xs:inline`), `Bundled Review` + `Current bundle: Headline` → `.first()` (duplicate in sidebar + main), `Approve Current Bundle (Headline)` → `Finish Headline Bundle` (button text changed), `Evidence 5/5` → `5 evidence items` and `Coverage 74% / 65%` → `74% / 65% coverage` (format changed), `Regenerating` → exact match (matched in status + body), `Rebuild required` → `.first()` (matched across 6 stale nodes).
- `e2e/tests/dashboard.spec.ts` — Added `getAuthUserId()` to extract user ID from Playwright auth state (`.auth/user.json`). Removed `company_name` and `job_title` from Supabase REST query — those columns don't exist on `coach_sessions`, causing a silent 400 error that made `fetchTestSessions()` return 0 sessions.

### Decisions Made
- Preferred `.first()` over more specific container-scoped selectors where the first match is always the correct one — simpler and less brittle
- Used `{ exact: true }` for single-word labels that appear as substrings in longer text

### Known Issues
- None — all 38 chromium E2E tests passing

### Next Steps
- Sprint 17 retrospective

## 2026-03-02 — Session 16
**Sprint:** 17 | **Story:** E2E Tests — Chat Drawer + Full Pipeline Fix
**Summary:** Fixed broken full-pipeline E2E selector (textarea inside collapsed ChatDrawer) and added 5 new mocked E2E tests for the ChatDrawer component.

### Changes Made
- `e2e/tests/full-pipeline.spec.ts` — Replaced `getByPlaceholder(/Type a message/i)` visibility check with `button[aria-expanded]` locator. The textarea is now inside the collapsed ChatDrawer (0fr grid row) and not visible to Playwright; the toggle bar button is always rendered at 36px.
- `e2e/tests/chat-drawer.spec.ts` — New test file (5 tests). Covers: toggle bar visible and starts collapsed, click expand/collapse cycle, chat input visible when expanded, status text displayed in toggle bar, chevron icon present. Uses mocked SSE via `navigateToWorkbench`.
- `e2e/fixtures/mock-sse.ts` — Added `assistantMessageEvent()` and `transparencyEvent()` factory functions for future test use.

### Decisions Made
- Used `button[aria-expanded]` as the coach-screen-loaded signal — always visible regardless of drawer state, unique on the page at that pipeline stage
- Replaced the planned auto-expand test with status text and chevron tests — SSE events arrive synchronously via fetch override before React mount, so `prevMessagesLenRef` already matches and auto-expand doesn't fire in mocked mode
- Used `textarea` locator instead of placeholder match for the expanded-drawer test — the active section gate changes the placeholder to "Use the panel above to continue"

### Known Issues
- 9 pre-existing E2E failures in dashboard, workbench-fallback, and workbench-suggestions tests (fixed in Session 17)

### Next Steps
- Sprint 17 retrospective

## 2026-03-02 — Session 15
**Sprint:** 17 | **Story:** Kill Right Pane — 2-Column Layout + Bottom Chat Drawer
**Summary:** Removed the 430px right side panel and replaced with a collapsible bottom ChatDrawer, giving the main workspace ~430px more width on desktop.

### Changes Made
- `app/src/components/ChatDrawer.tsx` — New component (~155 lines). Collapsible bottom drawer wrapping ChatPanel. 36px toggle bar with status dot, "Coach" label, and status text. CSS grid-rows transition for smooth expand/collapse. Auto-expands when streaming text starts, phase gate appears, ask prompt appears, or new messages arrive. Never auto-collapses. Status derivation inlined (mirrors ChatPanel logic).
- `app/src/components/workspace/WorkspaceShell.tsx` — Removed `side` prop from `WorkspaceShellProps` interface and destructured params. Deleted the right `<aside>` block (430px side panel with mobile footerRail). Simplified inner layout from `flex-col xl:flex-row` wrapper with `<main>` + `<aside>` to a single `<main>` element. Removed `min-h-[300px]`, `overflow-y-auto`, `xl:border-r` from main (now handled by mainPanel internals).
- `app/src/components/CoachScreen.tsx` — Replaced `ChatPanel` import with `ChatDrawer`. Deleted `sidePanel` variable (~30 lines). Restructured `mainPanel`: wrapped banners + content area in scrollable `div` (`min-h-0 flex-1 overflow-y-auto`), added mobile compact WorkflowStatsRail (`flex-shrink-0 lg:hidden`) and `ChatDrawer` pinned at bottom. Simplified `footerRail` from dual desktop/mobile render pattern to single non-compact WorkflowStatsRail (left nav only). Removed `side={sidePanel}` from WorkspaceShell props.
- `app/src/__tests__/ChatDrawer.test.tsx` — 9 new tests: collapsed by default, click toggle expands, click again collapses, auto-expand on streamingText transition, auto-expand on phaseGate transition, auto-expand on messages.length increase, no auto-collapse after triggers clear, status label reflects runtime state, aria-expanded reflects state.

### Decisions Made
- Chat moved to a bottom drawer rather than a modal or tab — keeps it always accessible without obscuring the main panel content
- Auto-expand triggers are one-way (expand only) — the user controls when to collapse, avoiding jarring auto-hide behavior
- Status derivation duplicated inline in ChatDrawer rather than extracting a shared hook — 3 ternary chains don't warrant the abstraction overhead
- `footerRail` simplified to single non-compact render — mobile compact version moved inline above ChatDrawer in mainPanel

### Known Issues
- None

### Next Steps
- Sprint 17 documentation and retrospective

## 2026-03-02 — Session 14
**Sprint:** 17 | **Story:** Visual Overhaul — Professional UI Cleanup
**Summary:** Replaced pill/badge clutter with typography-driven hierarchy across 7 coaching screen components. Net -195 lines.

### Changes Made
- `app/src/components/shared/ProcessStepGuideCard.tsx` — Removed "STEP X OF 7" pill and tone pill. Added colored left border per tone (`border-l-2`). Flattened sub-cards (removed inner bordered containers). Bumped sub-headers 10px→11px, body 11px→12px, next 11px→12px. Removed unused `toneBadgeClass` and `toneLabel` functions.
- `app/src/components/workspace/WorkspaceShell.tsx` — Removed status pill row from sidebar nodes (dot already communicates status). Removed "Saved view" text label. Enlarged status dot h-1.5→h-2. Bumped node description 11px→12px. Removed "Viewing" pill + label from breadcrumb header. Bumped subtitle 11px→12px. Removed unused `selected` variable.
- `app/src/components/ChatPanel.tsx` — Removed "Phase" text label and "Grounded workflow help" pill. Phase value rendered as plain `text-sm font-medium` text. Moved "Last update Xs ago" into title tooltip on status dot. Replaced "REFRESH STATE" text button with compact RefreshCw icon-only button. Converted status from bordered pill to 6px colored dot + plain text-xs text. Added `RefreshCw` import.
- `app/src/components/CoachScreen.tsx` — Merged redundant title + step pill into single "Step N · Title" line. Replaced "Previous version" pill with italic muted text. Replaced readiness pill with colored dot + font-medium text. Collapsed evidence/coverage/mode into single text-xs paragraph. Removed nested bordered draft-path-decision container (now inline paragraph). Removed 3-column Validated/Metrics/Mapped grid (now inline text). Replaced gap breakdown pills with colored inline spans. Simplified high-impact items from clickable cards with priority pills to flat list with colored dots.
- `app/src/components/WorkflowStatsRail.tsx` — Merged Session + Metrics into single GlassCard. Removed "Session" and "Metrics" section headers. Removed MetricRow component and bordered wrappers (simple flex justify-between rows). Removed all icon imports (Activity, Gauge, Hash, ShieldCheck, ListChecks). Strategist stages show only phase + status with no placeholder.
- `app/src/components/CoachScreenBanners.tsx` — Bumped RuntimeRecoveryBanner elapsed/progress pills 10px→11px. Bumped WorkflowPreferencesCard "Run Settings" pill 10px→11px. Bumped description 11px→12px.
- `app/src/components/IntelligenceActivityFeed.tsx` — Increased max-height 120px→140px.

### Decisions Made
- Colored dots (6-8px) replace status pills everywhere — smaller visual footprint, same information
- Typography hierarchy (font size, weight, opacity) replaces bordered badge containers
- Minimum font size raised from 10px to 11px project-wide for readability
- Left border color on ProcessStepGuideCard encodes tone without adding a pill element

### Known Issues
- None

### Next Steps
- Sprint 17 documentation and retrospective

## 2026-03-02 — Session 13
**Sprint:** 17 | **Story:** Multi-Select + Editable Suggestion Cards
**Summary:** Positioning interview suggestions now support multi-select (checkboxes) and inline editing.

### Changes Made
- `app/src/components/panels/PositioningInterviewPanel.tsx` — SuggestionCard: radio→checkbox indicator, added `editedText`/`onEditText` props, inline textarea on selection. QuestionBody: single-select state→`Set<number>` + `Map<number,string>`, multi-select toggle logic, inline edit handler, elaboration rule updated (editing inline satisfies requirement), submit composes all selections joined by `\n\n`. Removed arrow-key roving tabindex handler and `role="radiogroup"`.
- `app/src/__tests__/panels/PositioningInterviewPanel.test.tsx` — 8 new tests covering multi-select, deselect, composed submit, inline textarea appearance, pre-fill, edited text in submit, elaboration satisfaction via edit, and mixed-source elaboration gating. Updated existing test #7 for new elaboration hint wording.

### Decisions Made
- Inline textarea pre-fills with `{label}: {description}` — users can edit in-place without retyping
- `needsElaboration` satisfied by either inline edit OR custom text below (either confirms authenticity)
- `selectedSuggestion` param becomes comma-separated labels for multi-select

### Known Issues
- None

### Next Steps
- Sprint 17 documentation and retrospective

## 2026-03-02 — Session 12
**Sprint:** 16 | **Stories:** 3, 7, 8
**Summary:** Sprint 16 Phase C — Built Intelligence Activity Feed replacing the single-message banner, removed duplicate backend activity displays from ChatPanel and WorkflowStatsRail, and made the stats rail metric display stage-aware.

### Changes Made
- `app/src/components/IntelligenceActivityFeed.tsx` — New component. Scrollable feed showing last 10 activity messages with graduated opacity (newest brightest), auto-scroll to bottom, stage summary messages get left-border emphasis, Initializing placeholder when processing.
- `app/src/hooks/usePipelineStateManager.ts` — Added `activityMessages: ActivityMessage[]` and `setActivityMessages` to state, interface, and resetState. Added import for `ActivityMessage` type.
- `app/src/hooks/useSSEEventHandlers.ts` — Added `ActivityMessage` import. Added `pushActivityMessage()` helper that caps the feed at 20 entries. Modified `handleTransparency` to push feed entries (isSummary: false). Modified `handleStageStart` and `handleStageComplete` to push feed entries (isSummary: true).
- `app/src/components/CoachScreenBanners.tsx` — Replaced `PipelineActivityBanner` implementation: new props are `{ isViewingLiveNode, messages: ActivityMessage[], isProcessing }`. Now renders `IntelligenceActivityFeed` instead of a single-message div. Re-exports `ActivityMessage` type.
- `app/src/components/CoachScreen.tsx` — Updated `PipelineActivityBanner` call to new props. Added `activityMessages` prop to `CoachScreenProps`. Removed unused `pipelineActivityLastHeartbeat`, `pipelineActivityLastStageDuration`, `pipelineFirstProgressDuration`, `pipelineFirstActionReadyDuration` variables and `formatMsDurationShort` import.
- `app/src/hooks/useAgent.ts` — Added `activityMessages: state.activityMessages` to return value.
- `app/src/App.tsx` — Destructured `activityMessages` from `useAgent`, passed to `CoachScreen`.
- `app/src/components/ChatPanel.tsx` — Removed entire "Backend activity" block (lines ~295-334). Removed all associated computed variables (`stageElapsedText`, `lastProgressText`, `heartbeatText`, `lastStageDurationText`, `firstProgressText`, `firstActionReadyText`) and the `clockNow` state + its setInterval effect. Kept phase indicator bar and all other functionality.
- `app/src/components/WorkflowStatsRail.tsx` — Removed backend activity section from Session card (lines ~169-202). Removed `lastStageDurationText`, `firstProgressText`, `firstActionText` computed variables. Added `getVisibleMetrics(currentPhase)` function that returns which metric categories are visible by pipeline stage group. Metrics card now uses `visibleMetrics` flags to conditionally render only stage-appropriate metrics.
- `app/src/__tests__/IntelligenceActivityFeed.test.tsx` — New test file: 9 tests covering empty state (processing/idle), message rendering, most-recent highlight styling, summary emphasis styling, max 10 message limit, graduated opacity, banner null return, banner render.
- `app/src/__tests__/hooks/useSSEEventHandlers.test.ts` — Added `activityMessages: []` and `setActivityMessages: vi.fn()` to mock state factory.
- `app/src/__tests__/hooks/useStaleDetection.test.ts` — Same mock state fix.

### Decisions Made
- `activityMessageCounter` is module-level in `useSSEEventHandlers.ts` to generate unique IDs without requiring hook state or a ref parameter. This is safe because IDs only need to be unique per session, and the counter never resets within a browser session.
- `getVisibleMetrics` uses a plain Set lookup (not a complex condition chain) for readability. Stage groups mirror the three-agent architecture: Strategist, Craftsman, Producer.
- `runtimeMetrics` prop kept on `ChatPanel` and `WorkflowStatsRail` as optional (not removed) to avoid breaking callers; TypeScript does not flag unused optional destructured props.

### Known Issues
- None introduced by this session.

### Next Steps
- Story 9: Sprint 16 documentation and backlog update.

## 2026-03-02 — Session 11
**Sprint:** 16 | **Stories:** 4, 5, 6
**Summary:** Sprint 16 Phase B — Frontend declutter: stripped all "Info only" badges from 8 panel files, simplified Research Dashboard assumption display, and replaced the 3-card gap count grid with an inline summary + collapsible details section.

### Changes Made
- `app/src/components/panels/OnboardingSummaryPanel.tsx` — Removed "Info only" badge span from stat cards header div; kept descriptive label text.
- `app/src/components/panels/ResearchDashboardPanel.tsx` — Removed "Info only" badge spans from Company, JD Requirements, and Benchmark Profile card headers (3 badges). Simplified assumption entries to show only label + current value (removed confidence badge, "Originally inferred" line, "why" explanation, and user-edited provenance badge). Removed now-unused `confidenceBadgeClass` function and `inferredAssumptions`, `assumptionProvenance`, `confidenceByAssumption`, `whyInferred` variables.
- `app/src/components/panels/GapAnalysisPanel.tsx` — Removed "Info only:" prefix from explanation note (kept descriptive text). Removed "Info only" badge span from requirement list header (kept label). Replaced 3-card grid (Strong/Partial/Gap counts) with inline colored text summary inside the progress bar card. Wrapped requirement-by-requirement list in `<details>`/`<summary>` element labeled "Requirement Details" (collapsed by default).
- `app/src/components/panels/QualityDashboardPanel.tsx` — Removed "Info only" badge from the Overall Assessment card header.
- `app/src/components/panels/BlueprintReviewPanel.tsx` — Replaced `'Info only'` ternary fallback with conditional rendering (badge only shows when there is an action: Edited or Editable) for positioning angle card. Same pattern for section order card (Edited or Reorderable). Removed "Info only" badge from Age Protection (hasAgeFlags) card. Removed "Info only" badge from "No age signals detected" card.
- `app/src/components/panels/PositioningInterviewPanel.tsx` — Removed "Info only" badge span from JD requirement map badges row. Removed "Info only" badge span from context helper card.
- `app/src/components/panels/QuestionnairePanel.tsx` — Removed "Info only" badge span from context card header.
- `app/src/components/panels/SectionWorkbench.tsx` — Removed "Info only:" prefix from the auto-approved section note text (kept rest of the sentence).

### Decisions Made
- BlueprintReviewPanel badge logic: rather than showing "Info only" as a static fallback when `onApprove` is falsy, the badge is conditionally rendered only when it communicates an actionable state (Editable/Reorderable or Edited). This removes noise without losing the meaningful state indicators.
- GapAnalysisPanel inline summary uses the existing accent colors from the design system (`#b5dec2` green for strong, `#dfc797` amber for partial, `#dfa9a9` red for gaps) matching the classification config already defined in the file.
- `<details>`/`<summary>` pattern (no React state, auto-collapses on remount) consistent with Sprint 14 pattern used in Advanced Options and Run Settings.

### Known Issues
- None (the `activityMessages` type issue noted during parallel development was resolved when Story 3 completed).

### Next Steps
- Stories 7, 8: Remove duplicate activity displays, add contextual stats rail.

## 2026-03-02 — Session 10
**Sprint:** 16 | **Stories:** 1, 2
**Summary:** Sprint 16 Phase A — Enriched transparency messaging in all three agent prompts and added stage completion summary persistence to the event middleware.

### Changes Made
- `server/src/agents/strategist/prompts.ts` — Replaced single transparency line with a full `## Transparency Protocol` section (~30 lines). Added 5-phase example messages (intake, JD/research, benchmark, gap analysis, blueprint) with data interpolation markers and pacing guidance (emit every 30-60 seconds).
- `server/src/agents/craftsman/prompts.ts` — Replaced single transparency line in Tool Usage Protocol and added a full `## Transparency Protocol` section (~25 lines). Added 4-category examples (before writing, during/after writing, during revision, after passing) with section name and evidence count markers.
- `server/src/agents/producer/prompts.ts` — Replaced single transparency line in Key Principles and added a full `## Transparency Protocol` section (~25 lines). Added 4-category examples (template selection, structural checks, content quality checks, after all checks) with score markers.
- `server/src/agents/resume/event-middleware.ts` — Added `buildStageSummaryMessage()` helper function that returns human-readable summary strings for 6 pipeline stages (intake, research, gap_analysis, architect, section_writing, quality_review). Extended the `stage_complete` handler in `onEvent` to call `persistWorkflowArtifactBestEffort` with the summary message as a `stage_summary_{stage}` artifact.

### Decisions Made
- Stage summary artifact key pattern: `stage_summary_{stage}` stored under the stage's workflow node using `persistWorkflowArtifactBestEffort`. This keeps summaries alongside the node data they describe.
- Switch cases for `positioning`, `architect_review`, `section_review`, `revision`, and `complete` explicitly return `null` to satisfy TypeScript exhaustiveness; `default` also returns `null` as a safety fallback.
- Transparency examples use bracket markers like `[N]`, `[section name]`, `[company]` to guide LLM interpolation without hardcoding specific values.

### Known Issues
- None.

### Next Steps
- Stories 3-8 (frontend work): Intelligence Activity Feed, badge cleanup, panel simplification.

## 2026-03-02 — Session 9
**Sprint:** 15 | **Stories:** All 8 stories
**Summary:** Sprint 15 — Tech debt sweep (TypeScript fix, workflow persistence dedup, MaxListeners root cause) and platform expansion (product landing pages, cross-product context). 8/8 stories delivered. Test count: 377 app + 891 server = 1,268 total.

### Changes Made

**Story 1 — Fix `resumes-edit.test.ts` TypeScript Error**
- `server/src/__tests__/resumes-edit.test.ts` — Changed `as Record<string, unknown>` to `as unknown as Record<string, unknown>` at line 292 to fix null-to-Record cast.

**Story 2 — Deduplicate Workflow Persistence Helpers**
- `server/src/lib/workflow-persistence.ts` — New shared module (~105 lines). Exports `persistWorkflowArtifactBestEffort`, `upsertWorkflowNodeStatusBestEffort`, `resetWorkflowNodesForNewRunBestEffort`.
- `server/src/agents/resume/event-middleware.ts` — Deleted 98 lines of duplicate helpers (lines 277-373). Now imports from shared module.
- `server/src/agents/resume/route-hooks.ts` — Deleted 102 lines of duplicate helpers (lines 401-502). Now imports from shared module.

**Story 3 — Resolve MaxListenersExceededWarning Root Cause**
- `server/src/agents/runtime/agent-loop.ts` — Per-round scoped AbortControllers with `roundSignal`/`roundCleanup()`. Both `setMaxListeners` calls removed.
- `server/src/agents/runtime/product-coordinator.ts` — `setMaxListeners(20)` removed. 3 agents max, well under default limit.
- `server/src/agents/positioning-coach.ts` — `setMaxListeners(20)` removed. Per-attempt controller, never accumulates.
- `server/src/lib/retry.ts` — `setMaxListeners(20)` block removed. Max 3 sequential attempts.
- `server/src/lib/llm-provider.ts` — `setMaxListeners(50)` removed. Combined signal has at most 2 listeners.

**Story 4 — Clean Stale Backlog and Documentation**
- `docs/BACKLOG.md` — "Decommission Legacy agent/ Directory" marked COMPLETE (Sprint 7). "Fix Remaining Pre-Existing Test Failures" marked COMPLETE. Stories 1-3 marked COMPLETE.
- `memory/MEMORY.md` — Removed stale "2 pre-existing test failures in agents-gap-analyst.test.ts" references.

**Story 5 — Extend ProductDefinition with Landing Page Data**
- `app/src/types/platform.ts` — `ProductDefinition` extended with `longDescription`, `features: ProductFeature[]`, `ctaLabel`. All 4 products populated with content.

**Story 6 — Build Product Landing Page Component**
- `app/src/components/platform/ProductLandingPage.tsx` — New component (~65 lines). Glass morphism design, features grid, CTA, back link.
- `app/src/components/platform/ToolsScreen.tsx` — Added `slug` prop for routing between catalog grid and landing page.
- `app/src/components/platform/ProductCatalogGrid.tsx` — Active cards now navigate to `/tools/:slug` instead of direct route.
- `app/src/App.tsx` — Added `toolSlug` state, `/tools/:slug` URL parsing, updated `navigateTo` for slug routing.
- `app/src/__tests__/platform/ProductLandingPage.test.tsx` — New test file (8 tests).
- `app/src/__tests__/platform/ProductCatalogGrid.test.tsx` — Updated 2 assertions for new slug-based navigation.

**Story 7 — Cross-Product Context Consumption in Cover Letter**
- `server/src/agents/cover-letter/types.ts` — Added `platform_context` field to `CoverLetterState`.
- `server/src/agents/cover-letter/product.ts` — `buildAgentMessage` includes positioning strategy + evidence when available. `createInitialState` passes through platform context.
- `server/src/routes/cover-letter.ts` — Added `transformInput` hook to load positioning strategy + evidence from `user_platform_context` via `getUserContext()`.
- `server/src/__tests__/cover-letter-context.test.ts` — New test file (13 tests).

**Story 8 — Sprint 15 Documentation**
- `docs/CHANGELOG.md` — This entry.
- `docs/SPRINT_LOG.md` — Sprint 15 retrospective.
- `docs/ARCHITECTURE.md` — Updated test counts, platform components, lib modules.
- `docs/BACKLOG.md` — Updated completions, new follow-up stories.
- `docs/CURRENT_SPRINT.md` — All stories marked done.

### Decisions Made
- Per-round AbortController scoping in agent-loop.ts eliminates listener accumulation without artificial limit bumps.
- Workflow persistence extracted to `lib/workflow-persistence.ts` as single source of truth. Event middleware and route hooks import + re-export for backward compatibility.
- Product catalog cards route through landing pages (`/tools/:slug`) rather than directly to product routes, giving users a features overview before starting.
- Cover letter context consumption is best-effort: missing context is gracefully handled so first-time users aren't blocked.

### Known Issues
- None new. All pre-existing tech debt items in this sprint resolved.

### Next Steps
- Cover letter frontend UI (intake form, SSE stream, draft display, export)
- Waitlist backend for coming-soon products

---

## 2026-03-02 — Session 8
**Sprint:** 15 | **Story:** Story 3 — Resolve MaxListenersExceededWarning Root Cause
**Summary:** Removed all 6 `setMaxListeners` calls from production code by properly scoping AbortControllers with per-round cleanup in the agent loop.

### Changes Made
- `server/src/agents/runtime/agent-loop.ts` — Removed `import { setMaxListeners }` and both `setMaxListeners` calls (on `ctx.signal` and `overallSignal`). Introduced per-round `createCombinedAbortSignal` inside the for loop, scoping each round's LLM call and tool execution to a `roundSignal`. Per-round `roundCtx` passes `roundSignal` to tool execution. `roundCleanup()` called in a `finally` block guaranteeing cleanup on normal exit, `shouldBreak` exit, exception, and abort.
- `server/src/agents/runtime/product-coordinator.ts` — Removed `import { setMaxListeners }` and `setMaxListeners(20, pipelineAbort.signal)`. The signal gets at most 1 listener (from the external signal forward), well under the Node.js default limit.
- `server/src/agents/positioning-coach.ts` — Removed `import { setMaxListeners }` and `setMaxListeners(20, controller.signal)`. Each attempt creates its own fresh controller (max 2 per `withRetry` call), so listeners never accumulate.
- `server/src/lib/retry.ts` — Removed `import { setMaxListeners }` and the entire `setMaxListeners(20, options.signal)` block. With per-attempt cleanup in `withRetry`, listeners are bounded by `maxAttempts` (typically 3).
- `server/src/lib/llm-provider.ts` — Removed `import { setMaxListeners }` and `setMaxListeners(50, combinedController.signal)` from `createCombinedAbortSignal`. The `combinedController.signal` receives at most 2 listeners (one from caller forwarding, one from timeout), well under the default limit of 10.

### Decisions Made
- Per-round signal scoping in `agent-loop.ts` is the correct fix because it limits listener lifetime to a single round rather than the agent's entire session. The `finally` block guarantees cleanup regardless of exit path (normal completion, agent done, exception thrown by LLM or tool).
- The `shouldBreak` flag pattern avoids `break` inside a `try/finally` which would skip the `finally` — instead, the flag is checked after the `finally` block.
- All other `setMaxListeners` removals are safe because the listener counts on those signals are provably bounded below the Node.js default of 10.

### Next Steps
- Story 4: Clean Stale Backlog and Documentation

## 2026-03-02 — Session 7
**Sprint:** 15 | **Story:** Story 7 — Cross-Product Context Consumption in Cover Letter
**Summary:** Cover letter analyst now bootstraps from positioning strategy and evidence items stored by the resume product in `user_platform_context`. Missing context is handled gracefully.

### Changes Made
- `server/src/agents/cover-letter/types.ts` — Added optional `platform_context` field to `CoverLetterState` with typed `positioning_strategy` and `evidence_items` sub-fields.
- `server/src/agents/cover-letter/product.ts` — `createInitialState` now passes through `input.platform_context` into state. `buildAgentMessage` for the analyst builds message from parts array and conditionally appends "Prior Positioning Strategy" and "Prior Evidence Items" sections when context is present.
- `server/src/routes/cover-letter.ts` — Added `transformInput` hook that loads `positioning_strategy` and `evidence_item` rows from `user_platform_context` for the session's user. On failure, logs a warning and continues without context (best-effort).
- `server/src/__tests__/cover-letter-context.test.ts` — New. 13 tests covering state type acceptance, createInitialState passthrough, buildAgentMessage context inclusion/omission, empty evidence array handling.

### Decisions Made
- `userId` is read from `session.user_id` (the DB row) in `transformInput`, because `transformInput`'s signature is `(input, session)` — not `(input, c)`. The Hono context is only available in `onBeforeStart`.
- Platform context load uses `Promise.all` for parallel fetching of strategy and evidence rows.
- Only the most recent strategy row (`strategyRows[0]`) is used; all evidence rows are included.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 8: Sprint 15 Documentation and Backlog Update.

## 2026-03-02 — Session 6
**Sprint:** 14 | **Stories:** All 9 stories
**Summary:** Sprint 14 — UX declutter, progressive disclosure, and platform expansion foundation. 9/9 stories delivered. Test count: 369 app + 878 server = 1,247 total.

### Changes Made

**Story 1 — Replace WorkbenchProgressDots with Text Progress Bar**
- `app/src/components/panels/workbench/WorkbenchProgressDots.tsx` — Rewritten: dots replaced with "Section N of M: Section Name" text + 3px linear progress bar. Green (approved), pulsing blue (current), gray (remaining). ~45 lines, same props interface.

**Story 2 — Simplify QualityDashboardPanel Score Rings**
- `app/src/components/panels/QualityDashboardPanel.tsx` — 3 primary rings retained (Hiring Manager, ATS, Authenticity). 3 secondary metrics (Evidence Integrity, Blueprint Compliance, Narrative Coherence) converted to color-coded text rows.
- `app/src/__tests__/panels/QualityDashboardPanel.test.tsx` — Updated selectors for new text metric structure.

**Story 3 — Remove Duplicate "What To Do" Cards**
- `app/src/components/panels/OnboardingSummaryPanel.tsx` — Removed duplicate "What To Do In This Panel" GlassCard. Unique text moved to ProcessStepGuideCard via `userDoesOverride`.
- `app/src/components/panels/GapAnalysisPanel.tsx` — Same removal and consolidation.
- `app/src/components/panels/QualityDashboardPanel.tsx` — Same removal and consolidation.
- `app/src/components/panels/ResearchDashboardPanel.tsx` — Same removal and consolidation.
- `app/src/components/panels/BlueprintReviewPanel.tsx` — Checked, no duplicate found.
- `app/src/components/panels/PositioningInterviewPanel.tsx` — Checked, no duplicate found.

**Story 4 — Progressive Disclosure for Intake Form and Workspace Settings**
- `app/src/components/PipelineIntakeForm.tsx` — 4 advanced fields (workflow mode, evidence target, resume priority, seniority delta) wrapped in `<details>` "Advanced Options" disclosure, collapsed by default.
- `app/src/components/CoachScreenBanners.tsx` — WorkflowPreferencesCard wrapped in `<details>` "Run Settings" disclosure, collapsed by default.

**Story 5 — Hide Developer Telemetry**
- `app/src/components/ChatPanel.tsx` — Developer metrics (stageElapsedText, lastStageDurationText, firstProgressText, heartbeatText) wrapped in `<details>` "Details" toggle, collapsed by default.
- `app/src/components/WorkflowStatsRail.tsx` — Backend metrics wrapped in `<details>` "Details" toggle.
- `app/src/components/CoachScreenBanners.tsx` — PipelineActivityBanner metrics wrapped in `<details>` "Details" toggle.

**Story 6 — Simplify Resume Progress Breadcrumb Row**
- `app/src/components/CoachScreen.tsx` — "Your Resume Progress" label + GlassCard wrapper removed. Replaced with single line: step title + "Step N of 7 · Phase" pill. ~55px vertical space reduction.

**Story 7 — Platform Navigation Shell & Product Catalog**
- `app/src/types/platform.ts` — New. ProductDefinition, ProductCategory, ProductStatus types + PRODUCT_CATALOG constant (4 products: resume active, 3 coming-soon).
- `app/src/components/platform/ProductCatalogGrid.tsx` — New. Responsive grid of GlassCards. Active products clickable, coming-soon grayed with badge.
- `app/src/__tests__/platform/ProductCatalogGrid.test.tsx` — New. 8 tests covering rendering, click behavior, badge display.
- `app/src/App.tsx` — Added `/tools` route rendering ProductCatalogGrid.
- `app/src/components/Header.tsx` — Added "Tools" navigation item.

**Story 8 — Shared User Context Data Model**
- `supabase/migrations/20260302120000_user_platform_context.sql` — New. Creates `user_platform_context` table with RLS, indexes, moddatetime trigger.
- `server/src/lib/platform-context.ts` — New. getUserContext(), upsertUserContext(), listUserContextByType() using admin Supabase client.
- `server/src/__tests__/platform-context.test.ts` — New. 12 tests covering all CRUD operations and error handling.
- `server/src/agents/resume/product.ts` — Added persistPlatformContext() called from finalizeResult (best-effort try/catch).
- `docs/DECISIONS.md` — ADR-023: Shared Platform Context — Cross-Product User Intelligence Store.

**Story 9 — Documentation**
- `docs/CHANGELOG.md` — This entry.
- `docs/SPRINT_LOG.md` — Sprint 14 retrospective.
- `docs/ARCHITECTURE.md` — Platform catalog, shared context, UX changes.
- `docs/BACKLOG.md` — Updated with completed items and new follow-ups.
- `docs/CURRENT_SPRINT.md` — All stories marked done.

### Decisions Made
- ADR-023: Shared Platform Context — single `user_platform_context` table with JSONB content, admin client access, best-effort persistence.
- UX: `<details>`/`<summary>` HTML elements for progressive disclosure (no state management, auto-collapses on remount).
- Static product catalog (frontend constant, not DB-driven) — sufficient for <10 products.
- 3 primary score rings retained (not 0) — provides visual payoff at quality review stage.

### Known Issues
- Pre-existing: `resumes-edit.test.ts` line 292 TypeScript error (null-to-Record cast)
- Pre-existing: 2 failures in `agents-gap-analyst.test.ts`
- Duplicate workflow persistence helpers in event-middleware.ts and route-hooks.ts (Sprint 13 tech debt)

### Next Steps
- Sprint 15 planning: Consumer dashboard, product-specific landing pages, cross-product context consumption

---

## 2026-03-02 — Session 5
**Sprint:** 13 | **Story:** Story 7 — Documentation & Backlog Update
**Summary:** Sprint 13 documentation: ADR-022, ARCHITECTURE.md, CHANGELOG.md, SPRINT_LOG.md, BACKLOG.md, CURRENT_SPRINT.md.

### Changes Made
- `docs/DECISIONS.md` — ADR-022: Pipeline Route Migration — Event Middleware Hook Design
- `docs/ARCHITECTURE.md` — Updated route factory hooks, resume event middleware, pipeline deletion, route→agent mapping, test counts
- `docs/CHANGELOG.md` — All Sprint 13 changes (Stories 1-7)
- `docs/SPRINT_LOG.md` — Sprint 13 retrospective
- `docs/BACKLOG.md` — Marked pipeline migration and TOOL_MODEL_MAP items complete; added new tech debt
- `docs/CURRENT_SPRINT.md` — All stories marked done

---

## 2026-03-02 — Session 4
**Sprint:** 13 | **Story:** Story 6 — Wire Resume Pipeline to Product Route Factory & Delete pipeline.ts
**Summary:** Created `routes/resume-pipeline.ts` (~150 lines) wiring all resume hooks into `createProductRoutes()`, deleted the 1,985-line `routes/pipeline.ts` monolith, and updated all imports/tests. 864 tests pass.

### Changes Made
- `server/src/routes/resume-pipeline.ts` — New file. Thin wiring layer: defines `startSchema` (Zod), per-session event middleware registry (`Map<string, ResumeEventMiddleware>`), wires all hooks (`onBeforeStart`, `transformInput`, `onEvent`, `onBeforeRespond`, `onRespond`, `onComplete`, `onError`) into `createProductRoutes<PipelineState, PipelineSSEEvent>()`. Adds GET `/status` endpoint manually. Exports: `pipeline`, `getPipelineRouteStats`, `flushAllQueuedPanelPersists`, `STALE_PIPELINE_MS`.
- `server/src/routes/pipeline.ts` — Deleted (1,985 lines).
- `server/src/routes/product-route-factory.ts` — Added `onBeforeRespond` hook to `ProductRouteConfig`: `(sessionId, gate, response, dbState, c) => Promise<Response | void>`. Wired in `/respond` handler after pipeline_status check.
- `server/src/routes/workflow.ts` — Updated import from `./pipeline.js` to `./resume-pipeline.js`.
- `server/src/index.ts` — Updated import from `./routes/pipeline.js` to `./routes/resume-pipeline.js`.
- `server/src/agents/resume/route-hooks.ts` — Added `session.pipeline_status = 'error'` after stale recovery to prevent factory false-409 on snapshot stale detection.
- `server/src/__tests__/pipeline-limits.test.ts` — Replaced `coordinator.js` mock with `product-coordinator.js`, `resume/product.js`, `resume/event-middleware.js` mocks. Updated import path.
- `server/src/__tests__/pipeline-respond.test.ts` — Same mock replacement plus `subscription-guard.js` and `resume/route-hooks.js` mocks. Updated import path.
- `server/src/__tests__/product-route-factory.test.ts` — Added `onBeforeRespond` type contract tests (2 tests).

### Decisions Made
- `onBeforeRespond` hook added to factory for stale pipeline detection in `/respond` — returns `Response` to short-circuit. This keeps the resume-specific stale detection out of the generic factory.
- Per-session event middleware registry pattern (`Map<sessionId, ResumeEventMiddleware>`) bridges the static factory config with per-session closure state. Created in `onBeforeStart`, looked up in `onEvent`/`onComplete`/`onError`.
- `architect_review` default response normalization skipped — the frontend always sends explicit responses (`true` or `{approved:true, edits}`).
- Factory stale-snapshot false-409 fix: after `resumeBeforeStart` recovers stale pipeline, mutate `session.pipeline_status = 'error'` so factory's stale snapshot check passes.

### Known Issues
- `server/src/__tests__/resumes-edit.test.ts` line 292 pre-existing `tsc --noEmit` error (null-to-Record cast). Not introduced by this story.
- Duplicate workflow persistence helpers exist in both `event-middleware.ts` and `route-hooks.ts` (documented tech debt).

### Next Steps
- Story 7: Documentation & Backlog Update

---

## 2026-03-02 — Session 3
**Sprint:** 13 | **Story:** Story 5 — Extract Resume Route Hooks (Start, Respond, Status)
**Summary:** Created `server/src/agents/resume/route-hooks.ts` (~570 lines) implementing all three ProductRouteConfig lifecycle hooks for the resume product, plus 44 unit tests.

### Changes Made
- `server/src/agents/resume/route-hooks.ts` — New file. Implements `resumeBeforeStart` (onBeforeStart hook: JD URL resolution, stale pipeline recovery, capacity checks, pipeline slot claim, workflow artifact initialization), `resumeTransformInput` (transformInput hook: master resume loading from DB), `resumeOnRespond` (onRespond hook: question response persistence). Also exports: `registerRunningPipeline`, `unregisterRunningPipeline`, `getPipelineRouteStats`, `PIPELINE_STAGES`, SSRF protection helpers (`isPrivateIPv4`, `isPrivateIPv6`, `isPrivateHost`, `resolveJobDescriptionInput`), and workflow persistence helpers (`persistWorkflowArtifactBestEffort`, `upsertWorkflowNodeStatusBestEffort`, `resetWorkflowNodesForNewRunBestEffort`, `persistQuestionResponseBestEffort`) shared with the event middleware.
- `server/src/__tests__/resume-route-hooks.test.ts` — New file. 44 tests covering SSRF helpers, JD URL resolution, HTML text extraction, `getPipelineRouteStats` shape, `resumeOnRespond`, and `persistQuestionResponseBestEffort`.
- `docs/CURRENT_SPRINT.md` — Marked Story 5 done; Phase 3 marked COMPLETE.

### Decisions Made
- JD URL resolution is performed inside `resumeBeforeStart` (not `transformInput`) because it has access to the Hono `Context` and can return a 400 Response directly on failure. The resolved text is stored back into the `input` record (mutated in place) so that `transformInput` and `buildProductConfig` receive the resolved value.
- `persistQuestionResponseBestEffort` is defined and exported here (not in event-middleware.ts) because it is also called from `resumeOnRespond`. Story 4 (event-middleware.ts) can import from this module if needed, keeping a single source of truth.
- `handleStalePipelineOnRespond` is exported for use by the route wiring layer (Story 6) since stale detection on respond must happen before the gate persistence logic and cannot be fully encapsulated in onRespond.
- The module-level `runningPipelines` Map and its cleanup timer live in this file; `registerRunningPipeline` / `unregisterRunningPipeline` are exported as the factory wiring layer needs to call them.

### Known Issues
- `server/src/__tests__/resumes-edit.test.ts` line 292 has a pre-existing `tsc --noEmit` error (null-to-Record cast). Not introduced by this story.

### Next Steps
- Story 6: Wire Resume Pipeline to Product Route Factory & Delete pipeline.ts

---

## 2026-03-02 — Session 2
**Sprint:** 13 | **Story:** Story 4 — Extract Resume SSE Event Processing into event-middleware.ts
**Summary:** Created `server/src/agents/resume/event-middleware.ts` — a factory function that extracts all SSE event processing logic from `pipeline.ts` into a reusable middleware module, plus 30 unit tests.

### Changes Made
- `server/src/agents/resume/event-middleware.ts` — New file (~620 lines). Factory function `createResumeEventMiddleware(sessionId, pipelineRunStartedAt)` returns `{ onEvent, onComplete, onError, flushPanelPersists, dispose }`. Module-level `flushAllQueuedPanelPersists()` exported for graceful shutdown. Extracted: section context sanitization helpers, `workflowNodeFromPanelType`, workflow persistence helpers, panel persistence debouncing, question response persistence, runtime metrics tracking, per-event-type persistence dispatch. Also exports `resetWorkflowNodesForNewRunBestEffort` (called from route hooks, not event middleware). Sanitizes `pipeline_error` events before SSE broadcast (replaces internal error with generic message).
- `server/src/__tests__/resume-event-middleware.test.ts` — New file (~280 lines). 30 unit tests covering: `sanitizeSectionContext` truncation, `deriveSectionBundleStatusFromContext` bundle status computation, `workflowNodeFromPanelType` mapping, `createResumeEventMiddleware` lifecycle methods, `flushAllQueuedPanelPersists` module-level registry, `pipeline_error` sanitization.

### Decisions Made
- Factory pattern (closure state per instance) chosen over module-level globals for `queuedPanelPersists` and `runtimeMetricsState`. This allows clean per-session isolation and avoids cross-session contamination when the factory is instantiated per pipeline run.
- Module-level `activeMiddlewares` Set tracks all live instances so `flushAllQueuedPanelPersists()` can flush all at graceful shutdown.
- `onError` both cancels (discards) and flushes queued panel persists — cancel removes from queue, flush handles any that arrived between cancel and the flush call. In practice after `cancelQueuedPanelPersist` the flush returns immediately with nothing queued.
- `pipeline.ts` is NOT modified — extraction only creates the new file per story scope.

### Known Issues
- `server/src/__tests__/resumes-edit.test.ts` line 292 pre-existing `tsc --noEmit` error (null-to-Record cast). Not introduced by this story.
- `server/src/agents/resume/route-hooks.ts` pre-existing `tsc --noEmit` error (AuthUser cast). Not introduced by this story.
- `server/src/__tests__/resume-route-hooks.test.ts` has 1 failing test (`throws for invalid URL structure`) — pre-existing Story 5 test file.

### Next Steps
- Story 5: Extract Resume Route Hooks (Start, Respond, Status) into `server/src/agents/resume/route-hooks.ts`

---

## 2026-03-02 — Session 1
**Sprint:** 13 | **Story:** Story 2 — Rename interview_transcript to questionnaire_responses
**Summary:** Pure field rename across 4 files; no functional change.

### Changes Made
- `server/src/agents/types.ts` — Renamed `PipelineState.interview_transcript` to `questionnaire_responses`; updated comment from "Raw interview Q&A" to "Raw questionnaire Q&A"
- `server/src/agents/strategist/tools.ts` — Updated 4 references: 2x `ctx.getState().interview_transcript` → `ctx.getState().questionnaire_responses` and 2x `ctx.updateState({ interview_transcript: ... })` → `ctx.updateState({ questionnaire_responses: ... })`
- `server/src/agents/resume/product.ts` — Updated 2 references: `state.interview_transcript` → `state.questionnaire_responses` (in `buildCraftsmanMessage` and evidence assembly)
- `server/src/__tests__/coordinator.test.ts` — Updated 2 test fixture assignments: `contextParams.state.interview_transcript` → `contextParams.state.questionnaire_responses`

### Decisions Made
- No type definition change — only the field name was updated. The array element shape remains identical.

### Known Issues
- `server/src/__tests__/resumes-edit.test.ts` line 292 has a pre-existing `tsc --noEmit` error (null-to-Record cast). Not introduced by this story.

### Next Steps
- Story 3: Extend Product Route Factory with Event & Lifecycle Hooks

---

## 2026-03-01 — Sprint 12 Complete
**Sprint:** 12 | **Stories:** 1-8 (Platform Decoupling & Multi-Product Foundation)
**Summary:** Extracted a generic Product Definition Layer from the resume coordinator; validated the abstraction with a Cover Letter proof-of-concept product; added declarative model-tier routing to all 26 tools; built a product route factory for zero-boilerplate multi-product routes.

### Changes Made

**Story 1: ProductConfig Interface**
- `server/src/agents/runtime/product-config.ts` — New file (~200 lines). Defines `ProductConfig`, `AgentPhase`, `GateDef`, `InterAgentHandler`, and `RuntimeParams` types. `ProductConfig` is a plain object (not a class), matching the existing `AgentConfig` pattern.

**Story 2: Generic Coordinator**
- `server/src/agents/runtime/product-coordinator.ts` — New file (~300 lines). `runProductPipeline(config, state, emit, signal)` wires bus subscriptions from `config.interAgentHandlers`, sequences phases, manages gates, emits SSE stage events. Zero product-specific logic.
- `server/src/agents/runtime/agent-loop.ts` — Fixed `emit_transparency` type cast from unsafe hard cast to try/catch with typed guard. Prevents runtime crash if transparency payload has unexpected shape.
- `server/src/agents/runtime/index.ts` — Added exports for agent-registry, ProductConfig types, and `runProductPipeline`.

**Story 3: Resume Coordinator Rewrite**
- `server/src/agents/resume/product.ts` — New file (~600 lines). Implements `resumeProductConfig` as a `ProductConfig`. Declares three-agent phase sequence (Strategist → Craftsman → Producer), phase hooks, inter-agent revision routing, gate definitions, and stage messaging labels. All resume-specific orchestration logic migrated here from `coordinator.ts`.
- `server/src/agents/coordinator.ts` — Rewritten from ~1430 lines to ~60 lines. Now a thin wrapper: constructs initial `PipelineState`, calls `runProductPipeline(resumeProductConfig, ...)`, and manages the pipeline heartbeat interval.

**Story 4: Tool Model Routing via model_tier**
- `server/src/lib/llm.ts` — Added `getModelForTier(tier: 'primary' | 'mid' | 'orchestrator' | 'light'): string`. Added `ToolRegistryLike` interface for DI. Added `resolveToolModel(tool, registry?)` that checks `tool.model_tier` first, falls back to `TOOL_MODEL_MAP`. `TOOL_MODEL_MAP` marked as deprecated.
- `server/src/agents/craftsman/tools.ts` — Added `model_tier` to 4 tools: `write_section` (primary), `self_review_section` (mid), `check_keyword_coverage` (light), `check_anti_patterns` (light).
- `server/src/agents/producer/tools.ts` — Added `model_tier` to 6 tools: `adversarial_review` (mid), `ats_compliance_check` (mid), `humanize_check` (light), `check_blueprint_compliance` (mid), `verify_cross_section_consistency` (mid), `check_narrative_coherence` (mid).

**Story 5: Product Route Factory**
- `server/src/routes/product-route-factory.ts` — New file (~340 lines). `createProductRoutes(productConfig)` generates standard Hono routes (`POST /start`, `GET /:sessionId/stream`, `POST /respond`) for any `ProductConfig`. Handles session creation, SSE registration, gate wiring, and error responses generically. Note: `routes/pipeline.ts` was NOT refactored to use this factory (1985-line file with too much resume-specific logic — deferred to future sprint).

**Story 6: Cover Letter POC — Agent Definitions**
- `server/src/agents/cover-letter/types.ts` — New file (~60 lines). `CoverLetterState` and `CoverLetterSSEEvent` types.
- `server/src/agents/cover-letter/analyst/agent.ts` — New file (~40 lines). Analyst agent config registered in registry.
- `server/src/agents/cover-letter/analyst/tools.ts` — New file (~160 lines). `analyze_job` (light) and `analyze_resume` (light) tools.
- `server/src/agents/cover-letter/writer/agent.ts` — New file (~40 lines). Writer agent config registered in registry.
- `server/src/agents/cover-letter/writer/tools.ts` — New file (~150 lines). `draft_opening` (mid), `draft_body` (primary), `draft_closing` (mid) tools.
- `server/src/agents/cover-letter/product.ts` — New file (~120 lines). `coverLetterProductConfig` implementing `ProductConfig` with 2 phases (analysis → writing) and zero user gates.

**Story 7: Cover Letter POC — Route Integration**
- `server/src/routes/cover-letter.ts` — New file (~30 lines). Mounts `createProductRoutes(coverLetterProductConfig)` at `/api/cover-letter/*`. Guards with `FF_COVER_LETTER` feature flag check.
- `server/src/lib/feature-flags.ts` — Added `FF_COVER_LETTER` flag (default false).
- `server/src/index.ts` — Mounted cover letter routes at `/api/cover-letter`.

**Story 8: Documentation**
- `docs/DECISIONS.md` — Added ADR-019 (ProductConfig as plain object), ADR-020 (model_tier routing), ADR-021 (Cover Letter POC — no user gates).
- `docs/ARCHITECTURE.md` — Added Product Definition Layer section, generic coordinator, resume product definition, product route factory, cover letter POC, and updated route mapping table. Updated monorepo layout with new directories.
- `docs/CHANGELOG.md` — Sprint 12 complete entry (this entry).
- `docs/SPRINT_LOG.md` — Sprint 12 retrospective.
- `docs/BACKLOG.md` — Marked platform decoupling epic complete; added follow-up stories.
- `docs/CURRENT_SPRINT.md` — Cleared for Sprint 13.

### Decisions Made
- ADR-019: `ProductConfig` as plain object — matches existing `AgentConfig` pattern, simpler than class hierarchy.
- ADR-020: `model_tier` on `AgentTool` — declarative, self-documenting, DI via optional registry to avoid circular imports.
- ADR-021: Cover letter POC with zero gates — validates abstraction without requiring frontend changes.
- `pipeline.ts` NOT refactored to use factory — 1985 lines with too much resume-specific routing logic. Deferred as a dedicated story.
- `TOOL_MODEL_MAP` kept as deprecated fallback, not deleted, to ensure zero regression during transition.

### Test Totals
- Server: 781 tests (+45 new, 55 test files)
- App: 354 tests (unchanged, TypeScript clean)
- New test files: `product-config-types.test.ts`, `product-coordinator.test.ts`, `tool-model-routing.test.ts`, `product-route-factory.test.ts`, `cover-letter-agents.test.ts`

### Known Issues
- `routes/pipeline.ts` still has 1985 lines of resume-specific routing logic — needs a dedicated refactor story.
- `TOOL_MODEL_MAP` in `llm.ts` is deprecated but not yet deleted.

## 2026-03-01 — Sprint 11, Story 1: Persist Revision Counts in PipelineState
**Sprint:** 11 | **Story:** Story 1 — Fix Bug 16 — Persist Revision Counts in PipelineState
**Summary:** Moved the per-section revision counter from a closure-local Map inside `subscribeToRevisionRequests` to the `PipelineState` object, so the cap survives handler re-creation and cannot be bypassed.

### Changes Made
- `server/src/agents/types.ts` — Added `revision_counts: Record<string, number>` field to the `PipelineState` interface (adjacent to the existing `revision_count` field).
- `server/src/agents/coordinator.ts` — Two changes: (1) Added `revision_counts: {}` to the initial pipeline state object in `runPipeline`. (2) In `subscribeToRevisionRequests`, removed the local `const revisionCounts = new Map<string, number>()` and replaced all reads (`revisionCounts.get(...)`) and writes (`revisionCounts.set(...)`) with direct access to `state.revision_counts[...]`. Added a defensive initialization guard `if (!state.revision_counts) state.revision_counts = {}` at the top of the function to handle sessions restored from the database before this field existed.
- `server/src/__tests__/sprint11-revision-counts.test.ts` — New file. 8 unit tests covering: initial state is `{}`, increment after each revision, increment across multiple rounds, cap enforced at `MAX_REVISION_ROUNDS` via state, transparency event emitted on cap, new handler instance reads cap from state (re-creation cannot bypass), independent counters per section, and initialization of absent field (DB-restored session).
- `server/src/__tests__/craftsman-checks.test.ts` — Added `revision_counts: {}` to the inline `minimalState` object to satisfy the now-required field.
- `server/src/__tests__/craftsman-tools.test.ts` — Added `revision_counts: {}` to `makePipelineState` helper.
- `server/src/__tests__/producer-tools.test.ts` — Added `revision_counts: {}` to `makePipelineState` helper.
- `server/src/__tests__/revision-loop.test.ts` — Added `revision_counts: {}` to `makePipelineState` helper.
- `server/src/__tests__/sprint5-fixes.test.ts` — Added `revision_counts: {}` to `makePipelineState` helper.
- `server/src/__tests__/strategist-tools.test.ts` — Added `revision_counts: {}` to `makePipelineState` helper.

### Decisions Made
- Made `revision_counts` a required field (not optional) on `PipelineState` so TypeScript enforces initialization at all state creation sites. The defensive guard in `subscribeToRevisionRequests` handles the DB-restore case for older sessions that predate this field.
- Root cause of Bug 16: `const revisionCounts = new Map()` was re-created every time `subscribeToRevisionRequests` was called, so any code path that re-called it (e.g., after a reconnect or coordinator restart within a session) would reset all counters to zero, allowing infinite revision loops.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 2 already complete. Continue with Story 3: Fix Bug 18 — Request-Level Lock for Gate Responses.

## 2026-03-01 — Sprint 11, Story 2: Sliding Window for Cross-Section Context
**Sprint:** 11 | **Story:** Story 2 — Fix Bug 17 — Sliding Window for Cross-Section Context
**Summary:** Changed the cross-section context builder in `write_section` to keep only the last 5 completed sections (sliding window) and increased the excerpt length from 300 to 600 chars, preventing unbounded context growth on long sessions.

### Changes Made
- `server/src/agents/craftsman/tools.ts` — Replaced the unbounded loop in the cross-section context builder with a sliding window. Collects all `section_*` scratchpad entries, logs a warning with `dropped_count` when more than 5 exist, then takes only the last 5 via `.slice(-5)`. Excerpt length increased from 300 to 600 chars. Two named constants `MAX_CROSS_SECTION_ENTRIES = 5` and `CROSS_SECTION_EXCERPT_LENGTH = 600` document the limits inline.
- `server/src/__tests__/sprint11-cross-section-window.test.ts` — New file. 8 unit tests covering: all 5 sections pass through when at or below the limit, only last 5 kept when 8 sections exist, only last 5 kept when exactly 6 exist, excerpts truncated to 600 chars, excerpts under 600 chars pass through unchanged, warning logged with correct `dropped_count`, no warning when at or below the limit, and `cross_section_context` is `undefined` (not `{}`) when no prior sections exist.
- `server/src/__tests__/craftsman-tools.test.ts` — Updated one pre-existing test that was asserting the old 300-char truncation limit; updated to assert 600 chars and adjusted the test content length from 600 to 900 chars so truncation actually occurs.

### Decisions Made
- Used `allSectionEntries.slice(-MAX_CROSS_SECTION_ENTRIES)` to keep the last N entries. "Last" here means the most recently inserted keys in the scratchpad object, which corresponds to the most recently written sections.
- Constants defined inside the `execute` function body rather than at module scope to keep them co-located with the logic they govern and avoid polluting the module namespace.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 3: Fix Bug 18 — Request-Level Lock for Gate Responses.

## 2026-03-01 — Sprint 11, Story 3: Fix Bug 18 — Request-Level Lock for Gate Responses
**Sprint:** 11 | **Story:** Story 3 — Fix Bug 18 — Request-Level Lock for Gate Responses
**Summary:** Added a `useRef`-based in-flight lock to `handlePipelineRespond` in `App.tsx` to prevent double-click 409 race conditions that slipped through the React state-based optimistic disable.

### Changes Made
- `app/src/App.tsx` — Added `useRef` to React imports. Added `isRespondingRef = useRef(false)` near top of component. Added `useEffect` that resets `isRespondingRef.current = false` whenever `isPipelineGateActive` becomes `true` (new gate arrives). Modified `handlePipelineRespond` to check the ref before proceeding, set it to `true` before the fetch, and reset it to `false` in a `finally` block.
- `app/src/__tests__/sprint11-gate-lock.test.ts` — New file. 8 unit tests covering: early return on null session, early return when gate inactive, success path ref reset, failure path gate re-enable, concurrent call dropping, finally-block cleanup on throw, new-gate ref reset (useEffect logic), and sequential multi-gate flow.

### Decisions Made
- Root cause: React `setState` is asynchronous — `setIsPipelineGateActive(false)` does not take effect before a second synchronous click re-enters the callback. A `useRef` is synchronously readable and writable within the same event loop tick, making it the correct primitive for this guard.
- The `useEffect` reset is needed so that when the pipeline advances and sends a new `pipeline_gate` SSE event (flipping `isPipelineGateActive` back to `true`), `isRespondingRef.current` is also cleared — otherwise the next gate response would be silently dropped.
- Tests use extracted pure logic (same pattern as `WorkbenchSuggestions.test.ts`) since the node test environment cannot render App.tsx.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 4: Fix PDF Unicode — Expand sanitizePdfText Mappings.

## 2026-03-01 — Sprint 11, Story 6: Improve Usage Tracking Clarity
**Sprint:** 11 | **Story:** Story 6 — Improve Usage Tracking Clarity
**Summary:** Removed the `size === 1` conditional guard in `recordUsage()` so that dropped usage always triggers a `warn` log, and exported the function for direct unit testing.

### Changes Made
- `server/src/lib/llm-provider.ts` — Removed `if (sessionUsageAccumulators.size === 1)` guard from `recordUsage()`. Warning now fires unconditionally whenever no accumulator is found. Added `activeAccumulatorCount: sessionUsageAccumulators.size` to the log payload. Changed function from `function` to `export function` to support direct unit testing.
- `server/src/__tests__/sprint11-usage-tracking.test.ts` — New file. 6 tests covering: warning fires with zero accumulators, warning fires with multiple accumulators (the case the old guard suppressed), warning fires with undefined sessionId, no accumulator is modified when usage is dropped, tokens accumulate correctly when a valid accumulator exists, and multiple calls accumulate correctly.

### Decisions Made
- Exported `recordUsage` as a named export rather than testing through the full `chat()` integration path. Direct export keeps tests fast (no HTTP mocking) and precise — each test case is a one-liner call to `recordUsage`.
- Used `vi.hoisted()` for the logger mock to ensure it is installed before module imports, consistent with the pattern in `usage-persistence.test.ts`.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 7: Platform — Agent Bus Cross-Product Routing.

## 2026-03-01 — Sprint 11, Story 4: Fix PDF Unicode — Expand sanitizePdfText Mappings
**Sprint:** 11 | **Story:** Story 4 — Fix PDF Unicode — Expand sanitizePdfText Mappings
**Summary:** Added NFKD fallback normalization to `sanitizePdfText` so non-WinAnsi characters like ligatures decompose gracefully, while all seven WinAnsi-supported special characters (smart quotes, dashes, ellipsis) are explicitly preserved unchanged.

### Changes Made
- `app/src/lib/export-pdf.ts` — Added `export` keyword to `sanitizePdfText` to make it directly testable. Added `WINANSI_ABOVE_FF` set enumerating all Windows-1252 codepoints above U+00FF so they are exempt from the NFKD fallback. Added NFKD normalization step: characters not in `WINANSI_ABOVE_FF` and not in the Latin-1 range are decomposed via `String.prototype.normalize('NFKD')`; any residual non-Latin-1 codepoints are stripped. Updated JSDoc comment to document the pass-through characters.
- `app/src/__tests__/sprint11-pdf-unicode.test.ts` — New file. 19 unit tests covering: all 7 WinAnsi special characters pass through unchanged, NFKD fallback decomposes fi/fl/ffi ligatures, emoji and non-decomposable characters are stripped cleanly, and all pre-existing sanitization behaviour (whitespace, bullets, control chars, accented Latin) continues to work correctly.

### Decisions Made
- The NFKD bypass set (`WINANSI_ABOVE_FF`) is defined as a module-level `Set<string>` constant so the membership check is O(1) per character. Listing all 27 Windows-1252 non-Latin-1 entries makes the intent explicit and avoids a range-based approach that could silently include unintended codepoints.
- `sanitizePdfText` is exported with `export function` (not a default export) to match the existing naming convention in the file while enabling direct unit testing without routing through the full `exportPdf` path.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 5: Fix Center Column Scroll.

## 2026-03-01 — Sprint 11 Complete
**Sprint:** 11 | **Stories:** 1-11 (Bug Squash, Production Polish & Platform Foundation)
**Summary:** Fixed 4 known bugs (revision loops, context overflow, gate 409s, PDF Unicode), polished center column scroll and usage logging, laid platform foundation (bus routing, capability discovery, lifecycle hooks), cleaned up backlog, and updated all documentation.

### Changes Made

**Story 5: Fix Center Column Scroll**
- `app/src/components/CoachScreen.tsx` — Wrapped all banner components in `<div className="flex-shrink-0 max-h-[40vh] overflow-y-auto">`. Banners now cap at 40% viewport and scroll internally, ensuring the content area remains visible.

**Story 7: Platform — Agent Bus Cross-Product Routing**
- `server/src/agents/runtime/agent-bus.ts` — Rewrote with namespace support. `subscribe()` accepts `domain:agentName` or `name` keys. `send()` resolves via `domain:to` first, falls back to name-only. Added `sendBroadcast(domain, msg)` and `listSubscribers(domain?)`. All existing resume pipeline calls work unchanged via backward-compatible fallback. 14 new tests in `sprint11-agent-bus.test.ts`.

**Story 8: Platform — Dynamic Agent Discovery**
- `server/src/agents/runtime/agent-protocol.ts` — Added optional `capabilities?: string[]` to `AgentConfig`.
- `server/src/agents/runtime/agent-registry.ts` — Added `findByCapability(cap, domain?)`, `listDomains()`, `describe(domain, name)`. Added `AgentDescription` interface.
- `server/src/agents/strategist/agent.ts` — Registered capabilities: research, positioning, interview, gap_analysis, blueprint_design.
- `server/src/agents/craftsman/agent.ts` — Registered capabilities: content_creation, self_review, section_writing, revision.
- `server/src/agents/producer/agent.ts` — Registered capabilities: quality_review, document_production, ats_compliance, template_selection.
- 10 new tests in `sprint11-agent-discovery.test.ts`.

**Story 9: Platform — Wire Lifecycle Hooks in Agent Loop**
- `server/src/agents/runtime/agent-loop.ts` — Added `config.onInit?.(ctx)` call before first LLM round (errors logged, don't abort). Added `config.onShutdown?.(ctx)` in `finally` block (errors logged, don't mask loop errors). 6 new tests in `sprint11-lifecycle-hooks.test.ts`.

**Story 10: Clean Up Backlog and Stale Artifacts**
- `docs/BACKLOG.md` — Removed 4 resolved items (SSE mismatch, usage contamination, center scroll, ATS revisions). Updated platform expansion story to reflect Sprint 11 progress.
- Deleted stale `server/dist/` directory.

**Story 11: Documentation and Retrospective**
- `docs/CHANGELOG.md` — Sprint 11 complete entry.
- `docs/SPRINT_LOG.md` — Sprint 11 retrospective.
- `docs/ARCHITECTURE.md` — Updated agent runtime section (bus routing, registry discovery, lifecycle hooks).
- `docs/DECISIONS.md` — Added ADR-018 (cross-product agent bus routing).
- `docs/CURRENT_SPRINT.md` — All stories marked done.

### Decisions Made
- ADR-018: Namespaced bus routing with backward-compatible name-only fallback (see DECISIONS.md).
- Lifecycle hook errors are logged but never abort or mask — fail-safe design.
- `revision_counts` made a required field on PipelineState (not optional) to enforce initialization.

### Test Totals
- Server: 736 tests (+73 new)
- App: 354 tests (+27 new)
- Total: 1,090 tests (+100 new)

### Known Issues
- None introduced by Sprint 11.
- 2 pre-existing failures in `agents-gap-analyst.test.ts` remain.

## 2026-03-01 — Story 8: E2E Test — Dashboard Flows
**Sprint:** 10 | **Story:** Story 8 — E2E Test — Dashboard Flows
**Summary:** Created `e2e/tests/dashboard.spec.ts` — 12 Playwright tests covering dashboard navigation, tab switching, session card status badges, status filter, resume viewer modal, evidence library search/filter, and comparison selection flows. All tests are resilient to data state (empty or populated).

### Changes Made
- `e2e/tests/dashboard.spec.ts` — New file. 12 tests across `test.describe('Dashboard Flows')`. Uses same `storageState` auth pattern as the existing `chromium` Playwright project. Fetches real session data from Supabase via service role REST API in `beforeAll` to determine which data-dependent tests to skip vs assert.

### Decisions Made
- Used `fetchTestSessions()` in `beforeAll` to probe real DB state instead of mocking. This means tests correctly skip comparison assertions when fewer than 2 complete sessions exist, rather than failing falsely.
- Tests skip gracefully with `test.skip()` rather than asserting on missing data. This keeps CI green regardless of test data state.
- The `countVisibleSessionCards()` helper identifies cards by the delete button's aria-label (`"Delete session"`) — every card has exactly one, making it a reliable selector.
- Skeleton animation `.animate-pulse` detection uses `.catch(() => {})` because the skeleton may already be gone by the time the assertion runs; this is intentional non-blocking behavior.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 9: Documentation, Retrospective, and Sprint Cleanup.

## 2026-03-01 — Sprint 10 Complete
**Sprint:** 10 | **Stories:** 1-9 (UX Polish, Platform Hardening & Cleanup)
**Summary:** Improved positioning interview UX with rich clickable options, unified to batch-only interview mode, fixed agent registry type erasure, extracted shared emit_transparency factory, resolved MaxListenersExceededWarning, and completed sprint documentation.

### Changes Made

**Story 1: Improve LLM Suggestion Quality**
- `server/src/agents/positioning-coach.ts` — Rewrote `generateQuestionsViaLLM()` prompt to require 3-5 concrete, clickable answer options per question. Updated suggestion schema validation: min label length 15 chars, max 5 options (was 4), truncation at 120 chars.

**Story 2: Improve Fallback Suggestion Quality**
- `server/src/agents/positioning-coach.ts` — Rewrote all 8 fallback questions in `generateFallbackQuestions()` with 3-5 concrete answer options each. All suggestions now include `source: 'coach'` badge.

**Story 3: Unify Interview to Batch-Only Mode**
- `server/src/agents/strategist/tools.ts` — Removed `interviewCandidateTool` from strategist tools exports. Single-question conversational interview mode eliminated.
- `server/src/agents/strategist/agent.ts` — Updated strategist system prompt to reflect batch-only mode. No instructions for the removed `interview_candidate` tool.
- `server/src/agents/positioning-coach.ts` — Verified `positioningToQuestionnaire()` correctly maps rich suggestion objects to questionnaire format.
- `e2e/helpers/pipeline-responder.ts` — Updated comment noting single-question mode no longer exists.

**Story 4: Interview Answer Extraction for Multi-Select**
- `server/src/agents/coordinator.ts` — Updated `extractInterviewAnswers()` with improved option label lookup. Primary strategy: match by `${questionId}_opt_${index}` key pattern. Fallback strategy: extract index from option ID suffix to handle variant ID formats.

**Story 5: Agent Registry Type Safety and Lifecycle Hooks**
- `server/src/agents/runtime/agent-protocol.ts` — Added optional `onInit` and `onShutdown` lifecycle hooks to `AgentConfig<TState, TEvent>`. Both typed as `(ctx: AgentContext<TState, TEvent>) => Promise<void>`.
- `server/src/agents/runtime/agent-registry.ts` — Changed internal `AnyAgentConfig` from `AgentConfig<any, any>` to `AgentConfig<BaseState, BaseEvent>`. Added exported `registerAgent<TState, TEvent>()` helper that handles internal widening with a single documented `as unknown as AnyAgentConfig` cast confined to this one function.
- `server/src/agents/strategist/agent.ts` — Replaced `agentRegistry.register(...as unknown as AgentConfig)` with `registerAgent(strategistConfig)`.
- `server/src/agents/craftsman/agent.ts` — Same registration cleanup as strategist.
- `server/src/agents/producer/agent.ts` — Same registration cleanup as producer.

**Story 6: Capability-Based Tool Packages (Shared Tools)**
- `server/src/agents/runtime/shared-tools.ts` — New file. `createEmitTransparency<TState, TEvent>(config?)` factory returns a typed `AgentTool`. Optional `prefix` config prepends text to the message. Guards against empty messages (returns `{ success: false }`). Domain-agnostic.
- `server/src/agents/strategist/tools.ts` — Replaced ~30-line local `emitTransparencyTool` with `createEmitTransparency<PipelineState, PipelineSSEEvent>()`.
- `server/src/agents/craftsman/tools.ts` — Same replacement. Removed now-unused `PipelineStage` import.
- `server/src/agents/producer/tools.ts` — Replaced ~30-line local `emitTransparency` with `createEmitTransparency<PipelineState, PipelineSSEEvent>({ prefix: 'Producer: ' })`.
- `server/src/__tests__/strategist-tools.test.ts` — Updated 2 emit_transparency return value assertions: `result.success` → `result.emitted`.
- `server/src/__tests__/producer-tools.test.ts` — Updated 2 assertions to match shared factory behavior (prefixed message in result, empty message returns `{ success: false }`).

**Story 7: Fix MaxListenersExceededWarning**
- `server/src/agents/runtime/agent-loop.ts` — Added `setMaxListeners(50, ctx.signal)` and `setMaxListeners(50, overallSignal)`.
- `server/src/lib/retry.ts` — Added proactive `setMaxListeners(20, options.signal)` at the start of `withRetry()` when signal is provided.
- `server/src/agents/positioning-coach.ts` — Bumped `setMaxListeners` on per-attempt AbortController signal from 15 to 20.
- `server/src/__tests__/agents-positioning.test.ts` — Updated test "normalizes suggestions to max 4 items" to use labels meeting 15-char minimum and expect max 5 (was 4).

**Story 8: E2E Dashboard Tests**
- `e2e/tests/dashboard.spec.ts` — New test file covering dashboard navigation, session history display, resume viewer modal, session filtering, and master resume tab loading.

**Story 9: Documentation and Retrospective**
- `docs/CHANGELOG.md` — Added Sprint 10 complete entry (this entry).
- `docs/SPRINT_LOG.md` — Added Sprint 10 retrospective.
- `docs/ARCHITECTURE.md` — Updated Strategist tools section (removed `interview_candidate`, noted batch-only mode). Added shared tools pattern section.
- `docs/DECISIONS.md` — Added ADR-016 (batch-only interview) and ADR-017 (shared tool packages).
- `docs/BACKLOG.md` — Removed items resolved by Sprint 10 (MaxListenersExceededWarning story).
- `docs/CURRENT_SPRINT.md` — Marked Story 9 done.

### Decisions Made
- ADR-016: Remove single-question interview mode in favor of QuestionnairePanel batch mode (see DECISIONS.md).
- ADR-017: Shared tool factory pattern via `createEmitTransparency` in `shared-tools.ts` (see DECISIONS.md).
- The shared factory returns `{ emitted: true, message }` on success (matching Craftsman's prior behavior) rather than `{ success: true }`. `emitted` is the semantic winner.

### Known Issues
- Pre-existing TypeScript error in `resumes-edit.test.ts:292` (null cast) — unrelated to Sprint 10.
- Story 8 (E2E Dashboard Tests) being implemented concurrently by separate agent.

### Next Steps
- Sprint 11 planning: review BACKLOG.md for next priority items.
- Monitor MaxListenersExceededWarning resolution in live pipeline runs.

## 2026-03-01 — Session N+1
**Sprint:** 10 | **Stories:** 5 and 6 — Agent Registry Type Safety + Shared Tools
**Summary:** Eliminated `as unknown as AgentConfig` type erasure casts in agent registration by adding a `registerAgent()` helper, added optional lifecycle hooks to `AgentConfig`, and extracted `emit_transparency` to a shared factory eliminating ~90 lines of duplicate code across 3 agents.

### Changes Made
- `server/src/agents/runtime/agent-protocol.ts` — Added optional `onInit` and `onShutdown` lifecycle hooks to `AgentConfig<TState, TEvent>`. Both are typed as `(ctx: AgentContext<TState, TEvent>) => Promise<void>`.
- `server/src/agents/runtime/agent-registry.ts` — Changed internal `AnyAgentConfig` from `AgentConfig<any, any>` to `AgentConfig<BaseState, BaseEvent>` (removes explicit `any`). Added exported `registerAgent<TState, TEvent>()` helper that accepts a typed config and handles the internal widening with a single documented `as unknown as AnyAgentConfig` cast confined to this one function.
- `server/src/agents/runtime/shared-tools.ts` — New file. `createEmitTransparency<TState, TEvent>(config?)` factory returns an `AgentTool` that emits `{ type: 'transparency', message, stage }`. Optional `prefix` config prepends text to the message. Guards against empty messages (returns `{ success: false }` instead of emitting). Domain-agnostic — works with any state/event type.
- `server/src/agents/strategist/agent.ts` — Replaced `agentRegistry.register(strategistConfig as unknown as AgentConfig)` with `registerAgent(strategistConfig)`. Removed unused `import type { AgentConfig }`.
- `server/src/agents/craftsman/agent.ts` — Same registration cleanup as strategist.
- `server/src/agents/producer/agent.ts` — Same registration cleanup as producer.
- `server/src/agents/strategist/tools.ts` — Added `PipelineState`, `PipelineSSEEvent` to type imports. Added `import { createEmitTransparency }` from shared-tools. Replaced ~30-line local `emitTransparencyTool` definition with `createEmitTransparency<PipelineState, PipelineSSEEvent>()`.
- `server/src/agents/craftsman/tools.ts` — Same replacement. Removed now-unused `PipelineStage` import.
- `server/src/agents/producer/tools.ts` — Added `PipelineState`, `PipelineSSEEvent` to type imports. Replaced ~30-line local `emitTransparency` with `createEmitTransparency<PipelineState, PipelineSSEEvent>({ prefix: 'Producer: ' })`.
- `server/src/__tests__/strategist-tools.test.ts` — Updated 2 emit_transparency return value assertions: `result.success` → `result.emitted` (shared factory returns `emitted: true`, not `success: true`).
- `server/src/__tests__/producer-tools.test.ts` — Updated 2 assertions: (1) "returns the original message" now expects the prefixed message since the factory includes prefix in result; (2) "handles empty message via safeStr" now expects `{ success: false }` (factory rejects empty input instead of emitting an empty-prefix-only message).

### Decisions Made
- The `registerAgent()` helper keeps the `as unknown as AnyAgentConfig` cast internal to the registry module, making it a single documented widening point rather than scattered across all callers. This satisfies the story goal without introducing `eslint-disable` or `any`.
- The shared factory returns `{ emitted: true, message }` on success (matching Craftsman's prior behavior) rather than `{ success: true, message }` (Strategist's prior behavior). `emitted` is the semantic winner — it describes what happened. Tests updated accordingly.
- Empty message guard in shared factory: all three agents should guard against empty messages. Strategist and Craftsman already did. Producer did not (safeStr passed '' through). The factory enforces consistency by returning `{ success: false }`.

### Known Issues
- Pre-existing TypeScript error in `resumes-edit.test.ts:292` (null cast) — unrelated to Sprint 10.

### Next Steps
- Stories 1-4 and 8-9 remain in Sprint 10.

## 2026-03-01 — Session N
**Sprint:** 10 | **Story:** Story 7 — Fix MaxListenersExceededWarning
**Summary:** Prevent MaxListenersExceededWarning during full pipeline runs by proactively bumping AbortSignal listener limits at the points where accumulation is highest.

### Changes Made
- `server/src/agents/runtime/agent-loop.ts` — Added `import { setMaxListeners } from 'node:events'`. Added `setMaxListeners(50, ctx.signal)` before overall signal creation (ctx.signal accumulates one listener per concurrent tool call). Added `setMaxListeners(50, overallSignal)` after overall signal creation (overallSignal accumulates one listener per LLM call across all agent rounds).
- `server/src/lib/retry.ts` — Added `import { setMaxListeners } from 'node:events'`. Added proactive `setMaxListeners(20, options.signal)` at the start of `withRetry()` if a signal is provided. Each retry attempt calls fn() which may call createCombinedAbortSignal, adding listeners to the provided signal.
- `server/src/agents/positioning-coach.ts` — Bumped `setMaxListeners` on the per-attempt AbortController signal from 15 to 20, since retry can add multiple listener chains to the signal.
- `server/src/__tests__/agents-positioning.test.ts` — Updated test "normalizes suggestions to max 4 items" to use labels meeting the new 15-character minimum and expect max 5 (was 4) — fixes pre-existing test breakage from Story 1/2 changes to `normalizeQuestions()`.

### Decisions Made
- Setting limits on `ctx.signal` and `overallSignal` at 50 each: with 20 rounds × 3 tools/round in parallel scenarios, even though listeners are cleaned up in `finally`, they accumulate momentarily during concurrent execution. 50 gives comfortable headroom without masking real leaks.
- The `try/catch` around `setMaxListeners` in `withRetry` is defensive: some AbortSignal implementations (e.g. in test environments) may not support it.

### Known Issues
- Pre-existing TypeScript errors in `agent-registry.ts` (Sprint 10 Story 5) and `resumes-edit.test.ts` (unrelated) remain.
- 3 pre-existing test failures in `producer-tools.test.ts` and `strategist-tools.test.ts` from Story 1-6 changes not yet covered by test updates.

### Next Steps
- Verify no MaxListenersExceededWarning appears in a live pipeline run.

## 2026-03-01 — Sprint 9 Complete
**Sprint:** 9 | **Stories:** 1-7 (AI API Latency Reduction)
**Summary:** Reduce pipeline wall-clock time by 15-40% through parallel tool execution, model tier downgrades, adaptive max_tokens, and prompt-level tool batching instructions. 27 new tests (690 server total, 327 app total = 1017).

### Changes Made
- `server/src/agents/runtime/agent-protocol.ts` — Added `parallel_safe_tools?: string[]` and `loop_max_tokens?: number` to `AgentConfig`
- `server/src/agents/runtime/agent-loop.ts` — Replaced sequential tool execution with partition-based parallel execution (Promise.allSettled for parallel-safe tools, sequential for others, results reassembled in original order). Changed default max_tokens from 8192 to `config.loop_max_tokens ?? 4096`.
- `server/src/agents/strategist/agent.ts` — Configured `parallel_safe_tools: ['emit_transparency']`, `loop_max_tokens: 4096`
- `server/src/agents/craftsman/agent.ts` — Configured `parallel_safe_tools: ['check_keyword_coverage', 'check_anti_patterns', 'emit_transparency']`, `loop_max_tokens: 2048`
- `server/src/agents/producer/agent.ts` — Configured `parallel_safe_tools` for all 7 independent quality checks, `loop_max_tokens: 2048`
- `server/src/lib/llm.ts` — Downgraded `adversarial_review` from MODEL_PRIMARY to MODEL_MID (evaluation task, not creative writing)
- `server/src/agents/quality-reviewer.ts` — Changed model from MODEL_PRIMARY to MODEL_MID, reduced max_tokens from 6144 to 3072
- `server/src/agents/strategist/prompts.ts` — Rewrote workflow steps to batch compatible tools in same LLM rounds (parse+emit, benchmark+research together)
- `server/src/agents/producer/prompts.ts` — Rewrote workflow to batch independent checks into 2 parallel rounds (structural checks + content quality checks)
- `server/src/lib/feature-flags.ts` — Added `FF_SELF_REVIEW_LIGHT` flag (default false) for A/B testing self_review on MODEL_LIGHT
- `server/src/agents/craftsman/tools.ts` — Conditional model routing: `FF_SELF_REVIEW_LIGHT ? MODEL_LIGHT : MODEL_MID` for self_review_section
- `server/src/agents/section-writer.ts` — Adaptive max_tokens per section type (skills/education: 2048, summary: 3072, experience: 4096)
- `server/src/__tests__/agents-quality-reviewer.test.ts` — Updated test expectation for MODEL_MID
- `server/src/__tests__/agent-loop-parallel.test.ts` — New: 10 tests for parallel tool execution
- `server/src/__tests__/adaptive-max-tokens.test.ts` — New: 17 tests for adaptive max_tokens

### Bug Fixes
- `app/src/hooks/useAgent.ts` — Fixed infinite React render loop (removed `state` object from 6 dependency arrays)
- `app/src/hooks/useSSEConnection.ts` — Fixed infinite React render loop (removed `state` object from 5 dependency arrays)
- `server/src/routes/admin.ts` — Added `POST /api/admin/reset-rate-limits` endpoint for E2E test cleanup
- `e2e/helpers/cleanup.ts` — Added SSE rate-limit reset call in `cleanupBeforeTest()`
- `server/src/lib/retry.ts` — Fixed retry logic: internal LLM timeout AbortErrors now retried when outer signal is alive; added `'timed out'` to transient patterns to catch Z.AI timeout messages
- `e2e/helpers/pipeline-responder.ts` — Fixed questionnaire responder: detects new questionnaires during advance-wait loop instead of blocking 5 min
- `e2e/tests/full-pipeline.spec.ts` — Changed download from DOCX (requires paid plan) to PDF (free tier)
- `server/src/agents/strategist/agent.ts` — Increased `loop_max_tokens` from 4096 to 8192 (classify_fit/design_blueprint need larger token budget)

### E2E Verification
- Full pipeline E2E test **passing** (2/2 tests, 17.5 min)
- Pipeline wall-clock: **16.7 min** (down from ~28 min baseline = **40% reduction**)
- Phase timings: interview 218s, blueprint 74s, section writing 484s

### Decisions Made
- ADR-014: Parallel tool execution via `parallel_safe_tools` config (per-agent opt-in, Promise.allSettled for resilience)
- ADR-015: Downgrade adversarial_review from MODEL_PRIMARY to MODEL_MID (evaluation not creative writing)

### Estimated Impact
| Change | Time Saved |
|--------|-----------|
| Parallel tool execution | 3-8 min |
| adversarial_review downgrade | 0.5-2 min |
| Strategist prompt batching | 1-3 min |
| Adaptive max_tokens | 1-3 min |
| self_review LIGHT flag (when enabled) | 1-3 min |
| **Total** | **6-19 min (15-40%)** |

---

## 2026-02-28 — Sprint 8 Complete
**Sprint:** 8 | **Stories:** 1-14 (User Dashboard & Resume Management)
**Summary:** Full user dashboard with session history gallery, master resume viewer/editor, evidence library, and resume comparison. 4 new backend API endpoints, 13 new frontend components, 82 new tests (990 total).

### Changes Made
- `server/src/routes/sessions.ts` — Enriched GET /sessions with pipeline metadata, ?limit/status filters, company_name/job_title extraction from JSONB. New GET /sessions/:id/resume endpoint.
- `server/src/routes/resumes.ts` — New PUT /resumes/:id with partial update, version history, Zod validation. New GET /resumes/:id/history endpoint.
- `app/src/types/session.ts` — CoachSession interface extended with 7 optional pipeline metadata fields
- `app/src/hooks/useSession.ts` — Added listSessions filters, getSessionResume, updateMasterResume, getResumeHistory
- `app/src/App.tsx` — Added 'dashboard' view, URL routing, DashboardScreen rendering with full prop wiring
- `app/src/components/Header.tsx` — Added Dashboard nav button (auth-gated)
- `app/src/components/LandingScreen.tsx` — Added View Dashboard link
- `app/src/components/dashboard/DashboardScreen.tsx` — New 3-tab shell (sessions/master_resume/evidence_library)
- `app/src/components/dashboard/DashboardTabs.tsx` — Reusable tab bar with glass morphism styling
- `app/src/components/dashboard/DashboardSessionCard.tsx` — Rich session card with status badges, cost, time ago
- `app/src/components/dashboard/SessionHistoryTab.tsx` — Session gallery with status filter, compare mode
- `app/src/components/dashboard/SessionResumeModal.tsx` — Modal resume viewer with text export
- `app/src/components/dashboard/MasterResumeTab.tsx` — Full resume viewer + inline editor with version history
- `app/src/components/dashboard/ExperienceCard.tsx` — Expandable experience with per-bullet editing
- `app/src/components/dashboard/SkillsCategoryCard.tsx` — Skills category with add/remove
- `app/src/components/dashboard/EditableField.tsx` — Click-to-edit inline text field
- `app/src/components/dashboard/EvidenceLibraryTab.tsx` — Evidence browser with source filter + search
- `app/src/components/dashboard/EvidenceItemCard.tsx` — Evidence card with colored source badges
- `app/src/components/dashboard/ResumeComparisonModal.tsx` — Side-by-side resume comparison
- `app/src/components/dashboard/ComparisonSectionBlock.tsx` — Section diff block with change highlighting

### Decisions Made
- ADR-013: Dashboard Architecture — prop-drilling from App.tsx through DashboardScreen to tab components; temporary inline API helpers replaced by useSession hook functions after merge

### Known Issues
- None identified

### Next Steps
- E2E test expansion for dashboard flows
- AI-powered evidence curation suggestions (backlogged)

## 2026-02-28 — Sprint 7 Complete
**Sprint:** 7 | **Stories:** 1-15 (Commerce Platform)
**Summary:** Full commerce platform — billing UI, discount codes, entitlements, affiliates, legacy cleanup, 47 new tests.

### Changes Made
- `app/src/App.tsx` — Extended View type with pricing/billing/affiliate, URL detection, checkout params, referral code capture
- `app/src/components/Header.tsx` — Added Pricing, Billing, Affiliate nav links
- `app/src/components/PricingPage.tsx` — Promo code input, referral badge, referral code in checkout
- `app/src/components/panels/CompletionPanel.tsx` — DOCX export entitlement check with upgrade prompt
- `app/src/components/AffiliateDashboard.tsx` — New affiliate dashboard component
- `server/src/routes/billing.ts` — allow_promotion_codes, validate-promo endpoint, referral tracking in webhook
- `server/src/routes/admin.ts` — Admin endpoints for promo codes and feature overrides
- `server/src/routes/affiliates.ts` — Affiliate profile and events API
- `server/src/lib/entitlements.ts` — getUserEntitlements, hasFeature, getFeatureLimit
- `server/src/lib/affiliates.ts` — Referral code resolution, event tracking, commission calculation
- `server/src/lib/stripe-promos.ts` — Stripe promotion code helpers
- `server/src/lib/usage-persistence.ts` — Changed from .upsert() to .rpc('increment_user_usage')
- `server/src/middleware/feature-guard.ts` — requireFeature() middleware factory
- `server/src/middleware/subscription-guard.ts` — Refactored to use getUserEntitlements()
- `server/src/routes/resumes.ts` — DOCX export gated behind requireFeature('export_docx')
- `server/src/routes/sessions.ts` — Removed all legacy agent imports, cleaned up SSE types
- `server/src/agent/` — DELETED entirely (~4,543 lines)
- `server/src/agents/pipeline.ts` — DELETED (~4,110 lines)
- 5 new migrations: usage upsert RPC, promo tracking columns, plan_features, user_feature_overrides, affiliate system
- 47 new tests across 4 new test files + 2 extended test files

### Decisions Made
- ADR-010: Stripe Promotion Codes (vs custom coupon tables)
- ADR-011: Feature Entitlements Model (plan_features + user_feature_overrides)
- ADR-012: Affiliate Commission Structure (in-app tracking, manual payouts)

## 2026-02-28 — Session 12: Sprint 6 Completion (13/13 stories)
**Sprint:** 6 | **Story:** 13 — Sprint 6 Retrospective + Consolidation
**Summary:** Fixed all TypeScript errors and test regressions across agent-written code. Installed stripe package, fixed billing.ts Stripe type issues (billing_cycle_anchor computation), fixed billing.test.ts casts, added requestAnimationFrame polyfill for hook tests. Final counts: 577 server tests, 281 app tests (858 total), both TypeScript clean.

### Changes Made
- `server/src/routes/billing.ts` — Fixed Stripe `current_period_start`/`current_period_end` type errors by computing period from `billing_cycle_anchor` timestamp (typed in Stripe SDK)
- `server/src/__tests__/billing.test.ts` — Fixed 11 `Record<string, unknown>` → `PostgrestQueryBuilder` cast errors by adding intermediate `as unknown` casts
- `app/src/__tests__/hooks/useSSEEventHandlers.test.ts` — Added `requestAnimationFrame`/`cancelAnimationFrame` polyfill in `beforeAll` for Node test environment; simplified rAF spy test to use polyfill
- `server/package.json` — Added `stripe` and `ioredis` as production dependencies
- `docs/CURRENT_SPRINT.md` — All 13 stories marked done
- `docs/SPRINT_LOG.md` — Sprint 6 Retrospective appended
- `docs/CHANGELOG.md` — Consolidated all Sprint 6 entries

### Decisions Made
- Stripe billing period derived from `billing_cycle_anchor` (a typed Stripe field) instead of `current_period_start`/`current_period_end` (deprecated in Stripe SDK v20 types)

### Next Steps
- Run full E2E pipeline test to verify no behavioral regressions from frontend refactoring
- Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to server `.env` for production billing
- Wire PricingPage and BillingDashboard into app routing

## 2026-02-28 — Session 11.5: Sprint 6 Stories 1-5, 9, 11 — Frontend Refactoring + Backend Hardening + Hook Tests
**Sprint:** 6 | **Stories:** 1, 2, 3, 4, 5, 9, 11
**Summary:** Split two god files (useAgent.ts 1920→423 lines, CoachScreen.tsx 2016→864 lines), added Zod LLM output validation, deprecated legacy code, documented deployment and SSE scaling strategy, added 135 frontend hook tests.

### Changes Made — Story 1: Split useAgent.ts
- `app/src/hooks/useAgent.ts` — Reduced from 1920 to 423 lines. Now a thin orchestrator composing 5 focused hooks.
- `app/src/hooks/usePipelineStateManager.ts` — New (389 lines). All 25+ useState and 20+ useRef hooks, state initialization and reset.
- `app/src/hooks/useSSEConnection.ts` — New (212 lines). SSE fetch connection, disconnect, reconnect with exponential backoff.
- `app/src/hooks/useSSEDataValidation.ts` — New (280 lines). safeParse(), asStringArray(), asGapClassification(), SUGGESTION_LIMITS, VALID_INTENTS, sanitizeSectionContextPayload().
- `app/src/hooks/useSSEEventHandlers.ts` — New (1437 lines). Named handler functions for all SSE event types, createSSEEventRouter().
- `app/src/hooks/useStaleDetection.ts` — New (66 lines). 120s stall detection + 12s fallback status poll.

### Changes Made — Story 2: Split CoachScreen.tsx
- `app/src/components/CoachScreen.tsx` — Reduced from 2016 to 864 lines. Layout + navigation orchestration only.
- `app/src/components/BenchmarkInspectorCard.tsx` — New (399 lines). Assumption editing, version history, confidence display.
- `app/src/components/CoachScreenBanners.tsx` — New (431 lines). 7 banner components: ErrorBanner, WorkflowErrorBanner, PipelineActivityBanner, RuntimeRecoveryBanner, WorkflowActionBanner, WorkflowReplanBanner, WorkflowPreferencesCard.
- `app/src/components/QuestionsNodeSummary.tsx` — New (264 lines). Question metrics, reuse savings, rationale.
- `app/src/components/SectionsNodeSummary.tsx` — New (95 lines). Bundle review progress.
- `app/src/lib/coach-screen-utils.tsx` — New (243 lines). Snapshot storage, formatters, node status mapping, placeholder renderer.

### Changes Made — Story 3: Add Zod Schemas
- `server/src/agents/schemas/strategist-schemas.ts` — New (176 lines). Zod schemas for build_benchmark, classify_fit, design_blueprint outputs.
- `server/src/agents/schemas/craftsman-schemas.ts` — New (65 lines). Schemas for self_review_section, keyword coverage, anti-patterns, evidence integrity.
- `server/src/agents/schemas/producer-schemas.ts` — New (89 lines). Schemas for adversarial_review, ats_compliance, humanize_check, narrative_coherence.
- `server/src/agents/strategist/tools.ts` — Added .safeParse() after repairJSON in build_benchmark, classify_fit, design_blueprint.
- `server/src/agents/craftsman/tools.ts` — Added .safeParse() for self_review_section, check_evidence_integrity. Score coercion: `Number(validated.score) || 6`.
- `server/src/agents/producer/tools.ts` — Added .safeParse() for adversarial_review, ats_compliance, humanize_check, narrative_coherence.
- `server/src/__tests__/zod-schemas.test.ts` — New (594 lines). Schema validation edge case tests.

### Changes Made — Story 4: Legacy Code Cleanup
- `server/src/agents/pipeline.ts` — Added @deprecated JSDoc banner (replaced by coordinator.ts)
- `server/src/agent/loop.ts` — Added @deprecated JSDoc banner (legacy chat route only)
- `docs/ARCHITECTURE.md` — Added Legacy Code section with route-to-module mapping table
- `docs/BACKLOG.md` — Removed 11 completed stories, added "Decommission legacy agent/" story

### Changes Made — Story 5: Fix Deployment Configuration
- `app/.env.example` — Added VITE_API_URL documentation
- `docs/DEPLOYMENT.md` — New. Full deployment architecture (Vercel frontend, Railway backend, Supabase DB, env vars, CORS config)

### Changes Made — Story 9: SSE Broadcasting Architecture Doc
- `docs/DECISIONS.md` — Added ADR-008: SSE Broadcasting Strategy
- `docs/SSE_SCALING.md` — New. 3-phase scaling strategy with architecture diagrams and migration path

### Changes Made — Story 11: Frontend Hook Tests
- `app/src/__tests__/hooks/useSSEDataValidation.test.ts` — New (373 lines). 43 tests: safeParse, asStringArray, asGapClassification, asPriorityTier, asReplanStaleNodes, SUGGESTION_LIMITS, VALID_INTENTS, sanitizeSectionContextPayload.
- `app/src/__tests__/hooks/useSSEEventHandlers.test.ts` — New (1043 lines). 80 tests: all handler functions with mock PipelineStateManager + createSSEEventRouter.
- `app/src/__tests__/hooks/useStaleDetection.test.ts` — New (12 tests). Stall detection threshold, guard conditions, interval wiring.

### Decisions Made
- coach-screen-utils.tsx (not .ts) because it contains JSX for renderNodeContentPlaceholder
- Zod schemas use .passthrough() to avoid breaking on extra LLM response fields
- Schema validation fails gracefully: logs warning + falls back to raw data (never crashes pipeline)
- vercel.json hardcoded URL kept as-is — Vercel doesn't support env vars in rewrite rules. Frontend already supports VITE_API_URL via api.ts.

## 2026-02-28 — Session 11: Sprint 6 Stories 6+7 — Usage Flush + DB Pipeline Limits
**Sprint:** 6 | **Story:** 6 + 7
**Summary:** Periodic token usage flush to DB (delta-based, 60s interval) and cross-instance pipeline capacity guard using session_locks table.

### Changes Made
- `server/src/lib/usage-persistence.ts` — New file. `flushUsageToDb(sessionId, userId, totals)` writes token deltas to `user_usage` table via upsert. Tracks flushed watermarks per session so each flush only writes the delta since the last successful flush. Watermark does not advance on DB error (retry on next flush). `clearUsageWatermark()` removes watermark after final flush. Lazy import of `supabase.js` to avoid module-load throw in unit tests that don't mock supabase.
- `server/src/lib/llm-provider.ts` — Updated `startUsageTracking(sessionId, userId?)` to accept optional `userId`. When `userId` provided, sets up a `setInterval` (60s) that calls `flushUsageToDb` with the current accumulator snapshot. Updated `stopUsageTracking(sessionId)` to clear the interval and do a final flush before deleting the accumulator. Added import of `flushUsageToDb` and `clearUsageWatermark` from `usage-persistence.js`.
- `server/src/agents/coordinator.ts` — Updated `startUsageTracking(session_id)` call to pass `user_id` as second arg so periodic flushes are attributed to the correct user.
- `server/src/routes/pipeline.ts` — Added `MAX_GLOBAL_PIPELINES` constant (env: `MAX_GLOBAL_PIPELINES`, default 10). Added DB-backed global pipeline capacity check inside `POST /start` handler: queries `session_locks` count for active locks within `IN_PROCESS_PIPELINE_TTL_MS`, returns 503 `CAPACITY_LIMIT` if at/over limit. Fails open on DB errors (logs warn, allows pipeline).
- `server/src/__tests__/usage-persistence.test.ts` — New file. 7 tests: skip when delta zero, correct delta on first flush, watermark advances per flush, no watermark advance on DB error, final flush captures remaining data, clearUsageWatermark removes entry, safe to clear nonexistent session.
- `server/src/__tests__/pipeline-limits.test.ts` — New file. 4 tests: 503 CAPACITY_LIMIT when count >= limit, no CAPACITY_LIMIT when count below limit, fail-open on DB throw, fail-open on DB error object.

### Decisions Made
- Delta-based flushing: avoids writing cumulative totals on every call; the Supabase upsert adds the delta (not the total) because the `user_usage` table accumulates across flushes via the `ON CONFLICT DO UPDATE` clause.
- Lazy supabase import in `usage-persistence.ts`: prevents `SUPABASE_URL` environment variable check from throwing at module load time in unit tests that use `vi.resetModules()`.
- `MAX_GLOBAL_PIPELINES` defaults to 10 (conservative default for new deployments). Existing `MAX_RUNNING_PIPELINES_GLOBAL` (default 1500) is the coach_sessions-based limit that was already present; the new check is an additional cross-instance guard using the session_locks table.
- Fail-open on both the existing and new DB capacity checks — infrastructure failures must never block user pipelines.

### Known Issues
- The `user_usage` upsert adds the delta to the existing row, but the Supabase `upsert` with `onConflict` does a full replace (not increment). A future migration should add a `INCREMENT` RPC or use a trigger to properly accumulate. For now this is a known limitation (Story 6 delivers the periodic flush infrastructure; the accumulation logic is correct for single-instance deployments).

### Next Steps
- Stories 8-9: Redis rate limiting + SSE broadcast architecture doc.

## 2026-02-28 — Session 10: Sprint 6 Story 12 — Stripe Billing Integration
**Sprint:** 6 | **Story:** 12 — Stripe Billing Integration
**Summary:** Full Stripe billing integration: Checkout, webhooks, Customer Portal, subscription guard middleware, pricing page, and billing dashboard. TypeScript clean on both app and server.

### Changes Made
- `server/src/lib/stripe.ts` — New file. Exports `stripe` (Stripe client or null if unconfigured) and `STRIPE_WEBHOOK_SECRET`. Logs a warning when `STRIPE_SECRET_KEY` is not set so billing degrades gracefully in dev.
- `server/src/routes/billing.ts` — New file. 4 endpoints: `POST /checkout` (create Stripe Checkout session), `POST /webhook` (Stripe webhook handler — no auth), `GET /subscription` (current plan + usage), `POST /portal` (Stripe Customer Portal). Webhook handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- `server/src/middleware/subscription-guard.ts` — New file. Middleware applied to `POST /api/pipeline/start`. Allows active paid subscriptions (status `active` or `trialing`). Free plan: allows up to `FREE_TIER_PIPELINE_LIMIT` (default 3) pipeline runs per calendar month. Returns 402 with machine-readable `code: 'FREE_TIER_LIMIT_EXCEEDED'` when limit is reached. Fails open on DB errors.
- `server/src/routes/pipeline.ts` — Added import for `subscriptionGuard`. Wired `subscriptionGuard` middleware into `pipeline.post('/start', ...)` handler chain.
- `server/src/index.ts` — Added import for `billing` route. Added `app.route('/api/billing', billing)`.
- `supabase/migrations/20260228150000_stripe_billing.sql` — Adds `stripe_price_id TEXT` column to `pricing_plans`. Uses `ADD COLUMN IF NOT EXISTS` for safety.
- `app/src/components/PricingPage.tsx` — New component. Displays 3 plan tiers (Free / Starter / Pro) with hardcoded features list matching DB seed plans. Click calls `/api/billing/checkout` and redirects to Stripe. Shows current plan indicator. Glass morphism design.
- `app/src/components/BillingDashboard.tsx` — New component. Fetches subscription + usage from `/api/billing/subscription`. Shows current plan badge, status indicator, usage progress bar. "Manage" button opens Customer Portal (paid subscribers). "Upgrade" button starts Checkout (free users). Refresh button.
- `server/src/__tests__/billing.test.ts` — New test file. 11 tests covering: subscription guard allows active subscription, allows trialing, blocks exceeded free tier, allows under limit, allows no usage record, allows no subscription row, fails open on DB error. Webhook signature verification: no-signature case, valid signature, invalid signature. Checkout session creation: correct parameters, Stripe error handling.
- `docs/DECISIONS.md` — Added ADR-009: Stripe as Payment Processor.

### Decisions Made
- Stripe features return 503 (not 500) when `STRIPE_SECRET_KEY` is not set. This makes it easy to detect misconfiguration vs. server errors.
- Subscription guard fails open on all DB errors — we never block a user due to our own infrastructure issues.
- Webhook error handler returns 200 (with error body) to prevent Stripe from retrying server-side errors. Only signature failures return 400.
- Free tier limit is env-var overridable (`FREE_TIER_PIPELINE_LIMIT`) for testing and future plan changes.
- `PricingPage.tsx` hardcodes plan features (not fetched from DB) — plan features are marketing copy, not DB data.

### Known Issues
- `stripe` npm package must be installed: `cd server && npm install stripe`. TypeScript types for `Stripe.Subscription.current_period_start/end` are Unix timestamps — linter cast to `unknown` on those fields.

### Next Steps
- Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to server `.env` for local testing.
- Set `stripe_price_id` on each plan row after creating Stripe products/prices.
- Wire `PricingPage` and `BillingDashboard` into app routing (e.g., landing screen or settings modal).
- Story 13: Sprint 6 Retrospective.

## 2026-02-28 — Session 9: Sprint 6 Story 10 — Frontend Component Tests: Panels
**Sprint:** 6 | **Story:** 10 — Frontend Component Tests — Panels
**Summary:** Added 60 new panel component tests across 5 test files covering panel dispatch, validation, and interactive behavior. Total app test count moves from 103 to 189 (86 pre-existing + 60 new panel tests + 43 hook/lib tests). All tests pass. TypeScript clean.

### Changes Made
- `app/src/__tests__/panels/panel-renderer.test.tsx` — 21 tests: panel dispatch for all 9 panel types, null panelData fallback to ResumePanel, validatePanelData for all panel types (happy path + invalid payloads), PanelErrorBoundary renders validation error message
- `app/src/__tests__/panels/PositioningInterviewPanel.test.tsx` — 8 tests: renders question text, progress counter, suggestion cards, submit disabled with no input, submit enabled after typing, onRespond callback fires with correct args, needsElaboration gates submit for inferred suggestions, loading state when no current_question
- `app/src/__tests__/panels/BlueprintReviewPanel.test.tsx` — 7 tests: renders target role and positioning angle, renders section order list, approve button calls onApprove without args, edit mode toggle via angle click, move-up reorder changes button label, approve with edits sends edits object
- `app/src/__tests__/panels/QualityDashboardPanel.test.tsx` — 12 tests: header, score rings (ATS, Authenticity), keyword coverage, overall assessment, empty/non-empty ATS findings, expandable ATS findings, risk flags, checklist breakdown, minimal data, coherence issues
- `app/src/__tests__/panels/CompletionPanel.test.tsx` — 12 tests: header, stat badges (ATS, reqs met, sections), DOCX/PDF/text export buttons, unavailable message for null resume, save-as-base section present/absent based on handler, positioning summary section, ready-to-export status

### Decisions Made
- Panel sub-components (PositioningInterviewPanel, BlueprintReviewPanel, etc.) mocked in panel-renderer.test.tsx to keep tests unit-level and fast; no mocking within individual component test files so real component logic is exercised.
- CompletionPanel mocks export libraries (export-docx, export-pdf, export, export-filename, etc.) to prevent DOM API calls (Blob, clipboard) from failing in jsdom.
- Used `aria-label` attributes for precise button targeting rather than brittle text queries.

### Known Issues
- None introduced.

### Next Steps
- Story 11: Frontend Hook Tests — useAgent Split Hooks (depends on Story 1: Split useAgent.ts)

## 2026-02-28 — Session 8: Sprint 6 Story 8 — Redis-Backed Rate Limiting
**Sprint:** 6 | **Story:** 8 — Redis-Backed Rate Limiting
**Summary:** Wired Redis into the rate limiter behind `FF_REDIS_RATE_LIMIT` feature flag. Falls back to in-memory on any Redis error. Added 7 tests. TypeScript clean. Pre-existing 2 failures in positioning-hardening.test.ts unaffected.

### Changes Made
- `server/src/middleware/rate-limit.ts` — Added imports for `getRedisClient` and `FF_REDIS_RATE_LIMIT`. Added `checkRedisRateLimit()` function (fixed-window INCR+EXPIRE pattern). Modified `rateLimitMiddleware` to try Redis first and fall back to in-memory when Redis returns null.
- `server/src/__tests__/redis-rate-limit.test.ts` — 7 new tests: Redis INCR allows within limit, Redis INCR denies over limit (429), fallback when `getRedisClient` returns null, fallback when INCR throws, feature flag disabled bypasses Redis, EXPIRE TTL set correctly, EXPIRE skipped when counter already > 1.

### Decisions Made
- `X-RateLimit-Reset` on the Redis path reports `ceil(windowMs/1000)` (the window length) rather than remaining-seconds-in-current-window, because Redis keys are indexed by window slot and we do not store per-window start time in the middleware.
- EXPIRE is only applied when `count === 1` to avoid resetting the TTL on every request within the same window.
- In-memory `deniedDecisions`/`deniedByScope` stats are updated even when the Redis path is active, keeping `getRateLimitStats()` accurate for both backends.

### Known Issues
- None introduced. 2 pre-existing failures in `positioning-hardening.test.ts` (require Supabase env vars) remain.

### Next Steps
- Stories 6, 7, 9 remain for Sprint 6 Track 2 (usage flush, DB pipeline limits, SSE broadcast doc)

## 2026-02-28 — Session 7: Sprint 5 Completion (12/12 stories)
**Sprint:** 5 | **Stories:** 1-12
**Summary:** Post-audit hardening (6 bug fixes) + agent creative latitude (4 prompt/tool enhancements) + 34 new tests. Test count 556→590. TypeScript clean.

### Bug Fixes (Stories 1-5)
- `server/src/routes/pipeline.ts` — Story 1: Gate response idempotency via `responded_at` check
- `server/src/routes/pipeline.ts` — Story 4: Heartbeat linked to `runningPipelines` session lock
- `server/src/agents/craftsman/tools.ts` — Story 2: `filterDoNotIncludeTopics()` post-generation enforcement + export
- `server/src/agents/coordinator.ts` — Story 3: `MAX_REVISION_ROUNDS = 3` cap with per-section tracking
- `server/src/lib/json-repair.ts` — Story 5: Size guard moved to top of `repairJSON()` (before all processing)

### Agent Creative Latitude (Stories 7-10)
- `server/src/agents/strategist/prompts.ts` — Story 7: Coverage assessment, adaptive stopping, repeat-user question reduction
- `server/src/agents/craftsman/prompts.ts` — Story 8: Section Ordering Authority with transparency requirement
- `server/src/agents/producer/tools.ts` — Story 9: `request_content_revision` severity field (revision/rewrite)
- `server/src/agents/producer/prompts.ts` — Story 9: Rewrite vs revision triage guidance
- `server/src/agents/coordinator.ts` — Story 9: Routes rewrites as fresh `write_section` calls
- `server/src/agents/runtime/agent-loop.ts` — Story 10: `extractDroppedMessageSummary()` for richer context compaction

### Tests (Story 11)
- `server/src/__tests__/sprint5-fixes.test.ts` — 34 new tests: idempotency (6), do_not_include (7), revision cap (4), heartbeat (4), JSON repair (6), producer validation (5+2)

### Decisions Made
- Story 6 required no code changes — all 3 LLM-backed Producer tools already follow consistent validation
- Rewrite requests count against the same `MAX_REVISION_ROUNDS` cap as revisions (no separate budget)

### Known Issues
- E2E test expansion still deferred (repeat-user, blueprint-rejection flows)

### Next Steps
- Sprint 6 planning: E2E test expansion, potential new features from backlog

## 2026-02-28 — Session 6: Sprint 4 Completion (21/22 stories)
**Sprint:** 4 | **Stories:** 1-9, 11-22 (all except Story 10 E2E)
**Summary:** Completed Sprint 4 in full — 5 bug fixes, 248 new tests, 6 UX improvements, 5 platform prep stories. Test count 306→556. TypeScript clean on both server and app.

### Bug Fixes (Stories 1-5)
- `app/src/App.tsx` — Story 1: Added isPipelineGateActive guard + optimistic disable on handlePipelineRespond
- `server/src/agents/gap-analyst.ts` — Story 2: `significant` selection now upgrades to `strong` without requiring custom text
- `server/src/agents/types.ts` — Story 3: Added `approved_sections: string[]` to PipelineState
- `server/src/agents/craftsman/tools.ts` — Story 3: `present_to_user` tracks approvals via ctx.getState()/updateState()
- `server/src/agents/coordinator.ts` — Story 3: Filters out approved sections from revision instructions
- `server/src/agents/producer/tools.ts` — Story 17: `request_content_revision` rejects approved sections
- `server/src/agents/runtime/agent-loop.ts` — Story 4: Sliding window compaction (MAX_HISTORY=30, KEEP_RECENT=20)
- `app/src/lib/export-pdf.ts` — Story 5: Replaced hand-rolled PDF with jsPDF for proper WinAnsi Unicode support

### Test Coverage (Stories 6-9, 11 — 248 new tests)
- `server/src/__tests__/coordinator.test.ts` — 30 coordinator integration tests
- `server/src/__tests__/strategist-tools.test.ts` — 31 strategist tool unit tests
- `server/src/__tests__/craftsman-tools.test.ts` — 35 craftsman tool unit tests
- `server/src/__tests__/producer-tools.test.ts` — 39 producer tool unit tests
- `server/src/__tests__/pipeline-respond.test.ts` — 11 gate response tests
- `server/src/__tests__/revision-loop.test.ts` — 16 revision loop tests
- `server/src/__tests__/craftsman-checks.test.ts` — 46 anti-pattern/keyword tests
- `app/src/__tests__/export-pdf.test.ts` — 20 PDF export tests (Unicode, null-safety, sections)
- `app/src/__tests__/export-docx.test.ts` — 20 DOCX export tests (preflight, fonts, fallbacks)

### UX Polish (Stories 12-16)
- `app/src/components/panels/QualityDashboardPanel.tsx` — Story 12: All 7 quality dimensions with collapsible details
- `app/src/types/panels.ts` — Story 12: Extended QualityDashboardData with 6 new optional fields
- `server/src/agents/coordinator.ts` — Story 12: Emits comprehensive quality_scores from Producer scratchpad
- `app/src/components/panels/SectionWorkbench.tsx` — Stories 13-14: min-h-0 scroll fix, responsive padding, 44px touch targets
- `server/src/agents/knowledge/formatting-guide.ts` — Story 15: 3 new templates (nonprofit, legal, creative-digital)
- `server/src/agents/producer/tools.ts` — Story 15: Template scoring heuristics for new templates
- `server/src/routes/sessions.ts` — Story 16: Exported AnySSEEvent and SSEEmitterFn types

### Platform Prep (Stories 18-21)
- `server/src/agents/runtime/agent-protocol.ts` — Story 18: Generic types (AgentTool<TState,TEvent>, etc.)
- `server/src/agents/runtime/agent-registry.ts` — Story 19: Agent registry with domain:name lookup
- `server/src/agents/strategist/agent.ts` — Story 19: Self-registers with agentRegistry
- `server/src/agents/craftsman/agent.ts` — Story 19: Self-registers with agentRegistry
- `server/src/agents/producer/agent.ts` — Story 19: Self-registers with agentRegistry
- `docs/PLATFORM_BLUEPRINT.md` — Story 20: 12-section platform architecture document
- `docs/DECISIONS.md` — Story 21: ADR-007 Redis Bus evaluation (rejected at current scale)
- `server/src/agents/runtime/agent-bus-redis.ts` — Story 21: Redis Streams prototype (feature-flagged)
- `server/src/lib/feature-flags.ts` — Story 21: Added FF_REDIS_BUS flag

### Decisions Made
- jsPDF with standard fonts (WinAnsi encoding) is sufficient for em-dashes, smart quotes, bullets, Latin-1 accented chars
- Redis Bus rejected at current scale (single-process, 1-4 messages per pipeline); revisit at 50+ concurrent sessions
- Runtime types made generic; product layer binds concrete types via type aliases

### Known Issues
- Story 10 (E2E Test Expansion) deferred — 28-min Z.AI latency per test run makes sprint-pace testing impractical
- jsPDF WinAnsi limitation — characters outside Latin-1/Windows-1252 still need font embedding
- Agent registry and direct imports are parallel systems in coordinator

### Next Steps
- Sprint 5 planning
- E2E test expansion (consider nightly job)
- Font embedding for full Unicode PDF support (if international users needed)

---

## 2026-02-28 — Session 5: Sprint 4 Story 18 — Extract Product-Specific Types from Runtime
**Sprint:** 4 | **Story:** 18 (Extract Product-Specific Types from Runtime)
**Summary:** Made the agent runtime layer domain-agnostic by removing all product-specific imports from `runtime/agent-protocol.ts`, `runtime/agent-context.ts`, and `runtime/agent-loop.ts`. Added generic type parameters to `AgentContext`, `AgentTool`, and `AgentConfig`. Added `ResumeAgentContext`, `ResumeAgentTool`, and `ResumeAgentConfig` type aliases to the product layer in `types.ts`.

### Changes Made
- `server/src/agents/runtime/agent-protocol.ts` — Removed `import type { PipelineSSEEvent, PipelineState }`. Added `BaseEvent` and `BaseState` local base types. Made `AgentContext`, `AgentTool`, and `AgentConfig` generic with `TState extends BaseState` and `TEvent extends BaseEvent` type parameters (defaulting to the base types). Made `toToolDef` generic to accept any `AgentTool<TState, TEvent>`. Module now has zero product imports.
- `server/src/agents/runtime/agent-context.ts` — Removed `import type { PipelineSSEEvent, PipelineState }`. Made `CreateContextParams` and `createAgentContext` generic with the same `TState`, `TEvent` type parameters. Module now has zero product imports.
- `server/src/agents/runtime/agent-loop.ts` — Removed `import type { PipelineStage }`. Made `RunAgentParams` and `runAgentLoop` generic. Made `executeToolWithTimeout` generic. The transparency emit uses `(ctx.getState() as Record<string, unknown>)['current_stage']` to avoid product type dependency. Module now has zero product imports.
- `server/src/agents/runtime/index.ts` — Added `BaseEvent` and `BaseState` to exports.
- `server/src/agents/types.ts` — Added `import type { AgentContext, AgentTool, AgentConfig }` from runtime layer. Added `ResumeAgentContext`, `ResumeAgentTool`, `ResumeAgentConfig` type aliases that bind the generic runtime types to `PipelineState` and `PipelineSSEEvent`.
- `server/src/agents/strategist/tools.ts` — Updated import to use `ResumeAgentTool`, `ResumeAgentContext` from `../types.js` instead of base generic types.
- `server/src/agents/craftsman/tools.ts` — Same import update.
- `server/src/agents/producer/tools.ts` — Same import update.
- `server/src/agents/strategist/agent.ts` — Updated to use `ResumeAgentConfig`. Registration call uses `as unknown as AgentConfig` type erasure cast for the registry.
- `server/src/agents/craftsman/agent.ts` — Same pattern.
- `server/src/agents/producer/agent.ts` — Same pattern.
- `server/src/__tests__/craftsman-checks.test.ts` — Updated `makeCtx()` to return `ResumeAgentContext` instead of `AgentContext`.
- `server/src/__tests__/craftsman-tools.test.ts` — Same update.
- `server/src/__tests__/strategist-tools.test.ts` — Same update.
- `server/src/__tests__/producer-tools.test.ts` — Same update.

### Decisions Made
- Generic type parameters with base type defaults chosen over product-specific types in the runtime protocol. This allows any future product to use the runtime without coupling to the resume domain.
- `as unknown as AgentConfig` type erasure used in `agentRegistry.register()` calls. This is the TypeScript-idiomatic way to handle invariant generics in a type-erased registry. The registry is used only for side-effect registration; the coordinator always uses the fully-typed product configs directly.
- Test files updated to use `ResumeAgentContext` since tool `execute` signatures now require the product-specific context type.

### Known Issues
- None introduced by this story.

### Next Steps
- Story 3: Fix revision loop after user approves a section
- Story 5: Fix PDF Unicode rendering
- Story 6: Begin coordinator integration test suite

---

## 2026-02-28 — Session 4: Sprint 4 Story 21 — Redis Bus Spike
**Sprint:** 4 | **Story:** 21 (Redis Agent Bus Spike)
**Summary:** Evaluated three Redis options (pub/sub, sorted sets, streams) as replacements for the in-memory AgentBus. Concluded Redis is premature at current scale. Wrote ADR-007 documenting the full evaluation and decision. Created a feature-flagged proof-of-concept Redis Streams implementation as an executable reference for future scaling work.

### Changes Made
- `docs/DECISIONS.md` — Appended ADR-007 covering Redis pub/sub vs streams vs sorted sets evaluation, ordering guarantees, durability, latency, operational complexity, and the final rejection decision with documented reasoning and future revisit criteria.
- `server/src/lib/feature-flags.ts` — Added `FF_REDIS_BUS` flag (default: false). Documents the env vars required to activate the Redis bus (`REDIS_URL`) and explicitly warns not to enable in production until agent loops are resumable and horizontal scaling is actually required.
- `server/src/agents/runtime/agent-bus-redis.ts` — New file. Complete `AgentBusRedis` class implementing the same `subscribe / unsubscribe / send / getLog / reset` interface as `AgentBus`. Uses Redis Streams (XADD/XREADGROUP/XACK). Features: monotonically-ordered delivery, at-least-once guarantees via consumer groups, XPENDING reclaim for crash recovery, MAXLEN 1000 stream trimming, graceful disconnect. Includes a `createAgentBus()` factory and a coordinator integration example in JSDoc. Uses a locally-defined `MinimalRedis` stub so the file compiles without ioredis installed.

### Decisions Made
- Redis Streams chosen over pub/sub (no durability, at-most-once) and sorted sets (pull-polling, no push) as the strongest Redis option if Redis were ever adopted.
- Rejected Redis adoption at current scale: all agents run in the same process, message volume is 1-4 per pipeline run, crash recovery is handled at the pipeline checkpoint level not the bus level, and operational cost (~$20-60/month managed Redis) is not justified.
- ioredis not installed as a runtime dependency — prototype uses a `MinimalRedis` interface stub that compiles cleanly and throws a descriptive error if accidentally invoked.
- `FF_REDIS_BUS` feature flag added to `feature-flags.ts` — documented but inert (default: false).

### Known Issues
- Pre-existing TypeScript errors in coordinator.ts, strategist/craftsman/producer tools.ts, and test files remain unchanged. None are introduced by this story. New files (`agent-bus-redis.ts`, `feature-flags.ts` additions) have zero type errors.

### Next Steps
- Story 3: Fix revision loop after user approves a section
- Story 5: Fix PDF Unicode rendering
- Story 6: Begin coordinator integration test suite

---

## 2026-02-28 — Session 3: Sprint 4 Story 20 — Platform Architecture Document

**Sprint:** 4 | **Story:** 20 (Platform Architecture Document)
**Summary:** Wrote `docs/PLATFORM_BLUEPRINT.md`, a comprehensive engineering reference for the 33-agent platform that the resume product is built on.

### Changes Made
- `docs/PLATFORM_BLUEPRINT.md` — Created. Covers: platform overview and vision, agent runtime contract (`AgentConfig`, `AgentTool`, `AgentContext`, `AgentResult`), agent loop mechanics (rounds, timeouts, compaction, retry, model routing), bus protocol (message format, message types, routing, current flows), coordinator pattern (gates, state handoff, feature flags, error handling), product vs runtime type separation (current coupling, target generics pattern, why it matters), step-by-step guide to adding a 4th agent, step-by-step guide to adding a new product, distributed bus requirements (Redis/NATS design questions, what would change vs what would not), capability-based context (future cross-product pattern), multi-product routing, open questions table, and appendices (file reference, glossary).

### Decisions Made
- Document written to `docs/PLATFORM_BLUEPRINT.md` (not `docs/PLATFORM_ARCHITECTURE.md` as the sprint story initially suggested) to match the story's acceptance criteria which specified `PLATFORM_BLUEPRINT.md`.
- Covered Story 19 (Agent Registry) design implications in the "Adding a New Agent" section so the story has an architectural reference before implementation begins.
- Documented the current `agent-protocol.ts` coupling to `PipelineSSEEvent`/`PipelineState` as a known issue pointing to Story 18, not as something to fix in this documentation-only task.

### Known Issues
- None introduced. This is a documentation-only task — no code changes.

### Next Steps
- Story 18: Extract product types from runtime (prerequisite for Story 19)
- Story 19: Agent registry
- Story 3: Fix revision loop after user approves a section

---

## 2026-02-28 — Session 2: Sprint 4 Story 14 — Additional Resume Templates

**Sprint:** 4 | **Story:** 14 (Additional Resume Templates)
**Summary:** Added 3 new executive resume templates (Non-Profit Mission-Driven, Legal & Regulatory Executive, Creative & Digital Executive), bringing the total from 5 to 8. All three templates are fully integrated into the scoring heuristic, producer guide, and the markdown specification file.

### Changes Made
- `server/src/agents/knowledge/formatting-guide.ts` — Added 3 new entries to `EXECUTIVE_TEMPLATES` (`nonprofit-mission`, `legal-regulatory`, `creative-digital`) with id, name, best_for, font, and accent fields matching the existing `as const` shape. Updated the jsdoc comment from "5" to "8". Extended the condensed `getProducerFormattingGuide()` string with the 3 new rows in the selection matrix table and 3 new template description blocks (Template 6, 7, 8) so the Producer LLM has the correct context.
- `server/src/agents/producer/tools.ts` — Added 3 new heuristic scoring blocks in the `select_template` tool's `EXECUTIVE_TEMPLATES.map()` loop. Each block adds +5 to the matching template's score when role title or industry keywords match the template's domain. Keyword sets: mission/nonprofit/NGO/philanthropy (Template 6), legal/regulatory/compliance/counsel/GC (Template 7), CMO/marketing/digital/brand/growth/product (Template 8).
- `server/src/agent/resume-formatting-guide.md` — Updated the section heading from "THE 5 EXECUTIVE RESUME TEMPLATES" to "THE 8 EXECUTIVE RESUME TEMPLATES". Added 3 new rows to the selection matrix. Added full specification sections for Template 6 (Non-Profit Mission-Driven), Template 7 (Legal & Regulatory Executive), and Template 8 (Creative & Digital Executive), each with layout table, section order, design elements, and writing guidance.

### Decisions Made
- Template IDs use kebab-case slugs (`nonprofit-mission`, `legal-regulatory`, `creative-digital`) consistent with the existing 5 templates.
- Font choices: Garamond (Template 6, institutional gravitas without corporate stiffness), Times New Roman (Template 7, legal profession convention), Calibri (Template 8, modern but ATS-safe — same as Template 2 and 5).
- Accent colors chosen to differentiate visually while remaining ATS-safe single-accent-only: Teal #1A6B6B, Dark Navy #0D2B55, Slate Blue #3A5A8C.
- Heuristic scoring approach matches the existing 5 templates exactly — no architectural changes to `select_template` were needed, only additional `if` blocks following the established pattern.
- The `industry-expert` template already covered "legal" via the `regulated industries` best_for text, but that match was indirect (keyword scoring on "regulated"). The dedicated `legal-regulatory` template now captures GC/CCO/compliance roles more precisely.

### Known Issues
- None introduced. `npx tsc --noEmit` passes on both `server/` and `app/`.

### Next Steps
- Story 3: Fix revision loop after user approves a section
- Story 5: Fix PDF Unicode rendering
- Story 6: Begin coordinator integration test suite

---

## 2026-02-28 — Session 1: Sprint 4 Phase 1 Quick Wins

**Sprint:** 4 | **Stories:** 1 (409 conflict fix), 2 (gap analyst classification), 13 (workbench scroll), 16 (SSE type safety)
**Summary:** Fixed four known bugs as fast-path wins to open Sprint 4: eliminated 409 conflict errors from the frontend gate collision, resolved the pre-existing gap analyst classification test failures, fixed workbench scroll overflow, and removed unsafe `as never` casts from the SSE type system.

### Changes Made
- `server/src/agents/strategist/gap-analyst.ts` — Renamed `significant` classification to `strong` and removed the requirement for custom explanation text on that tier. This resolved 2 pre-existing test failures in `agents-gap-analyst.test.ts` that were carried forward from Sprint 3.
- `app/src/App.tsx` — Added gate-active guard: when a `pipeline_gate` event is active, the send button is optimistically disabled and the frontend does not submit new messages until the gate is resolved. Prevents 409 Conflict responses from the pipeline route.
- `app/src/components/panels/workbench/SectionWorkbench.tsx` — Added `min-h-0` to the content column container, enabling flex child scrolling. Without this, long sections (10+ bullets) overflowed the viewport instead of scrolling within the workbench.
- `server/src/routes/sessions.ts` — Exported `AnySSEEvent` (discriminated union of all SSE event types) and `SSEEmitterFn` (typed emitter function signature) as named exports. These types were previously inlined and required `as never` casts at usage sites.
- `server/src/__tests__/sessions-runtime.test.ts` — Removed all `as never` casts from SSE event construction. Tests now use proper `AnySSEEvent` typed values.

### Decisions Made
- `significant` → `strong` rename: the term "strong" better reflects the executive positioning philosophy (candidates are well-qualified, not just "significant" fits). No downstream panel UI changes required since the classification label is internal to the agent loop.
- Gate-active guard uses optimistic disabling (immediate on gate event, re-enabled on gate resolution) rather than tracking in-flight HTTP status codes. This is simpler and covers the 409 root cause without adding retry logic.
- `AnySSEEvent` union defined in `sessions.ts` (the SSE route file) rather than a separate types file, since it is tightly coupled to the SSE emitter implementation in that module.

### Known Issues
- Stories 3, 4, 5 (revision loop, context forgetfulness, PDF Unicode) not yet started.
- Stories 6-22 (test coverage, UX polish, platform prep) not yet started.

### Next Steps
- Story 3: Fix revision loop after user approves a section (root cause: revision state not cleared on approval)
- Story 5: Fix PDF Unicode rendering (investigate font encoding in export-pdf.ts)
- Story 6: Begin coordinator integration test suite

---

## 2026-02-28 — Session: Sprint 3 Final Fix — Gate Response Replay Prevention

**Sprint:** 3 | **Stories:** 1 critical fix from final gap analysis
**Summary:** Fixed gate response consumption that silently continued on DB update failure, causing potential response replay and state corruption on pipeline restart.

### Changes Made
- `server/src/routes/pipeline.ts` — Changed gate response DB update failure from `logger.warn` + continue to `throw Error`. If the DB can't persist that a queued response was consumed, the pipeline now fails loudly instead of silently continuing with stale DB state that could replay the response on restart.

### Decisions Made
- Final gap analysis verified all other critical paths are clean: master resume merge, state mutations, heartbeat cleanup, abort signal handling, LLM streaming, evidence extraction, session locks, revision handler cleanup

---

## 2026-02-28 — Session: Sprint 3 Audit Round 6 — Final Medium/Low Sweep

**Sprint:** 3 | **Stories:** 5 fixes (4 false positives skipped)
**Summary:** Added observability logging for LLM parse failures in Producer and Craftsman. Made session deletion atomic with pipeline-running guard. Raised MaxListeners threshold. Reset blueprint edits on new data.

### Changes Made
- `server/src/agents/producer/tools.ts` — Log narrative coherence repairJSON failures with session_id context
- `server/src/agents/craftsman/tools.ts` — Log evidence integrity repairJSON failures with session_id + section context
- `server/src/routes/sessions.ts` — Atomic session delete: single DELETE ... WHERE pipeline_status != 'running' with RETURNING check, returns 409 on race
- `server/src/lib/llm-provider.ts` — MaxListeners threshold increased from 20 to 50
- `app/src/components/panels/BlueprintReviewPanel.tsx` — Reset editedAngle/editedOrder/editedSections on positioning_angle change

### Decisions Made
- Stale pipeline recovery (pipeline.ts) already uses updated_at + heartbeat — no additional check needed
- Rate limit eviction already implements LRU via Map delete+re-insert pattern
- respondToGate ref access is correct React pattern — refs don't need to be in deps
- SectionWorkbench keyboard handler cleanup is correct — React 18 handles unmounted setState

---

## 2026-02-28 — Session: Sprint 3 Audit Round 5 — Deep Production Hardening

**Sprint:** 3 | **Stories:** 20 fixes from 4-agent deep audit (68 findings reviewed, 4 false positives)
**Summary:** Fixed 2 critical shared-reference mutations in Strategist interview transcript, hardened all 3 agent tool files against malformed LLM responses and unsafe type casts, fixed SSE connection registration race, token cache expiry boundary bug, Content-Type validation gap, and added 4 DB hardening fixes (RLS policy, existence checks, FK indexes, orphan cleanup).

### Changes Made

#### Agent Tools — Critical/High Fixes
- `server/src/agents/strategist/tools.ts` — Clone interview_transcript array before mutation (both single and batch tools). Guard split() on non-string answers in classify_fit. Bounds-check experience[0] array access. Type-guard interview answer count. Validate interview category against enum whitelist.
- `server/src/agents/craftsman/tools.ts` — Validate self_review parsed response has required fields (score as number, issues as array). Type-check cross-section context content before slice.
- `server/src/agents/producer/tools.ts` — Null-guard blueprint.age_protection before accessing .flags. Bounds-check template scores array before [0] access.

#### Infrastructure Fixes
- `server/src/routes/sessions.ts` — Move SSE addSSEConnection after successful initial writeSSE to prevent dead emitter registration on connection failure.
- `server/src/lib/pending-gate-queue.ts` — Delete legacy buffered_gate/buffered_response fields after migrating to queue, preventing unbounded re-migration.
- `server/src/middleware/auth.ts` — Early return for already-expired tokens before Math.max floor; prevents caching expired JWTs for 1 second.
- `server/src/lib/http-body-guard.ts` — Require explicit application/json Content-Type; reject missing Content-Type with 415.

#### Frontend Fixes
- `app/src/hooks/useAgent.ts` — Clear staleCheckIntervalRef in sessionId change effect to prevent orphaned intervals.
- `app/src/lib/export-docx.ts` — Type-guard raw_sections access with typeof string check.
- `app/src/lib/export-pdf.ts` — Null-safe fallbacks for experience title, company, start_date, end_date.

#### Database Migration
- `supabase/migrations/20260228140000_audit_round5_db_hardening.sql` — Session locks deny-all RLS policy. next_artifact_version session existence check. FK indexes on 3 workflow tables. Orphaned master_resume_history cleanup.

### Decisions Made
- SSRF DNS rebinding (pipeline.ts) confirmed false positive — assertPublicHost already re-validates on each redirect iteration
- Panel renderer resetKey already includes panelType — false positive
- toolCleanupTimersRef already tracks timers and checks mountedRef — false positive
- WorkbenchSuggestions advance callback already has suggestions in deps — false positive

### Known Issues
- 2 pre-existing test failures in agents-gap-analyst.test.ts (unrelated)

---

## 2026-02-28 — Session: Sprint 3 Audit Round 4 — Medium/Low Production Hardening

**Sprint:** 3 | **Stories:** 6 fixes from follow-up audit (25 findings reviewed, 19 false positives)
**Summary:** Hardened error handling on fire-and-forget DB operations, capped panel debounce queue, guaranteed stream reader cleanup, added logging for blueprint serialization failures, fixed abort controller leak on SSE error paths, and validated restored messages from DB.

### Changes Made

#### Best-Effort Async Error Handling [Medium]
- `server/src/routes/pipeline.ts` — `persistWorkflowArtifactBestEffort`, `upsertWorkflowNodeStatusBestEffort`, `resetWorkflowNodesForNewRunBestEffort` now chain `.catch()` with `logger.warn()` instead of bare `void`.

#### Panel Debounce Queue Cap [Medium]
- `server/src/routes/pipeline.ts` — `MAX_QUEUED_PANEL_PERSISTS` reduced from 5000 to 50. New entries for unknown sessions are rejected with a warning when queue is full.

#### Stream Reader Cleanup [Medium]
- `server/src/lib/http-body-guard.ts` — `parseJsonBodyWithLimit` reader logic wrapped in try/finally to guarantee `reader.releaseLock()` on all exit paths.

#### Blueprint Slice Error Logging [Low]
- `server/src/routes/pipeline.ts` — `sanitizeBlueprintSlice()` catch block now logs slice keys and error before returning fallback.

#### SSE Abort Controller Cleanup [Medium]
- `app/src/hooks/useAgent.ts` — Added `controller.abort()` before `handleDisconnect()` in both early-return error branches (bad status code, missing body).

#### Session Message Validation [Medium]
- `server/src/routes/sessions.ts` — Restored messages from DB are validated for required `role` field before access. Malformed messages logged and skipped.

### Decisions Made
- 19 of 25 audit findings were false positives (already guarded by existing code)
- Panel queue cap at 50 is generous — typical sessions create ~15 panel persists

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated)

### Next Steps
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-28 — Session: Sprint 3 Audit Round 3 — Comprehensive Production Hardening

**Sprint:** 3 | **Stories:** 23 fixes from 8-agent comprehensive audit
**Summary:** Comprehensive production hardening across the entire codebase. Most critical: Craftsman sections were stored in scratchpad but never transferred to state.sections (AT-06), meaning all crafted content was discarded and the final resume fell back to raw intake data. Also fixed Producer→Craftsman revision requests being silently dropped (AT-10), created the missing claim_pipeline_slot DB migration, and hardened 20+ infrastructure/frontend/routing issues.

### Changes Made

#### AT-06: Transfer Craftsman Scratchpad to state.sections [System-breaking]
- `server/src/agents/coordinator.ts` — After Craftsman loop completes, iterate scratchpad entries starting with `section_`, transfer those with a `content` property to `state.sections`. Without this, the Producer, final resume payload, and ATS checks all saw empty sections.

#### AT-10: Fix Producer→Coordinator Revision Payload Mismatch [Critical]
- `server/src/agents/coordinator.ts` — Revision handler now accepts both array format (`payload.revision_instructions`) and flat format (`payload.section + payload.instruction`). Previously, all Producer revision requests were silently dropped because the field names didn't match.

#### CO-01: Fix Revision Subscription Leak [High]
- `server/src/agents/coordinator.ts` — Moved `cleanupRevisionSubscription()` into a `finally` block around the Producer phase. Previously leaked the bus handler if the Producer threw.

#### persistSession Error Handling [High]
- `server/src/agents/coordinator.ts` — UPDATE now chains `.select('id')` and checks returned rows. Warns on zero-row update (session deleted between pipeline start and save).

#### savePositioningProfile Error Handling [High]
- `server/src/agents/coordinator.ts` — Both update and insert calls now capture and log DB errors instead of silently swallowing them.

#### Craftsman self_review False-Pass [High]
- `server/src/agents/craftsman/tools.ts` — When repairJSON returns null, now returns `passed: false, score: 0` instead of `passed: true, score: 6`. Prevents skipping revision on parse failure.

#### Stateful Regex Fixes [Medium]
- `server/src/agents/craftsman/tools.ts` — Removed `/g` flag from vertical bar regex in STRUCTURAL_PATTERNS. `.test()` with `/g` advances lastIndex, causing false negatives on subsequent calls.
- `server/src/agents/producer/tools.ts` — Removed `/g` flags from all 4 date pattern regexes in `verify_cross_section_consistency`.

#### Strategist Suggestions Validation [Medium]
- `server/src/agents/strategist/tools.ts` — Added `.filter()` before `.map()` to skip suggestions with missing/empty labels. Prevents blank buttons in the UI from Z.AI type coercion issues.

#### Agent Runtime Fixes [High/Medium]
- `server/src/agents/runtime/agent-loop.ts` — Interactive tools (interview, present_to_user, questionnaire) now bypass per-tool timeout, using only the overall pipeline timeout. Prevents 2-min timeout aborting user interaction.
- `server/src/agents/runtime/agent-bus.ts` — messageLog capped at 500 entries (trims to 250 on overflow) to prevent unbounded memory growth.

#### Infrastructure Hardening [Critical/High/Medium]
- `server/src/lib/retry.ts` — Never retry AbortErrors (intentional cancellation). Previously matched "timeout" in error message and retried.
- `server/src/lib/json-repair.ts` — Size guard: skip regex-heavy repair steps on inputs >50KB to prevent catastrophic backtracking.
- `server/src/lib/http-body-guard.ts` — Return 400 on invalid JSON instead of silently coercing to `{}`.
- `server/src/lib/session-lock.ts` — Renewal interval reduced from 60s to 30s (with 2-min expiry, gives 90s buffer vs 60s).
- `server/src/lib/llm.ts` — Completed TOOL_MODEL_MAP with 9 missing entries (write_section, revise_section, design_blueprint, adversarial_review → PRIMARY; self_review_section, check_narrative_coherence → MID; humanize_check, check_evidence_integrity → LIGHT).

#### Database Migration [Critical]
- `supabase/migrations/20260228120000_add_claim_pipeline_slot_rpc.sql` — Created missing `claim_pipeline_slot` RPC. Atomically claims a session for pipeline execution using UPDATE WHERE pipeline_status != 'running'. SECURITY DEFINER, service_role only.

#### Pipeline Route Fixes [High/Medium]
- `server/src/routes/pipeline.ts` — Fixed gate queue double-splice (redundant `.filter()` after `.splice()` dropped valid buffered responses). Sanitized error leakage via SSE (pipeline_error events now show generic message; detail stays in server logs).
- `server/src/lib/questionnaire-helpers.ts` — Fixed dead ternary `'single_choice' : 'single_choice'` → `'single_choice' : 'free_text'`. Added `free_text` to type union in types.ts and session.ts.

#### Frontend Fixes [High/Medium]
- `app/src/lib/export-docx.ts` — Applied template font as document-level default via `styles.default.document.run`. Fixed education field rendering to match PDF export (null-safe, consistent field ordering).
- `app/src/hooks/useAgent.ts` — Removed `setIsProcessing(false)` from `text_delta` handler. isProcessing now stays true until a terminal event.

#### DB: Fix next_artifact_version Service-Role Bypass [High]
- `supabase/migrations/20260228130000_fix_next_artifact_version_service_role.sql` — `auth.uid()` returns NULL for service-role callers, so the ownership guard always blocked `supabaseAdmin` calls. Fix: skip ownership check when `auth.uid() IS NULL` (service-role is trusted); enforce for authenticated users only.

#### LLM Provider: Fix Interrupted Stream Usage Loss [Medium]
- `server/src/lib/llm-provider.ts` — Both ZAI and Anthropic streaming paths now record partial token usage in `finally`/`catch` blocks when streams are interrupted by abort or network errors. Previously, usage was only recorded on successful completion.

#### Download Filename Sanitization [Medium]
- `app/src/lib/export-filename.ts` — Added defense-in-depth sanitization of invisible/bidirectional control characters (C0, DEL, zero-width, bidi embedding/isolate, BOM) via NFKC normalization and regex strip in `sanitizeFilenameSegment()`.

#### New Test Suites [Tests]
- `server/src/__tests__/agent-bus.test.ts` — 8 tests covering message routing, messageLog cap, and event handler cleanup
- `server/src/__tests__/retry-abort.test.ts` — 3 tests verifying AbortError is never retried
- `server/src/__tests__/json-repair-guard.test.ts` — 6 tests covering size guard bypass and normal repair behavior

#### Test Update
- `server/src/__tests__/http-body-guard.test.ts` — Updated test to expect 400 on invalid JSON (was 200 with empty object).

### Decisions Made
- AT-06: Scratchpad→state transfer happens after Craftsman loop, preserving any sections already in state
- AT-10: Coordinator accepts both payload formats for backward compatibility
- claim_pipeline_slot: GRANT to service_role only (not authenticated) — backend-only operation
- json-repair: 50KB threshold for skipping aggressive regex (balances repair attempts vs DoS risk)
- http-body-guard: 400 is correct per HTTP spec; downstream validation no longer sees phantom empty objects

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated)
- H5: Legacy create-master-resume.ts still backlogged
- Remaining medium/low findings from audit to be addressed in subsequent sessions

### Next Steps
- Address remaining medium/low audit findings
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-28 — Session: Sprint 3 Audit Round 2

**Sprint:** 3 | **Stories:** Audit round 2 — 5 critical + 8 high fixes
**Summary:** Fixed 13 issues from comprehensive 5-agent audit. Most severe: new master resume IDs were never linked back to sessions (C1), breaking evidence reuse for all first-time users. Also fixed nested transactions in migration, zero-row UPDATE detection, validation gaps, null guards, shallow-copy mutations, and evidence text length caps.

### Changes Made

#### C1: Link New Master Resume ID Back to Session [System-breaking]
- `server/src/agents/coordinator.ts` — Capture `{ data: newMr, error }` from RPC. After successful creation, `UPDATE coach_sessions SET master_resume_id = newMr.id`. Without this, second pipeline run never finds the master resume.

#### C2: Remove BEGIN/COMMIT from Migration [Critical]
- `supabase/migrations/20260227180000_...sql` — Removed explicit `BEGIN;` and `COMMIT;`. Supabase auto-wraps migrations in transactions; nested wrappers caused premature commit.

#### C3: Detect Zero-Row UPDATE in saveMasterResume [Critical]
- `server/src/agents/coordinator.ts` — Added `.select('id')` to UPDATE chain. If returned data is empty (row deleted between load and update), logs warning and falls through to CREATE branch as recovery.

#### C4+H7+H8+H10: Fix evidence_items Validation in POST /resumes [Critical+High]
- `server/src/routes/resumes.ts` — `text: z.string().min(10).max(2000)`, array `.max(200)` (was 500, matches EVIDENCE_CAP), `source_session_id: z.string().uuid()`, `created_at: z.string().datetime()`, `category: z.string().max(100)`.

#### C5: Null Guard on section.content in extractEvidenceItems [Critical]
- `server/src/agents/coordinator.ts` — `const rawContent = section.content ?? '';` prevents `.trim()` and `.split()` from throwing on null/undefined content.

#### H1+H2: Deep-Clone New Role Bullets + Education/Certifications [High]
- `server/src/agents/master-resume-merge.ts` — New role bullets: `newRole.bullets.map(b => ({ ...b }))`. Education: `{ ...edu }`. Certifications: `{ ...cert }`. Prevents shared references.

#### H4: Add earlier_career to Evidence Extraction Filter [High]
- `server/src/agents/coordinator.ts` — Added `key !== 'earlier_career'` to the filter condition so earlier career bullets are accumulated as evidence.

#### H6: Null Guards in buildStrategistMessage [High]
- `server/src/agents/coordinator.ts` — `Array.isArray(mr.experience)` guard before `.length`. `mr.skills && typeof mr.skills === 'object'` guard before `Object.keys()`. Prevents crashes on malformed/pre-migration DB rows.

#### H9: Cap Individual Evidence Item Text Length [High]
- `server/src/agents/coordinator.ts` — Added `MAX_EVIDENCE_TEXT_LENGTH = 1000` and `capEvidenceText()` helper (truncates at word boundary with `...`). Applied to crafted bullets, prose sections, and interview answers.

#### Tests: 5 New Test Scenarios
- `server/src/__tests__/master-resume-merge.test.ts` — newResume mutation safety (H1), education deep-clone isolation (H2), evidence dedup case-insensitivity (TG3), duplicate roles merge (TG4), empty summary fallback (TG5). Total: 20 tests passing.

### Decisions Made
- C3 recovery path: zero-row UPDATE falls through to CREATE rather than failing silently
- Evidence text cap at 1000 chars with word-boundary truncation balances context budget vs information loss
- Migration BEGIN/COMMIT removal is safe — all other migrations in this repo omit explicit wrappers

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` (unrelated to this work)
- H5 (legacy create-master-resume.ts) backlogged per user decision

### Next Steps
- Sprint 3 retrospective and Sprint 4 planning

---

## 2026-02-27 — Session: Sprint 3 Audit Fixes

**Sprint:** 3 | **Stories:** Audit fix stories 1-12
**Summary:** Fixed 18 issues found in post-implementation audit of master resume evidence accumulation: shallow-copy mutations, INSERT-only merge creating unbounded rows, unguarded Supabase casts, missing error handling, unbounded context injection, and edge-case gaps.

### Changes Made

#### Story 1: Fix Shallow Copy Mutation in mergeMasterResume [Critical]
- `server/src/agents/master-resume-merge.ts` — Deep-clone existing roles (map + spread bullets) instead of shallow `[...array]` to prevent caller mutation. Deep-clone skill arrays before pushing.

#### Story 2: Fix Supabase Error Handling in saveMasterResume [Critical]
- `server/src/agents/coordinator.ts` — Destructure `{ data, error: loadError }` on master resume load. If error is not PGRST116 (row not found), log and return early to avoid duplicate INSERT.

#### Story 3: Use UPDATE for Merge Case Instead of INSERT [Critical]
- `server/src/agents/coordinator.ts` — Replace RPC call in merge branch with `.update()` on existing row. Also updates `raw_text` with current resume text. RPC kept only for "create new" branch.

#### Story 4: Fix Migration — Drop Old RPC Overload + Transaction [Critical + Medium]
- `supabase/migrations/20260227180000_...sql` — Wrapped in BEGIN/COMMIT. Added DROP FUNCTION for old 10-param overload before CREATE OR REPLACE of 11-param version.

#### Story 5: Add Runtime Guards for DB Casts [High]
- `server/src/routes/pipeline.ts` — Normalize `evidence_items` to `[]` after cast in master resume load.
- `server/src/agents/coordinator.ts` — Same normalization in saveMasterResume load.
- `server/src/agents/master-resume-merge.ts` — Added `safeStr()` helper for null-safe string coercion on all key-generation lines.

#### Story 6: Add Size Caps [High + Low]
- `server/src/agents/coordinator.ts` — `MAX_BULLETS_PER_ROLE=15`, `MAX_EVIDENCE_ITEMS_INJECTED=50` in buildStrategistMessage. Caps bullets per role and evidence items per source category.
- `server/src/agents/master-resume-merge.ts` — `EVIDENCE_CAP=200` in mergeMasterResume. Keeps newest items when over cap.

#### Story 7: Add evidence_items to POST /resumes Route [High]
- `server/src/routes/resumes.ts` — Added `evidence_items` to `createResumeSchema` (zod array of evidence objects, max 500). Added `p_evidence_items` to RPC call.

#### Story 8: Fix Evidence Extraction for Prose Content [Medium]
- `server/src/agents/coordinator.ts` — `extractEvidenceItems` now captures summary/selected_accomplishments as single prose evidence items instead of only bullet-marked lines. Interview answers trimmed before length check.

#### Story 9: Fix Merge Edge Cases — Skills + Contact Info [Medium]
- `server/src/agents/master-resume-merge.ts` — Skip empty category names and empty skill strings. Contact info now merges fields (existing as base, new overwrites per-field) instead of winner-take-all.

#### Story 10: Fix DB Query Error in pipeline.ts [Medium]
- `server/src/routes/pipeline.ts` — Destructure `{ data: mrData, error: mrError }` and log error if present. Only set masterResume when no error.

#### Story 11: Adjust Strategist Prompt Guidance [Medium]
- `server/src/agents/strategist/prompts.ts` — Changed "0-3 questions" to "1-5 questions". Added "Always ask at least 1 question to capture JD-specific context."

#### Story 12: Add Missing Test Scenarios [Tests]
- `server/src/__tests__/master-resume-merge.test.ts` — 7 new tests: mutation safety, partial contact merge, empty skills, empty category names, whitespace evidence, evidence cap at 200, null-safe fields. Total: 15 tests passing.

### Decisions Made
- UPDATE instead of INSERT for merge case prevents unbounded row accumulation
- Evidence cap of 200 with "keep newest" strategy balances completeness vs. storage
- Context injection caps (15 bullets/role, 50 evidence items) prevent prompt bloat
- `safeStr()` helper centralizes null-safe string coercion for DB data

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` remain (unrelated)

### Next Steps
- Run full E2E pipeline with repeat user to validate merge-in-place behavior
- Monitor evidence accumulation growth in production

---

## 2026-02-27 — Session: Master Resume Persistent Evidence

**Sprint:** 3 | **Stories:** 1-5 (all complete)
**Summary:** Added persistent evidence accumulation to the Master Resume so repeat users benefit from prior pipeline sessions. The Strategist sees accumulated evidence and skips redundant interview questions.

### Changes Made

#### Story 1: Database Migration + Types
- `supabase/migrations/20260227180000_add_evidence_items_to_master_resumes.sql` — Added `evidence_items JSONB DEFAULT '[]'` column to `master_resumes` table; updated `create_master_resume_atomic` RPC to accept `p_evidence_items` parameter (11th param)
- `server/src/agents/types.ts` — Added `MasterResumeEvidenceItem` and `MasterResumeData` interfaces
- `app/src/types/resume.ts` — Added `MasterResumeEvidenceItem` interface and `evidence_items` field to `MasterResume`

#### Story 2: Auto-Save on Pipeline Completion
- `server/src/agents/master-resume-merge.ts` — New file: pure `mergeMasterResume()` function (no external deps, fully unit-testable). Handles role matching by company+title, bullet dedup, skill union, education/cert dedup, evidence item dedup
- `server/src/agents/coordinator.ts` — Added `extractEvidenceItems()` (extracts crafted bullets + interview answers), `saveMasterResume()` (loads existing, merges or creates new via RPC). Called after `persistSession()` in pipeline completion flow. Added `master_resume_id` and `master_resume` to `PipelineConfig`

#### Story 3: Load Master Resume at Pipeline Start
- `server/src/routes/pipeline.ts` — Added `master_resume_id` to session query; loads full master resume from DB when session has one linked; passes `master_resume_id` and `master_resume` to `runPipeline()`

#### Story 4: Inject into Strategist Context
- `server/src/agents/coordinator.ts` — `buildStrategistMessage()` now appends a "MASTER RESUME — ACCUMULATED EVIDENCE" section when `config.master_resume` exists, including experience entries with all bullets, evidence items by source, and skills inventory
- `server/src/agents/strategist/prompts.ts` — Added "Master Resume — Accumulated Evidence" guidance section: review evidence before designing questions, skip questions where strong evidence exists, focus on genuine gaps, 0-3 questions for repeat users with rich master resumes

#### Story 5: Verification
- `server/src/__tests__/master-resume-merge.test.ts` — New test file: 8 unit tests for `mergeMasterResume()` covering bullet dedup, role matching, evidence dedup, case-insensitive skills, first-time save, education/cert dedup, contact info, and case-insensitive role matching

### Decisions Made
- Extracted `mergeMasterResume()` into its own module (`master-resume-merge.ts`) to avoid Supabase import side-effects in unit tests
- Evidence extraction is code-only (zero LLM calls): bullets parsed from section content, interview answers from transcript
- Merge strategy uses exact text dedup (case-insensitive) — simple and reliable without LLM
- Auto-save runs after `persistSession()` and is non-critical (wrapped in try/catch, failure logged but doesn't block)

### Known Issues
- 2 pre-existing test failures in `agents-gap-analyst.test.ts` remain (unrelated)
- Evidence items grow unbounded — no pruning strategy yet (backlog item)
- Master resume viewer/editor UI not yet built (backlog)

### Next Steps
- Run full E2E pipeline with repeat user to validate reduced interview time
- Build master resume viewer page for users to browse/manage evidence
- Consider evidence quality scoring for smarter prioritization

---

## 2026-02-27 — Session: Interview Phase Optimization

**Sprint:** 2 | **Stories:** 1-6 (all complete)
**Summary:** Added interview budget enforcement, mini-batch presentation, and "Draft Now" escape to optimize the interview phase while preserving the Strategist's adaptive intelligence.

### Changes Made

#### Story 3: Question Format Converter
- `server/src/lib/questionnaire-helpers.ts` — Added `positioningToQuestionnaire()` to convert PositioningQuestion[] to QuestionnaireQuestion[] for batch presentation
- `server/src/lib/questionnaire-helpers.ts` — Added `extractInterviewAnswers()` to convert QuestionnaireSubmission back to scratchpad-compatible interview answer format

#### Story 1: Question Budget Enforcement
- `server/src/agents/strategist/tools.ts` — Added `INTERVIEW_BUDGET` map (fast_draft=5, balanced=7, deep_dive=12) and `getInterviewBudget()`/`getInterviewQuestionCount()` helpers
- `server/src/agents/strategist/tools.ts` — `interview_candidate` execute: budget check at top returns `{ budget_reached: true }` with transparency event when limit hit

#### Story 2: interview_candidate_batch Tool
- `server/src/agents/strategist/tools.ts` — New `interview_candidate_batch` AgentTool: presents 2-3 questions as a QuestionnairePanel gate, extracts batch answers, persists to scratchpad/transcript identically to single-question tool, evaluates follow-up recommendations, handles `draft_now` escape signal
- `server/src/agents/strategist/tools.ts` — Registered in `strategistTools` export array

#### Story 4: Update Strategist Prompt
- `server/src/agents/strategist/prompts.ts` — Updated step 5 (Interview) to guide toward `interview_candidate_batch` as primary tool, batch-by-category strategy, budget awareness, and `budget_reached`/`draft_now_requested` stop signals

#### Story 5: Draft Now Escape Button
- `app/src/components/panels/QuestionnairePanel.tsx` — Added optional `onDraftNow` prop and "Draft Now" button (Zap icon, amber accent) in action bar for positioning-stage questionnaires
- `app/src/components/panels/panel-renderer.tsx` — Wired `onDraftNow` callback to send `{ draft_now: true }` gate response for positioning-stage questionnaires

#### Story 6: E2E Verification
- `e2e/helpers/pipeline-responder.ts` — Added phase timing markers (interview, blueprint_review, section_writing) with `startPhase()`/`endPhase()` helpers and completion summary

### Decisions Made
- Budget enforcement is code-level, not prompt-level — the tool returns a stop signal rather than relying on the LLM to count
- Batch questions use existing QuestionnairePanel infrastructure (not a new component) for consistency
- Single `interview_candidate` tool kept alongside batch tool for targeted follow-up probing
- "Draft Now" button only shows for positioning-stage questionnaires (not gap_analysis or quality_fixes)

### Known Issues
- E2E timing improvement not yet validated (requires live Z.AI API run)
- Strategist may still prefer single-question tool until prompt guidance takes effect across runs
- 2 pre-existing test failures in agents-gap-analyst.test.ts remain

### Next Steps
- Run full E2E pipeline to validate timing improvement target (interview phase < 5 min)
- Monitor Strategist behavior — confirm it adopts batch workflow with updated prompt
- Master Resume pre-fill (future sprint, per user)

---

## 2026-02-27 — Session: Framework & Dynamic Pipeline

**Sprint:** 0 (retroactive) + 1 (framework onboarding)
**Summary:** Completed 4-phase Dynamic Pipeline work, fixed critical infrastructure issues, established Scrum framework.

### Changes Made

#### Dynamic Pipeline — Phase 1: Evidence Flow
- `server/src/agents/types.ts` — Added `interview_transcript` to `PipelineState`
- `server/src/agents/strategist/tools.ts` — `interview_candidate` persists raw Q&A pairs to state
- `server/src/agents/strategist/tools.ts` — `classify_fit` expanded evidence fields (2000 chars, 10 phrases)
- `server/src/agents/coordinator.ts` — `buildCraftsmanMessage()` includes interview transcript
- `server/src/agents/craftsman/tools.ts` — Section writer: "Authentic voice beats resume-speak"

#### Dynamic Pipeline — Phase 2: Blueprint Approval Gate
- `server/src/lib/feature-flags.ts` — Added `FF_BLUEPRINT_APPROVAL` flag
- `server/src/agents/coordinator.ts` — `waitForUser('architect_review')` gate + edit merging
- `app/src/components/panels/BlueprintReviewPanel.tsx` — New panel: edit positioning, reorder sections
- `app/src/components/panels/panel-renderer.tsx` — Blueprint panel integration

#### Dynamic Pipeline — Phase 3: Creative Liberation
- `server/src/agents/types.ts` — `EvidencePriority`, updated `EvidenceAllocation` interfaces
- `server/src/agents/strategist/tools.ts` — Architect prompt: strategic guidance mode
- `server/src/agents/craftsman/prompt.ts` — "Your Creative Authority" section
- `server/src/agents/craftsman/tools.ts` — `hasEvidencePriorities()` branching in section writer

#### Dynamic Pipeline — Phase 4: Holistic Quality
- `server/src/agents/craftsman/tools.ts` — `crossSectionContext` from scratchpad in `write_section`
- `server/src/agents/craftsman/tools.ts` — "PREVIOUSLY WRITTEN SECTIONS" prompt block
- `server/src/agents/producer/tools.ts` — `check_narrative_coherence` tool (new)
- `server/src/agents/producer/tools.ts` — `select_template` SSE transparency
- `server/src/agents/producer/prompt.ts` — Updated workflow with narrative coherence step

#### Infrastructure Fixes
- `server/src/routes/pipeline.ts` — Pipeline heartbeat: 5-min `setInterval` touching `updated_at`
- `e2e/helpers/pipeline-responder.ts` — React native setter for textarea fills in zero-height panels

#### Framework
- `CLAUDE.md` — Added Scrum development framework and anti-drift rules
- `docs/ARCHITECTURE.md` — System architecture documentation (new)
- `docs/CONVENTIONS.md` — Code conventions and patterns (new)
- `docs/DECISIONS.md` — 6 ADRs for existing architectural decisions (new)
- `docs/BACKLOG.md` — Known work items organized as epics/stories (new)
- `docs/CURRENT_SPRINT.md` — Sprint 1: Framework Onboarding (new)
- `docs/SPRINT_LOG.md` — Sprint 0 retrospective (new)
- `docs/CHANGELOG.md` — This file (new)

### Decisions Made
- ADR-001 through ADR-006 documented retroactively (see DECISIONS.md)
- Scrum framework adopted for all future development

### Known Issues
- MaxListenersExceededWarning on long sessions
- 409 conflict errors when frontend sends during processing (Bug 18)
- Revision loop after user approval (Bug 16)
- Context forgetfulness on long sessions (Bug 17)
- PDF Unicode rendering (`?` characters)

### Next Steps
- Complete Sprint 1 (framework onboarding — this session)
- Plan Sprint 2 from backlog (production hardening candidates)
