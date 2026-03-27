import type {
  FinalReviewResult,
  GapAnalysis,
  JobIntelligence,
  PreScores,
  ResumeDraft,
  V2PipelineData,
  VerificationDetail,
} from '@/types/resume-v2';

export type ResumeV2VisualScenarioId = 'attention' | 'action-state' | 'final-review' | 'ready';

export interface ResumeV2VisualScenario {
  id: ResumeV2VisualScenarioId;
  label: string;
  description: string;
  data: V2PipelineData;
  editableResume: ResumeDraft;
  hiringManagerResult?: FinalReviewResult | null;
  isFinalReviewStale?: boolean;
  initialActiveBullet?: {
    section: string;
    index: number;
    requirements: string[];
  } | null;
}

function cloneResumeDraft(resume: ResumeDraft): ResumeDraft {
  return JSON.parse(JSON.stringify(resume)) as ResumeDraft;
}

function makeJobIntelligence(): JobIntelligence {
  return {
    company_name: 'Acme Manufacturing',
    role_title: 'VP Operations',
    seniority_level: 'VP',
    core_competencies: [
      {
        competency: 'Develop and track performance metrics',
        importance: 'must_have',
        evidence_from_jd: 'Own KPI development, scorecards, and operating rhythm.',
      },
      {
        competency: 'ERP leadership',
        importance: 'important',
        evidence_from_jd: 'Experience with SAP, Oracle, or a similar ERP stack.',
      },
    ],
    strategic_responsibilities: [
      'Lead cross-functional operating cadence',
      'Improve plant and distribution performance',
    ],
    business_problems: [
      'Inconsistent KPI visibility',
      'Need stronger operating discipline across sites',
    ],
    cultural_signals: ['Hands-on leadership', 'Executive presence', 'High accountability'],
    hidden_hiring_signals: ['PE-backed operating rigor', 'Board-ready communication'],
    language_keywords: ['performance metrics', 'operating cadence', 'ERP', 'distribution'],
    industry: 'Industrial manufacturing',
  };
}

function makePreScores(): PreScores {
  return {
    ats_match: 48,
    keywords_found: ['operations', 'leadership', 'distribution'],
    keywords_missing: ['performance metrics', 'ERP', 'operating cadence'],
  };
}

function makeResumeDraft(): ResumeDraft {
  return {
    header: {
      name: 'Jordan Ellison',
      phone: '(312) 555-0147',
      email: 'jordan.ellison@example.com',
      linkedin: 'linkedin.com/in/jordanellison',
      branded_title: 'Operations Executive | Multi-Site Performance & Transformation',
    },
    executive_summary: {
      content: 'Operations executive known for steadying complex organizations, improving execution rhythm, and turning plant and distribution teams toward measurable outcomes.',
      is_new: false,
      addresses_requirements: ['Lead cross-functional operating cadence'],
    },
    core_competencies: [
      'Operations Strategy',
      'Plant Leadership',
      'Distribution',
      'Cross-Functional Execution',
      'Continuous Improvement',
      'Executive Communication',
    ],
    selected_accomplishments: [
      {
        content: 'Built and tracked plant performance metrics across safety, throughput, and labor efficiency.',
        is_new: false,
        addresses_requirements: ['Develop and track performance metrics'],
        confidence: 'partial',
        evidence_found: 'Built weekly KPI reviews and line-performance meetings across 3 sites.',
        requirement_source: 'job_description',
      },
      {
        content: 'Led ERP-enabled operating cadence across manufacturing and distribution teams.',
        is_new: true,
        addresses_requirements: ['ERP leadership'],
        confidence: 'needs_validation',
        evidence_found: '',
        requirement_source: 'job_description',
      },
      {
        content: 'Improved on-time delivery from 82% to 96% across a multi-site footprint.',
        is_new: false,
        addresses_requirements: ['Improve plant and distribution performance'],
        confidence: 'strong',
        evidence_found: 'Raised on-time delivery from 82% to 96% across 4 facilities.',
        requirement_source: 'job_description',
      },
    ],
    professional_experience: [
      {
        company: 'Acme Manufacturing',
        title: 'VP Operations',
        start_date: '2021',
        end_date: 'Present',
        scope_statement: 'Lead plant, distribution, and shared operations across four facilities.',
        scope_statement_is_new: false,
        scope_statement_addresses_requirements: ['Lead cross-functional operating cadence'],
        bullets: [
          {
            text: 'Standardized weekly operating reviews across plant, supply chain, and customer service leaders.',
            is_new: false,
            addresses_requirements: ['Lead cross-functional operating cadence'],
            confidence: 'strong',
            evidence_found: 'Ran weekly operating reviews across plant, supply chain, and service.',
            requirement_source: 'job_description',
          },
          {
            text: 'Created scorecards that tied site performance to throughput, labor, and customer delivery targets.',
            is_new: true,
            addresses_requirements: ['Develop and track performance metrics'],
            confidence: 'partial',
            evidence_found: 'Created KPI reviews for throughput and delivery.',
            requirement_source: 'job_description',
          },
          {
            text: 'Owned SAP operating reviews that turned ERP data into site-level decisions.',
            is_new: true,
            addresses_requirements: ['ERP leadership'],
            confidence: 'needs_validation',
            evidence_found: '',
            requirement_source: 'job_description',
          },
        ],
      },
    ],
    earlier_career: [
      {
        company: 'NorthStar Distribution',
        title: 'Regional Operations Director',
        dates: '2014 – 2021',
      },
    ],
    education: [
      { degree: 'B.S. Industrial Engineering', institution: 'Purdue University', year: '2002' },
    ],
    certifications: ['Lean Six Sigma Black Belt'],
  };
}

function makeReadyResumeDraft(): ResumeDraft {
  const resume = cloneResumeDraft(makeResumeDraft());
  resume.selected_accomplishments[0] = {
    ...resume.selected_accomplishments[0],
    confidence: 'strong',
  };
  resume.selected_accomplishments[1] = {
    ...resume.selected_accomplishments[1],
    content: 'Led SAP operating reviews that turned ERP data into faster site-level decisions and tighter inventory control.',
    confidence: 'strong',
    evidence_found: 'Led SAP operating reviews for plant and inventory performance.',
  };
  resume.professional_experience[0].bullets[1] = {
    ...resume.professional_experience[0].bullets[1],
    confidence: 'strong',
  };
  resume.professional_experience[0].bullets[2] = {
    ...resume.professional_experience[0].bullets[2],
    confidence: 'strong',
    evidence_found: 'Owned SAP performance reviews across plants.',
  };
  return resume;
}

function makeGapAnalysis(): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'Develop and track performance metrics',
        source: 'job_description',
        importance: 'must_have',
        classification: 'partial',
        evidence: ['Built weekly KPI reviews and line-performance meetings across 3 sites.'],
        source_evidence: 'Own KPI development, scorecards, and operating rhythm.',
      },
      {
        requirement: 'ERP leadership',
        source: 'job_description',
        importance: 'important',
        classification: 'missing',
        evidence: [],
        source_evidence: 'Experience with SAP, Oracle, or a similar ERP stack.',
      },
    ],
    coverage_score: 73,
    score_breakdown: {
      job_description: {
        total: 2,
        strong: 0,
        partial: 1,
        missing: 1,
        addressed: 1,
        coverage_score: 50,
      },
      benchmark: {
        total: 2,
        strong: 1,
        partial: 0,
        missing: 1,
        addressed: 1,
        coverage_score: 50,
      },
    },
    strength_summary: 'Strong multi-site operations depth, but the resume still under-documents metrics ownership and ERP leadership.',
    critical_gaps: ['ERP leadership is still under-documented.'],
    pending_strategies: [],
  };
}

function makeVerificationDetail(): VerificationDetail {
  return {
    truth: {
      truth_score: 91,
      claims: [
        {
          claim: 'Improved on-time delivery from 82% to 96%',
          confidence: 'verified',
          section: 'selected_accomplishments',
          source_found: true,
        },
      ],
      flagged_items: [],
    },
    ats: {
      match_score: 86,
      keywords_found: ['operations', 'performance metrics', 'distribution', 'ERP'],
      keywords_missing: ['board communication'],
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

function makePipelineData(resume: ResumeDraft): V2PipelineData {
  return {
    sessionId: 'visual-harness-session',
    stage: 'complete',
    jobIntelligence: makeJobIntelligence(),
    candidateIntelligence: null,
    benchmarkCandidate: {
      ideal_profile_summary: 'Benchmark leaders show explicit KPI ownership, ERP-driven decisions, and executive-level operating cadence.',
      expected_achievements: [],
      expected_leadership_scope: 'Multi-site operations, plant plus distribution.',
      expected_industry_knowledge: ['Industrial manufacturing', 'Distribution operations'],
      expected_technical_skills: ['ERP', 'KPI scorecards'],
      expected_certifications: [],
      differentiators: ['Board-ready operating reviews'],
    },
    gapAnalysis: makeGapAnalysis(),
    gapCoachingCards: null,
    gapQuestions: null,
    preScores: makePreScores(),
    narrativeStrategy: null,
    resumeDraft: resume,
    assembly: {
      final_resume: resume,
      scores: {
        ats_match: 86,
        truth: 91,
        tone: 88,
      },
      quick_wins: [],
      positioning_assessment: {
        summary: 'The revised resume is directionally strong but still needs stronger proof around ERP and KPI ownership.',
        requirement_map: [
          {
            requirement: 'Develop and track performance metrics',
            importance: 'must_have',
            status: 'repositioned',
            addressed_by: [
              {
                section: 'Selected Accomplishments',
                bullet_text: resume.selected_accomplishments[0]?.content ?? '',
              },
            ],
            strategy_used: 'Elevate KPI and scorecard ownership.',
          },
          {
            requirement: 'ERP leadership',
            importance: 'important',
            status: 'gap',
            addressed_by: [],
          },
        ],
        before_score: 48,
        after_score: 86,
        strategies_applied: ['Elevate KPI ownership', 'Bring ERP leadership higher in the document'],
      },
      hiring_manager_scan: {
        pass: false,
        scan_score: 74,
        header_impact: { score: 80, note: 'Executive scope is clear.' },
        summary_clarity: { score: 73, note: 'Summary is solid but can show more operating proof.' },
        above_fold_strength: { score: 72, note: 'Needs stronger KPI language near the top.' },
        keyword_visibility: { score: 71, note: 'ERP signal is not yet strong enough.' },
        red_flags: ['ERP ownership still feels implied instead of explicit.'],
        quick_wins: ['Move the strongest KPI line higher.'],
      },
    },
    inlineSuggestions: [],
    hiringManagerScan: null,
    verificationDetail: makeVerificationDetail(),
    error: null,
    stageMessages: [],
  };
}

function makeFinalReviewResult(): FinalReviewResult {
  return {
    six_second_scan: {
      decision: 'continue_reading',
      reason: 'The top third shows executive operations scope, but one claim still needs stronger proof.',
      top_signals_seen: [],
      important_signals_missing: [],
    },
    hiring_manager_verdict: {
      rating: 'possible_interview',
      summary: 'The draft is close, but KPI and ERP proof still need to be tightened before export.',
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
        id: 'concern-1',
        severity: 'critical',
        type: 'missing_evidence',
        observation: 'Performance metrics ownership is still too vague.',
        why_it_hurts: 'The hiring manager may not trust that the candidate owned the KPI system.',
        fix_strategy: 'Tie the claim to a concrete metrics line that is already on the resume.',
        target_section: 'Professional Experience - Acme Manufacturing',
        related_requirement: 'Develop and track performance metrics',
        suggested_resume_edit: 'Built and tracked weekly scorecards covering safety, throughput, labor efficiency, and on-time delivery across four facilities.',
        requires_candidate_input: false,
      },
      {
        id: 'concern-2',
        severity: 'moderate',
        type: 'benchmark_gap',
        observation: 'ERP leadership still reads as adjacent instead of explicit.',
        why_it_hurts: 'Benchmark candidates usually show direct ERP operating ownership.',
        fix_strategy: 'Clarify where SAP or ERP data informed actual operating decisions.',
        target_section: 'Professional Experience - Acme Manufacturing',
        related_requirement: 'ERP leadership',
        suggested_resume_edit: 'Led SAP operating reviews that turned ERP data into weekly site-level actions on inventory, labor, and delivery performance.',
        requires_candidate_input: true,
        clarifying_question: 'Where did you use SAP or another ERP to drive plant or distribution decisions?',
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

export function getResumeV2VisualScenario(
  id: ResumeV2VisualScenarioId,
): ResumeV2VisualScenario {
  if (id === 'action-state') {
    const resume = cloneResumeDraft(makeResumeDraft());
    return {
      id,
      label: 'Action State',
      description: 'Shows the clicked-line repair surface for a code-red selected accomplishment.',
      data: makePipelineData(resume),
      editableResume: resume,
      hiringManagerResult: null,
      isFinalReviewStale: true,
      initialActiveBullet: {
        section: 'selected_accomplishments',
        index: 1,
        requirements: ['ERP leadership'],
      },
    };
  }

  if (id === 'final-review') {
    const resume = cloneResumeDraft(makeResumeDraft());
    return {
      id,
      label: 'Final Review',
      description: 'Shows the resume with inline final-review concerns on the main canvas.',
      data: makePipelineData(resume),
      editableResume: resume,
      hiringManagerResult: makeFinalReviewResult(),
      isFinalReviewStale: false,
    };
  }

  if (id === 'ready') {
    const resume = makeReadyResumeDraft();
    return {
      id,
      label: 'Ready State',
      description: 'Shows the cleaned-up resume when attention lines are resolved and the document is ready for final review.',
      data: makePipelineData(resume),
      editableResume: resume,
      hiringManagerResult: null,
      isFinalReviewStale: true,
    };
  }

  const resume = cloneResumeDraft(makeResumeDraft());
  return {
    id: 'attention',
    label: 'Attention Lines',
    description: 'Shows the main working state with visible proof styling, attention lines, and the compact score snapshot.',
    data: makePipelineData(resume),
    editableResume: resume,
    hiringManagerResult: null,
    isFinalReviewStale: true,
  };
}

export const RESUME_V2_VISUAL_SCENARIOS: ResumeV2VisualScenarioId[] = [
  'attention',
  'action-state',
  'final-review',
  'ready',
];
