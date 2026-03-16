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

    expect(screen.getByText('Gap Analysis Report')).toBeTruthy();
    expect(screen.getByText(/VP Engineering/)).toBeTruthy();
  });

  it('shows three tier sections with correct counts', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
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
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId('requirement-card');
    expect(cards.length).toBe(3);
  });

  it('does not render empty tier sections', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        { requirement: 'Team Leadership', importance: 'must_have', classification: 'strong', evidence: ['Led 120+'] },
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
        gapAnalysis={gapAnalysis}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('tier-strong')).toBeTruthy();
    expect(screen.queryByTestId('tier-partial')).toBeNull();
    expect(screen.queryByTestId('tier-gap')).toBeNull();
  });

  // ─── Mapping-first layout ──────────────────────────────────────────────────

  it('shows resume mapping FIRST when positioning assessment exists', () => {
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
    expect(screen.getByText(/Not addressed in your resume/)).toBeTruthy();
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

  it('shows "Repositioned in" prefix for repositioned items', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/Repositioned in/)).toBeTruthy();
  });

  it('gracefully handles missing positioningAssessment — all cards show "Not addressed"', () => {
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
    // T1 fix: all 3 cards should show "Not addressed" when no positioning assessment
    expect(screen.getAllByText(/Not addressed in your resume/).length).toBe(3);
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

  it('shows "Add to Resume" on gap language blocks and "Apply" on non-gap', () => {
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

    // C2: gap card (Kubernetes) should show "Add to Resume", non-gap should show "Apply"
    const gapSection = screen.getByTestId('tier-gap');
    expect(gapSection.textContent).toContain('Add to Resume');

    const strongSection = screen.getByTestId('tier-strong');
    const strongApply = strongSection.querySelector('[data-testid="action-apply-language"]');
    if (strongApply) {
      expect(strongApply.textContent).toContain('Apply');
      expect(strongApply.textContent).not.toContain('Add to Resume');
    }
  });

  it('shows "If you have this experience" prefix only on gap language blocks', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // C1: gap card should show the conditional prefix
    const gapSection = screen.getByTestId('tier-gap');
    expect(gapSection.textContent).toContain('If you have this experience');

    // Non-gap sections should NOT show it
    const strongSection = screen.getByTestId('tier-strong');
    expect(strongSection.textContent).not.toContain('If you have this experience');

    const partialSection = screen.getByTestId('tier-partial');
    expect(partialSection.textContent).not.toContain('If you have this experience');
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

    // C7: Click Apply on the strong card's language block
    const strongSection = screen.getByTestId('tier-strong');
    const applyBtn = strongSection.querySelector('[data-testid="action-apply-language"]') as HTMLElement;
    expect(applyBtn).toBeTruthy();
    fireEvent.click(applyBtn);

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit.mock.calls[0][2]).toBe('custom');
  });

  // ─── Importance display ─────────────────────────────────────────────────────

  it('shows importance as subtle lowercase text, not colored pills', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    expect(screen.getAllByText('must have').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('important').length).toBeGreaterThanOrEqual(1);
    // Old colored pill labels should not exist
    expect(screen.queryByText('Must Have')).toBeNull();
    expect(screen.queryByText('Important')).toBeNull();
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

  it('does NOT show Add Context on strong match cards (B3 fix)', () => {
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

    const strongSection = screen.getByTestId('tier-strong');
    const strongAddContext = strongSection.querySelector('[data-testid="action-add-context"]');
    expect(strongAddContext).toBeNull();

    // But partial and gap should have Add Context
    const partialSection = screen.getByTestId('tier-partial');
    const partialAddContext = partialSection.querySelector('[data-testid="action-add-context"]');
    expect(partialAddContext).toBeTruthy();

    const gapSection = screen.getByTestId('tier-gap');
    const gapAddContext = gapSection.querySelector('[data-testid="action-add-context"]');
    expect(gapAddContext).toBeTruthy();
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

  it('shows questions toggle ONLY on gap cards, collapsed by default', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // T2 fix: exactly one toggle — only the Kubernetes gap card has questions
    const toggleBtns = screen.getAllByTestId('toggle-questions');
    expect(toggleBtns.length).toBe(1);
    expect(toggleBtns[0].textContent).toMatch(/2 questions/);

    // Collapsed by default — question text not visible
    expect(screen.queryByText(/Have you worked with K8s/)).toBeNull();

    // Expand to see questions
    fireEvent.click(toggleBtns[0]);
    expect(screen.getByText(/Have you worked with K8s/)).toBeTruthy();
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

    // Click Add Context on a partial/gap card (not strong — strong doesn't have it)
    const addContextBtns = screen.getAllByTestId('action-add-context');
    fireEvent.click(addContextBtns[0]);

    const textarea = screen.getByRole('textbox');
    const placeholder = textarea.getAttribute('placeholder') ?? '';
    expect(placeholder.length).toBeGreaterThan(10);
    expect(placeholder).not.toContain('Share relevant experience');
  });

  it('contextHint returns cloud-specific text for cloud requirements', () => {
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Cloud Infrastructure', importance: 'important', evidence_from_jd: 'Cloud' },
      ],
    });
    const ga = makeGapAnalysis({
      requirements: [
        { requirement: 'Cloud Infrastructure', importance: 'important', classification: 'partial', evidence: ['AWS'] },
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

    const addContextBtn = screen.getByTestId('action-add-context');
    fireEvent.click(addContextBtn);

    const textarea = screen.getByRole('textbox');
    expect(textarea.getAttribute('placeholder')).toContain('cloud platform');
  });

  it('contextHint returns container-specific text for K8s requirements', () => {
    // Use a gap card for Kubernetes (gap cards show Add Context)
    const ji = makeJobIntelligence({
      core_competencies: [
        { competency: 'Kubernetes', importance: 'must_have', evidence_from_jd: 'K8s' },
      ],
    });
    const ga = makeGapAnalysis({
      requirements: [
        { requirement: 'Kubernetes', importance: 'must_have', classification: 'missing', evidence: [] },
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

    const addContextBtn = screen.getByTestId('action-add-context');
    fireEvent.click(addContextBtn);

    const textarea = screen.getByRole('textbox');
    expect(textarea.getAttribute('placeholder')).toContain('container orchestration');
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
    expect(report.textContent).not.toContain('After:');
    expect(report.textContent).not.toContain('Your starting point');
  });

  it('shows "Your starting point: X% → After: Y%" when preScores provided', () => {
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
    expect(report.textContent).toContain('Your starting point: 45%');
    expect(report.textContent).toContain('After: 67%');
    expect(report.textContent).not.toContain('Coverage:');
  });

  it('shows pre-score baseline even when ats_match is 0 (B4 fix)', () => {
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
    expect(report.textContent).toContain('Your starting point: 0%');
    expect(report.textContent).toContain('After:');
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

    const partialSection = screen.getByTestId('tier-partial');
    expect(partialSection.textContent).toContain('Cloud Infrastructure');
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

    expect(screen.getByTestId('tier-strong')).toBeTruthy();
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

  it('has correct aria-label on all tier sections', () => {
    render(
      <GapAnalysisReportPanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
        activeRequirements={[]}
        onRequirementClick={vi.fn()}
      />,
    );

    // C6: verify all three tier sections have correct aria-label
    expect(screen.getByTestId('tier-strong').getAttribute('aria-label')).toBe('Strong Matches');
    expect(screen.getByTestId('tier-partial').getAttribute('aria-label')).toBe('Repositioned');
    expect(screen.getByTestId('tier-gap').getAttribute('aria-label')).toBe('Gaps');
  });

  // ─── Status icons ──────────────────────────────────────────────────────────

  it('shows correct status icons for addressed requirements', () => {
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
    const textContent = report.textContent ?? '';
    expect(textContent).toContain('\u2713');
    expect(textContent).toContain('\u2192');
    expect(textContent).toContain('\u2717');
  });
});
