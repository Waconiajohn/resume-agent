import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

const baseUrl = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:4175';
const outputDir = resolve(process.cwd(), 'test-results', 'release-audit');

async function capture(page: import('playwright').Page, fileName: string) {
  const path = resolve(outputDir, fileName);
  await page.screenshot({ path, fullPage: true });
  console.log(path);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
    await mockWorkspaceApp(page);

    await page.goto(`${baseUrl}/workspace`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Your Applications').first().waitFor();
    await capture(page, 'workspace-home.png');

    await page.goto(`${baseUrl}/workspace?room=career-profile`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Career Vault', exact: true }).waitFor();
    await capture(page, 'career-profile.png');

    await page.goto(`${baseUrl}/workspace?room=resume`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Choose the resume tool you need right now/i }).waitFor();
    await capture(page, 'resume-room.png');

    await page.goto(`${baseUrl}/workspace?room=linkedin`, { waitUntil: 'domcontentloaded' });
    await page.getByText('LinkedIn workflow').first().waitFor();
    await capture(page, 'linkedin-room.png');

    await page.goto(`${baseUrl}/workspace?room=jobs`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Find your next role two ways/i }).waitFor();
    await page.getByPlaceholder('Job title, keywords...').fill('VP Operations');
    await page.getByPlaceholder('Location or Remote').fill('Remote');
    await page.getByRole('button', { name: /^Search$/i }).click();
    await page.getByText('Northstar SaaS', { exact: true }).waitFor();
    await capture(page, 'job-board.png');

    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await page.getByRole('button', { name: /Open Shortlist/i }).first().click();
    await page.getByRole('heading', { name: /Application Pipeline/i }).waitFor();
    await capture(page, 'job-pipeline.png');

    await page.goto(`${baseUrl}/workspace?room=networking`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Smart Referrals', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Matches', exact: true }).click();
    await page.getByRole('heading', { name: 'Network Matches', exact: true }).waitFor();
    await capture(page, 'smart-referrals-network.png');

    await page.getByRole('button', {
      name: /Second visible path.*Chase strong referral bonuses separately/i,
    }).click();
    await page.getByText('Bonus path', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Referral Bonus', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Referral Bonus', exact: true }).click();
    await page.getByText(/No Referral Bonus Opportunities Yet/i).waitFor();
    await capture(page, 'smart-referrals-bonus.png');

    await page.goto(`${baseUrl}/workspace?room=interview`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Interview workflow').first().waitFor();
    await page.getByRole('button', { name: /Step 4 Follow-up/i }).click();
    await page.getByRole('heading', { name: /Interview History/i }).waitFor();
    await capture(page, 'interview-room.png');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
