/**
 * Resume V2 Quality Validation — live content audit
 *
 * Runs real resume-v2 sessions against multiple realistic resume/JD pairs,
 * captures the current queue/worklog/final-review outputs, and saves artifacts
 * for manual review under test-results/quality-validation/.
 *
 * This is intentionally a capture-first audit. The assertions focus on the
 * structure and trust of the current workflow rather than forcing brittle
 * score thresholds on variable LLM output.
 */
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  REAL_RESUME_TEXT,
  REAL_JD_TEXT,
  REAL_COMPANY_NAME,
} from '../fixtures/real-resume-data';
import { QUALITY_FIXTURES } from '../fixtures/quality-validation-data';
import { cleanupBeforeTest } from '../helpers/cleanup';

const ALL_FIXTURES = [
  {
    label: 'cloud-director-to-architect',
    resumeText: REAL_RESUME_TEXT,
    jdText: REAL_JD_TEXT,
    companyName: REAL_COMPANY_NAME,
  },
  ...QUALITY_FIXTURES,
];

const results: Array<{
  label: string;
  durationMs: number;
  queueText: string;
  worklogText: string;
  finalReviewText: string | null;
}> = [];

const PIPELINE_READY_TIMEOUT_MS = 10 * 60_000;
const PIPELINE_DURATION_TARGET_MS = 8 * 60_000;
const FINAL_REVIEW_READY_TIMEOUT_MS = 7 * 60_000;

function trimBlock(value: string | null | undefined, max = 3000): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function captureCardTextByHeading(page: import('@playwright/test').Page, headingText: string): Promise<string> {
  const heading = page.getByText(headingText, { exact: true }).first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  return trimBlock(await heading.evaluate((node) => {
    let current: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
    let bestText = node.parentElement?.textContent?.trim() ?? node.textContent ?? '';
    const maxReasonableCardLength = 2500;
    for (let i = 0; i < 8 && current; i += 1, current = current.parentElement) {
      const text = current.textContent?.trim() ?? '';
      if (!text.includes(node.textContent?.trim() ?? '')) {
        continue;
      }
      if (text.length > bestText.length && text.length <= maxReasonableCardLength) {
        bestText = text;
      }
    }
    return bestText;
  }));
}

async function captureOptionalCardTextByHeading(page: import('@playwright/test').Page, headingText: string): Promise<string | null> {
  const heading = page.getByText(headingText, { exact: true }).first();
  const visible = await heading.isVisible().catch(() => false);
  if (!visible) return null;
  return captureCardTextByHeading(page, headingText);
}

async function openResumeBuilder(page: import('@playwright/test').Page) {
  await page.goto('/workspace?room=resume');
  await expect(page.getByRole('heading', { name: /Choose the resume tool you need right now/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /New Tailored Resume/i }).first().click();
  await expect(page.locator('#v2-resume')).toBeVisible({ timeout: 15_000 });
}

async function submitResumeV2(page: import('@playwright/test').Page, fixture: { resumeText: string; jdText: string }) {
  await page.locator('#v2-resume').fill(fixture.resumeText);
  await page.locator('#v2-jd').fill(fixture.jdText);
  const submit = page.getByRole('button', { name: /Analyze and craft my resume/i });
  await expect(submit).toBeEnabled({ timeout: 5_000 });
  await submit.click();
  await expect(page.locator('#v2-resume')).not.toBeVisible({ timeout: 30_000 });
}

async function waitForResumeV2Completion(page: import('@playwright/test').Page) {
  await expect(page.getByText('What AI is doing right now')).toBeVisible({ timeout: PIPELINE_READY_TIMEOUT_MS });
  await expect(page.getByText('Requirements to Match')).toBeVisible({ timeout: PIPELINE_READY_TIMEOUT_MS });
  const runFinalReviewButton = page.getByRole('button', { name: /^Run Final Review$/i }).first();
  await runFinalReviewButton.waitFor({ state: 'attached', timeout: PIPELINE_READY_TIMEOUT_MS });
  await runFinalReviewButton.scrollIntoViewIfNeeded();
  await expect(runFinalReviewButton).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('Resume V2 Quality Validation', () => {
  for (const fixture of ALL_FIXTURES) {
    test(`quality capture: ${fixture.label}`, async ({ page }) => {
      page.on('pageerror', (error) => {
        // eslint-disable-next-line no-console
        console.log(`[pageerror][${fixture.label}] ${error.name}: ${error.message}`);
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          // eslint-disable-next-line no-console
          console.log(`[browser][${fixture.label}][${msg.type()}] ${msg.text()}`);
        }
      });

      await cleanupBeforeTest();
      await openResumeBuilder(page);

      const startedAt = Date.now();
      await submitResumeV2(page, fixture);
      await waitForResumeV2Completion(page);
      const durationMs = Date.now() - startedAt;

      const worklogText = await captureCardTextByHeading(page, 'What AI is doing right now');
      const queueText = await captureCardTextByHeading(page, 'Requirements to Match');

      const runFinalReviewButton = page.getByRole('button', { name: /^Run Final Review$/i }).first();
      await runFinalReviewButton.scrollIntoViewIfNeeded();
      await runFinalReviewButton.click();
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        return text.includes('6-Second Recruiter Scan') || text.includes('Review failed');
      }, { timeout: FINAL_REVIEW_READY_TIMEOUT_MS });
      const finalReviewError = page.getByText(/Review failed/i).first();
      if (await finalReviewError.isVisible().catch(() => false)) {
        throw new Error(`Final Review returned an error: ${await finalReviewError.textContent()}`);
      }
      await expect(page.getByText('6-Second Recruiter Scan')).toBeVisible({ timeout: 30_000 });
      const finalReviewText = await captureOptionalCardTextByHeading(page, '6-Second Recruiter Scan');

      const outDir = resolve(process.cwd(), 'test-results', 'quality-validation');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, `${fixture.label}.json`),
        JSON.stringify({
          label: fixture.label,
          companyName: fixture.companyName,
          durationMs,
          durationMinutes: Number((durationMs / 60_000).toFixed(2)),
          queueText,
          worklogText,
          finalReviewText,
        }, null, 2),
      );

      results.push({
        label: fixture.label,
        durationMs,
        queueText,
        worklogText,
        finalReviewText,
      });

      expect(durationMs, `${fixture.label}: pipeline should finish within 8 minutes`).toBeLessThan(PIPELINE_DURATION_TARGET_MS);
      expect(worklogText).toContain('What AI is doing right now');
      expect(queueText).toContain('Requirements to Match');
      expect(queueText.length, `${fixture.label}: queue capture should not be empty`).toBeGreaterThan(80);
      expect(finalReviewText, `${fixture.label}: final review should render`).not.toBeNull();
    });
  }

  test('summary: all live quality fixtures completed', async () => {
    const outDir = resolve(process.cwd(), 'test-results', 'quality-validation');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      resolve(outDir, 'summary.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        results: results.map((result) => ({
          label: result.label,
          durationMs: result.durationMs,
          durationMinutes: Number((result.durationMs / 60_000).toFixed(2)),
          queuePreview: result.queueText.slice(0, 500),
          worklogPreview: result.worklogText.slice(0, 500),
          finalReviewPreview: result.finalReviewText?.slice(0, 500) ?? null,
        })),
      }, null, 2),
    );

    expect(results.length, 'All quality fixtures should complete').toBe(ALL_FIXTURES.length);
  });
});
