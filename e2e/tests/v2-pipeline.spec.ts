/**
 * Resume Builder session smoke tests
 *
 * Verifies the current resume-v2 flow from the direct session route instead of
 * the retired `/app -> Start New Session` path. Network calls are mocked.
 */

import { expect, test, type Page } from '@playwright/test';
import { REAL_JD_TEXT, REAL_RESUME_TEXT } from '../fixtures/real-resume-data';

const MOCK_SESSION_ID = 'resume-v2-session-123';

const MOCK_SSE_EVENTS = [
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
  } },
  { type: 'candidate_intelligence', data: {
    contact: {
      name: 'Sarah Mitchell',
      email: 'sarah.mitchell@email.com',
      phone: '(503) 555-0147',
      linkedin: 'linkedin.com/in/sarahmitchell',
      location: 'Portland, OR',
    },
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
      {
        company: 'Nimbus Technologies',
        title: 'Director of Cloud Infrastructure',
        start_date: '2020',
        end_date: 'Present',
        bullets: ['Led team of 14', 'Migrated 60+ apps to AWS'],
        inferred_scope: { team_size: '14', budget: '$4.2M' },
      },
      {
        company: 'CloudScale Systems',
        title: 'Senior DevOps Engineer',
        start_date: '2016',
        end_date: '2020',
        bullets: ['Designed CI/CD for 30+ teams'],
      },
    ],
    education: [{ degree: 'B.S. Computer Science', institution: 'Oregon State University', year: '2012' }],
    certifications: ['AWS Solutions Architect – Professional', 'CKA', 'Terraform Associate'],
    hidden_accomplishments: ['Cross-functional partnership with CISO on zero-trust'],
  } },
  { type: 'pre_scores', data: {
    ats_match: 24,
    keywords_found: ['AWS', 'Kubernetes', 'Terraform'],
    keywords_missing: ['SOC 2', 'HIPAA'],
    keyword_match_score: 24,
    overall_fit_score: 24,
  } },
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
  } },
  { type: 'stage_complete', stage: 'analysis', message: 'Analysis complete', duration_ms: 2100 },
  { type: 'stage_start', stage: 'strategy', message: 'Building positioning strategy...' },
  { type: 'gap_analysis', data: {
    requirements: [
      {
        requirement: 'AWS Architecture',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['AWS SA Professional', 'EC2, ECS, EKS, Lambda'],
      },
      {
        requirement: 'Kubernetes',
        importance: 'must_have',
        classification: 'partial',
        evidence: ['CKA certified'],
        strategy: {
          real_experience: 'CKA + production K8s',
          positioning: 'Position Kubernetes platform as enterprise-scale orchestration',
        },
      },
      {
        requirement: 'Compliance Frameworks',
        importance: 'important',
        classification: 'missing',
        evidence: [],
        strategy: {
          real_experience: 'Zero-trust networking, container scanning',
          positioning: 'Security-first approach aligns with compliance mindset',
        },
      },
    ],
    coverage_score: 78,
    strength_summary: 'Strong cloud infrastructure background with relevant AWS and Kubernetes experience.',
    critical_gaps: ['Compliance framework knowledge (SOC 2, HIPAA, PCI-DSS)'],
    pending_strategies: [
      {
        requirement: 'Compliance Frameworks',
        strategy: {
          real_experience: 'Zero-trust networking',
          positioning: 'Security-first approach',
        },
      },
    ],
  } },
  { type: 'pre_scores', data: {
    ats_match: 24,
    keywords_found: ['AWS', 'Kubernetes', 'Terraform'],
    keywords_missing: ['SOC 2', 'HIPAA'],
    keyword_match_score: 24,
    job_requirement_coverage_score: 67,
    overall_fit_score: 52,
  } },
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
  } },
  { type: 'stage_complete', stage: 'strategy', message: 'Strategy complete', duration_ms: 2400 },
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
      {
        content: 'Led migration of 60+ legacy applications to AWS, reducing hosting costs by 35%',
        is_new: false,
        addresses_requirements: ['AWS Architecture'],
      },
    ],
    professional_experience: [
      {
        company: 'Nimbus Technologies',
        title: 'Director of Cloud Infrastructure',
        start_date: '2020',
        end_date: 'Present',
        scope_statement: 'Led 14-engineer cloud infrastructure team supporting 200+ microservices',
        bullets: [
          {
            text: 'Spearheaded enterprise-wide cloud migration of 60+ applications to AWS, achieving 35% cost reduction',
            is_new: false,
            addresses_requirements: ['AWS Architecture'],
          },
          {
            text: 'Architected Kubernetes-based platform processing 50M+ daily API requests with 99.99% availability',
            is_new: false,
            addresses_requirements: ['Kubernetes'],
          },
        ],
      },
    ],
    education: [{ degree: 'B.S. Computer Science', institution: 'Oregon State University', year: '2012' }],
    certifications: ['AWS Solutions Architect – Professional', 'CKA', 'Terraform Associate'],
    earlier_career: [{ title: 'Systems Engineer', company: 'DataFlow Inc.', dates: '2012 – 2016' }],
  } },
  { type: 'stage_complete', stage: 'writing', message: 'Resume draft complete', duration_ms: 3200 },
  { type: 'stage_start', stage: 'verification', message: 'Verifying accuracy...' },
  { type: 'verification_complete' },
  { type: 'stage_complete', stage: 'verification', message: 'Verification complete', duration_ms: 1200 },
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
        {
          content: 'Led migration of 60+ legacy applications to AWS, reducing hosting costs by 35%',
          is_new: false,
          addresses_requirements: ['AWS Architecture'],
        },
      ],
      professional_experience: [
        {
          company: 'Nimbus Technologies',
          title: 'Director of Cloud Infrastructure',
          start_date: '2020',
          end_date: 'Present',
          scope_statement: 'Led 14-engineer cloud infrastructure team',
          bullets: [
            {
              text: 'Spearheaded cloud migration of 60+ applications, achieving 35% cost reduction',
              is_new: false,
              addresses_requirements: ['AWS Architecture'],
            },
            {
              text: 'Architected Kubernetes-based platform processing 50M+ daily API requests',
              is_new: false,
              addresses_requirements: ['Kubernetes'],
            },
          ],
        },
      ],
      education: [{ degree: 'B.S. Computer Science', institution: 'Oregon State University', year: '2012' }],
      certifications: ['AWS Solutions Architect – Professional', 'CKA', 'Terraform Associate'],
      earlier_career: [{ title: 'Systems Engineer', company: 'DataFlow Inc.', dates: '2012 – 2016' }],
    },
    positioning_assessment: {
      requirement_map: [
        {
          requirement: 'AWS Architecture',
          status: 'strong',
          addressed_by: [{ section: 'professional_experience', bullet_text: 'Spearheaded cloud migration of 60+ applications' }],
        },
        {
          requirement: 'Kubernetes',
          status: 'repositioned',
          addressed_by: [{ section: 'professional_experience', bullet_text: 'Architected Kubernetes-based platform processing 50M+' }],
          strategy_used: 'Position Kubernetes platform as enterprise-scale orchestration',
        },
        { requirement: 'Compliance Frameworks', status: 'gap', addressed_by: [] },
      ],
    },
    scores: { ats_match: 85, truth: 92, tone: 88 },
    quick_wins: [{ description: 'Add multi-cloud keywords to competencies', impact: 'high' }],
  } },
  { type: 'stage_complete', stage: 'assembly', message: 'Assembly complete', duration_ms: 1200 },
  { type: 'pipeline_complete', session_id: MOCK_SESSION_ID },
] as const;

async function mockResumeV2Network(page: Page): Promise<void> {
  await page.addInitScript((events: unknown[]) => {
    const originalFetch = window.fetch;
    // @ts-expect-error test override
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      if (url.includes('/api/pipeline/') && url.includes('/stream')) {
        const encoder = new TextEncoder();
        let index = 0;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            function pushNext() {
              if (index >= events.length) {
                controller.close();
                return;
              }
              const event = events[index++];
              controller.enqueue(encoder.encode(`event: pipeline\ndata: ${JSON.stringify(event)}\n\n`));
              window.setTimeout(pushNext, 60);
            }
            window.setTimeout(pushNext, 120);
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      if (url.includes('/sse')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
          },
        });
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      return originalFetch.apply(window, [input, init] as Parameters<typeof fetch>);
    };
  }, MOCK_SSE_EVENTS);

  await page.route('**/supabase.co/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'resume-v2-user', email: 'jjschrup@yahoo.com' }),
      });
      return;
    }

    if (url.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'resume-v2-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'resume-v2-user', email: 'jjschrup@yahoo.com' },
        }),
      });
      return;
    }

    if (url.includes('/auth/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    if (url.includes('/rest/v1/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: method === 'GET' ? '[]' : JSON.stringify([]),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path === '/api/pipeline/start' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: MOCK_SESSION_ID, status: 'started' }),
      });
      return;
    }

    if (path.includes('/stream')) {
      await route.abort();
      return;
    }

    if (/\/api\/pipeline\/[^/]+\/edit$/.test(path) && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          replacement: 'IMPROVED: Led enterprise-wide cloud transformation of 60+ mission-critical applications.',
        }),
      });
      return;
    }

    if (/\/api\/pipeline\/[^/]+\/draft-state$/.test(path) && method === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }

    if (path === '/api/sessions' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
      return;
    }

    if (path.startsWith('/api/resumes') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resumes: [] }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function openResumeBuilderSession(page: Page): Promise<void> {
  await mockResumeV2Network(page);
  await page.goto('/resume-builder/session');
  await expect(page.getByRole('heading', { name: /Build Your Tailored Resume/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Drop zone for resume file/i })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: /Drop zone for job description file/i })).toBeVisible({ timeout: 5_000 });
}

async function openPasteAreas(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Or paste text/i }).first().click();
  await page.getByRole('button', { name: /Or paste text/i }).first().click();
  await expect(page.locator('#v2-resume')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel(/Job description text/i)).toBeVisible({ timeout: 5_000 });
}

async function submitPipeline(page: Page): Promise<void> {
  await openPasteAreas(page);
  await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
  await page.getByLabel(/Job description text/i).fill(REAL_JD_TEXT);
  const submit = page.getByRole('button', { name: /Analyze and craft my resume/i });
  await expect(submit).toBeEnabled();
  await submit.click();
}

async function waitForPipelineCompletion(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /Build Your Tailored Resume/i })).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Senior Cloud Architect at TechVision Solutions')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /Your First Draft Is Ready|Your Resume Is Ready for Final Review/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Keyword & Key Phrasing Report')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Start Editing My Resume|Review Structure First/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^New Resume$/i })).toBeVisible({ timeout: 15_000 });
}

async function enterEditingWorkspace(page: Page): Promise<void> {
  const startEditing = page.getByRole('button', { name: /Start Editing My Resume|Review Structure First/i });
  await expect(startEditing).toBeVisible({ timeout: 15_000 });
  await startEditing.click();

  await expect(page.getByText('Match: 85%')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Run Final Review/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Export & Details/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Selected Accomplishments' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Resume Builder session flow', () => {
  test('renders the current intake form on the direct session route', async ({ page }) => {
    await openResumeBuilderSession(page);
    await expect(page.getByText(/Upload your resume and target job/i)).toBeVisible();
    await expect(page.getByText('Your Resume', { exact: true })).toBeVisible();
    await expect(page.getByText('Job Description', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/Job posting URL/i)).toBeVisible();
  });

  test('submit stays disabled until both inputs are ready', async ({ page }) => {
    await openResumeBuilderSession(page);
    await openPasteAreas(page);
    const submit = page.getByRole('button', { name: /Analyze and craft my resume/i });

    await expect(submit).toBeDisabled();
    await page.locator('#v2-resume').fill('Short resume');
    await page.getByLabel(/Job description text/i).fill('Short JD');
    await expect(submit).toBeDisabled();

    await page.locator('#v2-resume').fill(REAL_RESUME_TEXT);
    await page.getByLabel(/Job description text/i).fill(REAL_JD_TEXT);
    await expect(submit).toBeEnabled();
  });

  test('submitting starts the live resume-v2 session on the current route', async ({ page }) => {
    await openResumeBuilderSession(page);
    await submitPipeline(page);

    await expect(page.getByText('Senior Cloud Architect at TechVision Solutions')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Your First Draft Is Ready/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Keyword & Key Phrasing Report')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Start Editing My Resume|Review Structure First/i })).toBeVisible({ timeout: 15_000 });
  });

  test('completed session shows the current review and export surfaces', async ({ page }) => {
    await openResumeBuilderSession(page);
    await submitPipeline(page);
    await waitForPipelineCompletion(page);
    await enterEditingWorkspace(page);

    await expect(page.getByText('Match: 85%')).toBeVisible();
    await expect(page.getByText('Accuracy: 92%')).toBeVisible();
    await expect(page.getByText('Tone: 88%')).toBeVisible();
    await expect(page.getByRole('button', { name: /Export & Details/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run Final Review/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Download resume as DOCX/i })).toBeVisible();

    await page.getByRole('button', { name: /Export & Details/i }).click();
    await expect(page.getByRole('button', { name: /Download DOCX/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Download PDF/i })).toBeVisible();
  });

  test('New Resume resets the user back to the intake form', async ({ page }) => {
    await openResumeBuilderSession(page);
    await submitPipeline(page);
    await waitForPipelineCompletion(page);

    await page.getByRole('button', { name: /^New Resume$/i }).click();
    await expect(page.getByRole('heading', { name: /Build Your Tailored Resume/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Drop zone for resume file/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Drop zone for job description file/i })).toBeVisible({ timeout: 5_000 });
  });

  test('completed session keeps the current score and document surfaces visible', async ({ page }) => {
    await openResumeBuilderSession(page);
    await submitPipeline(page);
    await waitForPipelineCompletion(page);
    await enterEditingWorkspace(page);

    await expect(page.getByRole('heading', { name: 'Selected Accomplishments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Professional Experience' })).toBeVisible();
    await expect(page.getByText('Match: 85%')).toBeVisible();
    await expect(page.getByRole('button', { name: /Export & Details/i })).toBeVisible();
  });
});
