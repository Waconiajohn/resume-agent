# State Reset + Export Format Investigation

**Date:** 2026-04-21
**Scope:** Investigation only. No code changes in this task.
**Budget used:** File reads + greps, one subagent exploration pass. No LLM calls.
**Status:** Complete. Recommendations at the end.

---

## Part 1 — State reset investigation

### Reproduction

Owner reports: at `http://localhost:5173/workspace?room=resume&focus=cover-letter`, running multiple candidates in the same tab without refresh shows stale resume data from the previous candidate when moving from Andrew Jeffrey → Melissa Porcheska.

This is **not cross-user data leakage.** Same user, same tab, same mounted component tree. It's state persistence inside long-lived React hooks that have no "candidate changed" signal.

---

### 1.1 — Where cover-letter state comes from

The cover-letter UI is rendered by `app/src/components/cover-letter/CoverLetterScreen.tsx`. It holds state in three layers, none of which reset on "the user started a new candidate":

**Layer 1 — Component-local `useState` (lines 278-287):**
```
const [phase, setPhase] = useState<Phase>('intake');
const [defaultResumeText, setDefaultResumeText] = useState<string | undefined>(undefined);
const [companyName, setCompanyName] = useState('');
const [selectedTone, setSelectedTone] = useState<CoverLetterTone>('formal');
// ... plus revisionFeedback, reviewSubmitting, etc.
```

All scoped to the component instance. React preserves these across navigation as long as the component stays mounted.

**Layer 2 — `useCoverLetter` hook (`app/src/hooks/useCoverLetter.ts:37-367`):**

The hook holds its own `useState` bag (lines 38-47): `status`, `letterDraft`, `qualityScore`, `activityMessages`, `error`, `currentStage`, `letterReviewData`, `pendingGate`. It also holds refs to the SSE abort controller and the session ID (`sessionIdRef.current`, line 55).

Critically, the hook **exports a `reset` function** (destructured at CoverLetterScreen.tsx:321) — so the machinery exists. What's missing is a caller that invokes it on candidate-change.

**Layer 3 — The master-resume pre-fill (`CoverLetterScreen.tsx:290-309`):**

```typescript
useEffect(() => {
  if (!onGetDefaultResume) return;
  onGetDefaultResume().then((resume) => {
    if (resume?.raw_text?.trim()) setDefaultResumeText(resume.raw_text);
  });
}, [onGetDefaultResume]);
```

`onGetDefaultResume` is passed as a prop from `App.tsx:729` and is the `getSessionCoverLetter` callback wired up in the top-level session hook. The effect runs **once on mount** (assuming `onGetDefaultResume` is stable — which a `useCallback` would make it). So if the backend's "default resume" changes to point at a different candidate, the screen will not refetch unless it remounts.

**Scoping keys:** None. There is no candidate-ID or resume-ID key anywhere in this chain. The state is singleton per component instance.

**Component remount triggers:**

`App.tsx:574` wraps the workspace in an `ErrorBoundary` keyed by `location.pathname + location.search`. But the cover-letter URL is `/workspace?room=resume&focus=cover-letter` — if the user stays on that route and just submits again with different paste text in the intake form, the key doesn't change, the component doesn't remount, the hook state persists. **That is the bug.**

**Is there any "switch candidate" / "new session" action in the UI?** No. Searched `CoverLetterScreen.tsx`, `ResumeWorkshopRoom.tsx`, and `CoverLetterIntakeForm.tsx` — nothing calls `reset()` from the parent level. The only way to clear hook state is to remount the screen (navigate away and back, or refresh the tab).

---

### 1.2 — Blast radius across other products

The same architectural pattern applies to every non-v3 product that uses an SSE-streaming hook + master-resume pre-fill.

**Confirmed vulnerable (frontend state persists across candidate pivot):**

| Product | Hook | Master-resume pre-fill | Will show stale content on pivot? |
|---|---|---|---|
| Cover letter | `app/src/hooks/useCoverLetter.ts` | Yes — `onGetDefaultResume` on mount only | **Yes** |
| Thank-you note | `app/src/hooks/useThankYouNote.ts` (mirrors cover-letter pattern) | Yes — `useLatestMasterResumeText()` | **Yes** |
| LinkedIn content | `app/src/hooks/useLinkedInContent.ts` | Likely same pattern — state persists in `LinkedInStudioRoom.tsx` | **Likely** |
| Interview prep | `app/src/hooks/useInterviewPrep.ts` (via `InterviewLabRoom.tsx`) | Yes — `jobDescription` as local state | **Yes** |
| Exec bio | `app/src/components/executive-bio/...` (not explored in depth) | Likely same | **Likely** |

**Not vulnerable:**

| Product | Why |
|---|---|
| Resume V3 | Route is `/resume-builder/session?sessionId=X`. The `sessionId` query param is the key — `getResumeBuilderSessionIdFromSearch(search)` in `app-routing.ts:30`. A different session ID triggers remount. |
| Resume V2 writer | Same route structure as v3; session-keyed. |

**Root cause is consistent:** Non-v3 products route by `?room=resume&focus=X` where the focus is a tab-like selector, not a session identifier. The component stays mounted, hooks retain state, no candidate-change signal fires.

---

### 1.4 — Job description state

**Where it lives:** `CoverLetterIntakeForm.tsx:65-68` — local `useState` inside the intake form component. Captured on submit, passed to `startPipeline({ jobDescription })` at `CoverLetterScreen.tsx:369`.

**Stored anywhere persistently?** No. The JD is not cached in the hook, not written to a store, not round-tripped through the backend to the frontend after submission.

**Coupling to resume state:** The two are **decoupled** in state management (different components, different hooks). They're only coupled at **submission** — both are arguments to one `startPipeline()` call. There's no shared "application" object that groups them.

**What happens on candidate pivot:**

- **Resume text field:** pre-filled on mount from master resume, stays in `defaultResumeText` forever.
- **Job description field:** whatever the user last typed stays in the intake form textarea (component-local `useState`).

Both fields persist across a candidate switch, for the same architectural reason (no remount trigger, no reset signal).

**One problem or two?**

One architectural problem ("there is no candidate-change signal"), two symptoms ("stale resume, stale JD"). Whatever fix addresses the root cause will naturally fix both — the fix needs to reset everything component-local, not just one field. But any fix **must** be verified against both symptoms; it's easy to fix only the resume side.

---

### 1.3 — Fix approaches

Three approaches in ascending order of effort. None of them are implemented in this task.

#### Approach A — Add a "Start Fresh" button at the room level

**Description:** Add a UI button in `ResumeWorkshopRoom.tsx` ("Start new candidate", "New session", "Clear") that, when clicked, calls `reset()` on every product hook instantiated in the room, clears form state, clears the master-resume pre-fill, and re-fetches the latest master resume from backend.

**Files changed:**
- `app/src/components/career-iq/ResumeWorkshopRoom.tsx` — add button + wiring
- `app/src/hooks/useCoverLetter.ts`, `useThankYouNote.ts`, `useInterviewPrep.ts` — ensure `reset()` clears all state (already has for cover letter; verify for others)
- `app/src/components/cover-letter/CoverLetterScreen.tsx` + equivalents — add an `onResetRequest` prop that parent calls on button click

**Effort:** 2-3 hours. Small code, low risk.

**User-visible behavior:** A button the user clicks when they want to work on a new candidate. If they forget to click it, stale state still persists.

**Trade-off:** Requires user awareness. "Why is Andrew's resume here when I uploaded Melissa's?" still happens to first-time users.

---

#### Approach B — Auto-clear on detected candidate change

**Description:** On every `onGetDefaultResume()` call (or a periodic interval), compare the backend's current "default resume" identifier to a stored ref. If it changed, clear product state and re-prompt / re-fetch.

**Files changed:**
- `app/src/components/cover-letter/CoverLetterScreen.tsx` — add `useEffect` that watches `defaultResume.id` (not just `raw_text`)
- Same pattern in thank-you-note, linkedin-content, interview-prep screens
- Needs a candidate/resume ID on whatever `onGetDefaultResume()` returns — may require backend to expose it
- Optional: UX dialog — "Your active resume changed. Keep working on Andrew or switch to Melissa?"

**Effort:** 4-6 hours. Slightly more complex, needs a clear "candidate ID" concept at the API layer (the current backend may not return one consistently).

**User-visible behavior:** System auto-detects and offers to reset. Less friction than Approach A. But introduces possible surprise ("why did it clear?") and requires an affordance for the user to UNDO if they didn't want to clear.

**Trade-off:** Depends on a stable candidate/resume identifier from the backend. If the "master resume" is conceptually one record that gets UPDATED with new paste text (not a new record per upload), there's no "ID changed" signal to detect on. Check this before committing to Approach B.

---

#### Approach C — Application-scoped workspaces (owner's preferred long-term direction)

**Description:** Introduce a "JobApplication" entity in the URL and state tree. Resume, JD, cover letter, thank-you note, interview prep all scope to one application. The route becomes `/workspace/application/:applicationId?focus=cover-letter`. Switching applications is an explicit, URL-driven action — which triggers a remount (via React Router's key) and clears all child state automatically.

**Files changed (big):**
- New route structure in `App.tsx` + `app-routing.ts`
- New backend table/endpoint for `job_applications` (if not already present — `server/src/routes/` has a `job-applications.ts`? need to check)
- Each product screen reads the `applicationId` from URL, scopes state to it
- Data model: cover letter becomes "the cover letter FOR application X" rather than "the last cover letter this user generated"
- Sidebar / navigation surface shows "Your applications" with a selected one

**Effort:** 2-3 weeks. Touches routing, data model, every non-v3 product, backend, navigation UX.

**User-visible behavior:** The right mental model for recruiters and consultants. "I'm working on Andrew's application to Company X. Here's his resume, his JD, his cover letter draft, his interview prep for this role." Switching to another application is clicking a different card.

**Trade-off:** Large change. Worth doing eventually. Not a same-week fix.

---

### Recommendation — start with a hybrid

**Ship Approach A now (2-3 hours) as the floor, plan Approach C for a future sprint.**

Reasoning:

1. **Approach A closes the user-visible bug today** with a predictable, auditable mechanism. "Start new candidate" is a clear affordance; no magic detection; no surprise clearing.
2. **Approach B is actually fragile** unless the backend already exposes a candidate/resume ID that changes meaningfully on candidate pivot. I didn't verify this one way or the other — but adopting it requires either a backend change or a heuristic like "hash the resume text" which leaks into product logic.
3. **Approach C is the right destination** but is a 2-3 week undertaking. It would be a bad idea to cancel this sprint and start on it. Better to commit to it for a future sprint after the current production work stabilizes.

A + C in sequence gives the user a working fix this week and the right architecture next month.

---

## Part 2 — Export format assessment

### 2.1 — v2's export: actually already in production

**Important correction to my initial read:** a subagent pass initially reported "v2 has no export code." That's technically true if you only look at `server/src/agents/resume-v2/` — the server-side agent has no export logic. But **v2 has a full, production-quality export pipeline on the frontend.**

The architecture:

```
v2 pipeline output                  v3 pipeline output (not yet wired)
    │                                  │
    ▼                                  ▼
app/src/types/resume-v2.ts          server/src/v3/types.ts
    ResumeDraft                       WrittenResume
    │                                  │
    │  app/src/lib/resume-v2-export.ts │  ← MISSING: v3 adapter
    │  resumeDraftToFinalResume()      │
    ▼                                  ▼
              app/src/types/resume.ts
                   FinalResume            ← Common "export shape"
                        │
                        ├─▶ app/src/lib/export-pdf.ts    (551 lines, jsPDF, 2 templates)
                        ├─▶ app/src/lib/export-docx.ts  (893 lines, docx@9.5.3, 2 templates)
                        └─▶ buildPlainText() in ExportBar.tsx (plain text / clipboard copy)

                 app/src/components/resume-v2/ExportBar.tsx   ← v2's UI
```

**What v2 can produce today:**

| Format | Library | Templates | Status |
|---|---|---|---|
| PDF | jsPDF | `ats-classic` + `executive` (defined in `app/src/lib/export-templates.ts`) | Production-ready, shipping |
| DOCX | `docx` v9.5.3 (already in `app/package.json`) | Same two templates | Production-ready, shipping |
| Plain text | native (`buildPlainText()` in `ExportBar.tsx:393`) | None | Production (clipboard copy) |

**Quality signals from reading the code:**

- `export-pdf.ts` has a full WinAnsi Unicode sanitization pass (handles en-dash, em-dash, smart quotes, bullet chars). This was added after a bug I see referenced in a test file `sprint11-pdf-unicode.test.ts`. The code is not naive — it's been hardened.
- `export-docx.ts` has a full paragraph/run style system with fallback paths for incomplete v2 output (lines 622-706, mentioned by the subagent). It's handling the messy reality of draft outputs, not just a happy path.
- Two templates ("executive" with navy accent bar; "ATS classic" with all-caps headings, safe for ATS parsers) — that's a product-level differentiation, not just code.
- There are existing tests (`__tests__/export-pdf.test.ts`, `__tests__/export-docx.test.ts`).

**Coupling:** The export libs consume `FinalResume` (`app/src/types/resume.ts`). v2 adapts to this shape via `resume-v2-export.ts:resumeDraftToFinalResume()`. The shape isn't tied to any one pipeline — it's a clean common format. **v3's `WrittenResume` would need a similar adapter, and then the export libs work as-is.**

---

### 2.2 — Port / refactor / reference / fresh call: **extend the existing pipeline**

None of the four options in the task spec quite fit. The right answer is: **the export pipeline is already production-quality, already shipping, already well-structured. v3's job isn't to port or rewrite it — it's to wire v3 INTO it.**

The work for v3:
1. Write `app/src/lib/resume-v3-export.ts` — analogous to `resume-v2-export.ts`. Converts `WrittenResume` → `FinalResume`. Bulk of the effort.
2. Add an `ExportBar` equivalent to the v3 UI (currently no export surface at all in `app/src/components/resume-v3/`).
3. Reuse `export-pdf.ts`, `export-docx.ts`, `buildPlainText()` without modification.

This is closest to "port-as-is" of the four options, but what's being "ported" is a ~30-line adapter, not the 1,500+ lines of export logic. The export logic already works for v3 the moment the adapter exists.

---

### 2.3 — v3 export scope per format

**DOCX (owner's 60% priority):**
- **Library:** `docx` v9.5.3 — already in `app/package.json`, already working via v2.
- **Effort:** 2-3 hours total.
  - 90 min: write `resume-v3-export.ts` adapter (`WrittenResume` → `FinalResume`). Map `summary`, `selectedAccomplishments`, `coreCompetencies`, `positions[]`, `customSections[]` to the export shape. Handle the v3-specific shape of `positions` (per-position `bullets[]` with `is_new`/`confidence` metadata — strip those, keep text).
  - 30 min: add export buttons to v3 UI. Template selector (executive vs ATS) — reuse `app/src/components/resume-v2/ExportBar.tsx` as a template.
  - 30 min: test with 3-5 real v3 pipeline outputs, confirm layout.
- **Frontend vs backend:** Frontend. Matches existing pattern. No server-side rendering capacity needed.
- **Hard dependencies:** None new. `docx` already shipped; fonts are Calibri (system default on Windows) / Georgia (widely available).

**PDF (owner's 40% priority):**
- **Library:** jsPDF — already in `app/package.json`.
- **Effort:** 2-3 hours, mostly overlapping with DOCX work (same adapter).
  - Adapter is the same as DOCX — if done for DOCX first, PDF is "~1 hour to wire the PDF button through `exportPdf(finalResume)` + test".
- **Frontend vs backend:** Frontend. Same pattern.
- **Hard dependencies:** None new. jsPDF is WinAnsi-only for text encoding; `sanitizePdfText` (`export-pdf.ts:91-115`) handles the edge cases.

**Plain text (nice-to-have):**
- **Library:** None.
- **Effort:** 30-60 min.
  - `buildPlainText()` in `ExportBar.tsx:393` works against `ResumeDraft`, not `FinalResume`. Decide: port to use `FinalResume` (reusable across products) or write a v3-specific plain-text builder.
- **Frontend vs backend:** Frontend. Trivial string concat.
- **Hard dependencies:** None.

**Recommended order:**

1. **DOCX first** (aligns with owner's 60% priority + the adapter unlocks the other formats for free after).
2. **PDF second** (~1 hour once adapter exists).
3. **Plain text last** (smallest payoff, quickest win if done along the way).

I'd do all three in one session — the adapter is the expensive part, and it's one piece of work. Splitting into three separate stories would inflate the effort.

Total: **one focused day (~4-6 hours) ships all three formats for v3.**

---

### 2.4 — Extending to cover letters and thank-you notes

Yes, the architecture naturally extends. Already partially built:

- **`app/src/lib/export-cover-letter.ts`** already exists (155 lines — PDF via jsPDF, DOCX via `docx`). Simpler styling — one template, straight Helvetica/Calibri. Used by the cover-letter UI's copy/download buttons.
- The pattern for a new product is ~1.5 hours per format: copy `export-cover-letter.ts`, adjust the content shape, customize headings.

**One architectural note worth flagging without solving:** the inline-styling pattern (constants at file top, hard-coded fonts, no shared template system) is fine for 2-3 products but will calcify if we keep copy-pasting. Before the 5th product ships through this path, the shared-template extraction John's memory mentions would be the right refactor.

For now: not a blocker. Copy-paste is cheaper than premature abstraction at this scale.

---

## Sequencing recommendation

**Tackle state-reset first.** Here's why:

- **User-visible bug with a 2-3 hour fix.** Owner is actively hitting it during testing. Left unfixed, it'll bite real users (recruiters, consultants, anyone running multiple candidates) harder than it bites the owner.
- **Export is a feature gap, not a bug.** Users who need a resume download today can use Resume V2 (which exports fine). v3 doesn't have a user-facing export but v3 isn't production-default yet for most surfaces that need downloads — so the UX pain is lower.
- **State-reset fix is independent and low-risk.** Doesn't touch export. Doesn't block it.

**Then export.** One focused session, ~4-6 hours, ships DOCX + PDF + TXT for v3 via the existing adapter pattern.

### Combined timeline estimate

| Work | Effort | Sequencing |
|---|---|---|
| State-reset — Approach A ("Start Fresh" button) | 2-3 hours | Session 1 |
| State-reset — verify across all 5 products (cover letter, thank-you, LinkedIn, exec bio, interview prep) | 1-2 hours | Session 1 (same session) |
| v3 export — adapter + DOCX + PDF + TXT | 4-6 hours | Session 2 |
| **Total** | **~1 working day across 2 sessions** | |

If the owner wants Approach C (application-scoped workspaces) instead of A, that's a 2-3 week sprint of its own. Deferring to the future.

### Halt conditions addressed

- **v2 doesn't have meaningful export code:** False alarm. v2 has full PDF/DOCX export via a clean adapter pattern. The confusion was that the export code lives in `app/src/lib/`, not under `server/src/agents/resume-v2/`.
- **Cross-session data contamination:** Not found. The state persistence is scoped to one React component tree on one user's tab. Two users on two browsers see isolated state. This is a UX/session-reset gap, not a security issue.
- **State issue affecting v3 itself:** Not found. v3 routes by `?sessionId=X` which forces a remount on new session — v3 has the correct architecture that the non-v3 products lack. This is a reason to prefer v3's routing model in any future refactor.
- **Scope dramatically larger or smaller:** Neither. Both pieces scope cleanly.
