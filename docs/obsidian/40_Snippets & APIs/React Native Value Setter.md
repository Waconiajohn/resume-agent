# React Native Value Setter (E2E Pattern)

**Date documented:** 2026-03-09
**Sprint introduced:** Sprint 8
**File:** `e2e/helpers/pipeline-responder.ts`
**ADR:** ADR-006 in `docs/DECISIONS.md`

## Problem

The positioning interview panel (`PositioningInterviewPanel`) lives inside a zero-height flex container in the right pane. When banners and cards consume all the vertical space, the panel container gets 0px computed height. Playwright's standard `fill()` and `fill({ force: true })` don't reliably trigger React's `onChange` handler in this zero-height context.

The `needsElaboration` guard in the panel component gates submission (`canSubmit = hasCustomText`) — if `onChange` doesn't fire, the textarea value doesn't reach React state and the submit button stays disabled.

## Solution

Use `page.evaluate()` (DOM-direct access, bypasses layout visibility checks) with the React native value setter trick to set the textarea value in a way that triggers React's synthetic event system.

## Implementation

```ts
await page.evaluate(({ sel, text }) => {
  const panel = document.querySelector(sel);
  if (!panel) return;
  const ta = panel.querySelector(
    'textarea[aria-label="Custom answer"]'
  ) as HTMLTextAreaElement | null;
  if (!ta) return;

  // React 18/19 tracks value via the native setter on the prototype.
  // Setting .value directly changes DOM but doesn't update React's
  // internal tracker (React overrides the setter with its own tracking).
  // Using the native prototype setter bypasses React's override,
  // so the DOM value changes without updating React's tracker.
  // The subsequent synthetic `input` event sees the changed value
  // and triggers onChange with the new text.
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  if (nativeSetter) nativeSetter.call(ta, text);
  else ta.value = text;

  // Dispatch synthetic input event — React's event delegation picks
  // this up and calls onChange with the new value.
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}, { sel: '[data-panel-root]', text: customAnswerText });
```

## Why This Works

React (18+) overrides the `value` setter on `HTMLInputElement` and `HTMLTextAreaElement` instances with a tracking wrapper. Setting `.value = text` directly on an element instance calls the React-wrapped setter, which updates React's internal value tracker. If the value being set matches what React thinks is already there, `onChange` doesn't fire.

The native prototype setter (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set`) accesses the original browser-native setter, bypassing React's override. Calling it changes the DOM value without updating React's tracker. When the subsequent `input` event fires, React sees a discrepancy between the DOM value and its tracked value, and fires `onChange` with the new text.

## Usage Notes

- `page.evaluate()` runs in the browser context — all DOM access is synchronous and layout-independent
- `[data-panel-root]` is the selector for the right panel container — narrow this if needed
- `textarea[aria-label="Custom answer"]` selects the elaboration textarea specifically
- After this runs, the submit button should become enabled (React state updated)
- Wait for the button to be enabled before clicking: `await page.waitForFunction(() => !btn.disabled)`

## Related Pitfall: Suggestion Selection

The positioning interview panel has suggestion chips (inferred and JD-sourced suggestions). Selecting a suggestion without also filling custom text leaves `needsElaboration = true` and `canSubmit = false`. The E2E responder skips suggestion selection and fills custom text directly — simpler and reliable.

## When to Use This Pattern

Use this pattern whenever:
1. A React controlled input (`<input>` or `<textarea>`) is inside a zero-height container
2. Playwright's `fill()` or `fill({ force: true })` doesn't trigger `onChange`
3. The input's value change gates some UI action (button enable/disable, form validation)

Standard Playwright `locator.fill()` should always be tried first. Only fall back to this pattern when the zero-height layout causes `fill()` to fail.

## Related

- [[Project Hub]]
- ADR-006 in `docs/DECISIONS.md`
- `e2e/helpers/pipeline-responder.ts` — full usage in context

#type/snippet #sprint/8
