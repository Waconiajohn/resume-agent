import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    rpc: mockRpc,
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  buildMasterResumePayload,
  createInitialMasterResume,
} from '../agents/profile-setup/master-resume-builder.js';
import type { CareerProfileV2 } from '../lib/career-profile-context.js';
import type {
  IntakeAnalysis,
  InterviewAnswer,
  ProfileSetupInput,
} from '../agents/profile-setup/types.js';

function makeInput(): ProfileSetupInput {
  return {
    resume_text: 'Jane Doe\njane@example.com\nAcme Corp\nLed platform work',
    linkedin_about: '',
    target_roles: 'VP Engineering',
    situation: '',
    user_id: 'user-123',
    session_id: 'profile-setup-session',
  };
}

function makeIntake(): IntakeAnalysis {
  return {
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
  };
}

function makeProfile(): CareerProfileV2 {
  return {
    version: 'career_profile_v2',
    source: 'profile-setup',
    generated_at: '2026-04-07T00:00:00.000Z',
    targeting: {
      target_roles: ['VP Engineering'],
      target_industries: [],
      seniority: 'vp',
      transition_type: 'growth',
      preferred_company_environments: [],
    },
    positioning: {
      core_strengths: ['Platform engineering', 'Team scaling'],
      proof_themes: ['Scaled platforms across business units'],
      differentiators: ['Operator-to-engineer background'],
      adjacent_positioning: [],
      positioning_statement: 'Engineering leader who scales platforms and teams.',
      narrative_summary: 'Operator to engineering leader across enterprise environments.',
      leadership_scope: 'Org-wide engineering platform',
      scope_of_responsibility: 'Platform and infrastructure',
    },
    narrative: {
      colleagues_came_for_what: 'Colleagues came for platform architecture decisions.',
      known_for_what: 'Scaling platforms and teams.',
      why_not_me: '',
      story_snippet: 'Led platform modernization across four business units.',
    },
    preferences: {
      must_haves: [],
      constraints: [],
      compensation_direction: '',
    },
    coaching: {
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      coaching_tone: 'direct',
      urgency_score: 5,
      recommended_starting_point: 'resume',
    },
    evidence_positioning_statements: ['Platform engineering positioned against VP Engineering requirements.'],
    profile_signals: { clarity: 'green', alignment: 'green', differentiation: 'yellow' },
    completeness: {
      overall_score: 75,
      dashboard_state: 'refining',
      sections: [
        { id: 'direction', label: 'Direction', status: 'ready', score: 90, summary: 'Target role defined.' },
        { id: 'positioning', label: 'Positioning', status: 'ready', score: 85, summary: 'Strengths defined.' },
        { id: 'narrative', label: 'Narrative', status: 'partial', score: 65, summary: 'Story partially defined.' },
        { id: 'constraints', label: 'Preferences', status: 'missing', score: 15, summary: 'Preferences not defined.' },
      ],
    },
    profile_summary: 'Engineering leader who scales platforms and teams. Scales platforms and teams.',
  };
}

describe('profile-setup master resume builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps interview answers as evidence instead of promoting them into experience bullets', () => {
    const answers: InterviewAnswer[] = [
      {
        question_index: 0,
        question: 'What was the scale?',
        answer: 'I led platform modernization across four business units.',
      },
    ];

    const payload = buildMasterResumePayload(
      makeInput(),
      makeIntake(),
      answers,
      makeProfile(),
      '123e4567-e89b-12d3-a456-426614174000',
    );

    expect(payload.experience[0]?.bullets).toEqual([
      { text: 'Led platform engineering across the company.', source: 'resume' },
    ]);
    expect(payload.evidence_items).toEqual([
      expect.objectContaining({
        text: 'I led platform modernization across four business units.',
        source_session_id: '123e4567-e89b-12d3-a456-426614174000',
      }),
    ]);
  });

  it('passes the provenance session id into create_master_resume_atomic', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'resume-123' },
      error: null,
    });

    const result = await createInitialMasterResume(
      'user-123',
      {
        raw_text: 'raw',
        summary: 'summary',
        experience: [],
        skills: {},
        education: [],
        certifications: [],
        contact_info: {},
        evidence_items: [],
      },
      '123e4567-e89b-12d3-a456-426614174000',
    );

    expect(result).toEqual({ success: true, resumeId: 'resume-123' });
    expect(mockRpc).toHaveBeenCalledWith('create_master_resume_atomic', expect.objectContaining({
      p_source_session_id: '123e4567-e89b-12d3-a456-426614174000',
    }));
  });
});
