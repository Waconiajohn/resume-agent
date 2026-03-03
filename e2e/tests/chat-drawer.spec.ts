/**
 * E2E tests for the ChatDrawer component.
 *
 * Sprint 17: Verify the collapsible bottom ChatDrawer introduced in commit 6f5c5bd.
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
  test('drawer toggle bar is visible and starts collapsed', async ({ page }) => {
    await navigateToWorkbench(page, minimalSSEEvents());

    const toggle = page.locator('button[aria-expanded]');
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // Should contain "Coach" label text
    await expect(toggle).toContainText('Coach');

    // Should start collapsed (SSE events arrive synchronously before mount,
    // so prevMessagesLenRef already matches — no auto-expand)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking toggle expands and collapses the drawer', async ({ page }) => {
    await navigateToWorkbench(page, minimalSSEEvents());

    const toggle = page.locator('button[aria-expanded]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Expand
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Collapse
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('chat input area is visible when drawer is expanded', async ({ page }) => {
    await navigateToWorkbench(page, minimalSSEEvents());

    const toggle = page.locator('button[aria-expanded]');

    // Expand drawer
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // When a section_draft gate is active, the textarea shows "Use the panel above
    // to continue" (disabled). Verify the textarea element exists in the expanded body.
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 5_000 });
  });

  test('toggle bar displays status text', async ({ page }) => {
    await navigateToWorkbench(page, workbenchSSEEvents());

    const toggle = page.locator('button[aria-expanded]');
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // The toggle bar should show a status label inside (Waiting for input, Working, etc.)
    // With a section_draft pending gate, status should be "Waiting for input"
    await expect(toggle).toContainText(/Waiting for input|Working|Idle|Connected/);
  });

  test('toggle bar shows chevron icon', async ({ page }) => {
    await navigateToWorkbench(page, minimalSSEEvents());

    const toggle = page.locator('button[aria-expanded]');
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // ChevronUp SVG should be present in the toggle bar
    const chevron = toggle.locator('svg').last();
    await expect(chevron).toBeVisible();
  });
});
