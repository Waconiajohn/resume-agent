# Launch Rehearsal - 2026-04-29

## Purpose

Validate CareerIQ as a consumer product, not as a codebase. This rehearsal uses three separate user identities, three realistic resumes, and the full job-search-to-application loop. The only fixes allowed during this workstream are confirmed blockers or severe trust issues.

## Release Principle

No broad redesigns. No new feature expansion. The goal is to prove that the product can reliably move a job seeker from profile setup to job discovery to tailored application assets.

## Personas

### P1 - VP Ops / Manufacturing Executive

- Target: COO role
- Primary proof to validate: operations leadership, Lean transformation, multi-site manufacturing, P&L-adjacent scope, board/PE-adjacent positioning without overclaiming.
- Source fixture: `e2e/fixtures/stress-test-profiles.ts` profile `0` plus live UI validation.

### P2 - Product Owner / Salesforce Systems Consultant

- Target: Director of Product or senior product/platform role.
- Primary proof to validate: requirements strategy, Salesforce CRM, Agile delivery, API/backend integration, stakeholder alignment, regulated enterprise environment.
- Source fixture: synthetic profile based on the Lisa-style scenario from product review notes.

### P3 - Technical Support / SaaS Operations Leader

- Target: ADT Cloud Operations / technical operations leadership role.
- Primary proof to validate: SaaS platform deployment, global support operations, process automation, SLA/KPI management, contact center optimization, technical support leadership.
- Source fixture: synthetic profile based on the Dan-style scenario from product review notes.

## Account Strategy

Use one isolated identity per persona. Preferred order:

1. Mock-auth e2e user IDs for fast coverage and regression checks.
2. Live Supabase test accounts for final human-style validation.

Live account creation requires action-time approval because it creates accounts in the connected auth system.

## Rehearsal Script

Run this exact loop for each persona:

1. Sign up / authenticate.
2. Build the CareerIQ profile from the most comprehensive resume and LinkedIn/profile text available.
3. Complete the interactive discovery questions.
4. Review Benchmark Profile: Why Me, Why Not Me, proof, LinkedIn inputs, source material.
5. Run Broad Search.
6. Run Insider Jobs.
7. Save or open one role.
8. Tailor resume from the selected job.
9. Review resume quality and source attribution.
10. Draft cover letter.
11. Draft networking outreach.
12. Schedule or simulate an interview.
13. Generate interview prep.
14. Draft thank-you note.
15. Draft follow-up email.
16. Review Pipeline/Timeline.
17. Open LinkedIn Growth and validate profile editor plus content creator.
18. Repeat on mobile viewport for navigation and next-action clarity.

## Pass Criteria

- User can complete the core loop without engineer knowledge.
- Job search returns credible results or clearly explains why it cannot.
- Every job result can move into Tailor Resume with company, role, URL, and JD context intact.
- Writing outputs are specific, truthful, concise enough to use, and free of raw JSON/placeholders.
- Benchmark Profile is not internally contradictory.
- Mobile navigation exposes the next action without horizontal chaos.

## Severity

- `Blocker`: Stops a real user, produces materially wrong output, loses data, or breaks a money path.
- `Trust`: Flow completes but makes the user doubt the system's competence or truthfulness.
- `Polish`: Recoverable annoyance, copy issue, or visual friction.

## Running Log

| Time | Persona | Surface | Severity | Finding | Status |
|---|---|---|---|---|---|
| 2026-04-29 | All | Planning | Info | Created launch rehearsal plan and started tooling inventory. | Complete |
| 2026-04-29 | All | QA harness | Trust | Several automated checks were still asserting the pre-reduction copy and layout, including old Job Search, LinkedIn, Profile Setup, Insider Jobs, and V3 resume labels. This made the release harness unreliable even when the product was rendering correctly. | Fixed; reruns passed |
| 2026-04-29 | P1/P2/P3 | Job Search + Guided Flows | Info | Validated Broad Search, saved-role actions, add-application dialog, watchlist manager, saved resume reopen, interview/offer gating, and legacy redirects through mock-auth e2e coverage. | 10/10 passed |
| 2026-04-29 | P1/P2/P3 | Responsive Shell | Info | Validated workspace, Tailor Resume, LinkedIn Growth, Job Command Center, applications, application workspace, interview, public/auth/legal/settings/billing/admin/affiliate surfaces for horizontal overflow on desktop and mobile. | 36/36 passed |
| 2026-04-29 | P1/P2/P3 | Profile Setup | Info | Validated intake, optional LinkedIn context, resume/target-role validation, discovery answers, multi-select starters, full Benchmark Profile reveal, error handling, and file upload affordances. | 10/10 passed |
| 2026-04-29 | P1/P2/P3 | Benchmark + LinkedIn | Info | Validated home entry points, Benchmark Profile editing, LinkedIn profile audit entry, content plan, post draft approval, and profile-section rewrite flow. | 5/5 passed |
| 2026-04-29 | P1/P2/P3 | Insider Jobs + Interview | Info | Validated Insider Jobs Network path, Bonus path, matches, Tailor Resume action visibility, Interview Prep section navigation, interview history/debrief, mock interview, leave-behind plan, thank-you/follow-up/negotiation access. | 4/4 passed |
| 2026-04-29 | P1/P2/P3 | Tailor Resume Persistence + Recovery | Info | Validated dashboard/cover-letter entry, saved tailored resume filters, delete confirmation, source-material states, and V3 pipeline error recovery. | 17/18 passed, 1 skipped by fixture condition |
| 2026-04-29 | All | Type Safety | Info | Ran app and server TypeScript checks after QA harness repairs. | Passed |
| 2026-04-29 | P1/P2/P3 | Live Rehearsal Restart | Info | Restarted the separate-account live rehearsal from a signed-out browser state. Next action is explicit approval to create isolated live test accounts. | In progress |
| 2026-04-29 | P1/P2/P3 | Signup | Blocker | UI signup returned `email rate limit exceeded` before account creation could complete. Created three approved synthetic accounts through the Supabase admin path to keep rehearsal moving, but consumer signup rate limiting must be launch-gated. | Mitigated in UI; provider limit remains expected |
| 2026-04-29 | P1 | Benchmark Profile | Info | Completed VP Ops profile setup with eight discovery answers. Output produced a clear Why Me, honest P&L caveat, and no visible no-narrative/no-proof contradiction. | Passed initial human review |
| 2026-04-29 | P1 | Broad Search | Trust | Search for `Chief Operating Officer manufacturing Cincinnati` returned one weak Workday result titled `Search for Jobs` with a `refreshFacet` URL, Deckers company, and New York location. This is not credible enough to send into resume tailoring without filtering. | Fixed by concrete job-page filtering |
| 2026-04-29 | P1 | Broad Search → Tailor | Info | The weak Broad Search result still opened the new application-aware Tailor dialog with URL, company, and role populated. Handoff path works; upstream filtering quality is the issue. | Passed with upstream caveat |
| 2026-04-29 | P1 | Insider Jobs Remote | Info | Seeded synthetic first-degree company connections. Remote scan checked 5 companies, found 24 raw jobs, 3 after filters, and 0 title matches; UI explained the no-match outcome instead of failing silently. | Passed with title-strictness caveat |
| 2026-04-29 | P1 | Insider Jobs Hybrid/On-site | Info | Hybrid and On-site ran separately with city/state. Hybrid returned 2 raw jobs, 1 after filters, 0 title matches. On-site returned 1 raw job, 0 after filters, and explained that selected filters removed results. | Passed with scarcity caveat |
| 2026-04-29 | P1 | Tailor Resume Persistence | Blocker | Coventry COO resume finished in the UI and exposed DOCX/PDF downloads, but the Supabase `coach_sessions` row stayed `running/extract` with no persisted `v3_pipeline_output`. Reopen/history/billing/recovery will misread this successful run as still running. | Fixed |
| 2026-04-29 | P1 | Cover Letter | Trust | Cover letter generated specific Coventry/COO evidence with no JSON/placeholders, but rendered as one dense paragraph and the backing `coach_sessions` row remained `running/onboarding` with no saved letter. | Fixed persistence; rendering covered by concise output + Markdown normalization where applicable |
| 2026-04-29 | P1 | Networking | Trust | Networking composer defaults to `Former colleague` on a brand-new application. That can create false relationship language unless the user notices and changes it. Default should be cold/other or require explicit selection. | Fixed |
| 2026-04-29 | P1 | Networking Output | Info | After manually switching to cold outreach, the message drafted usable short copy for Patricia Monroe at Coventry and did not invent a prior relationship. Output was concise and context-specific, but it leaned on synthetic company assumptions supplied in the application context. | Passed with context caveat |
| 2026-04-29 | P1 | Interview Prep | Trust | Interview Prep content is materially stronger now: top-six requirement mapping, first-person proof, objections, 3-2-1, and 30-60-90 are present. However, the app rendered the full Markdown-style report as one giant paragraph/blob instead of a polished scannable document. | Fixed |
| 2026-04-29 | P1 | Interview Prep Company Research | Trust | The report correctly warned that Coventry Industrial Holdings has limited verified public data, but then drifted into a closest-match Coventry Group public-company profile. For ambiguous/synthetic targets, this should stay labeled as limited verified data and separate JD-only assumptions from external facts. | Fixed |
| 2026-04-29 | P1 | Product Session Persistence | Blocker | Read-only Supabase check shows application outputs render in the UI while backing `coach_sessions` rows remain `running` or `error`: resume stayed `running/extract`, cover letter `error`, networking `running`, interview prep `running`. This can break refresh, reopen, history, admin, and billing/recovery trust. | Fixed |
| 2026-04-29 | P2 | Profile Setup | Info | Started isolated Product Owner account and profile setup from separate Salesforce/Product Owner resume and LinkedIn context. First discovery question correctly targeted platform scope instead of generic career summary. | In progress |
| 2026-04-29 | P2 | Profile Setup Suggestions | Info | Discovery answer chips allowed multiple selections on Question 2 (`High-risk Salesforce release` and `Defect triage after release` both stayed selected and populated the answer field). This validates the earlier multi-select fix in a live account. | Passed |
| 2026-04-29 | P2 | Benchmark Profile | Info | Completed all eight Product Owner discovery questions. The generated Career Thread is strong and differentiated: Lisa is positioned as the person who turns fuzzy, interdependent enterprise platform work into clear, testable delivery. | Passed initial human review |
| 2026-04-29 | P2 | Broad Search | Trust | `Director of Product Salesforce remote` returned quickly and included some plausible ATS jobs (e.g. Principal Product Manager, CRM/Martech), but also several weak/irrelevant rows (`Search Jobs`, Business Development Representative, Lead Account Executive, generic analytics/client roles). Relevance filtering still needs tightening before launch. | Fixed by ATS landing-page and role relevance filters |
| 2026-04-29 | P2 | Broad Search State | Trust | Navigating away from Broad Search and then returning cleared the live search query/results. A consumer who accidentally taps top navigation or uses back loses the result set and must search again. | Fixed |
| 2026-04-29 | P2 | Broad Search → Tailor | Info | Scoped the first result action and confirmed the new Tailor Picker opened with job URL, company (`Humana`), and role (`Principal, Product Manager, Next Best Action`) correctly prefilled. The accessible names are still ambiguous because top nav and result actions are both named `Tailor Resume`. | Passed with accessibility caveat |
| 2026-04-29 | P2 | Job → Resume Context | Blocker | After creating the Humana application from a Broad Search result, company and role were correct, but the resume engine URL field was empty and the job-description field appeared to contain only a short snippet/preferred-locations text rather than the full JD. The user believes the job link is driving the rewrite, but the model may not have enough job context. | Fixed |
| 2026-04-29 | P2 | LinkedIn Growth Context | Trust | LinkedIn Growth opened with blank Current Headline/About fields even though the user supplied LinkedIn headline/About context during Benchmark Profile setup. The app asks for the same LinkedIn material again instead of reusing the newly created profile source data. | Fixed |
| 2026-04-29 | P3 | Profile Setup | Info | Completed isolated Technical Support/SaaS Ops profile setup with separate resume, LinkedIn context, and eight discovery answers. Questions correctly targeted support scope, knowledge management uncertainty, hidden systems/process work, and cloud-ops positioning risk. | Complete |
| 2026-04-29 | P3 | Benchmark Profile | Info | Generated a strong Career Thread: Daniel is positioned as a SaaS/technical support operations leader who turns reactive support chaos into measurable operating systems, without falsely positioning him as a cloud architect. | Passed initial human review |
| 2026-04-29 | P3 | Broad Search | Trust | `ADT cloud operations manager remote` returned a clear no-results state: 6 raw results were removed by the 30-day posted-date filter because no readable posting date was available. This confirms ATS sources are participating, but date filtering can eliminate otherwise relevant jobs when dates are unreadable. | Fixed with Any date option and clearer diagnostics |
| 2026-04-29 | P3 | Broad Search Copy | Polish | The no-results guidance says “Try Any date,” but the visible posted-within filter only exposes Last 24 hours, 3 days, 7 days, 14 days, and 30 days. Either add an Any date option or change the guidance. | Fixed |
| 2026-04-29 | P1/P2/P3 | Job Search Repair | Info | Implemented production repair pass for the live rehearsal job-board defects: Remote-only searches now clear/ignore city/state and run nationwide; job filters are user-scoped; Any date is available and honored by latest-scan recovery; Serper no longer pre-filters dates before aggregator diagnostics; generic ATS landing pages and Workday `refreshFacet` URLs are rejected; obvious role-irrelevant rows are filtered; Firecrawl is documented/used as supplemental discovery and as JD scrape fallback; application resume intake now preserves original job URLs and auto-fetches full JD when saved text is only a snippet. | Fixed; targeted tests passed |
| 2026-04-29 | P3 | Live Broad Search Retest | Info | In the running app, selected Remote and confirmed the location field changes to “Remote searches run nationwide” with no city/state. `Cloud Operations Manager` + Last 30 days returned 3 Google/ATS results, including Workday and Firstup roles, with result-level Tailor Resume actions exposed. | Passed sanity check |
| 2026-04-29 | P1/P2/P3 | Final Repair Pass | Info | Added durable review-output snapshots for product sessions, persisted completed V3 resume runs at pipeline completion, normalized collapsed Markdown reports, guarded ambiguous company research as limited verified data, seeded LinkedIn Growth from Benchmark Profile context, made networking cold outreach the safe default, clarified Approve & Save actions, and changed 3-day/14-day job freshness to app-side verified filtering instead of unsupported provider recency hints. | Fixed; targeted tests passed |
| 2026-04-29 | P1/P2/P3 | Verification | Info | Ran app/server typechecks, targeted job search/Insider Jobs/product-session/interview/LinkedIn/networking/application-workspace tests, lint, and production builds. Lint remains warnings-only in both app and server; production builds pass when allowed to write generated artifacts. | Passed |
