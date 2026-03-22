import { test, expect, type Page } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

const AUDIT_PAGES = [
  {
    slug: 'workspace-home',
    path: '/workspace',
    readyRole: 'text',
    readyText: 'Career Profile backbone',
  },
  {
    slug: 'career-profile',
    path: '/workspace?room=career-profile',
    readyRole: 'heading',
    readyText: 'Build the story every room works from',
  },
  {
    slug: 'resume-builder',
    path: '/workspace?room=resume',
    readyRole: 'heading',
    readyText: 'Choose the resume tool you need right now',
  },
  {
    slug: 'linkedin-studio',
    path: '/workspace?room=linkedin',
    readyRole: 'heading',
    readyText: 'Build a stronger profile and publish with intent',
  },
  {
    slug: 'job-command-center',
    path: '/workspace?room=jobs',
    readyRole: 'heading',
    readyText: 'Run the search from one working surface',
  },
  {
    slug: 'interview-lab',
    path: '/workspace?room=interview',
    readyRole: 'heading',
    readyText: 'Prep, practice, and follow-up in one place',
  },
  {
    slug: 'tools',
    path: '/tools',
    readyRole: 'text',
    readyText: 'Career Profile backbone',
  },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
    ),
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 8);
}

test.describe('workspace responsive audit', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  for (const auditPage of AUDIT_PAGES) {
    test(`audit/${auditPage.slug}: renders without horizontal overflow`, async ({ page }, testInfo) => {
      await page.goto(auditPage.path, { waitUntil: 'domcontentloaded' });
      const readyLocator = (auditPage.slug === 'workspace-home' || auditPage.slug === 'tools') && testInfo.project.name === 'mock-mobile'
        ? page.getByText('Career Profile powers the rest of Workspace').first()
        : auditPage.readyRole === 'heading'
          ? page.getByRole('heading', { name: auditPage.readyText }).first()
          : page.getByText(auditPage.readyText).first();
      await expect(readyLocator).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${testInfo.project.name}-${auditPage.slug}.png`),
        fullPage: true,
      });
    });
  }
});
