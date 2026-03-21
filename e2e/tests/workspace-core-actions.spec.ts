import { expect, test } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('workspace core room actions', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('workspace home entry points open Career Profile and Job Search', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Career Profile backbone').first()).toBeVisible();

    await page.getByRole('button', { name: /Review Career Profile/i }).click();
    await expect(page).toHaveURL(/room=career-profile/);
    await expect(page.getByRole('heading', { name: /One shared profile that every agent reads/i })).toBeVisible();

    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Open Job Search/i }).click();
    await expect(page).toHaveURL(/room=jobs/);
    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
  });

  test('Career Profile refine flow opens the next-best questions', async ({ page }) => {
    await page.goto('/workspace?room=career-profile', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /One shared profile that every agent reads/i })).toBeVisible();
    await page.getByRole('button', { name: /Refine with AI/i }).click();

    await expect(page.getByRole('heading', { name: /One question, one confirmation, one stronger profile update/i })).toBeVisible();
    await expect(page.getByText(/What kind of leadership scope are you targeting next\?/i).first()).toBeVisible();

    await page.getByPlaceholder(/Answer in your own words/i).fill('Executive operations leadership with broad cross-functional scope and clear ownership of operating cadence.');
    await page.getByRole('button', { name: /Confirm and continue/i }).click();

    await expect(page.getByText(/What business outcome do you most want your next role to improve\?/i).first()).toBeVisible();
    await expect(page.getByText(/2\/2/)).toBeVisible();
  });

  test('Career Profile can submit the intake and return to the saved profile view', async ({ page }) => {
    await page.goto('/workspace?room=career-profile', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /One shared profile that every agent reads/i })).toBeVisible();
    await page.getByRole('button', { name: /Refine with AI/i }).click();

    await page.getByPlaceholder(/Answer in your own words/i).fill('Executive operations leadership across product, support, and delivery teams.');
    await page.getByRole('button', { name: /Confirm and continue/i }).click();

    await page.getByPlaceholder(/Answer in your own words/i).fill('Improve execution quality by aligning leaders around one operating cadence.');
    await page.getByRole('button', { name: /Confirm and build Career Profile/i }).click();

    await expect(page.getByRole('button', { name: /Reset Assessment State/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /One question, one confirmation, one stronger profile update/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /What the platform currently knows about you/i })).toBeVisible();
  });

  test('LinkedIn quick optimize completes and tab switching stays usable', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'LinkedIn', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Quick Optimize/i }).click();

    await expect(page.getByText(/Profile Quality: 87%/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Re-optimize/i })).toBeVisible();

    await page.getByRole('button', { name: 'Results', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Profile Score/i })).toBeVisible();

    await page.getByRole('button', { name: 'Content Plan', exact: true }).click();
    await expect(page.getByRole('button', { name: /Generate Calendar/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Something went wrong/i })).toHaveCount(0);
  });

  test('LinkedIn Post Composer writes and approves a post', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'LinkedIn', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Write a Post/i }).click();

    await expect(page.getByRole('heading', { name: /Choose a Topic/i })).toBeVisible();
    await page.getByRole('button', { name: /The operating cadence most leadership teams skip/i }).click();

    await expect(page.getByRole('heading', { name: /Post Draft/i })).toBeVisible();
    await expect(page.getByText(/The meetings were happening, but the business still was not moving/i)).toBeVisible();

    await page.getByRole('button', { name: /Approve Post/i }).click();

    await expect(page.getByRole('heading', { name: /Your Post is Ready/i })).toBeVisible();
    await expect(page.getByText(/Saved to Library/i)).toBeVisible();
  });

  test('LinkedIn Profile Editor advances through section review and completes', async ({ page }) => {
    await page.goto('/workspace?room=linkedin', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'LinkedIn', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: /Edit Profile/i }).click();

    await expect(page.getByRole('heading', { name: 'Headline', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Executive operator who builds operating cadence/i)).toBeVisible();

    await page.getByRole('button', { name: /^Approve$/i }).click();

    await expect(page.getByRole('heading', { name: /About Section/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Executive operator known for turning complexity into operating rhythm/i)).toBeVisible();

    await page.getByRole('button', { name: /^Approve$/i }).click();

    await expect(page.getByRole('heading', { name: /Profile Optimization Complete/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Headline', { exact: true })).toBeVisible();
    await expect(page.getByText('About Section', { exact: true })).toBeVisible();
  });

  test('Job Search runs Job Finder and keeps Discover and Today navigable', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Discover', exact: true }).click();

    await expect(page.getByRole('heading', { name: /Radar Search/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Smart Matches/i })).toBeVisible();

    await page.getByRole('button', { name: /Run Job Finder/i }).click();

    await expect(page.getByText('Northstar SaaS')).toBeVisible();
    await expect(page.getByText('ScaleCo')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Search Strings/i })).toBeVisible();

    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Daily Ops', exact: true })).toBeVisible();
    await expect(page.getByText('No scored matches yet. Run a Radar search to surface opportunities.')).toBeVisible();
  });

  test('Job Search smart match action routes into Resume Builder', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Discover', exact: true }).click();
    await page.getByRole('button', { name: /Run Job Finder/i }).click();

    await expect(page.getByText('Northstar SaaS')).toBeVisible();
    await page.getByRole('button', { name: /Resume \+ Letter/i }).first().click();

    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /One home for tailored resumes and your long-term base resume/i })).toBeVisible();
  });

  test('Job Search pipeline add-application dialog opens and submits cleanly', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await expect(page.getByRole('button', { name: /Add Application/i })).toBeVisible();

    await page.getByRole('button', { name: /Add Application/i }).click();
    await expect(page.getByRole('dialog', { name: /Add opportunity/i })).toBeVisible();

    await page.getByPlaceholder('e.g. VP Operations').fill('Director of Program Management');
    await page.getByPlaceholder('e.g. Acme Corp').fill('SignalWorks');
    await page.getByPlaceholder('https://...').fill('https://example.com/jobs/pm-director');
    await page.getByPlaceholder('Any notes about this role...').fill('Referral lead from former VP Product.');

    await page.getByRole('button', { name: /Add to Pipeline/i }).click();

    await expect(page.getByRole('dialog', { name: /Add opportunity/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Application Pipeline/i })).toBeVisible();
  });

  test('Job Search discover scoring feeds Today and promote sends a role into the pipeline', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Discover', exact: true }).click();

    await page.getByPlaceholder('Job title, keywords...').fill('VP Operations');
    await page.getByPlaceholder('Location or Remote').fill('Remote');
    await page.getByRole('button', { name: /^Search$/i }).click();

    await expect(page.getByText('Northstar SaaS')).toBeVisible();
    await expect(page.getByText('ScaleCo')).toBeVisible();

    await page.getByRole('button', { name: /Score Matches/i }).click();
    await expect(page.getByText('92%')).toBeVisible();

    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('span:visible', { hasText: 'Northstar SaaS' }).first()).toBeVisible();
    await expect(page.locator('button:visible', { hasText: 'Promote' })).toHaveCount(2);

    await page.locator('button:visible', { hasText: 'Promote' }).first().click();
    await expect(page.locator('button:visible', { hasText: 'Promote' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await expect(page.locator('div:visible', { hasText: 'Northstar SaaS' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /VP Operations Northstar SaaS/i })).toBeVisible();
  });

  test('Job Search watchlist manager opens, adds a company, and closes cleanly', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Discover', exact: true }).click();
    await page.locator('button[title="Manage watchlist"]:visible').first().click();

    await expect(page.getByRole('dialog', { name: /Manage watchlist/i })).toBeVisible();
    await page.getByPlaceholder('e.g. Acme Corp').fill('Atlas Systems');
    await page.getByPlaceholder('e.g. SaaS').fill('Enterprise Software');
    await page.getByPlaceholder(/^https:\/\/\.\.\.$/).fill('https://atlas.example.com');
    await page.getByPlaceholder(/^https:\/\/\.\.\.\/careers$/).fill('https://atlas.example.com/careers');
    await page.getByRole('button', { name: /Add Company/i }).click();

    await expect(
      page.getByRole('dialog', { name: /Manage watchlist/i }).getByText('Atlas Systems', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    await expect(page.getByRole('dialog', { name: /Manage watchlist/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Atlas Systems', exact: true })).toBeVisible();
  });

  test('Job Search watchlist manager updates priority and removes a company cleanly', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Discover', exact: true }).click();
    await page.locator('button[title="Manage watchlist"]:visible').first().click();
    await expect(page.getByRole('dialog', { name: /Manage watchlist/i })).toBeVisible();

    await page.getByPlaceholder('e.g. Acme Corp').fill('Northfield Systems');
    await page.getByRole('button', { name: /Add Company/i }).click();
    await expect(
      page.getByRole('dialog', { name: /Manage watchlist/i }).getByText('Northfield Systems', { exact: true }),
    ).toBeVisible();

    const watchlistRow = page
      .getByRole('dialog', { name: /Manage watchlist/i })
      .locator('div[class*="rounded-xl"]')
      .filter({ hasText: 'Northfield Systems' })
      .first();

    await watchlistRow.locator('button').nth(0).click();
    await watchlistRow.locator('input[type="number"]').fill('5');
    await watchlistRow.locator('button').nth(0).click();

    await expect(watchlistRow.getByText('P5', { exact: true })).toBeVisible();

    await watchlistRow.locator('button').last().click();

    await expect(
      page.getByRole('dialog', { name: /Manage watchlist/i }).getByText('Northfield Systems', { exact: true }),
    ).toHaveCount(0);
  });

  test('Interview Prep section switching keeps practice, documents, and follow-up actions reachable', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await expect(page.getByRole('button', { name: /Start Mock Interview/i })).toBeVisible();

    await page.getByRole('button', { name: 'Leave-behinds', exact: true }).click();
    await expect(page.getByRole('button', { name: /Open 30-60-90 Day Plan/i })).toBeVisible();

    await page.getByRole('button', { name: 'Follow-up', exact: true }).click();

    await expect(
      page.getByText(/Handle thank-you notes, offer-stage negotiation prep, and post-interview follow-through in one place/i),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Thank You Note/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Negotiation Prep/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /Open Thank You Note/i }).first().click();
    await expect(page.getByRole('heading', { name: /Thank You Note Writer/i })).toBeVisible();

    await page.getByRole('button', { name: 'Negotiation Prep', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Build one clear compensation strategy before you respond/i })).toBeVisible();
  });

  test('Interview Prep follow-up section adds interview history and saves a debrief', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Follow-up', exact: true }).click();

    await expect(page.getByRole('heading', { name: /Interview History/i })).toBeVisible();
    await page.getByRole('button', { name: /Add Interview/i }).click();
    await page.getByPlaceholder('Company').fill('BrightPath Schools');
    await page.getByPlaceholder('Role').fill('School Principal');
    await page.getByPlaceholder(/Notes \(optional\)/i).fill('Panel focused on leadership philosophy and staff development.');
    await page.getByRole('button', { name: /^Save$/i }).click();

    await expect(page.getByText('BrightPath Schools', { exact: true })).toBeVisible();
    await expect(page.getByText(/School Principal/i)).toBeVisible();

    await page.getByRole('button', { name: /Add Debrief/i }).click();
    await expect(page.getByRole('heading', { name: /Post-Interview Debrief/i })).toBeVisible();

    await page.getByPlaceholder('Company name').fill('BrightPath Schools');
    await page.getByPlaceholder(/VP of Supply Chain/i).fill('School Principal');
    await page.getByRole('button', { name: 'Positive', exact: true }).click();
    await page.getByRole('button', { name: /Save Debrief/i }).click();

    await expect(page.getByText(/Debrief saved\./i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Back to Interview Prep/i }).click();

    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Follow-up', exact: true }).click();
    await expect(page.getByRole('button', { name: /Add Debrief/i })).toContainText('1');
  });

  test('Interview Prep history outcome buttons update the saved interview state', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Follow-up', exact: true }).click();
    await page.getByRole('button', { name: /Add Interview/i }).click();

    await page.getByPlaceholder('Company').fill('Summit Health');
    await page.getByPlaceholder('Role').fill('Operations Director');
    await page.getByRole('button', { name: /^Save$/i }).click();

    await expect(page.getByText('Summit Health', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Advanced', exact: true })).toHaveClass(/font-medium/);

    await page.getByRole('button', { name: 'Not Selected', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Not Selected', exact: true })).toHaveClass(/font-medium/);
  });

  test('Job Search Today tracker analyzes applications and returns a report', async ({ page }) => {
    await page.goto('/workspace?room=jobs', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Today', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Application Tracker', exact: true })).toBeVisible();
    await page
      .getByPlaceholder(/Paste your resume text here/i)
      .fill('Executive operator with experience aligning product, support, and operations leaders around one operating cadence.');
    await page.getByLabel(/Application 1 company/i).fill('Northstar SaaS');
    await page.getByLabel(/Application 1 role/i).fill('VP Operations');
    await page
      .getByLabel(/Application 1 job description/i)
      .fill('Lead executive alignment, operating cadence, and cross-functional execution across product, support, and delivery leaders.');

    await page.getByRole('button', { name: /Analyze 1 Application/i }).click();

    await expect(page.getByRole('heading', { name: 'Tracker Report', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Northstar SaaS — strong fit/i)).toBeVisible();
    await expect(page.getByText(/2 apps · 1 follow-ups/i)).toBeVisible();

    await page.getByRole('button', { name: /New Analysis/i }).click();
    await expect(page.getByRole('heading', { name: 'Application Tracker', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tracker Report', exact: true })).toHaveCount(0);
  });

  test('Interview Prep generates a prep report from the prep section and returns to the lab', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Upcoming Interviews/i })).toBeVisible();

    await page.getByRole('button', { name: /Generate Interview Prep/i }).first().click();

    await expect(page.getByText(/Generating your interview prep report/i)).toBeVisible();
    await expect(page.getByText(/Lead with executive operating cadence and cross-functional alignment\./i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Back to Interview Prep/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate Interview Prep/i }).first()).toBeVisible();
  });

  test('Interview Prep mock interview starts, completes, and returns to the lab', async ({ page }) => {
    await page.goto('/workspace?room=interview', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('button', { name: /Start Mock Interview/i }).click();

    await expect(page.getByRole('heading', { name: 'Mock Interview', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Tell me about a time you had to align multiple leaders around one operating cadence\./i)).toBeVisible();

    await page
      .getByPlaceholder(/Type your answer here/i)
      .fill('I aligned product, support, and operations leaders around one weekly cadence and clarified ownership for each decision.');
    await page.getByRole('button', { name: /Submit Answer/i }).click();

    await expect(page.getByText(/Overall Score/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Strong foundation\. Add one metric and keep this as a core interview story\./i)).toBeVisible();

    await page.getByRole('button', { name: /Back to Interview Prep/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Start Mock Interview/i })).toBeVisible();
  });
});
