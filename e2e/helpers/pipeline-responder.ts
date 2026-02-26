/**
 * DOM-based panel detection + automatic response state machine.
 * Polls the UI every few seconds, detects which panel/gate is showing,
 * and responds appropriately to walk through the full pipeline.
 *
 * IMPORTANT: The workspace flex layout gives [data-panel-root] zero computed
 * height when banners/cards above it consume all space. This makes ALL child
 * elements invisible to Playwright's isVisible()/click()/fill() methods.
 *
 * Solution: All detection uses page.evaluate() to inspect the DOM directly.
 * All clicks use locator.evaluate(el => el.click()) to dispatch native DOM
 * click events. All fills use locator.fill(value, { force: true }).
 *
 * Key design decisions:
 * - Questionnaire "Continue" clicks are client-side only (no API call).
 *   Only the final "Submit" triggers POST /api/pipeline/respond.
 * - Positioning answers each trigger an immediate API call.
 * - Uses a cooldown map instead of a "seen" set to allow retries on failure.
 * - All API-triggering actions have 5s+ delay to stay well under 30 req/60s rate limit.
 * - Detects pipeline crashes via consecutive 409 errors and fails fast with diagnostics.
 */
import type { Page, Locator } from '@playwright/test';

const POLL_INTERVAL_MS = 4_000;
const MAX_WAIT_MS = 55 * 60 * 1_000; // 55 min safety
const STAGE_TIMEOUT_MS = 10 * 60 * 1_000; // 10 min per stage before warning
const RESPONSE_COOLDOWN_MS = 15_000; // Don't re-respond to same panel for 15s
const POST_RESPONSE_DELAY_MS = 5_000; // Wait 5s after API-triggering actions
const MAX_CONSECUTIVE_409 = 3; // Fail fast after 3 consecutive 409 errors

type PanelType =
  | 'positioning_profile_choice'
  | 'positioning_interview'
  | 'questionnaire'
  | 'blueprint_review'
  | 'section_review'
  | 'quality_dashboard'
  | 'completion'
  | 'research_dashboard'
  | 'gap_analysis'
  | 'processing'
  | null;

const PANEL_SEL = '[data-panel-root]';

// ─── DOM Helpers ──────────────────────────────────────────────────────────────
// These bypass Playwright's visibility/actionability checks entirely by
// operating on the DOM directly. Essential for the zero-height panel layout.

/**
 * Click a DOM element found by a Playwright locator.
 * Uses locator.evaluate() to dispatch a native click event, completely
 * bypassing Playwright's visibility and pointer-event checks.
 */
async function domClick(loc: Locator): Promise<boolean> {
  const count = await loc.count().catch(() => 0);
  if (count === 0) return false;
  await loc.first().evaluate((el) => (el as HTMLElement).click());
  return true;
}

/**
 * Check if a button matching a text pattern exists and is enabled inside a scope.
 */
async function domButtonExists(
  page: Page,
  textPattern: RegExp,
  scope: string = PANEL_SEL,
): Promise<boolean> {
  return page.evaluate(
    ({ src, flags, sel }) => {
      const root = sel ? document.querySelector(sel) : document.body;
      if (!root) return false;
      const re = new RegExp(src, flags);
      return Array.from(root.querySelectorAll('button')).some(
        (b) => re.test(b.textContent?.trim() || '') && !b.disabled,
      );
    },
    { src: textPattern.source, flags: textPattern.flags, sel: scope },
  );
}

// ─── Panel Detection ──────────────────────────────────────────────────────────

/**
 * Detect what panel is currently active by inspecting the DOM directly.
 * Uses page.evaluate() so it works even when [data-panel-root] has zero height.
 */
async function detectCurrentPanel(page: Page): Promise<PanelType> {
  return page.evaluate((panelSel) => {
    const btnTexts = (root: Element | Document): string[] =>
      Array.from(root.querySelectorAll('button')).map(
        (b) => b.textContent?.trim() || '',
      );

    // 1. Completion (terminal state) — check full page
    const main = document.querySelector('main');
    if (main?.textContent?.includes('Session Complete')) return 'completion';

    // 2. Positioning profile choice — rendered OUTSIDE [data-panel-root]
    if (
      document.body.textContent?.includes('Saved Positioning Profile Found')
    ) {
      // Confirm the "Use Saved Profile" button exists
      const pageButtons = btnTexts(document.body);
      if (pageButtons.some((t) => /Use Saved Profile|Use it/i.test(t))) {
        return 'positioning_profile_choice';
      }
    }

    // Scope remaining checks to [data-panel-root]
    const panel = document.querySelector(panelSel);
    if (!panel) return null;

    const text = panel.textContent || '';
    const buttons = btnTexts(panel);

    // 3. Positioning interview — "Why Me Interview" header
    if (text.includes('Why Me Interview')) return 'positioning_interview';

    // 4. Section review — has "Looks Good" button
    if (buttons.some((b) => /Looks Good/i.test(b))) return 'section_review';

    // 5. Questionnaire — has Back + Continue/Submit/Finish Batch, no Looks Good
    const hasBack = buttons.some((b) => /^Back$/i.test(b));
    const hasContinue = buttons.some(
      (b) => /Continue|Submit|Finish Batch/i.test(b),
    );
    const hasLooksGood = buttons.some((b) => /Looks Good/i.test(b));
    if (hasBack && hasContinue && !hasLooksGood) return 'questionnaire';

    // 6. Blueprint review — both header text AND approve button
    if (text.includes('Resume Blueprint')) {
      const hasApprove = buttons.some(
        (b) => /Approve blueprint|Approve Blueprint/i.test(b),
      );
      if (hasApprove) return 'blueprint_review';
    }

    // 7. Quality dashboard
    if (text.includes('Quality Dashboard')) return 'quality_dashboard';

    // Non-interactive panels (for logging only)
    if (
      text.includes('Research Dashboard') ||
      text.includes('Benchmark Candidate')
    )
      return 'research_dashboard';
    if (text.includes('Gap Analysis') || text.includes('Gap Map'))
      return 'gap_analysis';

    return null;
  }, PANEL_SEL) as Promise<PanelType>;
}

/**
 * Build a unique key for the current panel state to prevent double-responding.
 * Uses DOM text inspection — works regardless of element visibility.
 */
async function getPanelKey(page: Page): Promise<string> {
  return page.evaluate((panelSel) => {
    const panel = document.querySelector(panelSel);
    if (!panel) {
      // Fallback for non-panel UI (like profile choice)
      const buttons = Array.from(document.querySelectorAll('button')).map(
        (b) => b.textContent?.trim() || '',
      );
      return buttons.join('|').slice(0, 80) || 'none';
    }

    // Positioning question text
    const questionEl = panel.querySelector('p.text-base.font-medium');
    if (questionEl?.textContent) return questionEl.textContent.slice(0, 80);

    // Section title
    const h2 = panel.querySelector('h2');
    if (h2?.textContent) return h2.textContent.trim();

    // Fallback: button text
    const buttons = Array.from(panel.querySelectorAll('button')).map(
      (b) => b.textContent?.trim() || '',
    );
    return buttons.join('|').slice(0, 80) || 'unknown';
  }, PANEL_SEL);
}

// ─── Panel Responders ─────────────────────────────────────────────────────────

/**
 * Respond to positioning profile choice — click "Use Saved Profile" to reuse
 * existing profile and skip the lengthy interview stage.
 */
async function respondToProfileChoice(page: Page): Promise<void> {
  // Profile choice is rendered outside [data-panel-root] — search full page
  const useItBtn = page
    .locator('button')
    .filter({ hasText: /Use Saved Profile|Use it/i })
    .first();
  const clicked = await domClick(useItBtn);
  if (clicked) {
    await page.waitForTimeout(POST_RESPONSE_DELAY_MS);
  }
}

/**
 * Respond to a positioning interview question.
 * Strategy: If suggestions are shown, click the first one.
 * Always type a substantive custom answer, then click Continue.
 * Each answer triggers an API call, so we add a generous delay.
 *
 * Uses page.evaluate() for all interactions to bypass zero-height layout.
 */
async function respondToPositioningQuestion(page: Page): Promise<void> {
  // Step 1: Click first suggestion if available
  await page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (!panel) return;
    const radio = panel.querySelector('[role="radio"]') as HTMLElement | null;
    if (radio) radio.click();
  }, PANEL_SEL);
  await page.waitForTimeout(500);

  // Step 2: Fill custom textarea
  const textarea = page.locator(`${PANEL_SEL} textarea[aria-label="Custom answer"]`).first();
  if ((await textarea.count().catch(() => 0)) > 0) {
    await textarea.fill(
      'I have extensive experience in this area. In my current role, I led a team of 14 engineers ' +
        'to deliver a major cloud migration project, moving 60+ applications to AWS. ' +
        'This reduced hosting costs by 35% and improved system reliability significantly. ' +
        'I also established SRE practices and SLI/SLO frameworks that reduced P1 incidents by 42%.',
      { force: true },
    );
    await page.waitForTimeout(300);
  }

  // Step 3: Click Continue button (triggers API call)
  const clicked = await page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (!panel) return false;
    const buttons = Array.from(panel.querySelectorAll('button'));
    const btn = buttons.find(
      (b) => /Submit answer and continue|Continue/i.test(b.textContent?.trim() || '') && !b.disabled,
    );
    if (btn) { (btn as HTMLElement).click(); return true; }
    return false;
  }, PANEL_SEL);

  if (clicked) {
    await page.waitForTimeout(POST_RESPONSE_DELAY_MS);
  }
}

/**
 * Respond to a questionnaire panel.
 * Strategy: Click through all questions (client-side Continue),
 * then Submit at the end (single API call). After Submit, return
 * immediately to let the outer loop handle the next panel.
 *
 * Uses page.evaluate() for ALL interactions to bypass zero-height layout.
 * Playwright's getByRole/locator can't find elements in zero-height containers,
 * but page.evaluate() accesses the DOM directly and always works.
 */
async function respondToQuestionnaire(page: Page): Promise<void> {
  const MAX_QUESTIONS = 20;

  for (let i = 0; i < MAX_QUESTIONS; i++) {
    await page.waitForTimeout(500);

    // Step 1: Check if we're still on a questionnaire (DOM check)
    const hasActionBtn = await page.evaluate((sel) => {
      const panel = document.querySelector(sel);
      if (!panel) return false;
      return Array.from(panel.querySelectorAll('button')).some(
        (b) => /Continue|Submit|Finish Batch/i.test(b.textContent?.trim() || ''),
      );
    }, PANEL_SEL);
    if (!hasActionBtn) break;

    // Step 2: Try to select first option (radio or checkbox) via DOM
    await page.evaluate((sel) => {
      const panel = document.querySelector(sel);
      if (!panel) return;
      const radio = panel.querySelector(
        '[role="radiogroup"] [role="radio"]',
      ) as HTMLElement | null;
      if (radio) { radio.click(); return; }
      const checkbox = panel.querySelector(
        '[role="group"] [role="checkbox"]',
      ) as HTMLElement | null;
      if (checkbox) { checkbox.click(); return; }
      // Try rating buttons
      const ratings = panel.querySelectorAll(
        '[aria-label*="rating"], [role="slider"]',
      );
      if (ratings.length > 0) {
        const mid = Math.floor(ratings.length / 2);
        (ratings[mid] as HTMLElement).click();
      }
    }, PANEL_SEL);
    await page.waitForTimeout(300);

    // Step 3: Fill custom textarea if present (Playwright fill with force)
    const customTextarea = page
      .locator(`${PANEL_SEL} textarea[aria-label="Custom answer"]`)
      .first();
    if ((await customTextarea.count().catch(() => 0)) > 0) {
      await customTextarea
        .fill('This aligns well with my experience and career goals.', {
          force: true,
        })
        .catch(() => {});
      await page.waitForTimeout(300);
    }

    // Step 4: Click action button (Continue/Submit/Finish Batch) via DOM
    const clickResult = await page.evaluate((sel) => {
      const panel = document.querySelector(sel);
      if (!panel) return 'break';
      const buttons = Array.from(panel.querySelectorAll('button'));

      const actionBtn = buttons.find(
        (b) =>
          /Continue|Submit|Finish Batch/i.test(b.textContent?.trim() || ''),
      );
      if (!actionBtn) return 'break';

      if ((actionBtn as HTMLButtonElement).disabled) {
        // Try Skip if action button is disabled
        const skipBtn = buttons.find(
          (b) =>
            /^Skip$/i.test(b.textContent?.trim() || '') &&
            !(b as HTMLButtonElement).disabled,
        );
        if (skipBtn) {
          (skipBtn as HTMLElement).click();
          return 'skipped';
        }
        return 'disabled';
      }

      const text = actionBtn.textContent?.trim() || '';
      const isSubmit = /Submit|Finish Batch/i.test(text);
      (actionBtn as HTMLElement).click();
      return isSubmit ? 'submitted' : 'continued';
    }, PANEL_SEL);

    if (clickResult === 'break' || clickResult === 'disabled') break;
    if (clickResult === 'skipped') {
      await page.waitForTimeout(500);
      continue;
    }

    if (clickResult === 'submitted') {
      // Submit triggers an API call. Wait for the panel to actually advance.
      // eslint-disable-next-line no-console
      console.log(
        '[pipeline-responder] Questionnaire submitted, waiting for pipeline to advance...',
      );

      const QUESTIONNAIRE_ADVANCE_TIMEOUT_MS = 5 * 60 * 1_000;
      const QUESTIONNAIRE_POLL_MS = 5_000;
      const advanceStart = Date.now();

      while (Date.now() - advanceStart < QUESTIONNAIRE_ADVANCE_TIMEOUT_MS) {
        await page.waitForTimeout(QUESTIONNAIRE_POLL_MS);
        const currentPanel = await detectCurrentPanel(page);
        if (currentPanel !== 'questionnaire') {
          // eslint-disable-next-line no-console
          console.log(
            `[pipeline-responder] Questionnaire: panel advanced to ${currentPanel ?? 'processing'}`,
          );
          return;
        }
        const waitSec = Math.round((Date.now() - advanceStart) / 1000);
        if (waitSec > 0 && waitSec % 30 < QUESTIONNAIRE_POLL_MS / 1000 + 1) {
          // eslint-disable-next-line no-console
          console.log(
            `[pipeline-responder] Questionnaire: waiting for advance... (${waitSec}s)`,
          );
        }
      }

      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline-responder] Questionnaire: timed out waiting for advance after ` +
          `${Math.round(QUESTIONNAIRE_ADVANCE_TIMEOUT_MS / 60_000)} min`,
      );
      return;
    }

    // Continue is client-side only — brief pause for UI transition
    await page.waitForTimeout(800);
  }
}

/**
 * Approve the resume blueprint.
 * Uses page.evaluate() to find and click the approve button in the DOM,
 * bypassing zero-height layout issues.
 */
async function approveBlueprint(page: Page): Promise<void> {
  // Scroll the panel container to bottom (via DOM) to make approve button visible
  await page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (!panel) return;
    const scrollContainer = panel.querySelector('[data-panel-scroll]');
    if (scrollContainer) scrollContainer.scrollTo(0, scrollContainer.scrollHeight);
  }, PANEL_SEL);
  await page.waitForTimeout(500);

  // Find and click approve button via DOM
  const clicked = await page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (!panel) return 'not_found';
    const buttons = Array.from(panel.querySelectorAll('button'));
    const approveBtn = buttons.find(
      (b) => /Approve blueprint|Approve Blueprint/i.test(b.textContent?.trim() || ''),
    );
    if (!approveBtn) return 'not_found';
    if ((approveBtn as HTMLButtonElement).disabled) return 'disabled';
    (approveBtn as HTMLElement).click();
    return 'clicked';
  }, PANEL_SEL);

  if (clicked === 'not_found') {
    // eslint-disable-next-line no-console
    console.warn('[pipeline-responder] Blueprint: approve button not found in DOM');
    return;
  }
  if (clicked === 'disabled') {
    // eslint-disable-next-line no-console
    console.warn('[pipeline-responder] Blueprint: approve button found but disabled');
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[pipeline-responder] Blueprint: clicking approve button');
  await page.waitForTimeout(POST_RESPONSE_DELAY_MS);
}

/**
 * Get the current section title from the workbench h2 element.
 */
async function getSectionTitle(page: Page): Promise<string | null> {
  return page.evaluate((panelSel) => {
    const panel = document.querySelector(panelSel);
    const h2 = panel?.querySelector('h2');
    return h2?.textContent?.trim() || null;
  }, PANEL_SEL);
}

/**
 * Approve a section in the workbench (click "Looks Good — Next Section").
 *
 * After clicking, waits for the panel to advance (new section title arrives, or
 * the panel type changes entirely) before returning to the main loop.
 *
 * Uses page.evaluate() for button detection and clicking to bypass zero-height layout.
 */
async function approveSectionReview(page: Page): Promise<void> {
  // Poll for the "Looks Good" button to exist in DOM (section may still be writing)
  const WAIT_FOR_BUTTON_MS = 30_000;
  const BUTTON_POLL_MS = 2_000;
  const btnStart = Date.now();
  let btnFound = false;

  while (Date.now() - btnStart < WAIT_FOR_BUTTON_MS) {
    const exists = await page.evaluate((sel) => {
      const panel = document.querySelector(sel);
      if (!panel) return false;
      return Array.from(panel.querySelectorAll('button')).some(
        (b) => /Looks Good/i.test(b.textContent?.trim() || ''),
      );
    }, PANEL_SEL);
    if (exists) { btnFound = true; break; }
    await page.waitForTimeout(BUTTON_POLL_MS);
  }

  if (!btnFound) {
    // eslint-disable-next-line no-console
    console.warn(
      '[pipeline-responder] Section review: "Looks Good" button not found after 30s',
    );
    return;
  }

  // Capture the current section title before clicking
  const currentTitle = await getSectionTitle(page);

  // Brief wait for any pending action locks to clear
  await page.waitForTimeout(1_000);

  // Click "Looks Good" via DOM
  const clicked = await page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (!panel) return false;
    const btn = Array.from(panel.querySelectorAll('button')).find(
      (b) => /Looks Good/i.test(b.textContent?.trim() || '') && !b.disabled,
    );
    if (btn) { (btn as HTMLElement).click(); return true; }
    return false;
  }, PANEL_SEL);

  if (!clicked) {
    // eslint-disable-next-line no-console
    console.warn('[pipeline-responder] Section review: "Looks Good" button disabled or gone');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[pipeline-responder] Section review: clicking "Looks Good" for "${currentTitle}"`,
  );

  // Wait for the panel to advance. The pipeline needs to process approval
  // and start writing the next section (LLM call, 1-5 min on Z.AI).
  const SECTION_ADVANCE_TIMEOUT_MS = 5 * 60 * 1_000;
  const SECTION_POLL_MS = 5_000;
  const advanceStart = Date.now();

  // eslint-disable-next-line no-console
  console.log(
    '[pipeline-responder] Section review: waiting for panel to advance...',
  );

  while (Date.now() - advanceStart < SECTION_ADVANCE_TIMEOUT_MS) {
    await page.waitForTimeout(SECTION_POLL_MS);

    // Check if we've moved to a different panel type
    const currentPanel = await detectCurrentPanel(page);
    if (currentPanel !== 'section_review') {
      // eslint-disable-next-line no-console
      console.log(
        `[pipeline-responder] Section review: panel advanced to ${currentPanel ?? 'processing'}`,
      );
      return;
    }

    // Check if the section title changed (next section arrived)
    const newTitle = await getSectionTitle(page);
    if (newTitle && newTitle !== currentTitle) {
      // eslint-disable-next-line no-console
      console.log(
        `[pipeline-responder] Section review: new section arrived: "${currentTitle}" -> "${newTitle}"`,
      );
      return;
    }

    // Heartbeat log every ~30s
    const waitSec = Math.round((Date.now() - advanceStart) / 1000);
    if (waitSec > 0 && waitSec % 30 < SECTION_POLL_MS / 1000 + 1) {
      // eslint-disable-next-line no-console
      console.log(
        `[pipeline-responder] Section review: waiting for advance... (${waitSec}s, current: "${currentTitle}")`,
      );
    }
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[pipeline-responder] Section review: timed out waiting for advance after ` +
      `${Math.round(SECTION_ADVANCE_TIMEOUT_MS / 60_000)} min (section: "${currentTitle}")`,
  );
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

/**
 * Run through the entire pipeline by polling for panel changes and responding.
 * Returns when the completion panel is detected or the safety timeout expires.
 */
export async function runPipelineToCompletion(page: Page): Promise<void> {
  const lastResponded = new Map<string, number>();
  const start = Date.now();
  let lastActivityAt = Date.now();
  let lastPanel: PanelType = null;

  // Track consecutive 409 errors to detect pipeline crashes
  let consecutive409Count = 0;
  let last409Body = '';

  const on409 = async (response: {
    status: () => number;
    url: () => string;
    text: () => Promise<string>;
  }) => {
    if (
      response.status() === 409 &&
      response.url().includes('/api/pipeline/respond')
    ) {
      consecutive409Count++;
      try {
        last409Body = await response.text();
      } catch {
        last409Body = '(could not read body)';
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline-responder] 409 on /respond (${consecutive409Count}/${MAX_CONSECUTIVE_409}): ${last409Body}`,
      );
    }
  };

  const onSuccess = (response: {
    status: () => number;
    url: () => string;
  }) => {
    if (
      response.status() < 400 &&
      response.url().includes('/api/pipeline/respond')
    ) {
      if (consecutive409Count > 0) {
        // eslint-disable-next-line no-console
        console.log(
          '[pipeline-responder] 409 counter reset after successful response',
        );
      }
      consecutive409Count = 0;
      last409Body = '';
    }
  };

  page.on('response', on409);
  page.on('response', onSuccess);

  // eslint-disable-next-line no-console
  console.log('[pipeline-responder] Starting pipeline response loop');

  try {
    while (Date.now() - start < MAX_WAIT_MS) {
      // Check for pipeline crash (too many consecutive 409s)
      if (consecutive409Count >= MAX_CONSECUTIVE_409) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        throw new Error(
          `[pipeline-responder] Pipeline crashed! Got ${consecutive409Count} consecutive 409 errors at ${elapsed}s. ` +
            `Last 409 body: ${last409Body}. Last panel: ${lastPanel ?? 'none'}`,
        );
      }

      const panelType = await detectCurrentPanel(page);

      // Log panel transitions
      if (panelType !== lastPanel) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        // eslint-disable-next-line no-console
        console.log(
          `[pipeline-responder] [${elapsed}s] Panel: ${lastPanel ?? 'none'} -> ${panelType ?? 'processing'}`,
        );
        lastPanel = panelType;
        lastActivityAt = Date.now();
      }

      // Terminal state
      if (panelType === 'completion') {
        // eslint-disable-next-line no-console
        console.log('[pipeline-responder] Pipeline complete!');
        return;
      }

      // Warn if stuck on a stage too long
      if (Date.now() - lastActivityAt > STAGE_TIMEOUT_MS) {
        const elapsed = Math.round((Date.now() - start) / 1000);

        // Diagnostic dump when stuck for 10 min
        const diag = await page.evaluate((sel) => {
          const panel = document.querySelector(sel);
          const panelText = panel?.textContent?.slice(0, 200) || '(no panel root)';
          const allButtons = Array.from(document.querySelectorAll('button'))
            .map((b) => b.textContent?.trim())
            .filter(Boolean)
            .slice(0, 15);
          return { panelText, allButtons };
        }, PANEL_SEL);

        // eslint-disable-next-line no-console
        console.warn(
          `[pipeline-responder] No panel change for ${Math.round(STAGE_TIMEOUT_MS / 60_000)} min at ${elapsed}s. ` +
            `Current: ${panelType ?? 'processing'}. Last 409 body: ${last409Body || '(none)'}. ` +
            `Panel text: ${diag.panelText}. Buttons: ${diag.allButtons.join(', ')}`,
        );
        lastActivityAt = Date.now(); // Reset to avoid spamming
      }

      // Non-interactive panels — just wait
      if (
        panelType === null ||
        panelType === 'processing' ||
        panelType === 'research_dashboard' ||
        panelType === 'gap_analysis' ||
        panelType === 'quality_dashboard'
      ) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        const sinceActivity = Math.round(
          (Date.now() - lastActivityAt) / 1000,
        );

        // Recovery: when stuck 2+ min with no interactive panel, try "Generate Draft Now"
        // This button bypasses the coverage threshold and forces momentum mode.
        if (sinceActivity > 120 && !lastResponded.has('generate_draft_now')) {
          const hasDraftBtn = await domButtonExists(
            page,
            /Generate Draft Now/i,
            'main',
          );
          if (hasDraftBtn) {
            // eslint-disable-next-line no-console
            console.log(
              `[pipeline-responder] [${elapsed}s] Clicking "Generate Draft Now" to bypass coverage gap (stuck ${sinceActivity}s)`,
            );
            const draftBtn = page
              .locator('main button')
              .filter({ hasText: /Generate Draft Now/i })
              .first();
            await domClick(draftBtn);
            await page.waitForTimeout(POST_RESPONSE_DELAY_MS);
            lastActivityAt = Date.now();
            lastResponded.set('generate_draft_now', Date.now());
            continue;
          }
        }

        if (
          sinceActivity > 0 &&
          sinceActivity % 30 < POLL_INTERVAL_MS / 1000 + 1
        ) {
          // eslint-disable-next-line no-console
          console.log(
            `[pipeline-responder] [${elapsed}s] Waiting... (${panelType ?? 'no panel'}, ${sinceActivity}s since last activity)`,
          );
        }
        await page.waitForTimeout(POLL_INTERVAL_MS);
        continue;
      }

      // Build a unique key to identify this specific panel state
      const panelKey = `${panelType}_${await getPanelKey(page)}`;

      // Cooldown check: skip if we responded to this same panel recently
      const lastTime = lastResponded.get(panelKey) ?? 0;
      if (Date.now() - lastTime < RESPONSE_COOLDOWN_MS) {
        await page.waitForTimeout(POLL_INTERVAL_MS);
        continue;
      }

      // Respond to the panel
      try {
        const elapsed = Math.round((Date.now() - start) / 1000);
        // eslint-disable-next-line no-console
        console.log(
          `[pipeline-responder] [${elapsed}s] Responding to: ${panelType}`,
        );

        switch (panelType) {
          case 'positioning_profile_choice':
            await respondToProfileChoice(page);
            break;
          case 'positioning_interview':
            await respondToPositioningQuestion(page);
            break;
          case 'questionnaire':
            await respondToQuestionnaire(page);
            break;
          case 'blueprint_review':
            await approveBlueprint(page);
            break;
          case 'section_review':
            await approveSectionReview(page);
            break;
        }

        lastResponded.set(panelKey, Date.now());
        lastActivityAt = Date.now();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Pipeline crashed')) throw err;
        // eslint-disable-next-line no-console
        console.warn(
          `[pipeline-responder] Error responding to ${panelType}: ${msg}`,
        );
      }

      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    throw new Error(
      `[pipeline-responder] Safety timeout: pipeline did not complete within ${Math.round(MAX_WAIT_MS / 60_000)} minutes`,
    );
  } finally {
    page.removeListener('response', on409);
    page.removeListener('response', onSuccess);
  }
}
