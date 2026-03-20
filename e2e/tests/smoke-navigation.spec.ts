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

import { test, expect, type Page, type Route } from '@playwright/test';

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
  const fulfillSupabaseRoute = async (route: Route) => {
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
  };

  await page.route('**/supabase.co/**', fulfillSupabaseRoute);
  await page.route('**/mock-supabase/**', fulfillSupabaseRoute);

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

    // Applications pipeline — backend returns { applications: [], count: 0 }
    if (path.startsWith('/api/applications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [], count: 0 }) });
      return;
    }

    // Watchlist companies
    if (path.startsWith('/api/watchlist')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companies: [] }) });
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

    if (path === '/api/billing/subscription' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscription: null,
          plan: {
            id: 'free',
            name: 'Free',
            monthly_price_cents: 0,
            included_sessions: 3,
            max_sessions_per_month: 3,
          },
          usage: {
            sessions_this_period: 0,
            cost_usd_this_period: 0,
          },
        }),
      });
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
 * We detect the authenticated state by waiting for the current signed-in shell.
 */
async function waitForAuthenticatedShell(page: Page): Promise<void> {
  await Promise.race([
    page.getByRole('button', { name: /^Workspace$/i }).waitFor({ timeout: 15_000 }),
    page.getByRole('button', { name: /Sign out/i }).waitFor({ timeout: 15_000 }),
  ]);
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

  test('/app redirects into Workspace Home after auth', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 10_000 });
    await expect(page.getByText('Career Profile backbone').first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test('/dashboard redirects into Resume Builder', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/dashboard');
    await waitForAuthenticatedShell(page);
    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 10_000 });
    await expect(page.getByText('Resume management').first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test('/tools redirects into Workspace Home', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/tools');
    await waitForAuthenticatedShell(page);
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 8_000 });
    await expect(page.getByText('Career Profile backbone').first()).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });

  test('/pricing redirects into billing for signed-in users', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/pricing');
    await waitForAuthenticatedShell(page);
    await expect(page).toHaveURL(/\/billing/, { timeout: 8_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });

  test('/cover-letter redirects into Resume Builder', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/cover-letter');
    await waitForAuthenticatedShell(page);
    await expect(page).toHaveURL(/\/workspace\?room=resume&focus=cover-letter/, { timeout: 8_000 });
    await expect(page.getByRole('heading', { name: 'Cover Letter' }).first()).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });

  test('/resume-builder redirects into Resume Builder', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/resume-builder');
    await waitForAuthenticatedShell(page);
    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 8_000 });
    await expect(page.getByText('Resume management').first()).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });

  test('legacy salary-negotiation room redirects into Interview Prep', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/workspace?room=salary-negotiation');
    await waitForAuthenticatedShell(page);
    await expect(page).toHaveURL(/room=interview/, { timeout: 8_000 });
    await expect(page.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible({ timeout: 8_000 });
    expect(errors).toHaveLength(0);
  });

  test('/career-iq redirects into Workspace Home', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockAllNetworkRequests(page);
    await page.goto('/career-iq');
    await waitForAuthenticatedShell(page);
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 10_000 });
    await expect(page.getByText('Career Profile backbone').first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test: Header navigation links
// ---------------------------------------------------------------------------

test.describe('Smoke: header navigation', () => {
  test('header no longer exposes a Tools nav link', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await expect(page.getByRole('button', { name: /^Tools$/i })).toHaveCount(0);
  });

  test('Workspace nav link changes route to /workspace', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /^Workspace$/i }).click();
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 5_000 });
    await expect(page.getByText('Career Profile backbone').first()).toBeVisible({ timeout: 8_000 });
  });

  test('Resume Builder nav link changes route to /workspace?room=resume', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('banner').getByRole('button', { name: /^Resume Builder$/i }).click();
    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 5_000 });
    await expect(page.getByText('Resume management').first()).toBeVisible({ timeout: 8_000 });
  });

  test('signed-in header no longer exposes Pricing', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await expect(page.getByRole('button', { name: /^Pricing$/i })).toHaveCount(0);
  });

  test('Billing stays in account controls, not the primary nav', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await expect(page.getByRole('navigation').getByRole('button', { name: /^Billing$/i })).toHaveCount(0);
    await page.getByRole('banner').getByRole('button', { name: /^Billing$/i }).click();
    await expect(page).toHaveURL(/\/billing/, { timeout: 5_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 8_000 });
  });

  test('browser back from Resume Builder returns to Workspace Home', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.goto('/workspace?room=resume');
    await expect(page.getByText('Resume management').first()).toBeVisible({ timeout: 10_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 5_000 });
    await expect(page.getByText('Career Profile backbone').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Test: Workspace core room smoke tests
// ---------------------------------------------------------------------------

/**
 * Navigate directly to a Workspace room route.
 * Waits for the Suspense fallback to resolve (RoomLoadingSkeleton disappears).
 */
async function openWorkspaceRoom(page: Page, roomPath: string): Promise<void> {
  await page.goto(roomPath);
  await waitForAuthenticatedShell(page);
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

test.describe('Smoke: Workspace core rooms', () => {
  // Navigate to /workspace once, then click sidebar rooms.
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

    await sharedPage.goto('/workspace');
    await waitForAuthenticatedShell(sharedPage);
    // Wait for sidebar to be visible — Home button inside <aside>
    await expect(
      sharedPage.locator('aside').getByText('Home', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  test('Workspace Home renders (default state)', async () => {
    // Workspace Home is the default active room on mount
    await expect(sharedPage.locator('body')).toBeVisible();
    await expect(sharedPage.locator('aside').getByRole('button', { name: /Home/i })).toBeVisible();
    await expect(sharedPage.getByText('Career Profile backbone').first()).toBeVisible();
  });

  test('Career Profile room renders', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=career-profile');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.getByRole('heading', { name: 'One shared profile that every agent reads' })).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Workspace Home entry buttons open Career Profile and Job Search', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: /Open Career Profile/i }).click();
    await expect(sharedPage).toHaveURL(/room=career-profile/, { timeout: 8_000 });
    await expect(sharedPage.getByRole('heading', { name: 'One shared profile that every agent reads' })).toBeVisible({
      timeout: 8_000,
    });

    await openWorkspaceRoom(sharedPage, '/workspace');
    await sharedPage.getByRole('button', { name: /Open job tracker/i }).click();
    await expect(sharedPage).toHaveURL(/room=jobs/, { timeout: 8_000 });
    await expect(sharedPage.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Resume Builder room renders', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=resume');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.getByText('Resume management').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('LinkedIn room renders', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=linkedin');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.getByRole('heading', { name: 'LinkedIn', exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('LinkedIn room tab switching works without crash', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=linkedin');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: 'Analytics', exact: true }).click();
    await expect(sharedPage.getByRole('heading', { name: /Platform Metrics/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(sharedPage.getByText(/Content Calendar/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('Job Search room renders', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.getByRole('heading', { name: 'Job Search', exact: true })).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Job Search section switching works without crash', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: 'Radar', exact: true }).click();
    await expect(sharedPage.getByRole('heading', { name: /Radar Search/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: 'Daily Ops', exact: true }).click();
    await expect(sharedPage.getByRole('heading', { name: 'Daily Ops', exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('Interview Prep room renders', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=interview');
    await assertNoCrash(sharedPage);
    await expect(sharedPage.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Interview Prep section switching works without crash', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=interview');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: /^Practice /i }).click();
    await expect(sharedPage.getByRole('button', { name: /Start Mock Interview/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /^Documents /i }).click();
    await expect(sharedPage.getByRole('button', { name: /Open 30-60-90 Day Plan/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /^Next Steps /i }).click();
    await expect(sharedPage.getByText(/Close the loop without breaking the narrative/i)).toBeVisible({ timeout: 8_000 });
  });

  test('sidebar collapse and expand works without crash', async () => {
    // Navigate back to home first — scope to sidebar to avoid ambiguity
    await sharedPage.locator('aside').getByRole('button', { name: /Home/i }).click();

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
