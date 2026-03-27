// @vitest-environment jsdom
/**
 * Tests for:
 *   1. InlineEditPanel (rendered via ResumeDocumentCard when activeBullet matches)
 *   2. V2StreamingDisplay split-screen toggle behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';

import { ResumeDocumentCard } from '../cards/ResumeDocumentCard';
import { V2StreamingDisplay } from '../V2StreamingDisplay';

import type { ResumeDraft, V2PipelineData, JobIntelligence, GapAnalysis } from '@/types/resume-v2';
import type { PendingEdit } from '@/hooks/useInlineEdit';

// ─── Global mocks ─────────────────────────────────────────────────────────────

vi.mock('../useStrategyThread', () => ({
  scrollToBullet: vi.fn(),
  scrollToAndHighlight: vi.fn(),
  scrollToAndFocusTarget: vi.fn(),
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

vi.mock('../cards/BulletEditPopover', () => ({
  BulletEditPopover: () => <div data-testid="bullet-edit-popover" />,
}));

// jsdom does not implement scrollIntoView or scrollTo — stub them globally
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
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
        confidence: 'strong' as const,
        evidence_found: '',
        requirement_source: 'job_description' as const,
      },
      {
        content: 'Grew team from 5 to 45 engineers',
        is_new: false,
        addresses_requirements: [],
        confidence: 'strong' as const,
        evidence_found: '',
        requirement_source: 'job_description' as const,
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
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
          {
            text: 'Cut infrastructure cost 30%',
            is_new: false,
            addresses_requirements: [],
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
        ],
      },
    ],
    education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
  };
}

function makeResumeDraftWithAttention(): ResumeDraft {
  const resume = makeResumeDraft();
  resume.selected_accomplishments[0] = {
    ...resume.selected_accomplishments[0],
    confidence: 'partial',
    evidence_found: 'Improved deployment workflow across engineering teams',
  };
  resume.professional_experience[0].bullets[0] = {
    ...resume.professional_experience[0].bullets[0],
    confidence: 'needs_validation',
    evidence_found: '',
    requirement_source: 'job_description',
  };
  return resume;
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
    gapQuestions: null,
    preScores: null,
    narrativeStrategy: null,
    resumeDraft: makeResumeDraft(),
    assembly: null,
    inlineSuggestions: [],
    hiringManagerScan: null,
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

  it('renders span[role=button] even when onBulletClick is absent (popover system always active)', () => {
    const resume = makeResumeDraft();
    render(<ResumeDocumentCard resume={resume} />);

    const bulletButtons = screen
      .queryAllByRole('button')
      .filter((el) => el.tagName === 'SPAN');
    // Bullets always render as role=button for the popover system
    expect(bulletButtons.length).toBeGreaterThan(0);
    for (const btn of bulletButtons) {
      expect(btn).toHaveAttribute('tabindex', '0');
    }
  });
});

describe('ResumeDocumentCard — bullet click shows InlineEditPanel', () => {
  it('opens BulletEditPopover when a selected_accomplishments bullet is clicked', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={vi.fn()}
      />,
    );

    // Clicking a bullet now opens the popover instead of calling onBulletClick
    const resumeLine = screen.getAllByText('Reduced deploy time by 60%')
      .find((element) => element.getAttribute('role') === 'button');

    expect(resumeLine).toBeTruthy();
    fireEvent.click(resumeLine!);

    expect(screen.getByTestId('bullet-edit-popover')).toBeInTheDocument();
  });

  it('opens BulletEditPopover when a professional_experience bullet is clicked', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Shipped 3 major product lines'));

    expect(screen.getByTestId('bullet-edit-popover')).toBeInTheDocument();
  });

  it('calls onBulletClick for a non-strong bullet so it can open in-place editing', () => {
    const resume = makeResumeDraftWithAttention();
    const onBulletClick = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={onBulletClick}
      />,
    );

    const resumeLine = screen.getAllByText('Reduced deploy time by 60%')
      .find((element) => element.getAttribute('role') === 'button');

    expect(resumeLine).toBeTruthy();
    fireEvent.click(resumeLine!);

    expect(onBulletClick).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      0,
      ['CI/CD experience'],
    );
  });

  it('does not call onBulletClick for a strong bullet', () => {
    const resume = makeResumeDraftWithAttention();
    const onBulletClick = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={onBulletClick}
      />,
    );

    fireEvent.click(screen.getByText('Grew team from 5 to 45 engineers'));

    expect(onBulletClick).not.toHaveBeenCalled();
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
    expect(screen.getByRole('button', { name: 'Strengthen wording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add proof' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shorten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rewrite safely' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not my voice' })).toBeInTheDocument();
    expect(screen.getByLabelText('Working draft for this resume line')).toBeInTheDocument();
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
    expect(screen.getAllByRole('button', { name: 'Strengthen wording' })).toHaveLength(1);
  });
});

describe('ResumeDocumentCard — keyboard accessibility', () => {
  it('opens BulletEditPopover when Enter is pressed on a bullet', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={vi.fn()}
      />,
    );

    const bulletSpan = screen.getByText('Reduced deploy time by 60%');
    fireEvent.keyDown(bulletSpan, { key: 'Enter' });

    // Enter toggles the popover open
    expect(screen.getByTestId('bullet-edit-popover')).toBeInTheDocument();
  });

  it('opens BulletEditPopover when Space is pressed on a bullet', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={vi.fn()}
      />,
    );

    const bulletSpan = screen.getByText('Grew team from 5 to 45 engineers');
    fireEvent.keyDown(bulletSpan, { key: ' ' });

    // Space toggles the popover open
    expect(screen.getByTestId('bullet-edit-popover')).toBeInTheDocument();
  });

  it('does NOT open popover for other keys', () => {
    const resume = makeResumeDraft();

    render(
      <ResumeDocumentCard
        resume={resume}
        onBulletClick={vi.fn()}
      />,
    );

    const bulletSpan = screen.getByText('Reduced deploy time by 60%');
    fireEvent.keyDown(bulletSpan, { key: 'Tab' });

    expect(screen.queryByTestId('bullet-edit-popover')).not.toBeInTheDocument();
  });
});

describe('InlineEditPanel — action buttons', () => {
  it('calls onRequestEdit with "strengthen" when Strengthen wording is clicked', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Strengthen wording' }));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      'strengthen',
      expect.stringContaining('Rewrite the current working draft from scratch.'),
    );
  });

  it('calls onRequestEdit with "add_metrics" when Add proof is clicked', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Add proof' }));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      'add_metrics',
      expect.stringContaining('Current working draft:'),
    );
  });

  it('calls onRequestEdit with "shorten" when Shorten is clicked', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Shorten' }));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      'shorten',
      expect.stringContaining('Current working draft:'),
    );
  });

  it('calls onRequestEdit with "rewrite" when Rewrite safely is clicked', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite safely' }));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      'rewrite',
      expect.stringContaining('Current working draft:'),
    );
  });

  it('passes the current working draft back into AI actions instead of appending blindly', () => {
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

    fireEvent.change(screen.getByLabelText('Working draft for this resume line'), {
      target: { value: 'Built weekly KPI reviews across 3 sites.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Strengthen wording' }));

    expect(onRequestEdit).toHaveBeenCalledWith(
      'Reduced deploy time by 60%',
      'selected_accomplishments',
      'strengthen',
      expect.stringContaining('Built weekly KPI reviews across 3 sites.'),
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

    expect(screen.getByRole('button', { name: 'Strengthen wording' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add proof' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Shorten' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rewrite safely' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not my voice' })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: 'Apply to Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard AI Draft' })).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Discard AI Draft' })).not.toBeInTheDocument();
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

  it('calls onAcceptEdit with the replacement text when Apply to Resume is clicked for an AI draft', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Apply to Resume' }));

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

    fireEvent.change(screen.getByLabelText('Working draft for this resume line'), {
      target: { value: 'Cut release cycle from 2 weeks to 3 days across 3 teams' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Resume' }));

    expect(onAcceptEdit).toHaveBeenCalledWith(
      'Cut release cycle from 2 weeks to 3 days across 3 teams',
    );
  });

  it('calls onRejectEdit when Discard AI Draft is clicked', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Discard AI Draft' }));

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
    expect(screen.getByText(/This line is trying to cover/i)).toBeInTheDocument();
  });

  it('falls back to the targeting label when addresses_requirements is empty', () => {
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
    expect(screen.getByText(/This line is trying to cover/i)).toBeInTheDocument();
    expect(screen.getAllByText('Targets Job Need').length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2StreamingDisplay — canShowResumeDocument
// ─────────────────────────────────────────────────────────────────────────────

describe('V2StreamingDisplay — layout modes', () => {
  it('renders the full-width resume document when a draft exists', () => {
    render(<V2StreamingDisplay {...makeDisplayProps()} />);

    // Resume document is rendered — bullets are visible
    const resumeBullet = screen.getByText('Reduced deploy time by 60%');
    expect(resumeBullet).toBeInTheDocument();
    // Left panel (RewriteQueuePanel) is NOT rendered
    expect(screen.queryByText('Requirements to Match')).not.toBeInTheDocument();
    // Analysis stays available, but secondary.
    const supportingAnalysis = screen.getByRole('button', { name: /Supporting Analysis/i });
    expect(supportingAnalysis).toBeInTheDocument();
    expect(screen.queryByText(/Gap Analysis —/)).not.toBeInTheDocument();
    expect(
      resumeBullet.compareDocumentPosition(supportingAnalysis) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the simplified processing card when no resume draft exists', () => {
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

    expect(screen.getByText('Building Your Tailored Resume')).toBeInTheDocument();
    expect(screen.getByText('We are rebuilding the resume now.')).toBeInTheDocument();
  });

  it('shows final review on the main resume canvas when review is available', () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          onRequestHiringManagerReview: vi.fn(),
        })}
      />,
    );

    expect(screen.getByTestId('hiring-manager-review-card')).toBeInTheDocument();
  });

  it('removes the gap overview from the live resume canvas', () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          onRequestHiringManagerReview: vi.fn(),
          data: makePipelineDataWithResume({
            preScores: {
              ats_match: 48,
              keywords_found: ['Operations'],
              keywords_missing: ['Performance metrics'],
            },
          }),
        })}
      />,
    );

    expect(screen.queryByText('Your Resume vs. This Role')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Expand overview card/i })).not.toBeInTheDocument();
  });

  it('keeps the score summary visible but collapses the full scoring report in resume mode', () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          onRequestHiringManagerReview: vi.fn(),
          data: makePipelineDataWithResume({
            preScores: {
              ats_match: 48,
              keywords_found: ['Operations'],
              keywords_missing: ['Performance metrics'],
            },
            assembly: {
              final_resume: makeResumeDraft(),
              scores: {
                ats_match: 87,
                truth: 92,
                tone: 88,
              },
              quick_wins: [],
            },
            verificationDetail: null,
            gapAnalysis: makeGapAnalysis(),
          }),
        })}
      />,
    );

    const resumeBullet = screen.getByText('Reduced deploy time by 60%');
    const fullScoringReportButton = screen.getByRole('button', { name: /Full Scoring Report/i });
    expect(screen.getByText('Score Snapshot')).toBeInTheDocument();
    expect(screen.getByText(/Before versus now, the biggest gains, and the few items still worth tightening before export\./i)).toBeInTheDocument();
    expect(screen.getByText('Resume Match Score')).toBeInTheDocument();
    expect(screen.getByText('Biggest gains')).toBeInTheDocument();
    expect(screen.getByText('Still to close')).toBeInTheDocument();
    expect(screen.getAllByText('Not run')).toHaveLength(2);
    expect(fullScoringReportButton).toBeInTheDocument();
    expect(screen.queryByText('Original ATS Match')).not.toBeInTheDocument();
    expect(screen.queryByText('Candidate Fit')).not.toBeInTheDocument();
    expect(
      resumeBullet.compareDocumentPosition(fullScoringReportButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows a compact attention-line navigator when the resume has amber or red bullets', () => {
    const attentionResume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          data: makePipelineDataWithResume({
            preScores: {
              ats_match: 48,
              keywords_found: ['Operations'],
              keywords_missing: ['Performance metrics'],
            },
            resumeDraft: attentionResume,
            assembly: {
              final_resume: attentionResume,
              scores: {
                ats_match: 87,
                truth: 92,
                tone: 88,
              },
              quick_wins: [],
            },
          }),
        })}
      />,
    );

    const strip = screen.getByTestId('attention-review-strip');
    expect(strip).toBeInTheDocument();
    expect(screen.getByText('Review Attention Lines')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/1 code-red line still needs proof, and 1 more still need attention/i)).toBeInTheDocument();
    expect(screen.getByText('Next best action')).toBeInTheDocument();
    expect(screen.getByText('Start with the strengthen line in Selected Accomplishments.')).toBeInTheDocument();
    expect(within(strip).getByText(/Next best action: Start with the strengthen line in Selected Accomplishments\./i)).toBeInTheDocument();
    expect(within(strip).getByText('Strengthen')).toBeInTheDocument();
    expect(within(strip).getByText('Selected Accomplishments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show on Resume' })).toBeInTheDocument();
  });

  it('lets the user step through attention lines and open the current one on the resume', () => {
    const attentionResume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          data: makePipelineDataWithResume({
            resumeDraft: attentionResume,
            assembly: {
              final_resume: attentionResume,
              scores: {
                ats_match: 87,
                truth: 92,
                tone: 88,
              },
              quick_wins: [],
            },
          }),
        })}
      />,
    );

    expect(screen.getByTestId('attention-review-current-text')).toHaveTextContent('Reduced deploy time by 60%');

    fireEvent.click(screen.getByRole('button', { name: 'Next Line' }));

    const strip = screen.getByTestId('attention-review-strip');
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(within(strip).getByText('VP Engineering · Acme Corp')).toBeInTheDocument();
    expect(screen.getByTestId('attention-review-current-text')).toHaveTextContent('Shipped 3 major product lines');

    fireEvent.click(screen.getByRole('button', { name: 'Show on Resume' }));

    expect(screen.getByRole('button', { name: 'Strengthen wording' })).toBeInTheDocument();
  });

  it('opens in-place editing when a needs-attention bullet is clicked directly on the resume', () => {
    const attentionResume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          data: makePipelineDataWithResume({
            resumeDraft: attentionResume,
            assembly: {
              final_resume: attentionResume,
              scores: {
                ats_match: 87,
                truth: 92,
                tone: 88,
              },
              quick_wins: [],
            },
          }),
        })}
      />,
    );

    const resumeLine = screen.getAllByText('Reduced deploy time by 60%')
      .find((element) => element.getAttribute('role') === 'button');

    expect(resumeLine).toBeTruthy();
    fireEvent.click(resumeLine!);

    expect(screen.getByRole('button', { name: 'Strengthen wording' })).toBeInTheDocument();
  });

  it('drops a line from the navigator once that line has changed in the working resume', () => {
    const baselineResume = makeResumeDraftWithAttention();
    const editedResume = makeResumeDraftWithAttention();
    editedResume.selected_accomplishments[0] = {
      ...editedResume.selected_accomplishments[0],
      content: 'Reduced deploy time by 60% using weekly release KPIs and deployment scorecards',
    };

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: editedResume,
          data: makePipelineDataWithResume({
            resumeDraft: baselineResume,
            assembly: {
              final_resume: baselineResume,
              scores: {
                ats_match: 87,
                truth: 92,
                tone: 88,
              },
              quick_wins: [],
            },
          }),
        })}
      />,
    );

    const strip = screen.getByTestId('attention-review-strip');
    expect(within(strip).getByText('1 of 1')).toBeInTheDocument();
    expect(within(strip).getByText('Shipped 3 major product lines')).toBeInTheDocument();
    expect(screen.getByText(/weekly release KPIs and deployment scorecards/i)).toBeInTheDocument();
    expect(within(strip).queryByText(/release KPIs and deployment scorecards/i)).not.toBeInTheDocument();
  });

  it('shows the correct status text for each pipeline stage', () => {
    const stageLabels: Array<{ stage: string; label: string }> = [
      { stage: 'strategy', label: 'Building your positioning strategy...' },
      { stage: 'writing', label: 'Drafting your resume...' },
      { stage: 'verification', label: 'Running quality checks...' },
      { stage: 'assembly', label: 'Preparing your suggestions...' },
    ];

    for (const { stage, label } of stageLabels) {
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
      // ProcessingStatusBar renders the stage-specific status label (may appear more than once in feed)
      const matches = screen.getAllByText(label);
      expect(matches.length).toBeGreaterThan(0);
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

describe('V2StreamingDisplay — popover cleared on rerun', () => {
  it('hides bullet popover when isRerunning changes to true', () => {
    // Start with isRerunning=false so resume renders and a bullet can be clicked
    const { rerender } = render(
      <V2StreamingDisplay
        {...makeDisplayProps({ isComplete: true, isRerunning: false })}
      />,
    );

    // Click a bullet to open popover (bullets now use popover system, not onBulletClick)
    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));

    // BulletEditPopover should now be visible
    expect(screen.getByTestId('bullet-edit-popover')).toBeInTheDocument();

    // Simulate re-run starting: isRerunning becomes true, resume document hides
    rerender(
      <V2StreamingDisplay
        {...makeDisplayProps({ isComplete: false, isRerunning: true })}
      />,
    );

    // Resume is hidden during rerun, so the popover is gone
    expect(screen.queryByTestId('bullet-edit-popover')).not.toBeInTheDocument();
  });
});

describe('V2StreamingDisplay — bullet popover toggle', () => {
  it('closes BulletEditPopover when the same bullet is clicked again', () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({ isComplete: true })}
      />,
    );

    // Click bullet to open popover
    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));
    expect(screen.getByTestId('bullet-edit-popover')).toBeInTheDocument();

    // Click same bullet again to close popover (toggle behavior)
    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));
    expect(screen.queryByTestId('bullet-edit-popover')).not.toBeInTheDocument();
  });
});

describe('V2StreamingDisplay — Escape key behavior', () => {
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

  it('clicking a bullet opens popover while DiffView remains for executive_summary edit', () => {
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

    // DiffView is present because pendingEdit is set and activeBullet is null
    expect(screen.getByTestId('diff-view')).toBeInTheDocument();

    // Click a bullet — opens popover (but does not set activeBullet in V2StreamingDisplay)
    fireEvent.click(screen.getByText('Reduced deploy time by 60%'));

    // BulletEditPopover is now visible
    expect(screen.getByTestId('bullet-edit-popover')).toBeInTheDocument();
    // DiffView is still visible because activeBullet is not set by popover click
    expect(screen.getByTestId('diff-view')).toBeInTheDocument();
  });
});
