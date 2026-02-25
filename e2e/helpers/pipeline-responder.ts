/**
 * Event-driven panel detection + automatic response state machine.
 * Polls the UI every few seconds, detects which panel/gate is showing,
 * and responds appropriately to walk through the full pipeline.
 *
 * Key design decisions:
 * - Questionnaire "Continue" clicks are client-side only (no API call).
 *   Only the final "Submit" triggers POST /api/pipeline/respond.
 * - Positioning answers each trigger an immediate API call.
 * - Uses a cooldown map instead of a "seen" set to allow retries on failure.
 * - All API-triggering actions have 5s+ delay to stay well under 30 req/60s rate limit.
 * - Detects pipeline crashes via consecutive 409 errors and fails fast with diagnostics.
 */
import type { Page } from '@playwright/test';

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

function workspacePanelRoot(page: Page) {
  // The interactive workflow panel is rendered in the center <main> area.
  // Avoid matching sidebar/nav text (e.g., "Resume Blueprint" in the workflow rail).
  return page.locator('main [data-panel-root]').first();
}

/**
 * Detect what panel is currently visible by checking for distinguishing UI elements.
 */
async function detectCurrentPanel(page: Page): Promise<PanelType> {
  const panelRoot = workspacePanelRoot(page);
  const panelVisible = await panelRoot.isVisible().catch(() => false);

  // Check for completion first (terminal state)
  const completionVisible = panelVisible
    ? await panelRoot.filter({ hasText: 'Session Complete' }).isVisible().catch(() => false)
    : false;
  if (completionVisible) return 'completion';

  // Check for positioning profile choice — rendered in coach area, NOT [data-panel-root].
  // Appears when user has a saved positioning profile from a prior session.
  const profileChoiceVisible = await page
    .getByText('Found Your Positioning Profile')
    .isVisible()
    .catch(() => false);
  if (profileChoiceVisible) return 'positioning_profile_choice';

  // Check for positioning interview — "Why Me Interview" header text
  const positioningVisible = panelVisible
    ? await panelRoot.filter({ hasText: 'Why Me Interview' }).isVisible().catch(() => false)
    : false;
  if (positioningVisible) return 'positioning_interview';

  // Check for section review — "Looks Good" button in workbench
  const sectionWorkbench = panelVisible
    ? await panelRoot.getByRole('button', { name: /Looks Good/i }).isVisible().catch(() => false)
    : false;
  if (sectionWorkbench) return 'section_review';

  // Check for questionnaire — center panel with Back + Continue/Finish Batch actions.
  // Some questionnaires use rating or text input only, so don't require option groups.
  let questionnairePanel = false;
  if (panelVisible) {
    const hasBackButton = await panelRoot.getByRole('button', { name: /^Back$/i }).isVisible().catch(() => false);
    const hasQuestionActionButton = await panelRoot
      .getByRole('button', { name: /Continue|Submit|Finish Batch/i })
      .isVisible()
      .catch(() => false);
    const hasLooksGoodButton = await panelRoot.getByRole('button', { name: /Looks Good/i }).isVisible().catch(() => false);
    questionnairePanel = hasBackButton && hasQuestionActionButton && !hasLooksGoodButton;
  }
  if (questionnairePanel) return 'questionnaire';

  // Check for blueprint review — require both the header and the approve button
  // to avoid false positives from sidebar/step-guide text mentioning "Resume Blueprint".
  let blueprintVisible = false;
  if (panelVisible) {
    const hasBlueprintHeader = await panelRoot.filter({ hasText: 'Resume Blueprint' }).isVisible().catch(() => false);
    const hasApproveButton = await panelRoot
      .getByRole('button', { name: /Approve blueprint and start writing|Approve Blueprint/i })
      .isVisible()
      .catch(() => false);
    blueprintVisible = hasBlueprintHeader && hasApproveButton;
  }
  if (blueprintVisible) return 'blueprint_review';

  // Check for quality dashboard — header says "Quality Dashboard", score rings show "ATS"
  const qualityVisible = panelVisible
    ? await panelRoot.filter({ hasText: 'Quality Dashboard' }).isVisible().catch(() => false)
    : false;
  if (qualityVisible) return 'quality_dashboard';

  // Check for research dashboard
  const researchVisible = panelVisible
    ? await panelRoot.filter({ hasText: /Benchmark|Research/i }).isVisible().catch(() => false)
    : false;
  if (researchVisible) return 'research_dashboard';

  // Check for gap analysis
  const gapVisible = panelVisible
    ? await panelRoot.filter({ hasText: /Gap Analysis/i }).isVisible().catch(() => false)
    : false;
  if (gapVisible) return 'gap_analysis';

  return null;
}

/**
 * Build a unique key for the current panel state to prevent double-responding.
 * Uses visible text content to disambiguate between different questions/sections.
 */
async function getPanelKey(page: Page): Promise<string> {
  const KEY_TIMEOUT = 3_000; // Never wait more than 3s for a panel key

  const panelRoot = workspacePanelRoot(page);
  const exists = await panelRoot.isVisible().catch(() => false);
  if (!exists) {
    // For non-panel UI (like profile choice), use button text as key
    const buttons = await page
      .getByRole('button')
      .allTextContents()
      .catch(() => []);
    return buttons.join('|').slice(0, 80) || 'none';
  }

  // For positioning: use the question text (only if element actually exists)
  const questionEl = panelRoot.locator('p.text-base.font-medium').first();
  const questionCount = await panelRoot
    .locator('p.text-base.font-medium')
    .count()
    .catch(() => 0);
  if (questionCount > 0) {
    const questionText = await questionEl
      .textContent({ timeout: KEY_TIMEOUT })
      .catch(() => null);
    if (questionText) return questionText.slice(0, 80);
  }

  // For section review: use the section title (only if element actually exists)
  const h2Count = await panelRoot.locator('h2').count().catch(() => 0);
  if (h2Count > 0) {
    const sectionTitle = await panelRoot
      .locator('h2')
      .first()
      .textContent({ timeout: KEY_TIMEOUT })
      .catch(() => null);
    if (sectionTitle) return sectionTitle;
  }

  // Fallback: use a hash of visible button text
  const buttons = await panelRoot
    .getByRole('button')
    .allTextContents()
    .catch(() => []);
  return buttons.join('|').slice(0, 80) || 'unknown';
}

// ─── Panel Responders ─────────────────────────────────────────────────────────

/**
 * Respond to positioning profile choice — click "Use it (faster)" to reuse
 * existing profile and skip the lengthy interview stage.
 */
async function respondToProfileChoice(page: Page): Promise<void> {
  const useItBtn = page.getByRole('button', { name: /Use it/i });
  const isVisible = await useItBtn.isVisible().catch(() => false);
  if (isVisible) {
    await useItBtn.click();
    await page.waitForTimeout(POST_RESPONSE_DELAY_MS);
  }
}

/**
 * Respond to a positioning interview question.
 * Strategy: If suggestions are shown, click the first one.
 * Always type a substantive custom answer, then click Continue.
 * Each answer triggers an API call, so we add a generous delay.
 */
async function respondToPositioningQuestion(page: Page): Promise<void> {
  const panelRoot = workspacePanelRoot(page);

  // Check if there are suggestion cards with role="radio"
  const suggestions = panelRoot.locator('[role="radio"]');
  const suggestionCount = await suggestions.count().catch(() => 0);

  if (suggestionCount > 0) {
    await suggestions.first().click();
    await page.waitForTimeout(500);
  }

  // Type a substantive answer in the custom textarea
  const textarea = panelRoot.locator('textarea[aria-label="Custom answer"]');
  const textareaVisible = await textarea.isVisible().catch(() => false);
  if (textareaVisible) {
    await textarea.fill(
      'I have extensive experience in this area. In my current role, I led a team of 14 engineers ' +
        'to deliver a major cloud migration project, moving 60+ applications to AWS. ' +
        'This reduced hosting costs by 35% and improved system reliability significantly. ' +
        'I also established SRE practices and SLI/SLO frameworks that reduced P1 incidents by 42%.',
    );
    await page.waitForTimeout(300);
  }

  // Click Continue button — this triggers an API call
  const continueBtn = panelRoot.getByRole('button', {
    name: /Submit answer and continue|Continue/i,
  });
  const canClick = await continueBtn.isEnabled().catch(() => false);
  if (canClick) {
    await continueBtn.click();
    // Wait for the API response to complete before the next poll.
    // Each positioning answer is an API call — respect the rate limit.
    await page.waitForTimeout(POST_RESPONSE_DELAY_MS);
  }
}

/**
 * Respond to a questionnaire panel.
 * Strategy: Click through all questions (client-side Continue),
 * then Submit at the end (single API call). After Submit, return
 * immediately to let the outer loop handle the next panel.
 */
async function respondToQuestionnaire(page: Page): Promise<void> {
  const MAX_QUESTIONS = 20;

  for (let i = 0; i < MAX_QUESTIONS; i++) {
    await page.waitForTimeout(500);

    const panelRoot = workspacePanelRoot(page);

    // Check if we're still on a questionnaire
    const continueOrSubmit = panelRoot.getByRole('button', {
      name: /Continue|Submit|Finish Batch/i,
    });
    const hasContinue = await continueOrSubmit.isVisible().catch(() => false);
    if (!hasContinue) break;

    // Try to find and click the first option (radio or checkbox)
    const options = panelRoot.locator(
      '[role="radiogroup"] [role="radio"], [role="group"] [role="checkbox"]',
    );
    const optionCount = await options.count().catch(() => 0);

    if (optionCount > 0) {
      await options.first().click();
      await page.waitForTimeout(300);
    } else {
      // Rating input — try to find rating buttons
      const ratingBtns = panelRoot.locator(
        '[aria-label*="rating"], [role="slider"]',
      );
      const ratingCount = await ratingBtns.count().catch(() => 0);
      if (ratingCount > 0) {
        const midIdx = Math.floor(ratingCount / 2);
        await ratingBtns.nth(midIdx).click();
        await page.waitForTimeout(300);
      }

      // If there's a custom text area, type something
      const customTextarea = panelRoot.locator(
        'textarea[aria-label="Custom answer"]',
      );
      const hasCustom = await customTextarea.isVisible().catch(() => false);
      if (hasCustom && optionCount === 0) {
        await customTextarea.fill(
          'This aligns well with my experience and career goals.',
        );
        await page.waitForTimeout(300);
      }
    }

    // Check if Skip is available and Continue is disabled
    const continueEnabled = await continueOrSubmit.isEnabled().catch(
      () => false,
    );
    if (!continueEnabled) {
      const skipBtn = panelRoot.getByRole('button', { name: /Skip/i });
      const skipAvailable = await skipBtn.isVisible().catch(() => false);
      if (skipAvailable) {
        await skipBtn.click();
        await page.waitForTimeout(500);
        continue;
      }
      // Can't click anything — break and let the outer loop retry
      break;
    }

    // Check if this is the Submit button (last question — triggers API call)
    const buttonText = await continueOrSubmit.textContent().catch(
      () => 'Continue',
    );
    const isSubmit = /submit|finish\s*batch/i.test(buttonText ?? '');

    await continueOrSubmit.click();

    if (isSubmit) {
      // Submit triggers an API call. Wait for the panel to actually advance
      // before returning — the pipeline may take 1-5 min on Z.AI to process
      // (e.g., quality review after section writing). Without this, the outer
      // loop re-detects 'questionnaire' and re-submits repeatedly.
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
        // Heartbeat every ~30s
        const waitSec = Math.round((Date.now() - advanceStart) / 1000);
        if (waitSec > 0 && waitSec % 30 < (QUESTIONNAIRE_POLL_MS / 1000 + 1)) {
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
 * The approve button is at the bottom of a scrollable panel — scroll it into view first.
 */
async function approveBlueprint(page: Page): Promise<void> {
  // Scroll the panel container to the bottom to ensure the approve button is visible
  const scrollContainer = workspacePanelRoot(page).locator('[data-panel-scroll]').first();
  const scrollExists = await scrollContainer.isVisible().catch(() => false);
  if (scrollExists) {
    await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(500);
  }

  // Primary locator: aria-label match
  let approveBtn = page.getByRole('button', {
    name: /Approve blueprint and start writing/i,
  });
  let found = await approveBtn.isVisible().catch(() => false);

  // Fallback: match by visible text content
  if (!found) {
    // eslint-disable-next-line no-console
    console.log('[pipeline-responder] Blueprint: aria-label locator missed, trying text match...');
    approveBtn = workspacePanelRoot(page).locator('button').filter({
      hasText: /Approve Blueprint/i,
    });
    found = await approveBtn.isVisible().catch(() => false);
  }

  if (!found) {
    // eslint-disable-next-line no-console
    console.warn('[pipeline-responder] Blueprint: approve button not found after scroll');
    return;
  }

  const isEnabled = await approveBtn.isEnabled().catch(() => false);
  if (!isEnabled) {
    // eslint-disable-next-line no-console
    console.warn('[pipeline-responder] Blueprint: approve button found but disabled');
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[pipeline-responder] Blueprint: clicking approve button');
  await approveBtn.scrollIntoViewIfNeeded().catch(() => {});
  await approveBtn.click();
  // API call — wait for response
  await page.waitForTimeout(POST_RESPONSE_DELAY_MS);
}

/**
 * Get the current section title from the workbench h2 element.
 */
async function getSectionTitle(page: Page): Promise<string | null> {
  const panelRoot = workspacePanelRoot(page);
  const h2Count = await panelRoot.locator('h2').count().catch(() => 0);
  if (h2Count > 0) {
    return await panelRoot.locator('h2').first().textContent({ timeout: 3_000 }).catch(() => null);
  }
  return null;
}

/**
 * Approve a section in the workbench (click "Looks Good — Next Section").
 *
 * After clicking, waits for the panel to advance (new section title arrives, or
 * the panel type changes entirely) before returning to the main loop. This
 * prevents duplicate "Looks Good" clicks during the 1-5 minute Z.AI processing
 * time between sections.
 */
async function approveSectionReview(page: Page): Promise<void> {
  const looksGoodBtn = workspacePanelRoot(page).getByRole('button', { name: /Looks Good/i });
  // Wait up to 30s for the button to be visible (section may still be writing/rendering)
  const isVisible = await looksGoodBtn
    .waitFor({ state: 'visible', timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!isVisible) {
    // eslint-disable-next-line no-console
    console.warn('[pipeline-responder] Section review: "Looks Good" button not visible after 30s');
    return;
  }

  // Capture the current section title before clicking so we can detect when it changes
  const currentTitle = await getSectionTitle(page);

  // Wait for the button to become enabled (it may be locked during action processing)
  await page.waitForTimeout(1_000);
  const isEnabled = await looksGoodBtn.isEnabled().catch(() => false);
  if (!isEnabled) {
    // eslint-disable-next-line no-console
    console.warn('[pipeline-responder] Section review: "Looks Good" button disabled');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[pipeline-responder] Section review: clicking "Looks Good" for "${currentTitle}"`);
  await looksGoodBtn.scrollIntoViewIfNeeded().catch(() => {});
  // Use timeout on click — after approving the last section, an overlay (z-50) covers
  // the button while the pipeline advances to quality_review. Without timeout, Playwright
  // waits indefinitely for the overlay to clear, hanging the entire responder loop.
  try {
    await looksGoodBtn.click({ timeout: 10_000 });
  } catch {
    // eslint-disable-next-line no-console
    console.log('[pipeline-responder] Section review: click timed out (likely overlay blocking)');
    // Fall through to the advance-wait loop — the click may have succeeded before the overlay appeared.
  }

  // After clicking, wait for the panel to advance. The pipeline needs to:
  // 1. Receive our gate response (POST /api/pipeline/respond)
  // 2. Process approval + optionally start writing the next section (LLM call, 1-5 min)
  // 3. Emit the next event (section_draft for next section, quality_scores, or pipeline_complete)
  //
  // We poll until the panel changes. During this time, the "Looks Good" button stays
  // visible for the old section — we must NOT re-click it.
  const SECTION_ADVANCE_TIMEOUT_MS = 5 * 60 * 1_000; // 5 min for Z.AI latency
  const SECTION_POLL_MS = 5_000;
  const advanceStart = Date.now();

  // eslint-disable-next-line no-console
  console.log('[pipeline-responder] Section review: waiting for panel to advance...');

  while (Date.now() - advanceStart < SECTION_ADVANCE_TIMEOUT_MS) {
    await page.waitForTimeout(SECTION_POLL_MS);

    // Check if we've moved to a completely different panel type
    const currentPanel = await detectCurrentPanel(page);
    if (currentPanel !== 'section_review') {
      // eslint-disable-next-line no-console
      console.log(`[pipeline-responder] Section review: panel advanced to ${currentPanel ?? 'processing'}`);
      return;
    }

    // Check if the section title changed (next section arrived via section_draft SSE)
    const newTitle = await getSectionTitle(page);
    if (newTitle && newTitle !== currentTitle) {
      // eslint-disable-next-line no-console
      console.log(`[pipeline-responder] Section review: new section arrived: "${currentTitle}" -> "${newTitle}"`);
      return;
    }

    // Heartbeat log every ~30s so output shows test is alive
    const waitSec = Math.round((Date.now() - advanceStart) / 1000);
    if (waitSec > 0 && waitSec % 30 < (SECTION_POLL_MS / 1000 + 1)) {
      // eslint-disable-next-line no-console
      console.log(`[pipeline-responder] Section review: waiting for advance... (${waitSec}s, current: "${currentTitle}")`);
    }
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[pipeline-responder] Section review: timed out waiting for advance after ` +
      `${Math.round(SECTION_ADVANCE_TIMEOUT_MS / 60_000)} min (section: "${currentTitle}")`,
  );
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

// No checkPipelineStatus needed — we track 409 response bodies directly.

/**
 * Run through the entire pipeline by polling for panel changes and responding.
 * Returns when the completion panel is detected or the safety timeout expires.
 *
 * Uses a cooldown map instead of a "seen" set: after responding to a panel,
 * we wait RESPONSE_COOLDOWN_MS before responding to the same panel key again.
 * This allows retries if a response fails (e.g., 429 rate limit).
 *
 * Crash detection: monitors for consecutive 409 errors on /api/pipeline/respond.
 * After MAX_CONSECUTIVE_409 errors, checks pipeline status and fails fast with diagnostics.
 */
export async function runPipelineToCompletion(page: Page): Promise<void> {
  const lastResponded = new Map<string, number>();
  const start = Date.now();
  let lastActivityAt = Date.now();
  let lastPanel: PanelType = null;

  // Track consecutive 409 errors to detect pipeline crashes early
  let consecutive409Count = 0;
  let last409Body = '';

  // Listen for 409 errors on /api/pipeline/respond
  const on409 = async (response: { status: () => number; url: () => string; text: () => Promise<string> }) => {
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

  // Reset 409 counter on any successful pipeline response
  const onSuccess = (response: { status: () => number; url: () => string }) => {
    if (
      response.status() < 400 &&
      response.url().includes('/api/pipeline/respond')
    ) {
      if (consecutive409Count > 0) {
        // eslint-disable-next-line no-console
        console.log('[pipeline-responder] 409 counter reset after successful response');
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
      // Check if we've hit too many consecutive 409s (pipeline crashed)
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
        // eslint-disable-next-line no-console
        console.warn(
          `[pipeline-responder] No panel change for ${Math.round(STAGE_TIMEOUT_MS / 60_000)} min at ${elapsed}s. ` +
            `Current: ${panelType ?? 'processing'}. Last 409 body: ${last409Body || '(none)'}`,
        );
        lastActivityAt = Date.now(); // Reset to avoid spamming
      }

      // Non-interactive panels — just wait (log heartbeat every ~30s so output shows test is alive)
      if (
        panelType === null ||
        panelType === 'processing' ||
        panelType === 'research_dashboard' ||
        panelType === 'gap_analysis' ||
        panelType === 'quality_dashboard'
      ) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        const sinceActivity = Math.round((Date.now() - lastActivityAt) / 1000);
        if (sinceActivity > 0 && sinceActivity % 30 < (POLL_INTERVAL_MS / 1000 + 1)) {
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
        // Re-throw pipeline crash errors
        if (msg.includes('Pipeline crashed')) {
          throw err;
        }
        // eslint-disable-next-line no-console
        console.warn(
          `[pipeline-responder] Error responding to ${panelType}: ${msg}`,
        );
        // Don't record cooldown on error — allow immediate retry on next poll
      }

      // Wait before next poll
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    throw new Error(
      `[pipeline-responder] Safety timeout: pipeline did not complete within ${Math.round(MAX_WAIT_MS / 60_000)} minutes`,
    );
  } finally {
    // Clean up response listeners
    page.removeListener('response', on409);
    page.removeListener('response', onSuccess);
  }
}
