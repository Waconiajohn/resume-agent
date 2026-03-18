// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumeAiWorklogCard } from '../ResumeAiWorklogCard';
import type { GapAnalysis, JobIntelligence, ResumeDraft, RewriteQueueItem } from '@/types/resume-v2';

vi.mock('lucide-react', () => {
  const Icon = ({ className }: { className?: string }) => <svg data-testid="icon" className={className} aria-hidden="true" />;
  return {
    CheckCircle2: Icon,
    Loader2: Icon,
    Sparkles: Icon,
  };
});

const resume: ResumeDraft = {
  header: {
    name: 'Jane Doe',
    phone: '555-0100',
    email: 'jane@example.com',
    branded_title: 'VP Operations',
  },
  executive_summary: {
    content: 'Operations executive with cross-functional leadership experience.',
    is_new: false,
    addresses_requirements: [],
  },
  core_competencies: [],
  selected_accomplishments: [],
  professional_experience: [],
  education: [],
  certifications: [],
};

const jobIntelligence: JobIntelligence = {
  company_name: 'TechCorp',
  role_title: 'VP Operations',
  seniority_level: 'VP',
  core_competencies: [],
  strategic_responsibilities: [],
  business_problems: [],
  cultural_signals: [],
  hidden_hiring_signals: [],
  language_keywords: [],
  industry: 'SaaS',
};

const gapAnalysis: GapAnalysis = {
  requirements: [],
  coverage_score: 0,
  strength_summary: '',
  critical_gaps: [],
  pending_strategies: [],
};

const nextQueueItem: RewriteQueueItem = {
  id: 'requirement:job_description:leadership',
  kind: 'requirement',
  source: 'job_description',
  category: 'quick_win',
  title: 'Executive stakeholder leadership',
  status: 'needs_more_evidence',
  bucket: 'needs_attention',
  isResolved: false,
  whyItMatters: 'This affects job fit.',
  aiPlan: 'We are tightening the proof.',
  userInstruction: 'Answer the next question.',
  currentEvidence: [],
  sourceEvidence: [],
  recommendedNextStep: {
    action: 'answer_question',
    label: 'Answer 1 Question',
    detail: 'Answer one targeted question.',
  },
  requirement: 'Executive stakeholder leadership',
};

describe('ResumeAiWorklogCard', () => {
  it('explains the AI worklog and highlights the current rewrite step', () => {
    render(
      <ResumeAiWorklogCard
        currentResume={resume}
        jobIntelligence={jobIntelligence}
        benchmarkCandidate={null}
        gapAnalysis={gapAnalysis}
        nextQueueItem={nextQueueItem}
        queueSummary={{ needsAttention: 1, partiallyAddressed: 0, resolved: 0, hardGapCount: 0 }}
        hasFinalReview={false}
        isFinalReviewStale={false}
        unresolvedCriticalCount={0}
        postReviewPolish={null}
      />,
    );

    expect(screen.getByText('What AI Is Doing For You')).toBeInTheDocument();
    expect(screen.getByText(/invisible work happening behind the scenes/i)).toBeInTheDocument();
    expect(screen.getByText(/Right now we are working on "Executive stakeholder leadership"/i)).toBeInTheDocument();
  });
});
