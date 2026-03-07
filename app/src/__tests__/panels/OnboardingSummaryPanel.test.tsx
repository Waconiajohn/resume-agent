// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { OnboardingSummaryPanel } from '../../components/panels/OnboardingSummaryPanel';
import type { OnboardingSummaryData } from '../../types/panels';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeData(overrides?: Partial<OnboardingSummaryData> & Record<string, unknown>): OnboardingSummaryData {
  return {
    years_of_experience: 15,
    companies_count: 4,
    skills_count: 28,
    leadership_span: '50-200 people',
    budget_responsibility: '$10M-$50M',
    parse_confidence: 'high',
    parse_warnings: [],
    strengths: ['Strategic planning', 'Cross-functional leadership'],
    opportunities: ['Digital transformation experience underrepresented'],
    ...overrides,
  } as OnboardingSummaryData;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OnboardingSummaryPanel', () => {
  afterEach(() => cleanup());

  // --- Header ---
  it('renders the panel header', () => {
    render(<OnboardingSummaryPanel data={makeData()} />);
    expect(screen.getByText("Here's What We Found")).toBeInTheDocument();
  });

  // --- Stat Cards ---
  it('renders stat cards for each metric with a value', () => {
    render(<OnboardingSummaryPanel data={makeData()} />);
    expect(screen.getByText('Years Experience')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Companies')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Skills Identified')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('Leadership Span')).toBeInTheDocument();
    expect(screen.getByText('50-200 people')).toBeInTheDocument();
    expect(screen.getByText('Budget Scope')).toBeInTheDocument();
    expect(screen.getByText('$10M-$50M')).toBeInTheDocument();
  });

  it('does not render stat cards for null/undefined values', () => {
    render(<OnboardingSummaryPanel data={makeData({ years_of_experience: undefined, companies_count: undefined })} />);
    expect(screen.queryByText('Years Experience')).not.toBeInTheDocument();
    expect(screen.queryByText('Companies')).not.toBeInTheDocument();
    // Others still render
    expect(screen.getByText('Skills Identified')).toBeInTheDocument();
  });

  // --- Parse Confidence Badges ---
  it('renders high confidence badge', () => {
    render(<OnboardingSummaryPanel data={makeData({ parse_confidence: 'high' })} />);
    expect(screen.getByText('Resume read successfully')).toBeInTheDocument();
  });

  it('renders medium confidence badge', () => {
    render(<OnboardingSummaryPanel data={makeData({ parse_confidence: 'medium' })} />);
    expect(screen.getByText('Some details may need review')).toBeInTheDocument();
  });

  it('renders low confidence badge', () => {
    render(<OnboardingSummaryPanel data={makeData({ parse_confidence: 'low' })} />);
    expect(screen.getByText('We may have missed some details')).toBeInTheDocument();
  });

  it('does not render confidence badge when undefined', () => {
    render(<OnboardingSummaryPanel data={makeData({ parse_confidence: undefined, parse_warnings: [] })} />);
    expect(screen.queryByText('Resume read successfully')).not.toBeInTheDocument();
    expect(screen.queryByText('Some details may need review')).not.toBeInTheDocument();
    expect(screen.queryByText('We may have missed some details')).not.toBeInTheDocument();
  });

  // --- Parse Warnings ---
  it('renders parse warnings when present', () => {
    render(
      <OnboardingSummaryPanel
        data={makeData({ parse_warnings: ['Missing dates for role at Acme', 'Skills section not found'] })}
      />,
    );
    expect(screen.getByText('Missing dates for role at Acme')).toBeInTheDocument();
    expect(screen.getByText('Skills section not found')).toBeInTheDocument();
  });

  it('does not render warnings when list is empty', () => {
    render(<OnboardingSummaryPanel data={makeData({ parse_warnings: [] })} />);
    expect(screen.queryByText('Missing dates for role at Acme')).not.toBeInTheDocument();
  });

  // --- Strengths ---
  it('renders strengths section when strengths exist', () => {
    render(<OnboardingSummaryPanel data={makeData()} />);
    expect(screen.getByText('Your Standout Strengths')).toBeInTheDocument();
    expect(screen.getByText('Strategic planning')).toBeInTheDocument();
    expect(screen.getByText('Cross-functional leadership')).toBeInTheDocument();
  });

  it('does not render strengths section when list is empty', () => {
    render(<OnboardingSummaryPanel data={makeData({ strengths: [] })} />);
    expect(screen.queryByText('Your Standout Strengths')).not.toBeInTheDocument();
  });

  // --- Opportunities ---
  it('renders opportunities section when opportunities exist', () => {
    render(<OnboardingSummaryPanel data={makeData()} />);
    expect(screen.getByText('Opportunities to Address')).toBeInTheDocument();
    expect(screen.getByText('Digital transformation experience underrepresented')).toBeInTheDocument();
  });

  it('does not render opportunities section when list is empty', () => {
    render(<OnboardingSummaryPanel data={makeData({ opportunities: [] })} />);
    expect(screen.queryByText('Opportunities to Address')).not.toBeInTheDocument();
  });

  // --- Nested data normalization ---
  it('normalizes nested stats shape (stats.total_companies)', () => {
    const nestedData = {
      stats: { years_of_experience: 20, total_companies: 6, total_skills: 35 },
      standout_strengths: ['Executive presence'],
      immediate_observations: ['Needs more metrics'],
    } as unknown as OnboardingSummaryData;
    render(<OnboardingSummaryPanel data={nestedData} />);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('Executive presence')).toBeInTheDocument();
    expect(screen.getByText('Needs more metrics')).toBeInTheDocument();
  });

  // --- Minimal data ---
  it('renders without crashing with empty data', () => {
    render(<OnboardingSummaryPanel data={{}} />);
    expect(screen.getByText("Here's What We Found")).toBeInTheDocument();
  });
});
