import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const mockFrom = vi.hoisted(() => vi.fn());
const mockParseJsonBodyWithLimit = vi.hoisted(() => vi.fn());
const mockRunIntakeAgent = vi.hoisted(() => vi.fn());
const mockProcessInterviewAnswer = vi.hoisted(() => vi.fn());
const mockSynthesizeProfile = vi.hoisted(() => vi.fn());
const mockUpsertUserContext = vi.hoisted(() => vi.fn());
const mockBuildMasterResumePayload = vi.hoisted(() => vi.fn());
const mockCreateInitialMasterResume = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-123', email: 'test@example.com' });
    await next();
  }),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  rateLimitMiddleware: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock('../lib/http-body-guard.js', () => ({
  parseJsonBodyWithLimit: mockParseJsonBodyWithLimit,
}));

vi.mock('../lib/llm-provider.js', () => ({
  createCombinedAbortSignal: vi.fn(() => ({
    signal: new AbortController().signal,
    cleanup: vi.fn(),
  })),
}));

vi.mock('../agents/profile-setup/intake-agent.js', () => ({
  runIntakeAgent: mockRunIntakeAgent,
}));

vi.mock('../agents/profile-setup/interview-runner.js', () => ({
  processInterviewAnswer: mockProcessInterviewAnswer,
}));

vi.mock('../agents/profile-setup/synthesizer.js', () => ({
  synthesizeProfile: mockSynthesizeProfile,
}));

vi.mock('../lib/platform-context.js', () => ({
  upsertUserContext: mockUpsertUserContext,
}));

vi.mock('../agents/profile-setup/master-resume-builder.js', () => ({
  buildMasterResumePayload: mockBuildMasterResumePayload,
  createInitialMasterResume: mockCreateInitialMasterResume,
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { profileSetupRoutes } from '../routes/profile-setup.js';

function makeApp() {
  const app = new Hono();
  app.route('/api/profile-setup', profileSetupRoutes);
  return app;
}

async function callApp(path: string, method = 'POST', body?: Record<string, unknown>) {
  const app = makeApp();
  return app.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

describe('profile-setup route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockParseJsonBodyWithLimit.mockImplementation(async (c: { req: Request }) => ({
      ok: true,
      data: await c.req.json(),
    }));

    mockRunIntakeAgent.mockResolvedValue({
      why_me_draft: 'Strong operator',
      career_thread: 'Operator to engineering leader',
      top_capabilities: [],
      profile_gaps: [],
      primary_concern: null,
      interview_questions: [
        {
          question: 'What was the scale?',
          what_we_are_looking_for: 'platform scale',
          references_resume_element: 'Acme Corp',
          suggested_starters: [],
        },
      ],
      structured_experience: [
        {
          company: 'Acme Corp',
          title: 'VP Engineering',
          start_date: '2020',
          end_date: 'Present',
          location: 'Chicago, IL',
          scope_statement: '',
          original_bullets: ['Led platform engineering across the company.'],
        },
      ],
    });

    mockSynthesizeProfile.mockResolvedValue({
      version: 'career_profile_v2',
      source: 'profile-setup',
      generated_at: new Date().toISOString(),
      targeting: { target_roles: ['VP of Operations'], target_industries: ['Manufacturing'], seniority: 'VP', transition_type: 'lateral', preferred_company_environments: [] },
      positioning: { core_strengths: ['Operations Leadership'], proof_themes: [], differentiators: [], adjacent_positioning: [], positioning_statement: 'Test positioning', narrative_summary: '', leadership_scope: '', scope_of_responsibility: '' },
      narrative: { colleagues_came_for_what: '', known_for_what: '', why_not_me: '', story_snippet: '' },
      preferences: { must_haves: [], constraints: [], compensation_direction: '' },
      coaching: { financial_segment: 'comfortable', emotional_state: 'confident', coaching_tone: 'direct', urgency_score: 5, recommended_starting_point: 'resume' },
      evidence_positioning_statements: [],
      profile_signals: { clarity: 'strong', alignment: 'strong', differentiation: 'moderate' },
      completeness: { overall_score: 75, dashboard_state: 'refining', sections: [] },
    });

    mockUpsertUserContext.mockResolvedValue({ id: 'ctx-1' });
    mockBuildMasterResumePayload.mockReturnValue({
      raw_text: 'resume',
      summary: 'summary',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      contact_info: {},
      evidence_items: [],
    });
    mockFrom.mockReturnValue(makeChain({ data: { id: '123e4567-e89b-12d3-a456-426614174000' }, error: null }));
  });

  it('retains the session for retry when master resume creation fails and reuses the completed profile', async () => {
    mockCreateInitialMasterResume
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, resumeId: 'resume-123' });

    const analyzeResponse = await callApp('/api/profile-setup/analyze', 'POST', {
      resume_text: 'A'.repeat(120),
      linkedin_about: '',
      target_roles: 'VP Engineering',
      situation: '',
    });
    const analyzeBody = await analyzeResponse.json() as { session_id: string };

    const firstComplete = await callApp('/api/profile-setup/complete', 'POST', {
      session_id: analyzeBody.session_id,
    });
    const firstBody = await firstComplete.json() as { master_resume_created: boolean };

    const secondComplete = await callApp('/api/profile-setup/complete', 'POST', {
      session_id: analyzeBody.session_id,
    });
    const secondBody = await secondComplete.json() as { master_resume_created: boolean; master_resume_id: string | null };

    expect(firstComplete.status).toBe(200);
    expect(firstBody.master_resume_created).toBe(false);
    expect(secondComplete.status).toBe(200);
    expect(secondBody.master_resume_created).toBe(true);
    expect(secondBody.master_resume_id).toBe('resume-123');

    expect(mockSynthesizeProfile).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockUpsertUserContext).toHaveBeenCalledWith(
      'user-123',
      'career_profile',
      expect.any(Object),
      'profile-setup',
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(mockCreateInitialMasterResume).toHaveBeenNthCalledWith(
      1,
      'user-123',
      expect.any(Object),
      '123e4567-e89b-12d3-a456-426614174000',
    );
  });
});
