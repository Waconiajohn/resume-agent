import { test, expect } from '@playwright/test';
import {
  REAL_RESUME_TEXT,
  REAL_JD_TEXT,
  REAL_COMPANY_NAME,
} from '../fixtures/real-resume-data';
import { runPipelineToCompletion } from '../helpers/pipeline-responder';
import { cleanupBeforeTest } from '../helpers/cleanup';

test.describe('Full Pipeline E2E', () => {
  // Clean up stale state before the test: reset session usage, clear stuck pipelines
  test.beforeAll(async () => {
    await cleanupBeforeTest();
  });

  test('complete resume journey from intake to DOCX download', async ({
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
    // (suppress workflow artifact 500s — pre-existing noise from unapplied migration)
    page.on('response', (response) => {
      if (response.status() >= 400) {
        const url = response.url();
        // Skip workflow artifact endpoint 500s — table migration not applied
        if (url.includes('/api/workflow/') && url.includes('/node/')) return;
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

    // Step 1: Navigate to app (auth state already loaded via storageState)
    await test.step('Navigate to app', async () => {
      await page.goto('/app');
      await expect(
        page.getByRole('button', { name: /Start New Session/i }),
      ).toBeVisible({ timeout: 15_000 });
    });

    // Step 2: Start a new session
    await test.step('Click Start New Session', async () => {
      await page.getByRole('button', { name: /Start New Session/i }).click();
      await expect(page.locator('#resume-text')).toBeVisible({
        timeout: 5_000,
      });
    });

    // Step 3: Fill intake form with real resume and JD
    await test.step('Fill intake form and start session', async () => {
      await page.locator('#resume-text').fill(REAL_RESUME_TEXT);
      await page.locator('#job-description').fill(REAL_JD_TEXT);
      await page.locator('#company-name').fill(REAL_COMPANY_NAME);

      const submitBtn = page.getByRole('button', {
        name: /Start Resume Session/i,
      });
      await expect(submitBtn).toBeEnabled({ timeout: 2_000 });
      await submitBtn.click();

      // Wait for the button to enter loading state
      await expect(
        page.getByRole('button', { name: /Starting session/i }),
      )
        .toBeVisible({ timeout: 5_000 })
        .catch(() => {
          // eslint-disable-next-line no-console
          console.log(
            '[test] Did not see "Starting session..." loading state',
          );
        });

      // If an error banner appears, fail early with a useful message
      const errorBanner = page.locator(
        '.text-red-100\\/90, [role="alert"]',
      );
      const hasError = await errorBanner.isVisible().catch(() => false);
      if (hasError) {
        const errorText = await errorBanner.textContent();
        throw new Error(`Intake form error: ${errorText}`);
      }
    });

    // Step 4: Wait for the coach screen to appear
    await test.step('Wait for pipeline to connect', async () => {
      // Wait for the intake form to disappear (view switched to coach)
      await expect(page.locator('#resume-text')).not.toBeVisible({
        timeout: 60_000,
      });

      // Wait for the message input to confirm we're on the coach screen
      await expect(
        page.getByPlaceholder(/Type a message/i),
      ).toBeVisible({ timeout: 30_000 });

      // Wait for the workspace to show pipeline progress (visible even if panel root has zero height)
      await expect(page.getByText('Your Resume Progress')).toBeVisible({
        timeout: 5 * 60_000, // 5 min for first LLM response + workspace
      });
    });

    // Step 5: Run through all pipeline gates automatically
    await test.step('Complete all pipeline stages', async () => {
      await runPipelineToCompletion(page);
    });

    // Step 6: Verify completion panel
    await test.step('Verify completion panel', async () => {
      await expect(page.getByText('Session Complete')).toBeVisible({
        timeout: 10_000,
      });
    });

    // Step 7: Download DOCX resume
    await test.step('Download DOCX resume', async () => {
      const downloadPromise = page.waitForEvent('download', {
        timeout: 30_000,
      });
      await page
        .getByRole('button', { name: /Download Word/i })
        .click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/\.docx$/);
      await download.saveAs('test-results/downloaded-resume.docx');

      const filePath = await download.path();
      expect(filePath).toBeTruthy();
    });
  });
});
