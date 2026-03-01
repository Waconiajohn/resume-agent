// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SafePanelContent, validatePanelData } from '../../components/panels/panel-renderer';
import type { PanelData } from '../../types/panels';

// ---------------------------------------------------------------------------
// Mocks — stub heavy sub-components so tests stay unit-level and fast
// ---------------------------------------------------------------------------

vi.mock('../../components/panels/PositioningInterviewPanel', () => ({
  PositioningInterviewPanel: () => <div data-testid="positioning-interview-panel">PositioningInterviewPanel</div>,
}));

vi.mock('../../components/panels/BlueprintReviewPanel', () => ({
  BlueprintReviewPanel: () => <div data-testid="blueprint-review-panel">BlueprintReviewPanel</div>,
}));

vi.mock('../../components/panels/QualityDashboardPanel', () => ({
  QualityDashboardPanel: () => <div data-testid="quality-dashboard-panel">QualityDashboardPanel</div>,
}));

vi.mock('../../components/panels/CompletionPanel', () => ({
  CompletionPanel: () => <div data-testid="completion-panel">CompletionPanel</div>,
}));

vi.mock('../../components/panels/OnboardingSummaryPanel', () => ({
  OnboardingSummaryPanel: () => <div data-testid="onboarding-summary-panel">OnboardingSummaryPanel</div>,
}));

vi.mock('../../components/panels/ResearchDashboardPanel', () => ({
  ResearchDashboardPanel: () => <div data-testid="research-dashboard-panel">ResearchDashboardPanel</div>,
}));

vi.mock('../../components/panels/GapAnalysisPanel', () => ({
  GapAnalysisPanel: () => <div data-testid="gap-analysis-panel">GapAnalysisPanel</div>,
}));

vi.mock('../../components/panels/DesignOptionsPanel', () => ({
  DesignOptionsPanel: () => <div data-testid="design-options-panel">DesignOptionsPanel</div>,
}));

vi.mock('../../components/panels/LiveResumePanel', () => ({
  LiveResumePanel: () => <div data-testid="live-resume-panel">LiveResumePanel</div>,
}));

vi.mock('../../components/panels/SectionWorkbench', () => ({
  SectionWorkbench: () => <div data-testid="section-workbench">SectionWorkbench</div>,
}));

vi.mock('../../components/panels/QuestionnairePanel', () => ({
  QuestionnairePanel: () => <div data-testid="questionnaire-panel">QuestionnairePanel</div>,
}));

vi.mock('../../components/ResumePanel', () => ({
  ResumePanel: () => <div data-testid="resume-panel">ResumePanel</div>,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const positioningInterviewData: PanelData = {
  type: 'positioning_interview',
  questions_total: 10,
  questions_answered: 3,
};

const blueprintReviewData: PanelData = {
  type: 'blueprint_review',
  target_role: 'VP of Engineering',
  positioning_angle: 'Systems thinker who scales teams.',
  section_plan: { order: ['summary', 'experience', 'skills'], rationale: 'Standard order.' },
  age_protection: { flags: [], clean: true },
  evidence_allocation_count: 5,
  keyword_count: 12,
};

const qualityDashboardData: PanelData = {
  type: 'quality_dashboard',
  ats_score: 82,
};

const completionData: PanelData = {
  type: 'completion',
  ats_score: 88,
  requirements_addressed: 14,
};

const onboardingData: PanelData = {
  type: 'onboarding_summary',
  years_of_experience: 12,
};

const liveResumeData: PanelData = {
  type: 'live_resume',
  active_section: 'experience',
  changes: [],
};

const sectionReviewData: PanelData = {
  type: 'section_review',
  section: 'summary',
  content: 'Experienced engineering leader.',
  review_token: 'tok_abc',
};

const questionnaireData: PanelData = {
  type: 'questionnaire',
  questionnaire_id: 'q-001',
  schema_version: 1,
  stage: 'intake',
  title: 'Intake Questionnaire',
  questions: [],
  current_index: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SafePanelContent — panel dispatch', () => {
  afterEach(() => cleanup());

  it('renders null panelData as ResumePanel fallback', () => {
    render(
      <SafePanelContent panelType={null} panelData={null} resume={null} />,
    );
    expect(screen.getByTestId('resume-panel')).toBeInTheDocument();
  });

  it('dispatches positioning_interview to PositioningInterviewPanel', () => {
    render(
      <SafePanelContent
        panelType="positioning_interview"
        panelData={positioningInterviewData}
        resume={null}
      />,
    );
    expect(screen.getByTestId('positioning-interview-panel')).toBeInTheDocument();
  });

  it('dispatches blueprint_review to BlueprintReviewPanel', () => {
    render(
      <SafePanelContent
        panelType="blueprint_review"
        panelData={blueprintReviewData}
        resume={null}
      />,
    );
    expect(screen.getByTestId('blueprint-review-panel')).toBeInTheDocument();
  });

  it('dispatches quality_dashboard to QualityDashboardPanel', () => {
    render(
      <SafePanelContent
        panelType="quality_dashboard"
        panelData={qualityDashboardData}
        resume={null}
      />,
    );
    expect(screen.getByTestId('quality-dashboard-panel')).toBeInTheDocument();
  });

  it('dispatches completion to CompletionPanel', () => {
    render(
      <SafePanelContent
        panelType="completion"
        panelData={completionData}
        resume={null}
      />,
    );
    expect(screen.getByTestId('completion-panel')).toBeInTheDocument();
  });

  it('dispatches onboarding_summary to OnboardingSummaryPanel', () => {
    render(
      <SafePanelContent
        panelType="onboarding_summary"
        panelData={onboardingData}
        resume={null}
      />,
    );
    expect(screen.getByTestId('onboarding-summary-panel')).toBeInTheDocument();
  });

  it('dispatches live_resume to LiveResumePanel', () => {
    render(
      <SafePanelContent
        panelType="live_resume"
        panelData={liveResumeData}
        resume={null}
      />,
    );
    expect(screen.getByTestId('live-resume-panel')).toBeInTheDocument();
  });

  it('dispatches section_review to SectionWorkbench', () => {
    render(
      <SafePanelContent
        panelType="section_review"
        panelData={sectionReviewData}
        resume={null}
      />,
    );
    expect(screen.getByTestId('section-workbench')).toBeInTheDocument();
  });

  it('dispatches questionnaire to QuestionnairePanel', () => {
    render(
      <SafePanelContent
        panelType="questionnaire"
        panelData={questionnaireData}
        resume={null}
      />,
    );
    expect(screen.getByTestId('questionnaire-panel')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// validatePanelData — validation logic
// ---------------------------------------------------------------------------

describe('validatePanelData', () => {
  it('returns null for null input', () => {
    expect(validatePanelData(null)).toBeNull();
  });

  it('returns null for valid positioning_interview payload', () => {
    expect(validatePanelData(positioningInterviewData)).toBeNull();
  });

  it('returns error string when positioning_interview is missing required numeric fields', () => {
    const bad = { type: 'positioning_interview', questions_total: 'bad', questions_answered: 0 } as unknown as PanelData;
    expect(validatePanelData(bad)).toBeTruthy();
  });

  it('returns null for valid blueprint_review payload', () => {
    expect(validatePanelData(blueprintReviewData)).toBeNull();
  });

  it('returns error when blueprint_review missing section_plan.order', () => {
    const bad: PanelData = {
      type: 'blueprint_review',
      target_role: 'VP Eng',
      positioning_angle: 'angle',
      section_plan: { order: null as unknown as string[], rationale: '' },
      age_protection: { flags: [], clean: true },
      evidence_allocation_count: 0,
      keyword_count: 0,
    };
    expect(validatePanelData(bad)).toBeTruthy();
  });

  it('returns null for valid section_review payload', () => {
    expect(validatePanelData(sectionReviewData)).toBeNull();
  });

  it('returns error when section_review is missing content', () => {
    const bad = { type: 'section_review', section: 'summary' } as unknown as PanelData;
    expect(validatePanelData(bad)).toBeTruthy();
  });

  it('returns null for valid live_resume payload', () => {
    expect(validatePanelData(liveResumeData)).toBeNull();
  });

  it('returns error when live_resume missing active_section', () => {
    const bad = { type: 'live_resume', changes: [] } as unknown as PanelData;
    expect(validatePanelData(bad)).toBeTruthy();
  });

  it('returns null for valid questionnaire payload', () => {
    expect(validatePanelData(questionnaireData)).toBeNull();
  });

  it('returns error when questionnaire missing questions array', () => {
    const bad = { type: 'questionnaire', questionnaire_id: 'x' } as unknown as PanelData;
    expect(validatePanelData(bad)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PanelErrorBoundary — graceful fallback rendering
// ---------------------------------------------------------------------------

describe('SafePanelContent — error boundary', () => {
  afterEach(() => cleanup());

  it('shows validation error message when panelData fails validation', () => {
    // blueprint_review with missing section_plan.order triggers validation error
    const badData: PanelData = {
      type: 'blueprint_review',
      target_role: 'VP',
      positioning_angle: 'angle',
      section_plan: { order: null as unknown as string[], rationale: '' },
      age_protection: { flags: [], clean: true },
      evidence_allocation_count: 0,
      keyword_count: 0,
    };

    render(
      <SafePanelContent
        panelType="blueprint_review"
        panelData={badData}
        resume={null}
      />,
    );

    // The PanelError component renders the validation message
    expect(screen.getByText('Blueprint payload is missing section order.')).toBeInTheDocument();
  });
});
