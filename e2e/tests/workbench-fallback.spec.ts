import { test, expect } from '@playwright/test';
import { navigateToWorkbench } from '../helpers/navigate-to-workbench';
import { workbenchSSEEvents } from '../fixtures/test-data';

test.describe('Workbench ActionChips fallback', () => {
  test('empty suggestions array renders ActionChips instead of suggestion card', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents({ suggestions: [] }));

    // ActionChips "Refine" label should be visible
    await expect(page.getByText('Refine')).toBeVisible();
    // Action chip buttons should exist (e.g. "Sharpen Opening" for summary section)
    await expect(page.getByRole('button', { name: /Sharpen Opening/i })).toBeVisible();
    // No suggestion card elements
    await expect(page.getByText('Requirement Gap')).not.toBeVisible();
    // Counter "N of N" should not be visible (use exact pattern for suggestion counter)
    await expect(page.getByText(/^\d+ of \d+$/)).not.toBeVisible();
  });

  test('omitted suggestions field renders ActionChips', async ({ page }) => {
    // Pass null to explicitly omit the suggestions field from the payload
    await navigateToWorkbench(page, workbenchSSEEvents({ suggestions: null }));

    // ActionChips should render
    await expect(page.getByText('Refine')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sharpen Opening/i })).toBeVisible();
  });
});
