/**
 * Profile Setup flow tests
 *
 * Covers the 5-screen profile setup journey:
 *   intake → processing → interview → building → reveal
 * All backend calls are mocked so tests run fast and deterministically.
 */

import { expect, test, type Page } from '@playwright/test';
import { REAL_RESUME_TEXT } from '../fixtures/real-resume-data';

// ─── Mock data ──────────────────────────────────────────────────────────────────

const MOCK_SESSION_ID = 'profile-setup-session-abc';

const MOCK_INTAKE_ANALYSIS = {
  why_me_draft:
    'Sarah is a cloud infrastructure leader who scales engineering orgs and reduces costs through automation.',
  career_thread: 'Infrastructure → DevOps → Cloud Leadership',
  top_capabilities: [
    { capability: 'Cloud Migration', evidence: 'Migrated 60+ apps to AWS, cutting hosting costs 35%' },
    { capability: 'Team Leadership', evidence: 'Built and led a 14-person infra/DevOps team' },
  ],
  profile_gaps: ['No GCP depth', 'Limited public speaking mentions'],
  primary_concern: 'Transition from mid-market to enterprise scale',
  interview_questions: Array.from({ length: 8 }, (_, i) => ({
    question: `Interview question ${i + 1}: Tell me about a relevant experience.`,
    what_we_are_looking_for: `Looking for evidence of capability ${i + 1}`,
    references_resume_element: null,
    suggested_starters: ['The AWS migration', 'The Kubernetes rollout', 'Something else'],
  })),
  structured_experience: [
    {
      company: 'Nimbus Technologies',
      title: 'Director of Cloud Infrastructure',
      start_date: '2020',
      end_date: 'Present',
      location: 'Portland, OR',
      scope_statement: 'Led 14-person team managing $4.2M annual cloud budget across hybrid environments',
      original_bullets: [
        'Lead a team of 14 infrastructure and DevOps engineers',
        'Migrated 60+ legacy applications to AWS, reducing hosting costs by 35%',
      ],
    },
    {
      company: 'CloudScale Systems',
      title: 'Senior DevOps Engineer',
      start_date: '2016',
      end_date: '2020',
      location: 'Seattle, WA',
      scope_statement: 'Supported 30+ development teams with CI/CD infrastructure',
      original_bullets: [
        'Designed CI/CD pipelines using Jenkins and GitLab CI for 30+ teams',
        'Reduced deployment time from 45 minutes to 8 minutes',
      ],
    },
  ],
};

const MOCK_INTERVIEW_RESPONSE = {
  acknowledgment: 'Thank you for sharing that.',
  next_question: null,
  question_index: 1,
  complete: false,
};

const MOCK_PROFILE: Record<string, unknown> = {
  career_thread: 'From systems engineering to cloud-scale leadership',
  top_capabilities: [
    { capability: 'Cloud Migration', evidence: '60+ apps migrated', source: 'resume' },
    { capability: 'Team Scaling', evidence: '14-person team', source: 'interview' },
  ],
  signature_story: {
    situation: 'Company needed cloud migration',
    task: 'Lead the transition of 60+ apps',
    action: 'Built Kubernetes platform and trained teams',
    result: '35% cost reduction, 50M daily API requests',
    reflection: 'Proved large-scale migrations can be smooth',
  },
  honest_answer: {
    concern: 'No enterprise-scale experience',
    response: 'Mid-market complexity often exceeds enterprise, and Sarah has managed it.',
  },
  righteous_close: 'Hire Sarah because she ships infrastructure that scales.',
  why_me_final: {
    headline: 'Sarah turns infrastructure chaos into reliable platforms that teams love.',
    body: 'She migrated 60+ apps with zero downtime and grew her team from 5 to 14 in two years.',
  },
  target_roles: ['VP of Infrastructure', 'Head of Cloud Engineering'],
  created_at: new Date().toISOString(),
};

// ─── Mock helpers ───────────────────────────────────────────────────────────────

async function mockProfileSetupApis(page: Page) {
  // Mock Supabase auth
  await page.route('**/supabase.co/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'profile-user', email: 'test@example.com' }),
      });
      return;
    }

    if (url.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'profile-test-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'profile-user', email: 'test@example.com' },
        }),
      });
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

  // Single API handler — avoids LIFO route-priority issues
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;

    // Profile setup endpoints
    if (path.endsWith('/profile-setup/analyze')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: MOCK_SESSION_ID, intake: MOCK_INTAKE_ANALYSIS }),
      });
      return;
    }

    if (path.endsWith('/profile-setup/answer')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_INTERVIEW_RESPONSE),
      });
      return;
    }

    if (path.endsWith('/profile-setup/complete')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile: MOCK_PROFILE, master_resume_created: true, master_resume_id: 'mock-resume-id' }),
      });
      return;
    }

    // Other API endpoints
    if (path === '/api/sessions') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
      return;
    }

    if (path.startsWith('/api/resumes')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
      return;
    }

    if (path === '/api/coach/recommend') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          action: 'Set up your profile.',
          product: 'Profile Setup',
          room: 'profile-setup',
          urgency: 'immediate',
          phase: 'career_profile',
          phase_label: 'Career Profile',
          rationale: 'Start with your career profile.',
        }),
      });
      return;
    }

    if (path.startsWith('/api/momentum')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: null, nudges: [] }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function navigateToProfileSetup(page: Page) {
  await page.goto('/profile-setup');
  await expect(
    page.getByRole('heading', { name: /build your CareerIQ profile/i }),
  ).toBeVisible({ timeout: 10_000 });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Profile Setup', () => {
  test.beforeEach(async ({ page }) => {
    await mockProfileSetupApis(page);
  });

  // ── Intake screen ──

  test('renders the intake form with all 4 fields', async ({ page }) => {
    await navigateToProfileSetup(page);

    await expect(page.getByLabel(/Resume text/i)).toBeVisible();
    await expect(page.getByLabel(/LinkedIn profile text/i)).toBeVisible();
    await expect(page.getByLabel(/Target roles/i)).toBeVisible();
    await expect(page.getByLabel(/Your situation/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Build my CareerIQ profile/i })).toBeVisible();
  });

  test('submit button is disabled without resume and target roles', async ({ page }) => {
    await navigateToProfileSetup(page);

    const submit = page.getByRole('button', { name: /Build my CareerIQ profile/i });
    await expect(submit).toBeDisabled();

    // Only resume — still disabled
    await page.getByLabel(/Resume text/i).fill('Some resume text');
    await expect(submit).toBeDisabled();

    // Add target roles — now enabled
    await page.getByLabel(/Target roles/i).fill('VP of Engineering');
    await expect(submit).toBeEnabled();
  });

  test('shows LinkedIn skip confirmation when submitting without LinkedIn', async ({ page }) => {
    await navigateToProfileSetup(page);

    await page.getByLabel(/Resume text/i).fill(REAL_RESUME_TEXT);
    await page.getByLabel(/Target roles/i).fill('VP of Infrastructure');
    await page.getByRole('button', { name: /Build my CareerIQ profile/i }).click();

    // Should show skip confirmation
    await expect(page.getByText(/Are you sure you want to skip it/i)).toBeVisible();

    // "Continue without it" proceeds to processing → interview
    await page.getByRole('button', { name: /Continue without it/i }).click();

    // With instant mocks, processing flashes by; verify we reach interview
    await expect(page.getByText(/Here is what we found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('skips LinkedIn confirmation when LinkedIn text is provided', async ({ page }) => {
    await navigateToProfileSetup(page);

    await page.getByLabel(/Resume text/i).fill(REAL_RESUME_TEXT);
    await page.getByLabel(/LinkedIn profile text/i).fill('I am a cloud infrastructure leader.');
    await page.getByLabel(/Target roles/i).fill('VP of Infrastructure');
    await page.getByRole('button', { name: /Build my CareerIQ profile/i }).click();

    // Should go straight to processing or interview — no skip confirmation
    await expect(page.getByText(/Are you sure you want to skip it/i)).not.toBeVisible();
    // With instant mocks, processing may flash by; check we reach interview
    await expect(page.getByText(/Here is what we found/i)).toBeVisible({ timeout: 10_000 });
  });

  // ── Processing → Interview transition ──

  test('transitions from processing to interview screen', async ({ page }) => {
    await navigateToProfileSetup(page);

    await page.getByLabel(/Resume text/i).fill(REAL_RESUME_TEXT);
    await page.getByLabel(/LinkedIn profile text/i).fill('Cloud infrastructure leader.');
    await page.getByLabel(/Target roles/i).fill('VP of Infrastructure');
    await page.getByRole('button', { name: /Build my CareerIQ profile/i }).click();

    // With instant mocks, processing screen may flash by — check interview directly
    await expect(page.getByText(/Here is what we found/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Sarah is a cloud infrastructure leader/i)).toBeVisible();

    // First question is displayed
    await expect(page.getByText(/Interview question 1/i)).toBeVisible();

    // Question counter is visible
    await expect(page.getByText(/Question 1 of 8/i)).toBeVisible();
  });

  // ── Interview screen ──

  test('interview accepts answers and advances questions', async ({ page }) => {
    await navigateToProfileSetup(page);

    // Fill intake and submit
    await page.getByLabel(/Resume text/i).fill(REAL_RESUME_TEXT);
    await page.getByLabel(/LinkedIn profile text/i).fill('Cloud leader.');
    await page.getByLabel(/Target roles/i).fill('VP of Infrastructure');
    await page.getByRole('button', { name: /Build my CareerIQ profile/i }).click();

    // Wait for interview screen
    await expect(page.getByText(/Here is what we found/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Question 1 of 8/i)).toBeVisible();

    // Answer first question
    const answerInput = page.getByLabel(/Your answer/i);
    await answerInput.fill('I led a major cloud migration project.');
    await answerInput.press('Enter');

    // Should show the user's answer and advance to question 2
    await expect(page.getByText(/I led a major cloud migration project/i)).toBeVisible();
    await expect(page.getByText(/Question 2 of 8/i)).toBeVisible({ timeout: 5_000 });
  });

  // ── Full flow: intake → interview → reveal ──

  test('completes the full profile setup flow', async ({ page }) => {
    await navigateToProfileSetup(page);

    // ── Intake ──
    await page.getByLabel(/Resume text/i).fill(REAL_RESUME_TEXT);
    await page.getByLabel(/LinkedIn profile text/i).fill('Cloud infrastructure leader.');
    await page.getByLabel(/Target roles/i).fill('VP of Infrastructure');
    await page.getByRole('button', { name: /Build my CareerIQ profile/i }).click();

    // ── Processing → Interview ──
    await expect(page.getByText(/Here is what we found/i)).toBeVisible({ timeout: 10_000 });

    // ── Answer all 8 questions ──
    const answerInput = page.getByLabel(/Your answer/i);
    for (let i = 0; i < 8; i++) {
      await expect(answerInput).toBeVisible({ timeout: 5_000 });
      await answerInput.fill(`Answer to question ${i + 1}: I demonstrated strong leadership.`);
      await answerInput.press('Enter');

      if (i < 7) {
        // Wait for next question counter
        await expect(page.getByText(`Question ${i + 2} of 8`)).toBeVisible({ timeout: 5_000 });
      }
    }

    // ── Building flashes by with instant mocks → Profile Reveal ──
    await expect(page.getByRole('heading', { name: /Your CareerIQ Profile/i })).toBeVisible({ timeout: 15_000 });

    // Verify profile sections are displayed
    await expect(page.getByText(/Career Thread/i)).toBeVisible();
    await expect(page.getByText(/From systems engineering to cloud-scale leadership/i)).toBeVisible();

    await expect(page.getByText(/Where You Are Exceptional/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/Signature Story/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/The Honest Answer/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/How You Close/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/Your Why Me/i)).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/Sarah turns infrastructure chaos/i)).toBeVisible({ timeout: 3_000 });

    // Navigation buttons present
    await expect(page.getByRole('button', { name: /Find jobs that fit this profile/i })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: /Analyze a specific job/i })).toBeVisible({ timeout: 3_000 });
  });

  // ── Error handling ──

  test('shows error and returns to intake when analysis fails', async ({ page }) => {
    // Override all API routes with analyze returning an error
    await page.unroute('**/api/**');
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;

      if (path.endsWith('/profile-setup/analyze')) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
        return;
      }

      if (path === '/api/sessions') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
        return;
      }

      if (path.startsWith('/api/resumes')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resumes: [] }) });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await navigateToProfileSetup(page);

    await page.getByLabel(/Resume text/i).fill(REAL_RESUME_TEXT);
    await page.getByLabel(/LinkedIn profile text/i).fill('Cloud leader.');
    await page.getByLabel(/Target roles/i).fill('VP of Infrastructure');
    await page.getByRole('button', { name: /Build my CareerIQ profile/i }).click();

    // Should show error and return to intake
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/Resume text/i)).toBeVisible();
  });

  test('browse file button is visible on intake', async ({ page }) => {
    await navigateToProfileSetup(page);

    await expect(page.getByRole('button', { name: /Browse file/i })).toBeVisible();
    await expect(page.getByLabel(/Upload resume file/i)).toBeAttached();
  });
});
