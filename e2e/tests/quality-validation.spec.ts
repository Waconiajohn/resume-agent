/**
 * Quality Validation E2E Tests — Story 9
 *
 * Runs 3 full pipelines with different resume/JD fixtures, captures quality
 * scores and section content, and asserts against minimum thresholds.
 * Results are saved to test-results/quality-validation/ for manual review.
 */
import { test, expect } from '@playwright/test';
import {
  REAL_RESUME_TEXT,
  REAL_JD_TEXT,
  REAL_COMPANY_NAME,
} from '../fixtures/real-resume-data';
import { QUALITY_FIXTURES } from '../fixtures/quality-validation-data';
import { runPipelineToCompletion } from '../helpers/pipeline-responder';
import {
  createCaptureData,
  type PipelineCaptureData,
} from '../helpers/pipeline-capture';
import { cleanupBeforeTest } from '../helpers/cleanup';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Combine the original fixture with the two new ones
const ALL_FIXTURES = [
  {
    label: 'cloud-director-to-architect',
    resumeText: REAL_RESUME_TEXT,
    jdText: REAL_JD_TEXT,
    companyName: REAL_COMPANY_NAME,
  },
  ...QUALITY_FIXTURES,
];

// Minimum acceptable scores — generous thresholds for validation, not regression
const PRIMARY_THRESHOLD = 60;
const SECONDARY_THRESHOLD = 50;

const results: Array<{
  label: string;
  capture: PipelineCaptureData;
  durationMs: number;
}> = [];

test.describe.serial('Quality Validation', () => {
  for (const fixture of ALL_FIXTURES) {
    test(`pipeline quality: ${fixture.label}`, async ({ page }) => {
      // Clean up stale state before each pipeline run
      await cleanupBeforeTest();

      // Capture browser console for debugging
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          const text = msg.text();
          if (text.includes('Failed to load resource')) return;
          // eslint-disable-next-line no-console
          console.log(`[browser] [${msg.type()}] ${text}`);
        }
      });

      // Capture failed network requests
      page.on('response', (response) => {
        if (response.status() >= 400) {
          const url = response.url();
          if (url.includes('/api/workflow/') && url.includes('/node/')) return;
          // eslint-disable-next-line no-console
          console.log(`[network] ${response.status()} ${url}`);
        }
      });

      // Navigate to app
      await page.goto('/app');
      await expect(
        page.getByRole('button', { name: /Start New Session/i }),
      ).toBeVisible({ timeout: 15_000 });

      // Start new session
      await page.getByRole('button', { name: /Start New Session/i }).click();
      await expect(page.locator('#resume-text')).toBeVisible({
        timeout: 5_000,
      });

      // Fill intake form with fixture data
      await page.locator('#resume-text').fill(fixture.resumeText);
      await page.locator('#job-description').fill(fixture.jdText);
      await page.locator('#company-name').fill(fixture.companyName);

      const submitBtn = page.getByRole('button', {
        name: /Start Resume Session/i,
      });
      await expect(submitBtn).toBeEnabled({ timeout: 2_000 });
      await submitBtn.click();

      // Wait for loading state
      await expect(
        page.getByRole('button', { name: /Starting session/i }),
      )
        .toBeVisible({ timeout: 5_000 })
        .catch(() => {});

      // Fail early on error banner
      const errorBanner = page.locator(
        '.text-red-100\\/90, [role="alert"]',
      );
      const hasError = await errorBanner.isVisible().catch(() => false);
      if (hasError) {
        const errorText = await errorBanner.textContent();
        throw new Error(`Intake form error: ${errorText}`);
      }

      // Wait for pipeline to connect
      await expect(page.locator('#resume-text')).not.toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.locator('button[aria-expanded]'),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Step \d+ of 7/).first()).toBeVisible({
        timeout: 60_000,
      });

      // Run pipeline with capture
      const capture = createCaptureData();
      const pipelineStart = Date.now();
      await runPipelineToCompletion(page, capture);
      const durationMs = Date.now() - pipelineStart;

      // Store results for summary test
      results.push({ label: fixture.label, capture, durationMs });

      // Verify completion
      await expect(page.getByText('Session Complete')).toBeVisible({
        timeout: 10_000,
      });

      // Assert pipeline timing
      const pipelineMinutes = durationMs / 60_000;
      // eslint-disable-next-line no-console
      console.log(
        `[quality] ${fixture.label}: completed in ${pipelineMinutes.toFixed(1)} min`,
      );
      expect(durationMs).toBeLessThan(5 * 60_000);

      // Assert quality scores were captured
      expect(
        capture.qualityScores,
        `Quality scores should be captured for ${fixture.label}`,
      ).not.toBeNull();

      if (capture.qualityScores) {
        const { primary, secondary } = capture.qualityScores;

        // eslint-disable-next-line no-console
        console.log(
          `[quality] ${fixture.label} scores:`,
          JSON.stringify({ primary, secondary }),
        );

        // Primary scores (Hiring Mgr, ATS, Authenticity) >= threshold
        for (const [key, value] of Object.entries(primary)) {
          expect(
            value,
            `${fixture.label}: primary score "${key}" should be >= ${PRIMARY_THRESHOLD}%`,
          ).toBeGreaterThanOrEqual(PRIMARY_THRESHOLD);
        }

        // Secondary scores >= threshold
        for (const [key, value] of Object.entries(secondary)) {
          expect(
            value,
            `${fixture.label}: secondary score "${key}" should be >= ${SECONDARY_THRESHOLD}%`,
          ).toBeGreaterThanOrEqual(SECONDARY_THRESHOLD);
        }
      }

      // Assert sections were captured
      expect(
        capture.sections.length,
        `At least one section should be captured for ${fixture.label}`,
      ).toBeGreaterThan(0);

      // eslint-disable-next-line no-console
      console.log(
        `[quality] ${fixture.label}: captured ${capture.sections.length} sections: ` +
          capture.sections.map((s) => s.title).join(', '),
      );

      // Save captured data to test-results/quality-validation/
      const outDir = resolve(
        process.cwd(),
        'test-results',
        'quality-validation',
      );
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, `${fixture.label}.json`),
        JSON.stringify(
          {
            label: fixture.label,
            companyName: fixture.companyName,
            durationMs,
            durationMinutes: pipelineMinutes.toFixed(1),
            qualityScores: capture.qualityScores,
            sections: capture.sections,
          },
          null,
          2,
        ),
      );
    });
  }

  test('summary: all fixtures passed quality thresholds', async () => {
    // eslint-disable-next-line no-console
    console.log('\n[quality] ═══ Quality Validation Summary ═══');
    for (const r of results) {
      const s = r.capture.qualityScores;
      // eslint-disable-next-line no-console
      console.log(
        `[quality] ${r.label}: ` +
          `${(r.durationMs / 60_000).toFixed(1)} min | ` +
          `primary: ${s ? JSON.stringify(s.primary) : 'N/A'} | ` +
          `secondary: ${s ? JSON.stringify(s.secondary) : 'N/A'} | ` +
          `sections: ${r.capture.sections.length}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log('[quality] ═══════════════════════════════════\n');

    expect(
      results.length,
      'All fixtures should have completed',
    ).toBe(ALL_FIXTURES.length);
  });
});
