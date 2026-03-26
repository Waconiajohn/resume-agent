// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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

  it('opens the bullet popover safely when runtime bullet metadata is missing', () => {
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
      core_competencies: [],
      selected_accomplishments: [
        {
          content: 'Built a transformation roadmap across the org',
          is_new: false,
          addresses_requirements: ['Transformation'],
        },
      ],
      professional_experience: [],
      education: [],
      certifications: [],
    } as unknown as ResumeDraft;

    render(<ResumeDocumentCard resume={runtimeResume} />);

    fireEvent.click(screen.getByText('Built a transformation roadmap across the org'));

    expect(screen.getByText('No original resume support found yet')).toBeInTheDocument();
    expect(screen.getByText('I Can Support This')).toBeInTheDocument();
  });
});
