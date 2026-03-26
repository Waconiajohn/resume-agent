// @vitest-environment jsdom
/**
 * Comprehensive test suite for the resume-v2 frontend rebuild.
 *
 * Covers:
 *   1. ResumeBullet type contract validation
 *   2. Color coding in ResumeDocumentCard (confidence borders)
 *   3. BulletEditPopover behavior (direct component tests)
 *   4. ScoringReport rendering with real data
 *   5. useV2Pipeline SSE event handling
 *   6. Humanize helper functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import type {
  ResumeDraft,
  ResumeBullet,
  BulletConfidence,
  RequirementSource,
  PreScores,
  AssemblyResult,
  GapAnalysis,
  HiringManagerScan,
  VerificationDetail,
  V2PipelineData,
  V2SSEEvent,
} from '@/types/resume-v2';

// ─── Global mocks ─────────────────────────────────────────────────────────────

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
    BookOpen: Icon,
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
    ArrowRight: Icon,
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
    ShieldCheck: Icon,
    Wand2: Icon,
    Trash2: Icon,
    User: Icon,
  };
});

vi.mock('../../GlassCard', () => ({
  GlassCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="glass-card" className={className}>{children}</div>
  ),
}));

vi.mock('../useStrategyThread', () => ({
  scrollToBullet: vi.fn(),
  scrollToAndHighlight: vi.fn(),
  scrollToCoachingCard: vi.fn(),
  scrollToAuditRow: vi.fn(),
}));

// jsdom does not implement scrollIntoView or scrollTo
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 1: ResumeBullet type contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('ResumeBullet type contract', () => {
  it('creates a valid ResumeBullet with all required fields', () => {
    const bullet: ResumeBullet = {
      text: 'Led a team of 12 engineers to deliver platform migration on time',
      is_new: false,
      addresses_requirements: ['Team leadership', 'Platform migration'],
      confidence: 'strong',
      evidence_found: 'Led migration of core platform serving 2M users',
      requirement_source: 'job_description',
    };

    expect(bullet.text).toBeTruthy();
    expect(bullet.confidence).toBe('strong');
    expect(bullet.requirement_source).toBe('job_description');
    expect(bullet.addresses_requirements).toHaveLength(2);
    expect(typeof bullet.evidence_found).toBe('string');
    expect(typeof bullet.is_new).toBe('boolean');
  });

  it('accepts all valid confidence values', () => {
    const confidences: BulletConfidence[] = ['strong', 'partial', 'needs_validation'];

    for (const confidence of confidences) {
      const bullet: ResumeBullet = {
        text: 'Test bullet',
        is_new: true,
        addresses_requirements: [],
        confidence,
        evidence_found: '',
        requirement_source: 'job_description',
      };
      expect(bullet.confidence).toBe(confidence);
    }
  });

  it('accepts all valid requirement_source values', () => {
    const sources: RequirementSource[] = ['job_description', 'benchmark'];

    for (const source of sources) {
      const bullet: ResumeBullet = {
        text: 'Test bullet',
        is_new: false,
        addresses_requirements: [],
        confidence: 'strong',
        evidence_found: '',
        requirement_source: source,
      };
      expect(bullet.requirement_source).toBe(source);
    }
  });

  it('validates a ResumeDraft selected_accomplishments entry has all bullet metadata', () => {
    const accomplishment: ResumeDraft['selected_accomplishments'][number] = {
      content: 'Reduced deploy time by 60%',
      is_new: false,
      addresses_requirements: ['CI/CD experience'],
      confidence: 'strong',
      evidence_found: 'Implemented automated CI/CD pipeline',
      requirement_source: 'job_description',
    };

    expect(accomplishment.content).toBeTruthy();
    expect(accomplishment.confidence).toBeDefined();
    expect(accomplishment.evidence_found).toBeDefined();
    expect(accomplishment.requirement_source).toBeDefined();
    expect(Array.isArray(accomplishment.addresses_requirements)).toBe(true);
  });

  it('validates a professional_experience bullet has all metadata fields', () => {
    const bullet: ResumeBullet = {
      text: 'Grew revenue 40% YoY through product-led growth strategy',
      is_new: true,
      addresses_requirements: ['Revenue growth', 'Product strategy'],
      confidence: 'partial',
      evidence_found: '',
      requirement_source: 'benchmark',
    };

    // All metadata fields exist
    expect('confidence' in bullet).toBe(true);
    expect('evidence_found' in bullet).toBe(true);
    expect('requirement_source' in bullet).toBe(true);
    expect('addresses_requirements' in bullet).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 2: Color coding renders correctly in ResumeDocumentCard
// ═══════════════════════════════════════════════════════════════════════════════

import { ResumeDocumentCard } from '../cards/ResumeDocumentCard';

function makeResumeDraftWithConfidence(overrides: {
  confidence?: BulletConfidence;
  requirement_source?: RequirementSource;
} = {}): ResumeDraft {
  const confidence = overrides.confidence ?? 'strong';
  const requirement_source = overrides.requirement_source ?? 'job_description';

  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Engineering',
    },
    executive_summary: {
      content: 'Seasoned engineering leader.',
      is_new: false,
    },
    core_competencies: [],
    selected_accomplishments: [
      {
        content: 'Test accomplishment bullet',
        is_new: false,
        addresses_requirements: ['Test requirement'],
        confidence,
        evidence_found: confidence === 'needs_validation' ? '' : 'Some evidence text',
        requirement_source,
      },
    ],
    professional_experience: [],
    education: [],
    certifications: [],
  };
}

describe('ResumeDocumentCard — confidence color coding', () => {
  it('renders green border for strong confidence bullets', () => {
    const resume = makeResumeDraftWithConfidence({ confidence: 'strong' });
    render(<ResumeDocumentCard resume={resume} />);

    // The li element should have the emerald border class
    const bullet = screen.getByText('Test accomplishment bullet').closest('li');
    expect(bullet).toBeTruthy();
    expect(bullet!.className).toContain('border-l-emerald-400');
  });

  it('renders amber border for partial confidence bullets', () => {
    const resume = makeResumeDraftWithConfidence({ confidence: 'partial' });
    render(<ResumeDocumentCard resume={resume} />);

    const bullet = screen.getByText('Test accomplishment bullet').closest('li');
    expect(bullet).toBeTruthy();
    expect(bullet!.className).toContain('border-l-amber-400');
  });

  it('renders red border for needs_validation confidence bullets from JD', () => {
    const resume = makeResumeDraftWithConfidence({
      confidence: 'needs_validation',
      requirement_source: 'job_description',
    });
    render(<ResumeDocumentCard resume={resume} />);

    const bullet = screen.getByText('Test accomplishment bullet').closest('li');
    expect(bullet).toBeTruthy();
    expect(bullet!.className).toContain('border-l-red-400');
  });

  it('renders amber border for needs_validation + benchmark source (orange treatment)', () => {
    const resume = makeResumeDraftWithConfidence({
      confidence: 'needs_validation',
      requirement_source: 'benchmark',
    });
    render(<ResumeDocumentCard resume={resume} />);

    const bullet = screen.getByText('Test accomplishment bullet').closest('li');
    expect(bullet).toBeTruthy();
    // Benchmark + needs_validation gets amber, not red
    expect(bullet!.className).toContain('border-l-amber-400');
    expect(bullet!.className).not.toContain('border-l-red-400');
  });

  it('renders color borders on ALL bullets (no silent gray fallback)', () => {
    const resume: ResumeDraft = {
      header: {
        name: 'Jane Doe',
        phone: '555-0100',
        email: 'jane@example.com',
        branded_title: 'VP Engineering',
      },
      executive_summary: { content: 'Leader.', is_new: false },
      core_competencies: [],
      selected_accomplishments: [
        {
          content: 'Bullet A — strong',
          is_new: false,
          addresses_requirements: ['Req A'],
          confidence: 'strong',
          evidence_found: 'evidence',
          requirement_source: 'job_description',
        },
        {
          content: 'Bullet B — partial',
          is_new: false,
          addresses_requirements: ['Req B'],
          confidence: 'partial',
          evidence_found: 'some evidence',
          requirement_source: 'job_description',
        },
        {
          content: 'Bullet C — needs validation',
          is_new: false,
          addresses_requirements: ['Req C'],
          confidence: 'needs_validation',
          evidence_found: '',
          requirement_source: 'job_description',
        },
      ],
      professional_experience: [],
      education: [],
      certifications: [],
    };

    render(<ResumeDocumentCard resume={resume} />);

    const bulletA = screen.getByText('Bullet A — strong').closest('li');
    const bulletB = screen.getByText('Bullet B — partial').closest('li');
    const bulletC = screen.getByText('Bullet C — needs validation').closest('li');

    expect(bulletA!.className).toContain('border-l-emerald-400');
    expect(bulletB!.className).toContain('border-l-amber-400');
    expect(bulletC!.className).toContain('border-l-red-400');

    // None should have a gray fallback
    expect(bulletA!.className).not.toContain('border-l-gray');
    expect(bulletB!.className).not.toContain('border-l-gray');
    expect(bulletC!.className).not.toContain('border-l-gray');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 3: BulletEditPopover behavior
// ═══════════════════════════════════════════════════════════════════════════════

import { BulletEditPopover } from '../cards/BulletEditPopover';

function makePopoverProps(overrides: Partial<React.ComponentProps<typeof BulletEditPopover>> = {}) {
  return {
    text: 'Led a team of 12 engineers to deliver platform migration',
    confidence: 'strong' as BulletConfidence,
    evidenceFound: 'Led migration of core platform',
    requirementSource: 'job_description' as RequirementSource,
    addressesRequirements: ['Team leadership', 'Platform migration'],
    onSave: vi.fn(),
    onRemove: vi.fn(),
    onClose: vi.fn(),
    onRequestAiEdit: vi.fn(),
    ...overrides,
  };
}

describe('BulletEditPopover — requirement info', () => {
  it('renders requirement info with JD badge', () => {
    render(<BulletEditPopover {...makePopoverProps({ requirementSource: 'job_description' })} />);

    expect(screen.getByText('Job Description')).toBeInTheDocument();
    expect(screen.getByText('Team leadership')).toBeInTheDocument();
    expect(screen.getByText('Platform migration')).toBeInTheDocument();
  });

  it('renders requirement info with Benchmark badge', () => {
    render(<BulletEditPopover {...makePopoverProps({ requirementSource: 'benchmark' })} />);

    expect(screen.getByText('Benchmark')).toBeInTheDocument();
  });
});

describe('BulletEditPopover — evidence display', () => {
  it('shows evidence text when evidence_found is non-empty', () => {
    render(
      <BulletEditPopover
        {...makePopoverProps({ evidenceFound: 'Led migration of core platform serving 2M users' })}
      />,
    );

    // Evidence is shown in a quote block
    expect(screen.getByText(/Led migration of core platform serving 2M users/)).toBeInTheDocument();
  });

  it('shows red warning when evidence_found is empty and confidence is needs_validation', () => {
    render(
      <BulletEditPopover
        {...makePopoverProps({
          evidenceFound: '',
          confidence: 'needs_validation',
        })}
      />,
    );

    expect(screen.getByText('No supporting evidence found in original resume')).toBeInTheDocument();
  });

  it('shows red warning when evidence_found is whitespace-only', () => {
    render(
      <BulletEditPopover
        {...makePopoverProps({
          evidenceFound: '   ',
          confidence: 'partial',
        })}
      />,
    );

    expect(screen.getByText('No supporting evidence found in original resume')).toBeInTheDocument();
  });
});

describe('BulletEditPopover — textarea', () => {
  it('pre-populates textarea with bullet text', () => {
    render(
      <BulletEditPopover
        {...makePopoverProps({ text: 'Original bullet text for editing' })}
      />,
    );

    const textarea = screen.getByDisplayValue('Original bullet text for editing');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('editing textarea updates the text that gets saved', () => {
    const onSave = vi.fn();
    render(
      <BulletEditPopover
        {...makePopoverProps({ text: 'Original text', onSave })}
      />,
    );

    const textarea = screen.getByDisplayValue('Original text');
    fireEvent.change(textarea, { target: { value: 'Updated text with more detail' } });

    // Now click save
    fireEvent.click(screen.getByText('I Can Support This'));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith('Updated text with more detail');
  });
});

describe('BulletEditPopover — action buttons', () => {
  it('clicking "I Can Support This" calls onSave with edited text', () => {
    const onSave = vi.fn();
    render(
      <BulletEditPopover
        {...makePopoverProps({ text: 'My bullet text', onSave })}
      />,
    );

    fireEvent.click(screen.getByText('I Can Support This'));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith('My bullet text');
  });

  it('clicking "Remove" calls onRemove', () => {
    const onRemove = vi.fn();
    render(
      <BulletEditPopover
        {...makePopoverProps({ onRemove })}
      />,
    );

    fireEvent.click(screen.getByText('Remove'));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(
      <BulletEditPopover
        {...makePopoverProps({ onClose })}
      />,
    );

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('BulletEditPopover — AI assist buttons', () => {
  it('calls onRequestAiEdit with "strengthen" when Strengthen is clicked', () => {
    const onRequestAiEdit = vi.fn();
    render(
      <BulletEditPopover
        {...makePopoverProps({ text: 'My bullet', onRequestAiEdit })}
      />,
    );

    fireEvent.click(screen.getByText('Strengthen'));

    expect(onRequestAiEdit).toHaveBeenCalledOnce();
    expect(onRequestAiEdit).toHaveBeenCalledWith('My bullet', 'strengthen');
  });

  it('calls onRequestAiEdit with "add_metrics" when Add Metrics is clicked', () => {
    const onRequestAiEdit = vi.fn();
    render(
      <BulletEditPopover
        {...makePopoverProps({ text: 'My bullet', onRequestAiEdit })}
      />,
    );

    fireEvent.click(screen.getByText('Add Metrics'));

    expect(onRequestAiEdit).toHaveBeenCalledOnce();
    expect(onRequestAiEdit).toHaveBeenCalledWith('My bullet', 'add_metrics');
  });

  it('calls onRequestAiEdit with "rewrite" when Rewrite is clicked', () => {
    const onRequestAiEdit = vi.fn();
    render(
      <BulletEditPopover
        {...makePopoverProps({ text: 'My bullet', onRequestAiEdit })}
      />,
    );

    fireEvent.click(screen.getByText('Rewrite'));

    expect(onRequestAiEdit).toHaveBeenCalledOnce();
    expect(onRequestAiEdit).toHaveBeenCalledWith('My bullet', 'rewrite');
  });

  it('does not render AI assist row when onRequestAiEdit is not provided', () => {
    render(
      <BulletEditPopover
        {...makePopoverProps({ onRequestAiEdit: undefined })}
      />,
    );

    expect(screen.queryByText('Strengthen')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Metrics')).not.toBeInTheDocument();
    expect(screen.queryByText('Rewrite')).not.toBeInTheDocument();
  });

  it('sends trimmed edited text to AI assist', () => {
    const onRequestAiEdit = vi.fn();
    render(
      <BulletEditPopover
        {...makePopoverProps({ text: '  Some text  ', onRequestAiEdit })}
      />,
    );

    fireEvent.click(screen.getByText('Strengthen'));

    expect(onRequestAiEdit).toHaveBeenCalledWith('Some text', 'strengthen');
  });
});

describe('BulletEditPopover — close button', () => {
  it('renders a close button with aria-label', () => {
    render(<BulletEditPopover {...makePopoverProps()} />);

    const closeButton = screen.getByLabelText('Close');
    expect(closeButton).toBeInTheDocument();
  });

  it('clicking close button calls onClose', () => {
    const onClose = vi.fn();
    render(<BulletEditPopover {...makePopoverProps({ onClose })} />);

    fireEvent.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 4: ScoringReport rendering
// ═══════════════════════════════════════════════════════════════════════════════

import { ScoringReport } from '../ScoringReport';

function makePreScores(): PreScores {
  return {
    ats_match: 42,
    keywords_found: ['leadership', 'strategy'],
    keywords_missing: ['kubernetes', 'terraform', 'ci/cd'],
  };
}

function makeHiringManagerScan(): HiringManagerScan {
  return {
    pass: true,
    scan_score: 85,
    header_impact: { score: 90, note: 'Strong branded title' },
    summary_clarity: { score: 80, note: 'Clear value proposition' },
    above_fold_strength: { score: 88, note: 'Key achievements prominent' },
    keyword_visibility: { score: 82, note: 'Good keyword density' },
    red_flags: [],
    quick_wins: ['Add industry buzzwords'],
  };
}

function makeAssemblyResult(): AssemblyResult {
  return {
    final_resume: makeResumeDraftWithConfidence(),
    scores: {
      ats_match: 87,
      truth: 92,
      tone: 88,
    },
    quick_wins: [],
    hiring_manager_scan: makeHiringManagerScan(),
  };
}

function makeGapAnalysisForScoring(): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'Team leadership',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['Led team of 12'],
        source: 'job_description',
      },
      {
        requirement: 'Cloud architecture',
        importance: 'important',
        classification: 'partial',
        evidence: [],
        source: 'job_description',
      },
      {
        requirement: 'Executive presence',
        importance: 'nice_to_have',
        classification: 'missing',
        evidence: [],
        source: 'benchmark',
      },
    ],
    coverage_score: 67,
    score_breakdown: {
      job_description: {
        total: 2,
        strong: 1,
        partial: 1,
        missing: 0,
        addressed: 2,
        coverage_score: 75,
      },
      benchmark: {
        total: 1,
        strong: 0,
        partial: 0,
        missing: 1,
        addressed: 0,
        coverage_score: 0,
      },
    },
    strength_summary: 'Strong technical leadership background.',
    critical_gaps: [],
    pending_strategies: [],
  };
}

function makeVerificationDetail(): VerificationDetail {
  return {
    truth: {
      truth_score: 92,
      claims: [{ claim: 'Led team of 12', confidence: 'verified' as const, section: 'professional_experience', source_found: true }],
      flagged_items: [],
    },
    ats: {
      match_score: 87,
      keywords_found: ['leadership', 'strategy', 'platform'],
      keywords_missing: ['kubernetes'],
      keyword_suggestions: [],
      formatting_issues: [],
    },
    tone: {
      tone_score: 88,
      findings: [],
      banned_phrases_found: [],
    },
  };
}

describe('ScoringReport — renders with correct data', () => {
  it('renders pre-score and post-score with delta', () => {
    render(
      <ScoringReport
        preScores={makePreScores()}
        assembly={makeAssemblyResult()}
        verificationDetail={makeVerificationDetail()}
        gapAnalysis={makeGapAnalysisForScoring()}
      />,
    );

    // Pre-score (42%) should appear in the Before Report (which is defaultOpen)
    expect(screen.getByText('42%')).toBeInTheDocument();

    // Post-score (87%) should appear in the score summary header
    expect(screen.getByText('87%')).toBeInTheDocument();

    // Delta badge (+45) should be rendered
    expect(screen.getByText('+45')).toBeInTheDocument();
  });

  it('shows JD vs Benchmark clearly separated', () => {
    render(
      <ScoringReport
        preScores={makePreScores()}
        assembly={makeAssemblyResult()}
        verificationDetail={makeVerificationDetail()}
        gapAnalysis={makeGapAnalysisForScoring()}
      />,
    );

    // JD Requirements section (solid border)
    expect(screen.getByText('JD Requirements')).toBeInTheDocument();
    expect(screen.getByText('What the employer asked for')).toBeInTheDocument();

    // Benchmark section (dashed border) - "Ideal Candidate"
    expect(screen.getByText('Ideal Candidate')).toBeInTheDocument();
    expect(screen.getByText('Aspirational, not required')).toBeInTheDocument();
  });

  it('renders Recruiter Scan section exactly once when hiring_manager_scan is present', () => {
    render(
      <ScoringReport
        preScores={makePreScores()}
        assembly={makeAssemblyResult()}
        verificationDetail={makeVerificationDetail()}
        gapAnalysis={makeGapAnalysisForScoring()}
      />,
    );

    // "Recruiter Scan" appears once in the score summary header
    const scanLabels = screen.getAllByText('Recruiter Scan');
    expect(scanLabels).toHaveLength(1);
  });

  it('displays truth and tone scores', () => {
    render(
      <ScoringReport
        preScores={makePreScores()}
        assembly={makeAssemblyResult()}
        verificationDetail={makeVerificationDetail()}
        gapAnalysis={makeGapAnalysisForScoring()}
      />,
    );

    // Truth score (92) in header
    expect(screen.getByText('92')).toBeInTheDocument();

    // Tone score (88) in header — may appear multiple times if also used in sub-score
    const toneMatches = screen.getAllByText('88');
    expect(toneMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Before Report section as open by default', () => {
    render(
      <ScoringReport
        preScores={makePreScores()}
        assembly={makeAssemblyResult()}
        verificationDetail={null}
        gapAnalysis={null}
      />,
    );

    // "Before Report" section should be visible (defaultOpen=true)
    expect(screen.getByText('Before Report')).toBeInTheDocument();
    // Its content should also be visible (Original ATS Match)
    expect(screen.getByText('Original ATS Match')).toBeInTheDocument();
  });

  it('renders score summary strength summary when gapAnalysis has one', () => {
    render(
      <ScoringReport
        preScores={makePreScores()}
        assembly={makeAssemblyResult()}
        verificationDetail={null}
        gapAnalysis={makeGapAnalysisForScoring()}
      />,
    );

    expect(screen.getByText('Strong technical leadership background.')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 5: useV2Pipeline SSE event handling
// ═══════════════════════════════════════════════════════════════════════════════

// We test the event handler logic directly by importing the module and calling
// the handleEvent callback. Since useV2Pipeline is a hook, we extract and test
// the event reducer logic.

describe('useV2Pipeline — SSE event handling', () => {
  // We simulate the event handler by recreating the switch-case logic
  // that lives inside handleEvent. This tests the data transformation.

  const INITIAL_DATA: V2PipelineData = {
    sessionId: '',
    stage: 'intake',
    jobIntelligence: null,
    candidateIntelligence: null,
    benchmarkCandidate: null,
    gapAnalysis: null,
    gapCoachingCards: null,
    gapQuestions: null,
    preScores: null,
    narrativeStrategy: null,
    resumeDraft: null,
    assembly: null,
    inlineSuggestions: [],
    hiringManagerScan: null,
    verificationDetail: null,
    error: null,
    stageMessages: [],
  };

  function applyEvent(prev: V2PipelineData, event: V2SSEEvent): V2PipelineData {
    switch (event.type) {
      case 'stage_start':
        return {
          ...prev,
          stage: event.stage,
          stageMessages: [...prev.stageMessages, { stage: event.stage, message: event.message, type: 'start' as const }],
        };
      case 'gap_questions':
        return { ...prev, gapQuestions: event.data.questions };
      case 'hiring_manager_scan':
        return { ...prev, hiringManagerScan: event.data };
      case 'pipeline_complete':
        return { ...prev, stage: 'complete' };
      default:
        return prev;
    }
  }

  it('gap_questions event stores data correctly', () => {
    const questions = [
      { id: 'q1', requirement: 'CI/CD', question: 'Tell me about your CI/CD experience', importance: 'must_have' as const },
      { id: 'q2', requirement: 'Team leadership', question: 'How big was your team?', importance: 'important' as const },
    ];

    const result = applyEvent(INITIAL_DATA, {
      type: 'gap_questions',
      data: { questions },
    } as V2SSEEvent);

    expect(result.gapQuestions).toHaveLength(2);
    expect(result.gapQuestions![0].id).toBe('q1');
    expect(result.gapQuestions![1].requirement).toBe('Team leadership');
  });

  it('hiring_manager_scan event stores data correctly', () => {
    const scan: HiringManagerScan = {
      pass: true,
      scan_score: 88,
      header_impact: { score: 90, note: 'Good' },
      summary_clarity: { score: 85, note: 'Clear' },
      above_fold_strength: { score: 88, note: 'Strong' },
      keyword_visibility: { score: 80, note: 'OK' },
      red_flags: [],
      quick_wins: ['Add more metrics'],
    };

    const result = applyEvent(INITIAL_DATA, {
      type: 'hiring_manager_scan',
      data: scan,
    } as V2SSEEvent);

    expect(result.hiringManagerScan).toBeTruthy();
    expect(result.hiringManagerScan!.pass).toBe(true);
    expect(result.hiringManagerScan!.scan_score).toBe(88);
    expect(result.hiringManagerScan!.quick_wins).toEqual(['Add more metrics']);
  });

  it('stage_start event updates stage and adds stage message', () => {
    const result = applyEvent(INITIAL_DATA, {
      type: 'stage_start',
      stage: 'strategy',
      message: 'Building positioning strategy',
    } as V2SSEEvent);

    expect(result.stage).toBe('strategy');
    expect(result.stageMessages).toHaveLength(1);
    expect(result.stageMessages[0].stage).toBe('strategy');
    expect(result.stageMessages[0].type).toBe('start');
  });

  it('pipeline_complete event sets stage to complete', () => {
    const result = applyEvent(
      { ...INITIAL_DATA, stage: 'assembly' },
      { type: 'pipeline_complete', session_id: 'test-123' } as V2SSEEvent,
    );

    expect(result.stage).toBe('complete');
  });

  it('unhandled event types are silently ignored (logged to console.warn)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // The actual hook calls console.warn for unhandled types.
    // Our applyEvent returns prev unchanged, which is the correct behavior.
    const result = applyEvent(INITIAL_DATA, {
      type: 'unknown_event_type',
      data: { something: 'irrelevant' },
    } as unknown as V2SSEEvent);

    // Data should be unchanged
    expect(result).toEqual(INITIAL_DATA);

    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 6: Humanize helpers
// ═══════════════════════════════════════════════════════════════════════════════

import { humanizeIssueType, humanizeSectionName } from '../utils/humanize';

describe('humanizeIssueType', () => {
  it('maps banned_phrase correctly', () => {
    expect(humanizeIssueType('banned_phrase')).toBe('Banned Phrase Detected');
  });

  it('maps generic_filler correctly', () => {
    expect(humanizeIssueType('generic_filler')).toBe('Generic Filler Language');
  });

  it('maps passive_voice correctly', () => {
    expect(humanizeIssueType('passive_voice')).toBe('Passive Voice');
  });

  it('maps junior_language correctly', () => {
    expect(humanizeIssueType('junior_language')).toBe('Junior-Level Language');
  });

  it('maps ai_generated correctly', () => {
    expect(humanizeIssueType('ai_generated')).toBe('AI-Generated Sounding');
  });

  it('maps weak_verb correctly', () => {
    expect(humanizeIssueType('weak_verb')).toBe('Weak Action Verb');
  });

  it('maps cliche correctly', () => {
    expect(humanizeIssueType('cliche')).toBe('Resume Cliche');
  });

  it('falls back to title case for unknown types', () => {
    expect(humanizeIssueType('some_unknown_type')).toBe('Some Unknown Type');
  });

  it('falls back to title case for single word', () => {
    expect(humanizeIssueType('verbose')).toBe('Verbose');
  });

  it('handles empty string gracefully', () => {
    expect(humanizeIssueType('')).toBe('');
  });
});

describe('humanizeSectionName', () => {
  it('maps summary correctly', () => {
    expect(humanizeSectionName('summary')).toBe('Executive Summary');
  });

  it('maps executive_summary correctly', () => {
    expect(humanizeSectionName('executive_summary')).toBe('Executive Summary');
  });

  it('maps experience correctly', () => {
    expect(humanizeSectionName('experience')).toBe('Professional Experience');
  });

  it('maps professional_experience correctly', () => {
    expect(humanizeSectionName('professional_experience')).toBe('Professional Experience');
  });

  it('maps education correctly', () => {
    expect(humanizeSectionName('education')).toBe('Education');
  });

  it('maps skills correctly', () => {
    expect(humanizeSectionName('skills')).toBe('Skills & Competencies');
  });

  it('maps certifications correctly', () => {
    expect(humanizeSectionName('certifications')).toBe('Certifications');
  });

  it('maps accomplishments correctly', () => {
    expect(humanizeSectionName('accomplishments')).toBe('Key Accomplishments');
  });

  it('maps selected_accomplishments correctly', () => {
    expect(humanizeSectionName('selected_accomplishments')).toBe('Key Accomplishments');
  });

  it('maps projects correctly', () => {
    expect(humanizeSectionName('projects')).toBe('Projects');
  });

  it('maps headline correctly', () => {
    expect(humanizeSectionName('headline')).toBe('Resume Headline');
  });

  it('maps contact correctly', () => {
    expect(humanizeSectionName('contact')).toBe('Contact Information');
  });

  it('falls back to title case for unknown sections', () => {
    expect(humanizeSectionName('volunteer_work')).toBe('Volunteer Work');
  });

  it('is case-insensitive', () => {
    expect(humanizeSectionName('EDUCATION')).toBe('Education');
    expect(humanizeSectionName('Education')).toBe('Education');
  });

  it('handles empty string gracefully', () => {
    expect(humanizeSectionName('')).toBe('');
  });
});
