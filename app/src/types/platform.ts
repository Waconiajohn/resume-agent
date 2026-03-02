export type ProductStatus = 'active' | 'coming_soon' | 'beta';

export type ProductCategory = 'career' | 'networking' | 'interview';

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
    status: 'coming_soon',
    route: '/tools/cover-letter',
    category: 'career',
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
    status: 'coming_soon',
    route: '/tools/interview-prep',
    category: 'career',
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
    status: 'coming_soon',
    route: '/tools/linkedin',
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
];
