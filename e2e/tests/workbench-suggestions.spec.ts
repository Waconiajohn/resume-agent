import { test, expect } from '@playwright/test';
import { navigateToWorkbench } from '../helpers/navigate-to-workbench';
import {
  workbenchSSEEvents,
  makeSuggestions,
  MOCK_REVIEW_TOKEN,
} from '../fixtures/test-data';

test.describe('Workbench Suggestions', () => {
  test('renders first suggestion card with question, intent label, counter, and buttons', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    // Question text from first suggestion
    await expect(page.getByText(/AWS cloud architecture experience/)).toBeVisible();
    // Intent label
    await expect(page.getByText('Requirement Gap')).toBeVisible();
    // Counter: "1 of 3"
    await expect(page.getByText('1 of 3')).toBeVisible();
    // Apply + Skip buttons
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  });

  test('high-priority address_requirement suggestion has blue left border', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    // The suggestion card is a div with border-l-[#98b3ff] class for high+address_requirement
    // Find it by the CSS class directly since it's the card wrapper with the suggestion text inside
    const card = page.locator('.border-l-\\[\\#98b3ff\\]');
    await expect(card).toBeVisible();
    // Verify it contains the suggestion text
    await expect(card.getByText(/AWS cloud architecture experience/)).toBeVisible();
  });

  test('Apply sends __suggestion__: prefix in feedback', async ({ page }) => {
    const { captured } = await navigateToWorkbench(page, workbenchSSEEvents());

    await page.getByRole('button', { name: 'Apply' }).click();

    // Wait for the POST to /api/pipeline/respond
    await page.waitForTimeout(500);

    const respondReq = captured.find(
      (r) => r.url.includes('/pipeline/respond'),
    );
    expect(respondReq).toBeTruthy();
    const body = respondReq!.body as {
      gate: string;
      response: { feedback: string };
    };
    expect(body.response.feedback).toMatch(/^__suggestion__:gap_cloud_arch$/);
  });

  test('Apply advances to next suggestion', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    // First suggestion visible
    await expect(page.getByText(/AWS cloud architecture/)).toBeVisible();

    // Click Apply
    await page.getByRole('button', { name: 'Apply' }).click();

    // Wait for slide animation
    await page.waitForTimeout(300);

    // Second suggestion becomes visible (keyword integration)
    await expect(page.getByText(/Kubernetes.*missing/)).toBeVisible();
    // Counter updates: "1 of 2"
    await expect(page.getByText('1 of 2')).toBeVisible();
  });

  test('Apply all suggestions shows "All suggestions addressed"', async ({ page }) => {
    // Use only 2 suggestions for speed
    const suggestions = makeSuggestions().slice(0, 2);
    await navigateToWorkbench(page, workbenchSSEEvents({ suggestions }));

    // Apply first
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.waitForTimeout(300);

    // Apply second
    await page.getByRole('button', { name: /Add Kubernetes/i }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText('All suggestions addressed')).toBeVisible();
  });

  test('Skip low-priority suggestion advances immediately (no reason UI)', async ({ page }) => {
    // Put the medium-priority keyword suggestion first
    const suggestions = makeSuggestions();
    const reordered = [suggestions[1], suggestions[0], suggestions[2]];
    await navigateToWorkbench(page, workbenchSSEEvents({ suggestions: reordered }));

    // First suggestion is medium/integrate_keyword
    await expect(page.getByText(/Kubernetes.*missing/)).toBeVisible();

    // Click Skip
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.waitForTimeout(300);

    // No reason UI shown, advances to next suggestion
    await expect(page.getByText('Why are you skipping this?')).not.toBeVisible();
    await expect(page.getByText(/AWS cloud architecture/)).toBeVisible();
  });

  test('Skip high-priority gap shows reason UI', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    // First suggestion is high+address_requirement
    await page.getByRole('button', { name: 'Skip' }).click();

    // Reason UI appears
    await expect(page.getByText('Why are you skipping this?')).toBeVisible();
    await expect(page.getByText('Not applicable to my experience')).toBeVisible();
    await expect(page.getByText('Already addressed elsewhere')).toBeVisible();
    await expect(page.getByText('Not relevant to this role')).toBeVisible();
    await expect(page.getByPlaceholder(/type a reason/i)).toBeVisible();
  });

  test('preset skip reason dismisses and advances', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    // Skip first suggestion (high priority — shows reason UI)
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByText('Not applicable to my experience').click();
    await page.waitForTimeout(300);

    // Advances to second suggestion
    await expect(page.getByText(/Kubernetes.*missing/)).toBeVisible();
  });

  test('custom skip reason via Enter dismisses and advances', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    // Skip first suggestion
    await page.getByRole('button', { name: 'Skip' }).click();

    // Type custom reason and press Enter
    const input = page.getByPlaceholder(/type a reason/i);
    await input.fill('I cover this in the experience section');
    await input.press('Enter');
    await page.waitForTimeout(300);

    // Advances to second suggestion
    await expect(page.getByText(/Kubernetes.*missing/)).toBeVisible();
  });

  test('client-side keyword auto-resolution', async ({ page }) => {
    // First suggestion has resolved_when.type='keyword_present', target_id='AWS'
    await navigateToWorkbench(page, workbenchSSEEvents());

    // Verify first suggestion is the AWS one
    await expect(page.getByText(/AWS cloud architecture/)).toBeVisible();

    // Click a content line to enter edit mode
    const contentLines = page.locator('[data-panel-root] .cursor-text');
    await contentLines.first().click();

    // Type "AWS" into the textarea
    const textarea = page.locator('[data-panel-root] textarea');
    await textarea.fill('Senior AWS Cloud Architect with 10+ years driving enterprise-scale transformations');
    // Blur to commit the edit
    await textarea.blur();

    // Wait for resolution check (400ms timer in WorkbenchSuggestions)
    await page.waitForTimeout(600);

    // The AWS suggestion should auto-resolve and the next one should appear
    await expect(page.getByText(/Kubernetes.*missing/)).toBeVisible({ timeout: 3_000 });
  });

  test('"Looks Good" button sends approve gate with review_token', async ({ page }) => {
    const { captured } = await navigateToWorkbench(page, workbenchSSEEvents());

    await page.getByRole('button', { name: /Looks Good/i }).click();
    await page.waitForTimeout(500);

    const respondReq = captured.find(
      (r) => r.url.includes('/pipeline/respond'),
    );
    expect(respondReq).toBeTruthy();
    const body = respondReq!.body as {
      response: { approved: boolean; review_token: string };
    };
    expect(body.response.approved).toBe(true);
    expect(body.response.review_token).toBe(MOCK_REVIEW_TOKEN);
  });

  test('direct edit shows "Save Edits" and "Discard" buttons', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    // Click a content line
    const contentLines = page.locator('[data-panel-root] .cursor-text');
    await contentLines.first().click();

    // Edit the text
    const textarea = page.locator('[data-panel-root] textarea');
    await textarea.fill('Edited content line');
    await textarea.blur();

    // "Save Edits" and "Discard" should be visible
    await expect(page.getByRole('button', { name: /Save Edits/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Discard/i })).toBeVisible();
    // "Looks Good" should be replaced
    await expect(page.getByRole('button', { name: /Looks Good/i })).not.toBeVisible();
  });
});
