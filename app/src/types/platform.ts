export type ProductStatus = 'active' | 'coming_soon' | 'beta';

export type ProductCategory = 'career' | 'networking' | 'interview';

export interface ProductDefinition {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  icon: string;
  status: ProductStatus;
  route: string;
  category: ProductCategory;
}

export const PRODUCT_CATALOG: ProductDefinition[] = [
  {
    id: 'resume-strategist',
    slug: 'resume',
    name: 'Resume Strategist',
    shortDescription: 'AI-powered resume positioning for executive roles',
    icon: '📄',
    status: 'active',
    route: '/',
    category: 'career',
  },
  {
    id: 'cover-letter',
    slug: 'cover-letter',
    name: 'Cover Letter Writer',
    shortDescription: 'Targeted cover letters that complement your resume strategy',
    icon: '✉️',
    status: 'coming_soon',
    route: '/tools/cover-letter',
    category: 'career',
  },
  {
    id: 'interview-prep',
    slug: 'interview-prep',
    name: 'Interview Prep Coach',
    shortDescription: 'Practice answers using your real experience and positioning',
    icon: '🎯',
    status: 'coming_soon',
    route: '/tools/interview-prep',
    category: 'career',
  },
  {
    id: 'linkedin-optimizer',
    slug: 'linkedin',
    name: 'LinkedIn Optimizer',
    shortDescription: 'Align your LinkedIn profile with your resume positioning',
    icon: '💼',
    status: 'coming_soon',
    route: '/tools/linkedin',
    category: 'career',
  },
];
