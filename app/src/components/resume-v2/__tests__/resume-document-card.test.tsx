// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ResumeDocumentCard } from '../cards/ResumeDocumentCard';
import type { ResumeDraft } from '@/types/resume-v2';

describe('ResumeDocumentCard', () => {
  it('renders safely when runtime draft arrays are missing', () => {
    const runtimeResume = {
      header: {
        name: 'Jane Doe',
        phone: '555-0100',
        email: 'jane@example.com',
        branded_title: 'VP Engineering',
      },
      executive_summary: {
        content: 'Seasoned engineering leader driving outcomes at scale.',
        is_new: false,
      },
      core_competencies: undefined,
      selected_accomplishments: undefined,
      professional_experience: undefined,
      earlier_career: undefined,
      education: undefined,
      certifications: undefined,
    } as unknown as ResumeDraft;

    render(<ResumeDocumentCard resume={runtimeResume} />);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByText('Core Competencies')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected Accomplishments')).not.toBeInTheDocument();
    expect(screen.queryByText('Professional Experience')).not.toBeInTheDocument();
    expect(screen.queryByText('Education')).not.toBeInTheDocument();
    expect(screen.queryByText('Certifications')).not.toBeInTheDocument();
  });

  it('keeps review jargon off the visible resume surface', () => {
    const resume = {
      header: {
        name: 'Jane Doe',
        phone: '555-0100',
        email: 'jane@example.com',
        branded_title: 'VP Engineering',
      },
      executive_summary: {
        content: 'Seasoned engineering leader driving outcomes at scale.',
        is_new: false,
      },
      core_competencies: [],
      selected_accomplishments: [
        {
          content: 'Grew revenue by launching three product lines.',
          is_new: false,
          addresses_requirements: ['Revenue growth'],
          confidence: 'needs_validation',
          review_state: 'code_red',
          requirement_source: 'job_description',
          evidence_found: 'Partnered with sales and marketing on launches.',
        },
      ],
      professional_experience: [],
      earlier_career: [],
      education: [],
      certifications: [],
    } as unknown as ResumeDraft;

    render(<ResumeDocumentCard resume={resume} />);

    expect(screen.queryByText(/Needs proof/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Job need/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Active in coach/i)).not.toBeInTheDocument();
  });

});
