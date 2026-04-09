import { describe, expect, it } from 'vitest';
import {
  buildFallbackSectionDraftResult,
  buildResumeSectionWorkflowViewModel,
  replaceSectionDraftVariantText,
  type ResumeWorkflowSectionStepViewModel,
} from '@/lib/resume-section-workflow';
import type { RequirementWorkItem, ResumeDraft } from '@/types/resume-v2';

function makeStep(overrides: Partial<ResumeWorkflowSectionStepViewModel> = {}): ResumeWorkflowSectionStepViewModel {
  return {
    id: 'executive_summary',
    kind: 'executive_summary',
    title: 'Executive Summary',
    shortTitle: 'Executive Summary',
    sectionKey: 'executive_summary',
    stepNumber: 1,
    totalSteps: 4,
    order: 1,
    currentContent: 'Technical sales consultant with 15 years of experience delivering complex solutions. Built revenue growth across multiple accounts. Known for consultative selling and customer trust.',
    currentContentLabel: 'Current summary',
    sectionRationale: 'Lead with identity and fit.',
    needsToDo: ['Make it obvious who you are and why this role fits.'],
    whyThisWorks: ['It should sound like the clearest opening story for this job.'],
    topRequirements: [
      {
        requirement: 'consultative selling',
        source: 'job_description',
        whyItMatters: 'The role needs visible consultative selling experience.',
      },
    ],
    ...overrides,
  };
}

describe('buildFallbackSectionDraftResult', () => {
  it('builds full paragraph variants for executive summary fallback', () => {
    const result = buildFallbackSectionDraftResult(makeStep(), {
      note: 'Fallback note.',
    });

    expect(result.recommendedVariantId).toBe('recommended');
    expect(result.variants).toHaveLength(3);
    expect(result.variants.every((variant) => variant.content.kind === 'paragraph')).toBe(true);
    expect(result.variants[1]?.content.paragraph).toContain('Technical sales consultant');
    expect(result.whyItWorks.length).toBeGreaterThan(0);
    expect(result.strengtheningNote).toBe('Fallback note.');
  });

  it('builds bullet-list variants for selected accomplishments fallback', () => {
    const result = buildFallbackSectionDraftResult(makeStep({
      id: 'selected_accomplishments',
      kind: 'selected_accomplishments',
      title: 'Selected Accomplishments',
      shortTitle: 'Selected Accomplishments',
      sectionKey: 'selected_accomplishments',
      currentContent: [
        'Delivered complex bundled and technical solutions for existing and prospective customers.',
        'Drove revenue growth across multiple accounts through consultative selling.',
        'Built customer trust through proposal support and solution design.',
      ].join('\n'),
    }));

    expect(result.variants.every((variant) => variant.content.kind === 'bullet_list')).toBe(true);
    expect(result.variants[1]?.content.lines).toContain('Drove revenue growth across multiple accounts through consultative selling.');
  });

  it('replaces paragraph variant text for manual editing', () => {
    const result = buildFallbackSectionDraftResult(makeStep());
    const recommended = result.variants.find((variant) => variant.id === 'recommended');

    expect(recommended).toBeTruthy();
    const updated = replaceSectionDraftVariantText(
      recommended!,
      'Product leader driving regulated-market growth and launch execution.',
    );

    expect(updated.content.kind).toBe('paragraph');
    expect(updated.content.paragraph).toBe('Product leader driving regulated-market growth and launch execution.');
  });
});

describe('buildResumeSectionWorkflowViewModel', () => {
  it('prioritizes grounded job requirements over noisy benchmark stretch items in executive summary coaching', () => {
    const resume: ResumeDraft = {
      header: {
        name: 'Rose Seed',
        phone: '555-555-5555',
        email: 'rose@example.com',
        branded_title: 'Digital Product Leader | AI-Enabled Growth',
      },
      executive_summary: {
        content: 'AI-enabled product leader driving digital transformation across regulated environments.',
        is_new: false,
      },
      core_competencies: [],
      selected_accomplishments: [
        {
          content: 'Launched 5 insurance products in 10 months, improving conversion and customer satisfaction.',
          is_new: false,
          addresses_requirements: ['consultative product launches'],
          confidence: 'strong',
          evidence_found: 'Launched 5 insurance products in 10 months.',
          requirement_source: 'job_description',
        },
      ],
      professional_experience: [],
      education: [],
      certifications: [],
    };

    const workItems: RequirementWorkItem[] = [
      {
        id: 'jd-consultative-launches',
        requirement: 'Consultative product launches',
        source: 'job_description',
        importance: 'must_have',
        candidate_evidence: [
          {
            text: 'Launched 5 insurance products in 10 months.',
            source_type: 'uploaded_resume',
            evidence_strength: 'direct',
          },
        ],
        best_evidence_excerpt: 'Launched 5 insurance products in 10 months.',
        proof_level: 'direct',
        framing_guardrail: 'exact',
        current_claim_strength: 'strengthen',
        next_best_action: 'tighten',
      },
      {
        id: 'benchmark-ai-differentiator',
        requirement: 'AI transformation leadership',
        source: 'benchmark',
        category: 'benchmark_differentiator',
        importance: 'nice_to_have',
        candidate_evidence: [],
        proof_level: 'none',
        framing_guardrail: 'blocked',
        current_claim_strength: 'confirm_fit',
        next_best_action: 'confirm',
      },
    ];

    const workflow = buildResumeSectionWorkflowViewModel({
      resume,
      requirementWorkItems: workItems,
      candidateIntelligence: null,
    });

    const step = workflow.steps.find((item) => item.kind === 'executive_summary');
    expect(step).toBeTruthy();
    expect(step?.topRequirements[0]?.requirement).toBe('Consultative product launches');
    expect(step?.topRequirements.some((item) => item.requirement === 'AI transformation leadership')).toBe(false);
  });
});
