// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResumeStructurePlannerCard } from '../cards/ResumeStructurePlannerCard';
import type { CandidateIntelligence, RequirementWorkItem, ResumeDraft } from '@/types/resume-v2';

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
    selected_accomplishments: [],
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
    career_themes: ['Transformation', 'Operational Excellence'],
    leadership_scope: 'Regional operations',
    quantified_outcomes: [
      {
        outcome: 'improved throughput by 18%',
        metric_type: 'scope',
        value: '18%',
      },
    ],
    industry_depth: ['Manufacturing'],
    technologies: ['SAP'],
    operational_scale: '3 sites',
    career_span_years: 18,
    experience: [
      {
        company: 'Acme',
        title: 'COO',
        start_date: '2020',
        end_date: 'Present',
        bullets: ['Led a multi-site transformation program that modernized reporting and operating cadence.'],
      },
    ],
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

function makeTransformationWorkItems(): RequirementWorkItem[] {
  return [
    {
      id: 'transform-work',
      requirement: 'Lead automation and operating-model transformation',
      source: 'job_description',
      importance: 'important',
      candidate_evidence: [
        {
          text: 'Rolled out workflow automation across operations.',
          source_type: 'uploaded_resume',
          evidence_strength: 'adjacent',
        },
      ],
      best_evidence_excerpt: 'Rolled out workflow automation across operations.',
      proof_level: 'adjacent',
      framing_guardrail: 'reframe',
      current_claim_strength: 'strengthen',
      next_best_action: 'tighten',
    },
  ];
}

describe('ResumeStructurePlannerCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('prefills a suggested starter when opening the add-section composer', () => {
    render(
      <ResumeStructurePlannerCard
        resume={makeResumeDraft()}
        candidateIntelligence={makeCandidate()}
        requirementWorkItems={[]}
        onMoveSection={vi.fn()}
        onToggleSection={vi.fn()}
        onAddAISection={vi.fn()}
        onAddCustomSection={vi.fn()}
        onRemoveCustomSection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /add section/i })[0]);

    expect(screen.getByText(/suggested section drafts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/section title/i)).toHaveValue('Selected Projects');
    expect(screen.getByLabelText(/opening lines/i)).toHaveValue([
      'Led transformation and operational excellence initiatives that improved throughput by 18% (18%).',
      'Led a multi-site transformation program that modernized reporting and operating cadence.',
    ].join('\n'));
  });

  it('updates the suggested starter when switching presets', () => {
    render(
      <ResumeStructurePlannerCard
        resume={makeResumeDraft()}
        candidateIntelligence={makeCandidate()}
        requirementWorkItems={[]}
        onMoveSection={vi.fn()}
        onToggleSection={vi.fn()}
        onAddAISection={vi.fn()}
        onAddCustomSection={vi.fn()}
        onRemoveCustomSection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /add section/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /transformation highlights/i }));

    expect(screen.getByLabelText(/section title/i)).toHaveValue('Transformation Highlights');
    expect(screen.getByLabelText(/opening lines/i)).toHaveValue([
      'Applied automation and data workflows to tighten operating rhythm across multiple sites.',
      'Drove transformation initiatives across 3 sites that improved throughput by 18% (18%).',
    ].join('\n'));
  });

  it('surfaces recommended custom sections for the role and opens the matching draft', () => {
    render(
      <ResumeStructurePlannerCard
        resume={makeResumeDraft()}
        candidateIntelligence={makeCandidate()}
        requirementWorkItems={makeTransformationWorkItems()}
        onMoveSection={vi.fn()}
        onToggleSection={vi.fn()}
        onAddAISection={vi.fn()}
        onAddCustomSection={vi.fn()}
        onRemoveCustomSection={vi.fn()}
      />,
    );

    expect(screen.getByText(/recommended section adds/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /preview draft/i })[0]);

    expect(screen.getByLabelText(/section title/i)).toHaveValue('Transformation Highlights');
    expect(screen.getByLabelText(/opening lines/i)).toHaveValue([
      'Applied automation and data workflows to tighten operating rhythm across multiple sites.',
      'Led transformation work across 3 sites while rolled out workflow automation across operations.',
      'Drove transformation initiatives across 3 sites that improved throughput by 18% (18%).',
    ].join('\n'));
  });

  it('can add a recommended section immediately without opening the composer first', () => {
    const onAddCustomSection = vi.fn();

    render(
      <ResumeStructurePlannerCard
        resume={makeResumeDraft()}
        candidateIntelligence={makeCandidate()}
        requirementWorkItems={makeTransformationWorkItems()}
        onMoveSection={vi.fn()}
        onToggleSection={vi.fn()}
        onAddAISection={vi.fn()}
        onAddCustomSection={onAddCustomSection}
        onRemoveCustomSection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /add now/i })[0]);

    expect(onAddCustomSection).toHaveBeenCalledWith(
      'Transformation Highlights',
      [
        'Applied automation and data workflows to tighten operating rhythm across multiple sites.',
        'Led transformation work across 3 sites while rolled out workflow automation across operations.',
        'Drove transformation initiatives across 3 sites that improved throughput by 18% (18%).',
      ],
      'transformation_highlights',
    );
  });
});
