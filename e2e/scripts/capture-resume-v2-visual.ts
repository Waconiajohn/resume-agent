import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:5173';
const outputDir = resolve(process.cwd(), 'test-results', 'resume-v2-visual');

const scenarios = [
  {
    slug: 'attention',
    path: '/__dev/resume-v2-visual?scenario=attention',
    screenshot: 'resume-v2-visual-attention.png',
  },
  {
    slug: 'action-state',
    path: '/__dev/resume-v2-visual?scenario=action-state',
    screenshot: 'resume-v2-visual-action-state.png',
    detailSelector: '[data-bullet-id="selected_accomplishments-1"]',
    detailScreenshot: 'resume-v2-visual-action-state-detail.png',
  },
  {
    slug: 'action-partial',
    path: '/__dev/resume-v2-visual?scenario=action-partial',
    screenshot: 'resume-v2-visual-action-partial.png',
    detailSelector: '[data-bullet-id="selected_accomplishments-0"]',
    detailScreenshot: 'resume-v2-visual-action-partial-detail.png',
  },
  {
    slug: 'action-benchmark',
    path: '/__dev/resume-v2-visual?scenario=action-benchmark',
    screenshot: 'resume-v2-visual-action-benchmark.png',
    detailSelector: '[data-bullet-id="selected_accomplishments-1"]',
    detailScreenshot: 'resume-v2-visual-action-benchmark-detail.png',
  },
  {
    slug: 'action-ai-draft',
    path: '/__dev/resume-v2-visual?scenario=action-ai-draft',
    screenshot: 'resume-v2-visual-action-ai-draft.png',
    detailSelector: '[data-bullet-id="selected_accomplishments-0"]',
    detailScreenshot: 'resume-v2-visual-action-ai-draft-detail.png',
  },
  {
    slug: 'final-review',
    path: '/__dev/resume-v2-visual?scenario=final-review',
    screenshot: 'resume-v2-visual-final-review.png',
    expandConcern: /Performance metrics ownership is still too vague/i,
  },
  {
    slug: 'ready',
    path: '/__dev/resume-v2-visual?scenario=ready',
    screenshot: 'resume-v2-visual-ready.png',
  },
] as const;

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });

    for (const scenario of scenarios) {
      await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('resume-v2-visual-harness').waitFor();
      await page.getByText('Score Snapshot', { exact: true }).waitFor();

      if (scenario.expandConcern) {
        await page.getByRole('button', { name: scenario.expandConcern }).click();
        await page.getByText('Resume line to edit').first().waitFor();
      }

      const screenshotPath = resolve(outputDir, scenario.screenshot);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`${scenario.slug}: ${screenshotPath}`);

      if ('detailSelector' in scenario && scenario.detailSelector && scenario.detailScreenshot) {
        const detailPath = resolve(outputDir, scenario.detailScreenshot);
        await page.locator(scenario.detailSelector).screenshot({ path: detailPath });
        console.log(`${scenario.slug}-detail: ${detailPath}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
