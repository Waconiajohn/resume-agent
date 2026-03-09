/**
 * Smoke navigation tests — verify every major page and Career IQ room
 * loads without crashing.
 *
 * All API calls (Supabase REST, backend /api/**) are mocked so these
 * tests do NOT depend on a running backend server.  They rely on the
 * Vite dev server only (http://localhost:5173).
 *
 * Project: chromium (uses storageState from auth setup).
 * Each test target: < 5 s.
 *
 * Naming convention:
 *   smoke/<page>: renders without crash
 *   smoke/nav: header link navigates correctly
 *   smoke/career-iq/<room>: room component mounts without crash
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// API + Supabase mock helpers
// ---------------------------------------------------------------------------

/**
 * Install route handlers that intercept every /api/** and Supabase request
 * so tests never hit a real backend.
 *
 * Call this BEFORE page.goto() so Playwright registers the handlers early.
 * The SSE endpoint is handled via an addInitScript fetch override
 * (matching the pattern in intercept-api.ts) so the coach screen never
 * tries to reconnect in an infinite loop.
 */
async function mockAllNetworkRequests(page: Page): Promise<void> {
  // Override fetch for SSE requests before navigation
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    // @ts-expect-error Overriding fetch for test mocking
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (url.includes('/sse')) {
        // Return a stream that emits a 'connected' event and stays open
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode('event: connected\ndata: {}\n\n'),
            );
            // intentionally do not close — keeps SSE connected=true
          },
        });
        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
      }
      return originalFetch.apply(window, [input, init] as Parameters<typeof fetch>);
    };
  });

  // Mock all Supabase REST API calls (auth + DB)
  await page.route('**/supabase.co/**', async (route) => {
    const method = route.request().method();
    const url = route.request().url();

    // Auth endpoints
    if (url.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'smoke-test-user-id',
          email: 'jjschrup@yahoo.com',
        }),
      });
      return;
    }

    if (url.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'smoke-test-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'smoke-test-user-id', email: 'jjschrup@yahoo.com' },
        }),
      });
      return;
    }

    if (url.includes('/auth/v1/')) {
      // Catch-all for other auth endpoints (logout, refresh, etc.)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    // DB table reads via REST
    if (method === 'GET' && url.includes('/rest/v1/')) {
      // Supabase SDK wraps the array response — return empty array for list queries.
      // For .single()/.maybeSingle() queries the SDK expects an array that it then
      // selects the first element from.  Return [] which gives data=null after SDK processing.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // PostgREST returns an array; Supabase JS client processes it into { data, error }
        body: JSON.stringify([]),
      });
      return;
    }

    // DB writes — acknowledge silently
    if ((method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') && url.includes('/rest/v1/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    // Let Supabase realtime websocket through (not interceptable via route())
    await route.continue();
  });

  // Mock all backend API endpoints
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    // SSE handled by fetch override above — abort if it somehow reaches route()
    if (/\/api\/sessions\/[^/]+\/sse$/.test(path)) {
      await route.abort();
      return;
    }

    // Sessions list
    if (path === '/api/sessions' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
      return;
    }

    // Session create
    if (path === '/api/sessions' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { id: 'smoke-session-id', status: 'active', created_at: new Date().toISOString() },
        }),
      });
      return;
    }

    // Session load
    if (/\/api\/sessions\/[^/]+$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { id: 'smoke-session-id', status: 'active', created_at: new Date().toISOString() },
        }),
      });
      return;
    }

    // Resumes list
    if (path.startsWith('/api/resumes') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resumes: [] }),
      });
      return;
    }

    // Pipeline start
    if (path === '/api/pipeline/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'started' }),
      });
      return;
    }

    // Pipeline respond
    if (path === '/api/pipeline/respond' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    // Pipeline status
    if (path.startsWith('/api/pipeline/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ running: false, pending_gate: null }),
      });
      return;
    }

    // Workflow summary
    if (/\/api\/workflow\/[^/]+$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: null, nodes: [], latest_artifacts: [], replan: null }),
      });
      return;
    }

    // ── Structured endpoints — each must return the exact shape the hook expects ──
    // Failure to do so causes undefined property access crashes in components.

    // Content posts — KeywordMultiplierNudge calls posts.filter()
    if (path.startsWith('/api/content-posts')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) });
      return;
    }

    // Networking contacts — NetworkingHubRoom calls contacts.filter()
    if (path.startsWith('/api/networking/contacts') || path.startsWith('/api/networking/follow-ups')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [], touchpoints: [] }) });
      return;
    }

    // Networking outreach
    if (path.startsWith('/api/networking-outreach')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }

    // Momentum
    if (path.startsWith('/api/momentum')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: null, nudges: [] }) });
      return;
    }

    // Job finder / tracker / command center
    if (path.startsWith('/api/job-finder') || path.startsWith('/api/job-tracker') || path.startsWith('/api/job-search')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [], results: [] }) });
      return;
    }

    // Applications pipeline — returns an array directly (not wrapped in object)
    if (path.startsWith('/api/applications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }

    // Watchlist companies — returns an array directly
    if (path.startsWith('/api/watchlist')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }

    // Daily ops (combines pipeline + radar + ops data)
    if (path.startsWith('/api/daily-ops') || path.startsWith('/api/radar')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], matches: [] }) });
      return;
    }

    // Case study
    if (path.startsWith('/api/case-study')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }

    // LinkedIn optimizer / content calendar / editor
    if (path.startsWith('/api/linkedin') || path.startsWith('/api/content-calendar')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reports: [], posts: [], ok: true }) });
      return;
    }

    // Catch-all: fulfil generically to prevent network errors in tests
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // Mock momentum endpoint (used by CareerIQ screen on mount)
  await page.route('**/api/momentum**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ summary: null, nudges: [] }),
    });
  });
}

/**
 * Wait for the app shell to finish auth loading.
 * After auth, either a Header or an AuthGate is mounted.
 * We detect the authenticated state by waiting for the Header's "CareerIQ" nav button.
 */
async function waitForAuthenticatedShell(page: Page): Promise<void> {
  // The Header is only rendered once auth is resolved and user is present.
  // The "CareerIQ" button is always rendered when email is set.
  await expect(page.getByRole('button', { name: /CareerIQ/i })).toBeVisible({
    timeout: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Console error collector — fail on unexpected JS errors
// ---------------------------------------------------------------------------

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      // Filter out known benign noise
      const text = msg.text();
      const KNOWN_BENIGN = [
        'supabase',         // supabase auth logs
        'ResizeObserver',   // harmless browser quirk
        'Non-Error promise rejection', // firebase/supabase realtime
        'net::ERR_',        // network errors are expected (everything is mocked)
        'Failed to fetch',  // same
        'ERR_FAILED',       // playwright abort
        'ERR_BLOCKED',      // playwright abort
      ];
      if (KNOWN_BENIGN.some((s) => text.toLowerCase().includes(s.toLowerCase()))) return;
      errors.push(text);
    }
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Test: major page routes
// ---------------------------------------------------------------------------

test.describe('Smoke: major page routes', () => {
  // All tests in this describe share one setup call — we avoid serial mode
  // so Playwright can parallelise them within the project.

  test('sales page (/) renders without crash', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    // / shows the SalesPage even for unauthenticated users
    await page.goto('/');
    // SalesPage renders a hero section with a CTA button
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    // The sales page should not be a blank screen — look for any heading
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5_000 });
    expect(errors).toHaveLength(0);
  });

  test('/app renders landing screen after auth', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);
    // Landing screen shows "Start New Session"
    await expect(
      page.getByRole('button', { name: /Start New Session/i }),
    ).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test('/dashboard renders dashboard screen', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/dashboard');
    await waitForAuthenticatedShell(page);
    // Dashboard heading is the primary landmark
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test('/tools renders product catalog grid', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/tools');
    await waitForAuthenticatedShell(page);
    // ToolsScreen renders a ProductCatalogGrid — look for a heading or grid
    // The grid always renders at least one product card
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    // Any heading inside the tools page confirms it mounted
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });

  test('/pricing renders pricing page', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/pricing');
    await waitForAuthenticatedShell(page);
    // PricingPage always renders some content even without billing data
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });

  test('/cover-letter renders cover letter screen', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/cover-letter');
    await waitForAuthenticatedShell(page);
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    // CoverLetterScreen renders a heading or form
    await expect(page.locator('h1, h2, h3, [role="heading"]').first()).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });

  test('/career-iq renders CareerIQ screen with sidebar', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/career-iq');
    await waitForAuthenticatedShell(page);
    // The Sidebar header label is a <span> inside the <aside> element
    await expect(
      page.getByRole('complementary').getByText('CareerIQ', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    // Sidebar group label for rooms
    await expect(page.getByText(/Resume Tools/i)).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test: Header navigation links
// ---------------------------------------------------------------------------

test.describe('Smoke: header navigation', () => {
  test('Tools nav link changes route to /tools', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /^Tools$/i }).click();
    await expect(page).toHaveURL(/\/tools/, { timeout: 5_000 });
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 8_000 });
  });

  test('CareerIQ nav link changes route to /career-iq', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /^CareerIQ$/i }).click();
    await expect(page).toHaveURL(/\/career-iq/, { timeout: 5_000 });
    await expect(
      page.getByRole('complementary').getByText('CareerIQ', { exact: true }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('Dashboard nav link changes route to /dashboard', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /^Dashboard$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('Pricing nav link changes route to /pricing', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /^Pricing$/i }).click();
    await expect(page).toHaveURL(/\/pricing/, { timeout: 5_000 });
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 8_000 });
  });

  test('browser back from /dashboard returns to /app', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.goto('/dashboard');
    await expect(
      page.getByRole('heading', { name: /Dashboard/i }),
    ).toBeVisible({ timeout: 10_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/app/, { timeout: 5_000 });
    await expect(
      page.getByRole('button', { name: /Start New Session/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Test: Career IQ room smoke tests
// ---------------------------------------------------------------------------

/**
 * Navigate to /career-iq and click a sidebar room button by its label.
 * Waits for the Suspense fallback to resolve (RoomLoadingSkeleton disappears).
 * Throws if the ErrorBoundary fires ("Something went wrong" is visible).
 */
async function navigateToCareerIQRoom(page: Page, roomLabel: string): Promise<void> {
  // Scope to the sidebar <aside> to avoid strict-mode violations when the same
  // label appears in both the sidebar and the main content area (e.g. DashboardHome
  // quick-launch buttons).
  const sidebar = page.getByRole('complementary');
  const roomBtn = sidebar.getByRole('button', { name: roomLabel });
  await expect(roomBtn).toBeVisible({ timeout: 5_000 });
  await roomBtn.click();

  // Wait for Suspense skeleton to clear — it has animate-pulse class
  // If already gone (fast load), the catch is fine
  await expect(page.locator('.animate-pulse').first())
    .not.toBeAttached({ timeout: 8_000 })
    .catch(() => {
      // Skeleton may already be gone — acceptable
    });

  // Give React a brief moment to mount the lazy component
  await page.waitForTimeout(400);
}

/**
 * Assert that the current page state does not show the ErrorBoundary crash screen.
 * The ErrorBoundary renders "Something went wrong" when a component throws.
 */
async function assertNoCrash(page: Page): Promise<void> {
  const crashText = page.getByText('Something went wrong');
  const isCrashed = await crashText.isVisible().catch(() => false);
  if (isCrashed) {
    throw new Error(
      `ErrorBoundary fired — the room crashed with "Something went wrong". ` +
      `This indicates a real component render error in this environment.`,
    );
  }
}

test.describe('Smoke: Career IQ rooms', () => {
  // Navigate to /career-iq once, then click sidebar rooms.
  // Using serial mode so we navigate once and re-use the page state.
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    sharedPage = await context.newPage();
    await mockAllNetworkRequests(sharedPage);

    // Seed the Why-Me story in localStorage so dashboardState !== 'new-user'.
    // This unlocks the gated rooms in the Sidebar so we can click them.
    // addInitScript runs before any page JS executes, so useWhyMeStory
    // picks up the value from loadFromStorage() on mount.
    await sharedPage.addInitScript(() => {
      localStorage.setItem(
        'careeriq_why_me_story',
        JSON.stringify({
          colleaguesCameForWhat: 'I am known for building highly reliable distributed systems at scale across multiple organisations over many years of practice.',
          knownForWhat: 'I am known for translating ambiguous technical requirements into concrete engineering roadmaps that delivery teams can execute with confidence.',
          whyNotMe: 'I sometimes move fast and skip documentation, though I have been actively improving this habit over the past year.',
        }),
      );
    });

    await sharedPage.goto('/career-iq');
    await waitForAuthenticatedShell(sharedPage);
    // Wait for sidebar to be visible — the sidebar <span> label is inside <aside>
    await expect(
      sharedPage.getByRole('complementary').getByText('CareerIQ', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  test('Dashboard room renders (default state)', async () => {
    // Dashboard is the default active room on mount
    await expect(sharedPage.locator('body')).toBeVisible();
    // The sidebar "Dashboard" button should exist
    await expect(sharedPage.getByRole('button', { name: /^Dashboard$/i })).toBeVisible();
  });

  test('Resume Workshop room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Resume Workshop');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('LinkedIn Studio room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'LinkedIn Studio');
    await assertNoCrash(sharedPage);
    // LinkedIn Studio uses tab buttons rather than a top-level heading.
    // Verify the sidebar is still visible (no full-page crash), and that
    // the main scroll container has rendered something.
    await expect(
      sharedPage.getByRole('complementary').getByText('CareerIQ', { exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    // The scroll container inside <main> should have at least one child element
    await expect(sharedPage.locator('main > *').first()).toBeVisible({ timeout: 8_000 });
  });

  test('Job Command Center room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Job Command Center');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Interview Lab room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Interview Lab');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Networking Hub room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Networking Hub');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Salary Negotiation room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Salary Negotiation');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Executive Bio room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Executive Bio');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Content Calendar room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Content Calendar');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Financial Wellness room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Financial Wellness');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Live Sessions room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Live Sessions');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Network Intelligence room renders', async () => {
    await navigateToCareerIQRoom(sharedPage, 'Network Intelligence');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.locator('h2, h3, [role="heading"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('sidebar collapse and expand works without crash', async () => {
    // Navigate back to dashboard first — scope to sidebar to avoid ambiguity
    // with the Header "Dashboard" nav button
    await sharedPage.getByRole('complementary').getByRole('button', { name: /^Dashboard$/i }).click();

    const collapseBtn = sharedPage.getByRole('button', { name: /Collapse sidebar/i });
    await expect(collapseBtn).toBeVisible({ timeout: 5_000 });
    await collapseBtn.click();

    // Sidebar should now be collapsed — the expand button appears
    const expandBtn = sharedPage.getByRole('button', { name: /Expand sidebar/i });
    await expect(expandBtn).toBeVisible({ timeout: 3_000 });

    // Expand again
    await expandBtn.click();
    await expect(
      sharedPage.getByRole('button', { name: /Collapse sidebar/i }),
    ).toBeVisible({ timeout: 3_000 });
  });
});
