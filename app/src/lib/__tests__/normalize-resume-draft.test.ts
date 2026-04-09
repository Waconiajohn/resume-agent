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
          primary_target_requirement: 'CI/CD',
          target_evidence: 'Reduced deployment time from 45 minutes to 8 minutes through pipeline optimization',
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

  it('downgrades strong rewrites without target-specific proof to strengthen', () => {
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
          content: 'Led platform modernization across three business units',
          is_new: false,
          addresses_requirements: ['Transformation leadership'],
          primary_target_requirement: 'Transformation leadership',
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
    expect(normalized?.selected_accomplishments[0].target_evidence).toBe('');
    expect(normalized?.selected_accomplishments[0].review_state).toBe('strengthen');
  });

  it('uses confirm_fit for benchmark rewrites without target-specific proof', () => {
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
          content: 'Positioned as an enterprise transformation leader',
          is_new: false,
          addresses_requirements: ['Benchmark transformation signal'],
          primary_target_requirement: 'Benchmark transformation signal',
          confidence: 'strong',
          evidence_found: 'Reduced deployment time from 45 minutes to 8 minutes through pipeline optimization',
          requirement_source: 'benchmark',
          content_origin: 'resume_rewrite',
          support_origin: 'original_resume',
        },
      ],
      professional_experience: [],
      education: [],
      certifications: [],
    };

    const normalized = normalizeResumeDraft(resume);
    expect(normalized?.selected_accomplishments[0].review_state).toBe('confirm_fit');
  });

  it('sanitizes leaked prompt text and banned wording from loaded drafts', () => {
    const resume: ResumeDraft = {
      header: {
        name: 'Rose M. Seed',
        phone: '555-0100',
        email: 'rose@example.com',
        branded_title: 'Product Leader',
      },
      executive_summary: {
        content: '[Scale and scope of experience]: Eagle Ford Shale project — 22 individuals 29M dollar budget. Spearheaded digital product launches that improved conversion.',
        is_new: true,
      },
      core_competencies: ['Spearheaded transformation'],
      selected_accomplishments: [
        {
          content: 'Eagle Ford Shale project — 22 individuals 29M dollar budget. Spearheaded execution.',
          is_new: true,
          addresses_requirements: ['Leadership'],
          confidence: 'needs_validation',
          evidence_found: '',
          requirement_source: 'job_description',
        },
      ],
      professional_experience: [
        {
          company: 'Beam Benefits',
          title: 'Product Manager',
          start_date: '2022',
          end_date: 'Present',
          scope_statement: 'Spearheaded roadmap delivery across benefits products.',
          bullets: [
            {
              text: 'Spearheaded product launch for Eagle Ford Shale field program.',
              is_new: true,
              addresses_requirements: ['Product management'],
              confidence: 'needs_validation',
              evidence_found: '',
              requirement_source: 'job_description',
            },
          ],
        },
      ],
      education: [],
      certifications: [],
    };

    const normalized = normalizeResumeDraft(resume);
    expect(normalized?.executive_summary.content).not.toContain('Eagle Ford Shale');
    expect(normalized?.executive_summary.content).not.toContain('[Scale and scope of experience]');
    expect(normalized?.executive_summary.content).toContain('Led digital product launches');
    expect(normalized?.core_competencies[0]).toBe('Led transformation');
    expect(normalized?.selected_accomplishments[0].content).toBe('Led execution.');
    expect(normalized?.professional_experience[0].scope_statement).toBe('Led roadmap delivery across benefits products.');
    expect(normalized?.professional_experience[0].bullets).toEqual([]);
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
