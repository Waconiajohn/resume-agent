/**
 * Resume Builder persistence tests
 *
 * Verifies the current Job Workspaces and Master Resume tabs using mocked API
 * data. This replaces the retired dashboard/evidence-library assumptions.
 */

import { expect, test, type Page } from '@playwright/test';

const NOW = new Date().toISOString();
const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const MOCK_SESSIONS = [
  {
    id: 'session-complete-1',
    user_id: 'test-user',
    pipeline_status: 'complete',
    pipeline_stage: 'export',
    company_name: 'Acme Corp',
    job_title: 'Senior Engineer',
    created_at: TWO_HOURS_AGO,
    updated_at: ONE_HOUR_AGO,
    estimated_cost_usd: 0.23,
    product_type: 'resume',
  },
  {
    id: 'session-running-1',
    user_id: 'test-user',
    pipeline_status: 'running',
    pipeline_stage: 'section_writing',
    company_name: 'Beta Inc',
    job_title: 'Cloud Architect',
    created_at: ONE_HOUR_AGO,
    updated_at: NOW,
    estimated_cost_usd: null,
    product_type: 'resume',
  },
  {
    id: 'session-error-1',
    user_id: 'test-user',
    pipeline_status: 'error',
    pipeline_stage: 'gap_analysis',
    company_name: 'Gamma LLC',
    job_title: 'VP Engineering',
    created_at: TWO_HOURS_AGO,
    updated_at: TWO_HOURS_AGO,
    estimated_cost_usd: null,
    product_type: 'resume',
  },
] as const;

const MOCK_MASTER_RESUME = {
  id: 'master-resume-1',
  user_id: 'test-user',
  version: 2,
  is_default: true,
  created_at: TWO_HOURS_AGO,
  updated_at: ONE_HOUR_AGO,
  raw_text: 'John Smith\nSenior Software Engineer...',
  summary: 'Experienced engineering leader with 15 years building distributed systems.',
  experience: [],
  skills: { Engineering: ['TypeScript', 'Python', 'Kubernetes'] },
  education: [],
  certifications: [],
  evidence_items: [
    {
      id: 'ev-1',
      text: 'Led migration of monolithic architecture to microservices, reducing deploy time by 60%.',
      source: 'crafted' as const,
      created_at: NOW,
      section: 'experience',
      metrics: ['60% reduction'],
      source_session_id: 'session-complete-1',
    },
  ],
  contact_info: null,
};

async function mockAllWithData(
  page: Page,
  options?: {
    sessions?: typeof MOCK_SESSIONS;
    masterResume?: typeof MOCK_MASTER_RESUME | null;
    captureDeletes?: Array<string>;
  },
): Promise<void> {
  const sessions = options?.sessions ?? MOCK_SESSIONS;
  const masterResume = options?.masterResume === undefined ? MOCK_MASTER_RESUME : options.masterResume;
  const captureDeletes = options?.captureDeletes;

  await page.route('**/supabase.co/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-user', email: 'jjschrup@yahoo.com' }),
      });
      return;
    }

    if (url.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'test-user', email: 'jjschrup@yahoo.com' },
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
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === '/api/sessions' && method === 'GET') {
      const statusFilter = url.searchParams.get('status');
      const filtered = statusFilter
        ? sessions.filter((session) => session.pipeline_status === statusFilter)
        : sessions;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: filtered }),
      });
      return;
    }

    if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'DELETE') {
      const sessionId = path.split('/').pop() ?? '';
      captureDeletes?.push(sessionId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (path === '/api/resumes' && method === 'GET') {
      const list = masterResume
        ? [{
          id: masterResume.id,
          version: masterResume.version,
          is_default: masterResume.is_default,
          created_at: masterResume.created_at,
          updated_at: masterResume.updated_at,
        }]
        : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resumes: list }),
      });
      return;
    }

    if (path === '/api/resumes/default' && method === 'GET') {
      if (!masterResume) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not found' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resume: masterResume }),
      });
      return;
    }

    if (/\/api\/resumes\/[^/]+$/.test(path) && method === 'GET') {
      if (!masterResume) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not found' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resume: masterResume }),
      });
      return;
    }

    if (/\/api\/resumes\/[^/]+\/history$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          history: [
            {
              id: 'history-1',
              changes_summary: 'Updated summary and skills',
              created_at: ONE_HOUR_AGO,
            },
          ],
        }),
      });
      return;
    }

    if (/\/api\/resumes\/[^/]+$/.test(path) && (method === 'PATCH' || method === 'PUT')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resume: masterResume }),
      });
      return;
    }

    if (/\/api\/workflow\/[^/]+$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: null, nodes: [], latest_artifacts: [], replan: null }),
      });
      return;
    }

    if (path.startsWith('/api/pipeline/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ running: false, pending_gate: null }),
      });
      return;
    }

    if (path.startsWith('/api/resumes') && method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function openResumeBuilderWorkspace(page: Page): Promise<void> {
  await page.goto('/workspace?room=resume');
  await expect(
    page.getByRole('heading', { name: /One home for stage-aware job workspaces and your master resume/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('span').filter({ hasText: /^Job Workspaces$/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open Master Resume$/i })).toBeVisible();
}

async function waitForListSettled(page: Page): Promise<void> {
  await expect(page.locator('.animate-pulse')).not.toBeAttached({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

test.describe('Resume Builder persistence', () => {
  test('Job Workspaces renders all saved tailored resumes', async ({ page }) => {
    await mockAllWithData(page);
    await openResumeBuilderWorkspace(page);
    await waitForListSettled(page);

    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect(page.getByText('Beta Inc')).toBeVisible();
    await expect(page.getByText('Gamma LLC')).toBeVisible();
    await expect(page.getByRole('button', { name: /Delete .* session/i })).toHaveCount(MOCK_SESSIONS.length);
  });

  test('Completed filter narrows Job Workspaces to finished work', async ({ page }) => {
    await mockAllWithData(page);
    await openResumeBuilderWorkspace(page);
    await waitForListSettled(page);

    await page.getByRole('button', { name: /^Completed$/i }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect(page.getByText('Beta Inc')).not.toBeVisible();
    await expect(page.getByText('Gamma LLC')).not.toBeVisible();
  });

  test('Needs Review filter narrows Job Workspaces to recovery cases', async ({ page }) => {
    await mockAllWithData(page);
    await openResumeBuilderWorkspace(page);
    await waitForListSettled(page);

    await page.getByRole('button', { name: /^Needs Review$/i }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText('Gamma LLC')).toBeVisible();
    await expect(page.getByText('Acme Corp')).not.toBeVisible();
    await expect(page.getByText('Beta Inc')).not.toBeVisible();
  });

  test('deleting a saved resume workspace calls the current delete action', async ({ page }) => {
    const deletes: string[] = [];
    await mockAllWithData(page, { captureDeletes: deletes });
    await openResumeBuilderWorkspace(page);
    await waitForListSettled(page);

    await page.getByRole('button', { name: /Delete Acme Corp Senior Engineer session/i }).click();
    await page.waitForTimeout(300);

    expect(deletes).toContain('session-complete-1');
  });

  test('Master Resume tab loads the saved default resume summary', async ({ page }) => {
    await mockAllWithData(page);
    await openResumeBuilderWorkspace(page);

    await page.getByRole('button', { name: /^Open Master Resume$/i }).click();
    await waitForListSettled(page);

    await expect(page.getByText(/Experienced engineering leader with 15 years building distributed systems\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Updated 1h ago|Updated 60m ago|Updated 59m ago/i)).toBeVisible();
  });

  test('Master Resume tab shows the empty state when no default resume exists', async ({ page }) => {
    await mockAllWithData(page, { masterResume: null });
    await openResumeBuilderWorkspace(page);

    await page.getByRole('button', { name: /^Open Master Resume$/i }).click();
    await waitForListSettled(page);

    await expect(page.getByText(/No master resume found\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Complete a session and save your resume to get started\./i)).toBeVisible();
  });
});
