import { describe, expect, it } from 'vitest';
import type {
  FinalReviewConcern,
  PositioningAssessment,
  ResumeDraft,
} from '@/types/resume-v2';
import { findResumeTargetForFinalReviewConcern } from '../final-review-target';

function makeResume(): ResumeDraft {
  return {
    header: {
      name: 'Alex Morgan',
      phone: '555-111-2222',
      email: 'alex@example.com',
      branded_title: 'VP Operations',
    },
    executive_summary: {
      content: 'Operations leader driving scale, margin improvement, and cross-functional execution.',
      is_new: false,
      addresses_requirements: ['Operational leadership'],
    },
    core_competencies: ['P&L Leadership', 'ERP', 'Operations'],
    selected_accomplishments: [
      {
        content: 'Improved fill rate and on-time delivery across a national distribution network.',
        is_new: false,
        addresses_requirements: ['Supply chain performance'],
        confidence: 'strong',
        evidence_found: 'Original resume bullet',
        requirement_source: 'job_description',
      },
    ],
    professional_experience: [
      {
        company: 'Acme Manufacturing',
        title: 'Vice President, Operations',
        start_date: '2021',
        end_date: '2025',
        scope_statement: 'Led multi-site operations across five plants with full operational accountability.',
        scope_statement_is_new: false,
        scope_statement_addresses_requirements: ['Multi-site leadership'],
        bullets: [
          {
            text: 'Built and tracked plant performance metrics across safety, throughput, and labor efficiency.',
            is_new: false,
            addresses_requirements: ['Develop and track performance metrics'],
            confidence: 'strong',
            evidence_found: 'Original resume bullet',
            requirement_source: 'job_description',
          },
          {
            text: 'Ran SAP-enabled planning and inventory workflows during a plant network redesign.',
            is_new: false,
            addresses_requirements: ['ERP systems'],
            confidence: 'strong',
            evidence_found: 'Original resume bullet',
            requirement_source: 'job_description',
          },
        ],
      },
    ],
    education: [],
    certifications: [],
  };
}

function makeConcern(overrides: Partial<FinalReviewConcern> = {}): FinalReviewConcern {
  return {
    id: 'concern-1',
    severity: 'critical',
    type: 'missing_evidence',
    observation: 'The resume does not make ownership of performance metrics obvious enough.',
    why_it_hurts: 'The hiring manager may not believe the candidate owned the KPI system.',
    fix_strategy: 'Add direct proof showing the metrics and cadence owned by the candidate.',
    target_section: 'Summary or most relevant experience bullets',
    related_requirement: 'Develop and track performance metrics',
    suggested_resume_edit: undefined,
    requires_candidate_input: false,
    clarifying_question: undefined,
    ...overrides,
  };
}

describe('findResumeTargetForFinalReviewConcern', () => {
  it('prefers the requirement-mapped bullet when the concern names a requirement', () => {
    const resume = makeResume();
    const concern = makeConcern();
    const positioningAssessment: PositioningAssessment = {
      summary: 'good',
      before_score: 62,
      after_score: 88,
      strategies_applied: [],
      requirement_map: [
        {
          requirement: 'Develop and track performance metrics',
          importance: 'must_have',
          status: 'strong',
          addressed_by: [
            {
              section: 'Professional Experience - Acme Manufacturing',
              bullet_text: 'Built and tracked plant performance metrics across safety, throughput, and labor efficiency.',
            },
          ],
        },
      ],
    };

    expect(findResumeTargetForFinalReviewConcern(resume, concern, positioningAssessment)).toEqual({
      text: 'Built and tracked plant performance metrics across safety, throughput, and labor efficiency.',
      section: 'Professional Experience - Acme Manufacturing',
      selector: '[data-bullet-id="professional_experience-0"]',
    });
  });

  it('uses the requested section when the concern is explicitly about the summary', () => {
    const resume = makeResume();
    const concern = makeConcern({
      related_requirement: undefined,
      target_section: 'Executive Summary',
      observation: 'The summary needs to explain the scope more clearly.',
    });

    expect(findResumeTargetForFinalReviewConcern(resume, concern)).toEqual({
      text: 'Operations leader driving scale, margin improvement, and cross-functional execution.',
      section: 'Executive Summary',
      selector: '[data-section="executive_summary"]',
    });
  });

  it('falls back to the best matching experience bullet when there is no positioning map', () => {
    const resume = makeResume();
    const concern = makeConcern({
      related_requirement: undefined,
      target_section: 'Professional Experience - Acme Manufacturing',
      observation: 'ERP experience is not explicit enough for the final review.',
    });

    expect(findResumeTargetForFinalReviewConcern(resume, concern)).toEqual({
      text: 'Ran SAP-enabled planning and inventory workflows during a plant network redesign.',
      section: 'Professional Experience - Acme Manufacturing',
      selector: '[data-bullet-id="professional_experience-1"]',
    });
  });

  it('prefers the canonical primary target over stale requirement arrays when picking a final-review target', () => {
    const resume = makeResume();
    resume.professional_experience[0]!.bullets[0] = {
      ...resume.professional_experience[0]!.bullets[0]!,
      text: 'Presented KPI and throughput updates to the COO and board operations committee.',
      addresses_requirements: ['Bachelor’s degree in engineering'],
      primary_target_requirement: 'Develop and track performance metrics',
    };

    const concern = makeConcern({
      observation: 'The final review still needs clearer KPI ownership for executive audiences.',
      related_requirement: 'Develop and track performance metrics',
    });

    expect(findResumeTargetForFinalReviewConcern(resume, concern)).toEqual({
      text: 'Presented KPI and throughput updates to the COO and board operations committee.',
      section: 'Professional Experience - Acme Manufacturing',
      selector: '[data-bullet-id="professional_experience-0"]',
    });
  });
});
