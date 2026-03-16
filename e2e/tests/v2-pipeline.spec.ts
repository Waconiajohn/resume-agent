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
 *   5. Cards render progressively (single-column streaming mode)
 *   6. Once resume exists → split-screen layout (left: requirements, right: resume)
 *   7. Pipeline completes → export bar visible in right panel
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
      { competency: 'Compliance Frameworks', importance: 'important', evidence_from_jd: 'SOC 2 and HIPAA compliance' },
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
      { area: 'AWS Architecture', description: 'Deep AWS expertise with multi-service integration', typical_metrics: 'Certified, 100+ services' },
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
      { requirement: 'AWS Architecture', importance: 'must_have', classification: 'strong', evidence: ['AWS SA Professional', 'EC2, ECS, EKS, Lambda'] },
      { requirement: 'Kubernetes', importance: 'must_have', classification: 'partial', evidence: ['CKA certified'], strategy: { real_experience: 'CKA + production K8s', positioning: 'Position Kubernetes platform as enterprise-scale orchestration' } },
      { requirement: 'Compliance Frameworks', importance: 'important', classification: 'missing', evidence: [], strategy: { real_experience: 'Zero-trust networking, container scanning', positioning: 'Security-first approach aligns with compliance mindset', inferred_metric: 'SOC 2 readiness', inference_rationale: 'Security practices indicate compliance awareness' } },
    ],
    coverage_score: 78,
    strength_summary: 'Strong cloud infrastructure background with relevant AWS and Kubernetes experience.',
    critical_gaps: ['Compliance framework knowledge (SOC 2, HIPAA, PCI-DSS)'],
    pending_strategies: [
      { requirement: 'Compliance Frameworks', strategy: { real_experience: 'Zero-trust networking', positioning: 'Security-first approach', inferred_metric: 'SOC 2 readiness', inference_rationale: 'Security practices' } },
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
      { content: 'Led migration of 60+ legacy applications to AWS, reducing hosting costs by 35%', is_new: false, addresses_requirements: ['AWS Architecture'] },
    ],
    professional_experience: [
      {
        company: 'Nimbus Technologies',
        title: 'Director of Cloud Infrastructure',
        start_date: '2020',
        end_date: 'Present',
        scope_statement: 'Led 14-engineer cloud infrastructure team supporting 200+ microservices',
        bullets: [
          { text: 'Spearheaded enterprise-wide cloud migration of 60+ applications to AWS, achieving 35% cost reduction', is_new: false, addresses_requirements: ['AWS Architecture'] },
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
        { content: 'Led migration of 60+ legacy applications to AWS, reducing hosting costs by 35%', is_new: false, addresses_requirements: ['AWS Architecture'] },
      ],
      professional_experience: [
        {
          company: 'Nimbus Technologies',
          title: 'Director of Cloud Infrastructure',
          start_date: '2020',
          end_date: 'Present',
          scope_statement: 'Led 14-engineer cloud infrastructure team',
          bullets: [
            { text: 'Spearheaded cloud migration of 60+ applications, achieving 35% cost reduction', is_new: false, addresses_requirements: ['AWS Architecture'] },
            { text: 'Architected Kubernetes-based platform processing 50M+ daily API requests', is_new: false, addresses_requirements: ['Kubernetes'] },
          ],
        },
      ],
      education: [{ degree: 'B.S. Computer Science', institution: 'Oregon State University', year: '2012' }],
      certifications: ['AWS Solutions Architect – Professional', 'CKA', 'Terraform Associate'],
      earlier_career: [{ title: 'Systems Engineer', company: 'DataFlow Inc.', dates: '2012 – 2016' }],
    },
    positioning_assessment: {
      requirement_map: [
        { requirement: 'AWS Architecture', status: 'strong', addressed_by: [{ section: 'professional_experience', bullet_text: 'Spearheaded cloud migration of 60+ applications' }] },
        { requirement: 'Kubernetes', status: 'repositioned', addressed_by: [{ section: 'professional_experience', bullet_text: 'Architected Kubernetes-based platform processing 50M+' }], strategy_used: 'Position Kubernetes platform as enterprise-scale orchestration' },
        { requirement: 'Compliance Frameworks', status: 'gap', addressed_by: [] },
      ],
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

/** Helper: submit intake form and wait for pipeline to complete (split-screen visible) */
async function runPipelineToCompletion(page: Page) {
  await mockV2PipelineNetwork(page);
  await page.goto('/app');
  await waitForAuthenticatedShell(page);
  await page.getByRole('button', { name: /Start New Session/i }).click();
  await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
  await page.locator('#v2-jd').fill(REAL_JD_TEXT);
  await page.getByRole('button', { name: /Analyze and craft my resume/i }).click();
  // Wait for split-screen: resume heading + requirements checklist visible
  await expect(page.getByRole('heading', { name: 'Sarah Mitchell' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Requirements Checklist')).toBeVisible({ timeout: 5_000 });
  // Wait for pipeline_complete to fire (sets isComplete → canEdit)
  await expect(page.getByText(/Click any bullet to edit with AI/i)).toBeVisible({ timeout: 5_000 });
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
    await expect(page.getByRole('button', { name: /Analyze and craft my resume/i })).toBeVisible();
  });

  test('submit button is disabled when fields are too short', async ({ page }) => {
    await mockV2PipelineNetwork(page);
    await page.goto('/app');
    await waitForAuthenticatedShell(page);
    await page.getByRole('button', { name: /Start New Session/i }).click();

    const goButton = page.getByRole('button', { name: /Analyze and craft my resume/i });
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

    const goButton = page.getByRole('button', { name: /Analyze and craft my resume/i });

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
    await page.getByRole('button', { name: /Analyze and craft my resume/i }).click();

    // After submit, the intake form should disappear and streaming display should appear.
    // The header bar shows "Senior Cloud Architect at TechVision Solutions"
    await expect(page.getByText('Senior Cloud Architect at TechVision Solutions')).toBeVisible({ timeout: 15_000 });
  });

  test('pipeline completes and enters split-screen layout', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Split-screen: left panel has requirements checklist
    await expect(page.getByText('Requirements Checklist')).toBeVisible();
    // Left panel shows role info
    await expect(page.getByText('Senior Cloud Architect').first()).toBeVisible();

    // Right panel has the resume document
    await expect(page.getByRole('heading', { name: 'Sarah Mitchell' })).toBeVisible();
    await expect(page.getByText('Cloud Architecture & Platform Engineering Leader')).toBeVisible();

    // Scores appear in the top bar after assembly_complete
    await expect(page.getByText('Match: 85%')).toBeVisible({ timeout: 5_000 });
  });

  test('pipeline completion shows export bar and New Resume button', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Wait for completion banner
    await expect(page.getByText(/Your resume is ready/i)).toBeVisible({ timeout: 10_000 });

    // "New Resume" button appears in the top bar after completion
    await expect(page.getByRole('button', { name: /New Resume/i })).toBeVisible({ timeout: 5_000 });

    // Export bar should be present — DOCX button
    await expect(page.getByRole('button', { name: /DOCX/i })).toBeVisible({ timeout: 5_000 });
  });

  test('New Resume button resets to intake form', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Wait for completion
    await expect(page.getByText(/Your resume is ready/i)).toBeVisible({ timeout: 10_000 });

    // Click "New Resume"
    await page.getByRole('button', { name: /New Resume/i }).click();

    // Intake form should reappear
    await expect(page.locator('#v2-resume')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#v2-jd')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('V2 Pipeline: requirements checklist (split-screen)', () => {
  test('left panel shows requirements grouped by importance', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Must Have group header
    await expect(page.getByText('Must Have').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('AWS Architecture').first()).toBeVisible();
    await expect(page.getByText('Kubernetes').first()).toBeVisible();

    // Important group
    await expect(page.getByText('Important').first()).toBeVisible();
    await expect(page.getByText('Compliance Frameworks').first()).toBeVisible();
  });

  test('requirements show correct status from positioning assessment', async ({ page }) => {
    await runPipelineToCompletion(page);

    // The positioning assessment has: AWS=strong, Kubernetes=repositioned, Compliance=gap
    // Status line for strong match: "Addressed by: ..."
    await expect(page.getByText(/Addressed by:/i).first()).toBeVisible({ timeout: 5_000 });

    // Status line for repositioned: "Repositioned: ..."
    await expect(page.getByText(/Repositioned:/i).first()).toBeVisible({ timeout: 5_000 });

    // Status line for gap: "GAP — Not addressed"
    await expect(page.getByText(/GAP.*Not addressed/i)).toBeVisible({ timeout: 5_000 });
  });

  test('progress bar shows addressed count', async ({ page }) => {
    await runPipelineToCompletion(page);

    // 2 of 3 requirements addressed (1 strong + 1 repositioned)
    await expect(page.getByText(/2 of 3 requirements addressed/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('V2 Pipeline: inline bullet editing', () => {
  test('clicking a bullet shows inline edit panel with action buttons', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Find a bullet with role="button" (clickable in edit mode)
    const bullets = page.locator('[role="button"]').filter({ hasText: /Spearheaded cloud migration/i });
    await expect(bullets.first()).toBeVisible({ timeout: 5_000 });

    // Click the bullet
    await bullets.first().click();

    // Inline edit panel should appear with action buttons
    await expect(page.getByRole('button', { name: 'Strengthen' })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: '+ Metrics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rewrite' })).toBeVisible();
  });

  test('inline edit panel shows requirement tags for bullets that address requirements', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Click a bullet that addresses "AWS Architecture"
    const bullet = page.locator('[role="button"]').filter({ hasText: /Spearheaded cloud migration/i });
    await bullet.first().click();

    // Should show "Addresses:" label and the requirement tag
    await expect(page.getByText('Addresses:')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('.rounded-full').filter({ hasText: 'AWS Architecture' })).toBeVisible();
  });

  test('clicking Escape closes inline edit panel', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Click a bullet to open inline edit panel
    const bullet = page.locator('[role="button"]').filter({ hasText: /Spearheaded cloud migration/i });
    await bullet.first().click();
    await expect(page.getByRole('button', { name: 'Strengthen' })).toBeVisible({ timeout: 3_000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Inline edit panel should close
    await expect(page.getByRole('button', { name: 'Strengthen' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('clicking an edit action calls the API and shows suggestion', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Mock the edit endpoint
    await page.route('**/api/pipeline/*/edit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ replacement: 'IMPROVED: Led enterprise-wide cloud transformation of 60+ mission-critical applications.' }),
      });
    });

    // Click a bullet
    const bullet = page.locator('[role="button"]').filter({ hasText: /Spearheaded cloud migration/i });
    await bullet.first().click();

    // Click "Strengthen"
    await page.getByRole('button', { name: 'Strengthen' }).click();

    // Suggestion should appear in the inline panel
    await expect(page.getByText('IMPROVED:')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Suggested')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' }).first()).toBeVisible();
  });
});

test.describe('V2 Pipeline: text selection editing (split-screen)', () => {
  /** Helper: programmatically select text and trigger mouseup */
  async function selectResumeText(page: Page, selector: string, charCount = 30) {
    await page.locator(selector).first().scrollIntoViewIfNeeded();

    await page.evaluate(({ sel, count }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Element not found: ${sel}`);
      let textNode: Node | null = null;
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        if ((walk.currentNode.textContent?.trim().length ?? 0) > 5) {
          textNode = walk.currentNode;
          break;
        }
      }
      if (!textNode) throw new Error('No suitable text node found');

      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(count, textNode.textContent?.length ?? 0));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, { sel: selector, count: charCount });
  }

  test('selecting resume text shows the inline edit toolbar', async ({ page }) => {
    await runPipelineToCompletion(page);

    // In split-screen, the hint text is different
    await expect(page.getByText('Click any bullet to edit with AI')).toBeVisible({ timeout: 5_000 });

    await selectResumeText(page, '[data-section="executive_summary"] p');

    const toolbar = page.getByRole('toolbar', { name: /AI editing actions/i });
    await expect(toolbar).toBeVisible({ timeout: 3_000 });
    await expect(toolbar.getByTitle('Strengthen')).toBeVisible();
    await expect(toolbar.getByTitle('Rewrite')).toBeVisible();
    await expect(toolbar.getByTitle('Not my voice')).toBeVisible();
  });

  test('accepting a text-selection edit updates the resume text', async ({ page }) => {
    await runPipelineToCompletion(page);

    await page.route('**/api/pipeline/*/edit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ replacement: 'UPGRADED executive summary text here.' }),
      });
    });

    await selectResumeText(page, '[data-section="executive_summary"] p');
    const toolbar = page.getByRole('toolbar', { name: /AI editing actions/i });
    await expect(toolbar).toBeVisible({ timeout: 3_000 });
    await toolbar.getByTitle('Rewrite').click();

    // Wait for diff to appear (DiffView shows when no activeBullet)
    await expect(page.getByText('UPGRADED executive summary')).toBeVisible({ timeout: 10_000 });

    // Accept the edit
    const acceptBtn = page.getByRole('button', { name: 'Accept edit' });
    await expect(acceptBtn).toBeVisible({ timeout: 3_000 });
    await acceptBtn.click();

    // The updated text should now appear in the resume document
    await expect(page.locator('[data-section="executive_summary"]').getByText('UPGRADED executive summary')).toBeVisible({ timeout: 5_000 });

    // Undo button should appear
    await expect(page.getByRole('button', { name: /undo/i })).toBeVisible({ timeout: 3_000 });
  });

  test('edit API error shows error message', async ({ page }) => {
    await runPipelineToCompletion(page);

    // Mock edit endpoint to return an error
    await page.route('**/api/pipeline/*/edit', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'LLM provider timeout' }),
      });
    });

    await selectResumeText(page, '[data-section="executive_summary"] p');
    const toolbar = page.getByRole('toolbar', { name: /AI editing actions/i });
    await expect(toolbar).toBeVisible({ timeout: 3_000 });
    await toolbar.getByTitle('Strengthen').click();

    // Error message should appear
    await expect(page.getByText('LLM provider timeout')).toBeVisible({ timeout: 10_000 });
  });
});
