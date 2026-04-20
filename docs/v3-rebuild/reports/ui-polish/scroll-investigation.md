# Resume-view scroll investigation — deferred

**Date:** 2026-04-20
**Task:** v3 polish Step 3 (scroll failure during Playwright-driven testing)
**Status:** **Deferred by John.** No code change. No bug confirmed.

## Finding

John surfaced a scroll failure while driving v3 through Playwright during the UX test — he couldn't scroll down to see the full resume output. He has since indicated he believes this was likely a Playwright artifact (the headless browser's interaction model rather than a real CSS bug) and will re-check himself in a normal Chrome window when he gets to it.

Pending that manual repro, **no code has been modified** and **no CSS container has been inspected.**

## If it turns out to be a real bug — where to look first

Leaving these pointers so whoever (John or a future agent) picks this up has a running start. Not exhaustive — just the highest-probability suspects based on the current layout.

1. **`V3PipelineScreen.tsx` — the middle column wrapper.** Lines in the results layout (`showResults && (<div className="grid lg:grid-cols-[320px_1fr_300px] gap-6 h-full">`). Each column is `overflow-y-auto h-full pr-1`. If `h-full` isn't resolving to a bounded parent height, `overflow-y-auto` has nothing to clamp against and scroll won't engage. Parent is `flex-1 min-h-0 w-full mx-auto max-w-7xl px-4 pb-4`.
2. **`V3ResumeView.tsx` — any inner `max-h`**. Grep `max-h-` in that file; a nested clipper would cut content before the outer scroll can catch it.
3. **The `h-[calc(100vh-3.5rem)]` on the top-level `V3PipelineScreen` div.** If there's a viewport-height calculation drift (mobile URL bar, iOS safe areas), the total height can be shorter than expected and the bottom of the middle column falls off-screen without a visible scrollbar.
4. **Playwright viewport default is 1280×720.** On that viewport plus a header, the middle column is roughly 600px tall — a long resume (bshook-style) extends well past that. A working scroll should engage; if it doesn't, it's either the container hierarchy or a Playwright wheel-event issue.

## Playwright-specific considerations

- `page.evaluate(() => window.scrollTo(...))` scrolls the **document**, not the inner `overflow-y-auto` element. To scroll a nested container in Playwright, query the element first and set its `.scrollTop` directly, or use `mouse.wheel()` after hovering it.
- The `playwright-mcp` browser_evaluate wrapper doesn't expose a per-element scroll helper by default; John may have been using `window.scrollTo` and hitting this issue.

If John's manual test reproduces the bug in a normal browser, reopen this note and work through the four suspects above.

## Links

- UX-test journal that surfaced the issue: `docs/v3-rebuild/reports/ux-test/fixture-12-journey-log.md`
- UX-test verdict: `docs/v3-rebuild/reports/ux-test-combined.md`
