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

    expect(screen.getByText(/No original resume support found yet/i)).toBeInTheDocument();
    expect(screen.getByText('Confirm & Keep')).toBeInTheDocument();
  });

  it('shows one primary target and target-specific evidence in the inline panel', () => {
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
          content: 'Drove $40M expansion revenue through consultative enterprise sales programs',
          is_new: false,
          addresses_requirements: ['Bachelor\'s degree', 'Consultative, solutions-based selling background'],
          primary_target_requirement: 'Consultative, solutions-based selling background',
          primary_target_source: 'job_description',
          target_evidence: 'Expanded strategic accounts through solutions-based selling.',
          evidence_found: '$40M revenue growth across enterprise accounts',
          confidence: 'partial',
          requirement_source: 'job_description',
        },
      ],
      professional_experience: [],
      education: [],
      certifications: [],
    } as unknown as ResumeDraft;

    render(
      <ResumeDocumentCard
        resume={runtimeResume}
        requirementCatalog={[
          { requirement: "Bachelor's degree", source: 'job_description' },
          { requirement: 'Consultative, solutions-based selling background', source: 'job_description' },
        ]}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onRequestEdit={() => {}}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    expect(screen.getByText('Current line')).toBeInTheDocument();
    expect(screen.getByText('Consultative, solutions-based selling background')).toBeInTheDocument();
    expect(screen.queryByText(/\$40M revenue growth across enterprise accounts/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Expanded strategic accounts through solutions-based selling/i)).toBeInTheDocument();
  });

  it('shows nearby proof when a line lacks direct target evidence', () => {
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
          content: 'Led platform modernization across three business units',
          is_new: false,
          addresses_requirements: ['Transformation leadership'],
          primary_target_requirement: 'Transformation leadership',
          primary_target_source: 'job_description',
          target_evidence: '',
          evidence_found: 'Reduced deployment time from 45 minutes to 8 minutes through pipeline optimization',
          confidence: 'strong',
          review_state: 'strengthen',
          requirement_source: 'job_description',
          content_origin: 'resume_rewrite',
          support_origin: 'original_resume',
        },
      ],
      professional_experience: [],
      education: [],
      certifications: [],
    } as unknown as ResumeDraft;

    render(
      <ResumeDocumentCard
        resume={runtimeResume}
        requirementCatalog={[
          { requirement: 'Transformation leadership', source: 'job_description' },
        ]}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onRequestEdit={() => {}}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    expect(screen.getByText('Nearby proof we can use')).toBeInTheDocument();
    expect(screen.getByText(/does not directly prove the target yet, but it gives us real resume proof to build from/i)).toBeInTheDocument();
    expect(screen.getByText(/Reduced deployment time from 45 minutes to 8 minutes through pipeline optimization/i)).toBeInTheDocument();
    expect(screen.getByText('Nearby resume proof')).toBeInTheDocument();
  });
});
