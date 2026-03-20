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
    readyText: 'One shared profile that every agent reads',
  },
  {
    slug: 'resume-builder',
    path: '/workspace?room=resume',
    readyRole: 'heading',
    readyText: 'One home for stage-aware job workspaces and your master resume',
  },
  {
    slug: 'linkedin-studio',
    path: '/workspace?room=linkedin',
    readyRole: 'heading',
    readyText: 'LinkedIn',
  },
  {
    slug: 'job-command-center',
    path: '/workspace?room=jobs',
    readyRole: 'heading',
    readyText: 'Job Search',
  },
  {
    slug: 'interview-lab',
    path: '/workspace?room=interview',
    readyRole: 'heading',
    readyText: 'Interview Prep',
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
