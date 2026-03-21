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

interface SmokeNetworkOptions {
  billingResponse?: {
    subscription: {
      id: string;
      plan_id: string;
      status: string;
      current_period_start: string;
      current_period_end: string;
      stripe_subscription_id: string | null;
      stripe_customer_id: string | null;
      updated_at: string;
    } | null;
    plan: {
      id: string;
      name: string;
      monthly_price_cents: number;
      included_sessions: number;
      max_sessions_per_month: number | null;
    };
    usage: {
      sessions_this_period: number;
      cost_usd_this_period: number;
    };
  };
  billingCheckoutUrl?: string;
  billingPortalUrl?: string;
}

const DEFAULT_BILLING_RESPONSE: NonNullable<SmokeNetworkOptions['billingResponse']> = {
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
};

const SIGNED_IN_LINKEDIN_EDITOR_DRAFTS = {
  headline: {
    content: 'VP Operations | Executive operator who builds operating cadence and cross-functional alignment',
    quality_scores: {
      keyword_coverage: 88,
      readability: 82,
      positioning_alignment: 90,
    },
  },
  about: {
    content: `Executive operator known for turning complexity into operating rhythm across product, support, and delivery teams.

I help leadership teams create the weekly decision-making cadence, ownership clarity, and cross-functional alignment that keep growth from turning into noise.`,
    quality_scores: {
      keyword_coverage: 86,
      readability: 80,
      positioning_alignment: 91,
    },
  },
} as const;

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
async function mockAllNetworkRequests(page: Page, options: SmokeNetworkOptions = {}): Promise<void> {
  const billingResponse = options.billingResponse ?? DEFAULT_BILLING_RESPONSE;
  const billingCheckoutUrl = options.billingCheckoutUrl ?? '/workspace?room=resume';
  const billingPortalUrl = options.billingPortalUrl ?? '/workspace?room=career-profile';
  const watchlistCompanies: Array<{
    id: string;
    name: string;
    industry: string | null;
    website: string | null;
    careers_url: string | null;
    priority: number;
    source: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }> = [];
  const interviewDebriefs: Array<{
    id: string;
    user_id: string;
    job_application_id?: string;
    company_name: string;
    role_title: string;
    interview_date: string;
    interview_type?: 'phone' | 'video' | 'onsite';
    overall_impression?: 'positive' | 'neutral' | 'negative';
    what_went_well?: string;
    what_went_poorly?: string;
    questions_asked?: string[];
    interviewer_notes?: Array<Record<string, unknown>>;
    company_signals?: string;
    follow_up_actions?: string;
    created_at: string;
    updated_at: string;
  }> = [];
  const sharedResumeText =
    'Executive operator with 18 years of experience aligning product, support, and operations leaders around one operating cadence. Led cross-functional teams, improved forecast accuracy, and built repeatable execution systems across SaaS organizations.';
  const interviewingApplications = [
    {
      id: 'job-app-1',
      user_id: 'smoke-test-user-id',
      company: 'Northstar SaaS',
      title: 'VP Operations',
      jd_text:
        'Lead executive alignment, operating cadence, and cross-functional execution across product, support, and delivery leaders.',
      pipeline_stage: 'interviewing',
      status: 'active',
    },
  ];
  const jobFinderMatches = [
    {
      id: 'finder-1',
      title: 'VP Operations',
      company: 'Northstar SaaS',
      location: 'Remote',
      fit_score: 94,
      why_match: 'Strong overlap with operating cadence, cross-functional execution, and leadership scope.',
      salary_range: '$220k-$260k',
      posted_date: '2d ago',
      work_type: 'remote',
    },
    {
      id: 'finder-2',
      title: 'Chief of Staff, Operations',
      company: 'ScaleCo',
      location: 'Chicago',
      fit_score: 89,
      why_match: 'Matches your execution-system leadership and executive stakeholder alignment experience.',
      salary_range: '$190k-$230k',
      posted_date: '4d ago',
      work_type: 'hybrid',
    },
  ];
  const jobFinderSearches = [
    {
      platform: 'LinkedIn',
      query: '("VP Operations" OR "Operations Executive") AND ("operating cadence" OR "cross-functional execution")',
    },
    {
      platform: 'Indeed',
      query: '("operations leader" OR "chief of staff operations") AND ("forecast accuracy" OR "delivery cadence")',
    },
  ];
  const radarJobs = [
    {
      external_id: 'radar-1',
      title: 'VP Operations',
      company: 'Northstar SaaS',
      location: 'Remote',
      salary_min: 220000,
      salary_max: 260000,
      description: 'Lead executive alignment, operating cadence, and cross-functional execution.',
      posted_date: new Date().toISOString(),
      apply_url: 'https://example.com/jobs/vp-operations',
      source: 'LinkedIn',
      remote_type: 'remote',
      employment_type: 'full-time',
      required_skills: ['Operations', 'Executive leadership'],
      match_score: null,
      network_contacts: [],
    },
    {
      external_id: 'radar-2',
      title: 'Chief of Staff, Operations',
      company: 'ScaleCo',
      location: 'Chicago',
      salary_min: 190000,
      salary_max: 230000,
      description: 'Drive executive operating rhythm and strategic execution.',
      posted_date: new Date().toISOString(),
      apply_url: 'https://example.com/jobs/chief-of-staff-operations',
      source: 'Indeed',
      remote_type: 'hybrid',
      employment_type: 'full-time',
      required_skills: ['Strategy', 'Operations'],
      match_score: null,
      network_contacts: [],
    },
  ];
  const applications: Array<{
    id: string;
    role_title: string;
    company_name: string;
    company_id?: string;
    stage: string;
    source: string;
    url?: string;
    applied_date?: string;
    last_touch_date?: string;
    next_action?: string;
    next_action_due?: string;
    resume_version_id?: string;
    notes?: string;
    stage_history: Array<{ stage: string; at: string }>;
    score?: number;
    created_at: string;
    updated_at: string;
  }> = [];
  const linkedinEditorState = new Map<string, 'headline' | 'about' | 'complete'>();
  // Override fetch for generic SSE requests before navigation
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
    const acceptHeader = route.request().headers()['accept'] ?? '';
    const expectsSingle = acceptHeader.includes('application/vnd.pgrst.object+json');

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

    if (method === 'GET' && url.includes('/rest/v1/master_resumes')) {
      const payload = { raw_text: sharedResumeText };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(expectsSingle ? payload : [payload]),
      });
      return;
    }

    if (method === 'GET' && url.includes('/rest/v1/job_applications')) {
      const idMatch = url.match(/id=eq\.([^&]+)/);
      const row = idMatch
        ? interviewingApplications.find((item) => item.id === decodeURIComponent(idMatch[1]))
        : null;
      const payload = row ?? interviewingApplications;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(expectsSingle ? (row ?? interviewingApplications[0]) : payload),
      });
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

    if (/^\/api\/job-tracker\/[^/]+\/stream$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'event: stage_start',
          'data: {"stage":"analysis","message":"Reviewing your applications and scoring follow-up opportunities..."}',
          '',
          'event: application_analyzed',
          'data: {"company":"Northstar SaaS","role":"VP Operations","fit_score":91}',
          '',
          'event: follow_up_generated',
          'data: {"company":"Northstar SaaS","role":"VP Operations","follow_up_type":"follow_up_email"}',
          '',
          'event: analytics_updated',
          'data: {"total":1,"average_fit":91}',
          '',
          'event: tracker_complete',
          'data: {"report":"Application Tracker Summary\\n\\n- Northstar SaaS — strong fit, follow up with the hiring lead this week.","quality_score":87,"application_count":1,"follow_up_count":1}',
          '',
          'event: pipeline_complete',
          'data: {}',
          '',
        ].join('\n'),
      });
      return;
    }

    if (path === '/api/job-tracker/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (path === '/api/interview-prep/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (/^\/api\/interview-prep\/[^/]+\/stream$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'event: stage_start',
          'data: {"stage":"research","message":"Reviewing the role, your resume, and the strongest likely interview pressure points..."}',
          '',
          'event: transparency',
          'data: {"stage":"research","message":"Mapping your operating-cadence wins against the company context."}',
          '',
          'event: stage_complete',
          'data: {"stage":"research","message":"Company and role context loaded."}',
          '',
          'event: stage_start',
          'data: {"stage":"writing","message":"Drafting your interview prep report and likely question bank..."}',
          '',
          'event: report_complete',
          'data: {"report":"# Interview Prep Report\\n\\nLead with executive operating cadence and cross-functional alignment.\\n\\n## Likely pressure points\\n- Make your scope and business impact concrete.\\n- Tie your examples to forecast accuracy and execution rhythm.","quality_score":88}',
          '',
          'event: pipeline_complete',
          'data: {}',
          '',
        ].join('\n'),
      });
      return;
    }

    if (path === '/api/interview-debriefs' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ debriefs: interviewDebriefs }),
      });
      return;
    }

    if (path === '/api/interview-debriefs' && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      const now = new Date().toISOString();
      const created = {
        id: `debrief-${Math.random().toString(36).slice(2, 10)}`,
        user_id: 'smoke-test-user-id',
        job_application_id: typeof body?.job_application_id === 'string' ? body.job_application_id : undefined,
        company_name: typeof body?.company_name === 'string' ? body.company_name : 'Unknown Company',
        role_title: typeof body?.role_title === 'string' ? body.role_title : 'Unknown Role',
        interview_date: typeof body?.interview_date === 'string' ? body.interview_date : now,
        interview_type:
          body?.interview_type === 'phone' || body?.interview_type === 'video' || body?.interview_type === 'onsite'
            ? body.interview_type
            : 'video',
        overall_impression:
          body?.overall_impression === 'positive' || body?.overall_impression === 'neutral' || body?.overall_impression === 'negative'
            ? body.overall_impression
            : undefined,
        what_went_well: typeof body?.what_went_well === 'string' ? body.what_went_well : undefined,
        what_went_poorly: typeof body?.what_went_poorly === 'string' ? body.what_went_poorly : undefined,
        questions_asked: Array.isArray(body?.questions_asked) ? body.questions_asked as string[] : [],
        interviewer_notes: Array.isArray(body?.interviewer_notes) ? body.interviewer_notes as Array<Record<string, unknown>> : [],
        company_signals: typeof body?.company_signals === 'string' ? body.company_signals : undefined,
        follow_up_actions: typeof body?.follow_up_actions === 'string' ? body.follow_up_actions : undefined,
        created_at: now,
        updated_at: now,
      };
      interviewDebriefs.unshift(created);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    const interviewDebriefMatch = path.match(/^\/api\/interview-debriefs\/([^/]+)$/);
    if (interviewDebriefMatch && method === 'PATCH') {
      const [, debriefId] = interviewDebriefMatch;
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      const existing = interviewDebriefs.find((debrief) => debrief.id === debriefId);
      if (!existing) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) });
        return;
      }
      if (typeof body?.overall_impression === 'string') {
        existing.overall_impression = body.overall_impression as 'positive' | 'neutral' | 'negative';
      }
      existing.updated_at = new Date().toISOString();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(existing) });
      return;
    }

    if (interviewDebriefMatch && method === 'DELETE') {
      const [, debriefId] = interviewDebriefMatch;
      const index = interviewDebriefs.findIndex((debrief) => debrief.id === debriefId);
      if (index >= 0) interviewDebriefs.splice(index, 1);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }

    if (path === '/api/job-finder/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (/^\/api\/job-finder\/[^/]+\/stream$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'event: stage_start',
          'data: {"stage":"search","message":"Building search strings from your Career Profile..."}',
          '',
          'event: search_progress',
          `data: ${JSON.stringify({
            message: 'Generated Boolean searches for LinkedIn and Indeed.',
            searches: jobFinderSearches,
          })}`,
          '',
          'event: results_ready',
          `data: ${JSON.stringify({ matches: jobFinderMatches })}`,
          '',
          'event: job_finder_complete',
          'data: {"session_id":"signed-in-job-finder-session"}',
          '',
          'event: pipeline_complete',
          'data: {}',
          '',
        ].join('\n'),
      });
      return;
    }

    if (path === '/api/job-search/scans/latest' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scan: null, results: [] }),
      });
      return;
    }

    if (path === '/api/job-search' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scan_id: 'signed-in-radar-scan',
          jobs: radarJobs,
          sources_queried: ['LinkedIn', 'Indeed'],
          execution_time_ms: 420,
        }),
      });
      return;
    }

    if (path === '/api/job-search/score' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [
            { external_id: 'radar-1', match_score: 92 },
            { external_id: 'radar-2', match_score: 84 },
          ],
        }),
      });
      return;
    }

    // Applications pipeline
    if (path === '/api/applications' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ applications, count: applications.length }),
      });
      return;
    }

    if (path === '/api/applications/due-actions' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ actions: [] }),
      });
      return;
    }

    if (path === '/api/applications' && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      const now = new Date().toISOString();
      const created = {
        id: `app-${Math.random().toString(36).slice(2, 10)}`,
        role_title: typeof body?.role_title === 'string' ? body.role_title : 'Unknown Role',
        company_name: typeof body?.company_name === 'string' ? body.company_name : 'Unknown Company',
        company_id: undefined,
        stage: typeof body?.stage === 'string' ? body.stage : 'saved',
        source: typeof body?.source === 'string' ? body.source : 'manual',
        url: typeof body?.url === 'string' ? body.url : undefined,
        applied_date: undefined,
        last_touch_date: undefined,
        next_action: undefined,
        next_action_due: undefined,
        resume_version_id: undefined,
        notes: typeof body?.notes === 'string' ? body.notes : undefined,
        stage_history: Array.isArray(body?.stage_history) ? body.stage_history as Array<{ stage: string; at: string }> : [],
        score: undefined,
        created_at: typeof body?.created_at === 'string' ? body.created_at : now,
        updated_at: typeof body?.updated_at === 'string' ? body.updated_at : now,
      };
      applications.unshift(created);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    if (path.startsWith('/api/applications/') && method === 'PATCH') {
      const id = path.split('/')[3];
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      const existing = applications.find((application) => application.id === id);
      if (!existing) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) });
        return;
      }
      if (typeof body?.stage === 'string') existing.stage = body.stage;
      existing.updated_at = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(existing),
      });
      return;
    }

    if (path.startsWith('/api/applications/') && method === 'DELETE') {
      const id = path.split('/')[3];
      const index = applications.findIndex((application) => application.id === id);
      if (index >= 0) applications.splice(index, 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    // Job finder / remaining command center fallbacks
    if (path.startsWith('/api/job-finder') || path.startsWith('/api/job-search') || path.startsWith('/api/applications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [], results: [] }) });
      return;
    }

    if (path === '/api/watchlist' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companies: watchlistCompanies }) });
      return;
    }

    if (path === '/api/watchlist' && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      const now = new Date().toISOString();
      const created = {
        id: `watch-${Math.random().toString(36).slice(2, 10)}`,
        name: typeof body?.name === 'string' ? body.name : 'New Company',
        industry: typeof body?.industry === 'string' ? body.industry : null,
        website: typeof body?.website === 'string' ? body.website : null,
        careers_url: typeof body?.careers_url === 'string' ? body.careers_url : null,
        priority: typeof body?.priority === 'number' ? body.priority : 3,
        source: typeof body?.source === 'string' ? body.source : 'manual',
        notes: typeof body?.notes === 'string' ? body.notes : null,
        created_at: now,
        updated_at: now,
      };
      watchlistCompanies.unshift(created);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }

    const watchlistItemMatch = path.match(/^\/api\/watchlist\/([^/]+)$/);
    if (watchlistItemMatch && method === 'PATCH') {
      const [, companyId] = watchlistItemMatch;
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      const existing = watchlistCompanies.find((company) => company.id === companyId);
      if (!existing) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) });
        return;
      }
      if (typeof body?.priority === 'number') existing.priority = body.priority;
      existing.updated_at = new Date().toISOString();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(existing) });
      return;
    }

    if (watchlistItemMatch && method === 'DELETE') {
      const [, companyId] = watchlistItemMatch;
      const index = watchlistCompanies.findIndex((company) => company.id === companyId);
      if (index >= 0) watchlistCompanies.splice(index, 1);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
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

    // LinkedIn generic reads plus calendar data
    if (path === '/api/linkedin' || path.startsWith('/api/linkedin/') || path.startsWith('/api/content-calendar')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reports: [], posts: [], ok: true }) });
      return;
    }

    if (path === '/api/linkedin-optimizer/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (/^\/api\/linkedin-editor\/[^/]+\/stream$/.test(path) && method === 'GET') {
      const sessionId = path.split('/')[3] ?? 'signed-in-linkedin-editor-session';
      const phase = linkedinEditorState.get(sessionId) ?? 'headline';

      if (phase === 'about') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: [
            'event: section_approved',
            `data: ${JSON.stringify({
              section: 'headline',
              content: SIGNED_IN_LINKEDIN_EDITOR_DRAFTS.headline.content,
            })}`,
            '',
            'event: stage_start',
            'data: {"stage":"about","message":"Writing your About section..."}',
            '',
            'event: section_draft_ready',
            `data: ${JSON.stringify({
              section: 'about',
              content: SIGNED_IN_LINKEDIN_EDITOR_DRAFTS.about.content,
              quality_scores: SIGNED_IN_LINKEDIN_EDITOR_DRAFTS.about.quality_scores,
            })}`,
            '',
            'event: pipeline_gate',
            'data: {"gate":"section_review"}',
            '',
          ].join('\n'),
        });
        return;
      }

      if (phase === 'complete') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: [
            'event: section_approved',
            `data: ${JSON.stringify({
              section: 'about',
              content: SIGNED_IN_LINKEDIN_EDITOR_DRAFTS.about.content,
            })}`,
            '',
            'event: editor_complete',
            `data: ${JSON.stringify({
              sections: {
                headline: SIGNED_IN_LINKEDIN_EDITOR_DRAFTS.headline.content,
                about: SIGNED_IN_LINKEDIN_EDITOR_DRAFTS.about.content,
              },
            })}`,
            '',
            'event: pipeline_complete',
            'data: {}',
            '',
          ].join('\n'),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'event: stage_start',
          'data: {"stage":"headline","message":"Writing your headline..."}',
          '',
          'event: section_draft_ready',
          `data: ${JSON.stringify({
            section: 'headline',
            content: SIGNED_IN_LINKEDIN_EDITOR_DRAFTS.headline.content,
            quality_scores: SIGNED_IN_LINKEDIN_EDITOR_DRAFTS.headline.quality_scores,
          })}`,
          '',
          'event: pipeline_gate',
          'data: {"gate":"section_review"}',
          '',
        ].join('\n'),
      });
      return;
    }

    if (path === '/api/linkedin-editor/start' && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      const sessionId =
        typeof body?.session_id === 'string' && body.session_id.length > 0
          ? body.session_id
          : 'signed-in-linkedin-editor-session';
      linkedinEditorState.set(sessionId, 'headline');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (path === '/api/linkedin-editor/respond' && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      const sessionId =
        typeof body?.session_id === 'string' && body.session_id.length > 0
          ? body.session_id
          : 'signed-in-linkedin-editor-session';
      const currentPhase = linkedinEditorState.get(sessionId) ?? 'headline';
      const response =
        body?.response && typeof body.response === 'object'
          ? body.response as Record<string, unknown>
          : {};

      if (response.approved === true) {
        linkedinEditorState.set(sessionId, currentPhase === 'headline' ? 'about' : 'complete');
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (/^\/api\/linkedin-optimizer\/[^/]+\/stream$/.test(path) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'event: stage_start',
          'data: {"stage":"analysis","message":"Reading your resume and current positioning signals..."}',
          '',
          'event: stage_complete',
          'data: {"stage":"analysis","message":"Positioning signals captured."}',
          '',
          'event: report_complete',
          'data: {"report":"## Headline\\n### Current\\nOperations leader\\n### Optimized\\nExecutive operator who builds operating cadence across product, support, and delivery leaders.\\n\\n---\\n\\n## About Section\\n### Current\\nI lead operations teams.\\n### Optimized\\nExecutive operator known for turning cross-functional complexity into a reliable operating rhythm with clear ownership and measurable follow-through.","quality_score":87,"experience_entries":[]}',
          '',
          'event: pipeline_complete',
          'data: {}',
          '',
        ].join('\n'),
      });
      return;
    }

    if (path === '/api/billing/subscription' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(billingResponse),
      });
      return;
    }

    if (path === '/api/billing/checkout' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: billingCheckoutUrl }),
      });
      return;
    }

    if (path === '/api/billing/portal' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: billingPortalUrl }),
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

  test('signed-in header name editor opens and cancels cleanly', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByTitle('Click to edit your name').click();
    await expect(page.getByPlaceholder('First')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder('Last')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await expect(page.getByPlaceholder('First')).toHaveCount(0);
    await expect(page.getByPlaceholder('Last')).toHaveCount(0);
  });

  test('signed-in header name editor saves cleanly', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByTitle('Click to edit your name').click();
    await expect(page.getByPlaceholder('First')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder('Last')).toBeVisible({ timeout: 5_000 });

    await page.getByPlaceholder('First').fill('Jordan');
    await page.getByPlaceholder('Last').fill('Schrup');
    await page.getByRole('button', { name: /^Save$/i }).click();

    await expect(page.getByPlaceholder('First')).toHaveCount(0);
    await expect(page.getByPlaceholder('Last')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Workspace$/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /^Billing$/i })).toBeVisible({ timeout: 5_000 });
  });

  test('mobile menu routes into Resume Builder and Billing without crash', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Open menu/i })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Open menu/i }).click();
    await expect(page.getByRole('dialog', { name: /Navigation menu/i })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /^Resume Builder$/i }).click();
    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 5_000 });
    await expect(page.getByText('Resume management').first()).toBeVisible({ timeout: 8_000 });

    await page.getByRole('button', { name: /Open menu/i }).click();
    await expect(page.getByRole('dialog', { name: /Navigation menu/i })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /^Billing$/i }).click();
    await expect(page).toHaveURL(/\/billing/, { timeout: 5_000 });
    await expect(page.getByText('Usage this month')).toBeVisible({ timeout: 8_000 });
  });

  test('mobile menu sign out returns to the sales page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Open menu/i })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Open menu/i }).click();
    await expect(page.getByRole('dialog', { name: /Navigation menu/i })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /^Sign out$/i }).click();
    await expect(page).toHaveURL(/\/sales$/, { timeout: 8_000 });
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 8_000 });
  });

  test('sign out returns to the sales page', async ({ page }) => {
    await mockAllNetworkRequests(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /^Sign out$/i }).click();

    await expect(page).toHaveURL(/\/sales$/, { timeout: 8_000 });
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 8_000 });
  });

  test('billing upgrade button starts checkout from the free plan', async ({ page }) => {
    await mockAllNetworkRequests(page, {
      billingCheckoutUrl: '/workspace?room=resume',
    });
    await page.goto('/billing');
    await waitForAuthenticatedShell(page);

    await expect(page.getByRole('button', { name: /^Upgrade$/i })).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: /^Upgrade$/i }).click();

    await expect(page).toHaveURL(/\/workspace\?room=resume/, { timeout: 5_000 });
    await expect(page.getByText('Resume management').first()).toBeVisible({ timeout: 8_000 });
  });

  test('billing manage button opens the portal flow for an active paid plan', async ({ page }) => {
    await mockAllNetworkRequests(page, {
      billingResponse: {
        subscription: {
          id: 'sub-starter',
          plan_id: 'starter',
          status: 'active',
          current_period_start: '2026-03-01T00:00:00.000Z',
          current_period_end: '2026-04-01T00:00:00.000Z',
          stripe_subscription_id: 'stripe-sub-123',
          stripe_customer_id: 'stripe-customer-123',
          updated_at: '2026-03-20T00:00:00.000Z',
        },
        plan: {
          id: 'starter',
          name: 'Starter',
          monthly_price_cents: 1999,
          included_sessions: 15,
          max_sessions_per_month: 50,
        },
        usage: {
          sessions_this_period: 4,
          cost_usd_this_period: 1.24,
        },
      },
      billingPortalUrl: '/workspace?room=career-profile',
    });
    await page.goto('/billing');
    await waitForAuthenticatedShell(page);

    await expect(page.getByRole('button', { name: /^Manage$/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /^Upgrade$/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^Manage$/i }).click();

    await expect(page).toHaveURL(/\/workspace\?room=career-profile/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /One shared profile that every agent reads/i })).toBeVisible({
      timeout: 8_000,
    });
  });

  test('billing retry recovers from a temporary subscription load failure', async ({ page }) => {
    let requestCount = 0;
    await mockAllNetworkRequests(page);
    await page.route('**/api/billing/subscription', async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporarily unavailable' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(DEFAULT_BILLING_RESPONSE),
      });
    });

    await page.goto('/billing');
    await waitForAuthenticatedShell(page);

    await expect(page.getByText('Temporarily unavailable')).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: /^Retry$/i }).click();

    await expect(page.getByText('Usage this month')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Temporarily unavailable')).toHaveCount(0);
    await expect.poll(() => requestCount >= 2).toBe(true);
  });

  test('billing refresh reloads the current subscription view', async ({ page }) => {
    let requestCount = 0;
    await mockAllNetworkRequests(page);
    await page.route('**/api/billing/subscription', async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(DEFAULT_BILLING_RESPONSE),
      });
    });

    await page.goto('/billing');
    await waitForAuthenticatedShell(page);

    await expect(page.getByText('Usage this month')).toBeVisible({ timeout: 8_000 });
    const initialRequestCount = requestCount;
    expect(initialRequestCount).toBeGreaterThanOrEqual(1);

    await page.getByRole('button', { name: /^Refresh$/i }).click();

    await expect(page.getByText('Usage this month')).toBeVisible({ timeout: 8_000 });
    await expect.poll(() => requestCount > initialRequestCount).toBe(true);
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

  test('LinkedIn quick optimize completes in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=linkedin');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: /Quick Optimize/i }).click();

    await expect(sharedPage.getByText(/Profile Quality: 87%/i)).toBeVisible({ timeout: 8_000 });
    await expect(sharedPage.getByRole('button', { name: /Re-optimize/i })).toBeVisible({ timeout: 8_000 });
  });

  test('LinkedIn Profile Editor completes in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=linkedin');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: 'Profile Editor', exact: true }).click();
    await sharedPage.getByRole('button', { name: /Edit Profile/i }).click();

    await expect(sharedPage.getByRole('heading', { name: 'Headline', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(sharedPage.getByText(/Executive operator who builds operating cadence/i)).toBeVisible({ timeout: 10_000 });

    await sharedPage.getByRole('button', { name: /^Approve$/i }).click();

    await expect(sharedPage.getByRole('heading', { name: /About Section/i })).toBeVisible({ timeout: 10_000 });
    await expect(sharedPage.getByText(/Executive operator known for turning complexity into operating rhythm/i)).toBeVisible({
      timeout: 10_000,
    });

    await sharedPage.getByRole('button', { name: /^Approve$/i }).click();

    await expect(sharedPage.getByRole('heading', { name: /Profile Optimization Complete/i })).toBeVisible({ timeout: 10_000 });
    await expect(sharedPage.getByText('Headline', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(sharedPage.getByText('About Section', { exact: true })).toBeVisible({ timeout: 10_000 });
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

  test('Job Search runs Job Finder in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: 'Radar', exact: true }).click();
    await expect(sharedPage.getByRole('heading', { name: /Radar Search/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /Run Job Finder/i }).click();

    await expect(sharedPage.getByText('Northstar SaaS', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(sharedPage.getByText('ScaleCo', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(sharedPage.getByRole('heading', { name: /Boolean Search Builder/i })).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Job Search smart match action routes into Resume Builder in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: 'Radar', exact: true }).click();
    await expect(sharedPage.getByRole('heading', { name: /Radar Search/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /Run Job Finder/i }).click();

    await expect(sharedPage.getByText('Northstar SaaS', { exact: true })).toBeVisible({ timeout: 8_000 });
    await sharedPage.getByRole('button', { name: /Resume \+ Letter/i }).first().click();

    await expect(sharedPage).toHaveURL(/\/workspace\?room=resume/, { timeout: 8_000 });
    await expect(
      sharedPage.getByRole('heading', { name: /One home for stage-aware job workspaces and your master resume/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('Job Search radar scoring feeds Daily Ops and promote sends a role into the pipeline in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: 'Radar', exact: true }).click();
    await sharedPage.getByPlaceholder('Job title, keywords...').fill('VP Operations');
    await sharedPage.getByPlaceholder('Location or Remote').fill('Remote');
    await sharedPage.getByRole('button', { name: /^Search$/i }).click();

    await expect(sharedPage.getByText('Northstar SaaS', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(sharedPage.getByText('ScaleCo', { exact: true })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /Score Matches/i }).click();
    await expect(sharedPage.getByText('92%')).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: 'Daily Ops', exact: true }).click();
    await expect(sharedPage.locator('span:visible', { hasText: 'Northstar SaaS' }).first()).toBeVisible({ timeout: 8_000 });
    await expect(sharedPage.locator('button:visible', { hasText: 'Promote' })).toHaveCount(2);

    await sharedPage.locator('button:visible', { hasText: 'Promote' }).first().click();
    await expect(sharedPage.locator('button:visible', { hasText: 'Promote' })).toHaveCount(1);

    await sharedPage.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await expect(sharedPage.locator('div:visible', { hasText: 'Northstar SaaS' }).first()).toBeVisible({ timeout: 8_000 });
    await expect(sharedPage.getByRole('button', { name: /VP Operations Northstar SaaS/i })).toBeVisible({ timeout: 8_000 });
  });

  test('Job Search watchlist manager adds a company cleanly in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);

    await sharedPage.locator('button[title="Manage watchlist"]:visible').first().click();
    await expect(sharedPage.getByRole('dialog', { name: /Manage watchlist/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByPlaceholder('e.g. Acme Corp').fill('Signal Peak');
    await sharedPage.getByRole('button', { name: /Add Company/i }).click();

    await expect(
      sharedPage.getByRole('dialog', { name: /Manage watchlist/i }).getByText('Signal Peak', { exact: true }),
    ).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(sharedPage.getByRole('button', { name: 'Signal Peak', exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('Job Search watchlist manager updates priority and removes a company in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);

    await sharedPage.locator('button[title="Manage watchlist"]:visible').first().click();
    await expect(sharedPage.getByRole('dialog', { name: /Manage watchlist/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByPlaceholder('e.g. Acme Corp').fill('Northfield Systems');
    await sharedPage.getByRole('button', { name: /Add Company/i }).click();
    await expect(
      sharedPage.getByRole('dialog', { name: /Manage watchlist/i }).getByText('Northfield Systems', { exact: true }),
    ).toBeVisible({ timeout: 8_000 });

    const watchlistRow = sharedPage
      .getByRole('dialog', { name: /Manage watchlist/i })
      .locator('div[class*="rounded-xl"]')
      .filter({ hasText: 'Northfield Systems' })
      .first();

    await watchlistRow.locator('button').nth(0).click();
    await watchlistRow.locator('input[type="number"]').fill('5');
    await watchlistRow.locator('button').nth(0).click();

    await expect(watchlistRow.getByText('P5', { exact: true })).toBeVisible({ timeout: 8_000 });

    await watchlistRow.locator('button').last().click();
    await expect(
      sharedPage.getByRole('dialog', { name: /Manage watchlist/i }).getByText('Northfield Systems', { exact: true }),
    ).toHaveCount(0);
  });

  test('Job Search tracker analyzes one application in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: 'Daily Ops', exact: true }).click();
    await expect(sharedPage.getByRole('heading', { name: 'Application Tracker', exact: true })).toBeVisible({ timeout: 8_000 });

    await sharedPage
      .getByPlaceholder(/Paste your resume text here/i)
      .fill('Executive operator with experience aligning product, support, and operations leaders around one operating cadence.');
    await sharedPage.getByLabel(/Application 1 company/i).fill('Northstar SaaS');
    await sharedPage.getByLabel(/Application 1 role/i).fill('VP Operations');
    await sharedPage
      .getByLabel(/Application 1 job description/i)
      .fill('Lead executive alignment, operating cadence, and cross-functional execution across product, support, and delivery leaders.');

    await sharedPage.getByRole('button', { name: /Analyze 1 Application/i }).click();

    await expect(sharedPage.getByRole('heading', { name: 'Tracker Report', exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(sharedPage.getByText(/Northstar SaaS — strong fit/i)).toBeVisible({ timeout: 8_000 });
  });

  test('Job Search add-application flow submits cleanly in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=jobs');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: 'Pipeline', exact: true }).click();
    await expect(sharedPage.getByRole('heading', { name: /Application Pipeline/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /Add Application/i }).click();
    await expect(sharedPage.getByRole('dialog', { name: /Add opportunity/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByPlaceholder('e.g. VP Operations').fill('Director of Program Management');
    await sharedPage.getByPlaceholder('e.g. Acme Corp').fill('SignalWorks');
    await sharedPage.getByPlaceholder('https://...').fill('https://example.com/jobs/pm-director');
    await sharedPage.getByPlaceholder('Any notes about this role...').fill('Referral lead from former VP Product.');

    await sharedPage.getByRole('button', { name: /Add to Pipeline/i }).click();

    await expect(sharedPage.getByRole('dialog', { name: /Add opportunity/i })).toHaveCount(0);
    await expect(sharedPage.getByRole('button', { name: /Director of Program Management SignalWorks/i })).toBeVisible({
      timeout: 8_000,
    });
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

  test('Interview Prep generates a prep report in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=interview');
    await assertNoCrash(sharedPage);

    await expect(sharedPage.getByRole('button', { name: /Generate Interview Prep/i }).first()).toBeVisible({
      timeout: 8_000,
    });
    await sharedPage.getByRole('button', { name: /Generate Interview Prep/i }).first().click();

    await expect(sharedPage.getByRole('heading', { name: /Interview Prep Report/i })).toBeVisible({ timeout: 8_000 });
    await expect(
      sharedPage.getByText(/Lead with executive operating cadence and cross-functional alignment\./i),
    ).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /Back to Interview Prep/i }).first().click();
    await expect(sharedPage.getByRole('heading', { name: 'Interview Prep', exact: true }).first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('Interview Prep follow-up saves a debrief in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=interview');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: /^Next Steps /i }).click();
    await expect(sharedPage.getByRole('heading', { name: /Interview History/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /Add Debrief/i }).click();
    await expect(sharedPage.getByRole('heading', { name: /Post-Interview Debrief/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByPlaceholder('Company name').fill('Northstar SaaS');
    await sharedPage.getByPlaceholder(/VP of Supply Chain/i).fill('VP Operations');
    await sharedPage.getByRole('button', { name: 'Positive', exact: true }).click();
    await sharedPage.getByRole('button', { name: /Save Debrief/i }).click();

    await expect(sharedPage.getByText(/Debrief saved\./i)).toBeVisible({ timeout: 8_000 });
    await sharedPage.getByRole('button', { name: /Back to Interview Prep/i }).click();

    await sharedPage.getByRole('button', { name: /^Next Steps /i }).click();
    await expect(sharedPage.getByRole('button', { name: /Add Debrief/i })).toContainText('1');
  });

  test('Interview Prep next-step documents open cleanly in the signed-in shell', async () => {
    await openWorkspaceRoom(sharedPage, '/workspace?room=interview');
    await assertNoCrash(sharedPage);

    await sharedPage.getByRole('button', { name: /^Next Steps /i }).click();
    await expect(sharedPage.getByText(/Close the loop without breaking the narrative/i)).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /Open Thank You Note/i }).first().click();
    await expect(sharedPage.getByRole('heading', { name: /Thank You Note Writer/i })).toBeVisible({ timeout: 8_000 });

    await sharedPage.getByRole('button', { name: /Open Negotiation Prep/i }).first().click();
    await expect(
      sharedPage.getByRole('heading', { name: /Build one clear compensation strategy before you respond/i }),
    ).toBeVisible({ timeout: 8_000 });
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
