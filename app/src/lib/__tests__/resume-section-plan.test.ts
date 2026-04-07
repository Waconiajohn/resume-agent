import { describe, expect, it } from 'vitest';

import type { CandidateIntelligence, ResumeDraft } from '@/types/resume-v2';
import {
  addResumeCustomSection,
  addOrEnableAIHighlightsSection,
  buildResumeSectionPlan,
  getEnabledResumeSectionPlan,
} from '../resume-section-plan';
import { resumeDraftToFinalResume } from '../resume-v2-export';

function makeResumeDraft(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'Chief Operating Officer',
    },
    executive_summary: {
      content: 'Operator who scales teams and systems.',
      is_new: false,
    },
    core_competencies: ['Operations', 'Transformation'],
    selected_accomplishments: [
      {
        content: 'Reduced defects by 25% across three plants.',
        is_new: false,
        addresses_requirements: ['Operational rigor'],
        confidence: 'strong',
        evidence_found: 'Reduced defects by 25% across three plants.',
        requirement_source: 'job_description',
      },
    ],
    professional_experience: [
      {
        company: 'Acme',
        title: 'COO',
        start_date: '2020',
        end_date: 'Present',
        scope_statement: 'Led plant operations and transformation.',
        bullets: [
          {
            text: 'Built KPI reviews and line-performance meetings across 3 sites.',
            is_new: false,
            addresses_requirements: ['KPI ownership'],
            confidence: 'partial',
            evidence_found: 'Built KPI reviews and line-performance meetings across 3 sites.',
            requirement_source: 'job_description',
          },
        ],
      },
    ],
    earlier_career: [],
    education: [{ degree: 'MBA', institution: 'State University' }],
    certifications: [],
  };
}

function makeCandidate(): CandidateIntelligence {
  return {
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-0100',
    },
    career_themes: ['Transformation'],
    leadership_scope: 'Regional operations',
    quantified_outcomes: [],
    industry_depth: ['Manufacturing'],
    technologies: ['SAP'],
    operational_scale: '3 sites',
    career_span_years: 18,
    experience: [],
    education: [],
    certifications: [],
    hidden_accomplishments: [],
    ai_readiness: {
      strength: 'moderate',
      signals: [
        {
          family: 'automation',
          evidence: 'Rolled out workflow automation across operations.',
          executive_framing: 'Applied automation and data workflows to tighten operating rhythm across multiple sites.',
        },
      ],
      summary: 'Demonstrated AI-adjacent readiness through automation, data workflows, and operating-model change.',
    },
  };
}

describe('resume-section-plan', () => {
  it('builds a plan that keeps standard sections and custom sections in one ordered list', () => {
    const resume = makeResumeDraft();
    const withAI = addOrEnableAIHighlightsSection(resume, makeCandidate(), []);
    const plan = buildResumeSectionPlan(withAI);

    expect(plan.map((item) => item.id)).toContain('executive_summary');
    expect(plan.map((item) => item.id)).toContain('professional_experience');
    expect(plan.map((item) => item.id)).toContain('ai_highlights');
    expect(plan.find((item) => item.id === 'ai_highlights')?.enabled).toBe(true);
  });

  it('exports enabled section order and raw text for custom sections', () => {
    const resume = addOrEnableAIHighlightsSection(makeResumeDraft(), makeCandidate(), []);
    const finalResume = resumeDraftToFinalResume(resume, { companyName: 'Acme', jobTitle: 'COO', atsScore: 88 });
    const enabledOrder = getEnabledResumeSectionPlan(resume).map((item) => item.id === 'executive_summary' ? 'summary' : item.id === 'core_competencies' ? 'skills' : item.id === 'professional_experience' ? 'experience' : item.id);

    expect(finalResume.section_order).toEqual(enabledOrder);
    expect(finalResume._raw_sections?.ai_highlights).toContain('Applied automation and data workflows');
  });

  it('adds custom preset sections before professional experience with real starter content', () => {
    const resume = addResumeCustomSection(makeResumeDraft(), {
      presetId: 'board_advisory',
      title: 'Board & Advisory Experience',
      firstLine: 'Presented operating reviews and transformation progress to the board and PE sponsors.',
    });

    expect(resume.custom_sections).toEqual([
      expect.objectContaining({
        id: 'board_advisory',
        title: 'Board & Advisory Experience',
        lines: ['Presented operating reviews and transformation progress to the board and PE sponsors.'],
      }),
    ]);

    const plan = buildResumeSectionPlan(resume);
    const boardIndex = plan.findIndex((item) => item.id === 'board_advisory');
    const experienceIndex = plan.findIndex((item) => item.id === 'professional_experience');
    expect(boardIndex).toBeGreaterThan(-1);
    expect(boardIndex).toBeLessThan(experienceIndex);
  });
});
