/**
 * V2 Resume Pipeline — E2E smoke tests
 *
 * Tests the v2 pipeline UI flow with mocked API responses and simulated SSE.
 * Does NOT require a running backend — all network requests are intercepted.
 *
 * Flow:
 *   1. Navigate to /app → click "Start New Session"
 *   2. V2IntakeForm renders → fill resume + JD → submit
 *   3. POST /api/pipeline/start → returns session_id
 *   4. GET /api/pipeline/:sessionId/stream → SSE events stream in
 *   5. Cards render progressively as events arrive
 *   6. Pipeline completes → export bar visible
 */

import { test, expect, type Page } from '@playwright/test';
import { REAL_RESUME_TEXT, REAL_JD_TEXT } from '../fixtures/real-resume-data';

// ── Mock SSE event sequence ──────────────────────────────────────────

const MOCK_SESSION_ID = 'v2-test-session-123';

// Mock events must match the exact types in app/src/types/resume-v2.ts
const MOCK_SSE_EVENTS = [
  // ─── Analysis stage ───
  { type: 'stage_start', stage: 'analysis', message: 'Analyzing job description...' },
  { type: 'job_intelligence', data: {
    company_name: 'TechVision Solutions',
    role_title: 'Senior Cloud Architect',
    seniority_level: 'Senior',
    core_competencies: [
      { competency: 'AWS Architecture', importance: 'must_have', evidence_from_jd: 'Deep expertise in AWS required' },
      { competency: 'Kubernetes', importance: 'must_have', evidence_from_jd: 'Container orchestration at scale' },
    ],
    strategic_responsibilities: ['Define cloud architecture strategy', 'Lead architecture reviews'],
    business_problems: ['Multi-cloud platform reliability', 'Compliance requirements'],
    cultural_signals: ['Fast-growing', 'Fortune 500 clients'],
    hidden_hiring_signals: ['$8M cloud spend suggests scale'],
    language_keywords: ['cloud architecture', 'AWS', 'Kubernetes', 'Terraform', 'SOC 2'],
    industry: 'Enterprise SaaS',
  }},
  { type: 'stage_complete', stage: 'analysis', message: 'Job analysis complete', duration_ms: 2100 },
  { type: 'candidate_intelligence', data: {
    contact: { name: 'Sarah Mitchell', email: 'sarah.mitchell@email.com', phone: '(503) 555-0147', linkedin: 'linkedin.com/in/sarahmitchell', location: 'Portland, OR' },
    career_themes: ['Cloud infrastructure', 'Team leadership', 'Migration at scale'],
    leadership_scope: 'Led 14-engineer team, $4.2M budget',
    quantified_outcomes: [
      { outcome: 'Reduced hosting costs', metric_type: 'money', value: '35%' },
      { outcome: 'Reduced P1 incidents', metric_type: 'volume', value: '42%' },
    ],
    industry_depth: ['Enterprise SaaS', 'Cloud infrastructure'],
    technologies: ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'Jenkins'],
    operational_scale: '200+ microservices, 50M+ daily API requests',
    career_span_years: 12,
    experience: [
      { company: 'Nimbus Technologies', title: 'Director of Cloud Infrastructure', start_date: '2020', end_date: 'Present', bullets: ['Led team of 14', 'Migrated 60+ apps to AWS'], inferred_scope: { team_size: '14', budget: '$4.2M' } },
      { company: 'CloudScale Systems', title: 'Senior DevOps Engineer', start_date: '2016', end_date: '2020', bullets: ['Designed CI/CD for 30+ teams'] },
    ],
    education: [{ degree: 'B.S. Computer Science', institution: 'Oregon State University', year: '2012' }],
    certifications: ['AWS Solutions Architect – Professional', 'CKA', 'Terraform Associate'],
    hidden_accomplishments: ['Cross-functional partnership with CISO on zero-trust'],
  }},
  { type: 'stage_complete', stage: 'analysis', message: 'Candidate analysis complete', duration_ms: 1800 },
  { type: 'benchmark_candidate', data: {
    ideal_profile_summary: 'A senior cloud architect with 10+ years leading multi-cloud infrastructure at enterprise scale.',
    expected_achievements: [
      { area: 'Cloud Migration', description: 'Led large-scale migration', typical_metrics: '$5M+ budget, 100+ applications' },
    ],
    expected_leadership_scope: '5+ engineering teams, 40+ engineers',
    expected_industry_knowledge: ['Financial services', 'Healthcare compliance'],
    expected_technical_skills: ['AWS', 'Azure', 'Kubernetes', 'Terraform', 'Istio'],
    expected_certifications: ['AWS Solutions Architect Professional'],
    differentiators: ['Multi-cloud architecture', 'Compliance framework expertise'],
  }},

  // ─── Strategy stage ───
  { type: 'stage_start', stage: 'strategy', message: 'Building positioning strategy...' },
  { type: 'gap_analysis', data: {
    requirements: [
      { requirement: 'AWS expertise', importance: 'must_have', classification: 'strong', evidence: ['AWS SA Professional', 'EC2, ECS, EKS, Lambda'] },
      { requirement: 'Multi-cloud experience', importance: 'important', classification: 'partial', evidence: ['GCP basic'], strategy: { real_experience: 'Has GCP exposure', positioning: 'Position hybrid cloud experience as multi-cloud readiness' } },
      { requirement: 'Compliance frameworks', importance: 'must_have', classification: 'missing', evidence: [], strategy: { real_experience: 'Zero-trust networking, container scanning', positioning: 'Security-first approach aligns with compliance mindset', inferred_metric: 'SOC 2 readiness', inference_rationale: 'Security practices indicate compliance awareness' } },
    ],
    coverage_score: 78,
    strength_summary: 'Strong cloud infrastructure background with relevant AWS and Kubernetes experience.',
    critical_gaps: ['Compliance framework knowledge (SOC 2, HIPAA, PCI-DSS)'],
    pending_strategies: [
      { requirement: 'Compliance frameworks', strategy: { real_experience: 'Zero-trust networking', positioning: 'Security-first approach', inferred_metric: 'SOC 2 readiness', inference_rationale: 'Security practices' } },
    ],
  }},
  { type: 'narrative_strategy', data: {
    primary_narrative: 'Infrastructure leader who scales platforms for mission-critical enterprises',
    supporting_themes: ['Enterprise cloud migration at scale', 'Security-first infrastructure'],
    branded_title: 'Cloud Architecture & Platform Engineering Leader',
    why_me_story: 'Your track record of migrating 60+ applications and managing $4.2M budgets demonstrates the exact scale TechVision needs.',
    why_me_concise: 'Enterprise cloud leader with proven scale.',
    why_me_best_line: 'The engineer who built the platform TechVision needs already exists.',
    section_guidance: {
      summary_angle: 'Lead with enterprise scale and security',
      competency_themes: ['Cloud Architecture', 'AWS', 'Kubernetes'],
      accomplishment_priorities: ['Cloud migration', 'Platform scale'],
      experience_framing: { 'Nimbus Technologies': 'Enterprise infrastructure transformation' },
    },
  }},
  { type: 'stage_complete', stage: 'strategy', message: 'Strategy complete', duration_ms: 2800 },

  // ─── Writing stage ───
  { type: 'stage_start', stage: 'writing', message: 'Writing your resume...' },
  { type: 'resume_draft', data: {
    header: {
      name: 'Sarah Mitchell',
      branded_title: 'Cloud Architecture & Platform Engineering Leader',
      email: 'sarah.mitchell@email.com',
      phone: '(503) 555-0147',
      linkedin: 'linkedin.com/in/sarahmitchell',
    },
    executive_summary: {
      content: 'Enterprise cloud architect with 12+ years driving infrastructure transformation for high-growth technology companies.',
      is_new: false,
    },
    core_competencies: ['Cloud Architecture', 'AWS', 'Kubernetes', 'Terraform', 'Team Leadership', 'FinOps', 'CI/CD', 'SRE'],
    selected_accomplishments: [
      { content: 'Led migration of 60+ legacy applications to AWS, reducing hosting costs by 35%', is_new: false, addresses_requirements: ['AWS expertise'] },
    ],
    professional_experience: [
      {
        company: 'Nimbus Technologies',
        title: 'Director of Cloud Infrastructure',
        start_date: '2020',
        end_date: 'Present',
        scope_statement: 'Led 14-engineer cloud infrastructure team supporting 200+ microservices',
        bullets: [
          { text: 'Spearheaded enterprise-wide cloud migration of 60+ applications to AWS, achieving 35% cost reduction', is_new: false, addresses_requirements: ['AWS expertise'] },
          { text: 'Architected Kubernetes-based platform processing 50M+ daily API requests with 99.99% availability', is_new: false, addresses_requirements: ['Kubernetes'] },
        ],
      },
      {
        company: 'CloudScale Systems',
        title: 'Senior DevOps Engineer',
        start_date: '2016',
        end_date: '2020',
        scope_statement: 'Designed CI/CD pipeline architecture for 30+ development teams',
        bullets: [
          { text: 'Reduced deployment cycles from 45 to 8 minutes through pipeline optimization', is_new: false, addresses_requirements: [] },
        ],
      },
    ],
    education: [{ degree: 'B.S. Computer Science', institution: 'Oregon State University', year: '2012' }],
    certifications: ['AWS Solutions Architect – Professional', 'CKA', 'Terraform Associate'],
    earlier_career: [{ title: 'Systems Engineer', company: 'DataFlow Inc.', dates: '2012 – 2016' }],
  }},
  { type: 'stage_complete', stage: 'writing', message: 'Resume draft complete', duration_ms: 8000 },

  // ─── Verification stage ───
  { type: 'stage_start', stage: 'verification', message: 'Verifying accuracy...' },
  { type: 'verification_complete' },
  { type: 'stage_complete', stage: 'verification', message: 'Verification complete', duration_ms: 3500 },

  // ─── Assembly stage ───
  { type: 'stage_start', stage: 'assembly', message: 'Final assembly...' },
  { type: 'assembly_complete', data: {
    final_resume: {
      header: {
        name: 'Sarah Mitchell',
        branded_title: 'Cloud Architecture & Platform Engineering Leader',
        email: 'sarah.mitchell@email.com',
        phone: '(503) 555-0147',
        linkedin: 'linkedin.com/in/sarahmitchell',
      },
      executive_summary: {
        content: 'Enterprise cloud architect with 12+ years driving infrastructure transformation.',
        is_new: false,
      },
      core_competencies: ['Cloud Architecture', 'AWS', 'Kubernetes', 'Terraform', 'Team Leadership', 'FinOps', 'CI/CD', 'SRE'],
      selected_accomplishments: [
        { content: 'Led migration of 60+ legacy applications to AWS, reducing hosting costs by 35%', is_new: false, addresses_requirements: ['AWS expertise'] },
      ],
      professional_experience: [
        {
          company: 'Nimbus Technologies',
          title: 'Director of Cloud Infrastructure',
          start_date: '2020',
          end_date: 'Present',
          scope_statement: 'Led 14-engineer cloud infrastructure team',
          bullets: [{ text: 'Spearheaded cloud migration of 60+ applications, achieving 35% cost reduction', is_new: false, addresses_requirements: [] }],
        },
      ],
      education: [{ degree: 'B.S. Computer Science', institution: 'Oregon State University', year: '2012' }],
      certifications: ['AWS Solutions Architect – Professional', 'CKA', 'Terraform Associate'],
      earlier_career: [{ title: 'Systems Engineer', company: 'DataFlow Inc.', dates: '2012 – 2016' }],
    },
    scores: { ats_match: 85, truth: 92, tone: 88 },
    quick_wins: [
      { description: 'Add multi-cloud keywords to competencies', impact: 'high' },
    ],
  }},
  { type: 'stage_complete', stage: 'assembly', message: 'Assembly complete', duration_ms: 1200 },
  { type: 'pipeline_complete', session_id: MOCK_SESSION_ID },
];

// ── Network mock helpers ─────────────────────────────────────────────

async function mockV2PipelineNetwork(page: Page): Promise<void> {
  // Override fetch for SSE stream requests before navigation
  await page.addInitScript(`
    window.__v2MockEvents = ${JSON.stringify(MOCK_SSE_EVENTS)};
    window.__v2MockSessionId = '${MOCK_SESSION_ID}';

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

      // Intercept SSE stream for v2 pipeline
      if (url.includes('/api/pipeline/') && url.includes('/stream')) {
        const encoder = new TextEncoder();
        let eventIndex = 0;
        const events = window.__v2MockEvents;
        const stream = new ReadableStream({
          start(controller) {
            function pushNext() {
              if (eventIndex >= events.length) {
                controller.close();
                return;
              }
              const evt = events[eventIndex++];
              const data = JSON.stringify(evt);
              controller.enqueue(encoder.encode('event: pipeline\\ndata: ' + data + '\\n\\n'));
              // Stagger events 100ms apart for realistic streaming feel
              setTimeout(pushNext, 100);
            }
            // Start after a brief delay to simulate network
            setTimeout(pushNext, 200);
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      // Intercept old SSE (coach sessions)
      if (url.includes('/sse')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('event: connected\\ndata: {}\\n\\n'));
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      return originalFetch.apply(window, [input, init]);
    };
  `);

  // Mock Supabase
  await page.route('**/supabase.co/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'v2-test-user', email: 'jjschrup@yahoo.com' }) });
      return;
    }
    if (url.includes('/auth/v1/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'v2-test-token', token_type: 'bearer', expires_in: 3600, user: { id: 'v2-test-user', email: 'jjschrup@yahoo.com' } }) });
      return;
    }
    if (url.includes('/auth/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (url.includes('/rest/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.continue();
  });

  // Mock backend API
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    // Pipeline start
    if (path === '/api/pipeline/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: MOCK_SESSION_ID, status: 'started' }),
      });
      return;
    }

    // Pipeline SSE stream — handled by fetch override
    if (path.includes('/stream')) {
      await route.abort();
      return;
    }

    // Sessions
    if (path === '/api/sessions' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
      return;
    }
    if (path === '/api/sessions' && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'smoke-session', status: 'active', created_at: new Date().toISOString() } }) });
      return;
    }

    // Resumes
    if (path.startsWith('/api/resumes') && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
      return;
    }

    // Catch-all
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function waitForAuthenticatedShell(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: /CareerIQ/i })).toBeVisible({ timeout: 15_000 });
}

// ── Tests ────────────────────────────────────────────────────────────

test.describe('V2 Pipeline: intake form', () => {
  test('renders intake form with resume and JD fields', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    // Click "Start New Session" to enter v2 pipeline
    await page.getByRole('button', { name: /Start New Session/i }).click();

    // V2IntakeForm should be visible
    await expect(page.locator('#v2-resume')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#v2-jd')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Go/i })).toBeVisible();
  });

  test('submit button is disabled when fields are too short', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);
    await page.getByRole('button', { name: /Start New Session/i }).click();

    const goButton = page.getByRole('button', { name: /Go/i });
    await expect(goButton).toBeDisabled();

    // Type less than 50 chars in resume
    await page.locator('#v2-resume').fill('Short resume text');
    await page.locator('#v2-jd').fill('Short JD text');
    await expect(goButton).toBeDisabled();
  });

  test('submit button enables when both fields have 50+ chars', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);
    await page.getByRole('button', { name: /Start New Session/i }).click();

    const goButton = page.getByRole('button', { name: /Go/i });

    // Fill with enough content
    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await expect(goButton).toBeEnabled();
  });
});

test.describe('V2 Pipeline: SSE streaming flow', () => {
  test('submitting intake form triggers pipeline and streams events', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    // Navigate to v2 intake
    await page.getByRole('button', { name: /Start New Session/i }).click();
    await expect(page.locator('#v2-resume')).toBeVisible({ timeout: 5_000 });

    // Fill form and submit
    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await page.getByRole('button', { name: /Go/i }).click();

    // After submit, the intake form should disappear and streaming display should appear.
    // The header bar shows "Senior Cloud Architect at TechVision Solutions"
    await expect(page.getByText('Senior Cloud Architect at TechVision Solutions')).toBeVisible({ timeout: 15_000 });
  });

  test('pipeline cards render progressively from SSE events', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /Start New Session/i }).click();
    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await page.getByRole('button', { name: /Go/i }).click();

    // Wait for pipeline to complete — all mock events stream in ~2.5s (25 events × 100ms)
    // The pipeline_complete event triggers isComplete=true

    // Gap Analysis card should render with coverage score
    await expect(page.getByText('Coverage: 78%')).toBeVisible({ timeout: 10_000 });

    // Gap classifications should show
    await expect(page.getByText('AWS expertise')).toBeVisible({ timeout: 5_000 });

    // Resume content should render — use the heading specifically
    await expect(page.getByRole('heading', { name: 'Sarah Mitchell' })).toBeVisible({ timeout: 5_000 });

    // Scores should appear after assembly_complete
    await expect(page.getByText('ATS: 85%')).toBeVisible({ timeout: 10_000 });
  });

  test('pipeline completion shows export bar and New Resume button', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /Start New Session/i }).click();
    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await page.getByRole('button', { name: /Go/i }).click();

    // Wait for completion
    await expect(page.getByText('ATS: 85%')).toBeVisible({ timeout: 15_000 });

    // "New Resume" button appears in the top bar after completion
    await expect(page.getByRole('button', { name: /New Resume/i })).toBeVisible({ timeout: 5_000 });

    // Export bar should be present — DOCX button
    await expect(page.getByRole('button', { name: /DOCX/i })).toBeVisible({ timeout: 5_000 });
  });

  test('New Resume button resets to intake form', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /Start New Session/i }).click();
    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await page.getByRole('button', { name: /Go/i }).click();

    // Wait for completion
    await expect(page.getByText('ATS: 85%')).toBeVisible({ timeout: 15_000 });

    // Click "New Resume"
    await page.getByRole('button', { name: /New Resume/i }).click();

    // Intake form should reappear
    await expect(page.locator('#v2-resume')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#v2-jd')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('V2 Pipeline: gap analysis interactions', () => {
  test('gap analysis shows strong/partial/missing classifications', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);

    await page.getByRole('button', { name: /Start New Session/i }).click();
    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.locator('#v2-jd').fill(REAL_JD_TEXT);
    await page.getByRole('button', { name: /Go/i }).click();

    // Wait for gap analysis
    await expect(page.getByText('Gap Analysis')).toBeVisible({ timeout: 10_000 });

    // Summary counts
    await expect(page.getByText('1 strong')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('1 partial')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('1 missing')).toBeVisible({ timeout: 5_000 });
  });
});
