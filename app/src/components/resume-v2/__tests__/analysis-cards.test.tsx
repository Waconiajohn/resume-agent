// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobIntelligenceCard } from '../cards/JobIntelligenceCard';
import { BenchmarkCandidateCard } from '../cards/BenchmarkCandidateCard';
import { CandidateIntelligenceCard } from '../cards/CandidateIntelligenceCard';
import type { BenchmarkCandidate, CandidateIntelligence, JobIntelligence } from '@/types/resume-v2';

const jobIntelligence: JobIntelligence = {
  company_name: 'TechCorp',
  role_title: 'VP Operations',
  seniority_level: 'VP',
  core_competencies: [
    {
      competency: 'Executive stakeholder leadership',
      importance: 'must_have',
      evidence_from_jd: 'Lead executive alignment across functions.',
    },
  ],
  strategic_responsibilities: [],
  business_problems: ['Improve execution quality'],
  cultural_signals: [],
  hidden_hiring_signals: ['Needs someone who can align leaders quickly.'],
  language_keywords: [],
  industry: 'SaaS',
};

const benchmarkCandidate: BenchmarkCandidate = {
  ideal_profile_summary: 'The strongest candidate usually shows scale, executive trust, and a repeatable operating system.',
  expected_leadership_scope: 'Enterprise or multi-site operational leadership.',
  expected_industry_knowledge: ['SaaS operations'],
  expected_technical_skills: ['Operating cadence', 'Cross-functional execution'],
  expected_certifications: [],
  expected_achievements: [
    {
      area: 'Operating scale',
      description: 'Has led multi-site or cross-functional execution at meaningful scale.',
      typical_metrics: 'Headcount, revenue, footprint, or complexity owned',
    },
  ],
  differentiators: ['Shows evidence of enterprise-scale operating rhythm'],
};

const candidateIntelligence: CandidateIntelligence = {
  contact: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-0100',
    location: 'Chicago, IL',
    linkedin: undefined,
  },
  career_themes: ['Operations leadership', 'Cross-functional execution'],
  quantified_outcomes: [
    {
      value: '12%',
      outcome: 'Improved margin across a multi-site operation',
      metric_type: 'money',
    },
  ],
  industry_depth: ['SaaS operations'],
  technologies: ['ERP', 'Planning systems'],
  leadership_scope: 'Led a 120-person organization across operations and support.',
  operational_scale: 'Multi-site operation serving enterprise customers.',
  career_span_years: 18,
  experience: [
    {
      company: 'Acme Corp',
      title: 'VP Operations',
      start_date: '2020',
      end_date: '2025',
      bullets: ['Improved margin across a multi-site operation by 12%.'],
    },
  ],
  education: [{ degree: 'BS Business', institution: 'Northwestern' }],
  certifications: [],
  hidden_accomplishments: ['Built an operating cadence that improved leadership alignment.'],
};

describe('resume-v2 analysis cards', () => {
  it('frames the job card around what the resume needs to cover', () => {
    render(<JobIntelligenceCard data={jobIntelligence} />);

    expect(screen.getByText('What this role needs from the resume')).toBeInTheDocument();
    expect(screen.getByText('Direct requirements from the posting')).toBeInTheDocument();
    expect(screen.getByText('Problems this hire is expected to solve')).toBeInTheDocument();
  });

  it('frames the benchmark card as a secondary comparison, not a mystery artifact', () => {
    render(<BenchmarkCandidateCard data={benchmarkCandidate} />);

    expect(screen.getByText('What a strong candidate usually shows')).toBeInTheDocument();
    expect(screen.getByText('What stronger candidates usually prove')).toBeInTheDocument();
    expect(screen.getByText('What often separates the strongest candidates')).toBeInTheDocument();
  });

  it('frames the candidate card around reusable proof already on the resume', () => {
    render(<CandidateIntelligenceCard data={candidateIntelligence} />);

    expect(screen.getByText('What your resume already gives us')).toBeInTheDocument();
    expect(screen.getByText('Patterns we can lean on')).toBeInTheDocument();
    expect(screen.getByText('Proof already on the page')).toBeInTheDocument();
    expect(screen.getByText('Strengths we can surface more clearly')).toBeInTheDocument();
  });
});
