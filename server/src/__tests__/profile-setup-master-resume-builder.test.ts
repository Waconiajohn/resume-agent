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
import type {
  CareerIQProfileFull,
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

function makeProfile(): CareerIQProfileFull {
  return {
    career_thread: 'Operator to engineering leader',
    top_capabilities: [],
    signature_story: {
      situation: '',
      task: '',
      action: '',
      result: '',
      reflection: '',
    },
    honest_answer: {
      concern: '',
      response: '',
    },
    righteous_close: '',
    why_me_final: {
      headline: 'Engineering leader',
      body: 'Scales platforms and teams.',
    },
    target_roles: ['VP Engineering'],
    created_at: '2026-04-07T00:00:00.000Z',
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
