import { expect, test } from '@playwright/test';

const SCENARIOS = [
  {
    slug: 'attention',
    path: '/__dev/resume-v2-visual?scenario=attention',
    readyText: 'Attention Lines',
    screenshot: 'resume-v2-visual-attention.png',
  },
  {
    slug: 'final-review',
    path: '/__dev/resume-v2-visual?scenario=final-review',
    readyText: 'Final Review',
    screenshot: 'resume-v2-visual-final-review.png',
  },
  {
    slug: 'ready',
    path: '/__dev/resume-v2-visual?scenario=ready',
    readyText: 'Ready State',
    screenshot: 'resume-v2-visual-ready.png',
  },
] as const;

test.describe('resume-v2 visual harness', () => {
  test.use({ viewport: { width: 1440, height: 1800 } });

  for (const scenario of SCENARIOS) {
    test(`captures ${scenario.slug} state`, async ({ page }, testInfo) => {
      await page.goto(scenario.path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('resume-v2-visual-harness')).toBeVisible();
      await expect(page.getByRole('heading', { name: scenario.readyText })).toBeVisible();
      await page.waitForTimeout(300);

      if (scenario.slug === 'final-review') {
        const startButton = page.getByRole('button', { name: /start editing|review structure first/i }).first();
        if (await startButton.isVisible().catch(() => false)) {
          await startButton.click();
        }
        await expect(page.getByText('Priority Fixes', { exact: true }).filter({ visible: true }).first()).toBeVisible();
        await page.getByRole('button', { name: /Performance metrics ownership is still too vague/i }).filter({ visible: true }).first().click();
        await expect(page.getByText('Resume line to edit', { exact: true }).filter({ visible: true }).first()).toBeVisible();
      }

      await page.screenshot({
        path: testInfo.outputPath(scenario.screenshot),
        fullPage: true,
      });
    });
  }
});
