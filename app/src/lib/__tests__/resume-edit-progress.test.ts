import { describe, expect, it } from 'vitest';

import {
  applyOptimisticRequirementWorkItemProgress,
  applyOptimisticResumeEdit,
} from '@/lib/resume-edit-progress';
import type { RequirementWorkItem, ResumeDraft } from '@/types/resume-v2';

function makeResumeDraft(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Engineering',
    },
    executive_summary: {
      content: 'Seasoned engineering leader driving outcomes at scale.',
      is_new: false,
      addresses_requirements: ['Product delivery'],
    },
    core_competencies: ['Team Leadership', 'Cloud Architecture'],
    selected_accomplishments: [],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        scope_statement: 'Led org of 45 engineers',
        bullets: [
          {
            text: 'Owned delivery rhythm across the platform team.',
            is_new: true,
            addresses_requirements: ['Develop and track performance metrics'],
            confidence: 'needs_validation',
            review_state: 'code_red',
            evidence_found: '',
            requirement_source: 'job_description',
            work_item_id: 'work-item-metrics',
            proof_level: 'none',
            framing_guardrail: 'blocked',
            next_best_action: 'answer',
          },
          {
            text: 'Built weekly KPI reviews and line-performance meetings across 3 sites.',
            is_new: true,
            addresses_requirements: ['Develop and track performance metrics'],
            confidence: 'partial',
            review_state: 'strengthen',
            evidence_found: 'Built weekly KPI reviews and line-performance meetings across 3 sites.',
            requirement_source: 'job_description',
            work_item_id: 'work-item-kpi',
            proof_level: 'adjacent',
            framing_guardrail: 'reframe',
            next_best_action: 'tighten',
          },
        ],
      },
    ],
    education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2005' }],
    certifications: [],
  };
}

function makeWorkItems(): RequirementWorkItem[] {
  return [
    {
      id: 'work-item-metrics',
      requirement: 'Develop and track performance metrics',
      source: 'job_description',
      importance: 'must_have',
      candidate_evidence: [],
      proof_level: 'none',
      framing_guardrail: 'blocked',
      current_claim_strength: 'code_red',
      next_best_action: 'answer',
    },
    {
      id: 'work-item-kpi',
      requirement: 'Develop and track performance metrics',
      source: 'job_description',
      importance: 'must_have',
      candidate_evidence: [
        {
          text: 'Built weekly KPI reviews and line-performance meetings across 3 sites.',
          source_type: 'uploaded_resume',
          evidence_strength: 'adjacent',
        },
      ],
      best_evidence_excerpt: 'Built weekly KPI reviews and line-performance meetings across 3 sites.',
      proof_level: 'adjacent',
      framing_guardrail: 'reframe',
      current_claim_strength: 'strengthen',
      next_best_action: 'tighten',
    },
  ];
}

describe('resume edit progress', () => {
  it('promotes code-red lines into strengthen after an accepted rewrite', () => {
    const resume = makeResumeDraft();

    const updatedResume = applyOptimisticResumeEdit(resume, {
      section: 'professional_experience',
      index: 0,
      newText: 'Built weekly KPI reviews and operating cadence across the platform org.',
      metadata: {
        requirement: 'Develop and track performance metrics',
        requirements: ['Develop and track performance metrics'],
        reviewState: 'code_red',
        requirementSource: 'job_description',
        evidenceFound: '',
        workItemId: 'work-item-metrics',
        proofLevel: 'none',
        nextBestAction: 'answer',
      },
    });

    expect(updatedResume.professional_experience[0].bullets[0]).toEqual(expect.objectContaining({
      text: 'Built weekly KPI reviews and operating cadence across the platform org.',
      review_state: 'strengthen',
      confidence: 'partial',
      proof_level: 'adjacent',
      framing_guardrail: 'reframe',
      next_best_action: 'tighten',
      evidence_found: 'Built weekly KPI reviews and operating cadence across the platform org.',
    }));

    const updatedWorkItems = applyOptimisticRequirementWorkItemProgress(
      makeWorkItems(),
      'Built weekly KPI reviews and operating cadence across the platform org.',
      {
        requirement: 'Develop and track performance metrics',
        reviewState: 'code_red',
        requirementSource: 'job_description',
        workItemId: 'work-item-metrics',
        proofLevel: 'none',
        nextBestAction: 'answer',
      },
    );

    expect(updatedWorkItems?.[0]).toEqual(expect.objectContaining({
      current_claim_strength: 'strengthen',
      proof_level: 'adjacent',
      next_best_action: 'tighten',
      recommended_bullet: 'Built weekly KPI reviews and operating cadence across the platform org.',
    }));
  });

  it('promotes strengthen lines into supported rewrites after acceptance', () => {
    const resume = makeResumeDraft();

    const updatedResume = applyOptimisticResumeEdit(resume, {
      section: 'professional_experience',
      index: 1,
      newText: 'Built weekly KPI reviews across 3 sites that improved throughput and safety decisions.',
      metadata: {
        requirement: 'Develop and track performance metrics',
        requirements: ['Develop and track performance metrics'],
        reviewState: 'strengthen',
        requirementSource: 'job_description',
        evidenceFound: 'Built weekly KPI reviews and line-performance meetings across 3 sites.',
        workItemId: 'work-item-kpi',
        proofLevel: 'adjacent',
        nextBestAction: 'tighten',
      },
    });

    expect(updatedResume.professional_experience[0].bullets[1]).toEqual(expect.objectContaining({
      review_state: 'supported_rewrite',
      confidence: 'strong',
      proof_level: 'direct',
      framing_guardrail: 'exact',
      next_best_action: 'accept',
      evidence_found: 'Built weekly KPI reviews and line-performance meetings across 3 sites.',
    }));
  });
});
