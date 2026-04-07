// @vitest-environment jsdom
/**
 * Tests for:
 *   1. ResumeDocumentCard bullet accessibility
 *   2. V2StreamingDisplay layout modes and attention strip behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';

import { ResumeDocumentCard } from '../cards/ResumeDocumentCard';
import { V2StreamingDisplay } from '../V2StreamingDisplay';

import type { ResumeDraft, V2PipelineData, JobIntelligence, GapAnalysis, GapChatContext } from '@/types/resume-v2';
import type { PendingEdit } from '@/hooks/useInlineEdit';
import type { GapChatTargetInput } from '@/types/resume-v2';

// ─── Global mocks ─────────────────────────────────────────────────────────────

const mockBulletCoachingPanel = vi.hoisted(() => vi.fn());

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
    Pencil: Icon,
    ArrowUp: Icon,
    ArrowDown: Icon,
    BrainCircuit: Icon,
    EyeOff: Icon,
    Plus: Icon,
    Trash2: Icon,
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

vi.mock('../cards/PipelineProgressCard', () => ({
  PipelineProgressCard: () => <div data-testid="pipeline-progress-card" />,
}));

vi.mock('../cards/BulletCoachingPanel', () => ({
  BulletCoachingPanel: (props: unknown) => {
    mockBulletCoachingPanel(props);
    return <div data-testid="bullet-coaching-panel" />;
  },
  BulletConversationEditor: (props: unknown) => {
    mockBulletCoachingPanel(props);
    return <div data-testid="bullet-coaching-panel" />;
  },
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
      addresses_requirements: ['Product delivery'],
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

async function startEditingIfGatePresent() {
  const startButton = screen.queryByRole('button', { name: /Start Editing My Resume/i });
  if (!startButton) return;

  await act(async () => {
    fireEvent.click(startButton);
    await Promise.resolve();
  });
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

function makeChatContextMock() {
  return vi.fn((target: string | GapChatTargetInput): GapChatContext => {
    const requirement = typeof target === 'string'
      ? target
      : target.requirement ?? target.requirements?.[0] ?? '';
    const section = typeof target === 'string' ? undefined : target.section;
    const lineKind: GapChatContext['lineKind'] = section === 'executive_summary'
      ? 'summary'
      : section === 'core_competencies'
        ? 'competency'
        : section?.startsWith('custom_section:')
          ? 'custom_line'
          : 'bullet';

    return {
      evidence: [],
      currentStrategy: undefined,
      aiReasoning: undefined,
      inferredMetric: undefined,
      coachingPolicy: undefined,
      jobDescriptionExcerpt: `${requirement} from the job description`,
      candidateExperienceSummary: '',
      alternativeBullets: [],
      primaryRequirement: requirement,
      requirementSource: 'job_description' as const,
      sourceEvidence: `${requirement} from the job description`,
      lineKind,
      sectionLabel: section === 'executive_summary'
        ? 'Executive Summary'
        : section === 'core_competencies'
          ? 'Core Competencies'
          : section?.startsWith('custom_section:')
            ? 'AI Highlights'
            : 'Resume Line',
      relatedRequirements: typeof target === 'string'
        ? [requirement]
        : target.requirements ?? (requirement ? [requirement] : []),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ResumeDocumentCard — bullet accessibility tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ResumeDocumentCard — bullet accessibility', () => {
  it('renders non-green bullets with role="button" and tabIndex={0} when onBulletClick is provided', () => {
    const resume = makeResumeDraftWithAttention();
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

  it('does NOT render strong bullets as role="button" (only non-green bullets are interactive)', () => {
    const resume = makeResumeDraft();
    render(<ResumeDocumentCard resume={resume} />);

    const bulletButtons = screen
      .queryAllByRole('button')
      .filter((el) => el.tagName === 'SPAN');
    // Strong/green bullets are not clickable — they render as plain text spans
    expect(bulletButtons.length).toBe(0);
  });

  it('lets users click summary, competency, and custom-section lines for coaching', () => {
    const resume = makeResumeDraft();
    resume.custom_sections = [
      {
        id: 'ai_highlights',
        title: 'AI Highlights',
        kind: 'bullet_list',
        lines: ['Applied AI workflow automation to speed cross-functional planning'],
        summary: 'Built an AI-forward transformation story from real operating work.',
      },
    ];
    const onBulletClick = vi.fn();

    render(
      <ResumeDocumentCard
        resume={resume}
        requirementCatalog={[
          { requirement: 'Product delivery', source: 'job_description' },
          { requirement: 'AI workflow automation', source: 'job_description' },
        ]}
        onBulletClick={onBulletClick}
      />,
    );

    fireEvent.click(screen.getByText('Seasoned engineering leader driving outcomes at scale.'));
    expect(onBulletClick).toHaveBeenLastCalledWith(
      'Seasoned engineering leader driving outcomes at scale.',
      'executive_summary',
      0,
      ['Product delivery'],
      'strengthen',
      undefined,
      'Seasoned engineering leader driving outcomes at scale.',
      undefined,
      'adjacent',
      'tighten',
      false,
    );

    fireEvent.click(screen.getByText('Team Leadership'));
    expect(onBulletClick).toHaveBeenLastCalledWith(
      'Team Leadership',
      'core_competencies',
      0,
      [],
      'strengthen',
      undefined,
      'Team Leadership',
      undefined,
      'adjacent',
      'tighten',
      true,
    );

    fireEvent.click(screen.getByText('Applied AI workflow automation to speed cross-functional planning'));
    expect(onBulletClick).toHaveBeenLastCalledWith(
      'Applied AI workflow automation to speed cross-functional planning',
      'custom_section:ai_highlights',
      0,
      ['AI workflow automation'],
      'strengthen',
      undefined,
      'Applied AI workflow automation to speed cross-functional planning',
      undefined,
      'adjacent',
      'tighten',
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2StreamingDisplay — canShowResumeDocument
// ─────────────────────────────────────────────────────────────────────────────

describe('V2StreamingDisplay — layout modes', () => {
  it('renders the full-width resume document when a draft exists', async () => {
    render(<V2StreamingDisplay {...makeDisplayProps()} />);
    await startEditingIfGatePresent();

    // Resume document is rendered — bullets are visible
    const resumeBullets = await screen.findAllByText(/Reduced deploy time by 60%/i);
    expect(resumeBullets.length).toBeGreaterThan(0);
    // Left panel (RewriteQueuePanel) is NOT rendered
    expect(screen.queryByText('Requirements to Match')).not.toBeInTheDocument();
    expect(screen.queryByText(/Gap Analysis —/)).not.toBeInTheDocument();
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

    expect(screen.getByTestId('pipeline-progress-card')).toBeInTheDocument();
  });

  it('shows final review on the main resume canvas when review is available', async () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          onRequestHiringManagerReview: vi.fn(),
        })}
      />,
    );

    await startEditingIfGatePresent();
    expect(await screen.findByTestId('hiring-manager-review-card')).toBeInTheDocument();
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

  it('keeps the score summary visible but collapses the full scoring report in resume mode', async () => {
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

    await startEditingIfGatePresent();
    const resumeBullets = await screen.findAllByText(/Reduced deploy time by 60%/i);
    expect(resumeBullets.length).toBeGreaterThan(0);
    const fullScoringReportButton = screen.getByRole('button', { name: /Full Scoring Report/i });
    expect(screen.getByText('Resume Score')).toBeInTheDocument();
    expect(screen.getByText('Do this next')).toBeInTheDocument();
    expect(screen.getByText(/Run final review on this resume to catch any last hiring-manager, ATS, or credibility issues before export\./i)).toBeInTheDocument();
    expect(fullScoringReportButton).toBeInTheDocument();
    expect(screen.queryByText('Original ATS Match')).not.toBeInTheDocument();
    expect(screen.queryByText('On-Paper Fit Score')).not.toBeInTheDocument();
    expect(screen.queryByText('What improved')).not.toBeInTheDocument();
    expect(screen.queryByText('Still to close')).not.toBeInTheDocument();
  });

  it('shows a compact attention-line navigator when the resume has amber or red bullets', async () => {
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

    await startEditingIfGatePresent();
    const strip = await screen.findByTestId('attention-review-strip');
    expect(strip).toBeInTheDocument();
    expect(within(strip).getByText('Review Attention Lines')).toBeInTheDocument();
    expect(within(strip).getByText('1 of 2')).toBeInTheDocument();
    expect(within(strip).getByText(/2 lines still need attention\. click a bullet on the resume to review it here\./i)).toBeInTheDocument();
    expect(within(strip).getByText(/Next best action: Start in VP Engineering · Acme Corp and review the bullet marked 'needs proof'\./i)).toBeInTheDocument();
    expect(within(strip).getByText('Needs proof')).toBeInTheDocument();
    expect(within(strip).getByText('VP Engineering · Acme Corp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to bullet' })).toBeInTheDocument();
  });

  it('lets the user step through attention lines and open the current one on the resume', async () => {
    const attentionResume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext: makeChatContextMock(),
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

    await startEditingIfGatePresent();
    expect(await screen.findByTestId('attention-review-current-text')).toHaveTextContent('Shipped 3 major product lines');

    fireEvent.click(screen.getByRole('button', { name: 'Next Line' }));

    const strip = screen.getByTestId('attention-review-strip');
    expect(within(strip).getByText('2 of 2')).toBeInTheDocument();
    expect(within(strip).getByText('Selected Accomplishments')).toBeInTheDocument();
    expect(screen.getByTestId('attention-review-current-text')).toHaveTextContent('Reduced deploy time by 60%');

    fireEvent.click(screen.getByRole('button', { name: 'Jump to bullet' }));

    expect((await screen.findAllByTestId('bullet-coaching-panel')).length).toBeGreaterThan(0);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      bulletText: string;
      evidenceFound: string;
      requirementSource?: string;
    };
    expect(lastCall.bulletText).toBe('Reduced deploy time by 60%');
    expect(lastCall.evidenceFound).toBe('Improved deployment workflow across engineering teams');
    expect(lastCall.requirementSource).toBe('job_description');
  });

  it('keeps the strongest two custom sections visible in Section Polish', async () => {
    const resume = makeResumeDraft();
    resume.custom_sections = [
      {
        id: 'ai_highlights',
        title: 'AI Highlights',
        kind: 'bullet_list',
        lines: ['Applied AI workflow automation to speed cross-functional planning'],
        summary: 'Built an AI-forward transformation story from real operating work.',
        recommended_for_job: true,
      },
      {
        id: 'transformation_highlights',
        title: 'Transformation Highlights',
        kind: 'bullet_list',
        lines: [
          'Led plant-network transformation work across three sites.',
          'Built KPI reviews and operating cadence improvements that reduced defects by 25%.',
        ],
        recommended_for_job: true,
      },
    ];

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: resume,
          data: makePipelineDataWithResume({
            resumeDraft: resume,
            assembly: {
              final_resume: resume,
              scores: {
                ats_match: 87,
                truth: 92,
                tone: 88,
              },
              quick_wins: [],
            },
            requirementWorkItems: [
              {
                id: 'work-ai',
                requirement: 'Lead AI automation and operating-model change',
                source: 'job_description',
                importance: 'important',
                candidate_evidence: [],
                best_evidence_excerpt: 'Applied AI workflow automation to speed cross-functional planning',
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'strengthen',
                next_best_action: 'tighten',
              },
              {
                id: 'work-transform',
                requirement: 'Drive transformation across multiple sites',
                source: 'job_description',
                importance: 'important',
                candidate_evidence: [],
                best_evidence_excerpt: 'Led plant-network transformation work across three sites',
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'strengthen',
                next_best_action: 'tighten',
              },
            ],
          }),
        })}
      />,
    );

    await startEditingIfGatePresent();

    expect(screen.getAllByRole('button', { name: /AI Highlights/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Transformation Highlights/i }).length).toBeGreaterThan(0);
  });

  it('opens coaching immediately after adding a recommended custom section', async () => {
    const resume = makeResumeDraft();
    const nextResume: ResumeDraft = {
      ...resume,
      custom_sections: [
        {
          id: 'transformation_highlights',
          title: 'Transformation Highlights',
          kind: 'bullet_list',
          lines: [
            'Applied automation and data workflows to tighten operating rhythm across multiple sites.',
            'Led transformation work across 3 sites while rolled out workflow automation across operations.',
            'Drove transformation initiatives across 3 sites that improved throughput by 18% (18%).',
          ],
        },
      ],
      section_plan: [
        ...(resume.section_plan ?? []),
        {
          id: 'transformation_highlights',
          type: 'custom',
          title: 'Transformation Highlights',
          enabled: true,
          order: 7,
          source: 'user_added',
          recommended_for_job: true,
          is_custom: true,
        },
      ],
    };

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: resume,
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext: makeChatContextMock(),
          onMoveSection: vi.fn(),
          onToggleSection: vi.fn(),
          onAddAISection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
          onAddCustomSection: vi.fn(() => ({
            sectionId: 'transformation_highlights',
            title: 'Transformation Highlights',
            lines: [
              'Applied automation and data workflows to tighten operating rhythm across multiple sites.',
              'Led transformation work across 3 sites while rolled out workflow automation across operations.',
              'Drove transformation initiatives across 3 sites that improved throughput by 18% (18%).',
            ],
            presetId: 'transformation_highlights' as const,
            resume: nextResume,
          })),
          data: makePipelineDataWithResume({
            resumeDraft: resume,
            candidateIntelligence: {
              contact: {
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '555-0100',
              },
              career_themes: ['Transformation'],
              leadership_scope: 'Regional operations',
              quantified_outcomes: [
                { outcome: 'improved throughput by 18%', metric_type: 'scope', value: '18%' },
              ],
              industry_depth: ['Manufacturing'],
              technologies: ['SAP'],
              operational_scale: '3 sites',
              career_span_years: 18,
              experience: [],
              education: [],
              certifications: [],
              hidden_accomplishments: [],
              ai_readiness: undefined,
            },
            requirementWorkItems: [
              {
                id: 'work-transform',
                requirement: 'Lead automation and operating-model transformation',
                source: 'job_description',
                importance: 'important',
                candidate_evidence: [
                  {
                    text: 'Rolled out workflow automation across operations.',
                    source_type: 'uploaded_resume',
                    evidence_strength: 'adjacent',
                  },
                ],
                best_evidence_excerpt: 'Rolled out workflow automation across operations.',
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'strengthen',
                next_best_action: 'tighten',
              },
            ],
            assembly: {
              final_resume: resume,
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

    await startEditingIfGatePresent();
    fireEvent.click(screen.getAllByRole('button', { name: /add now/i })[0]);

    expect((await screen.findAllByTestId('bullet-coaching-panel')).length).toBeGreaterThan(0);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      section: string;
      bulletText: string;
      requirements: string[];
    };
    expect(lastCall.section).toBe('custom_section:transformation_highlights');
    expect(lastCall.bulletText).toBe('Applied automation and data workflows to tighten operating rhythm across multiple sites.');
    expect(lastCall.requirements).toContain('Lead automation and operating-model transformation');
  });

  it('opens coaching immediately after adding the AI section', async () => {
    const resume = makeResumeDraft();
    const nextResume: ResumeDraft = {
      ...resume,
      custom_sections: [
        {
          id: 'ai_highlights',
          title: 'AI Leadership & Transformation',
          kind: 'bullet_list',
          summary: 'Applied AI and automation to improve operating rhythm across multiple sites.',
          lines: [
            'Applied AI and automation to improve operating rhythm across multiple sites.',
            'Used workflow automation to speed cross-functional planning and execution.',
          ],
          recommended_for_job: true,
        },
      ],
      section_plan: [
        ...(resume.section_plan ?? []),
        {
          id: 'ai_highlights',
          type: 'ai_highlights',
          title: 'AI Leadership & Transformation',
          enabled: true,
          order: 2,
          source: 'ai_readiness',
          recommended_for_job: true,
          is_custom: true,
        },
      ],
    };

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: resume,
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext: makeChatContextMock(),
          onMoveSection: vi.fn(),
          onToggleSection: vi.fn(),
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
          onAddAISection: vi.fn(() => ({
            sectionId: 'ai_highlights',
            title: 'AI Leadership & Transformation',
            lines: [
              'Applied AI and automation to improve operating rhythm across multiple sites.',
              'Used workflow automation to speed cross-functional planning and execution.',
            ],
            resume: nextResume,
          })),
          data: makePipelineDataWithResume({
            resumeDraft: resume,
            candidateIntelligence: {
              contact: {
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '555-0100',
              },
              career_themes: ['Transformation'],
              leadership_scope: 'Regional operations',
              quantified_outcomes: [],
              industry_depth: ['Manufacturing'],
              technologies: ['SAP'],
              operational_scale: '3 sites',
              career_span_years: 18,
              experience: [],
              education: [],
              certifications: [],
              hidden_accomplishments: [],
              ai_readiness: {
                strength: 'moderate',
                summary: 'Applied AI and automation to improve operating rhythm across multiple sites.',
                signals: [
                  {
                    family: 'automation',
                    evidence: 'Used workflow automation to speed cross-functional planning and execution.',
                    executive_framing: 'Applied AI and automation to improve operating rhythm across multiple sites.',
                  },
                ],
              },
            },
            requirementWorkItems: [
              {
                id: 'work-ai',
                requirement: 'Lead AI automation and operating-model change',
                source: 'job_description',
                importance: 'important',
                candidate_evidence: [
                  {
                    text: 'Used workflow automation to speed cross-functional planning and execution.',
                    source_type: 'uploaded_resume',
                    evidence_strength: 'adjacent',
                  },
                ],
                best_evidence_excerpt: 'Used workflow automation to speed cross-functional planning and execution.',
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'strengthen',
                next_best_action: 'tighten',
              },
            ],
            assembly: {
              final_resume: resume,
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

    await startEditingIfGatePresent();
    fireEvent.click(screen.getAllByRole('button', { name: /add ai section/i })[0]);

    expect((await screen.findAllByTestId('bullet-coaching-panel')).length).toBeGreaterThan(0);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      section: string;
      bulletText: string;
      requirements: string[];
    };
    expect(lastCall.section).toBe('custom_section:ai_highlights');
    expect(lastCall.bulletText).toBe('Applied AI and automation to improve operating rhythm across multiple sites.');
    expect(lastCall.requirements).toContain('Lead AI automation and operating-model change');
  });

  it('opens the summary in coaching mode without offering remove', async () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext: makeChatContextMock(),
        })}
      />,
    );

    await startEditingIfGatePresent();
    fireEvent.click(screen.getAllByText('Seasoned engineering leader driving outcomes at scale.')[0]);

    expect((await screen.findAllByTestId('bullet-coaching-panel')).length).toBeGreaterThan(0);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      bulletText: string;
      section: string;
      canRemove?: boolean;
      chatContext: {
        lineKind?: string;
        sectionLabel?: string;
        relatedRequirements?: string[];
      };
    };
    expect(lastCall.section).toBe('executive_summary');
    expect(lastCall.bulletText).toBe('Seasoned engineering leader driving outcomes at scale.');
    expect(lastCall.canRemove).toBe(false);
    expect(lastCall.chatContext.lineKind).toBe('summary');
    expect(lastCall.chatContext.sectionLabel).toBe('Executive Summary');
    expect(lastCall.chatContext.relatedRequirements).toContain('Product delivery');
  });

  it('uses work-item requirements when opening section polish targets', async () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext: makeChatContextMock(),
          data: makePipelineDataWithResume({
            requirementWorkItems: [
              {
                id: 'work-item-summary-delivery',
                requirement: 'Product delivery',
                source: 'job_description',
                importance: 'must_have',
                candidate_evidence: [
                  {
                    text: 'Led product and engineering delivery across multiple launches.',
                    source_type: 'uploaded_resume',
                    evidence_strength: 'direct',
                  },
                ],
                best_evidence_excerpt: 'Led product and engineering delivery across multiple launches.',
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'strengthen',
                next_best_action: 'tighten',
              },
              {
                id: 'work-item-summary-leadership',
                requirement: 'Executive leadership',
                source: 'benchmark',
                importance: 'important',
                candidate_evidence: [
                  {
                    text: 'Managed multi-team engineering organizations.',
                    source_type: 'uploaded_resume',
                    evidence_strength: 'adjacent',
                  },
                ],
                best_evidence_excerpt: 'Managed multi-team engineering organizations.',
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'strengthen',
                next_best_action: 'tighten',
              },
            ],
          }),
        })}
      />,
    );

    await startEditingIfGatePresent();
    expect(screen.getAllByText(/Lead with Product delivery and Executive leadership/i).length).toBeGreaterThan(0);

    fireEvent.click(
      screen
        .getAllByText(/Lead with Product delivery and Executive leadership/i)[0]
        .closest('button') as HTMLButtonElement,
    );

    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      section: string;
      requirements: string[];
      requirementSource?: string;
      evidenceFound: string;
      chatContext: {
        relatedRequirements?: string[];
      };
    };

    expect(lastCall.section).toBe('executive_summary');
    expect(lastCall.requirements).toEqual(['Product delivery', 'Executive leadership']);
    expect(lastCall.requirementSource).toBe('job_description');
    expect(lastCall.evidenceFound).toBe('Led product and engineering delivery across multiple launches.');
    expect(lastCall.chatContext.relatedRequirements).toEqual(
      expect.arrayContaining(['Product delivery', 'Executive leadership']),
    );
  });

  it('shows clarification prompts for high-value proof upgrades and jumps to the related line', async () => {
    const attentionResume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext: makeChatContextMock(),
          data: makePipelineDataWithResume({
            requirementWorkItems: [
              {
                id: 'work-item-product-delivery',
                requirement: 'Product delivery',
                source: 'job_description',
                importance: 'must_have',
                candidate_evidence: [],
                proof_level: 'none',
                framing_guardrail: 'blocked',
                current_claim_strength: 'code_red',
                next_best_action: 'answer',
                clarifying_question: 'What specific product launch or delivery outcome proves this most clearly?',
              },
            ],
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

    await startEditingIfGatePresent();
    expect(screen.getAllByText('Fastest Proof Upgrades').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('What specific product launch or delivery outcome proves this most clearly?').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Could strengthen 1 line/i).length).toBeGreaterThan(0);

    fireEvent.click(
      screen
        .getAllByText('What specific product launch or delivery outcome proves this most clearly?')[0]
        .closest('button') as HTMLButtonElement,
    );

    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      bulletText: string;
      section: string;
    };
    expect(lastCall.section).toBe('professional_experience');
    expect(lastCall.bulletText).toBe('Shipped 3 major product lines');
  });

  it('drops a line from the navigator once that line has changed in the working resume', async () => {
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

    await startEditingIfGatePresent();
    const strip = await screen.findByTestId('attention-review-strip');
    expect(within(strip).getByText('1 of 1')).toBeInTheDocument();
    expect(within(strip).getByText('Shipped 3 major product lines')).toBeInTheDocument();
    expect((await screen.findAllByText(/weekly release KPIs and deployment scorecards/i)).length).toBeGreaterThan(0);
    expect(within(strip).queryByText(/release KPIs and deployment scorecards/i)).not.toBeInTheDocument();
  });

  it('surfaces remembered evidence in the left rail and opens the matching line', async () => {
    const attentionResume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          clarificationMemory: [
            {
              id: 'gap_chat:product delivery',
              source: 'gap_chat',
              topic: 'Product delivery',
              userInput: 'Led weekly KPI reviews across three plants and used them to cut defects.',
              appliedLanguage: 'Led weekly KPI reviews across 3 plants.',
              primaryFamily: 'metrics',
              families: ['metrics'],
            },
          ],
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext: makeChatContextMock(),
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

    await startEditingIfGatePresent();
    expect(screen.getAllByText('We already know this from your earlier answers').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Could strengthen 1 line/i).length).toBeGreaterThan(0);

    fireEvent.click(
      screen
        .getAllByText(/Led weekly KPI reviews across three plants and used them to cut defects\./i)[0]
        .closest('button') as HTMLButtonElement,
    );

    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      bulletText: string;
      section: string;
      initialReuseClarificationId?: string;
    };
    expect(lastCall.section).toBe('professional_experience');
    expect(lastCall.bulletText).toBe('Shipped 3 major product lines');
    expect(lastCall.initialReuseClarificationId).toBe('gap_chat:product delivery');
  });

  it('hides redundant clarification cues when remembered evidence already covers the gap', async () => {
    const attentionResume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          clarificationMemory: [
            {
              id: 'gap_chat:product delivery',
              source: 'gap_chat',
              topic: 'Product delivery',
              userInput: 'Led weekly KPI reviews across three plants and used them to cut defects.',
              appliedLanguage: 'Led weekly KPI reviews across 3 plants.',
              primaryFamily: 'metrics',
              families: ['metrics'],
            },
          ],
          data: makePipelineDataWithResume({
            requirementWorkItems: [
              {
                id: 'work-item-product-delivery',
                requirement: 'Product delivery',
                source: 'job_description',
                importance: 'must_have',
                candidate_evidence: [
                  {
                    text: 'Built weekly KPI reviews and line-performance meetings across three plants.',
                    source_type: 'uploaded_resume',
                    evidence_strength: 'adjacent',
                  },
                ],
                best_evidence_excerpt: 'Built weekly KPI reviews and line-performance meetings across three plants.',
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'strengthen',
                next_best_action: 'answer',
                clarifying_question: 'What specific product launch or delivery outcome proves this most clearly?',
              },
            ],
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

    await startEditingIfGatePresent();
    expect(screen.queryByText('Fastest Proof Upgrades')).not.toBeInTheDocument();
    expect(screen.getAllByText('We already know this from your earlier answers').length).toBeGreaterThan(0);
  });

  it('updates the attention summary to reuse earlier confirmed answers when available', async () => {
    const attentionResume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          clarificationMemory: [
            {
              id: 'gap_chat:product delivery',
              source: 'gap_chat',
              topic: 'Product delivery',
              userInput: 'Led weekly KPI reviews across three plants and used them to cut defects.',
              appliedLanguage: 'Led weekly KPI reviews across 3 plants.',
              primaryFamily: 'metrics',
              families: ['metrics'],
            },
          ],
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

    await startEditingIfGatePresent();
    const strip = await screen.findByTestId('attention-review-strip');
    expect(within(strip).getByText(/Next best action: Start in VP Engineering · Acme Corp and reuse an earlier confirmed answer\./i)).toBeInTheDocument();
    expect(screen.getByText(/1 line can already be strengthened from your earlier answers/i)).toBeInTheDocument();
  });

  it('shows the PipelineProgressCard for each pipeline stage', () => {
    const stages = ['strategy', 'writing', 'verification', 'assembly'] as const;

    for (const stage of stages) {
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
      expect(screen.getByTestId('pipeline-progress-card')).toBeInTheDocument();
    }
  });

  it('does NOT render resume document when isRerunning is true', () => {
    render(<V2StreamingDisplay {...makeDisplayProps({ isRerunning: true })} />);

    // Rerunning hides the (stale) resume and shows the processing bar
    expect(screen.queryByTestId('gap-analysis-report')).not.toBeInTheDocument();
  });

  it('renders resume document even when jobIntelligence is null', async () => {
    const props = makeDisplayProps({
      data: makePipelineDataWithResume({ jobIntelligence: null }),
    });
    render(<V2StreamingDisplay {...props} />);
    await startEditingIfGatePresent();

    // Full-width resume still renders — it no longer requires jobIntelligence
    expect((await screen.findAllByText(/Reduced deploy time by 60%/i)).length).toBeGreaterThan(0);
  });

  it('renders resume document even when gapAnalysis is null', async () => {
    const props = makeDisplayProps({
      data: makePipelineDataWithResume({ gapAnalysis: null }),
    });
    render(<V2StreamingDisplay {...props} />);
    await startEditingIfGatePresent();

    // Full-width resume still renders — it no longer requires gapAnalysis
    expect((await screen.findAllByText(/Reduced deploy time by 60%/i)).length).toBeGreaterThan(0);
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
  it('renders DiffView when pendingEdit is set and no activeBullet', async () => {
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

    await startEditingIfGatePresent();
    // No bullet has been clicked → activeBullet is null → DiffView should render
    expect(await screen.findByTestId('diff-view')).toBeInTheDocument();
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

});
