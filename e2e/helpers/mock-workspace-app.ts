import type { Page, Route } from '@playwright/test';
import { buildSSEBody, type SSEEvent } from '../fixtures/mock-sse';

const AUTH_SESSION = {
  access_token: 'mock-e2e-access-token',
  refresh_token: 'mock-e2e-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: 'mock-e2e-user-id',
    email: 'e2e@example.com',
    user_metadata: {
      full_name: 'E2E User',
      first_name: 'E2E',
      last_name: 'User',
    },
  },
};

const MOCK_CAREER_PROFILE = {
  version: 'career_profile_v2',
  source: 'career_profile',
  generated_at: new Date().toISOString(),
  targeting: {
    target_roles: ['VP Operations', 'COO'],
    target_industries: ['SaaS', 'Enterprise Technology'],
    seniority: 'executive',
    transition_type: 'same_level',
    preferred_company_environments: ['Growth stage', 'PE-backed'],
  },
  positioning: {
    core_strengths: ['Operational strategy', 'Cross-functional leadership'],
    proof_themes: ['Scaled teams through change', 'Improved execution quality'],
    differentiators: ['Combines operator discipline with executive communication'],
    adjacent_positioning: ['Can step from VP Operations into broader COO scope'],
    positioning_statement: 'Operator who brings order, cadence, and executive-level clarity to scaling companies.',
    narrative_summary: 'Known for aligning leaders and steadying execution in fast-moving environments.',
    leadership_scope: 'Teams of 40+, executive stakeholder alignment',
    scope_of_responsibility: 'Operations, systems, and cross-functional delivery',
  },
  narrative: {
    colleagues_came_for_what: 'Turning complexity into execution plans that teams can follow.',
    known_for_what: 'Bringing calm, structure, and momentum to scaling organizations.',
    why_not_me: 'Bridges VP Operations depth into COO-level operating leadership.',
    story_snippet: 'Executive operator who makes growth sustainable.',
  },
  preferences: {
    must_haves: ['Executive scope', 'High-trust leadership'],
    constraints: ['No relocation'],
    compensation_direction: 'Executive cash + upside',
  },
  coaching: {
    financial_segment: 'executive_transition',
    emotional_state: 'focused',
    coaching_tone: 'direct',
    urgency_score: 62,
    recommended_starting_point: 'resume',
  },
  evidence_positioning_statements: [
    'Built operating cadence across product, support, and delivery leaders.',
    'Trusted to stabilize execution while companies scale.',
  ],
  profile_signals: {
    clarity: 'green',
    alignment: 'green',
    differentiation: 'yellow',
  },
  completeness: {
    overall_score: 84,
    dashboard_state: 'strong',
    sections: [
      { id: 'direction', label: 'Direction', status: 'ready', score: 90, summary: 'Target role and market direction are clear.' },
      { id: 'positioning', label: 'Positioning', status: 'ready', score: 86, summary: 'The platform has enough positioning depth to guide downstream tools.' },
      { id: 'narrative', label: 'Narrative', status: 'partial', score: 72, summary: 'The main identity thread is clear but could use deeper proof.' },
      { id: 'constraints', label: 'Constraints', status: 'ready', score: 88, summary: 'Must-haves and constraints are captured.' },
    ],
  },
  profile_summary: 'Executive operator targeting VP Operations / COO opportunities in SaaS and enterprise technology.',
} as const;

const MOCK_SESSIONS = [
  {
    id: 'mock-resume-session',
    status: 'completed',
    current_phase: 'quality_review',
    master_resume_id: 'resume-default',
    job_application_id: 'job-techcorp',
    pipeline_status: 'complete',
    pipeline_stage: 'complete',
    company_name: 'TechCorp',
    job_title: 'VP Operations',
    job_stage: 'interviewing',
    product_type: 'resume_v2',
    created_at: '2026-03-10T16:00:00.000Z',
    updated_at: '2026-03-10T17:15:00.000Z',
  },
  {
    id: 'mock-cover-letter-session',
    status: 'completed',
    current_phase: 'quality_review',
    master_resume_id: 'resume-default',
    job_application_id: 'job-techcorp',
    pipeline_status: 'complete',
    pipeline_stage: 'complete',
    company_name: 'TechCorp',
    job_title: 'VP Operations',
    job_stage: 'interviewing',
    product_type: 'cover_letter',
    created_at: '2026-03-10T16:00:00.000Z',
    updated_at: '2026-03-10T17:10:00.000Z',
  },
  {
    id: 'mock-interview-prep-session',
    status: 'completed',
    current_phase: 'quality_review',
    master_resume_id: 'resume-default',
    job_application_id: 'job-techcorp',
    pipeline_status: 'complete',
    pipeline_stage: 'complete',
    company_name: 'TechCorp',
    job_title: 'VP Operations',
    job_stage: 'interviewing',
    product_type: 'interview_prep',
    created_at: '2026-03-11T12:00:00.000Z',
    updated_at: '2026-03-11T12:30:00.000Z',
  },
  {
    id: 'mock-thank-you-session',
    status: 'completed',
    current_phase: 'quality_review',
    master_resume_id: 'resume-default',
    job_application_id: 'job-techcorp',
    pipeline_status: 'complete',
    pipeline_stage: 'complete',
    company_name: 'TechCorp',
    job_title: 'VP Operations',
    job_stage: 'interviewing',
    product_type: 'thank_you_note',
    created_at: '2026-03-12T13:00:00.000Z',
    updated_at: '2026-03-12T13:20:00.000Z',
  },
  {
    id: 'mock-plan-session',
    status: 'completed',
    current_phase: 'quality_review',
    master_resume_id: 'resume-default',
    job_application_id: 'job-techcorp',
    pipeline_status: 'complete',
    pipeline_stage: 'complete',
    company_name: 'TechCorp',
    job_title: 'VP Operations',
    job_stage: 'interviewing',
    product_type: 'ninety_day_plan',
    created_at: '2026-03-12T14:00:00.000Z',
    updated_at: '2026-03-12T14:20:00.000Z',
  },
  {
    id: 'mock-offer-resume-session',
    status: 'completed',
    current_phase: 'quality_review',
    master_resume_id: 'resume-default',
    job_application_id: 'job-offerco',
    pipeline_status: 'complete',
    pipeline_stage: 'complete',
    company_name: 'OfferCo',
    job_title: 'Chief Operating Officer',
    job_stage: 'offer',
    product_type: 'resume_v2',
    created_at: '2026-03-13T12:00:00.000Z',
    updated_at: '2026-03-13T12:30:00.000Z',
  },
  {
    id: 'mock-nego-session',
    status: 'completed',
    current_phase: 'quality_review',
    master_resume_id: 'resume-default',
    job_application_id: 'job-offerco',
    pipeline_status: 'complete',
    pipeline_stage: 'complete',
    company_name: 'OfferCo',
    job_title: 'Chief Operating Officer',
    job_stage: 'offer',
    product_type: 'salary_negotiation',
    created_at: '2026-03-13T13:00:00.000Z',
    updated_at: '2026-03-13T13:15:00.000Z',
  },
  {
    id: 'mock-second-resume-session',
    status: 'active',
    current_phase: 'gap_analysis',
    master_resume_id: 'resume-default',
    job_application_id: 'job-betaco',
    pipeline_status: 'running',
    pipeline_stage: 'gap_analysis',
    company_name: 'BetaCo',
    job_title: 'Chief of Staff',
    job_stage: 'applied',
    product_type: 'resume_v2',
    created_at: '2026-03-12T15:00:00.000Z',
    updated_at: '2026-03-12T15:45:00.000Z',
  },
];

const MOCK_APPLICATIONS = [
  {
    id: 'job-techcorp',
    role_title: 'VP Operations',
    company_name: 'TechCorp',
    stage: 'interviewing',
    source: 'manual',
    next_action: 'Run interview prep and tighten the 30-60-90 story.',
    next_action_due: '2026-03-18T15:00:00.000Z',
    stage_history: [
      { stage: 'saved', at: '2026-03-08T10:00:00.000Z' },
      { stage: 'applied', at: '2026-03-09T11:00:00.000Z' },
      { stage: 'interviewing', at: '2026-03-11T09:30:00.000Z' },
    ],
    created_at: '2026-03-08T10:00:00.000Z',
    updated_at: '2026-03-11T09:30:00.000Z',
  },
  {
    id: 'job-betaco',
    role_title: 'Chief of Staff',
    company_name: 'BetaCo',
    stage: 'applied',
    source: 'manual',
    next_action: 'Hold interview assets until this moves past screening.',
    next_action_due: '2026-03-20T14:00:00.000Z',
    stage_history: [
      { stage: 'saved', at: '2026-03-12T08:00:00.000Z' },
      { stage: 'applied', at: '2026-03-12T15:45:00.000Z' },
    ],
    created_at: '2026-03-12T08:00:00.000Z',
    updated_at: '2026-03-12T15:45:00.000Z',
  },
  {
    id: 'job-offerco',
    role_title: 'Chief Operating Officer',
    company_name: 'OfferCo',
    stage: 'offer',
    source: 'manual',
    next_action: 'Review the saved negotiation strategy before responding to the offer.',
    next_action_due: '2026-03-19T13:00:00.000Z',
    stage_history: [
      { stage: 'saved', at: '2026-03-11T10:00:00.000Z' },
      { stage: 'applied', at: '2026-03-11T12:00:00.000Z' },
      { stage: 'interviewing', at: '2026-03-12T09:00:00.000Z' },
      { stage: 'offer', at: '2026-03-13T11:00:00.000Z' },
    ],
    created_at: '2026-03-11T10:00:00.000Z',
    updated_at: '2026-03-13T11:00:00.000Z',
  },
];

const MOCK_RESUMES = [
  {
    id: 'resume-default',
    title: 'Executive Master Resume',
    version: 4,
    is_default: true,
    updated_at: '2026-03-01T12:00:00.000Z',
  },
];

const MOCK_MASTER_RESUME_RAW_TEXT = 'Executive operator with operations leadership experience across product, support, delivery, and executive stakeholder teams.';

const MOCK_JOB_APPLICATION_ROWS = [
  {
    id: 'job-techcorp',
    company: 'TechCorp',
    title: 'VP Operations',
    pipeline_stage: 'interviewing',
    status: 'active',
    jd_text: 'Lead executive alignment and drive operating cadence.',
  },
  {
    id: 'job-offerco',
    company: 'OfferCo',
    title: 'Chief Operating Officer',
    pipeline_stage: 'offer',
    status: 'active',
    jd_text: 'Own operating rhythm, executive communication, and first-year execution priorities.',
  },
] as const;

const MOCK_ONBOARDING_QUESTIONS = [
  {
    id: 'career-context-1',
    question: 'What kind of leadership scope are you targeting next?',
    category: 'career_context',
    purpose: 'This helps the platform align your target role, level, and operating scope before it writes anything else.',
  },
  {
    id: 'goals-1',
    question: 'What business outcome do you most want your next role to improve?',
    category: 'goals_and_aspirations',
    purpose: 'This gives Resume Builder, LinkedIn, Job Search, and Interview Prep one business outcome to reinforce consistently.',
  },
] as const;

const MOCK_ONBOARDING_PROFILE = {
  career_level: 'vp',
  industry: 'SaaS',
  years_experience: 18,
  financial_segment: 'comfortable',
  emotional_state: 'growth',
  transition_type: 'voluntary',
  goals: ['Step into broader COO-style operating scope'],
  constraints: ['No relocation'],
  strengths_self_reported: ['Operating cadence', 'Cross-functional leadership'],
  urgency_score: 62,
  recommended_starting_point: 'resume',
  coaching_tone: 'direct',
} as const;

const MOCK_ONBOARDING_SUMMARY = {
  key_insights: [
    'The candidate is targeting broader executive operating scope.',
    'Executive alignment and operating rhythm should stay central to the story.',
  ],
  financial_signals: ['The transition timeline is steady, not crisis-driven.'],
  emotional_signals: ['Confidence is high enough for direct guidance.'],
  recommended_actions: [
    'Refresh the Career Profile and reuse it in Resume Builder and LinkedIn.',
    'Lead with executive operating cadence in top-of-funnel materials.',
  ],
} as const;

const MOCK_LINKEDIN_REPORT = `# LinkedIn Optimization Report

## Headline
### Current
VP Operations

### Optimized
VP Operations | Executive operator who builds operating cadence and cross-functional alignment

## About Section
### Current
Operations leader with executive experience.

### Optimized
Executive operator known for building operating rhythm, aligning leaders, and turning complexity into execution across fast-moving organizations.
`;

const MOCK_LINKEDIN_EXPERIENCE_ENTRIES = [
  {
    role_id: 'exp-1',
    company: 'TechCorp',
    title: 'VP Operations',
    duration: '2021-Present',
    original: 'Led operations.',
    optimized: 'Aligned product, operations, and support leaders around a weekly operating cadence that improved execution quality.',
    quality_scores: {
      impact: 84,
      metrics: 70,
      context: 88,
      keywords: 82,
    },
  },
] as const;

const MOCK_LINKEDIN_CONTENT_TOPICS = [
  {
    id: 'topic-ops-cadence',
    topic: 'The operating cadence most leadership teams skip',
    hook: 'The meetings were happening, but the business still was not moving.',
    rationale: 'This shows operating discipline without sounding generic.',
    expertise_area: 'Executive Operations',
    evidence_refs: ['Operating cadence reset'],
  },
  {
    id: 'topic-cross-functional',
    topic: 'What strong cross-functional leadership actually looks like',
    hook: 'Alignment is not a slide. It is a working system.',
    rationale: 'This reinforces executive alignment and systems thinking.',
    expertise_area: 'Cross-functional Leadership',
    evidence_refs: ['Leadership alignment framework'],
  },
] as const;

const MOCK_LINKEDIN_CONTENT_DRAFT = {
  post: `The meetings were happening, but the business still was not moving.

That was the signal we did not need more status updates. We needed a real operating cadence.

Once product, operations, and support were working from the same weekly decisions and owners, execution got faster and the noise dropped.

Alignment is not a slide. It is a system leaders maintain together.`,
  hashtags: ['OperationsLeadership', 'ExecOps', 'Leadership'],
  quality_scores: {
    authenticity: 89,
    engagement_potential: 81,
    keyword_density: 74,
  },
  hook_score: 78,
  hook_type: 'pattern_interrupt',
  hook_assessment: 'The opening creates curiosity without overpromising.',
} as const;

type LinkedInContentStage = 'topics' | 'draft' | 'complete';
type LinkedInEditorStage = 'headline' | 'about' | 'complete';

interface MockWatchlistCompany {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  careers_url: string | null;
  priority: number;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface WatchlistState {
  companies: MockWatchlistCompany[];
}

interface MockInterviewDebrief {
  id: string;
  user_id: string;
  job_application_id?: string;
  company_name: string;
  role_title: string;
  interview_date: string;
  interview_type?: 'phone' | 'video' | 'onsite';
  overall_impression?: 'positive' | 'neutral' | 'negative';
  what_went_well?: string;
  what_went_poorly?: string;
  questions_asked?: string[];
  interviewer_notes?: Array<{
    name: string;
    title?: string;
    topics_discussed?: string[];
    rapport_notes?: string;
  }>;
  company_signals?: string;
  follow_up_actions?: string;
  created_at: string;
  updated_at: string;
}

interface InterviewDebriefState {
  debriefs: MockInterviewDebrief[];
}

const MOCK_LINKEDIN_EDITOR_DRAFTS = {
  headline: {
    content: 'VP Operations | Executive operator who builds operating cadence and cross-functional alignment',
    quality_scores: {
      keyword_coverage: 88,
      readability: 82,
      positioning_alignment: 90,
    },
  },
  about: {
    content: `Executive operator known for turning complexity into operating rhythm across product, support, and delivery teams.

I help leadership teams create the weekly decision-making cadence, ownership clarity, and cross-functional alignment that keep growth from turning into noise.`,
    quality_scores: {
      keyword_coverage: 86,
      readability: 80,
      positioning_alignment: 91,
    },
  },
} as const;

const MOCK_JOB_FINDER_SEARCHES = [
  { platform: 'LinkedIn', query: '"VP Operations" OR "COO" AND ("operating cadence" OR "cross-functional")' },
  { platform: 'Indeed', query: '"VP Operations" "executive stakeholder leadership"' },
] as const;

const MOCK_JOB_FINDER_MATCHES = [
  {
    id: 'match-1',
    title: 'VP Operations',
    company: 'Northstar SaaS',
    location: 'Remote',
    fit_score: 91,
    why_match: 'Strong overlap on executive cadence, cross-functional alignment, and operating discipline.',
    salary_range: '$250k-$290k',
    posted_date: '2d ago',
    work_type: 'remote',
  },
  {
    id: 'match-2',
    title: 'Chief of Staff, Operations',
    company: 'ScaleCo',
    location: 'Chicago, IL',
    fit_score: 84,
    why_match: 'This role still maps well to executive operating rhythm and leadership alignment strengths.',
    salary_range: '$210k-$240k',
    posted_date: '5d ago',
    work_type: 'hybrid',
  },
] as const;

const MOCK_RADAR_JOBS = [
  {
    external_id: 'radar-1',
    title: 'VP Operations',
    company: 'Northstar SaaS',
    location: 'Remote',
    salary_min: 250000,
    salary_max: 290000,
    description: 'Own operating cadence and executive alignment across product, support, and delivery.',
    posted_date: '2026-03-18T09:00:00.000Z',
    apply_url: 'https://example.com/jobs/northstar-vp-ops',
    source: 'linkedin',
    remote_type: 'remote',
    employment_type: 'full-time',
    required_skills: ['Operating cadence', 'Cross-functional leadership'],
  },
  {
    external_id: 'radar-2',
    title: 'Chief of Staff, Operations',
    company: 'ScaleCo',
    location: 'Chicago, IL',
    salary_min: 210000,
    salary_max: 240000,
    description: 'Drive leadership rhythm, special projects, and operating reviews.',
    posted_date: '2026-03-16T09:00:00.000Z',
    apply_url: 'https://example.com/jobs/scaleco-chief-of-staff',
    source: 'indeed',
    remote_type: 'hybrid',
    employment_type: 'full-time',
    required_skills: ['Executive communication', 'Program management'],
  },
] as const;

const MOCK_RADAR_SCORE_RESULTS = [
  { external_id: 'radar-1', match_score: 92 },
  { external_id: 'radar-2', match_score: 84 },
] as const;

const MOCK_INTERVIEW_PREP_REPORT = `# Interview Prep

## Top Story
Lead with executive operating cadence and cross-functional alignment.

## Pressure Points
- Show one clear business impact example.
- Stay specific on executive stakeholder influence.
`;

const MOCK_JOB_TRACKER_REPORT = `Application Tracker Summary

- Northstar SaaS — strong fit, follow up with the hiring lead this week.
- ScaleCo — good adjacent fit, but tighten the operations-to-program bridge in your outreach.

Recommended follow-ups:
1. Send a tailored follow-up note to Northstar SaaS.
2. Keep ScaleCo warm with one concise value-forward update.`;

const MOCK_RESUME_V2_RESULT = {
  version: 'v2',
  status: 'complete',
  pipeline_stage: 'complete',
  inputs: {
    resume_text: 'Executive operator with operations leadership experience.',
    job_description: 'VP Operations role focused on cross-functional leadership.',
  },
  pipeline_data: {
    stage: 'complete',
    jobIntelligence: {
      company_name: 'TechCorp',
      role_title: 'VP Operations',
      seniority_level: 'VP',
      core_competencies: [
        {
          competency: 'Executive stakeholder leadership',
          importance: 'must_have',
          evidence_from_jd: 'Lead executive alignment and drive operating cadence.',
        },
      ],
      strategic_responsibilities: ['Drive operating cadence across departments'],
      business_problems: ['Improve execution quality'],
      cultural_signals: ['Ownership'],
      hidden_hiring_signals: ['Needs an operator who can align leaders quickly'],
      language_keywords: ['cross-functional', 'stakeholder', 'operating cadence'],
      industry: 'SaaS',
    },
    candidateIntelligence: {
      contact: null,
      career_themes: ['Operational leadership'],
      leadership_scope: 'Executive-level operating leadership',
      quantified_outcomes: [],
      industry_depth: ['SaaS'],
      technologies: [],
      operational_scale: 'Cross-functional operating model',
      career_span_years: 15,
      experience: [],
      education: [],
      certifications: [],
      hidden_accomplishments: [],
    },
    benchmarkCandidate: {
      ideal_profile_summary: 'Executive operator with strong stakeholder alignment and systems discipline.',
      expected_achievements: [],
      expected_leadership_scope: 'Executive-level scope',
      expected_industry_knowledge: ['SaaS operations'],
      expected_technical_skills: ['Operating cadence'],
      expected_certifications: [],
      differentiators: ['Cross-functional leadership'],
    },
    gapAnalysis: {
      requirements: [
        {
          requirement: 'Executive stakeholder leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Aligned product, operations, and support leaders around weekly execution priorities.'],
          source: 'job_description',
          source_evidence: 'Lead executive alignment and drive operating cadence.',
          score_domain: 'job_description',
        },
      ],
      coverage_score: 88,
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
          addressed: 1,
          total: 1,
          strong: 1,
          partial: 0,
          missing: 0,
          coverage_score: 100,
        },
      },
      strength_summary: 'Strong operating leadership fit.',
      critical_gaps: [],
      pending_strategies: [],
    },
    gapCoachingCards: [],
    preScores: {
      ats_match: 74,
      keyword_coverage: 72,
      readability_score: 81,
      missing_keywords: [],
      matched_keywords: ['stakeholder leadership'],
    },
    narrativeStrategy: {
      primary_narrative: 'Executive operator who turns complexity into operating rhythm.',
      supporting_themes: ['Cross-functional leadership'],
      branded_title: 'VP Operations',
      why_me_story: 'Built reliable operating cadence across fast-moving teams.',
      why_me_concise: 'Executive operator with systems discipline.',
      why_me_best_line: 'The operator who makes growth executable.',
      section_guidance: {
        summary_angle: 'Lead with operating rhythm and executive alignment.',
        competency_themes: ['Operating cadence'],
        accomplishment_priorities: ['Cross-functional execution'],
        experience_framing: {},
      },
    },
    resumeDraft: {
      header: {
        name: 'E2E User',
        phone: '555-0100',
        email: 'e2e@example.com',
        branded_title: 'VP Operations',
      },
      executive_summary: {
        content: 'Executive operator who builds structure, operating rhythm, and executive alignment.',
        is_new: false,
        addresses_requirements: ['Executive stakeholder leadership'],
      },
      core_competencies: ['Operating Cadence', 'Executive Alignment'],
      selected_accomplishments: [],
      professional_experience: [
        {
          company: 'TechCorp',
          title: 'VP Operations',
          start_date: '2021',
          end_date: 'Present',
          scope_statement: 'Led operating cadence across product, operations, and customer support.',
          scope_statement_is_new: false,
          scope_statement_addresses_requirements: ['Executive stakeholder leadership'],
          bullets: [
            {
              text: 'Aligned executive, product, and operations leaders around weekly priorities to improve execution quality.',
              is_new: false,
              addresses_requirements: ['Executive stakeholder leadership'],
            },
          ],
        },
      ],
      education: [],
      certifications: [],
    },
    assembly: {
      final_resume: {
        header: {
          name: 'E2E User',
          phone: '555-0100',
          email: 'e2e@example.com',
          branded_title: 'VP Operations',
        },
        executive_summary: {
          content: 'Executive operator who builds structure, operating rhythm, and executive alignment.',
          is_new: false,
          addresses_requirements: ['Executive stakeholder leadership'],
        },
        core_competencies: ['Operating Cadence', 'Executive Alignment'],
        selected_accomplishments: [],
        professional_experience: [
          {
            company: 'TechCorp',
            title: 'VP Operations',
            start_date: '2021',
            end_date: 'Present',
            scope_statement: 'Led operating cadence across product, operations, and customer support.',
            scope_statement_is_new: false,
            scope_statement_addresses_requirements: ['Executive stakeholder leadership'],
            bullets: [
              {
                text: 'Aligned executive, product, and operations leaders around weekly priorities to improve execution quality.',
                is_new: false,
                addresses_requirements: ['Executive stakeholder leadership'],
              },
            ],
          },
        ],
        education: [],
        certifications: [],
      },
      positioning_assessment: {
        requirement_map: [
          {
            requirement: 'Executive stakeholder leadership',
            status: 'strong',
            addressed_by: [
              {
                section: 'Professional Experience',
                bullet_text: 'Aligned executive, product, and operations leaders around weekly priorities to improve execution quality.',
              },
            ],
          },
        ],
      },
      scores: {
        ats_match: 90,
        truth: 96,
        tone: 89,
      },
      quick_wins: [],
    },
    error: null,
    stageMessages: [],
  },
};

const MOCK_FINAL_REVIEW_RESULT = {
  six_second_scan: {
    decision: 'continue_reading',
    reason: 'The top third shows a credible VP Operations story with executive alignment and operating cadence visible quickly enough to keep reading.',
    top_signals_seen: [
      {
        signal: 'Executive operator positioning is visible immediately',
        why_it_matters: 'The recruiter can tell what kind of leader this candidate is without hunting.',
        visible_in_top_third: true,
      },
      {
        signal: 'Cross-functional execution proof appears early',
        why_it_matters: 'It supports the JD requirement for executive stakeholder leadership.',
        visible_in_top_third: true,
      },
    ],
    important_signals_missing: [
      {
        signal: 'Clearer metric on execution improvement',
        why_it_matters: 'Adding even one hard number would make the business impact more interview-worthy.',
      },
    ],
  },
  hiring_manager_verdict: {
    rating: 'possible_interview',
    summary: 'The draft is directionally strong for the role, but it still needs one sharper business-impact proof point before it reads like a confident interview yes.',
  },
  fit_assessment: {
    job_description_fit: 'strong',
    benchmark_alignment: 'moderate',
    business_impact: 'moderate',
    clarity_and_credibility: 'strong',
  },
  top_wins: [
    {
      win: 'Built an executive operating cadence across product, operations, and support leaders.',
      why_powerful: 'This is the strongest proof that the candidate can align leaders and steady execution.',
      aligned_requirement: 'Executive stakeholder leadership',
      prominent_enough: true,
      repositioning_recommendation: 'Keep this in the top third of the document.',
    },
  ],
  concerns: [
    {
      id: 'concern_impact_metric',
      severity: 'critical',
      type: 'missing_metric',
      observation: 'The strongest operating-cadence bullet lacks a hard metric or scope indicator.',
      why_it_hurts: 'Without scope or outcome, the experience reads more like responsibility than business impact.',
      fix_strategy: 'Add one truthful metric about execution improvement, team scope, or cadence ownership.',
      target_section: 'Professional Experience',
      related_requirement: 'Executive stakeholder leadership',
      suggested_resume_edit: 'Aligned executive, product, and operations leaders around weekly priorities, improving execution health across a 40+ person cross-functional organization.',
      requires_candidate_input: true,
      clarifying_question: 'How large was the team or function you were aligning, or what concrete execution result improved?',
    },
  ],
  structure_recommendations: [
    {
      issue: 'The strongest win could carry more measurable business impact.',
      recommendation: 'Tighten the leading operating-cadence bullet with scope or metric evidence.',
      priority: 'high',
    },
  ],
  benchmark_comparison: {
    advantages_vs_benchmark: [
      'Executive alignment and operating cadence are already visible.',
    ],
    gaps_vs_benchmark: [
      'Benchmark candidates often show clearer scale and quantified execution results.',
    ],
    reframing_opportunities: [
      'Use team scope or cadence ownership as a truthful proxy if revenue metrics are unavailable.',
    ],
  },
  improvement_summary: [
    'Add one hard metric or scope signal to the lead operating-cadence bullet.',
    'Keep the executive operator story anchored in the top third.',
    'Use Final Review fixes before export so the draft reads more interview-ready.',
  ],
} as const;

const EXACT_REPORTS = {
  'interview-prep': {
    'mock-interview-prep-session': {
      report_markdown: '# Interview Prep\n\n## Top Story\nLead with executive operating cadence and cross-functional alignment.',
      quality_score: 91,
    },
  },
  'thank-you-note': {
    'mock-thank-you-session': {
      report_markdown: '# Thank You Notes\n\n## TechCorp Panel\nThank you for the thoughtful conversation about operating cadence.',
      quality_score: 88,
    },
  },
  'ninety-day-plan': {
    'mock-plan-session': {
      report_markdown: '# 30-60-90 Success Plan\n\n## Days 1-30\nListen, learn, and map executive stakeholders.',
      quality_score: 90,
    },
  },
  'salary-negotiation': {
    'mock-nego-session': {
      report_markdown: '# Negotiation Playbook\n\n## Opening Position\nLead with scope, market position, and first-year risk offset.',
      quality_score: 89,
    },
  },
  'retirement-bridge': {
    'mock-retirement-session': {
      session_id: 'mock-retirement-session',
      overall_readiness: 'yellow',
      readiness_summary: {
        dimensions: [],
        overall_readiness: 'yellow',
        key_observations: ['Healthcare bridge needs discussion.'],
        recommended_planner_topics: ['Healthcare bridge options'],
        shareable_summary: 'A planner should pressure-test healthcare bridge assumptions before a transition.',
      },
    },
  },
} as const;

function buildJsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

function buildSSEStreamResponse(events: SSEEvent[]) {
  return {
    status: 200,
    contentType: 'text/event-stream',
    body: buildSSEBody(events),
  };
}

function readRouteJson(route: Route): Record<string, unknown> {
  const raw = route.request().postData();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function fulfillApiRoute(
  route: Route,
  linkedinContentState?: Map<string, LinkedInContentStage>,
  linkedinEditorState?: Map<string, LinkedInEditorStage>,
  watchlistState?: WatchlistState,
  interviewDebriefState?: InterviewDebriefState,
) {
  const requestUrl = new URL(route.request().url());
  const path = requestUrl.pathname;
  const method = route.request().method();

  if (path === '/api/sessions' && method === 'GET') {
    await route.fulfill(buildJsonResponse({ sessions: MOCK_SESSIONS, has_more: false }));
    return;
  }

  if (path === '/api/sessions' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ session: { id: 'mock-created-session' } }));
    return;
  }

  if (path === '/api/applications' && method === 'GET') {
    await route.fulfill(buildJsonResponse({ applications: MOCK_APPLICATIONS, count: MOCK_APPLICATIONS.length }));
    return;
  }

  if (path === '/api/applications/due-actions' && method === 'GET') {
    await route.fulfill(buildJsonResponse({
      actions: [
        {
          id: 'job-techcorp',
          role_title: 'VP Operations',
          company_name: 'TechCorp',
          next_action: 'Follow up on the panel interview thank-you note.',
          next_action_due: '2026-03-21T15:00:00.000Z',
          stage: 'interviewing',
        },
      ],
    }));
    return;
  }

  if (path === '/api/applications' && method === 'POST') {
    const payload = readRouteJson(route);
    await route.fulfill(buildJsonResponse({
      id: `app-${Date.now()}`,
      role_title: typeof payload.role_title === 'string' ? payload.role_title : 'New role',
      company_name: typeof payload.company_name === 'string' ? payload.company_name : 'New company',
      stage: typeof payload.stage === 'string' ? payload.stage : 'saved',
      source: typeof payload.source === 'string' ? payload.source : 'manual',
      url: typeof payload.url === 'string' ? payload.url : undefined,
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      stage_history: Array.isArray(payload.stage_history) ? payload.stage_history : [],
      created_at: typeof payload.created_at === 'string' ? payload.created_at : new Date().toISOString(),
      updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : new Date().toISOString(),
    }));
    return;
  }

  if (/^\/api\/applications\/[^/]+\/stage$/.test(path) && method === 'PATCH') {
    const applicationId = path.split('/')[3] ?? '';
    const matched = MOCK_APPLICATIONS.find((application) => application.id === applicationId) ?? MOCK_APPLICATIONS[0];
    await route.fulfill(buildJsonResponse({ ...matched, updated_at: new Date().toISOString() }));
    return;
  }

  if (path === '/api/resumes' && method === 'GET') {
    await route.fulfill(buildJsonResponse({ resumes: MOCK_RESUMES }));
    return;
  }

  if (path === '/api/resumes/default' && method === 'GET') {
    await route.fulfill(buildJsonResponse({
      resume: {
        id: 'resume-default',
        raw_text: MOCK_MASTER_RESUME_RAW_TEXT,
        version: 4,
        is_default: true,
      },
    }));
    return;
  }

  if (path === '/api/platform-context/career-profile' && method === 'GET') {
    await route.fulfill(buildJsonResponse({ career_profile: MOCK_CAREER_PROFILE }));
    return;
  }

  if (path === '/api/platform-context/summary' && method === 'GET') {
    await route.fulfill(buildJsonResponse({
      types: [
        { context_type: 'career_profile', source_product: 'career_profile', updated_at: new Date().toISOString() },
        { context_type: 'positioning_strategy', source_product: 'resume_v2', updated_at: new Date().toISOString() },
        { context_type: 'emotional_baseline', source_product: 'onboarding', updated_at: new Date().toISOString() },
        { context_type: 'client_profile', source_product: 'onboarding', updated_at: new Date().toISOString() },
      ],
    }));
    return;
  }

  if (path === '/api/onboarding/start' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path === '/api/onboarding/respond' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (/^\/api\/linkedin-optimizer\/[^/]+\/stream$/.test(path) && method === 'GET') {
    await route.fulfill(buildSSEStreamResponse([
      {
        event: 'stage_start',
        data: { stage: 'analysis', message: 'Analyzing your resume and LinkedIn positioning...' },
      },
      {
        event: 'section_progress',
        data: { section: 'headline', status: 'writing' },
      },
      {
        event: 'report_complete',
        data: {
          report: MOCK_LINKEDIN_REPORT,
          quality_score: 87,
          experience_entries: MOCK_LINKEDIN_EXPERIENCE_ENTRIES,
        },
      },
      {
        event: 'pipeline_complete',
        data: {},
      },
    ]));
    return;
  }

  if (path === '/api/linkedin-optimizer/start' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (/^\/api\/linkedin-content\/[^/]+\/stream$/.test(path) && method === 'GET') {
    const sessionId = path.split('/')[3] ?? 'mock-linkedin-content-session';
    const phase = linkedinContentState?.get(sessionId) ?? 'topics';

    if (phase === 'draft') {
      await route.fulfill(buildSSEStreamResponse([
        {
          event: 'stage_start',
          data: { stage: 'drafting', message: 'Writing a draft from your selected topic...' },
        },
        {
          event: 'post_draft_ready',
          data: MOCK_LINKEDIN_CONTENT_DRAFT,
        },
        {
          event: 'pipeline_gate',
          data: { gate: 'post_review' },
        },
      ]));
      return;
    }

    if (phase === 'complete') {
      await route.fulfill(buildSSEStreamResponse([
        {
          event: 'content_complete',
          data: MOCK_LINKEDIN_CONTENT_DRAFT,
        },
        {
          event: 'pipeline_complete',
          data: {},
        },
      ]));
      return;
    }

    await route.fulfill(buildSSEStreamResponse([
      {
        event: 'stage_start',
        data: { stage: 'topic_generation', message: 'Finding post angles from your positioning...' },
      },
      {
        event: 'topics_ready',
        data: { topics: MOCK_LINKEDIN_CONTENT_TOPICS },
      },
      {
        event: 'pipeline_gate',
        data: { gate: 'topic_selection' },
      },
    ]));
    return;
  }

  if (path === '/api/linkedin-content/start' && method === 'POST') {
    const payload = readRouteJson(route);
    const sessionId =
      typeof payload.session_id === 'string' && payload.session_id.length > 0
        ? payload.session_id
        : 'mock-linkedin-content-session';
    linkedinContentState?.set(sessionId, 'topics');
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path === '/api/linkedin-content/respond' && method === 'POST') {
    const payload = readRouteJson(route);
    const sessionId =
      typeof payload.session_id === 'string' && payload.session_id.length > 0
        ? payload.session_id
        : 'mock-linkedin-content-session';
    const response =
      payload.response && typeof payload.response === 'object'
        ? (payload.response as Record<string, unknown>)
        : {};

    if (typeof response.topic_id === 'string' && response.topic_id.length > 0) {
      linkedinContentState?.set(sessionId, 'draft');
    } else if (response.approved === true) {
      linkedinContentState?.set(sessionId, 'complete');
    } else {
      linkedinContentState?.set(sessionId, 'draft');
    }

    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (/^\/api\/linkedin-editor\/[^/]+\/stream$/.test(path) && method === 'GET') {
    const sessionId = path.split('/')[3] ?? 'mock-linkedin-editor-session';
    const phase = linkedinEditorState?.get(sessionId) ?? 'headline';

    if (phase === 'about') {
      await route.fulfill(buildSSEStreamResponse([
        {
          event: 'section_approved',
          data: {
            section: 'headline',
            content: MOCK_LINKEDIN_EDITOR_DRAFTS.headline.content,
          },
        },
        {
          event: 'stage_start',
          data: { stage: 'about', message: 'Writing your About section...' },
        },
        {
          event: 'section_draft_ready',
          data: {
            section: 'about',
            content: MOCK_LINKEDIN_EDITOR_DRAFTS.about.content,
            quality_scores: MOCK_LINKEDIN_EDITOR_DRAFTS.about.quality_scores,
          },
        },
        {
          event: 'pipeline_gate',
          data: { gate: 'section_review' },
        },
      ]));
      return;
    }

    if (phase === 'complete') {
      await route.fulfill(buildSSEStreamResponse([
        {
          event: 'section_approved',
          data: {
            section: 'about',
            content: MOCK_LINKEDIN_EDITOR_DRAFTS.about.content,
          },
        },
        {
          event: 'editor_complete',
          data: {
            sections: {
              headline: MOCK_LINKEDIN_EDITOR_DRAFTS.headline.content,
              about: MOCK_LINKEDIN_EDITOR_DRAFTS.about.content,
            },
          },
        },
        {
          event: 'pipeline_complete',
          data: {},
        },
      ]));
      return;
    }

    await route.fulfill(buildSSEStreamResponse([
      {
        event: 'stage_start',
        data: { stage: 'headline', message: 'Writing your headline...' },
      },
      {
        event: 'section_draft_ready',
        data: {
          section: 'headline',
          content: MOCK_LINKEDIN_EDITOR_DRAFTS.headline.content,
          quality_scores: MOCK_LINKEDIN_EDITOR_DRAFTS.headline.quality_scores,
        },
      },
      {
        event: 'pipeline_gate',
        data: { gate: 'section_review' },
      },
    ]));
    return;
  }

  if (path === '/api/linkedin-editor/start' && method === 'POST') {
    const payload = readRouteJson(route);
    const sessionId =
      typeof payload.session_id === 'string' && payload.session_id.length > 0
        ? payload.session_id
        : 'mock-linkedin-editor-session';
    linkedinEditorState?.set(sessionId, 'headline');
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path === '/api/linkedin-editor/respond' && method === 'POST') {
    const payload = readRouteJson(route);
    const sessionId =
      typeof payload.session_id === 'string' && payload.session_id.length > 0
        ? payload.session_id
        : 'mock-linkedin-editor-session';
    const currentPhase = linkedinEditorState?.get(sessionId) ?? 'headline';
    const response =
      payload.response && typeof payload.response === 'object'
        ? (payload.response as Record<string, unknown>)
        : {};

    if (response.approved === true) {
      if (currentPhase === 'headline') {
        linkedinEditorState?.set(sessionId, 'about');
      } else {
        linkedinEditorState?.set(sessionId, 'complete');
      }
    }

    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (/^\/api\/job-finder\/[^/]+\/stream$/.test(path) && method === 'GET') {
    await route.fulfill(buildSSEStreamResponse([
      {
        event: 'stage_start',
        data: { stage: 'search', message: 'Building search strings from your Career Profile...' },
      },
      {
        event: 'search_progress',
        data: {
          message: 'Generated Boolean searches for LinkedIn and Indeed.',
          searches: MOCK_JOB_FINDER_SEARCHES,
        },
      },
      {
        event: 'results_ready',
        data: { matches: MOCK_JOB_FINDER_MATCHES },
      },
      {
        event: 'job_finder_complete',
        data: { session_id: 'mock-job-finder-session' },
      },
    ]));
    return;
  }

  if (path === '/api/job-search/scans/latest' && method === 'GET') {
    await route.fulfill(buildJsonResponse({ scan: null, results: [] }));
    return;
  }

  if (path === '/api/job-search' && method === 'POST') {
    await route.fulfill(buildJsonResponse({
      scan_id: 'mock-radar-scan',
      jobs: MOCK_RADAR_JOBS,
      sources_queried: ['LinkedIn', 'Indeed'],
      execution_time_ms: 420,
    }));
    return;
  }

  if (path === '/api/job-search/score' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ jobs: MOCK_RADAR_SCORE_RESULTS }));
    return;
  }

  if (path === '/api/job-finder/start' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path === '/api/job-finder/respond' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (/^\/api\/interview-prep\/[^/]+\/stream$/.test(path) && method === 'GET') {
    await route.fulfill(buildSSEStreamResponse([
      {
        event: 'stage_start',
        data: { stage: 'research', message: 'Pulling your resume, job details, and likely interview pressure points...' },
      },
      {
        event: 'section_progress',
        data: { section: 'top_story', status: 'writing' },
      },
      {
        event: 'report_complete',
        data: {
          report: MOCK_INTERVIEW_PREP_REPORT,
          quality_score: 89,
        },
      },
      {
        event: 'pipeline_complete',
        data: {},
      },
    ]));
    return;
  }

  if (path === '/api/interview-prep/start' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path === '/api/interview-prep/respond' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (/^\/api\/job-tracker\/[^/]+\/stream$/.test(path) && method === 'GET') {
    await route.fulfill(buildSSEStreamResponse([
      {
        event: 'stage_start',
        data: { stage: 'analysis', message: 'Reviewing your applications and scoring follow-up opportunities...' },
      },
      {
        event: 'application_analyzed',
        data: { company: 'Northstar SaaS', role: 'VP Operations', fit_score: 91 },
      },
      {
        event: 'application_analyzed',
        data: { company: 'ScaleCo', role: 'Chief of Staff, Operations', fit_score: 84 },
      },
      {
        event: 'follow_up_generated',
        data: { company: 'Northstar SaaS', role: 'VP Operations', follow_up_type: 'follow_up_email' },
      },
      {
        event: 'analytics_updated',
        data: { total: 2, average_fit: 88 },
      },
      {
        event: 'tracker_complete',
        data: {
          report: MOCK_JOB_TRACKER_REPORT,
          quality_score: 87,
          application_count: 2,
          follow_up_count: 1,
        },
      },
      {
        event: 'pipeline_complete',
        data: {},
      },
    ]));
    return;
  }

  if (path === '/api/job-tracker/start' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path === '/api/interview-debriefs' && method === 'GET') {
    await route.fulfill(buildJsonResponse({ debriefs: interviewDebriefState?.debriefs ?? [] }));
    return;
  }

  if (path === '/api/interview-debriefs' && method === 'POST') {
    const payload = readRouteJson(route);
    const now = new Date().toISOString();
    const created: MockInterviewDebrief = {
      id: `debrief-${Math.random().toString(36).slice(2, 10)}`,
      user_id: AUTH_SESSION.user.id,
      job_application_id:
        typeof payload.job_application_id === 'string' ? payload.job_application_id : undefined,
      company_name: typeof payload.company_name === 'string' ? payload.company_name : 'Unknown Company',
      role_title: typeof payload.role_title === 'string' ? payload.role_title : 'Unknown Role',
      interview_date:
        typeof payload.interview_date === 'string' ? payload.interview_date : new Date().toISOString().slice(0, 10),
      interview_type:
        payload.interview_type === 'phone' || payload.interview_type === 'video' || payload.interview_type === 'onsite'
          ? payload.interview_type
          : 'video',
      overall_impression:
        payload.overall_impression === 'positive' || payload.overall_impression === 'neutral' || payload.overall_impression === 'negative'
          ? payload.overall_impression
          : 'neutral',
      what_went_well: typeof payload.what_went_well === 'string' ? payload.what_went_well : '',
      what_went_poorly: typeof payload.what_went_poorly === 'string' ? payload.what_went_poorly : '',
      questions_asked: Array.isArray(payload.questions_asked)
        ? payload.questions_asked.filter((item): item is string => typeof item === 'string')
        : [],
      interviewer_notes: Array.isArray(payload.interviewer_notes)
        ? payload.interviewer_notes
            .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
            .map((item) => ({
              name: typeof item.name === 'string' ? item.name : '',
              title: typeof item.title === 'string' ? item.title : undefined,
              topics_discussed: Array.isArray(item.topics_discussed)
                ? item.topics_discussed.filter((topic): topic is string => typeof topic === 'string')
                : undefined,
              rapport_notes: typeof item.rapport_notes === 'string' ? item.rapport_notes : undefined,
            }))
        : [],
      company_signals: typeof payload.company_signals === 'string' ? payload.company_signals : '',
      follow_up_actions: typeof payload.follow_up_actions === 'string' ? payload.follow_up_actions : '',
      created_at: now,
      updated_at: now,
    };
    interviewDebriefState?.debriefs.unshift(created);
    await route.fulfill(buildJsonResponse(created));
    return;
  }

  const debriefItemMatch = path.match(/^\/api\/interview-debriefs\/([^/]+)$/);
  if (debriefItemMatch && method === 'PATCH') {
    const [, debriefId] = debriefItemMatch;
    const payload = readRouteJson(route);
    const existing = interviewDebriefState?.debriefs.find((debrief) => debrief.id === debriefId);
    if (!existing) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
      return;
    }
    Object.assign(existing, payload, { updated_at: new Date().toISOString() });
    await route.fulfill(buildJsonResponse(existing));
    return;
  }

  if (debriefItemMatch && method === 'DELETE') {
    const [, debriefId] = debriefItemMatch;
    if (interviewDebriefState) {
      interviewDebriefState.debriefs = interviewDebriefState.debriefs.filter((debrief) => debrief.id !== debriefId);
    }
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path === '/api/watchlist' && method === 'GET') {
    await route.fulfill(buildJsonResponse({ companies: watchlistState?.companies ?? [] }));
    return;
  }

  if (path === '/api/watchlist' && method === 'POST') {
    const payload = readRouteJson(route);
    const now = new Date().toISOString();
    const created: MockWatchlistCompany = {
      id: `watch-${Math.random().toString(36).slice(2, 10)}`,
      name: typeof payload.name === 'string' ? payload.name : 'New Company',
      industry: typeof payload.industry === 'string' ? payload.industry : null,
      website: typeof payload.website === 'string' ? payload.website : null,
      careers_url: typeof payload.careers_url === 'string' ? payload.careers_url : null,
      priority: typeof payload.priority === 'number' ? payload.priority : 3,
      source: typeof payload.source === 'string' ? payload.source : 'manual',
      notes: typeof payload.notes === 'string' ? payload.notes : null,
      created_at: now,
      updated_at: now,
    };
    watchlistState?.companies.unshift(created);
    await route.fulfill(buildJsonResponse(created));
    return;
  }

  const watchlistItemMatch = path.match(/^\/api\/watchlist\/([^/]+)$/);
  if (watchlistItemMatch && method === 'PATCH') {
    const [, companyId] = watchlistItemMatch;
    const payload = readRouteJson(route);
    const existing = watchlistState?.companies.find((company) => company.id === companyId);
    if (!existing) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
      return;
    }
    Object.assign(existing, {
      industry: typeof payload.industry === 'string' ? payload.industry : existing.industry,
      website: typeof payload.website === 'string' ? payload.website : existing.website,
      careers_url:
        typeof payload.careers_url === 'string' ? payload.careers_url : existing.careers_url,
      priority: typeof payload.priority === 'number' ? payload.priority : existing.priority,
      notes: typeof payload.notes === 'string' ? payload.notes : existing.notes,
      updated_at: new Date().toISOString(),
    });
    await route.fulfill(buildJsonResponse(existing));
    return;
  }

  if (watchlistItemMatch && method === 'DELETE') {
    const [, companyId] = watchlistItemMatch;
    if (watchlistState) {
      watchlistState.companies = watchlistState.companies.filter((company) => company.id !== companyId);
    }
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  const sessionReportMatch = path.match(/^\/api\/([^/]+)\/reports\/session\/([^/]+)$/);
  if (sessionReportMatch && method === 'GET') {
    const [, productSlug, sessionId] = sessionReportMatch;
    const report = (EXACT_REPORTS as Record<string, Record<string, unknown>>)[productSlug]?.[sessionId];
    if (report) {
      await route.fulfill(buildJsonResponse({ report }));
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No report found' }) });
    return;
  }

  const latestReportMatch = path.match(/^\/api\/([^/]+)\/reports\/latest$/);
  if (latestReportMatch && method === 'GET') {
    const [, productSlug] = latestReportMatch;
    const reportMap = (EXACT_REPORTS as Record<string, Record<string, unknown>>)[productSlug];
    const firstReport = reportMap ? Object.values(reportMap)[0] : null;
    if (firstReport) {
      await route.fulfill(buildJsonResponse({ report: firstReport }));
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No report found' }) });
    return;
  }

  if (path === '/api/coach/recommend' && method === 'GET') {
    await route.fulfill(buildJsonResponse({
      action: 'Open Resume Builder and reopen your TechCorp application first.',
      product: 'Resume Builder',
      room: 'resume',
      urgency: 'immediate',
      phase: 'active_search',
      phase_label: 'Active Job Search',
      rationale: 'Your strongest leverage is the active TechCorp process already in progress.',
    }));
    return;
  }

  if (path === '/api/coach/conversation' && method === 'GET') {
    await route.fulfill(buildJsonResponse({
      messages: [],
      mode: 'guided',
      turn_count: 0,
    }));
    return;
  }

  if (path === '/api/coach/message' && method === 'POST') {
    const body = route.request().postDataJSON() as { message?: string } | null;
    const prompt = typeof body?.message === 'string' ? body.message.trim() : '';
    const response = prompt.length > 0
      ? `You’re on the right track. Next, keep the focus on ${prompt.toLowerCase()} and tighten one concrete proof point.`
      : 'You’re on the right track. Tighten one concrete proof point next.';

    await route.fulfill(buildJsonResponse({
      response,
      turn_count: 1,
      usage: { input_tokens: 42, output_tokens: 24 },
      events: [],
    }));
    return;
  }

  if (path === '/api/coach/mode' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path.startsWith('/api/momentum') && method === 'GET') {
    await route.fulfill(buildJsonResponse({ summary: null, nudges: [] }));
    return;
  }

  if (path.startsWith('/api/content-posts')) {
    await route.fulfill(buildJsonResponse({ posts: [] }));
    return;
  }

  if (path.startsWith('/api/networking/contacts') || path.startsWith('/api/networking/follow-ups')) {
    await route.fulfill(buildJsonResponse({ contacts: [], touchpoints: [] }));
    return;
  }

  if (path.startsWith('/api/job-finder') || path.startsWith('/api/job-search') || path.startsWith('/api/job-tracker')) {
    await route.fulfill(buildJsonResponse({ jobs: [], results: [], matches: [] }));
    return;
  }

  if (/^\/api\/pipeline\/[^/]+\/result$/.test(path) && method === 'GET') {
    await route.fulfill(buildJsonResponse(MOCK_RESUME_V2_RESULT));
    return;
  }

  if (/^\/api\/pipeline\/[^/]+\/hiring-manager-review$/.test(path) && method === 'POST') {
    await route.fulfill(buildJsonResponse(MOCK_FINAL_REVIEW_RESULT));
    return;
  }

  if (/^\/api\/pipeline\/[^/]+\/draft-state$/.test(path) && method === 'PUT') {
    await route.fulfill(buildJsonResponse({ ok: true }));
    return;
  }

  if (path === '/api/pipeline/start' && method === 'POST') {
    await route.fulfill(buildJsonResponse({ session_id: 'mock-created-session' }));
    return;
  }

  await route.fulfill(buildJsonResponse({ ok: true }));
}

export async function mockWorkspaceApp(page: Page): Promise<void> {
  const linkedinContentState = new Map<string, LinkedInContentStage>();
  const linkedinEditorState = new Map<string, LinkedInEditorStage>();
  const watchlistState: WatchlistState = { companies: [] };
  const interviewDebriefState: InterviewDebriefState = { debriefs: [] };

  await page.addInitScript(({ session }) => {
    const serialized = JSON.stringify(session);
    const originalGetItem = Storage.prototype.getItem;

    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.includes('auth-token')) {
        return serialized;
      }
      return originalGetItem.call(this, key);
    };
  }, { session: AUTH_SESSION });

  await page.addInitScript(({ onboardingInitialStreamBody, onboardingCompletionStreamBody }) => {
    const originalFetch = window.fetch;
    const encoder = new TextEncoder();
    const onboardingControllers = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

    function extractRequestParts(input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      const method =
        init?.method
        ?? (input instanceof Request ? input.method : 'GET');

      const body =
        typeof init?.body === 'string'
          ? init.body
          : input instanceof Request
            ? null
            : null;

      return { url, method, body };
    }

    // @ts-expect-error test override
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const { url, method, body } = extractRequestParts(input, init);

      if (url.endsWith('/api/onboarding/respond') && method === 'POST') {
        let sessionId = 'mock-created-session';
        try {
          const payload = body ? JSON.parse(body) as { session_id?: string } : {};
          if (typeof payload.session_id === 'string' && payload.session_id.length > 0) {
            sessionId = payload.session_id;
          }
        } catch {
          // Ignore malformed test payloads and fall back to the default session id.
        }

        const controller = onboardingControllers.get(sessionId);
        if (controller) {
          controller.enqueue(encoder.encode(onboardingCompletionStreamBody));
          controller.close();
          onboardingControllers.delete(sessionId);
        }

        return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      if (/\/api\/onboarding\/[^/]+\/stream$/.test(url)) {
        const sessionId = url.match(/\/api\/onboarding\/([^/]+)\/stream$/)?.[1] ?? 'mock-created-session';
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            onboardingControllers.set(sessionId, controller);
            controller.enqueue(encoder.encode(onboardingInitialStreamBody));
            // Keep the stream open after questions_ready so the UI stays in
            // awaiting_responses until the test submits the answers.
          },
        });

        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      return originalFetch.apply(window, [input, init] as Parameters<typeof fetch>);
    };
  }, {
    onboardingInitialStreamBody: buildSSEBody([
      {
        event: 'stage_start',
        data: { stage: 'question_generation', message: 'Generating your next best questions...' },
      },
      {
        event: 'questions_ready',
        data: { questions: MOCK_ONBOARDING_QUESTIONS },
      },
    ]),
    onboardingCompletionStreamBody: buildSSEBody([
      {
        event: 'stage_start',
        data: { stage: 'evaluation', message: 'Turning your answers into a stronger shared profile...' },
      },
      {
        event: 'assessment_complete',
        data: {
          profile: MOCK_ONBOARDING_PROFILE,
          summary: MOCK_ONBOARDING_SUMMARY,
        },
      },
      {
        event: 'pipeline_complete',
        data: {},
      },
    ]),
  });

  await page.addInitScript(({ initialStreamBody, completionStreamBody }) => {
    const originalFetch = window.fetch;
    const encoder = new TextEncoder();
    const mockInterviewControllers = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

    function extractRequestParts(input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      const method =
        init?.method
        ?? (input instanceof Request ? input.method : 'GET');

      const body =
        typeof init?.body === 'string'
          ? init.body
          : input instanceof Request
            ? null
            : null;

      return { url, method, body };
    }

    // @ts-expect-error test override
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const { url, method, body } = extractRequestParts(input, init);

      if (url.endsWith('/api/mock-interview/start') && method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      if (/\/api\/mock-interview\/[^/]+\/stream$/.test(url)) {
        const sessionId =
          url.match(/\/api\/mock-interview\/([^/]+)\/stream$/)?.[1] ?? 'mock-interview-session';
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            mockInterviewControllers.set(sessionId, controller);
            controller.enqueue(encoder.encode(initialStreamBody));
            // Keep the stream open until the answer is submitted.
          },
        });

        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }));
      }

      if (url.endsWith('/api/mock-interview/respond') && method === 'POST') {
        let sessionId = 'mock-interview-session';
        try {
          const payload = body ? JSON.parse(body) as { session_id?: string } : {};
          if (typeof payload.session_id === 'string' && payload.session_id.length > 0) {
            sessionId = payload.session_id;
          }
        } catch {
          // Ignore malformed payloads and use the default id.
        }

        const controller = mockInterviewControllers.get(sessionId);
        if (controller) {
          controller.enqueue(encoder.encode(completionStreamBody));
          controller.close();
          mockInterviewControllers.delete(sessionId);
        }

        return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      return originalFetch.apply(window, [input, init] as Parameters<typeof fetch>);
    };
  }, {
    initialStreamBody: buildSSEBody([
      {
        event: 'stage_start',
        data: { stage: 'setup', message: 'Reviewing your resume and preparing the first question...' },
      },
      {
        event: 'question_presented',
        data: {
          question: {
            index: 0,
            type: 'behavioral',
            question: 'Tell me about a time you had to align multiple leaders around one operating cadence.',
            context: 'Use a concrete example with scope, ownership, and business impact.',
          },
        },
      },
    ]),
    completionStreamBody: buildSSEBody([
      {
        event: 'answer_evaluated',
        data: {
          evaluation: {
            question_index: 0,
            question_type: 'behavioral',
            question: 'Tell me about a time you had to align multiple leaders around one operating cadence.',
            answer: 'I aligned product, support, and operations leaders around one weekly operating rhythm.',
            scores: {
              star_completeness: 86,
              relevance: 88,
              impact: 82,
              specificity: 84,
            },
            overall_score: 85,
            strengths: ['Shows executive alignment and ownership clearly.'],
            improvements: ['Add one metric or scope signal to strengthen business impact.'],
            model_answer_hint: 'Name the team scope and the business result to make the answer stronger.',
          },
        },
      },
      {
        event: 'simulation_complete',
        data: {
          summary: {
            overall_score: 85,
            total_questions: 1,
            strengths: ['Clear ownership and cross-functional leadership.'],
            areas_for_improvement: ['Add a measurable outcome or scale detail.'],
            recommendation: 'Strong foundation. Add one metric and keep this as a core interview story.',
          },
        },
      },
      {
        event: 'pipeline_complete',
        data: {},
      },
    ]),
  });

  const fulfillSupabaseRoute = async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/v1/user')) {
      await route.fulfill(buildJsonResponse(AUTH_SESSION.user));
      return;
    }

    if (url.includes('/auth/v1/token')) {
      await route.fulfill(buildJsonResponse(AUTH_SESSION));
      return;
    }

    if (url.includes('/auth/v1/')) {
      await route.fulfill(buildJsonResponse({}));
      return;
    }

    if (method === 'GET' && url.includes('/rest/v1/job_applications')) {
      const acceptHeader = route.request().headers().accept ?? '';
      const expectsObject = acceptHeader.includes('application/vnd.pgrst.object+json');
      await route.fulfill(buildJsonResponse(expectsObject ? MOCK_JOB_APPLICATION_ROWS[0] : MOCK_JOB_APPLICATION_ROWS));
      return;
    }

    if (method === 'GET' && url.includes('/rest/v1/master_resumes')) {
      await route.fulfill(buildJsonResponse({ raw_text: MOCK_MASTER_RESUME_RAW_TEXT }));
      return;
    }

    if (method === 'GET' && url.includes('/rest/v1/coach_sessions')) {
      await route.fulfill(buildJsonResponse([]));
      return;
    }

    if (url.includes('/rest/v1/')) {
      await route.fulfill(buildJsonResponse([]));
      return;
    }

    await route.continue();
  };

  await page.route('**/supabase.co/**', fulfillSupabaseRoute);
  await page.route('**/mock-supabase/**', fulfillSupabaseRoute);

  await page.route('**/api/**', (route) =>
    fulfillApiRoute(
      route,
      linkedinContentState,
      linkedinEditorState,
      watchlistState,
      interviewDebriefState,
    ),
  );
}
