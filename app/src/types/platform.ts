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
}

export const PRODUCT_CATALOG: ProductDefinition[] = [
  // --- Career ---
  {
    id: 'resume-strategist',
    slug: 'resume',
    name: 'Resume Strategist',
    shortDescription: 'AI-powered resume positioning for executive roles',
    longDescription:
      'Three AI agents collaborate to transform your resume into a strategic positioning document. The Strategist researches your market and identifies competitive advantages. The Craftsman writes each section with your authentic voice. The Producer ensures ATS compliance across 5 major systems.',
    icon: '\u{1F4C4}',
    status: 'active',
    route: '/app',
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
    ctaLabel: 'Start New Session',
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
  {
    id: 'interview-prep',
    slug: 'interview-prep',
    name: 'Interview Prep Coach',
    shortDescription: 'Practice answers using your real experience and positioning',
    longDescription:
      'Prepares you for interviews by generating likely questions from the JD, then coaching you through STAR-format answers drawn from your verified evidence library.',
    icon: '\u{1F3AF}',
    status: 'active',
    route: '/tools/interview-prep',
    category: 'interview',
    features: [
      {
        title: 'JD-Driven Questions',
        description:
          'Generates interview questions based on the specific role requirements and company context.',
      },
      {
        title: 'Evidence-Backed Answers',
        description:
          'Coaches you to structure answers using real accomplishments from your evidence library.',
      },
      {
        title: 'Behavioral & Technical',
        description:
          'Covers behavioral, situational, and role-specific technical questions for complete preparation.',
      },
      {
        title: 'Confidence Scoring',
        description:
          'Rates your answer strength and suggests improvements before the real interview.',
      },
    ],
    ctaLabel: 'Start Practice Session',
  },
  {
    id: 'linkedin-optimizer',
    slug: 'linkedin',
    name: 'LinkedIn Optimizer',
    shortDescription: 'Align your LinkedIn profile with your resume positioning',
    longDescription:
      'Optimizes your LinkedIn headline, summary, and experience sections to align with your resume positioning strategy, maximizing recruiter visibility and inbound opportunities.',
    icon: '\u{1F4BC}',
    status: 'active',
    route: '/career-iq',
    category: 'career',
    features: [
      {
        title: 'Headline Optimization',
        description:
          'Crafts a keyword-rich headline that signals your target role and unique value proposition.',
      },
      {
        title: 'Summary Alignment',
        description:
          'Writes an About section that reinforces your resume positioning without duplicating it.',
      },
      {
        title: 'Experience Consistency',
        description:
          'Ensures your LinkedIn experience entries complement rather than contradict your resume.',
      },
      {
        title: 'Keyword Coverage',
        description:
          'Identifies high-value search terms recruiters use and weaves them naturally into your profile.',
      },
    ],
    ctaLabel: 'Optimize Profile',
  },
  {
    id: 'content-calendar',
    slug: 'content-calendar',
    name: 'Content Calendar',
    shortDescription: '30-day LinkedIn posting plan based on your expertise',
    longDescription:
      'Generates a personalized 30-day LinkedIn content calendar from your resume and positioning strategy. Each post includes a hook, full body, CTA, and hashtags — ready to copy and publish.',
    icon: '\u{1F4C5}',
    status: 'active',
    route: '/career-iq',
    category: 'writing',
    features: [
      {
        title: 'Position-Aligned Themes',
        description:
          'Content themes are derived from your benchmark profile and target role, not generic advice.',
      },
      {
        title: '7 Content Types',
        description:
          'Thought leadership, storytelling, how-to, case studies, industry insight, and more.',
      },
      {
        title: 'Copy-Ready Posts',
        description:
          'Full post body with hook, content, CTA, and optimized hashtags — no editing required.',
      },
      {
        title: 'Quality Scoring',
        description:
          'Each post is rated for resonance, specificity, and positioning alignment before delivery.',
      },
    ],
    ctaLabel: 'Generate Calendar',
  },
  {
    id: 'job-command-center',
    slug: 'jobs',
    name: 'Job Command Center',
    shortDescription: 'Track, search, and manage your full job pipeline',
    longDescription:
      'Central hub for your active job search. Track applications through every pipeline stage, surface AI-matched job opportunities, and get coaching nudges to keep momentum.',
    icon: '\u{1F50D}',
    status: 'active',
    route: '/career-iq',
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
        title: 'Momentum Alerts',
        description:
          'Flags applications that have gone cold and recommends next steps to re-engage.',
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
    id: 'networking-hub',
    slug: 'networking',
    name: 'Networking Hub',
    shortDescription: 'AI-generated outreach sequences for every target contact',
    longDescription:
      'Apply the Rule of Four: reach out to four people at every target company before the interview starts. AI writes personalized LinkedIn outreach sequences so warm referrals replace cold applications.',
    icon: '\u{1F91D}',
    status: 'active',
    route: '/career-iq',
    category: 'networking',
    features: [
      {
        title: 'AI Outreach Generator',
        description:
          'Personalized multi-message sequences for hiring managers, team leads, peers, and recruiters.',
      },
      {
        title: 'Rule of Four Tracker',
        description:
          'For each application, track outreach progress across the four key contact roles.',
      },
      {
        title: 'Template Library',
        description:
          'Proven templates for warm introductions, direct outreach, follow-ups, and recruiter intros.',
      },
      {
        title: 'Recruiter CRM',
        description:
          'Track executive recruiters working in your space — keep them warm across your search.',
      },
    ],
    ctaLabel: 'Open Networking Hub',
  },
  // --- Planning ---
  {
    id: 'salary-negotiation',
    slug: 'salary-negotiation',
    name: 'Salary Negotiation',
    shortDescription: 'Script and strategy for every negotiation scenario',
    longDescription:
      'Builds a data-backed negotiation strategy from your offer, market data, and positioning. Generates word-for-word scripts for the initial counter, silence management, and multi-offer navigation.',
    icon: '\u{1F4B0}',
    status: 'active',
    route: '/career-iq',
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
        title: 'Total Comp Analysis',
        description:
          'Beyond base: equity, bonus, PTO, signing bonus, and benefits valued in a single comparable number.',
      },
      {
        title: 'Scenario Planner',
        description:
          'Pre-plans responses to every counter-offer scenario so you are never caught off guard.',
      },
    ],
    ctaLabel: 'Build Negotiation Strategy',
  },
  {
    id: '90-day-plan',
    slug: '90-day-plan',
    name: '90-Day Plan Generator',
    shortDescription: 'Structured first-90-days plan tailored to your new role',
    longDescription:
      'Generates a role-specific 30-60-90 day plan that demonstrates strategic thinking in interviews and accelerates onboarding after you land the job. Built from the JD, company context, and your positioning.',
    icon: '\u{1F5FA}\uFE0F',
    status: 'active',
    route: '/career-iq',
    category: 'planning',
    features: [
      {
        title: 'JD-Aligned Priorities',
        description:
          'Plan milestones map directly to the role\'s stated success criteria and stakeholder expectations.',
      },
      {
        title: 'Interview-Ready Format',
        description:
          'Structured for use as a leave-behind or final-round presentation — shows strategic thinking.',
      },
      {
        title: 'Three-Phase Structure',
        description:
          'Listen & learn (days 1-30), assess & align (days 31-60), lead & execute (days 61-90).',
      },
      {
        title: 'Quick Wins Identification',
        description:
          'Surfaces early wins that build credibility before tackling the longer transformation agenda.',
      },
    ],
    ctaLabel: 'Generate 90-Day Plan',
  },
  // --- Writing ---
  {
    id: 'executive-bio',
    slug: 'executive-bio',
    name: 'Executive Bio Generator',
    shortDescription: 'Polished executive bios for speaking, boards, and press',
    longDescription:
      'Generates a versatile executive biography from your resume and positioning strategy. Produces short, medium, and long versions for conference programs, board profiles, media kits, and LinkedIn.',
    icon: '\u{1F4DD}',
    status: 'active',
    route: '/career-iq',
    category: 'writing',
    features: [
      {
        title: 'Three-Length Versions',
        description:
          'Tweet-length, paragraph, and full-page bios generated simultaneously from one input.',
      },
      {
        title: 'Positioning-Consistent',
        description:
          'Voice and positioning align with your resume strategy — no conflicting narratives.',
      },
      {
        title: 'Audience Variants',
        description:
          'Generates board, media, speaking, and investor-audience variants from a single run.',
      },
      {
        title: 'Third-Person Voice',
        description:
          'Authoritative third-person narrative with your authentic accomplishments, no puffery.',
      },
    ],
    ctaLabel: 'Generate Executive Bio',
  },
  {
    id: 'case-study-generator',
    slug: 'case-study',
    name: 'Case Study Generator',
    shortDescription: 'Structured case studies from your biggest career wins',
    longDescription:
      'Turns your raw accomplishments into publication-ready case studies. Structures each win in the Problem-Action-Result format with quantified outcomes, ready for portfolios, proposals, and board presentations.',
    icon: '\u{1F4CA}',
    status: 'active',
    route: '/career-iq',
    category: 'writing',
    features: [
      {
        title: 'Problem-Action-Result Framework',
        description:
          'Structured narrative that makes every win credible and instantly understandable.',
      },
      {
        title: 'Quantified Outcomes',
        description:
          'Guides you to surface the metrics that make the impact concrete and compelling.',
      },
      {
        title: 'Multiple Formats',
        description:
          'Outputs one-page PDF, slide-ready summary, and paragraph for proposal sections.',
      },
      {
        title: 'Portfolio Integration',
        description:
          'Case studies link to your master evidence library for reuse across applications.',
      },
    ],
    ctaLabel: 'Create Case Study',
  },
  {
    id: 'thank-you-note',
    slug: 'thank-you-note',
    name: 'Thank You Note Writer',
    shortDescription: 'Post-interview thank you notes that reinforce your candidacy',
    longDescription:
      'Generates personalized thank you notes for every interviewer within minutes of a conversation. Ties each note to a specific insight from the conversation, reinforcing your key differentiators.',
    icon: '\u{1F48C}',
    status: 'active',
    route: '/career-iq',
    category: 'writing',
    features: [
      {
        title: 'Conversation-Specific',
        description:
          'References real discussion points from your interview so each note feels personal, not templated.',
      },
      {
        title: 'Differentiator Reinforcement',
        description:
          'Subtly reiterates your top 1-2 positioning points without being repetitive or sycophantic.',
      },
      {
        title: 'Tone Matching',
        description:
          'Adjusts formality for the audience — VP vs. HR vs. peer — in the same generation run.',
      },
      {
        title: 'Same-Day Delivery',
        description:
          'Fast enough to send within hours of the interview while the conversation is still fresh.',
      },
    ],
    ctaLabel: 'Write Thank You Note',
  },
  // --- Intelligence ---
  {
    id: 'personal-brand-audit',
    slug: 'personal-brand-audit',
    name: 'Personal Brand Audit',
    shortDescription: 'Audit and align your online presence with your positioning',
    longDescription:
      'Analyzes your digital footprint against your target positioning — resume, LinkedIn, bio, and public profiles — and identifies gaps, contradictions, and quick wins to strengthen your executive brand.',
    icon: '\u{1F50E}',
    status: 'active',
    route: '/career-iq',
    category: 'intelligence',
    features: [
      {
        title: 'Cross-Platform Consistency',
        description:
          'Checks for contradictions across LinkedIn, resume, bio, and other visible profiles.',
      },
      {
        title: 'Positioning Gap Analysis',
        description:
          'Identifies where your public presence diverges from your intended positioning strategy.',
      },
      {
        title: 'Quick Win Prioritization',
        description:
          'Ranks improvements by impact so you fix the most visible gaps first.',
      },
      {
        title: 'Searchability Score',
        description:
          'Rates how easily target employers can find and recognize you for the roles you want.',
      },
    ],
    ctaLabel: 'Audit My Brand',
  },
  {
    id: 'network-intelligence',
    slug: 'network-intelligence',
    name: 'Network Intelligence',
    shortDescription: 'Find warm referral paths into every target company',
    longDescription:
      'Upload your LinkedIn connections and we map open positions to companies where you have existing contacts. Surface job matches, identify warm referral paths, and prioritize applications where your network gives you an inside track.',
    icon: '\u{1F310}',
    status: 'active',
    route: '/career-iq',
    category: 'intelligence',
    features: [
      {
        title: 'Connection Mapping',
        description:
          'Imports your full LinkedIn network and organizes contacts by company for fast referral discovery.',
      },
      {
        title: 'Job Match Surfacing',
        description:
          'Identifies open positions at companies where you have first- or second-degree connections.',
      },
      {
        title: 'Referral Path Scoring',
        description:
          'Ranks target companies by connection strength so you focus energy where it will have the most impact.',
      },
      {
        title: 'Target Title Tracking',
        description:
          'Set your target roles once and continuously surface matching positions across your network.',
      },
    ],
    ctaLabel: 'Map My Network',
  },
  // --- Onboarding ---
  {
    id: 'onboarding-assessment',
    slug: 'onboarding',
    name: 'Onboarding Assessment',
    shortDescription: 'Personalized career assessment that maps your strengths and financial context',
    longDescription:
      'A structured intake assessment that surfaces your professional strengths, career goals, and financial context through carefully designed questions. Builds a confidential client profile that personalizes every tool in the platform to your unique situation.',
    icon: '🎯',
    status: 'active',
    route: '/onboarding',
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
    ctaLabel: 'Start Assessment',
  },
  // --- Interview ---
  {
    id: 'mock-interview',
    slug: 'mock-interview',
    name: 'Mock Interview',
    shortDescription: 'Practice real interviews with AI-powered feedback and scoring',
    longDescription:
      'Simulates realistic interview scenarios using role-specific questions drawn from the JD and company context. The AI plays a calibrated interviewer and coaches you through stronger STAR-format answers after each response.',
    icon: '🎤',
    status: 'active',
    route: '/career-iq',
    category: 'interview',
    features: [
      {
        title: 'Role-Specific Question Sets',
        description:
          'Questions are generated from the actual job description and company intelligence, not generic interview banks.',
      },
      {
        title: 'Real-Time Answer Feedback',
        description:
          'Immediate scoring on specificity, structure, and evidence quality after each response, with targeted suggestions.',
      },
      {
        title: 'STAR Framework Coaching',
        description:
          'Guides you to build complete Situation-Task-Action-Result answers using real accomplishments from your evidence library.',
      },
      {
        title: 'Confidence Scoring',
        description:
          'Rates your overall readiness for the real interview and tracks improvement across practice sessions.',
      },
    ],
    ctaLabel: 'Begin Practice',
  },
  // --- Writing ---
  {
    id: 'linkedin-content',
    slug: 'linkedin-content',
    name: 'LinkedIn Content Writer',
    shortDescription: 'Individual LinkedIn posts crafted from your expertise and positioning',
    longDescription:
      'Generates high-impact individual LinkedIn posts that position you as a thought leader in your field. Each post is derived from your real expertise and aligned to your strategic positioning — not recycled career advice.',
    icon: '✍️',
    status: 'active',
    route: '/career-iq',
    category: 'writing',
    features: [
      {
        title: 'Thought Leadership Angles',
        description:
          'Surfaces insights from your own experience and translates them into posts that demonstrate genuine expertise.',
      },
      {
        title: 'Engagement Hook Engineering',
        description:
          'Opens with a proven hook structure that stops the scroll and earns the read without clickbait tactics.',
      },
      {
        title: 'Positioning Alignment',
        description:
          'Every post reinforces your target role positioning so your content and your resume tell the same story.',
      },
      {
        title: 'Hashtag Optimization',
        description:
          'Selects hashtags based on reach data for your specific niche — not the most popular tags, the most relevant ones.',
      },
    ],
    ctaLabel: 'Write a Post',
  },
  {
    id: 'linkedin-editor',
    slug: 'linkedin-editor',
    name: 'LinkedIn Profile Editor',
    shortDescription: 'Section-by-section LinkedIn profile editing with positioning alignment',
    longDescription:
      'Works through your LinkedIn profile section by section — headline, About, experience, skills — rewriting each to align with your strategic positioning. The result is a profile that recruiter searches surface and hiring managers take seriously.',
    icon: '✏️',
    status: 'active',
    route: '/career-iq',
    category: 'career',
    features: [
      {
        title: 'Headline Optimization',
        description:
          'Rewrites your headline to pack your target role, unique value, and top keyword into 220 characters.',
      },
      {
        title: 'Summary Alignment',
        description:
          'Crafts an About section that extends your resume positioning without duplicating it word for word.',
      },
      {
        title: 'Experience Section Editing',
        description:
          'Rewrites each role entry to complement your resume — consistent scope, consistent accomplishments, no contradictions.',
      },
      {
        title: 'Keyword Integration',
        description:
          'Weaves recruiter search terms naturally throughout your profile to maximize visibility without keyword stuffing.',
      },
    ],
    ctaLabel: 'Edit My Profile',
  },
  // --- Interview ---
  {
    id: 'interview-debrief',
    slug: 'interview-debrief',
    name: 'Interview Debrief',
    shortDescription: 'Post-interview analysis to improve your performance for the next round',
    longDescription:
      'Structured debrief session immediately after an interview while details are fresh. Analyzes what went well, where you left value on the table, and what signals you should read into — then builds a targeted prep plan for the next round.',
    icon: '📋',
    status: 'active',
    route: '/career-iq',
    category: 'interview',
    features: [
      {
        title: 'Performance Assessment',
        description:
          'Evaluates your answers for strength of evidence, positioning consistency, and missed opportunities.',
      },
      {
        title: 'Improvement Targeting',
        description:
          'Identifies the two or three specific areas where better preparation would have the highest impact on next-round success.',
      },
      {
        title: 'Next Round Preparation',
        description:
          'Builds a focused prep plan based on what this round revealed about the hiring team\'s priorities.',
      },
      {
        title: 'Signal Reading',
        description:
          'Helps you interpret interviewer behavior, question patterns, and tone shifts to gauge where you stand.',
      },
    ],
    ctaLabel: 'Debrief This Interview',
  },
  // --- Planning ---
  {
    id: 'counter-offer-sim',
    slug: 'counter-offer-sim',
    name: 'Counter-Offer Simulation',
    shortDescription: 'Simulate negotiation scenarios before the real conversation',
    longDescription:
      'Runs you through realistic counter-offer scenarios so you walk into the real negotiation having already rehearsed every response. Builds your leverage map, scripts your opening move, and prepares you for the most common pushbacks.',
    icon: '⚖️',
    status: 'active',
    route: '/career-iq',
    category: 'planning',
    features: [
      {
        title: 'Scenario Modeling',
        description:
          'Simulates the full range of employer responses — accept, partial counter, hard no — so nothing catches you off guard.',
      },
      {
        title: 'Response Scripting',
        description:
          'Generates word-for-word language for your counter, your silence, and your walk-away threshold.',
      },
      {
        title: 'Leverage Analysis',
        description:
          'Maps your actual leverage points — competing offers, market data, internal demand — and teaches you to use them effectively.',
      },
      {
        title: 'Outcome Prediction',
        description:
          'Estimates the likely outcome range for each scenario based on your inputs and negotiation strategy.',
      },
    ],
    ctaLabel: 'Run a Simulation',
  },
  // --- Intelligence ---
  {
    id: 'momentum-tracker',
    slug: 'momentum',
    name: 'Momentum Tracker',
    shortDescription: 'Track your job search velocity and get coaching nudges to stay on track',
    longDescription:
      'Monitors the cadence of your job search activity — applications sent, outreach made, interviews scheduled — and provides weekly momentum scores with coaching nudges to prevent the stalls that sink most searches.',
    icon: '📈',
    status: 'active',
    route: '/career-iq',
    category: 'intelligence',
    features: [
      {
        title: 'Activity Tracking',
        description:
          'Logs applications, outreach, interviews, and follow-ups in one place to give you a real picture of your search pace.',
      },
      {
        title: 'Momentum Scoring',
        description:
          'Weekly score quantifies your search velocity and flags when your pace is dropping below the level needed to hit your timeline.',
      },
      {
        title: 'Weekly Goal Setting',
        description:
          'Sets realistic weekly activity targets based on your timeline, role type, and the conversion rates typical for your market.',
      },
      {
        title: 'Coaching Nudges',
        description:
          'Context-aware prompts that identify exactly where your funnel is leaking and suggest the highest-leverage action to take next.',
      },
    ],
    ctaLabel: 'Track My Momentum',
  },
  // --- Financial ---
  {
    id: 'retirement-bridge',
    slug: 'retirement-bridge',
    name: 'Retirement Bridge',
    shortDescription: 'Retirement readiness assessment with fiduciary-grade financial planning guidance',
    longDescription:
      'A seven-dimension retirement readiness assessment that evaluates your financial, health, social, and psychological preparedness. Provides fiduciary-grade guidance and matches you with qualified financial planners for a warm, documented handoff.',
    icon: '🏦',
    status: 'active',
    route: '/career-iq',
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
        title: 'Planner Matching',
        description:
          'Qualifies and matches you with fiduciary-certified financial planners based on your specific situation and needs.',
      },
      {
        title: 'Fiduciary Guardrails',
        description:
          'All guidance is bounded by strict fiduciary standards — no product recommendations, no commission-driven advice.',
      },
    ],
    ctaLabel: 'Assess My Readiness',
  },
  // --- Coming Soon ---
  {
    id: 'b2b-admin',
    slug: 'b2b-admin',
    name: 'B2B Admin Portal',
    shortDescription: 'Enterprise outplacement portal for HR teams managing career transitions',
    longDescription:
      'A dedicated admin portal for HR and talent teams managing large-scale outplacement programs. Provides seat management, cohort tracking, engagement reporting, and white-label branding for enterprise deployments.',
    icon: '🏢',
    status: 'coming_soon',
    route: '/b2b',
    category: 'planning',
    features: [
      {
        title: 'Seat Management',
        description:
          'Provision, transfer, and revoke platform seats for outplacement cohorts with full audit trail.',
      },
      {
        title: 'Cohort Tracking',
        description:
          'Monitor progress across groups of candidates — by division, layoff date, or program tier — in a single dashboard.',
      },
      {
        title: 'Engagement Reporting',
        description:
          'Detailed reporting on tool usage, session completion, and placement outcomes to demonstrate program ROI.',
      },
      {
        title: 'White-Label Branding',
        description:
          'Deploy the platform under your company brand — custom logo, colors, and domain — for a seamless employee experience.',
      },
    ],
    ctaLabel: 'Request Enterprise Access',
  },
  {
    id: 'planner-handoff',
    slug: 'planner-handoff',
    name: 'Planner Handoff',
    shortDescription: 'Warm introductions to qualified financial planners matched to your needs',
    longDescription:
      'A structured warm handoff process that connects you with a pre-qualified, fiduciary-certified financial planner. Generates a detailed handoff document summarizing your financial situation so your first planner meeting skips the intake and goes straight to strategy.',
    icon: '🤝',
    status: 'coming_soon',
    route: '/career-iq',
    category: 'financial',
    features: [
      {
        title: 'Planner Qualification',
        description:
          'Every matched planner passes a five-gate qualification check covering fiduciary status, credentials, and specialty alignment.',
      },
      {
        title: 'Needs Matching',
        description:
          'Matches you to planners whose specialty areas align with your specific financial situation and goals.',
      },
      {
        title: 'Warm Handoff Documents',
        description:
          'Generates a structured briefing document for your planner so session one focuses on your strategy, not your background.',
      },
      {
        title: 'Fiduciary Verification',
        description:
          'Independently verifies fiduciary status and current credentials before any referral is made.',
      },
    ],
    ctaLabel: 'Find a Planner',
  },
];
