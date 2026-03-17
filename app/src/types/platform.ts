export type ProductStatus = 'active' | 'coming_soon' | 'beta';

export type ProductCategory =
  | 'career'
  | 'networking'
  | 'interview'
  | 'intelligence'
  | 'writing'
  | 'planning'
  | 'financial';

export interface ProductFeature {
  title: string;
  description: string;
}

export interface ProductDefinition {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  icon: string;
  status: ProductStatus;
  route: string;
  category: ProductCategory;
  features: ProductFeature[];
  ctaLabel: string;
  externalUrl?: string;
}

export const PRODUCT_CATALOG: ProductDefinition[] = [
  // ─── YOUR FOUNDATION ───
  {
    id: 'onboarding-assessment',
    slug: 'onboarding',
    name: 'Career Profile',
    shortDescription: 'Review & update your career profile, strengths, and goals',
    longDescription:
      'A structured intake assessment that surfaces your professional strengths, career goals, and financial context through carefully designed questions. Builds a confidential client profile that personalizes every tool in the platform to your unique situation.',
    icon: '🎯',
    status: 'active',
    route: '/workspace?room=career-profile',
    category: 'career',
    features: [
      {
        title: 'Intelligent Question Design',
        description:
          'Adaptive assessment questions that surface your strengths, priorities, and career stage without feeling like a form.',
      },
      {
        title: 'Financial Segment Detection',
        description:
          'Infers your financial context from indirect signals — no intrusive questions — so recommendations are grounded in your real constraints.',
      },
      {
        title: 'Client Profile Construction',
        description:
          'Builds a persistent profile that every platform tool reads from, ensuring consistent, personalized guidance across your entire search.',
      },
      {
        title: 'Career Direction Clarity',
        description:
          'Identifies your target role type, preferred industries, and non-negotiables to focus your search on roles where you are genuinely competitive.',
      },
    ],
    ctaLabel: 'Open Career Profile',
  },
  {
    id: 'resume-strategist',
    slug: 'resume',
    name: 'Resume Builder',
    shortDescription: 'AI-powered resume tailored to every job you apply for',
    longDescription:
      'Three AI agents collaborate to transform your resume into a strategic positioning document. The Strategist researches your market and identifies competitive advantages. The Craftsman writes each section with your authentic voice. The Producer ensures ATS compliance across 5 major systems.',
    icon: '\u{1F4C4}',
    status: 'active',
    route: '/workspace?room=resume',
    category: 'career',
    features: [
      {
        title: 'Executive Positioning',
        description:
          'Benchmark analysis identifies the ideal candidate profile, then positions you as the standard others are measured against.',
      },
      {
        title: 'Guided Evidence Capture',
        description:
          'Dynamic interview surfaces the 99% of your experience that never makes it onto a resume.',
      },
      {
        title: 'ATS Compliance',
        description:
          'Verified against 5 major applicant tracking systems so your resume reaches human reviewers.',
      },
      {
        title: 'Authentic Voice',
        description:
          'Your real language and accomplishments, strategically positioned — never fabricated or inflated.',
      },
    ],
    ctaLabel: 'Open Resume Builder',
  },
  {
    id: 'cover-letter',
    slug: 'cover-letter',
    name: 'Cover Letter Writer',
    shortDescription: 'Targeted cover letters that complement your resume strategy',
    longDescription:
      'Generates a tailored cover letter that reinforces your resume positioning. Leverages your existing strategy, evidence, and career narrative so you never start from scratch.',
    icon: '\u2709\uFE0F',
    status: 'active',
    route: '/cover-letter',
    category: 'writing',
    features: [
      {
        title: 'Strategy Continuity',
        description:
          'Automatically inherits your positioning strategy and evidence from the Resume Strategist.',
      },
      {
        title: 'Company-Specific Hooks',
        description:
          'Researches company culture cues from the JD to craft a compelling opening.',
      },
      {
        title: 'Requirement Mapping',
        description:
          'Maps your strongest evidence to each key requirement for maximum relevance.',
      },
      {
        title: 'Self-Review Quality Gate',
        description:
          'AI quality review catches generic phrasing, unsupported claims, and tonal mismatches before you send.',
      },
    ],
    ctaLabel: 'Write Cover Letter',
  },

  // ─── LINKEDIN & BRAND ───
  {
    id: 'linkedin-studio',
    slug: 'linkedin',
    name: 'LinkedIn Studio',
    shortDescription: 'Profile optimization, content creation, and posting calendar',
    longDescription:
      'Your complete LinkedIn command center. Optimize your headline, summary, and experience sections for recruiter visibility. Generate thought-leadership posts from your real expertise. Plan a 30-day content calendar aligned to your positioning strategy.',
    icon: '\u{1F4BC}',
    status: 'active',
    route: '/workspace?room=linkedin',
    category: 'career',
    features: [
      {
        title: 'Profile Optimization',
        description:
          'Rewrites your headline, About, and experience sections to align with your resume positioning and maximize recruiter search visibility.',
      },
      {
        title: 'Content Creation',
        description:
          'Generates high-impact LinkedIn posts that position you as a thought leader — derived from your real expertise, not recycled advice.',
      },
      {
        title: 'Content Calendar',
        description:
          'A personalized 30-day posting plan with hooks, full body copy, CTAs, and optimized hashtags — ready to copy and publish.',
      },
      {
        title: 'Keyword Integration',
        description:
          'Weaves recruiter search terms naturally throughout your profile and content to maximize visibility without keyword stuffing.',
      },
    ],
    ctaLabel: 'Open LinkedIn Studio',
  },
  {
    id: 'executive-documents',
    slug: 'executive-bio',
    name: 'Executive Documents',
    shortDescription: 'Professional bios and consulting-grade case studies',
    longDescription:
      'Generate polished executive biographies for speaking engagements, board profiles, and media kits — plus structured case studies that turn your biggest career wins into publication-ready narratives with quantified outcomes.',
    icon: '\u{1F4DD}',
    status: 'active',
    route: '/workspace?room=executive-bio',
    category: 'writing',
    features: [
      {
        title: 'Executive Bios',
        description:
          'Tweet-length, paragraph, and full-page bios generated simultaneously — board, media, speaking, and investor variants.',
      },
      {
        title: 'Case Studies',
        description:
          'Structured Problem-Action-Result narratives with quantified outcomes, ready for portfolios and proposals.',
      },
      {
        title: 'Positioning-Consistent',
        description:
          'Voice and positioning align with your resume strategy — no conflicting narratives across documents.',
      },
      {
        title: 'Multiple Formats',
        description:
          'One-page PDF, slide-ready summary, and paragraph format for proposal sections and presentations.',
      },
    ],
    ctaLabel: 'Create Documents',
  },

  // ─── JOB SEARCH & NETWORKING ───
  {
    id: 'job-command-center',
    slug: 'jobs',
    name: 'Job Command Center',
    shortDescription: 'Search, match, pipeline, and daily momentum tracking',
    longDescription:
      'Central hub for your active job search. Track applications through every pipeline stage, surface AI-matched job opportunities, monitor your search velocity, and get coaching nudges to keep momentum.',
    icon: '\u{1F50D}',
    status: 'active',
    route: '/workspace?room=jobs',
    category: 'career',
    features: [
      {
        title: 'Pipeline Kanban',
        description:
          'Drag-and-drop application tracking from Research through Offer — with stage-specific action prompts.',
      },
      {
        title: 'AI Job Matching',
        description:
          'Surfaces roles that match your positioning profile, not just keyword searches.',
      },
      {
        title: 'Momentum Tracking',
        description:
          'Weekly velocity scores, activity logging, and coaching nudges that flag when your search pace is dropping.',
      },
      {
        title: 'Cross-Tool Integration',
        description:
          'Automatically links resume sessions, cover letters, and interview prep to each application.',
      },
    ],
    ctaLabel: 'Open Command Center',
  },
  {
    id: 'smart-referrals',
    slug: 'networking',
    name: 'Smart Referrals',
    shortDescription: 'Import connections, find jobs at their companies, referral bonuses, and AI outreach',
    longDescription:
      'Upload your LinkedIn connections and we map open positions to companies where you have existing contacts. Surface referral bonus opportunities, generate personalized outreach sequences, and track your networking across every target company.',
    icon: '\u{1F310}',
    status: 'active',
    route: '/workspace?room=networking',
    category: 'networking',
    features: [
      {
        title: 'Connection Import & Mapping',
        description:
          'Imports your full LinkedIn network and organizes contacts by company for fast referral discovery.',
      },
      {
        title: 'Referral Opportunities',
        description:
          'Cross-references your connections with companies offering referral bonuses — mutual benefit outreach built in.',
      },
      {
        title: 'AI Outreach Sequences',
        description:
          'Personalized multi-message sequences for hiring managers, team leads, peers, and recruiters using the Rule of Four.',
      },
      {
        title: 'Career Page Scanner',
        description:
          'Scrapes target company career pages and matches open roles against your positioning profile.',
      },
    ],
    ctaLabel: 'Open Smart Referrals',
  },
  {
    id: 'job-applier',
    slug: 'job-applier',
    name: 'Job Applier',
    shortDescription: 'Chrome extension that auto-fills job applications with your tailored resume',
    longDescription:
      'A Chrome extension that detects when you are on a job application page and auto-fills the form using your Workspace-tailored resume. Supports Greenhouse, Lever, LinkedIn Easy Apply, Workday, Indeed, and iCIMS.',
    icon: '\u{1F680}',
    status: 'active',
    route: '/tools/job-applier',
    category: 'career',
    externalUrl: 'https://chromewebstore.google.com',
    features: [
      {
        title: '6 ATS Platforms',
        description:
          'Auto-fills applications on Greenhouse, Lever, LinkedIn Easy Apply, Workday, Indeed, and iCIMS.',
      },
      {
        title: '4-Tier Field Detection',
        description:
          'ATS-specific selectors, label matching, attribute matching, and AI inference work together so every field gets filled.',
      },
      {
        title: 'Resume PDF Upload',
        description:
          'Automatically uploads your tailored resume PDF to file input fields — no manual download and re-upload required.',
      },
      {
        title: 'Tailored Per Job',
        description:
          'Pulls the resume tailored for this specific job from Workspace, not a generic master resume.',
      },
    ],
    ctaLabel: 'Get Chrome Extension',
  },

  // ─── INTERVIEW & OFFERS ───
  {
    id: 'interview-lab',
    slug: 'interview',
    name: 'Interview Lab',
    shortDescription: 'Prep, practice, debrief, and follow-up all in one place',
    longDescription:
      'Your complete interview command center. Prepare with JD-driven question banks, practice in realistic mock interviews with AI feedback, debrief immediately after real interviews, and generate personalized thank-you notes — all in one place.',
    icon: '\u{1F3AF}',
    status: 'active',
    route: '/workspace?room=interview',
    category: 'interview',
    features: [
      {
        title: 'Interview Prep',
        description:
          'JD-driven question generation with evidence-backed STAR-format answer coaching from your real accomplishments.',
      },
      {
        title: 'Mock Interviews',
        description:
          'Realistic practice sessions with real-time scoring on specificity, structure, and evidence quality.',
      },
      {
        title: 'Post-Interview Debrief',
        description:
          'Structured analysis of what went well, missed opportunities, and targeted prep for the next round.',
      },
      {
        title: 'Thank You Notes',
        description:
          'Personalized follow-up notes for every interviewer that reinforce your key differentiators.',
      },
    ],
    ctaLabel: 'Open Interview Lab',
  },
  {
    id: 'salary-negotiation',
    slug: 'salary-negotiation',
    name: 'Salary & Negotiation',
    shortDescription: 'Market benchmarks, negotiation scripts, and total-comp strategy',
    longDescription:
      'Builds a data-backed negotiation strategy from your offer, market data, and positioning. Generates word-for-word scripts, leverage points, and compensation tradeoff guidance so you walk in fully prepared.',
    icon: '\u{1F4B0}',
    status: 'active',
    route: '/workspace?room=salary-negotiation',
    category: 'planning',
    features: [
      {
        title: 'Market Benchmarking',
        description:
          'Compares your offer against live comp data for your role, seniority, and geography.',
      },
      {
        title: 'Negotiation Scripts',
        description:
          'Word-for-word language for countering, anchoring high, and navigating silence without caving.',
      },
      {
        title: 'Scenario Planning',
        description:
          'Prepare for likely employer responses, tradeoffs, and fallback positions before the conversation starts.',
      },
      {
        title: 'Total Comp Analysis',
        description:
          'Beyond base: equity, bonus, PTO, signing bonus, and benefits valued in a single comparable number.',
      },
    ],
    ctaLabel: 'Build Negotiation Strategy',
  },
  {
    id: 'financial-wellness',
    slug: 'financial',
    name: 'Financial Wellness',
    shortDescription: 'Retirement readiness assessment and fiduciary planner matching',
    longDescription:
      'A seven-dimension retirement readiness assessment that evaluates your financial, health, social, and psychological preparedness. Provides fiduciary-grade guidance and matches you with qualified financial planners for a warm, documented handoff.',
    icon: '🏦',
    status: 'active',
    route: '/workspace?room=financial',
    category: 'financial',
    features: [
      {
        title: '7-Dimension Assessment',
        description:
          'Evaluates financial security, healthcare readiness, social capital, purpose, cognitive health, housing stability, and legal preparedness.',
      },
      {
        title: 'Financial Wellness Scoring',
        description:
          'Produces a composite readiness score across all dimensions with specific, actionable recommendations for each gap.',
      },
      {
        title: 'Planner Matching & Handoff',
        description:
          'Qualifies and matches you with fiduciary-certified financial planners, then generates a detailed handoff document so session one goes straight to strategy.',
      },
      {
        title: 'Fiduciary Guardrails',
        description:
          'All guidance is bounded by strict fiduciary standards — no product recommendations, no commission-driven advice.',
      },
    ],
    ctaLabel: 'Assess My Readiness',
  },
];
