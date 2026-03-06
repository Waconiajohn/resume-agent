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
    expect(screen.getByText('Your Resume Quality Score')).toBeInTheDocument();
  });

  // 2. Renders primary score rings
  it('renders ATS score ring', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(screen.getByRole('img', { name: /ATS/i })).toBeInTheDocument();
  });

  it('renders Authenticity score ring', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(screen.getByRole('img', { name: /Authenticity/i })).toBeInTheDocument();
  });

  it('renders Hiring Manager score ring', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(screen.getByRole('img', { name: /Hiring Manager/i })).toBeInTheDocument();
  });

  it('renders keyword coverage percentage', () => {
    render(<QualityDashboardPanel data={makeData({ keyword_coverage: 82 })} />);
    expect(screen.getByText('82%')).toBeInTheDocument();
  });

  // 2b. Secondary metrics render as text rows
  it('renders Evidence Integrity as a text metric row', () => {
    render(<QualityDashboardPanel data={makeData({ evidence_integrity: 85 })} />);
    expect(screen.getByText('Proof Strength')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('renders Blueprint Compliance as a text metric row', () => {
    render(<QualityDashboardPanel data={makeData({ blueprint_compliance: 88 })} />);
    expect(screen.getByText('Plan Alignment')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('renders Narrative Coherence as a text metric row', () => {
    render(<QualityDashboardPanel data={makeData({ narrative_coherence: 74 })} />);
    expect(screen.getByText('Story Consistency')).toBeInTheDocument();
    expect(screen.getByText('74%')).toBeInTheDocument();
  });

  it('does not render Evidence Integrity ring (only text row)', () => {
    render(<QualityDashboardPanel data={makeData({ evidence_integrity: 85 })} />);
    expect(screen.queryByRole('img', { name: /Evidence/i })).not.toBeInTheDocument();
  });

  // 2c. Secondary metric color coding
  it('applies green color for secondary metric score >= 80', () => {
    render(<QualityDashboardPanel data={makeData({ evidence_integrity: 85 })} />);
    const scoreEl = screen.getByText('85%');
    expect(scoreEl.className).toContain('text-[#b5dec2]');
  });

  it('applies yellow color for secondary metric score 60-79', () => {
    render(<QualityDashboardPanel data={makeData({ narrative_coherence: 74 })} />);
    const scoreEl = screen.getByText('74%');
    expect(scoreEl.className).toContain('text-[#dfc797]');
  });

  it('applies red color for secondary metric score < 60', () => {
    render(<QualityDashboardPanel data={makeData({ blueprint_compliance: 55 })} />);
    const scoreEl = screen.getByText('55%');
    expect(scoreEl.className).toContain('text-[#e0abab]');
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
    expect(screen.queryByText('Hiring System Findings')).not.toBeInTheDocument();
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
    expect(screen.getByText('Hiring System Findings')).toBeInTheDocument();
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
    const atsButton = screen.getByRole('button', { name: /Hiring System Findings/i });
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
    expect(screen.getByText('Items to Review')).toBeInTheDocument();
    expect(screen.getByText('Thin evidence for cloud experience claim')).toBeInTheDocument();
  });

  // 8. Hiring manager checklist breakdown renders
  it('renders checklist scores breakdown when hiring_manager has scores', () => {
    render(<QualityDashboardPanel data={makeData()} />);
    expect(screen.getByText('Score Details')).toBeInTheDocument();
  });

  // 9. Renders without crashing when all optional fields are omitted
  it('renders without crashing with minimal data', () => {
    render(<QualityDashboardPanel data={{}} />);
    expect(screen.getByText('Your Resume Quality Score')).toBeInTheDocument();
  });

  // 10. Shows coherence issues when populated
  it('renders narrative coherence issues section when coherence_issues exist', () => {
    const data = makeData({
      coherence_issues: ['Summary and experience bullet tone mismatch'],
    });
    render(<QualityDashboardPanel data={data} />);
    const coherenceBtn = screen.getByRole('button', { name: /Story Consistency/i });
    fireEvent.click(coherenceBtn);
    expect(screen.getByText('Summary and experience bullet tone mismatch')).toBeInTheDocument();
  });
});
