# fixture-12 joel-hough — journey log

**Wall clock from Generate click to "pipeline complete":** 203 seconds
**Pipeline-reported elapsed:** 163.9s (stages) + translate sidecar ~40s
**Cost:** $0.047

## Journey

1. Navigated to `http://localhost:5173/resume-builder/session` — already authenticated as John Schrup.
2. Selected "Upload a different resume for this run" radio.
3. Clicked Drop zone; uploaded `Joel Hough resume.docx` (8,061 chars ingested).
4. Clicked "Or paste text" under Job description; pasted synthetic 1,700-char VP Operations JD.
5. Generate button enabled; clicked.
6. All 6 stages (EXTRACT → CLASSIFY → BENCHMARK → STRATEGIZE → WRITE → VERIFY) ran sequentially with visible progress checkmarks.
7. Output rendered in the three-panel layout (Benchmark left, Resume middle, Review right).

## UI friction observations

- Wait felt long (203s is longer than user expectation of ~60-90s). The progress bar keeps the user informed which helps, but there's no interim text saying "verify is running and will take ~40s more" — only the silent "Waiting on review…" state.
- Screenshot + text capture clean. No broken panels, no missing sections.
- "Needs review" chip is clear. Single issue rendered with both actions visible. Copy is actionable ("Pick one number and use it consistently").
- `AI` badges on every rewritten bullet in the Professional Experience section — clear attribution signal.
- Promote panel below the resume is collapsed-by-default with two CTAs ("Save defaults" / "Review & pick"). Clean.

## No blockers

- No console errors surfaced in the UI (one console entry from the auth page load, unrelated to the pipeline).
- No broken panels, no empty sections, no failed API calls visible to the user.
- Pipeline completed cleanly.
