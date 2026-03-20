import { expect, test } from '@playwright/test';
import { mockWorkspaceApp } from '../helpers/mock-workspace-app';

test.describe('AI Coach drawer', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspaceApp(page);
  });

  test('opens from Workspace and closes cleanly', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });

    const openButton = page.getByRole('button', { name: /Open AI Coach/i });
    await expect(openButton).toBeVisible({ timeout: 10_000 });

    await openButton.click();

    await expect(page.getByText(/AI (E2E|Coach)/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/Ask your coach/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Close coach/i }).click();

    await expect(page.getByRole('button', { name: /Open AI Coach/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/Ask your coach/i)).toHaveCount(0);
  });

  test('mode toggle switches the drawer between guided and chat', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Open AI Coach/i }).click();
    await expect(page.getByTitle(/Switch to Chat mode/i)).toBeVisible({ timeout: 10_000 });

    await page.getByTitle(/Switch to Chat mode/i).click();
    await expect(page.getByTitle(/Switch to Guided mode/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Chat', { exact: true }).last()).toBeVisible({ timeout: 10_000 });
  });

  test('sending a coach message returns a response without crashing', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Open AI Coach/i }).click();
    await expect(page.getByPlaceholder(/Ask your coach/i)).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/Ask your coach/i).fill('resume proof');
    await page.getByRole('button', { name: /Send message/i }).click();

    await expect(page.getByText('resume proof', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/tighten one concrete proof point/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
  });
});
