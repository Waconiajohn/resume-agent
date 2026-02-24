import type { Page } from '@playwright/test';
import type { SSEEvent } from '../fixtures/mock-sse';
import { interceptAllAPI } from './intercept-api';
import type { CapturedRequest } from './intercept-api';
import {
  SAMPLE_RESUME_TEXT,
  SAMPLE_JD_TEXT,
  SAMPLE_COMPANY,
} from '../fixtures/test-data';

/**
 * Shared setup: intercept all API + SSE routes, navigate to landing,
 * fill intake form, submit, and wait for the SectionWorkbench to render.
 *
 * Returns the captured requests array for assertions.
 */
export async function navigateToWorkbench(
  page: Page,
  sseEvents: SSEEvent[],
  options?: {
    workflowSummaryOverride?: Record<string, unknown>;
  },
) : Promise<{ captured: CapturedRequest[] }> {
  // Unified route handler for all /api/** — includes SSE (async: adds init script)
  const { captured } = await interceptAllAPI(page, sseEvents, options);

  // Navigate to /app — storageState handles auth (/ shows SalesPage)
  await page.goto('/app');

  // Wait for landing screen to load
  await page.getByRole('button', { name: /Start New Session/i }).waitFor({ timeout: 10_000 });

  // Click "Start New Session"
  await page.getByRole('button', { name: /Start New Session/i }).click();

  // Fill the intake form
  await page.locator('#resume-text').fill(SAMPLE_RESUME_TEXT);
  await page.locator('#job-description').fill(SAMPLE_JD_TEXT);
  await page.locator('#company-name').fill(SAMPLE_COMPANY);

  // Submit the form
  await page.getByRole('button', { name: /Start Resume Session/i }).click();

  // Wait for workbench to render (h2 with section title)
  await page.locator('h2').first().waitFor({ timeout: 15_000 });

  return { captured };
}
