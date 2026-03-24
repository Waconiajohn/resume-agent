import { describe, it, expect, vi } from 'vitest';

const { resumeToTextMock } = vi.hoisted(() => ({
  resumeToTextMock: vi.fn(() => 'RAW TEXT'),
}));

vi.mock('@/lib/export', () => ({
  resumeToText: resumeToTextMock,
}));

import { buildMasterResumePromotionPayload, getPromotableResumeItems } from '../master-resume-promotion';
import type { MasterResume } from '@/types/resume';
import type { ResumeDraft } from '@/types/resume-v2';

function makeDraft(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Operations',
    },
    executive_summary: {
      content: 'Operator with a strong transformation track record.',
      is_new: false,
    },
    core_competencies: ['Transformation', 'P&L'],
    selected_accomplishments: [
      {
        content: 'Reduced delivery cycle time by 28%.',
        is_new: true,
        addresses_requirements: ['Operational excellence'],
      },
      {
        content: 'Inherited an underperforming region.',
        is_new: false,
        addresses_requirements: [],
      },
    ],
    professional_experience: [
      {
        company: 'Acme',
        title: 'VP Operations',
        start_date: '2020',
        end_date: 'Present',
        scope_statement: 'Led a 120-person multi-site operation.',
        scope_statement_is_new: true,
        bullets: [
          {
            text: 'Stabilized plant output and improved fill rate by 14%.',
            is_new: true,
            addresses_requirements: ['Operational excellence'],
          },
          {
            text: 'Managed daily operations.',
            is_new: false,
            addresses_requirements: [],
          },
        ],
      },
    ],
    education: [],
    certifications: [],
  };
}

function makeBaseResume(): MasterResume {
  return {
    id: 'master-1',
    user_id: 'user-1',
    summary: 'Existing master summary.',
    experience: [
      {
        company: 'Acme',
        title: 'VP Operations',
        start_date: '2020',
        end_date: 'Present',
        location: '',
        bullets: [
          { text: 'Stabilized plant output and improved fill rate by 14%.', source: 'upgraded' },
        ],
      },
    ],
    skills: { 'Core Competencies': ['Transformation'] },
    education: [],
    certifications: [],
    contact_info: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-0100',
    },
    raw_text: 'existing raw text',
    version: 3,
    is_default: true,
    source_session_id: null,
    evidence_items: [
      {
        text: 'Stabilized plant output and improved fill rate by 14%.',
        source: 'upgraded',
        category: 'experience_bullet',
        source_session_id: 'older-session',
        created_at: '2026-03-01T00:00:00.000Z',
      },
    ],
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
  };
}

describe('master-resume-promotion', () => {
  it('returns only AI-created items as promotable master-resume candidates', () => {
    const promotableItems = getPromotableResumeItems(makeDraft());

    expect(promotableItems.map((item) => item.id)).toEqual([
      'selected_accomplishment:0',
      'scope_statement:0',
      'experience_bullet:0:0',
    ]);
  });

  it('promotes only selected items and deduplicates existing master-resume bullets', () => {
    const draft = makeDraft();
    const promotableItems = getPromotableResumeItems(draft);
    const selectedItems = promotableItems.filter((item) => item.id !== 'selected_accomplishment:0');

    const result = buildMasterResumePromotionPayload({
      draft,
      baseResume: makeBaseResume(),
      selectedItems,
      sourceSessionId: 'session-123',
      companyName: 'TargetCo',
      jobTitle: 'VP Operations',
      atsScore: 93,
    });

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0].scope_statement).toBe('Led a 120-person multi-site operation.');
    expect(result.experience[0].bullets).toEqual([
      { text: 'Stabilized plant output and improved fill rate by 14%.', source: 'upgraded' },
    ]);
    expect(result.evidence_items).toEqual([
      expect.objectContaining({
        text: 'Stabilized plant output and improved fill rate by 14%.',
        source_session_id: 'older-session',
      }),
      expect.objectContaining({
        text: 'Led a 120-person multi-site operation.',
        source_session_id: 'session-123',
      }),
    ]);
    expect(result.raw_text).toBe('RAW TEXT');
    expect(resumeToTextMock).toHaveBeenCalledOnce();
  });
});
