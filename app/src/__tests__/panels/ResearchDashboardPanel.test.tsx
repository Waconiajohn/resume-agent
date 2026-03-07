// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResearchDashboardPanel } from '../../components/panels/ResearchDashboardPanel';
import type { ResearchDashboardData } from '../../types/panels';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeData(overrides?: Partial<ResearchDashboardData>): ResearchDashboardData {
  return {
    company: {},
    jd_requirements: {},
    benchmark: { required_skills: [], language_keywords: [] } as ResearchDashboardData['benchmark'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResearchDashboardPanel', () => {
  afterEach(() => cleanup());

  // --- Header ---
  it('renders the Role Research header', () => {
    render(<ResearchDashboardPanel data={makeData()} />);
    expect(screen.getByText('Role Research')).toBeInTheDocument();
  });

  // --- Company Card ---
  it('renders company name when provided', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({ company: { company_name: 'Acme Corp' } })}
      />,
    );
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders company culture when provided', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({ company: { culture: 'Fast-paced and innovative' } })}
      />,
    );
    expect(screen.getByText(/Fast-paced and innovative/)).toBeInTheDocument();
  });

  it('renders company values as badges', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({ company: { values: ['Innovation', 'Integrity'] } })}
      />,
    );
    expect(screen.getByText('Innovation')).toBeInTheDocument();
    expect(screen.getByText('Integrity')).toBeInTheDocument();
  });

  it('renders company language style', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({ company: { language_style: 'Collaborative and data-driven' } })}
      />,
    );
    expect(screen.getByText(/Collaborative and data-driven/)).toBeInTheDocument();
  });

  it('shows skeleton when company data is empty', () => {
    const { container } = render(
      <ResearchDashboardPanel data={makeData({ company: {} })} />,
    );
    // GlassSkeletonCard renders pulse-animated divs
    expect(container.querySelector('.motion-safe\\:animate-pulse')).toBeTruthy();
  });

  // --- JD Requirements ---
  it('renders seniority level badge', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({ jd_requirements: { seniority_level: 'VP' } })}
      />,
    );
    expect(screen.getByText('VP')).toBeInTheDocument();
  });

  it('renders must-have requirements', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({
          jd_requirements: {
            must_haves: ['10+ years experience', 'Cloud architecture'],
          },
        })}
      />,
    );
    expect(screen.getByText('Must-Haves')).toBeInTheDocument();
    expect(screen.getByText('10+ years experience')).toBeInTheDocument();
    expect(screen.getByText('Cloud architecture')).toBeInTheDocument();
  });

  it('renders nice-to-have requirements', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({
          jd_requirements: {
            nice_to_haves: ['MBA preferred'],
          },
        })}
      />,
    );
    expect(screen.getByText('Nice-to-Haves')).toBeInTheDocument();
    expect(screen.getByText('MBA preferred')).toBeInTheDocument();
  });

  it('shows skeleton when JD requirements are empty', () => {
    const { container } = render(
      <ResearchDashboardPanel
        data={makeData({ jd_requirements: {} })}
      />,
    );
    const skeletons = container.querySelectorAll('.motion-safe\\:animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // --- Benchmark Profile ---
  it('renders benchmark summary', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({
          benchmark: {
            required_skills: [],
            language_keywords: [],
            ideal_candidate_summary: 'A seasoned executive with cloud expertise',
          } as ResearchDashboardData['benchmark'],
        })}
      />,
    );
    expect(screen.getByText(/A seasoned executive with cloud expertise/)).toBeInTheDocument();
  });

  it('renders required skills with importance badges', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({
          benchmark: {
            required_skills: [
              { requirement: 'Cloud Architecture', importance: 'critical', category: 'tech' },
              { requirement: 'Team Leadership', importance: 'important', category: 'soft' },
              { requirement: 'Public Speaking', importance: 'nice_to_have', category: 'soft' },
            ],
            language_keywords: [],
          } as ResearchDashboardData['benchmark'],
        })}
      />,
    );
    expect(screen.getByText('Cloud Architecture')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Important')).toBeInTheDocument();
    expect(screen.getByText('Nice to have')).toBeInTheDocument();
  });

  it('renders language keywords', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({
          benchmark: {
            required_skills: [],
            language_keywords: ['scalability', 'microservices'],
          } as ResearchDashboardData['benchmark'],
        })}
      />,
    );
    expect(screen.getByText('Keywords to Echo')).toBeInTheDocument();
    expect(screen.getByText('scalability')).toBeInTheDocument();
    expect(screen.getByText('microservices')).toBeInTheDocument();
  });

  it('renders benchmark assumptions', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({
          benchmark: {
            required_skills: [],
            language_keywords: [],
            assumptions: { years_experience: '15+', industry: 'SaaS' },
          } as ResearchDashboardData['benchmark'],
        })}
      />,
    );
    expect(screen.getByText('Benchmark Assumptions')).toBeInTheDocument();
    expect(screen.getByText('years experience')).toBeInTheDocument();
    expect(screen.getByText('15+')).toBeInTheDocument();
  });

  it('renders section expectations', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({
          benchmark: {
            required_skills: [],
            language_keywords: [],
            section_expectations: {
              professional_summary: 'Concise 3-line summary with quantified impact',
            },
          } as ResearchDashboardData['benchmark'],
        })}
      />,
    );
    expect(screen.getByText('Section Expectations')).toBeInTheDocument();
    expect(screen.getByText('professional summary')).toBeInTheDocument();
  });

  it('shows skeleton when benchmark is empty', () => {
    const { container } = render(
      <ResearchDashboardPanel
        data={makeData({
          benchmark: { required_skills: [], language_keywords: [] } as ResearchDashboardData['benchmark'],
        })}
      />,
    );
    const skeletons = container.querySelectorAll('.motion-safe\\:animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // --- Loading States ---
  it('shows "Research running" when loading_state is running', () => {
    render(
      <ResearchDashboardPanel data={makeData({ loading_state: 'running' })} />,
    );
    expect(screen.getByText('Research running')).toBeInTheDocument();
  });

  it('shows "Researching in the background" when loading_state is background_running', () => {
    render(
      <ResearchDashboardPanel data={makeData({ loading_state: 'background_running' })} />,
    );
    expect(screen.getByText('Researching in the background')).toBeInTheDocument();
  });

  it('shows "Research ready" when loading_state is complete', () => {
    render(
      <ResearchDashboardPanel data={makeData({ loading_state: 'complete' })} />,
    );
    expect(screen.getByText('Research ready')).toBeInTheDocument();
  });

  it('renders status note when provided', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({ loading_state: 'running', status_note: 'Analyzing job description' })}
      />,
    );
    expect(screen.getByText('Analyzing job description')).toBeInTheDocument();
  });

  it('renders next_expected text', () => {
    render(
      <ResearchDashboardPanel
        data={makeData({ loading_state: 'running', next_expected: 'Company research' })}
      />,
    );
    expect(screen.getByText(/Company research/)).toBeInTheDocument();
  });

  // --- Minimal data ---
  it('renders without crashing with completely empty data', () => {
    render(<ResearchDashboardPanel data={makeData()} />);
    expect(screen.getByText('Role Research')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Job Requirements')).toBeInTheDocument();
    expect(screen.getByText('Benchmark Profile')).toBeInTheDocument();
  });
});
