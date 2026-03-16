// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { GapAnalysisReportPanel } from '../panels/GapAnalysisReportPanel';
import type {
  JobIntelligence,
  BenchmarkCandidate,
  GapAnalysis,
  GapCoachingCard,
  PositioningAssessment,
  ResumeDraft,
} from '@/types/resume-v2';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) =>
    classes.filter(Boolean).join(' '),
}));

const mockScrollToBullet = vi.fn();
vi.mock('../useStrategyThread', () => ({
  scrollToBullet: (...args: unknown[]) => mockScrollToBullet(...args),
  scrollToAndHighlight: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJobIntelligence(overrides?: Partial<JobIntelligence>): JobIntelligence {
  return {
    company_name: 'Acme Corp',
    role_title: 'VP Engineering',
    seniority_level: 'VP',
    core_competencies: [
      { competency: 'Team Leadership', importance: 'must_have', evidence_from_jd: 'Lead cross-functional teams of 50+ engineers' },
      { competency: 'Cloud Infrastructure', importance: 'important', evidence_from_jd: 'Multi-cloud experience at enterprise scale' },
      { competency: 'Kubernetes', importance: 'must_have', evidence_from_jd: 'Hands-on K8s at production scale' },
    ],
    strategic_responsibilities: [],
    business_problems: [],
    cultural_signals: [],
    hidden_hiring_signals: [],
    language_keywords: [],
    industry: 'Technology',
    ...overrides,
  };
}

function makeGapAnalysis(overrides?: Partial<GapAnalysis>): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'Team Leadership',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['Led 120+ engineers', 'Cross-functional teams'],
        strategy: {
          real_experience: 'Direct leadership',
          positioning: 'Led org of 120+ across 4 product lines',
          ai_reasoning: 'You exceed the benchmark here.',
        },
      },
      {
        requirement: 'Cloud Infrastructure',
        importance: 'important',
        classification: 'partial',
        evidence: ['AWS migration', '200-node fleet'],
        strategy: {
          real_experience: 'AWS migration experience',
          positioning: 'Architected enterprise cloud migration spanning 200+ services',
          inferred_metric: '$100K/mo infrastructure',
          inference_rationale: '200 nodes × $500/mo, backed off from $120K',
          ai_reasoning: 'You have solid AWS but JD asks for multi-cloud.',
        },
      },
      {
        requirement: 'Kubernetes',
        importance: 'must_have',
        classification: 'missing',
        evidence: [],
        strategy: {
          real_experience: 'Docker containerization adjacent',
          positioning: 'Drove containerization strategy across 12 microservices',
          ai_reasoning: 'The JD requires hands-on K8s. Your Docker experience is adjacent.',
          interview_questions: [
            { question: 'Have you worked with K8s in production?', rationale: 'Direct gap', looking_for: 'Any K8s exposure' },
            { question: 'Describe your container orchestration experience', rationale: 'Adjacent skill', looking_for: 'Docker/ECS' },
          ],
        },
      },
    ],
    coverage_score: 67,
    strength_summary: 'Strong leadership, partial cloud, missing K8s.',
    critical_gaps: ['Kubernetes'],
    pending_strategies: [],
    ...overrides,
  };
}

function makeBenchmark(): BenchmarkCandidate {
  return {
    ideal_profile_summary: 'VP-level leader with 50+ eng org',
    expected_achievements: [
      { area: 'Team Leadership', description: 'Built orgs to 50+ people', typical_metrics: '50+ reports, 5+ years VP' },
      { area: 'Cloud Infrastructure', description: 'Migrated legacy to cloud-native', typical_metrics: '30%+ cost reduction' },
    ],
    expected_leadership_scope: '50+ engineers',
    expected_industry_knowledge: ['SaaS'],
    expected_technical_skills: ['AWS', 'K8s'],
    expected_certifications: [],
    differentiators: [],
  };
}

function makePositioningAssessment(): PositioningAssessment {
  return {
    summary: 'Strong on leadership, gaps in K8s',
    requirement_map: [
      {
        requirement: 'Team Leadership',
        importance: 'must_have',
        status: 'strong',
        addressed_by: [{ section: 'Professional Experience — Acme Corp', bullet_text: 'Led cross-functional team of 120+ engineers across 4 product lines' }],
      },
      {
        requirement: 'Cloud Infrastructure',
        importance: 'important',
        status: 'repositioned',
        addressed_by: [{ section: 'Professional Experience — Acme Corp', bullet_text: 'Managed 200-node on-prem server fleet' }],
        strategy_used: 'Adjacent experience positioning',
      },
      {
        requirement: 'Kubernetes',
        importance: 'must_have',
        status: 'gap',
        addressed_by: [],
      },
    ],
    before_score: 45,
    after_score: 78,
    strategies_applied: ['positioning', 'inference'],
  };
}

function makeResume(): ResumeDraft {
  return {
    header: { name: 'Jane Doe', phone: '555-1234', email: 'jane@example.com', branded_title: 'VP Engineering' },
    executive_summary: { content: 'Seasoned engineering leader', is_new: false },
    core_competencies: ['Team Leadership', 'Cloud'],
    selected_accomplishments: [],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        scope_statement: 'Led org of 120',
        bullets: [
          { text: 'Led cross-functional team of 120+ engineers across 4 product lines', is_new: false, addresses_requirements: ['Team Leadership'] },
          { text: 'Managed 200-node on-prem server fleet', is_new: false, addresses_requirements: ['Cloud Infrastructure'] },
        ],
      },
    ],
    education: [{ degree: 'BS CS', institution: 'MIT' }],
    certifications: [],
  };
}

function makeCoachingCards(): GapCoachingCard[] {
  return [
    {
      requirement: 'Team Leadership',
      importance: 'must_have',
      classification: 'strong',
      ai_reasoning: 'You exceed the benchmark here with 120+ engineers.',
      proposed_strategy: 'Keep as-is',
      evidence_found: ['Led 120+ engineers', 'Cross-functional teams'],
    },
    {
      requirement: 'Cloud Infrastructure',
      importance: 'important',
      classification: 'partial',
      ai_reasoning: 'Solid AWS but multi-cloud is needed.',
      proposed_strategy: 'Reposition',
      evidence_found: ['AWS migration', '200-node fleet'],
      inferred_metric: '$100K/mo',
      inference_rationale: '200 nodes × $500/mo',
    },
    {
      requirement: 'Kubernetes',
      importance: 'must_have',
      classification: 'missing',
      ai_reasoning: 'Docker is adjacent but K8s is required.',
      proposed_strategy: 'Position adjacent experience',
      evidence_found: [],
      interview_questions: [
        { question: 'Have you worked with K8s?', rationale: 'Direct gap', looking_for: 'Any exposure' },
      ],
    },
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GapAnalysisReportPanel', () => {
  it('renders the panel with title and role info', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Gap Analysis Report')).toBeTruthy();
    expect(screen.getByText(/VP Engineering/)).toBeTruthy();
  });

  it('shows three tier sections with correct counts', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('tier-strong')).toBeTruthy();
    expect(screen.getByTestId('tier-partial')).toBeTruthy();
    expect(screen.getByTestId('tier-gap')).toBeTruthy();
  });

  it('renders requirement cards with correct data', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId('requirement-card');
    expect(cards.length).toBe(3);
  });

  it('shows evidence_from_jd in each card', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/Lead cross-functional teams of 50\+ engineers/)).toBeTruthy();
    expect(screen.getByText(/Multi-cloud experience at enterprise scale/)).toBeTruthy();
  });

  it('shows benchmark context when benchmarkCandidate is provided', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={makeBenchmark()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Built orgs to 50+ people')).toBeTruthy();
    expect(screen.getByText(/50\+ reports, 5\+ years VP/)).toBeTruthy();
  });

  it('shows AI reasoning from coaching cards', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        gapCoachingCards={makeCoachingCards()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/You exceed the benchmark here with 120\+ engineers/)).toBeTruthy();
    expect(screen.getByText(/Solid AWS but multi-cloud is needed/)).toBeTruthy();
  });

  it('shows suggested language for partial matches', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/Architected enterprise cloud migration spanning 200\+ services/)).toBeTruthy();
  });

  it('shows inferred metrics', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        gapCoachingCards={makeCoachingCards()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/\$100K\/mo/)).toBeTruthy();
  });

  it('shows resume mapping when positioning assessment exists', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/Led cross-functional team of 120\+ engineers/)).toBeTruthy();
    expect(screen.getByText(/Not currently addressed/)).toBeTruthy();
  });

  it('shows "View in Resume" links for addressed requirements', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const viewLinks = screen.getAllByTestId('view-in-resume');
    expect(viewLinks.length).toBeGreaterThanOrEqual(1);
  });

  // T-1 fix: assert call count to catch double-call bugs
  it('calls onRequirementClick exactly once when clicking "View in Resume" (no double scrollToBullet)', () => {
    const onReqClick = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={onReqClick}
      />,
    );

    const viewLinks = screen.getAllByTestId('view-in-resume');
    fireEvent.click(viewLinks[0]);

    // Should call onRequirementClick exactly once (parent handles scrollToBullet)
    expect(onReqClick).toHaveBeenCalledTimes(1);
    // Should NOT call scrollToBullet directly (that's the parent's job)
    expect(mockScrollToBullet).not.toHaveBeenCalled();
  });

  it('shows action buttons when editing is possible', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={vi.fn()}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    const actionSections = screen.getAllByTestId('card-actions');
    expect(actionSections.length).toBe(3);
  });

  it('hides action buttons when isEditing is true', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={vi.fn()}
        currentResume={makeResume()}
        isEditing={true}
      />,
    );

    expect(screen.queryAllByTestId('card-actions').length).toBe(0);
  });

  it('shows questions behind a click for gap cards', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const toggleBtn = screen.getByTestId('toggle-questions');
    expect(toggleBtn.textContent).toMatch(/2 questions/);

    fireEvent.click(toggleBtn);
    expect(screen.getByText(/Have you worked with K8s/)).toBeTruthy();
  });

  it('opens context input when clicking "Add My Context"', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={vi.fn()}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    const addContextBtns = screen.getAllByTestId('action-add-context');
    fireEvent.click(addContextBtns[0]);

    expect(screen.getByPlaceholderText(/Share relevant experience/)).toBeTruthy();
  });

  it('calls onRequestEdit when submitting context', () => {
    const onRequestEdit = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    const addContextBtns = screen.getAllByTestId('action-add-context');
    fireEvent.click(addContextBtns[0]);

    const textarea = screen.getByPlaceholderText(/Share relevant experience/);
    fireEvent.change(textarea, { target: { value: 'I actually led K8s migration at my last job' } });

    const submitBtn = screen.getByTestId('submit-context');
    fireEvent.click(submitBtn);

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit.mock.calls[0][2]).toBe('custom');
  });

  it('highlights active requirement card', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={['Team Leadership']}
        onRequirementClick={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId('requirement-card');
    const leadershipCard = cards.find(
      (c) => c.getAttribute('data-requirement') === 'Team Leadership',
    );
    expect(leadershipCard).toBeTruthy();
    expect(leadershipCard!.style.boxShadow).toContain('0 0 0 1px');
  });

  it('shows summary header with correct stats', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const report = screen.getByTestId('gap-analysis-report');
    expect(report.textContent).toMatch(/67%/);
  });

  it('gracefully handles missing benchmarkCandidate', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('requirement-card').length).toBe(3);
    expect(screen.queryByText('The Benchmark')).toBeNull();
  });

  it('gracefully handles missing positioningAssessment', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.queryAllByTestId('view-in-resume').length).toBe(0);
    expect(screen.getAllByText(/Not currently addressed/).length).toBeGreaterThanOrEqual(1);
  });

  it('does not render empty tier sections', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 120+'],
        },
      ],
    });

    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Team Leadership', importance: 'must_have', evidence_from_jd: 'Lead teams' },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={gapAnalysis}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('tier-strong')).toBeTruthy();
    expect(screen.queryByTestId('tier-partial')).toBeNull();
    expect(screen.queryByTestId('tier-gap')).toBeNull();
  });

  it('shows importance badges with correct labels', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Must Have').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Important').length).toBeGreaterThanOrEqual(1);
  });

  // ─── T-2: repositioned → partial tier mapping ────────────────────────────────

  it('maps repositioned assessment status to partial tier', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // Cloud Infrastructure has status: 'repositioned' in positioning assessment
    // It should appear in the partial tier, not gap or a separate section
    const partialSection = screen.getByTestId('tier-partial');
    expect(partialSection.textContent).toContain('Cloud Infrastructure');
  });

  // ─── T-3: dedup with punctuation edge case ──────────────────────────────────

  it('deduplicates requirements with trailing punctuation differences', () => {
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Kubernetes', importance: 'must_have', evidence_from_jd: 'K8s required' },
      ],
    });

    // Gap analysis has the same requirement but with trailing period
    const ga = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Kubernetes.',
          importance: 'must_have',
          classification: 'missing',
          evidence: [],
        },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // Should produce exactly 1 card, not 2
    const cards = screen.getAllByTestId('requirement-card');
    expect(cards.length).toBe(1);
  });

  // ─── T-5: fuzzy lookup path ─────────────────────────────────────────────────

  it('uses fuzzy lookup when assessment requirement text differs slightly', () => {
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Cross-Functional Team Leadership', importance: 'must_have', evidence_from_jd: 'Lead teams' },
      ],
    });

    // Assessment uses different wording but overlapping tokens
    const pa: PositioningAssessment = {
      summary: 'test',
      requirement_map: [
        {
          requirement: 'Team Leadership Cross-Functional',
          importance: 'must_have',
          status: 'strong',
          addressed_by: [{ section: 'Experience', bullet_text: 'Led 50+ engineers' }],
        },
      ],
      before_score: 50,
      after_score: 80,
      strategies_applied: [],
    };

    const ga = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cross-Functional Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led teams'],
        },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        benchmarkCandidate={null}
        positioningAssessment={pa}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // Fuzzy match should find the assessment entry and place in strong tier
    expect(screen.getByTestId('tier-strong')).toBeTruthy();
    // Should show the bullet from the assessment
    expect(screen.getByText(/Led 50\+ engineers/)).toBeTruthy();
  });

  // ─── M-6: partial items without strategy get Strengthen fallback ────────────

  it('shows Strengthen button for partial items without positioning strategy', () => {
    const ga = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          importance: 'important',
          classification: 'partial',
          evidence: ['AWS migration'],
          // No strategy
        },
      ],
    });

    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Cloud Infrastructure', importance: 'important', evidence_from_jd: 'Cloud experience' },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={vi.fn()}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    // Should show Strengthen as fallback (not Apply Language which requires strategy)
    expect(screen.getByTestId('action-strengthen')).toBeTruthy();
    expect(screen.queryByTestId('action-apply-language')).toBeNull();
  });

  // ─── Accessibility ─────────────────────────────────────────────────────────

  it('has proper ARIA attributes on requirement cards', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={['Team Leadership']}
        onRequirementClick={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId('requirement-card');
    // Cards should have role="article" and tabIndex for keyboard access
    expect(cards[0].getAttribute('role')).toBe('article');
    expect(cards[0].getAttribute('tabindex')).toBe('0');

    // Active card should have aria-current
    const activeCard = cards.find(c => c.getAttribute('data-requirement') === 'Team Leadership');
    expect(activeCard!.getAttribute('aria-current')).toBe('true');

    // Inactive card should NOT have aria-current
    const inactiveCard = cards.find(c => c.getAttribute('data-requirement') === 'Kubernetes');
    expect(inactiveCard!.getAttribute('aria-current')).toBeNull();
  });

  it('has aria-expanded on questions toggle button', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const toggleBtn = screen.getByTestId('toggle-questions');
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('has aria-label on tier sections', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const strongSection = screen.getByTestId('tier-strong');
    expect(strongSection.getAttribute('aria-label')).toBe('Highly Qualified');
  });

  // ─── M-8: resumeStatus icon correctness ────────────────────────────────────

  it('shows correct status icons for addressed requirements (strong=✓, repositioned=→, gap=✗)', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        benchmarkCandidate={null}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // The panel should contain both ✓ and → for strong and repositioned items
    const report = screen.getByTestId('gap-analysis-report');
    const textContent = report.textContent ?? '';
    // Strong items show check mark
    expect(textContent).toContain('✓');
    // Repositioned items show arrow
    expect(textContent).toContain('→');
  });
});
