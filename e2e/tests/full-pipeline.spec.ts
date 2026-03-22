import { test, expect } from '@playwright/test';
import {
  REAL_RESUME_TEXT,
  REAL_JD_TEXT,
} from '../fixtures/real-resume-data';
import { cleanupBeforeTest } from '../helpers/cleanup';

test.describe('Full Pipeline E2E', () => {
  // Clean up stale state before the test: reset session usage, clear stuck pipelines
  test.beforeAll(async () => {
    await cleanupBeforeTest();
  });

  test('complete V2 resume journey from intake to PDF download', async ({
    page,
  }) => {
    // Capture browser console for debugging
    // Suppress "Failed to load resource" errors — real API errors are captured
    // by the response listener below which has proper URL-based filtering.
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const text = msg.text();
        if (text.includes('Failed to load resource')) return;
        // eslint-disable-next-line no-console
        console.log(`[browser] [${msg.type()}] ${text}`);
      }
    });

    // Capture failed network requests with response bodies
    page.on('response', (response) => {
      if (response.status() >= 400) {
        const url = response.url();
        // eslint-disable-next-line no-console
        console.log(`[network] ${response.status()} ${url}`);
        if (url.includes('/api/')) {
          response
            .text()
            .then((body) => {
              // eslint-disable-next-line no-console
              console.log(
                `[network] Response body: ${body.slice(0, 500)}`,
              );
            })
            .catch(() => {});
        }
      }
    });

    // Step 1: Navigate directly to the current Resume Builder session route
    await test.step('Navigate to the current Resume Builder session route', async () => {
      await page.goto('/resume-builder/session');
      await expect(page.locator('#v2-resume')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('#v2-jd')).toBeVisible({
        timeout: 15_000,
      });
    });

    // Step 2: Fill the V2 intake form and submit
    await test.step('Fill V2 intake form and submit', async () => {
      await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
      await page.locator('#v2-jd').fill(REAL_JD_TEXT);

      // Submit button text: "Analyze and craft my resume"
      const submitBtn = page.getByRole('button', {
        name: /Analyze and craft my resume/i,
      });
      await expect(submitBtn).toBeEnabled({ timeout: 2_000 });
      await submitBtn.click();

      // Wait for loading state (button text changes to "Connecting...")
      await expect(
        page.getByRole('button', { name: /Connecting/i }),
      )
        .toBeVisible({ timeout: 5_000 })
        .catch(() => {
          // eslint-disable-next-line no-console
          console.log('[test] Did not see "Connecting..." loading state — form may have transitioned quickly');
        });

      // If an error banner appears, fail early with a useful message
      const errorBanner = page.locator('[role="alert"]').first();
      const hasError = await errorBanner.isVisible().catch(() => false);
      if (hasError) {
        const errorText = await errorBanner.textContent().catch(() => '');
        throw new Error(`Intake form error: ${errorText}`);
      }
    });

    // Step 3: Wait for the V2 streaming display to appear
    // The intake form disappears when sessionId is set; the top bar with "Back" appears
    await test.step('Wait for V2 streaming display to connect', async () => {
      // #v2-resume disappears when pipeline starts
      await expect(page.locator('#v2-resume')).not.toBeVisible({
        timeout: 30_000,
      });

      // The top bar "Back" button confirms we are on the streaming screen
      await expect(
        page.getByRole('button', { name: /Back/i }),
      ).toBeVisible({ timeout: 30_000 });

      // Wait for first stage output — the analysis stage banner appears
      // "What they're looking for" is the aria-label on the analysis section
      await expect(
        page.locator('section[aria-label="Analysis"]'),
      ).toBeVisible({ timeout: 90_000 }); // 90s for first LLM response
    });

    // Step 4: Wait for strategy phase to produce gap coaching cards (if any),
    // then respond to each one.
    // NOTE: The V2 pipeline streams continuously — gap coaching cards appear
    // mid-stream but the backend keeps writing. If the resume section appears
    // before we can interact with coaching cards, we skip the coaching flow.
    let pipelineStartMs = Date.now();
    await test.step('Handle gap coaching cards (if present)', async () => {
      pipelineStartMs = Date.now();

      // Poll for either: gap coaching cards OR the resume section appearing.
      // Gap coaching is optional — if all requirements are strong matches,
      // no cards appear and the pipeline continues straight to writing.
      const gapCoachingOrResume = page.locator(
        '[data-coaching-requirement], [data-testid="requirements-checklist"]',
      );

      // Wait up to 4 minutes for strategy phase to complete (includes analysis)
      await expect(gapCoachingOrResume.first()).toBeVisible({
        timeout: 4 * 60_000,
      });

      // Check if the resume section already appeared (pipeline moved past coaching)
      const resumeAlreadyVisible = await page
        .locator('[data-testid="requirements-checklist"]')
        .isVisible()
        .catch(() => false);

      if (resumeAlreadyVisible) {
        // eslint-disable-next-line no-console
        console.log('[test] Resume section already visible — pipeline streamed past gap coaching');
        return;
      }

      // Check if gap coaching cards actually appeared
      const coachingCards = page.locator('[data-coaching-requirement]');
      const cardCount = await coachingCards.count();

      if (cardCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`[test] Found ${cardCount} gap coaching card(s) — approving all`);

        // Click approve on each unapproved card.
        // New UnifiedGapAnalysisCard uses expandable rows — expand first, then click approve.
        // Cards that are already responded show a collapsed state (no expand needed).
        for (let i = 0; i < cardCount; i++) {
          const card = coachingCards.nth(i);
          // Expand the row by clicking the chevron header button
          const expandBtn = card.locator('button[aria-expanded]').first();
          const expandVisible = await expandBtn.isVisible().catch(() => false);
          if (expandVisible) {
            const isExpanded = await expandBtn.getAttribute('aria-expanded');
            if (isExpanded === 'false') {
              await expandBtn.click();
              await page.waitForTimeout(200);
            }
          }
          // Click "Apply to Resume" or "Apply Safe Language" (replaces old "Use this strategy")
          const approveBtn = card.getByRole('button', { name: /Apply to Resume|Apply Safe Language/i });
          const approveVisible = await approveBtn.isVisible().catch(() => false);
          if (approveVisible) {
            await approveBtn.click();
            // Brief pause for React state to settle before moving to next card
            await page.waitForTimeout(300);
          }
        }

        // After all cards are responded, the "Continue — Start Writing" button enables.
        // Use DOM click as a fallback since the button may be below the viewport.
        const continueBtn = page.getByRole('button', {
          name: /Continue.*Start Writing/i,
        });

        // The continue button might not appear if the pipeline already completed
        const continueBtnVisible = await continueBtn
          .isVisible({ timeout: 5_000 })
          .catch(() => false);

        if (continueBtnVisible) {
          await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
          await continueBtn.click();
          // eslint-disable-next-line no-console
          console.log('[test] Clicked "Continue — Start Writing" — pipeline re-running');
        } else {
          // Try DOM-level click as fallback (button may be offscreen)
          const clicked = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(
              (b) => /Continue.*Start Writing/i.test(b.textContent ?? ''),
            );
            if (btn && !btn.disabled) {
              (btn as HTMLElement).click();
              return true;
            }
            return false;
          });

          if (clicked) {
            // eslint-disable-next-line no-console
            console.log('[test] Clicked "Continue — Start Writing" via DOM — pipeline re-running');
          } else {
            // eslint-disable-next-line no-console
            console.log('[test] Continue button not found/enabled — pipeline may have already completed');
          }
        }

        // After continuing (or if pipeline already moved on), wait for resume section
        await expect(
          page.locator('[data-testid="requirements-checklist"]'),
        ).toBeVisible({ timeout: 3 * 60_000 });
      } else {
        // eslint-disable-next-line no-console
        console.log('[test] No gap coaching cards — pipeline continuing to resume writing');
      }
    });

    // Step 5: Wait for pipeline completion
    // The completion status reads "Your resume is ready"
    await test.step('Wait for pipeline completion', async () => {
      await expect(
        page.getByText(/Your resume is ready/i),
      ).toBeVisible({ timeout: 5 * 60_000 }); // 5 min max for writing + assembly

      const pipelineDurationMs = Date.now() - pipelineStartMs;
      const pipelineMinutes = pipelineDurationMs / 60_000;
      // eslint-disable-next-line no-console
      console.log(`[test] Pipeline completed in ${pipelineMinutes.toFixed(1)} minutes`);

      // Groq pipelines should complete within 5 minutes typically.
      // This assertion catches severe performance regressions.
      expect(pipelineDurationMs).toBeLessThan(7 * 60_000); // 7 min max (includes gap coaching re-run)
    });

    // Step 6: Verify ExportBar is visible and download PDF
    await test.step('Download PDF resume', async () => {
      // Scroll to the bottom of the streaming display to bring ExportBar into view
      await page.evaluate(() => {
        const container = document.querySelector('.flex-1.overflow-y-auto');
        if (container) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
      });
      await page.waitForTimeout(500);

      const downloadPromise = page.waitForEvent('download', {
        timeout: 30_000,
      });

      // Use DOM click to ensure we hit the button regardless of scroll position
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const pdfBtn = buttons.find(
          (b) =>
            /Download PDF/i.test(b.getAttribute('aria-label') ?? '') ||
            /Download PDF/i.test(b.textContent?.trim() ?? ''),
        );
        if (pdfBtn) {
          (pdfBtn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        // Fallback: try force click via Playwright
        await page
          .getByRole('button', { name: /Download PDF/i })
          .click({ force: true });
      }

      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
      await download.saveAs('test-results/downloaded-resume.pdf');

      const filePath = await download.path();
      expect(filePath).toBeTruthy();

      // eslint-disable-next-line no-console
      console.log(`[test] PDF downloaded: ${download.suggestedFilename()}`);
    });
  });
});
