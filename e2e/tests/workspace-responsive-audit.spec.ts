import { test, expect, type Page } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

const AUDIT_PAGES = [
  {
    slug: 'workspace-home',
    path: '/workspace',
    readyRole: 'text',
    readyText: 'Your Applications',
  },
  {
    slug: 'career-profile',
    path: '/workspace?room=career-profile',
    readyRole: 'heading',
    readyText: 'Career Vault',
  },
  {
    slug: 'tailor-resume',
    path: '/workspace?room=resume',
    readyRole: 'heading',
    readyText: 'Tailor your resume to a job you actually want',
  },
  {
    slug: 'linkedin-studio',
    path: '/workspace?room=linkedin',
    readyRole: 'heading',
    readyText: 'Become discoverable on LinkedIn',
  },
  {
    slug: 'job-command-center',
    path: '/workspace?room=jobs',
    readyRole: 'heading',
    readyText: 'Find the right jobs before you tailor.',
  },
  {
    slug: 'applications-list',
    path: '/workspace/applications',
    readyRole: 'heading',
    readyText: 'Job applications',
  },
  {
    slug: 'application-workspace',
    path: '/workspace/application/job-techcorp/overview',
    readyRole: 'text',
    readyText: 'TechCorp',
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
    readyText: 'Your Applications',
  },
  {
    slug: 'settings',
    path: '/settings',
    readyRole: 'heading',
    readyText: 'Settings',
  },
  {
    slug: 'billing',
    path: '/billing',
    readyRole: 'heading',
    readyText: 'Billing',
  },
  {
    slug: 'affiliate',
    path: '/affiliate',
    readyRole: 'heading',
    readyText: 'Affiliate Dashboard',
  },
  {
    slug: 'admin-gate',
    path: '/admin',
    readyRole: 'heading',
    readyText: 'Admin Dashboard',
  },
  {
    slug: 'terms',
    path: '/terms',
    readyRole: 'heading',
    readyText: 'Terms of Service',
  },
  {
    slug: 'privacy',
    path: '/privacy',
    readyRole: 'heading',
    readyText: 'Privacy Policy',
  },
  {
    slug: 'contact',
    path: '/contact',
    readyRole: 'heading',
    readyText: 'Get in touch',
  },
] as const;

const PUBLIC_AUDIT_PAGES = [
  {
    slug: 'sales',
    path: '/sales',
    readyRole: 'heading',
    readyText: 'CareerIQ job search workspace',
  },
  {
    slug: 'auth-signup',
    path: '/workspace?auth=signup',
    readyRole: 'text',
    readyText: 'Create Account',
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
        ? page.getByText('Career Vault powers your job search').first()
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

test.describe('public responsive audit', () => {
  for (const auditPage of PUBLIC_AUDIT_PAGES) {
    test(`audit/${auditPage.slug}: renders without horizontal overflow`, async ({ page }, testInfo) => {
      await page.addInitScript(() => {
        window.localStorage.setItem('e2e_disable_mock_auth', 'true');
        window.sessionStorage.setItem('e2e_disable_mock_auth', 'true');
      });
      await page.goto(auditPage.path, { waitUntil: 'domcontentloaded' });
      const readyLocator = auditPage.readyRole === 'heading'
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
