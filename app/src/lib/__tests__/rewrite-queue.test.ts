import { describe, expect, it } from 'vitest';
import { buildRewriteQueue } from '../rewrite-queue';
import type { CoachingThreadSnapshot, FinalReviewResult, GapAnalysis, JobIntelligence, ResumeDraft } from '@/types/resume-v2';

function makeJobIntelligence(): JobIntelligence {
  return {
    company_name: 'TargetCo',
    role_title: 'VP Operations',
    seniority_level: 'vp',
    core_competencies: [
      {
        competency: 'Operational excellence',
        importance: 'must_have',
        evidence_from_jd: 'Drive measurable operational improvements across the network.',
      },
      {
        competency: 'Executive stakeholder communication',
        importance: 'important',
        evidence_from_jd: 'Communicate strategy and progress to senior leadership.',
      },
    ],
    strategic_responsibilities: ['Lead a multi-site network'],
    business_problems: [],
    cultural_signals: [],
    hidden_hiring_signals: [],
    language_keywords: [],
    industry: 'Manufacturing',
  };
}

function makeResume(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Operations',
    },
    executive_summary: {
      content: 'Operator with a strong transformation track record.',
      is_new: false,
      addresses_requirements: ['Executive stakeholder communication'],
    },
    core_competencies: ['Transformation', 'P&L'],
    selected_accomplishments: [],
    professional_experience: [
      {
        company: 'Acme',
        title: 'VP Operations',
        start_date: '2020',
        end_date: 'Present',
        scope_statement: 'Led a multi-site operation.',
        bullets: [
          {
            text: 'Improved fill rate by 14%.',
            is_new: false,
            addresses_requirements: ['Operational excellence'],
            confidence: 'strong' as const,
            evidence_found: '',
            requirement_source: 'job_description' as const,
          },
        ],
      },
    ],
    education: [],
    certifications: [],
  };
}

function makeFinalReviewResult(): FinalReviewResult {
  return {
    six_second_scan: {
      decision: 'continue_reading',
      reason: 'Strong operational wins are visible early.',
      top_signals_seen: [],
      important_signals_missing: [],
    },
    hiring_manager_verdict: {
      rating: 'possible_interview',
      summary: 'Credible operator, but the executive-facing story needs stronger proof.',
    },
    fit_assessment: {
      job_description_fit: 'moderate',
      benchmark_alignment: 'moderate',
      business_impact: 'strong',
      clarity_and_credibility: 'moderate',
    },
    top_wins: [],
    concerns: [
      {
        id: 'concern_1',
        severity: 'critical',
        type: 'missing_evidence',
        observation: 'Executive communication is not obvious enough.',
        why_it_hurts: 'The hiring manager may not trust the candidate in board-level settings.',
        fix_strategy: 'Add one bullet showing executive-facing communication and stakeholder alignment.',
        related_requirement: 'Executive stakeholder communication',
        requires_candidate_input: true,
        clarifying_question: 'What was the highest-level audience you presented to?',
      },
    ],
    structure_recommendations: [],
    benchmark_comparison: {
      advantages_vs_benchmark: [],
      gaps_vs_benchmark: [],
      reframing_opportunities: [],
    },
    improvement_summary: [],
  };
}

describe('rewrite-queue', () => {
  it('keeps the active queue focused on rewrite work instead of mixing in final review concerns', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Operational excellence',
          source: 'job_description',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Improved fill rate by 14%.'],
        },
        {
          requirement: 'Executive stakeholder communication',
          source: 'job_description',
          importance: 'important',
          classification: 'missing',
          evidence: [],
        },
      ],
      coverage_score: 50,
      strength_summary: 'Strong operator, but executive communication needs clearer proof.',
      critical_gaps: ['Executive stakeholder communication'],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      finalReviewResult: makeFinalReviewResult(),
    });

    expect(queue.items.every((item) => item.kind === 'requirement')).toBe(true);
    expect(queue.nextItem?.requirement).toBe('Executive stakeholder communication');
    expect(queue.nextItem?.category).toBe('quick_win');
    expect(queue.nextItem?.recommendedNextStep.action).toBe('answer_question');
    expect(queue.summary).toEqual({
      total: 2,
      needsAttention: 1,
      partiallyAddressed: 0,
      resolved: 1,
      hardGapCount: 0,
    });
  });

  it('marks likely credential requirements as hard gaps and ranks quick wins ahead of them', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Executive stakeholder communication',
          source: 'job_description',
          importance: 'important',
          classification: 'partial',
          evidence: ['Presented operating updates to senior leaders.'],
        },
        {
          requirement: 'Bachelor’s degree in engineering or related field',
          source: 'job_description',
          importance: 'must_have',
          classification: 'missing',
          evidence: [],
          source_evidence: 'Bachelor’s degree in engineering or related field required.',
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      gapCoachingCards: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          importance: 'must_have',
          classification: 'partial',
          ai_reasoning: 'The nearby proof is strong but still needs direct leadership-pipeline framing.',
          proposed_strategy: 'Built an operations leadership bench by developing plant managers and promoting two site leaders into regional roles.',
          evidence_found: ['Developed plant managers and promoted two site leaders into regional roles.'],
          coaching_policy: {
            primaryFamily: 'talent',
            families: ['talent'],
            clarifyingQuestion: 'Who did you hire, coach, develop, or promote, and what changed because of that leadership?',
            proofActionRequiresInput: 'If you have this experience, add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            proofActionDirect: 'Add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            rationale: 'Leadership pipeline claims become credible when the team scope and people outcomes are explicit.',
            lookingFor: 'Team size, hiring or development scope, and the leadership or business result that followed.',
          },
        },
      ],
    });

    const hardGap = queue.items.find((item) => item.requirement?.includes('Bachelor'))!;

    expect(queue.nextItem?.requirement).toBe('Executive stakeholder communication');
    expect(hardGap.category).toBe('hard_gap');
    expect(hardGap.recommendedNextStep.action).toBe('check_hard_requirement');
    expect(hardGap.riskNote).toMatch(/real risk/i);
    expect(queue.summary.hardGapCount).toBe(1);
  });

  it('marks inferred resume lines as nearby proof instead of current mapped proof', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Executive stakeholder communication',
          source: 'job_description',
          importance: 'important',
          classification: 'missing',
          evidence: ['Presented weekly updates to senior leaders during plant turnaround meetings.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const resume = makeResume();
    resume.executive_summary.addresses_requirements = [];

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: resume,
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.currentEvidence[0]?.basis).toBe('nearby');
    expect(queue.items[0]?.currentEvidence[0]?.section).toBeUndefined();
    expect(queue.items[0]?.userInstruction).toContain('related proof into direct evidence');
  });

  it('uses generic compatibility guidance when no shared coaching policy is available for financial scope requirements', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Experience with P&L responsibility for $100M+ operations',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['$175M combined output across multiple plants.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      gapCoachingCards: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          importance: 'must_have',
          classification: 'partial',
          ai_reasoning: 'The nearby proof is strong but still needs direct leadership-pipeline framing.',
          proposed_strategy: 'Built an operations leadership bench by developing plant managers and promoting two site leaders into regional roles.',
          evidence_found: ['Developed plant managers and promoted two site leaders into regional roles.'],
          coaching_policy: {
            primaryFamily: 'talent',
            families: ['talent'],
            clarifyingQuestion: 'Who did you hire, coach, develop, or promote, and what changed because of that leadership?',
            proofActionRequiresInput: 'If you have this experience, add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            proofActionDirect: 'Add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            rationale: 'Leadership pipeline claims become credible when the team scope and people outcomes are explicit.',
            lookingFor: 'Team size, hiring or development scope, and the leadership or business result that followed.',
          },
        },
      ],
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('related proof into direct evidence');
  });

  it('uses generic compatibility guidance when no shared coaching policy is available for scale requirements', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Proven track record of building and scaling marketing organizations (25+ people)',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Led a 28-person marketing organization.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      gapCoachingCards: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          importance: 'must_have',
          classification: 'partial',
          ai_reasoning: 'The nearby proof is strong but still needs direct leadership-pipeline framing.',
          proposed_strategy: 'Built an operations leadership bench by developing plant managers and promoting two site leaders into regional roles.',
          evidence_found: ['Developed plant managers and promoted two site leaders into regional roles.'],
          coaching_policy: {
            primaryFamily: 'talent',
            families: ['talent'],
            clarifyingQuestion: 'Who did you hire, coach, develop, or promote, and what changed because of that leadership?',
            proofActionRequiresInput: 'If you have this experience, add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            proofActionDirect: 'Add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            rationale: 'Leadership pipeline claims become credible when the team scope and people outcomes are explicit.',
            lookingFor: 'Team size, hiring or development scope, and the leadership or business result that followed.',
          },
        },
      ],
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('related proof into direct evidence');
  });

  it('filters placeholder source evidence and weak rewrite labels while falling back to generic legacy prompts', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Develop and track performance metrics',
          source: 'job_description',
          importance: 'important',
          classification: 'partial',
          evidence: ['Operational efficiency metrics experience'],
          source_evidence: 'Canonical Requirement Catalog',
          strategy: {
            real_experience: 'Operational efficiency metrics experience',
            positioning: 'Related performance metrics expertise',
            ai_reasoning: 'Metrics experience is adjacent but not direct enough yet.',
          },
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      gapCoachingCards: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          importance: 'must_have',
          classification: 'partial',
          ai_reasoning: 'The nearby proof is strong but still needs direct leadership-pipeline framing.',
          proposed_strategy: 'Built an operations leadership bench by developing plant managers and promoting two site leaders into regional roles.',
          evidence_found: ['Developed plant managers and promoted two site leaders into regional roles.'],
          coaching_policy: {
            primaryFamily: 'talent',
            families: ['talent'],
            clarifyingQuestion: 'Who did you hire, coach, develop, or promote, and what changed because of that leadership?',
            proofActionRequiresInput: 'If you have this experience, add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            proofActionDirect: 'Add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            rationale: 'Leadership pipeline claims become credible when the team scope and people outcomes are explicit.',
            lookingFor: 'Team size, hiring or development scope, and the leadership or business result that followed.',
          },
        },
      ],
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.sourceEvidence[0]?.text).toBe('Develop and track performance metrics');
    expect(queue.items[0]?.currentEvidence).toEqual([]);
    expect(queue.items[0]?.suggestedDraft).toBeUndefined();
    expect(queue.items[0]?.starterQuestion).toBe('What is the clearest concrete example that proves "Develop and track performance metrics" for this role?');
    expect(queue.items[0]?.userInstruction).toContain('find truthful proof');
  });

  it('replaces generic helper questions with a generic compatibility fallback when shared coaching metadata is absent', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Develop and track performance metrics',
          source: 'job_description',
          importance: 'important',
          classification: 'partial',
          evidence: ['Tracked weekly throughput metrics and improved fill rate by 14% across the network.'],
          source_evidence: 'Develop and track performance metrics',
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const gapChatSnapshot: CoachingThreadSnapshot = {
      items: {
        'develop and track performance metrics': {
          messages: [
            {
              role: 'assistant',
              content: 'Let me help you tighten this up.',
              currentQuestion: 'Tell me about any experience you have related to developing and tracking performance metrics.',
              recommendedNextAction: 'answer_question',
              candidateInputUsed: false,
            },
          ],
          resolvedLanguage: null,
          error: null,
        },
      },
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      gapChatSnapshot,
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.starterQuestion).toBe(
      'Your resume already shows "Tracked weekly throughput metrics and improved fill rate by 14% across the network.". What is the clearest concrete example that proves "Develop and track performance metrics" for this role?',
    );
  });

  it('uses generic compatibility fallback guidance for legacy cloud requirements without shared coaching metadata', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Experience with Azure or GCP',
          source: 'job_description',
          importance: 'must_have',
          classification: 'missing',
          evidence: [],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items[0]?.starterQuestion).toBe(
      'What is the clearest concrete example that proves "Experience with Azure or GCP" for this role?',
    );
    expect(queue.items[0]?.userInstruction).toContain('find truthful proof');
  });

  it('uses generic compatibility fallback guidance for legacy ERP requirements without shared coaching metadata', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Experience with ERP systems (SAP, Oracle, or similar)',
          source: 'job_description',
          importance: 'important',
          classification: 'missing',
          evidence: [],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items[0]?.starterQuestion).toBe(
      'What is the clearest concrete example that proves "Experience with ERP systems (SAP, Oracle, or similar)" for this role?',
    );
    expect(queue.items[0]?.userInstruction).toContain('find truthful proof');
  });

  it('prefers shared coaching policy metadata over local fallback prompts', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Developed plant managers and promoted two site leaders into regional roles.'],
          strategy: {
            real_experience: 'Developed plant managers and promoted two site leaders into regional roles.',
            positioning: 'Built an operations leadership bench by developing plant managers and promoting two site leaders into regional roles.',
            ai_reasoning: 'The nearby proof is strong but still needs direct leadership-pipeline framing.',
            coaching_policy: {
              primaryFamily: 'talent',
              families: ['talent'],
              clarifyingQuestion: 'Who did you hire, coach, develop, or promote, and what changed because of that leadership?',
              proofActionRequiresInput: 'If you have this experience, add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
              proofActionDirect: 'Add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
              rationale: 'Leadership pipeline claims become credible when the team scope and people outcomes are explicit.',
              lookingFor: 'Team size, hiring or development scope, and the leadership or business result that followed.',
            },
          },
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      gapCoachingCards: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          importance: 'must_have',
          classification: 'partial',
          ai_reasoning: 'The nearby proof is strong but still needs direct leadership-pipeline framing.',
          proposed_strategy: 'Built an operations leadership bench by developing plant managers and promoting two site leaders into regional roles.',
          evidence_found: ['Developed plant managers and promoted two site leaders into regional roles.'],
          coaching_policy: {
            primaryFamily: 'talent',
            families: ['talent'],
            clarifyingQuestion: 'Who did you hire, coach, develop, or promote, and what changed because of that leadership?',
            proofActionRequiresInput: 'If you have this experience, add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            proofActionDirect: 'Add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
            rationale: 'Leadership pipeline claims become credible when the team scope and people outcomes are explicit.',
            lookingFor: 'Team size, hiring or development scope, and the leadership or business result that followed.',
          },
        },
      ],
    });

    expect(queue.items[0]?.starterQuestion).toBe('Who did you hire, coach, develop, or promote, and what changed because of that leadership?');
    expect(queue.items[0]?.userInstruction).toContain('who you hired, developed, coached, or promoted');
  });

  it('uses strategy-level shared coaching policy even when no coaching card is present', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Develop and track performance metrics',
          source: 'job_description',
          importance: 'important',
          classification: 'partial',
          evidence: ['Tracked weekly throughput metrics and improved fill rate by 14% across the network.'],
          strategy: {
            real_experience: 'Tracked weekly throughput metrics and improved fill rate by 14% across the network.',
            positioning: 'Built and tracked weekly throughput scorecards that improved fill rate by 14% across the network.',
            ai_reasoning: 'The proof is close, but the resume still needs the metrics and cadence to be explicit.',
            interview_questions: [
              {
                question: 'Tell me about your experience with performance metrics.',
                rationale: 'Generic placeholder',
                looking_for: 'Something about metrics',
              },
            ],
            coaching_policy: {
              primaryFamily: 'metrics',
              families: ['metrics'],
              clarifyingQuestion: 'Which metrics or scorecards did you personally track, how often did you review them, and what decision or improvement did they drive?',
              proofActionRequiresInput: 'If you have this experience, add one concrete example showing which metrics or scorecards you tracked, how often you reviewed them, and what decision or improvement they drove.',
              proofActionDirect: 'Add one concrete example showing which metrics or scorecards you tracked, how often you reviewed them, and what decision or improvement they drove.',
              rationale: 'Specific metrics, review cadence, and decisions make performance-management claims believable on a resume.',
              lookingFor: 'Named metrics, reporting cadence, and the decision or improvement they drove.',
            },
          },
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items[0]?.starterQuestion).toBe('Which metrics or scorecards did you personally track, how often did you review them, and what decision or improvement did they drive?');
    expect(queue.items[0]?.userInstruction).toContain('metrics or scorecards you tracked');
  });

  it('does not let legacy generic interview questions override the contract-safe fallback when no coaching policy exists', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Develop and track performance metrics',
          source: 'job_description',
          importance: 'important',
          classification: 'partial',
          evidence: ['Tracked weekly throughput metrics and improved fill rate by 14% across the network.'],
          strategy: {
            real_experience: 'Tracked weekly throughput metrics and improved fill rate by 14% across the network.',
            positioning: 'Built and tracked weekly throughput scorecards that improved fill rate by 14% across the network.',
            ai_reasoning: 'The proof is close, but the resume still needs the metrics and cadence to be explicit.',
            interview_questions: [
              {
                question: 'Tell me about any experience you have related to performance metrics.',
                rationale: 'Legacy generic placeholder',
                looking_for: 'Anything about metrics',
              },
            ],
          },
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items[0]?.starterQuestion).toBe(
      'Your resume already shows "Tracked weekly throughput metrics and improved fill rate by 14% across the network.". What is the clearest concrete example that proves "Develop and track performance metrics" for this role?',
    );
  });

  it('keeps review guidance when a suggested rewrite already exists even if coaching policy is present', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Developed plant managers and promoted two site leaders into regional roles.'],
          strategy: {
            real_experience: 'Developed plant managers and promoted two site leaders into regional roles.',
            positioning: 'Built an operations leadership bench by developing plant managers and promoting two site leaders into regional roles.',
            ai_reasoning: 'The nearby proof is strong but still needs direct leadership-pipeline framing.',
            coaching_policy: {
              primaryFamily: 'talent',
              families: ['talent'],
              clarifyingQuestion: 'Who did you hire, coach, develop, or promote, and what changed because of that leadership?',
              proofActionRequiresInput: 'If you have this experience, add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
              proofActionDirect: 'Add one concrete example showing who you hired, developed, coached, or promoted and what changed because of that leadership.',
              rationale: 'Leadership pipeline claims become credible when the team scope and people outcomes are explicit.',
              lookingFor: 'Team size, hiring or development scope, and the leadership or business result that followed.',
            },
          },
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const gapChatSnapshot: CoachingThreadSnapshot = {
      items: {
        'build and develop operations leadership pipeline': {
          messages: [
            {
              role: 'assistant',
              content: 'Here is a stronger draft.',
              suggestedLanguage: 'Built an operations leadership bench by developing plant managers and promoting two site leaders into regional roles.',
              candidateInputUsed: false,
            },
          ],
          resolvedLanguage: null,
          error: null,
        },
      },
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
      gapChatSnapshot,
    });

    expect(queue.items[0]?.suggestedDraft).toContain('Built an operations leadership bench');
    expect(queue.items[0]?.userInstruction).toContain('Review the suggested language');
  });

  it('drops instructional coaching text that is not a real resume rewrite', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Cloud Architecture',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Built cloud platform on AWS.'],
          strategy: {
            real_experience: 'Built cloud platform on AWS.',
            positioning: 'Use Built cloud platform on AWS to strengthen how the resume proves Cloud Architecture.',
            ai_reasoning: 'Nearby proof exists.',
          },
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items[0]?.suggestedDraft).toBeUndefined();
  });

  it('uses generic compatibility guidance for talent-development requirements without shared coaching metadata', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Build and develop operations leadership pipeline',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Developed plant managers and promoted two site leaders into regional roles.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('related proof into direct evidence');
  });

  it('uses generic compatibility guidance for portfolio requirements without shared coaching metadata', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Background in multi-brand portfolio management',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Led marketing organization across 3 product lines at Lakefront Consumer Products.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('related proof into direct evidence');
  });

  it('uses generic compatibility guidance for platform-scale requirements without shared coaching metadata', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Architect data platform components handling 2B+ daily transactions',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Implemented Kubernetes-based container orchestration platform serving 50M+ API requests daily.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('related proof into direct evidence');
  });

  it('uses generic compatibility guidance for architecture-decision requirements without shared coaching metadata', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Proven ability to lead cross-functional architecture decisions',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Led a team of 14 infrastructure and DevOps engineers.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.userInstruction).toContain('related proof into direct evidence');
  });

  it('does not crash when a live gap-analysis requirement omits the evidence array', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Executive stakeholder communication',
          source: 'job_description',
          importance: 'important',
          classification: 'missing',
          evidence: undefined as unknown as string[],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(Array.isArray(queue.items[0]?.currentEvidence)).toBe(true);
    expect(queue.items[0]?.requirement).toBe('Executive stakeholder communication');
    expect(queue.summary.total).toBe(1);
  });

  it('does not treat unrelated operational bullets as current proof for on-call and travel requirements', () => {
    const resume = makeResume();
    resume.professional_experience[0].bullets[0] = {
      text: 'Reduced operational times by 12 hours using improved equipment selection and operations techniques.',
      is_new: false,
      addresses_requirements: ['Ability to work on-call outside standard working hours and travel up to 20% of the time'],
      confidence: 'strong' as const,
      evidence_found: '',
      requirement_source: 'job_description' as const,
    };

    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'Ability to work on-call outside standard working hours and travel up to 20% of the time',
          source: 'job_description',
          importance: 'must_have',
          classification: 'partial',
          evidence: ['Reduced operational times by 12 hours using improved equipment selection and operations techniques.'],
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: resume,
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.currentEvidence).toEqual([]);
    expect(queue.items[0]?.status).toBe('needs_more_evidence');
  });

  it('dedupes repeated benchmark requirements with the same normalized text', () => {
    const gapAnalysis: GapAnalysis = {
      requirements: [
        {
          requirement: 'ERP systems',
          source: 'benchmark',
          importance: 'important',
          classification: 'partial',
          evidence: ['Led ERP rollout across 3 plants.'],
        },
        {
          requirement: 'ERP systems.',
          source: 'benchmark',
          importance: 'must_have',
          classification: 'missing',
          evidence: ['Implemented SAP during operations transformation.'],
          source_evidence: 'Benchmark candidates usually show ERP leadership.',
        },
      ],
      coverage_score: 0,
      strength_summary: '',
      critical_gaps: [],
      pending_strategies: [],
    };

    const queue = buildRewriteQueue({
      jobIntelligence: makeJobIntelligence(),
      gapAnalysis,
      currentResume: makeResume(),
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.id).toBe('requirement:benchmark:erp systems');
    expect(queue.items[0]?.classification).toBe('missing');
    expect(queue.items[0]?.importance).toBe('must_have');
    expect(queue.items[0]?.sourceEvidence[0]?.text).toBe('Benchmark candidates usually show ERP leadership.');
    expect(queue.items[0]?.currentEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Led ERP rollout across 3 plants.' }),
        expect.objectContaining({ text: 'Implemented SAP during operations transformation.' }),
      ]),
    );
  });
});
