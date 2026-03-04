/**
 * E2E tests for the ChatDrawer component.
 *
 * Sprint 20: Verify the floating icon-button ChatDrawer introduced in the
 * document-centric layout redesign. The drawer starts collapsed as a small
 * icon button (bottom-left) and expands to a fixed overlay when clicked.
 *
 * Uses mocked API/SSE (no real LLM calls) via the shared interceptAllAPI + navigateToWorkbench pattern.
 *
 * Runs under the 'chromium' project (fast, mocked, ~5s).
 */

import { test, expect } from '@playwright/test';
import { navigateToWorkbench } from '../helpers/navigate-to-workbench';
import { workbenchSSEEvents } from '../fixtures/test-data';
import {
  connectedEvent,
  sectionContextEvent,
  sectionDraftEvent,
} from '../fixtures/mock-sse';
import { MOCK_REVIEW_TOKEN } from '../fixtures/test-data';

/**
 * Minimal SSE events that load the workspace without triggering
 * message-based auto-expand (no stage_start before section events).
 * Connected event alone doesn't add to messages array.
 */
function minimalSSEEvents() {
  return [
    connectedEvent(),
    sectionContextEvent({
      section: 'summary',
      context_version: 1,
      suggestions: [],
      evidence: [],
      keywords: [],
      gap_mappings: [],
      blueprint_slice: { positioning_angle: 'Test' },
      section_order: ['summary'],
      sections_approved: [],
    }),
    sectionDraftEvent({
      section: 'summary',
      content: 'Test summary content for drawer test.',
      review_token: MOCK_REVIEW_TOKEN,
    }),
  ];
}

test.describe('ChatDrawer', () => {
  test('open button is visible and drawer starts collapsed', async ({ page }) => {
    await navigateToWorkbench(page, minimalSSEEvents());

    const openBtn = page.getByRole('button', { name: /open coach/i });
    await expect(openBtn).toBeVisible({ timeout: 5_000 });

    // Close button should not be visible when collapsed
    await expect(page.getByRole('button', { name: /close coach/i })).not.toBeVisible();
  });

  test('clicking open button expands, clicking close collapses', async ({ page }) => {
    await navigateToWorkbench(page, minimalSSEEvents());

    const openBtn = page.getByRole('button', { name: /open coach/i });
    await openBtn.click();

    // Close button appears when expanded
    const closeBtn = page.getByRole('button', { name: /close coach/i });
    await expect(closeBtn).toBeVisible({ timeout: 3_000 });

    // Collapse
    await closeBtn.click();
    await expect(openBtn).toBeVisible({ timeout: 3_000 });
  });

  test('chat input area is visible when drawer is expanded', async ({ page }) => {
    await navigateToWorkbench(page, minimalSSEEvents());

    const openBtn = page.getByRole('button', { name: /open coach/i });
    await openBtn.click();

    // Verify the textarea exists in the expanded body
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 5_000 });
  });

  test('open button includes status text in aria-label', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    const openBtn = page.getByRole('button', { name: /open coach/i });
    await expect(openBtn).toBeVisible({ timeout: 5_000 });

    // aria-label contains status like "Waiting for input", "Working", etc.
    await expect(openBtn).toHaveAttribute(
      'aria-label',
      /Open coach – (Waiting for input|Working|Idle|Connected)/,
    );
  });

  test('expanded header shows Coach label and status', async ({ page }) => {
    await navigateToWorkbench(page, minimalSSEEvents());

    const openBtn = page.getByRole('button', { name: /open coach/i });
    await openBtn.click();

    // Header contains "Coach" text
    await expect(page.locator('text=Coach').first()).toBeVisible({ timeout: 3_000 });
  });
});
