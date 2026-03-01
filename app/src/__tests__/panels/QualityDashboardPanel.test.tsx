// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QualityDashboardPanel } from '../../components/panels/QualityDashboardPanel';
import type { QualityDashboardData } from '../../types/panels';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeData(overrides?: Partial<QualityDashboardData>): QualityDashboardData {
  return {
    ats_score: 78,
    keyword_coverage: 82,
    authenticity_score: 91,
    evidence_integrity: 85,
    blueprint_compliance: 88,
    narrative_coherence: 74,
    hiring_manager: {
      pass: true,
      checklist_total: 38,
      checklist_max: 50,
      checklist_scores: {
        impact: 4,
        clarity: 5,
        relevance: 3,
      },
    },
    risk_flags: [],
    age_bias_risks: [],
    overall_assessment: 'Strong candidate positioning with clear value proposition.',
    ats_findings: [],
    humanize_issues: [],
    coherence_issues: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityDashboardPanel', () => {
  afterEach(() => cleanup());

  // 1. Panel header renders
  it('renders the Quality Dashboard header', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(screen.getByText('Quality Dashboard')).toBeInTheDocument();
  });

  // 2. Renders quality score rings
  it('renders ATS score ring', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(screen.getByRole('img', { name: /ATS/i })).toBeInTheDocument();
  });

  it('renders Authenticity score ring', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(screen.getByRole('img', { name: /Authenticity/i })).toBeInTheDocument();
  });

  it('renders keyword coverage percentage', () => {
    render(<QualityDashboardPanel data={makeData({ keyword_coverage: 82 })} />);
    expect(screen.getByText('82%')).toBeInTheDocument();
  });

  // 3. Renders overall assessment text
  it('renders the overall assessment text', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(
      screen.getByText('Strong candidate positioning with clear value proposition.'),
    ).toBeInTheDocument();
  });

  // 4. Handles empty findings gracefully
  it('does not render ATS findings section when list is empty', () => {
    render(<QualityDashboardPanel data={makeData({ ats_findings: [] })} />);
    expect(screen.queryByText('ATS Findings')).not.toBeInTheDocument();
  });

  // 5. ATS findings render when populated
  it('renders ATS findings section when findings exist', () => {
    const data = makeData({
      ats_findings: [
        { issue: 'Missing keyword: cloud infrastructure', priority: 'high' },
        { issue: 'Date format inconsistency', priority: 'low' },
      ],
    });
    render(<QualityDashboardPanel data={data} />);
    // Collapsible section header renders
    expect(screen.getByText('ATS Findings')).toBeInTheDocument();
  });

  // 6. ATS findings are collapsed by default; expanding shows content
  it('expands ATS findings on click to show finding details', () => {
    const data = makeData({
      ats_findings: [
        { issue: 'Missing keyword: cloud infrastructure', priority: 'high' },
      ],
    });
    render(<QualityDashboardPanel data={data} />);

    // Click the collapsible section header button
    const atsButton = screen.getByRole('button', { name: /ATS Findings/i });
    fireEvent.click(atsButton);

    expect(screen.getByText('Missing keyword: cloud infrastructure')).toBeInTheDocument();
  });

  // 7. Risk flags render when populated
  it('renders risk flags section when risk flags are present', () => {
    const data = makeData({
      risk_flags: [
        { flag: 'Thin evidence for cloud experience claim', severity: 'high', recommendation: 'Add specific projects.' },
      ],
    });
    render(<QualityDashboardPanel data={data} />);
    expect(screen.getByText('Risk Flags')).toBeInTheDocument();
    expect(screen.getByText('Thin evidence for cloud experience claim')).toBeInTheDocument();
  });

  // 8. Hiring manager checklist breakdown renders
  it('renders checklist scores breakdown when hiring_manager has scores', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(screen.getByText('Checklist Breakdown')).toBeInTheDocument();
  });

  // 9. Renders without crashing when all optional fields are omitted
  it('renders without crashing with minimal data', () => {
    render(<QualityDashboardPanel data={{}} />);
    expect(screen.getByText('Quality Dashboard')).toBeInTheDocument();
  });

  // 10. Shows coherence issues when populated
  it('renders narrative coherence issues section when coherence_issues exist', () => {
    const data = makeData({
      coherence_issues: ['Summary and experience bullet tone mismatch'],
    });
    render(<QualityDashboardPanel data={data} />);
    const coherenceBtn = screen.getByRole('button', { name: /Narrative Coherence Issues/i });
    fireEvent.click(coherenceBtn);
    expect(screen.getByText('Summary and experience bullet tone mismatch')).toBeInTheDocument();
  });
});
