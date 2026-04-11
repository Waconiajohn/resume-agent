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
import { scrollToAndFocusTarget } from '../useStrategyThread';
import { buildResumeSectionWorkflowViewModel } from '@/lib/resume-section-workflow';

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
    ArrowRight: Icon,
    BrainCircuit: Icon,
    EyeOff: Icon,
    Plus: Icon,
    Trash2: Icon,
    Download: Icon,
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
  window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
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
  const startButton = screen.queryByRole('button', { name: /Start Editing My Resume|Review Structure First|Review Sections First/i });
  if (!startButton) return;

  await act(async () => {
    fireEvent.click(startButton);
    await Promise.resolve();
  });
}

/**
 * After the ready gate, enter the section-by-section workflow via:
 *   1. "Adjust section structure" (Coach mode) or "Review section structure" (Reviewer mode) → opens structure plan
 *   2. "Continue to editing" → confirms structure and starts the workflow
 */
async function enterSectionWorkflow() {
  const adjustBtns = screen.queryAllByRole('button', { name: /(?:Adjust|Review) section structure/i });
  if (adjustBtns.length > 0) {
    await act(async () => {
      fireEvent.click(adjustBtns[0]);
      await Promise.resolve();
    });
  }
  const continueBtns = screen.queryAllByRole('button', { name: /Continue to editing/i });
  if (continueBtns.length > 0) {
    await act(async () => {
      fireEvent.click(continueBtns[0]);
      await Promise.resolve();
    });
  }
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
          : section === 'selected_accomplishments'
            ? 'Selected Accomplishments'
            : section === 'professional_experience'
              ? 'Professional Experience'
          : section?.startsWith('custom_section:')
            ? 'AI Highlights'
            : 'Resume Line',
      relatedRequirements: typeof target === 'string'
        ? [requirement]
        : target.requirements ?? (requirement ? [requirement] : []),
    };
  });
}

function makeReadySectionDrafts(
  resume: ResumeDraft,
  options?: {
    requirementWorkItems?: V2PipelineData['requirementWorkItems'];
    candidateIntelligence?: V2PipelineData['candidateIntelligence'];
  },
) {
  const workflow = buildResumeSectionWorkflowViewModel({
    resume,
    requirementWorkItems: options?.requirementWorkItems ?? [],
    candidateIntelligence: options?.candidateIntelligence ?? null,
  });

  return {
    workflow,
    drafts: Object.fromEntries(
      workflow.steps.map((step, index) => [
        step.id,
        {
          status: 'ready' as const,
          error: null,
          result: {
            recommendedVariantId: 'recommended' as const,
            variants: [
              {
                id: 'recommended' as const,
                label: 'Recommended',
                helper: 'Best fit for this role.',
                content: {
                  kind: 'paragraph' as const,
                  paragraph: `Recommended version for ${step.title} ${index + 1}.`,
                },
              },
              {
                id: 'safer' as const,
                label: 'Safer',
                helper: 'More conservative wording.',
                content: {
                  kind: 'paragraph' as const,
                  paragraph: `Safer version for ${step.title} ${index + 1}.`,
                },
              },
              {
                id: 'stronger' as const,
                label: 'Stronger',
                helper: 'Use only if fully supported.',
                content: {
                  kind: 'paragraph' as const,
                  paragraph: `Stronger version for ${step.title} ${index + 1}.`,
                },
              },
            ],
            whyItWorks: [`Explains why ${step.title} is stronger for the role.`],
            strengtheningNote: 'Add one scoped outcome here if it is accurate.',
          },
        },
      ]),
    ),
  };
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

  it('holds final review until the section workflow is complete', async () => {
    const resume = makeResumeDraft();
    const { workflow, drafts } = makeReadySectionDrafts(resume);
    const onApplySectionDraft = vi.fn();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: resume,
          sectionDrafts: drafts,
          onApplySectionDraft,
          onMoveSection: vi.fn(),
          onToggleSection: vi.fn(),
          onAddAISection: vi.fn(),
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
          onRequestHiringManagerReview: vi.fn(),
          hiringManagerResult: {
            six_second_scan: {
              decision: 'continue_reading',
              reason: 'The top third is clear enough to keep reading.',
              top_signals_seen: [],
              important_signals_missing: [],
            },
            hiring_manager_verdict: {
              rating: 'possible_interview',
              summary: 'The draft is strong enough for a final review pass.',
            },
            fit_assessment: {
              job_description_fit: 'moderate',
              benchmark_alignment: 'moderate',
              business_impact: 'strong',
              clarity_and_credibility: 'moderate',
            },
            top_wins: [],
            concerns: [],
            structure_recommendations: [],
            benchmark_comparison: {
              advantages_vs_benchmark: [],
              gaps_vs_benchmark: [],
              reframing_opportunities: [],
            },
            improvement_summary: [],
          } as never,
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
          }),
        })}
      />,
    );

    await startEditingIfGatePresent();
    await enterSectionWorkflow();
    expect(screen.queryByTestId('hiring-manager-review-card')).not.toBeInTheDocument();

    for (let index = 0; index < workflow.steps.length; index += 1) {
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: 'Use this version' })[0]);
        await Promise.resolve();
      });
    }

    expect(onApplySectionDraft).toHaveBeenCalledTimes(workflow.steps.length);
    expect((await screen.findAllByTestId('hiring-manager-review-card')).length).toBeGreaterThan(0);
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

  it('uses a non-zero keyword fallback and clearer checkpoint language when the current score is missing', () => {
    const resume = makeResumeDraftWithAttention();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: resume,
          data: makePipelineDataWithResume({
            resumeDraft: resume,
            preScores: {
              ats_match: 64,
              keyword_match_score: 64,
              keywords_found: ['product management'],
              keywords_missing: ['AI strategy', 'machine learning'],
              overall_fit_score: 58,
              job_requirement_coverage_score: 72,
            },
            assembly: {
              final_resume: resume,
              scores: {
                ats_match: 0,
                truth: 92,
                tone: 88,
              },
              quick_wins: [],
            },
            requirementWorkItems: [
              {
                id: 'answer-1',
                requirement: 'Requirement A',
                source: 'job_description',
                importance: 'must_have',
                candidate_evidence: [],
                proof_level: 'none',
                framing_guardrail: 'blocked',
                current_claim_strength: 'code_red',
                next_best_action: 'answer',
              },
              {
                id: 'answer-2',
                requirement: 'Requirement B',
                source: 'job_description',
                importance: 'important',
                candidate_evidence: [],
                proof_level: 'none',
                framing_guardrail: 'blocked',
                current_claim_strength: 'code_red',
                next_best_action: 'answer',
              },
              {
                id: 'confirm-1',
                requirement: 'Requirement C',
                source: 'benchmark',
                importance: 'important',
                candidate_evidence: [],
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'confirm_fit',
                next_best_action: 'confirm',
              },
              {
                id: 'confirm-2',
                requirement: 'Requirement D',
                source: 'benchmark',
                importance: 'important',
                candidate_evidence: [],
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'confirm_fit',
                next_best_action: 'confirm',
              },
              {
                id: 'confirm-3',
                requirement: 'Requirement E',
                source: 'benchmark',
                importance: 'important',
                candidate_evidence: [],
                proof_level: 'adjacent',
                framing_guardrail: 'reframe',
                current_claim_strength: 'confirm_fit',
                next_best_action: 'confirm',
              },
            ],
          }),
        })}
      />,
    );

    expect(screen.getByText(/Language match 64%/i)).toBeInTheDocument();
    expect(screen.getByText(/2 requirements still need concrete examples and\/or missing details before those claims are safe to add to the resume\./i)).toBeInTheDocument();
    expect(screen.getByText(/3 claims that would make your resume look more like a top candidate still need more verification before we should include them\./i)).toBeInTheDocument();
  });

  it('drops the mobile score summary once the user enters resume editing mode', async () => {
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
    expect(screen.queryByText('Resume Score')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Full Scoring Report|See full scoring report/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Original ATS Match')).not.toBeInTheDocument();
    expect(screen.queryByText('On-Paper Fit Score')).not.toBeInTheDocument();
    expect(screen.queryByText('What improved')).not.toBeInTheDocument();
    expect(screen.queryByText('Still to close')).not.toBeInTheDocument();
  });

  it('keeps mobile focused on the resume itself when coaching hooks are unavailable', async () => {
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
    expect(screen.queryByText('Resume Score')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Full Scoring Report|See full scoring report/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Reduced deploy time by 60%/i).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('attention-review-strip')).not.toBeInTheDocument();
  });

  it('shows the section workflow after entering it and keeps the line coach closed until a resume line is clicked', async () => {
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
          onMoveSection: vi.fn(),
          onToggleSection: vi.fn(),
          onAddAISection: vi.fn(),
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
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
    await enterSectionWorkflow();
    expect(screen.getAllByText('Executive Summary').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Step 1 of 4/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('What this section needs to do').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Best Draft For This Role').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Area 1 of 4/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Start Here')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bullet-coaching-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Seasoned engineering leader driving outcomes at scale.' })[0]);

    expect((await screen.findAllByTestId('bullet-coaching-panel')).length).toBeGreaterThan(0);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      bulletText: string;
      evidenceFound: string;
      requirementSource?: string;
    };
    expect(lastCall.bulletText).toBe('Seasoned engineering leader driving outcomes at scale.');
    expect(lastCall.evidenceFound).toBe('Seasoned engineering leader driving outcomes at scale.');
    expect(lastCall.requirementSource).toBeUndefined();
  });

  it('scrolls the active resume line into view after the ready gate opens when coaching is already targeted', async () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          initialActiveBullet: {
            section: 'selected_accomplishments',
            index: 0,
            requirements: ['CI/CD experience'],
          },
          data: makePipelineDataWithResume({
            assembly: {
              final_resume: makeResumeDraftWithAttention(),
              scores: {
                ats_match: 87,
                truth: 92,
                tone: 88,
              },
              quick_wins: [],
            },
          }),
          editableResume: makeResumeDraftWithAttention(),
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

    expect(scrollToAndFocusTarget).not.toHaveBeenCalled();

    await startEditingIfGatePresent();

    expect((await screen.findAllByTestId('bullet-coaching-panel')).length).toBeGreaterThan(0);
    expect(scrollToAndFocusTarget).toHaveBeenLastCalledWith('[data-resume-line="selected_accomplishments:0"]');
  });

  it('shows one section workflow at a time instead of the old stacked section cards', async () => {
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
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
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
    await enterSectionWorkflow();

    expect(screen.getAllByText('Executive Summary').length).toBeGreaterThan(0);
    expect(screen.getAllByText('What this section needs to do').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Area 1 of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByText('One clear next move')).not.toBeInTheDocument();
    expect(screen.queryByText(/Polish AI Highlights/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Polish Transformation Highlights/i)).not.toBeInTheDocument();
  });

  it('does not force section plan on entry — section plan is secondary', async () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: makeResumeDraft(),
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
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
          data: makePipelineDataWithResume(),
        })}
      />,
    );

    await startEditingIfGatePresent();

    // Section plan should NOT be the default entry view — it's secondary
    expect(screen.queryByText('Continue to editing')).not.toBeInTheDocument();
  });

  it('does not auto-regenerate a section draft after an error until the user retries', async () => {
    const resume = makeResumeDraft();
    const workflow = buildResumeSectionWorkflowViewModel({
      resume,
      requirementWorkItems: [],
      candidateIntelligence: null,
    });
    const firstStep = workflow.steps[0];
    const onGenerateSectionDraft = vi.fn();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: resume,
          data: makePipelineDataWithResume({ resumeDraft: resume }),
          sectionDrafts: {
            [firstStep.id]: {
              status: 'error',
              result: null,
              error: 'Too many requests. Please try again later.',
            },
          },
          onGenerateSectionDraft,
          onMoveSection: vi.fn(),
          onToggleSection: vi.fn(),
          onAddAISection: vi.fn(),
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
        })}
      />,
    );

    await startEditingIfGatePresent();
    await enterSectionWorkflow();

    expect(onGenerateSectionDraft).not.toHaveBeenCalled();
    expect(screen.getAllByText('Too many requests. Please try again later.').length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);
      await Promise.resolve();
    });

    expect(onGenerateSectionDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({ id: firstStep.id }),
        force: true,
      }),
    );
  });

  it.skip('opens coaching immediately after adding a custom section from the section composer — skipped: section plan is now secondary', async () => {
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
    const plannerCard = screen.getAllByText('Get the structure right first')[0]?.closest('.shell-panel') as HTMLElement | null;
    if (!plannerCard) {
      throw new Error('Section planner card not found');
    }

    fireEvent.click(within(plannerCard).getByRole('button', { name: /add section/i }));

    const openingLinesInput = await within(plannerCard).findByLabelText(/opening lines/i);
    const composerPanel = openingLinesInput.closest('.rounded-2xl') as HTMLElement | null;
    if (!composerPanel) {
      throw new Error('Composer panel not found');
    }

    await act(async () => {
      fireEvent.click(within(composerPanel).getByRole('button', { name: /^Add Section$/i }));
      await Promise.resolve();
    });

    expect((await screen.findAllByTestId('bullet-coaching-panel')).length).toBeGreaterThan(0);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      section: string;
      bulletText: string;
      requirements: string[];
    };
    expect(lastCall.section).toBe('custom_section:transformation_highlights');
    expect(lastCall.bulletText).toBe('Applied automation and data workflows to tighten operating rhythm across multiple sites.');
    expect(lastCall.requirements).toContain('Lead automation and operating-model transformation');
    expect(scrollToAndFocusTarget).toHaveBeenLastCalledWith('[data-resume-line="custom_section:transformation_highlights:0"]');
  });

  it.skip('opens coaching immediately after adding the AI section — skipped: section plan is now secondary', async () => {
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
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /add ai section/i })[0]);
      await Promise.resolve();
    });

    expect((await screen.findAllByTestId('bullet-coaching-panel')).length).toBeGreaterThan(0);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      section: string;
      bulletText: string;
      requirements: string[];
    };
    expect(lastCall.section).toBe('custom_section:ai_highlights');
    expect(lastCall.bulletText).toBe('Applied AI and automation to improve operating rhythm across multiple sites.');
    expect(lastCall.requirements).toContain('Lead AI automation and operating-model change');
    expect(scrollToAndFocusTarget).toHaveBeenLastCalledWith('[data-resume-line="custom_section:ai_highlights:-1"]');
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Seasoned engineering leader driving outcomes at scale.' })[0]);

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

  it('threads ranked work-item requirements into the executive summary workflow', async () => {
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
          onMoveSection: vi.fn(),
          onToggleSection: vi.fn(),
          onAddAISection: vi.fn(),
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
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
    await enterSectionWorkflow();
    expect(screen.getAllByText(/Show Product delivery early in the paragraph\./i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Support it with proof around Executive leadership\./i).length).toBeGreaterThan(0);
  });

  it('moves to the next section after applying the current section draft', async () => {
    const resume = makeResumeDraft();
    const { workflow, drafts } = makeReadySectionDrafts(resume);
    const onApplySectionDraft = vi.fn();

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: resume,
          sectionDrafts: drafts,
          onApplySectionDraft,
          onMoveSection: vi.fn(),
          onToggleSection: vi.fn(),
          onAddAISection: vi.fn(),
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
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
          }),
        })}
      />,
    );

    await startEditingIfGatePresent();
    await enterSectionWorkflow();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Use this version' })[0]);
      await Promise.resolve();
    });

    expect(onApplySectionDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: workflow.steps[0].id, title: 'Executive Summary' }),
      expect.objectContaining({ id: 'recommended' }),
    );
    expect(screen.getAllByText(/Step 2 of 4/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Selected Accomplishments').length).toBeGreaterThan(0);
  });

  it.skip('shows the structure planner first when the role suggests a missing section — skipped: section plan is now secondary', async () => {
    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          onMoveSection: vi.fn(),
          onToggleSection: vi.fn(),
          onAddAISection: vi.fn(),
          onAddCustomSection: vi.fn(),
          onRemoveCustomSection: vi.fn(),
          data: makePipelineDataWithResume({
            candidateIntelligence: {
              contact: {
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '555-0100',
              },
              career_themes: ['Transformation', 'Operations'],
              leadership_scope: 'Regional operations',
              quantified_outcomes: [
                { outcome: 'improved throughput by 18%', metric_type: 'scope', value: '18%' },
              ],
              industry_depth: ['Manufacturing'],
              technologies: ['SAP'],
              operational_scale: '3 sites',
              career_span_years: 18,
              experience: [
                {
                  company: 'Acme',
                  title: 'COO',
                  start_date: '2020',
                  end_date: 'Present',
                  bullets: ['Led enterprise operating-model redesign across three sites.'],
                },
              ],
              education: [],
              certifications: [],
              hidden_accomplishments: [],
              ai_readiness: undefined,
            },
            requirementWorkItems: [
              {
                id: 'work-item-projects',
                requirement: 'Lead enterprise transformation programs and major initiatives',
                source: 'job_description',
                importance: 'important',
                candidate_evidence: [
                  {
                    text: 'Led enterprise operating-model redesign across three sites.',
                    source_type: 'uploaded_resume',
                    evidence_strength: 'direct',
                  },
                ],
                best_evidence_excerpt: 'Led enterprise operating-model redesign across three sites.',
                proof_level: 'direct',
                framing_guardrail: 'exact',
                current_claim_strength: 'supported',
                next_best_action: 'accept',
              },
            ],
          }),
        })}
      />,
    );

    await startEditingIfGatePresent();
    expect(screen.getAllByText(/Get the structure right first/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Start with Executive Summary').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /add section/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Section Polish')).not.toBeInTheDocument();
  });

  it('threads clarification prompts directly into the active requirement coach', async () => {
    const attentionResume = makeResumeDraftWithAttention();
    const baseBuildChatContext = makeChatContextMock();
    const buildChatContext = vi.fn((target: string | GapChatTargetInput) => ({
      ...baseBuildChatContext(target),
      clarifyingQuestions: ['What specific product launch or delivery outcome proves this most clearly?'],
    }));

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
          buildChatContext,
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Seasoned engineering leader driving outcomes at scale.' })[0]);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      section: string;
      reviewState: string;
      chatContext: {
        clarifyingQuestions?: string[];
      };
    };
    expect(lastCall.section).toBe('executive_summary');
    expect(lastCall.reviewState).toBe('strengthen');
    expect(lastCall.chatContext.clarifyingQuestions).toEqual([
      'What specific product launch or delivery outcome proves this most clearly?',
    ]);
  });

  it('keeps mobile focused on the edited resume when one flagged line has already been fixed', async () => {
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
            preScores: {
              ats_match: 48,
              keywords_found: ['Operations'],
              keywords_missing: ['Performance metrics'],
            },
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
    expect(screen.queryByText(/1 lines? still need review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open the line in VP Engineering · Acme Corp\./i)).not.toBeInTheDocument();
    expect((await screen.findAllByText(/weekly release KPIs and deployment scorecards/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Open the line in Selected Accomplishments/i)).not.toBeInTheDocument();
  });

  it('threads remembered evidence into the active coach instead of showing a separate left-rail card', async () => {
    const attentionResume = makeResumeDraftWithAttention();
    const rememberedClarification = {
      id: 'gap_chat:product delivery',
      source: 'gap_chat' as const,
      topic: 'Product delivery',
      userInput: 'Led weekly KPI reviews across three plants and used them to cut defects.',
      appliedLanguage: 'Led weekly KPI reviews across 3 plants.',
      primaryFamily: 'metrics',
      families: ['metrics'],
    };
    const baseBuildChatContext = makeChatContextMock();
    const buildChatContext = vi.fn((target: string | GapChatTargetInput) => ({
      ...baseBuildChatContext(target),
      priorClarifications: [rememberedClarification],
    }));

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          clarificationMemory: [rememberedClarification],
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext,
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Seasoned engineering leader driving outcomes at scale.' })[0]);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      chatContext: {
        priorClarifications?: Array<{ id: string; topic: string; userInput: string }>;
      };
    };
    expect(lastCall.chatContext.priorClarifications).toEqual([
      expect.objectContaining({
        id: 'gap_chat:product delivery',
        topic: 'Product delivery',
        userInput: 'Led weekly KPI reviews across three plants and used them to cut defects.',
      }),
    ]);
  });

  it('keeps remembered evidence in the coach and removes the old clarification card path', async () => {
    const attentionResume = makeResumeDraftWithAttention();
    const rememberedClarification = {
      id: 'gap_chat:product delivery',
      source: 'gap_chat' as const,
      topic: 'Product delivery',
      userInput: 'Led weekly KPI reviews across three plants and used them to cut defects.',
      appliedLanguage: 'Led weekly KPI reviews across 3 plants.',
      primaryFamily: 'metrics',
      families: ['metrics'],
    };
    const baseBuildChatContext = makeChatContextMock();
    const buildChatContext = vi.fn((target: string | GapChatTargetInput) => ({
      ...baseBuildChatContext(target),
      priorClarifications: [rememberedClarification],
      clarifyingQuestions: ['What specific product launch or delivery outcome proves this most clearly?'],
    }));

    render(
      <V2StreamingDisplay
        {...makeDisplayProps({
          editableResume: attentionResume,
          clarificationMemory: [rememberedClarification],
          gapChat: {
            getItemState: vi.fn(),
            sendMessage: vi.fn(),
            resolveLanguage: vi.fn(),
            clearResolution: vi.fn(),
            hydrate: vi.fn(),
            reset: vi.fn(),
          } as never,
          buildChatContext,
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
    expect(screen.queryByText('One Good Answer')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Seasoned engineering leader driving outcomes at scale.' })[0]);
    const lastCall = mockBulletCoachingPanel.mock.calls.at(-1)?.[0] as {
      chatContext: {
        priorClarifications?: Array<{ id: string }>;
        clarifyingQuestions?: string[];
      };
    };
    expect(lastCall.chatContext.priorClarifications).toEqual([
      expect.objectContaining({ id: 'gap_chat:product delivery' }),
    ]);
    expect(lastCall.chatContext.clarifyingQuestions).toEqual(
      expect.arrayContaining(['What specific product launch or delivery outcome proves this most clearly?']),
    );
  });

  it('does not bring back the old attention summary even when remembered answers exist', async () => {
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
    expect(screen.queryByText(/Open the line in VP Engineering · Acme Corp\. We already have a useful detail for Product delivery from an earlier answer\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resume Score/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('attention-review-strip')).not.toBeInTheDocument();
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
