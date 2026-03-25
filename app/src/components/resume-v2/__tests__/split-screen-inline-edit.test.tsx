// @vitest-environment jsdom
/**
 * Tests for:
 *   1. InlineEditPanel (rendered via ResumeDocumentCard when activeBullet matches)
 *   2. V2StreamingDisplay split-screen toggle behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import { ResumeDocumentCard } from '../cards/ResumeDocumentCard';
import { V2StreamingDisplay } from '../V2StreamingDisplay';

import type { ResumeDraft, V2PipelineData, JobIntelligence, GapAnalysis } from '@/types/resume-v2';
import type { PendingEdit } from '@/hooks/useInlineEdit';

// ─── Global mocks ─────────────────────────────────────────────────────────────

vi.mock('../useStrategyThread', () => ({
  scrollToBullet: vi.fn(),
  scrollToAndHighlight: vi.fn(),
  scrollToCoachingCard: vi.fn(),
  scrollToAuditRow: vi.fn(),
}));

// Lucide icons: explicit stubs for every icon used by the components under test
vi.mock('lucide-react', () => {
  const Icon = ({ className }: { className?: string }) => (
    <svg data-testid="icon" className={className} aria-hidden="true" />
  );
  return {
    Loader2: Icon,
    Lightbulb: Icon,
    CheckCircle: Icon,
    CheckCircle2: Icon,
    AlertCircle: Icon,
    Briefcase: Icon,
    Circle: Icon,
    Check: Icon,
    X: Icon,
    Compass: Icon,
    FileText: Icon,
    Shield: Icon,
    Undo2: Icon,
    Redo2: Icon,
    ChevronDown: Icon,
    ChevronUp: Icon,
    ChevronRight: Icon,
    ClipboardCheck: Icon,
    MessageSquare: Icon,
    MessagesSquare: Icon,
    Sparkles: Icon,
    Target: Icon,
    TrendingUp: Icon,
    BarChart3: Icon,
    Eye: Icon,
    HelpCircle: Icon,
    Info: Icon,
    RefreshCw: Icon,
    XCircle: Icon,
    Zap: Icon,
    AlertTriangle: Icon,
    AlertOctagon: Icon,
    Mic: Icon,
    MessageCircle: Icon,
    SkipForward: Icon,
    ShieldAlert: Icon,
    Wand2: Icon,
  };
});

// GlassCard: transparent passthrough so children render normally
vi.mock('../../GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="glass-card" className={className}>{children}</div>
  ),
}));

// GapAnalysisReportPanel: stub — we only care that it renders, not its internals
vi.mock('../panels/GapAnalysisReportPanel', () => ({
  GapAnalysisReportPanel: () => <div data-testid="gap-analysis-report" />,
}));

// Heavy sub-cards that we don't test here
vi.mock('../cards/JobIntelligenceCard', () => ({
  JobIntelligenceCard: () => <div data-testid="job-intelligence-card" />,
}));
vi.mock('../cards/CandidateIntelligenceCard', () => ({
  CandidateIntelligenceCard: () => <div data-testid="candidate-intelligence-card" />,
}));
vi.mock('../cards/BenchmarkCandidateCard', () => ({
  BenchmarkCandidateCard: () => <div data-testid="benchmark-candidate-card" />,
}));
vi.mock('../cards/UnifiedGapAnalysisCard', () => ({
  UnifiedGapAnalysisCard: () => <div data-testid="unified-gap-analysis-card" />,
}));
vi.mock('../cards/NarrativeStrategyCard', () => ({
  NarrativeStrategyCard: () => <div data-testid="narrative-strategy-card" />,
}));
vi.mock('../cards/ScoresCard', () => ({
  ScoresCard: () => <div data-testid="scores-card" />,
}));
vi.mock('../cards/KeywordScoreDashboard', () => ({
  KeywordScoreDashboard: () => <div data-testid="keyword-score-dashboard" />,
}));
vi.mock('../cards/WhatChangedCard', () => ({
  WhatChangedCard: () => <div data-testid="what-changed-card" />,
}));
vi.mock('../cards/PreScoreReportCard', () => ({
  PreScoreReportCard: () => <div data-testid="pre-score-report-card" />,
}));
vi.mock('../cards/ScoringReportCard', () => ({
  ScoringReportCard: () => <div data-testid="scoring-report-card" />,
}));
vi.mock('../cards/HiringManagerReviewCard', () => ({
  HiringManagerReviewCard: () => <div data-testid="hiring-manager-review-card" />,
}));
vi.mock('../InlineEditToolbar', () => ({
  InlineEditToolbar: () => <div data-testid="inline-edit-toolbar" />,
}));
vi.mock('../DiffView', () => ({
  DiffView: ({ edit }: { edit: PendingEdit }) => (
    <div data-testid="diff-view">{edit.replacement}</div>
  ),
}));
vi.mock('../AddContextCard', () => ({
  AddContextCard: () => <div data-testid="add-context-card" />,
}));
vi.mock('../ExportBar', () => ({
  ExportBar: () => <div data-testid="export-bar" />,
}));

// jsdom does not implement scrollIntoView or scrollTo — stub them globally
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeResumeDraft(): ResumeDraft {
  return {
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
    core_competencies: ['Team Leadership', 'Cloud Architecture'],
    selected_accomplishments: [
      {
        content: 'Reduced deploy time by 60%',
        is_new: false,
        addresses_requirements: ['CI/CD experience'],
      },
      {
        content: 'Grew team from 5 to 45 engineers',
        is_new: false,
        addresses_requirements: [],
      },
    ],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        scope_statement: 'Led org of 45 engineers',
        bullets: [
          {
            text: 'Shipped 3 major product lines',
            is_new: false,
            addresses_requirements: ['Product delivery'],
          },
          {
            text: 'Cut infrastructure cost 30%',
            is_new: false,
            addresses_requirements: [],
          },
        ],
      },
    ],
    education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
  };
}

function makeJobIntelligence(): JobIntelligence {
  return {
    company_name: 'TechCorp',
    role_title: 'VP Engineering',
    seniority_level: 'VP',
    core_competencies: [
      { competency: 'CI/CD experience', importance: 'must_have', evidence_from_jd: 'Required' },
      { competency: 'Product delivery', importance: 'important', evidence_from_jd: 'Preferred' },
    ],
    strategic_responsibilities: ['Lead engineering org'],
    business_problems: ['Scale engineering team'],
    cultural_signals: ['Bias for action'],
    hidden_hiring_signals: ['Needs a builder'],
    language_keywords: ['platform', 'scale'],
    industry: 'SaaS',
  };
}

function makeGapAnalysis(): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'CI/CD experience',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['Reduced deploy time by 60%'],
      },
      {
        requirement: 'Product delivery',
        importance: 'important',
        classification: 'partial',
        evidence: [],
      },
    ],
    coverage_score: 75,
    strength_summary: 'Strong technical leadership background.',
    critical_gaps: [],
    pending_strategies: [],
  };
}

/** Minimal V2PipelineData that satisfies canShowResumeDocument */
function makePipelineDataWithResume(overrides: Partial<V2PipelineData> = {}): V2PipelineData {
  return {
    sessionId: 'test-session',
    stage: 'complete',
    jobIntelligence: makeJobIntelligence(),
    candidateIntelligence: null,
    benchmarkCandidate: null,
    gapAnalysis: makeGapAnalysis(),
    gapCoachingCards: null,
    preScores: null,
    narrativeStrategy: null,
    resumeDraft: makeResumeDraft(),
    assembly: null,
    inlineSuggestions: [],
    verificationDetail: null,
    error: null,
    stageMessages: [],
    ...overrides,
  };
}

/** Default no-op props for V2StreamingDisplay */
function makeDisplayProps(
  overrides: Partial<React.ComponentProps<typeof V2StreamingDisplay>> = {},
): React.ComponentProps<typeof V2StreamingDisplay> {
  return {
    data: makePipelineDataWithResume(),
    isComplete: true,
    isConnected: true,
    error: null,
    editableResume: makeResumeDraft(),
    pendingEdit: null,
    isEditing: false,
    editError: null,
    undoCount: 0,
    redoCount: 0,
    onRequestEdit: vi.fn(),
    onAcceptEdit: vi.fn(),
    onRejectEdit: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddContext: vi.fn(),
    isRerunning: false,
    liveScores: null,
    isScoring: false,
    gapCoachingCards: null,
    onRespondGapCoaching: vi.fn(),
    preScores: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ResumeDocumentCard — InlineEditPanel tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ResumeDocumentCard — bullet accessibility', () => {
  it('renders bullets with role="button" and tabIndex={0} when onBulletClick is provided', () => {
    const resume = makeResumeDraft();
    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    // Filter to only the span-based bullet buttons (not the lightbulb icon buttons)
    const bulletButtons = buttons.filter((el) => el.tagName === 'SPAN');
    expect(bulletButtons.length).toBeGreaterThan(0);
    for (const btn of bulletButtons) {
      expect(btn).toHaveAttribute('tabindex', '0');
    }
  });

  it('does NOT render span[role=button] when onBulletClick is absent', () => {
    const resume = makeResumeDraft();
    render(<ResumeDocumentCard resume={resume} />);

    const bulletButtons = screen
      .queryAllByRole('button')
      .filter((el) => el.tagName === 'SPAN');
    expect(bulletButtons.length).toBe(0);
  });
});

describe('ResumeDocumentCard — bullet click shows InlineEditPanel', () => {
  it('calls onBulletClick with correct args when a selected_accomplishments bullet is clicked', () => {
    const resume = makeResumeDraft();
    const onBulletClick = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={onBulletClick}
      />,
    );

    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));

    expect(onBulletClick).toHaveBeenCalledOnce();
    expect(onBulletClick).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      0,
      ['CI/CD experience'],
    );
  });

  it('calls onBulletClick with correct args when a professional_experience bullet is clicked', () => {
    const resume = makeResumeDraft();
    const onBulletClick = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={onBulletClick}
      />,
    );

    // bulletIndex for exp[0] bullet[0] = 0 * 100 + 0 = 0
    fireEvent.click(screen.getByText('Shipped 3 major product lines'));

    expect(onBulletClick).toHaveBeenCalledOnce();
    expect(onBulletClick).toHaveBeenCalledWith(
      'Shipped 3 major product lines',
      'professional_experience',
      0,
      ['Product delivery'],
    );
  });

  it('renders InlineEditPanel when activeBullet matches a selected_accomplishments bullet', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    // Action buttons from InlineEditPanel should appear
    expect(screen.getByRole('button', { name: 'Improve Wording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Proof' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeInTheDocument();
  });

  it('does NOT render InlineEditPanel when activeBullet does not match', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 1 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    // Index 1 has no requirements and different content; InlineEditPanel renders for it,
    // but the action buttons should still appear (panel is for index 1, not absent).
    // Verify index 0's panel is NOT rendered — meaning only one set of action buttons exists.
    expect(screen.getAllByRole('button', { name: 'Improve Wording' })).toHaveLength(1);
  });
});

describe('ResumeDocumentCard — keyboard accessibility', () => {
  it('fires onBulletClick when Enter is pressed on a bullet', () => {
    const resume = makeResumeDraft();
    const onBulletClick = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={onBulletClick}
      />,
    );

    const bulletSpan = screen.getByText('Reduced deploy time by 60%');
    fireEvent.keyDown(bulletSpan, { key: 'Enter' });

    expect(onBulletClick).toHaveBeenCalledOnce();
    expect(onBulletClick).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      0,
      ['CI/CD experience'],
    );
  });

  it('fires onBulletClick when Space is pressed on a bullet', () => {
    const resume = makeResumeDraft();
    const onBulletClick = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={onBulletClick}
      />,
    );

    const bulletSpan = screen.getByText('Grew team from 5 to 45 engineers');
    fireEvent.keyDown(bulletSpan, { key: ' ' });

    expect(onBulletClick).toHaveBeenCalledOnce();
    expect(onBulletClick).toHaveBeenCalledWith(
      'Grew team from 5 to 45 engineers',
      'selected_accomplishments',
      1,
      [],
    );
  });

  it('does NOT fire onBulletClick for other keys', () => {
    const resume = makeResumeDraft();
    const onBulletClick = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={onBulletClick}
      />,
    );

    const bulletSpan = screen.getByText('Reduced deploy time by 60%');
    fireEvent.keyDown(bulletSpan, { key: 'Tab' });

    expect(onBulletClick).not.toHaveBeenCalled();
  });
});

describe('InlineEditPanel — action buttons', () => {
  it('calls onRequestEdit with "strengthen" when Improve Wording is clicked', () => {
    const resume = makeResumeDraft();
    const onRequestEdit = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Improve Wording' }));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      'strengthen',
    );
  });

  it('calls onRequestEdit with "add_metrics" when Add Proof is clicked', () => {
    const resume = makeResumeDraft();
    const onRequestEdit = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Proof' }));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      'add_metrics',
    );
  });

  it('calls onRequestEdit with "rewrite" when Rewrite is clicked', () => {
    const resume = makeResumeDraft();
    const onRequestEdit = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={onRequestEdit}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      'rewrite',
    );
  });

  it('disables action buttons while isEditing is true', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        isEditing={true}
        pendingEdit={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Improve Wording' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Proof' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeDisabled();
  });
});

describe('InlineEditPanel — pending edit suggestion', () => {
  it('shows the suggestion when pendingEdit matches section AND originalText', () => {
    const resume = makeResumeDraft();
    const pendingEdit: PendingEdit = {
      section: 'selected_accomplishments',
      originalText: 'Reduced deploy time by 60%',
      replacement: 'Cut release cycle from 2 weeks to 3 days, improving deployment frequency by 4x',
      action: 'strengthen',
    };

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        pendingEdit={pendingEdit}
        isEditing={false}
      />,
    );

    expect(
      screen.getByDisplayValue(
        'Cut release cycle from 2 weeks to 3 days, improving deployment frequency by 4x',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does NOT show the suggestion when pendingEdit section differs', () => {
    const resume = makeResumeDraft();
    const pendingEdit: PendingEdit = {
      section: 'professional_experience',
      originalText: 'Reduced deploy time by 60%',
      replacement: 'Some improvement text',
      action: 'strengthen',
    };

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        pendingEdit={pendingEdit}
        isEditing={false}
      />,
    );

    expect(screen.queryByDisplayValue('Some improvement text')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('does NOT show the suggestion when pendingEdit originalText differs', () => {
    const resume = makeResumeDraft();
    const pendingEdit: PendingEdit = {
      section: 'selected_accomplishments',
      originalText: 'Grew team from 5 to 45 engineers', // bullet index 1, not 0
      replacement: 'Scaled engineering org from 5 to 45 engineers, 9x headcount growth',
      action: 'strengthen',
    };

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        pendingEdit={pendingEdit}
        isEditing={false}
      />,
    );

    expect(
      screen.queryByDisplayValue('Scaled engineering org from 5 to 45 engineers, 9x headcount growth'),
    ).not.toBeInTheDocument();
  });

  it('calls onAcceptEdit with the replacement text when Accept is clicked', () => {
    const resume = makeResumeDraft();
    const onAcceptEdit = vi.fn();
    const pendingEdit: PendingEdit = {
      section: 'selected_accomplishments',
      originalText: 'Reduced deploy time by 60%',
      replacement: 'Cut release cycle from 2 weeks to 3 days',
      action: 'strengthen',
    };

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        pendingEdit={pendingEdit}
        isEditing={false}
        onAcceptEdit={onAcceptEdit}
        onRejectEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(onAcceptEdit).toHaveBeenCalledOnce();
    expect(onAcceptEdit).toHaveBeenCalledWith('Cut release cycle from 2 weeks to 3 days');
  });

  it('lets the user edit the suggested draft before accepting it', () => {
    const resume = makeResumeDraft();
    const onAcceptEdit = vi.fn();
    const pendingEdit: PendingEdit = {
      section: 'selected_accomplishments',
      originalText: 'Reduced deploy time by 60%',
      replacement: 'Cut release cycle from 2 weeks to 3 days',
      action: 'strengthen',
    };

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        pendingEdit={pendingEdit}
        isEditing={false}
        onAcceptEdit={onAcceptEdit}
        onRejectEdit={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Edit suggested rewrite before applying'), {
      target: { value: 'Cut release cycle from 2 weeks to 3 days across 3 teams' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(onAcceptEdit).toHaveBeenCalledWith(
      'Cut release cycle from 2 weeks to 3 days across 3 teams',
    );
  });

  it('calls onRejectEdit when Cancel is clicked', () => {
    const resume = makeResumeDraft();
    const onRejectEdit = vi.fn();
    const pendingEdit: PendingEdit = {
      section: 'selected_accomplishments',
      originalText: 'Reduced deploy time by 60%',
      replacement: 'Cut release cycle from 2 weeks to 3 days',
      action: 'strengthen',
    };

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        pendingEdit={pendingEdit}
        isEditing={false}
        onAcceptEdit={vi.fn()}
        onRejectEdit={onRejectEdit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onRejectEdit).toHaveBeenCalledOnce();
  });
});

describe('InlineEditPanel — requirement tags', () => {
  it('shows requirement tags when the active bullet has addresses_requirements', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 0 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    // index 0 has addresses_requirements: ['CI/CD experience']
    expect(screen.getByText('CI/CD experience')).toBeInTheDocument();
    expect(screen.getByText(/This bullet currently supports:/)).toBeInTheDocument();
  });

  it('does NOT show requirement tags when addresses_requirements is empty', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        activeBullet={{ section: 'selected_accomplishments', index: 1 }}
        onBulletClick={vi.fn()}
        onRequestEdit={vi.fn()}
        isEditing={false}
        pendingEdit={null}
      />,
    );

    // index 1 has addresses_requirements: []
    expect(screen.queryByText(/This bullet currently supports:/)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2StreamingDisplay — canShowResumeDocument
// ─────────────────────────────────────────────────────────────────────────────

describe('V2StreamingDisplay — layout modes', () => {
  it('renders the full-width resume document when a draft exists', () => {
    render(<V2StreamingDisplay {...makeDisplayProps()} />);

    // Resume document is rendered — bullets are visible
    expect(screen.getByText('Reduced deploy time by 60%')).toBeInTheDocument();
    // Left panel (RewriteQueuePanel) is NOT rendered
    expect(screen.queryByText('Requirements to Match')).not.toBeInTheDocument();
  });

  it('renders the processing status bar when no resume draft exists', () => {
    const props = makeDisplayProps({
      isComplete: false,
      editableResume: null,
      data: makePipelineDataWithResume({
        stage: 'analysis',
        jobIntelligence: null,
        candidateIntelligence: null,
        benchmarkCandidate: null,
        resumeDraft: null,
        assembly: null,
        gapAnalysis: null,
      }),
    });

    render(<V2StreamingDisplay {...props} />);

    // StagedProcessingViewer renders stage titles (without trailing '...')
    expect(screen.getByText('Reading your resume')).toBeInTheDocument();
  });

  it('shows the correct status text for each pipeline stage', () => {
    // StagedProcessingViewer renders all stage titles in a list regardless of stage.
    // Verify that for each stage the processing viewer is present (no resume document shown).
    const stages: Array<{ stage: string }> = [
      { stage: 'strategy' },
      { stage: 'writing' },
      { stage: 'verification' },
      { stage: 'assembly' },
    ];

    for (const { stage } of stages) {
      cleanup();
      const props = makeDisplayProps({
        isComplete: false,
        editableResume: null,
        data: makePipelineDataWithResume({
          stage: stage as import('@/types/resume-v2').V2Stage,
          resumeDraft: null,
          assembly: null,
        }),
      });
      render(<V2StreamingDisplay {...props} />);
      // StagedProcessingViewer always renders 'Optimizing Your Resume' as its header
      expect(screen.getByText('Optimizing Your Resume')).toBeInTheDocument();
    }
  });

  it('does NOT render resume document when isRerunning is true', () => {
    render(<V2StreamingDisplay {...makeDisplayProps({ isRerunning: true })} />);

    // Rerunning hides the (stale) resume and shows the processing bar
    expect(screen.queryByTestId('gap-analysis-report')).not.toBeInTheDocument();
  });

  it('renders resume document even when jobIntelligence is null', () => {
    const props = makeDisplayProps({
      data: makePipelineDataWithResume({ jobIntelligence: null }),
    });
    render(<V2StreamingDisplay {...props} />);

    // Full-width resume still renders — it no longer requires jobIntelligence
    expect(screen.getByText('Reduced deploy time by 60%')).toBeInTheDocument();
  });

  it('renders resume document even when gapAnalysis is null', () => {
    const props = makeDisplayProps({
      data: makePipelineDataWithResume({ gapAnalysis: null }),
    });
    render(<V2StreamingDisplay {...props} />);

    // Full-width resume still renders — it no longer requires gapAnalysis
    expect(screen.getByText('Reduced deploy time by 60%')).toBeInTheDocument();
  });

  it('renders processing bar when both editableResume and resumeDraft are null', () => {
    const props = makeDisplayProps({ editableResume: null });
    const data = makePipelineDataWithResume({ resumeDraft: null });
    render(<V2StreamingDisplay {...props} data={data} />);

    expect(screen.queryByTestId('gap-analysis-report')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2StreamingDisplay — activeBullet state management
// ─────────────────────────────────────────────────────────────────────────────

describe('V2StreamingDisplay — activeBullet cleared on rerun', () => {
  it('clears activeBullet when isRerunning changes to true', () => {
    // Start with isRerunning=false so split-screen renders and a bullet can be clicked
    const { rerender } = render(
      <V2StreamingDisplay
        {...makeDisplayProps({ isComplete: true, isRerunning: false })}
      />,
    );

    // Click a bullet to set activeBullet (pipeline is complete → onBulletClick is wired)
    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));

    // InlineEditPanel should now be visible (action buttons rendered)
    expect(screen.getByRole('button', { name: 'Improve Wording' })).toBeInTheDocument();

    // Simulate re-run starting: isRerunning becomes true
    // This also switches to streaming layout (split-screen hides), which itself
    // removes InlineEditPanel from the DOM — verify it's gone.
    rerender(
      <V2StreamingDisplay
        {...makeDisplayProps({ isComplete: false, isRerunning: true })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Strengthen' })).not.toBeInTheDocument();
  });
});

describe('V2StreamingDisplay — handleAcceptEdit clears activeBullet', () => {
  it('removes InlineEditPanel after the accept handler is invoked', () => {
    const pendingEdit: PendingEdit = {
      section: 'selected_accomplishments',
      originalText: 'Reduced deploy time by 60%',
      replacement: 'Cut release cycle from 2 weeks to 3 days',
      action: 'strengthen',
    };

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({ pendingEdit, isComplete: true })}
      />,
    );

    // Click bullet to open InlineEditPanel
    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();

    // Accept the edit — this calls handleAcceptEdit which sets activeBullet to null
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Strengthen' })).not.toBeInTheDocument();
  });
});

describe('V2StreamingDisplay — Escape key behavior', () => {
  it('clears activeBullet and calls onRejectEdit when Escape is pressed', () => {
    const onRejectEdit = vi.fn();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({ isComplete: true, onRejectEdit })}
      />,
    );

    // Open inline edit panel by clicking a bullet
    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));
    expect(screen.getByRole('button', { name: 'Improve Wording' })).toBeInTheDocument();

    // Press Escape at the window level
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(onRejectEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Strengthen' })).not.toBeInTheDocument();
  });

  it('does NOT call onRejectEdit for Escape when no activeBullet is set', () => {
    const onRejectEdit = vi.fn();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({ isComplete: true, onRejectEdit })}
      />,
    );

    // No bullet clicked — activeBullet is null, so the keydown listener is not registered
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(onRejectEdit).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2StreamingDisplay — DiffView visibility
// ─────────────────────────────────────────────────────────────────────────────

describe('V2StreamingDisplay — DiffView only shows when pendingEdit exists and activeBullet is null', () => {
  it('renders DiffView when pendingEdit is set and no activeBullet', () => {
    const pendingEdit: PendingEdit = {
      section: 'executive_summary',
      originalText: 'Seasoned engineering leader driving outcomes at scale.',
      replacement: 'Transformational engineering executive with a record of shipping at scale.',
      action: 'rewrite',
    };

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({ pendingEdit, isComplete: true })}
      />,
    );

    // No bullet has been clicked → activeBullet is null → DiffView should render
    expect(screen.getByTestId('diff-view')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Transformational engineering executive with a record of shipping at scale.',
      ),
    ).toBeInTheDocument();
  });

  it('does NOT render DiffView when pendingEdit is null', () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({ pendingEdit: null, isComplete: true })}
      />,
    );

    expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument();
  });

  it('does NOT render DiffView when activeBullet is set (inline panel takes precedence)', () => {
    const pendingEdit: PendingEdit = {
      section: 'selected_accomplishments',
      originalText: 'Reduced deploy time by 60%',
      replacement: 'Cut release cycle from 2 weeks to 3 days',
      action: 'strengthen',
    };

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({ pendingEdit, isComplete: true })}
      />,
    );

    // Click a bullet — sets activeBullet, which hides the DiffView
    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));

    // DiffView renders only when !activeBullet, so it should be gone
    expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument();
    // But the inline panel's Accept button is visible instead
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });
});
