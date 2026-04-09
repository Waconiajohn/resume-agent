// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionDraftStep } from '@/components/resume-v2/workflow/SectionDraftStep';
import type {
  ResumeSectionDraftResult,
  ResumeWorkflowSectionStepViewModel,
} from '@/lib/resume-section-workflow';

function makeStep(): ResumeWorkflowSectionStepViewModel {
  return {
    id: 'executive_summary',
    kind: 'executive_summary',
    title: 'Executive Summary',
    shortTitle: 'Executive Summary',
    sectionKey: 'executive_summary',
    stepNumber: 1,
    totalSteps: 4,
    order: 1,
    currentContent: 'Digital product leader driving growth across regulated environments.',
    currentContentLabel: 'Current summary',
    sectionRationale: 'Lead with identity and fit.',
    needsToDo: ['Make it obvious who you are and why this role fits.'],
    whyThisWorks: ['It should sound like the clearest opening story for the job.'],
    topRequirements: [
      {
        requirement: 'Product leadership',
        source: 'job_description',
        whyItMatters: 'The role needs visible product leadership.',
        evidencePreview: 'Led digital product launches across multiple regulated businesses.',
      },
    ],
  };
}

function makeResult(): ResumeSectionDraftResult {
  return {
    recommendedVariantId: 'recommended',
    variants: [
      {
        id: 'safer',
        label: 'Safer version',
        helper: 'More conservative wording with less stretch.',
        content: {
          kind: 'paragraph',
          paragraph: 'Digital product leader with experience driving growth across regulated environments.',
        },
      },
      {
        id: 'recommended',
        label: 'Recommended version',
        helper: 'Best balance of strength, fit, and defensible wording.',
        content: {
          kind: 'paragraph',
          paragraph: 'Digital product leader driving growth across regulated environments and leading product launches that improve customer outcomes.',
        },
      },
      {
        id: 'stronger',
        label: 'Stronger version if true',
        helper: 'A more assertive version only if every claim fully holds.',
        content: {
          kind: 'paragraph',
          paragraph: 'Digital product executive driving growth, launches, and transformation across regulated environments.',
        },
      },
    ],
    whyItWorks: ['It leads with identity and fit.'],
    strengtheningNote: 'Bring a stronger metric forward if it is already supported.',
  };
}

describe('SectionDraftStep', () => {
  it('sends the current recommended draft into quick AI actions', () => {
    const onRefineDraft = vi.fn().mockResolvedValue(undefined);

    render(
      <SectionDraftStep
        step={makeStep()}
        draftState={{
          status: 'ready',
          result: makeResult(),
          error: null,
        }}
        onGenerateDraft={vi.fn()}
        onRefineDraft={onRefineDraft}
        onApplyVariant={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Make it stronger' }));

    expect(onRefineDraft).toHaveBeenCalledWith(
      'make_stronger',
      'Digital product leader driving growth across regulated environments and leading product launches that improve customer outcomes.',
    );
  });
});
