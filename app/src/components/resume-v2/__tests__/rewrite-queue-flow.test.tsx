// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { RewriteQueuePanel } from '../panels/RewriteQueuePanel';
import { ReviewInboxCard } from '../cards/ReviewInboxCard';
import { ExportBar } from '../ExportBar';
import type {
  CoachingThreadSnapshot,
  GapAnalysis,
  GapChatContext,
  JobIntelligence,
  ResumeDraft,
} from '@/types/resume-v2';
import type { EditAction, EditContext, PendingEdit } from '@/hooks/useInlineEdit';

vi.mock('lucide-react', () => {
  const Icon = ({ className }: { className?: string }) => <svg data-testid="icon" className={className} aria-hidden="true" />;
  return {
    AlertCircle: Icon,
    Briefcase: Icon,
    CheckCircle2: Icon,
    Check: Icon,
    ChevronDown: Icon,
    ChevronRight: Icon,
    Clipboard: Icon,
    ClipboardCheck: Icon,
    Clock3: Icon,
    Compass: Icon,
    Download: Icon,
    FileType2: Icon,
    Lightbulb: Icon,
    Loader2: Icon,
    MessageCircle: Icon,
    MessagesSquare: Icon,
    RotateCcw: Icon,
    Send: Icon,
    Sparkles: Icon,
    Target: Icon,
    User: Icon,
  };
});

function makeResumeDraft(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Operations',
    },
    executive_summary: {
      content: 'Operations leader with cross-functional delivery experience.',
      is_new: false,
      addresses_requirements: ['Executive stakeholder leadership'],
    },
    core_competencies: ['Leadership', 'Operational Strategy'],
    selected_accomplishments: [],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP Operations',
        start_date: 'Jan 2021',
        end_date: 'Present',
        scope_statement: 'Led a multi-site operating team across product and customer operations.',
        scope_statement_is_new: false,
        scope_statement_addresses_requirements: [],
        bullets: [
          {
            text: 'Directed cross-functional programs spanning product, operations, and customer support.',
            is_new: false,
            addresses_requirements: [],
          },
        ],
      },
    ],
    education: [{ degree: 'BS Business', institution: 'Northwestern', year: '2010' }],
    certifications: [],
  };
}

function makeUnmappedResumeDraft(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Operations',
    },
    executive_summary: {
      content: 'Operations leader with broad delivery experience.',
      is_new: false,
      addresses_requirements: [],
    },
    core_competencies: ['Leadership', 'Operational Strategy'],
    selected_accomplishments: [],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP Operations',
        start_date: 'Jan 2021',
        end_date: 'Present',
        scope_statement: 'Led operations programs across multiple business functions.',
        scope_statement_is_new: false,
        scope_statement_addresses_requirements: [],
        bullets: [
          {
            text: 'Improved delivery coordination across teams.',
            is_new: false,
            addresses_requirements: [],
          },
        ],
      },
    ],
    education: [{ degree: 'BS Business', institution: 'Northwestern', year: '2010' }],
    certifications: [],
  };
}

function makeJobIntelligence(): JobIntelligence {
  return {
    company_name: 'TechCorp',
    role_title: 'VP Operations',
    seniority_level: 'VP',
    core_competencies: [
      {
        competency: 'Executive stakeholder leadership',
        importance: 'must_have',
        evidence_from_jd: 'Lead alignment across executive stakeholders and operating teams.',
      },
    ],
    strategic_responsibilities: ['Drive operating cadence across departments'],
    business_problems: ['Improve execution quality'],
    cultural_signals: ['Ownership'],
    hidden_hiring_signals: ['Needs an operator who can align leaders quickly'],
    language_keywords: ['cross-functional', 'stakeholder', 'operating cadence'],
    industry: 'SaaS',
  };
}

function makeGapAnalysis(): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'Executive stakeholder leadership',
        importance: 'must_have',
        classification: 'partial',
        evidence: [],
        source: 'job_description',
        source_evidence: 'Lead alignment across executive stakeholders and operating teams.',
        score_domain: 'ats',
      },
    ],
    coverage_score: 50,
    score_breakdown: {
      job_description: {
        addressed: 0,
        total: 1,
        strong: 0,
        partial: 1,
        missing: 0,
        coverage_score: 50,
      },
      benchmark: {
        addressed: 0,
        total: 0,
        strong: 0,
        partial: 0,
        missing: 0,
        coverage_score: 0,
      },
    },
    strength_summary: 'Strong operating foundation.',
    critical_gaps: [],
    pending_strategies: [],
  };
}

function makeOverflowGapAnalysis(): GapAnalysis {
  return {
    requirements: Array.from({ length: 6 }, (_, index) => ({
      requirement: `Job requirement ${index + 1}`,
      importance: 'important' as const,
      classification: 'missing' as const,
      evidence: [],
      source: 'job_description' as const,
      source_evidence: `Required qualification ${index + 1}.`,
      score_domain: 'ats' as const,
    })),
    coverage_score: 0,
    score_breakdown: {
      job_description: {
        addressed: 0,
        total: 6,
        strong: 0,
        partial: 0,
        missing: 6,
        coverage_score: 0,
      },
      benchmark: {
        addressed: 0,
        total: 0,
        strong: 0,
        partial: 0,
        missing: 0,
        coverage_score: 0,
      },
    },
    strength_summary: 'Needs stronger proof.',
    critical_gaps: [],
    pending_strategies: [],
  };
}

function makeCoveredGapAnalysis(): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'Executive stakeholder leadership',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['Directed cross-functional programs spanning product, operations, and customer support.'],
        source: 'job_description',
        source_evidence: 'Lead alignment across executive stakeholders and operating teams.',
        score_domain: 'ats',
      },
    ],
    coverage_score: 100,
    score_breakdown: {
      job_description: {
        addressed: 1,
        total: 1,
        strong: 1,
        partial: 0,
        missing: 0,
        coverage_score: 100,
      },
      benchmark: {
        addressed: 0,
        total: 0,
        strong: 0,
        partial: 0,
        missing: 0,
        coverage_score: 0,
      },
    },
    strength_summary: 'This requirement is already covered.',
    critical_gaps: [],
    pending_strategies: [],
  };
}

function makeSeededDraftGapAnalysis(): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'Executive stakeholder leadership',
        importance: 'must_have',
        classification: 'partial',
        evidence: [],
        source: 'job_description',
        source_evidence: 'Lead alignment across executive stakeholders and operating teams.',
        score_domain: 'ats',
        strategy: {
          real_experience: 'Led recurring alignment across executive stakeholders.',
          positioning: 'Aligned executive stakeholders around weekly priorities to keep cross-functional execution on track.',
        },
      },
    ],
    coverage_score: 50,
    score_breakdown: {
      job_description: {
        addressed: 0,
        total: 1,
        strong: 0,
        partial: 1,
        missing: 0,
        coverage_score: 50,
      },
      benchmark: {
        addressed: 0,
        total: 0,
        strong: 0,
        partial: 0,
        missing: 0,
        coverage_score: 0,
      },
    },
    strength_summary: 'Strong operating foundation.',
    critical_gaps: [],
    pending_strategies: [],
  };
}

function makeGapChatSnapshot(): CoachingThreadSnapshot {
  return {
    items: {
      'executive stakeholder leadership': {
        messages: [
          {
            role: 'assistant',
            content: 'You likely have this experience already. Let me help you position it more clearly.',
            suggestedLanguage: 'Aligned executive, product, and operations stakeholders around weekly priorities to improve execution quality.',
            currentQuestion: 'Which senior leaders did you work with most often?',
            recommendedNextAction: 'review_edit',
            candidateInputUsed: true,
          },
        ],
        resolvedLanguage: null,
        error: null,
      },
    },
  };
}

function makeEmptyGapChatSnapshot(): CoachingThreadSnapshot {
  return {
    items: {
      'executive stakeholder leadership': {
        messages: [],
        resolvedLanguage: null,
        error: null,
      },
    },
  };
}

function QueueHarness({
  onRequestEdit,
  onSendMessage,
  onAcknowledgeWarnings,
  gapAnalysis = makeGapAnalysis(),
  resume = makeResumeDraft(),
  gapChatSnapshot = makeGapChatSnapshot(),
}: {
  onRequestEdit: (selectedText: string, section: string, action: EditAction, customInstruction?: string, editContext?: EditContext) => void;
  onSendMessage: (...args: unknown[]) => void;
  onAcknowledgeWarnings: () => void;
  gapAnalysis?: GapAnalysis;
  resume?: ResumeDraft;
  gapChatSnapshot?: CoachingThreadSnapshot;
}) {
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);

  return (
    <div>
      <RewriteQueuePanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={gapAnalysis}
        benchmarkCandidate={null}
        currentResume={resume}
        gapCoachingCards={null}
        gapChat={{
          getItemState: () => gapChatSnapshot.items['executive stakeholder leadership'],
          sendMessage: onSendMessage,
        } as never}
        gapChatSnapshot={gapChatSnapshot}
        buildChatContext={(requirement: string): GapChatContext => ({
          evidence: [],
          currentStrategy: undefined,
          aiReasoning: 'Show stakeholder alignment more explicitly.',
          inferredMetric: undefined,
          jobDescriptionExcerpt: requirement,
          candidateExperienceSummary: 'Led cross-functional operations programs.',
        })}
        finalReviewResult={null}
        finalReviewChat={null}
        finalReviewChatSnapshot={null}
        buildFinalReviewChatContext={() => null}
        resolvedFinalReviewConcernIds={[]}
        onRequirementClick={vi.fn()}
        onRequestEdit={(selectedText, section, action, customInstruction, editContext) => {
          onRequestEdit(selectedText, section, action, customInstruction, editContext);
          setPendingEdit({
            section,
            originalText: selectedText,
            replacement: 'Pending diff review',
            action,
            editContext,
          });
        }}
        onRequestHiringManagerReview={vi.fn()}
        isEditing={false}
      />

      <div className="mt-6">
        <ReviewInboxCard pendingEdit={pendingEdit} />
      </div>

      {pendingEdit && (
        <div data-testid="diff-review" className="mt-3">
          Pending diff review for {pendingEdit.section}
        </div>
      )}

      <div className="mt-6">
        <ExportBar
          resume={resume}
          companyName="TechCorp"
          jobTitle="VP Operations"
          atsScore={88}
          hasCompletedFinalReview
          isFinalReviewStale
          unresolvedCriticalCount={1}
          queueNeedsAttentionCount={1}
          queuePartialCount={0}
          nextQueueItemLabel="Executive stakeholder leadership"
          warningsAcknowledged={false}
          onAcknowledgeWarnings={onAcknowledgeWarnings}
        />
      </div>
    </div>
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('rewrite queue browser flow', () => {
  it('connects queue coaching, rewrite variants, inbox state, and export warnings', () => {
    const onRequestEdit = vi.fn();
    const onSendMessage = vi.fn();
    const onAcknowledgeWarnings = vi.fn();

    render(
      <QueueHarness
        onRequestEdit={onRequestEdit}
        onSendMessage={onSendMessage}
        onAcknowledgeWarnings={onAcknowledgeWarnings}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Requirements to Match' })).toBeInTheDocument();
    expect(screen.getAllByText('1. From the job description').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2. From your resume').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3. What is still missing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('4. Suggested rewrite for your resume').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Why This Still Needs Work' })).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/Aligned executive, product, and operations stakeholders around weekly priorities to improve execution quality\./i).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Improve with AI' })[0]);
    expect(screen.getByTestId('gap-chat-thread')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit suggested resume language')).toBeInTheDocument();
    expect(screen.getByText('To make this strong enough')).toBeInTheDocument();
    expect(screen.getByText(/The latest AI rewrite is ready below\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Strengthen This Rewrite' }));
    expect(onSendMessage).toHaveBeenCalledWith(
      'Executive stakeholder leadership',
      expect.stringContaining('Start from this rewrite'),
      expect.any(Object),
      'partial',
    );

    fireEvent.click(screen.getByTestId('accept-language'));
    expect(onRequestEdit).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Review Inbox')).toBeInTheDocument();
    expect(screen.getByText(/Requirement: Executive stakeholder leadership/i)).toBeInTheDocument();
    expect(screen.getByText(/Uses candidate-provided detail/i)).toBeInTheDocument();
    expect(screen.getByTestId('diff-review')).toBeInTheDocument();

    expect(screen.getByText(/Final Review is out of date because the resume changed after the last review\./i)).toBeInTheDocument();
    expect(screen.getByText(/The rewrite queue still has 1 needs-attention item/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'I understand, enable export' }));
    expect(onAcknowledgeWarnings).toHaveBeenCalledTimes(1);
  });

  it('keeps fix-first visible scope limited and labels nearby evidence honestly', () => {
    render(
      <QueueHarness
        onRequestEdit={vi.fn()}
        onSendMessage={vi.fn()}
        onAcknowledgeWarnings={vi.fn()}
        gapAnalysis={makeOverflowGapAnalysis()}
      />,
    );

    expect(screen.getByText('Fix First')).toBeInTheDocument();
    expect(screen.getByText(/1 more queued after these\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all queued requirements (1)' })).toBeInTheDocument();
  });

  it('shows the placement warning inline and opens the helper when a rewrite cannot be placed automatically', () => {
    const onRequestEdit = vi.fn();

    render(
      <QueueHarness
        onRequestEdit={onRequestEdit}
        onSendMessage={vi.fn()}
        onAcknowledgeWarnings={vi.fn()}
        resume={makeUnmappedResumeDraft()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send to Review' }));

    expect(onRequestEdit).not.toHaveBeenCalled();
    expect(screen.getByText(/We could not place this automatically yet/i)).toBeInTheDocument();
    expect(screen.getByTestId('gap-chat-thread')).toBeInTheDocument();
  });

  it('uses the edited starter rewrite when asking AI for a stronger version', () => {
    const onSendMessage = vi.fn();

    render(
      <QueueHarness
        onRequestEdit={vi.fn()}
        onSendMessage={onSendMessage}
        onAcknowledgeWarnings={vi.fn()}
        gapAnalysis={makeSeededDraftGapAnalysis()}
        gapChatSnapshot={makeEmptyGapChatSnapshot()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Improve with AI' }));
    fireEvent.change(screen.getByLabelText('Edit the suggested rewrite'), {
      target: { value: 'Updated rewrite that mentions executive planning cadence and cross-functional scorecards.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Strengthen This Rewrite' }));

    expect(onSendMessage).toHaveBeenCalledWith(
      'Executive stakeholder leadership',
      expect.stringContaining('Updated rewrite that mentions executive planning cadence and cross-functional scorecards.'),
      expect.any(Object),
      'partial',
    );
  });

  it('lets the user jump straight to current proof from the queue', () => {
    const onRequirementClick = vi.fn();
    const onRequestEdit = vi.fn();
    const onSendMessage = vi.fn();

    render(
      <RewriteQueuePanel
        jobIntelligence={makeJobIntelligence()}
        positioningAssessment={null}
        gapAnalysis={makeCoveredGapAnalysis()}
        benchmarkCandidate={null}
        currentResume={makeResumeDraft()}
        gapCoachingCards={null}
        gapChat={{
          getItemState: () => makeGapChatSnapshot().items['executive stakeholder leadership'],
          sendMessage: onSendMessage,
        } as never}
        gapChatSnapshot={makeGapChatSnapshot()}
        buildChatContext={(requirement: string): GapChatContext => ({
          evidence: [],
          currentStrategy: undefined,
          aiReasoning: 'Show stakeholder alignment more explicitly.',
          inferredMetric: undefined,
          jobDescriptionExcerpt: requirement,
          candidateExperienceSummary: 'Led cross-functional operations programs.',
        })}
        finalReviewResult={null}
        finalReviewChat={null}
        finalReviewChatSnapshot={null}
        buildFinalReviewChatContext={() => null}
        resolvedFinalReviewConcernIds={[]}
        onRequirementClick={onRequirementClick}
        onRequestEdit={onRequestEdit}
        onRequestHiringManagerReview={vi.fn()}
        isEditing={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'See Current Proof on Resume' }));
    expect(onRequirementClick).toHaveBeenCalledWith('Executive stakeholder leadership');
  });
});
