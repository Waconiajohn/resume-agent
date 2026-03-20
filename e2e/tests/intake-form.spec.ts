/**
 * Resume Builder intake form tests
 *
 * Covers the current direct session intake at `/resume-builder/session`.
 * All Supabase and backend calls are mocked.
 */

import { expect, test, type Page } from '@playwright/test';
import { REAL_JD_TEXT, REAL_RESUME_TEXT } from '../fixtures/real-resume-data';

const MOCK_SESSION_ID = 'intake-form-session-123';

async function mockAll(page: Page): Promise<{ pipelineStartBodies: unknown[] }> {
  const pipelineStartBodies: unknown[] = [];

  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    // @ts-expect-error test override
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      if (url.includes('/api/pipeline/') && url.includes('/stream')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('event: heartbeat\ndata: {}\n\n'));
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      if (url.includes('/sse')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      return originalFetch.apply(window, [input, init] as Parameters<typeof fetch>);
    };
  });

  await page.route('**/supabase.co/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'intake-user', email: 'jjschrup@yahoo.com' }),
      });
      return;
    }

    if (url.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'intake-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'intake-user', email: 'jjschrup@yahoo.com' },
        }),
      });
      return;
    }

    if (url.includes('/auth/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    if (url.includes('/rest/v1/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: method === 'GET' ? '[]' : JSON.stringify([]),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path === '/api/pipeline/start' && method === 'POST') {
      pipelineStartBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: MOCK_SESSION_ID, status: 'started' }),
      });
      return;
    }

    if (path.includes('/stream')) {
      await route.abort();
      return;
    }

    if (path === '/api/sessions' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
      return;
    }

    if (path.startsWith('/api/resumes') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resumes: [] }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  return { pipelineStartBodies };
}

async function openIntakeForm(page: Page): Promise<void> {
  await page.goto('/resume-builder/session');
  await expect(page.getByRole('heading', { name: /Position Your Resume/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#v2-resume')).toBeVisible();
  await expect(page.locator('#v2-jd')).toBeVisible();
}

test.describe('Resume Builder intake form', () => {
  test('renders the current two-field intake and upload actions', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    await expect(page.getByText(/Position yourself as the benchmark/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload resume file/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload job description file/i })).toBeVisible();
  });

  test('submit button stays disabled until both fields have enough content', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    const submit = page.getByRole('button', { name: /Analyze and craft my resume/i });
    await expect(submit).toBeDisabled();

    await page.locator('#v2-resume').fill('Too short');
    await page.locator('#v2-jd').fill('Still too short');
    await expect(submit).toBeDisabled();

    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await expect(submit).toBeEnabled();
  });

  test('whitespace-only resume text does not enable submit', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    await page.locator('#v2-resume').fill('      ');
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await expect(page.getByRole('button', { name: /Analyze and craft my resume/i })).toBeDisabled();
  });

  test('job description textarea accepts multi-line input', async ({ page }) => {
    await mockAll(page);
    await openIntakeForm(page);

    const jobDescription = page.locator('#v2-jd');
    await jobDescription.fill(REAL_JD_TEXT);
    await expect(jobDescription).toHaveValue(REAL_JD_TEXT);
  });

  test('submitting posts the current resume-v2 payload shape', async ({ page }) => {
    const { pipelineStartBodies } = await mockAll(page);
    await openIntakeForm(page);

    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await page.getByRole('button', { name: /Analyze and craft my resume/i }).click();

    await expect(page.locator('#v2-resume')).not.toBeVisible({ timeout: 10_000 });
    expect(pipelineStartBodies.length).toBeGreaterThan(0);

    const body = pipelineStartBodies[0] as Record<string, unknown>;
    expect(body.resume_text).toBe(REAL_RESUME_TEXT.trim());
    expect(body.job_description).toBe(REAL_JD_TEXT.trim());
    expect(body).not.toHaveProperty('company_name');
  });

  test('pipeline start errors are shown on the current intake form', async ({ page }) => {
    await mockAll(page);
    await page.unroute('**/api/**');
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();

      if (path === '/api/pipeline/start' && method === 'POST') {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        });
        return;
      }

      if (path === '/api/sessions' && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
        return;
      }

      if (path.startsWith('/api/resumes') && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await openIntakeForm(page);
    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await page.getByRole('button', { name: /Analyze and craft my resume/i }).click();

    await expect(page.locator('[role="alert"]')).toContainText(/Too many requests\. Please try again later\./i);
    await expect(page.locator('#v2-resume')).toBeVisible();
  });
});
