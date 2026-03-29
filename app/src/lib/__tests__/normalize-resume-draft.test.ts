import { describe, expect, it } from 'vitest';

import { normalizeAssemblyResult, normalizeResumeDraft } from '../normalize-resume-draft';
import type { AssemblyResult, ResumeDraft } from '@/types/resume-v2';

describe('normalizeResumeDraft', () => {
  it('fills missing bullet metadata with safe defaults', () => {
    const runtimeResume = {
      header: {
        name: 'Jane Doe',
        phone: '555-0100',
        email: 'jane@example.com',
        branded_title: 'VP Engineering',
      },
      executive_summary: {
        content: 'Built resilient teams and platforms.',
        is_new: false,
      },
      core_competencies: undefined,
      selected_accomplishments: [
        {
          content: 'Led platform modernization across 3 business units',
          is_new: false,
          addresses_requirements: ['Transformation'],
        },
      ],
      professional_experience: [
        {
          company: 'Acme Corp',
          title: 'VP Engineering',
          start_date: '2021',
          end_date: 'Present',
          scope_statement: 'Led engineering transformation',
          bullets: [
            {
              text: 'Scaled engineering operations during growth stage',
              is_new: true,
              addresses_requirements: ['Leadership'],
            },
          ],
        },
      ],
      education: undefined,
      certifications: undefined,
    } as unknown as ResumeDraft;

    const normalized = normalizeResumeDraft(runtimeResume);
    expect(normalized).not.toBeNull();
    expect(normalized?.core_competencies).toEqual([]);
    expect(normalized?.selected_accomplishments[0].evidence_found).toBe('');
    expect(normalized?.selected_accomplishments[0].requirement_source).toBe('job_description');
    expect(normalized?.selected_accomplishments[0].confidence).toBe('needs_validation');
    expect(normalized?.selected_accomplishments[0].review_state).toBe('code_red');
    expect(normalized?.professional_experience[0].bullets[0].evidence_found).toBe('');
    expect(normalized?.professional_experience[0].bullets[0].confidence).toBe('needs_validation');
    expect(normalized?.professional_experience[0].bullets[0].review_state).toBe('code_red');
    expect(normalized?.education).toEqual([]);
    expect(normalized?.certifications).toEqual([]);
  });

  it('preserves valid confidence metadata when it already exists', () => {
    const resume: ResumeDraft = {
      header: {
        name: 'Jane Doe',
        phone: '555-0100',
        email: 'jane@example.com',
        branded_title: 'VP Engineering',
      },
      executive_summary: { content: 'Leader.', is_new: false },
      core_competencies: [],
      selected_accomplishments: [
        {
          content: 'Reduced deployment time by 60%',
          is_new: false,
          addresses_requirements: ['CI/CD'],
          confidence: 'partial',
          evidence_found: 'Improved deployment workflow and lead times',
          requirement_source: 'job_description',
        },
      ],
      professional_experience: [],
      education: [],
      certifications: [],
    };

    const normalized = normalizeResumeDraft(resume);
    expect(normalized?.selected_accomplishments[0].confidence).toBe('partial');
    expect(normalized?.selected_accomplishments[0].review_state).toBe('strengthen');
    expect(normalized?.selected_accomplishments[0].evidence_found).toBe('Improved deployment workflow and lead times');
  });

  it('derives supported_rewrite for strongly supported resume rewrites', () => {
    const resume: ResumeDraft = {
      header: {
        name: 'Jane Doe',
        phone: '555-0100',
        email: 'jane@example.com',
        branded_title: 'VP Engineering',
      },
      executive_summary: { content: 'Leader.', is_new: false },
      core_competencies: [],
      selected_accomplishments: [
        {
          content: 'Cut deployment time from 45 minutes to 8 minutes by optimizing CI/CD pipelines.',
          is_new: false,
          addresses_requirements: ['CI/CD'],
          confidence: 'strong',
          evidence_found: 'Reduced deployment time from 45 minutes to 8 minutes through pipeline optimization',
          requirement_source: 'job_description',
          content_origin: 'resume_rewrite',
          support_origin: 'original_resume',
        },
      ],
      professional_experience: [],
      education: [],
      certifications: [],
    };

    const normalized = normalizeResumeDraft(resume);
    expect(normalized?.selected_accomplishments[0].confidence).toBe('strong');
    expect(normalized?.selected_accomplishments[0].review_state).toBe('supported_rewrite');
  });
});

describe('normalizeAssemblyResult', () => {
  it('normalizes the final resume inside assembly results', () => {
    const assembly = {
      final_resume: {
        header: {
          name: 'Jane Doe',
          phone: '555-0100',
          email: 'jane@example.com',
          branded_title: 'VP Engineering',
        },
        executive_summary: { content: 'Leader.', is_new: false },
        core_competencies: [],
        selected_accomplishments: [],
        professional_experience: [
          {
            company: 'Acme Corp',
            title: 'VP Engineering',
            start_date: '2021',
            end_date: 'Present',
            scope_statement: '',
            bullets: [
              {
                text: 'Built an AI readiness roadmap',
                is_new: false,
                addresses_requirements: ['AI strategy'],
              },
            ],
          },
        ],
        education: [],
        certifications: [],
      } as unknown as ResumeDraft,
      scores: { ats_match: 82, truth: 91, tone: 88 },
      quick_wins: [],
    } as AssemblyResult;

    const normalized = normalizeAssemblyResult(assembly);
    expect(normalized?.final_resume.professional_experience[0].bullets[0].confidence).toBe('needs_validation');
    expect(normalized?.final_resume.professional_experience[0].bullets[0].evidence_found).toBe('');
  });
});
