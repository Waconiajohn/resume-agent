// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { GapAnalysisReportPanel } from '../panels/GapAnalysisReportPanel';
import type {
  JobIntelligence,
  GapAnalysis,
  GapCoachingCard,
  PositioningAssessment,
  ResumeDraft,
  PreScores,
  BenchmarkCandidate,
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

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

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
          inference_rationale: '200 nodes \u00d7 $500/mo, backed off from $120K',
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

function makePositioningAssessment(): PositioningAssessment {
  return {
    summary: 'Strong on leadership, gaps in K8s',
    requirement_map: [
      {
        requirement: 'Team Leadership',
        importance: 'must_have',
        status: 'strong',
        addressed_by: [{ section: 'Professional Experience \u2014 Acme Corp', bullet_text: 'Led cross-functional team of 120+ engineers across 4 product lines' }],
      },
      {
        requirement: 'Cloud Infrastructure',
        importance: 'important',
        status: 'repositioned',
        addressed_by: [{ section: 'Professional Experience \u2014 Acme Corp', bullet_text: 'Managed 200-node on-prem server fleet' }],
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
      inference_rationale: '200 nodes \u00d7 $500/mo',
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

function makeBenchmarkCandidate(): BenchmarkCandidate {
  return {
    ideal_profile_summary: 'VP Engineering with 15+ years',
    expected_achievements: [
      { area: 'Team Leadership and Cross-Functional Management', description: 'Led 50+ engineers across multiple product lines for 5+ years', typical_metrics: '50+ engineers, 5+ years VP' },
      { area: 'Cloud Infrastructure and Migration', description: 'Architected enterprise cloud migration across AWS/GCP/Azure', typical_metrics: '200+ services migrated' },
    ],
    expected_leadership_scope: 'VP-level, 50+ engineers',
    expected_industry_knowledge: ['SaaS', 'Cloud'],
    expected_technical_skills: ['Kubernetes', 'AWS', 'GCP'],
    expected_certifications: ['AWS Solutions Architect'],
    differentiators: ['Built engineering culture from scratch'],
  };
}

function makePreScores(overrides?: Partial<PreScores>): PreScores {
  return {
    ats_match: 45,
    keywords_found: ['leadership', 'aws'],
    keywords_missing: ['kubernetes', 'multi-cloud'],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GapAnalysisReportPanel', () => {
  // ─── Basic rendering ────────────────────────────────────────────────────────

  it('renders the panel with title and role info', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Requirement Coverage')).toBeTruthy();
    expect(screen.getByText(/VP Engineering/)).toBeTruthy();
  });

  it('renders requirement cards with correct data', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId('requirement-card');
    expect(cards.length).toBe(3);
  });

  // ─── Importance-based grouping ──────────────────────────────────────────────

  it('groups requirements by importance (Must Have first, then Important)', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('importance-must_have')).toBeTruthy();
    expect(screen.getByTestId('importance-important')).toBeTruthy();
  });

  it('sorts gaps before strongs within each importance group', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // Must Have group: Kubernetes (gap) should appear before Team Leadership (strong)
    const mustHaveSection = screen.getByTestId('importance-must_have');
    const cards = mustHaveSection.querySelectorAll('[data-testid="requirement-card"]');
    expect(cards.length).toBe(2);
    expect(cards[0].getAttribute('data-requirement')).toBe('Kubernetes');
    expect(cards[1].getAttribute('data-requirement')).toBe('Team Leadership');
  });

  it('does not render empty importance sections', () => {
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Team Leadership', importance: 'must_have', evidence_from_jd: 'Lead teams' },
      ],
    });
    const ga = makeGapAnalysis({
      requirements: [
        { requirement: 'Team Leadership', importance: 'must_have', classification: 'strong', evidence: ['Led 120+'] },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        positioningAssessment={null}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('importance-must_have')).toBeTruthy();
    expect(screen.queryByTestId('importance-important')).toBeNull();
    expect(screen.queryByTestId('importance-nice_to_have')).toBeNull();
  });

  // ─── Colored importance pills ──────────────────────────────────────────────

  it('renders colored importance pills (Must Have, Important)', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const pills = screen.getAllByTestId('importance-pill');
    expect(pills.length).toBeGreaterThanOrEqual(2);
    // Should have "Must Have" and "Important" text in pills
    const pillTexts = pills.map((p) => p.textContent);
    expect(pillTexts.some((t) => t === 'Must Have')).toBe(true);
    expect(pillTexts.some((t) => t === 'Important')).toBe(true);
  });

  // ─── Tier-specific border colors ──────────────────────────────────────────

  it('renders tier-specific colored left borders on cards', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId('requirement-card');
    const strongCard = cards.find((c) => c.getAttribute('data-tier') === 'strong');
    const gapCard = cards.find((c) => c.getAttribute('data-tier') === 'gap');

    expect(strongCard).toBeTruthy();
    expect(gapCard).toBeTruthy();
    // Strong should have green-tinted border (jsdom may add spaces in rgba)
    expect(strongCard!.style.borderLeft).toMatch(/rgba\(181,?\s*222,?\s*194/);
    // Gap should have red-tinted border
    expect(gapCard!.style.borderLeft).toMatch(/rgba\(240,?\s*184,?\s*184/);
  });

  // ─── Mapping-first layout ──────────────────────────────────────────────────

  it('shows resume mapping when positioning assessment exists', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/Led cross-functional team of 120\+ engineers/)).toBeTruthy();
    expect(screen.getByText(/Not yet proven in your resume/)).toBeTruthy();
  });

  it('shows "View in Resume" links for addressed requirements', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const viewLinks = screen.getAllByTestId('view-in-resume');
    expect(viewLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onRequirementClick exactly once when clicking "View in Resume"', () => {
    const onReqClick = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={onReqClick}
      />,
    );

    const viewLinks = screen.getAllByTestId('view-in-resume');
    fireEvent.click(viewLinks[0]);

    expect(onReqClick).toHaveBeenCalledTimes(1);
    expect(mockScrollToBullet).not.toHaveBeenCalled();
  });

  it('shows "Partially covered in" prefix for repositioned items', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/Partially covered in/)).toBeTruthy();
  });

  it('gracefully handles missing positioningAssessment — all cards show "Not yet proven"', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.queryAllByTestId('view-in-resume').length).toBe(0);
    expect(screen.getAllByText(/Not yet proven in your resume/).length).toBe(3);
  });

  // ─── JD evidence subtitle ──────────────────────────────────────────────────

  it('displays evidence_from_jd as subtitle under requirement name', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const jdEvidence = screen.getAllByTestId('jd-evidence');
    expect(jdEvidence.length).toBe(3);
    // Cards are sorted gaps-first within importance groups, so first jd-evidence
    // may be from any card — just verify all JD evidence strings appear somewhere
    const allText = jdEvidence.map((el) => el.textContent).join(' ');
    expect(allText).toContain('Lead cross-functional teams of 50+ engineers');
    expect(allText).toContain('Hands-on K8s at production scale');
    expect(allText).toContain('Multi-cloud experience at enterprise scale');
  });

  // ─── Benchmark context ─────────────────────────────────────────────────────

  it('displays benchmark context when benchmarkCandidate is provided', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        benchmarkCandidate={makeBenchmarkCandidate()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const benchmarks = screen.getAllByTestId('benchmark-context');
    expect(benchmarks.length).toBeGreaterThanOrEqual(1);
    // Should match "Team Leadership" → expected_achievements area "Team Leadership and Cross-Functional Management"
    expect(benchmarks[0].textContent).toContain('Led 50+ engineers');
  });

  it('does not display benchmark context when benchmarkCandidate is null', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        benchmarkCandidate={null}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('benchmark-context')).toBeNull();
  });

  // ─── AI coaching prose ──────────────────────────────────────────────────────

  it('shows AI coaching prose from coaching cards', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
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

  it('shows inferred metrics inline with coaching prose', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        gapCoachingCards={makeCoachingCards()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/\$100K\/mo/)).toBeTruthy();
  });

  // ─── Suggested language block ───────────────────────────────────────────────

  it('shows suggested language with Apply button on the language block', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={vi.fn()}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    expect(screen.getByText(/Architected enterprise cloud migration spanning 200\+ services/)).toBeTruthy();
    const applyButtons = screen.getAllByTestId('action-apply-language');
    expect(applyButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Review Edit" on suggested language blocks for all editable tiers', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={vi.fn()}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    // Gap card (Kubernetes) should show the current review action
    const gapCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'gap',
    );
    expect(gapCard?.textContent).toContain('Review Edit');

    // Strong card uses the same explicit review action
    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    const strongApply = strongCard?.querySelector('[data-testid="action-apply-language"]');
    if (strongApply) {
      expect(strongApply.textContent).toContain('Review Edit');
    }
  });

  it('shows the safe-language prefix only on gap language blocks', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // Gap card should show the current safety prefix
    const gapCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'gap',
    );
    expect(gapCard?.textContent).toContain('Use this only if it is true and you can support it:');

    // Strong card should keep the standard suggested wording label
    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    expect(strongCard?.textContent).not.toContain('Use this only if it is true and you can support it:');
    expect(strongCard?.textContent).toContain('Suggested resume wording:');
  });

  it('clicking Apply on language block triggers onRequestEdit', () => {
    const onRequestEdit = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    // Click Apply on the strong card's language block
    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    const applyBtn = strongCard?.querySelector('[data-testid="action-apply-language"]') as HTMLElement;
    expect(applyBtn).toBeTruthy();
    fireEvent.click(applyBtn);

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit.mock.calls[0][2]).toBe('custom');
  });

  // ─── Action buttons ────────────────────────────────────────────────────────

  it('shows action buttons when editing is possible', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
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

  it('does NOT show Add Context on strong match cards', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={vi.fn()}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    const strongAddContext = strongCard?.querySelector('[data-testid="action-add-context"]');
    expect(strongAddContext).toBeNull();

    // But partial and gap should have Add Context
    const partialCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'partial',
    );
    expect(partialCard?.querySelector('[data-testid="action-add-context"]')).toBeTruthy();

    const gapCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'gap',
    );
    expect(gapCard?.querySelector('[data-testid="action-add-context"]')).toBeTruthy();
  });

  it('shows Strengthen button for partial items without positioning strategy', () => {
    const ga = makeGapAnalysis({
      requirements: [
        { requirement: 'Cloud Infrastructure', importance: 'important', classification: 'partial', evidence: ['AWS migration'] },
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
        positioningAssessment={null}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={vi.fn()}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    expect(screen.getByTestId('action-strengthen')).toBeTruthy();
    expect(screen.queryByTestId('action-apply-language')).toBeNull();
  });

  // ─── Questions toggle ───────────────────────────────────────────────────────

  it('shows questions toggle on BOTH gap and partial cards', () => {
    // Add interview_questions to Cloud (partial) too
    const ga = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          importance: 'important',
          classification: 'partial',
          evidence: ['AWS migration'],
          strategy: {
            real_experience: 'AWS',
            positioning: 'Cloud migration',
            interview_questions: [
              { question: 'Which cloud platforms have you used?', rationale: 'Multi-cloud', looking_for: 'GCP/Azure' },
            ],
          },
        },
        {
          requirement: 'Kubernetes',
          importance: 'must_have',
          classification: 'missing',
          evidence: [],
          strategy: {
            real_experience: 'Docker',
            positioning: 'Containerization',
            interview_questions: [
              { question: 'Have you worked with K8s?', rationale: 'Direct gap', looking_for: 'Any exposure' },
            ],
          },
        },
      ],
    });
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Cloud Infrastructure', importance: 'important', evidence_from_jd: 'Cloud' },
        { competency: 'Kubernetes', importance: 'must_have', evidence_from_jd: 'K8s' },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        positioningAssessment={null}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // Both partial (Cloud) and gap (K8s) should have question toggles
    const toggleBtns = screen.getAllByTestId('toggle-questions');
    expect(toggleBtns.length).toBe(2);
  });

  it('shows questions toggle collapsed by default, expands on click', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const toggleBtns = screen.getAllByTestId('toggle-questions');
    expect(toggleBtns.length).toBeGreaterThanOrEqual(1);
    expect(toggleBtns[0].textContent).toMatch(/2 questions/);

    // Collapsed by default — question text not visible
    expect(screen.queryByText(/Have you worked with K8s/)).toBeNull();

    // Expand to see questions
    fireEvent.click(toggleBtns[0]);
    expect(screen.getByText(/Have you worked with K8s/)).toBeTruthy();
  });

  // ─── Edit actions keep cards in the current interaction model ──────────────

  it('keeps the card expanded after clicking Review Edit', () => {
    const onRequestEdit = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    // Find Team Leadership strong card's Apply button
    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    const applyBtn = strongCard?.querySelector('[data-testid="action-apply-language"]') as HTMLElement;
    expect(applyBtn).toBeTruthy();
    fireEvent.click(applyBtn);

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('applied-badge')).toBeNull();
    expect(screen.queryByTestId('applied-card')).toBeNull();
    expect(screen.getAllByTestId('requirement-card').length).toBe(3);
  });

  it('does not replace the card with a collapsed applied state after review actions', () => {
    const onRequestEdit = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    // Apply the strong card
    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    const applyBtn = strongCard?.querySelector('[data-testid="action-apply-language"]') as HTMLElement;
    fireEvent.click(applyBtn);

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('requirement-card').length).toBe(3);
    expect(screen.queryByTestId('applied-card')).toBeNull();
  });

  // ─── Add Context ───────────────────────────────────────────────────────────

  it('uses requirement-specific placeholder for Add Context', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
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

    const textarea = screen.getByRole('textbox');
    const placeholder = textarea.getAttribute('placeholder') ?? '';
    expect(placeholder.length).toBeGreaterThan(10);
    expect(placeholder).not.toContain('Share relevant experience');
  });

  it('calls onRequestEdit when submitting context', () => {
    const onRequestEdit = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
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

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'I actually led K8s migration at my last job' } });

    const submitBtn = screen.getByTestId('submit-context');
    fireEvent.click(submitBtn);

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit.mock.calls[0][2]).toBe('custom');
  });

  // ─── Summary header ────────────────────────────────────────────────────────

  it('shows "Coverage: X%" when no preScores provided', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const report = screen.getByTestId('gap-analysis-report');
    expect(report.textContent).toContain('Coverage: 67%');
  });

  it('shows before/after scores when preScores provided', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        preScores={makePreScores()}
      />,
    );

    const report = screen.getByTestId('gap-analysis-report');
    expect(report.textContent).toContain('45%');
    expect(report.textContent).not.toContain('Coverage:');
  });

  it('shows pre-score baseline even when ats_match is 0', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        preScores={makePreScores({ ats_match: 0 })}
      />,
    );

    const report = screen.getByTestId('gap-analysis-report');
    expect(report.textContent).toContain('0%');
  });

  it('shows per-importance breakdown in header', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const report = screen.getByTestId('gap-analysis-report');
    // Must Have: 1 strong + 1 gap = 2 total, 1 addressed
    expect(report.textContent).toContain('Must Have: 1/2');
    // Important: 1 partial = 1 total, 1 addressed
    expect(report.textContent).toContain('Important: 1/1');
  });

  // ─── Tier mapping ──────────────────────────────────────────────────────────

  it('maps repositioned assessment status to partial tier', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const partialCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'partial',
    );
    expect(partialCard).toBeTruthy();
    expect(partialCard!.textContent).toContain('Cloud Infrastructure');
  });

  // ─── Dedup ──────────────────────────────────────────────────────────────────

  it('deduplicates requirements with trailing punctuation differences', () => {
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Kubernetes', importance: 'must_have', evidence_from_jd: 'K8s required' },
      ],
    });
    const ga = makeGapAnalysis({
      requirements: [
        { requirement: 'Kubernetes.', importance: 'must_have', classification: 'missing', evidence: [] },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        positioningAssessment={null}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('requirement-card').length).toBe(1);
  });

  // ─── Fuzzy lookup ──────────────────────────────────────────────────────────

  it('uses fuzzy lookup when assessment requirement text differs slightly', () => {
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Cross-Functional Team Leadership', importance: 'must_have', evidence_from_jd: 'Lead teams' },
      ],
    });
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
        { requirement: 'Cross-Functional Team Leadership', importance: 'must_have', classification: 'strong', evidence: ['Led teams'] },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        positioningAssessment={pa}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/Led 50\+ engineers/)).toBeTruthy();
  });

  // ─── Active state ──────────────────────────────────────────────────────────

  it('highlights active requirement card', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
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

  // ─── Accessibility ─────────────────────────────────────────────────────────

  it('has proper ARIA attributes on requirement cards', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={['Team Leadership']}
        onRequirementClick={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId('requirement-card');
    expect(cards[0].getAttribute('role')).toBe('article');
    expect(cards[0].getAttribute('tabindex')).toBe('0');

    const activeCard = cards.find(c => c.getAttribute('data-requirement') === 'Team Leadership');
    expect(activeCard!.getAttribute('aria-current')).toBe('true');

    const inactiveCard = cards.find(c => c.getAttribute('data-requirement') === 'Kubernetes');
    expect(inactiveCard!.getAttribute('aria-current')).toBeNull();
  });

  it('has aria-expanded on questions toggle button', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
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

  it('has correct aria-label on importance group sections', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('importance-must_have').getAttribute('aria-label')).toBe('Must Have');
    expect(screen.getByTestId('importance-important').getAttribute('aria-label')).toBe('Important');
  });

  // ─── Status badges ─────────────────────────────────────────────────────────

  it('shows correct status badges for each tier', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const report = screen.getByTestId('gap-analysis-report');
    expect(report.textContent).toContain('Already Covered');
    expect(report.textContent).toContain('Partially Covered');
    expect(report.textContent).toContain('Not Addressed');
  });

  // ─── Post-audit: Strengthen triggers edit request ──────────────────────────

  it('Strengthen button triggers an edit request without collapsing the card', () => {
    const onRequestEdit = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    const strengthenBtn = strongCard?.querySelector('[data-testid="action-strengthen"]') as HTMLElement;
    expect(strengthenBtn).toBeTruthy();
    fireEvent.click(strengthenBtn);

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit.mock.calls[0][2]).toBe('strengthen');
    expect(screen.queryByTestId('applied-badge')).toBeNull();
  });

  // ─── Post-audit: Add Context submit triggers edit request ──────────────────

  it('Add Context submit triggers an edit request without collapsing the card', () => {
    const onRequestEdit = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    // Open context on gap card
    const addContextBtns = screen.getAllByTestId('action-add-context');
    fireEvent.click(addContextBtns[0]);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'I managed K8s clusters at scale' } });

    const submitBtn = screen.getByTestId('submit-context');
    fireEvent.click(submitBtn);

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit.mock.calls[0][2]).toBe('custom');
    expect(screen.queryByTestId('applied-badge')).toBeNull();
  });

  // ─── Post-audit: Multiple cards trigger independent edit requests ──────────

  it('multiple cards can trigger independent edit requests', () => {
    const onRequestEdit = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        currentResume={makeResume()}
        isEditing={false}
      />,
    );

    // Apply the strong card (Team Leadership)
    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    const applyBtn1 = strongCard?.querySelector('[data-testid="action-apply-language"]') as HTMLElement;
    fireEvent.click(applyBtn1);

    // Apply the partial card (Cloud Infrastructure)
    const partialCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'partial',
    );
    const applyBtn2 = partialCard?.querySelector('[data-testid="action-apply-language"]') as HTMLElement;
    fireEvent.click(applyBtn2);

    expect(onRequestEdit).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('applied-badge')).toBeNull();
  });

  // ─── Post-audit: Evidence chips render for strong matches ──────────────────

  it('renders evidence chips for strong matches without AI coaching', () => {
    // Use gap analysis with strong evidence but NO coaching cards (so aiReasoning is absent)
    const ga = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 120+ engineers', 'Cross-functional teams'],
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
        positioningAssessment={null}
        gapAnalysis={ga}
        gapCoachingCards={null}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const chips = screen.getByTestId('evidence-chips');
    expect(chips).toBeTruthy();
    expect(chips.textContent).toContain('Led 120+ engineers');
    expect(chips.textContent).toContain('Cross-functional teams');
  });

  // ─── Post-audit: Benchmark context no-match graceful degradation ───────────

  it('does not render benchmark-context when no token overlap', () => {
    const benchmark: BenchmarkCandidate = {
      ideal_profile_summary: 'test',
      expected_achievements: [
        { area: 'Quantum Computing Research', description: 'Published papers on quantum algos', typical_metrics: '10+ papers' },
      ],
      expected_leadership_scope: 'VP',
      expected_industry_knowledge: ['Quantum'],
      expected_technical_skills: ['Qiskit'],
      expected_certifications: [],
      differentiators: [],
    };

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        benchmarkCandidate={benchmark}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('benchmark-context')).toBeNull();
  });

  // ─── Post-audit: Status badges on correct tier cards ───────────────────────

  it('renders correct status badge text on each tier card', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const strongCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'strong',
    );
    expect(strongCard?.textContent).toContain('Already Covered');

    const partialCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'partial',
    );
    expect(partialCard?.textContent).toContain('Partially Covered');

    const gapCard = screen.getAllByTestId('requirement-card').find(
      (c) => c.getAttribute('data-tier') === 'gap',
    );
    expect(gapCard?.textContent).toContain('Not Addressed');
  });

  // ─── Post-audit: Keyboard navigation ──────────────────────────────────────

  it('calls onRequirementClick on Enter and Space key', () => {
    const onReqClick = vi.fn();

    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={onReqClick}
      />,
    );

    const cards = screen.getAllByTestId('requirement-card');
    fireEvent.keyDown(cards[0], { key: 'Enter' });
    expect(onReqClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(cards[0], { key: ' ' });
    expect(onReqClick).toHaveBeenCalledTimes(2);

    // Tab key should NOT trigger
    fireEvent.keyDown(cards[0], { key: 'Tab' });
    expect(onReqClick).toHaveBeenCalledTimes(2);
  });

  // ─── Post-audit: Empty evidence_from_jd filtered out ───────────────────────

  it('does not render jd-evidence for empty evidence_from_jd strings', () => {
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Team Leadership', importance: 'must_have', evidence_from_jd: '' },
      ],
    });
    const ga = makeGapAnalysis({
      requirements: [
        { requirement: 'Team Leadership', importance: 'must_have', classification: 'strong', evidence: ['Led teams'] },
      ],
    });

    render(
      <GapAnalysisReportPanel
        jobIntelligence={ji}
        positioningAssessment={null}
        gapAnalysis={ga}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('jd-evidence')).toBeNull();
  });
});
