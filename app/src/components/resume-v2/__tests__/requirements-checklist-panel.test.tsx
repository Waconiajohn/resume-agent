// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { RequirementsChecklistPanel } from '../panels/RequirementsChecklistPanel';

import type {
  JobIntelligence,
  BenchmarkCandidate,
  PositioningAssessment,
  GapAnalysis,
  GapCoachingCard,
  ResumeDraft,
} from '@/types/resume-v2';
import type { EditAction, EditContext } from '@/hooks/useInlineEdit';

// ─── Global mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) =>
    classes.filter(Boolean).join(' '),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJobIntelligence(
  overrides?: Partial<JobIntelligence>,
): JobIntelligence {
  return {
    company_name: 'Acme Corp',
    role_title: 'VP Engineering',
    seniority_level: 'VP',
    core_competencies: [
      {
        competency: 'Team Leadership',
        importance: 'must_have',
        evidence_from_jd: 'Lead cross-functional teams of 50+',
      },
      {
        competency: 'Cloud Infrastructure',
        importance: 'important',
        evidence_from_jd: 'Experience with AWS or GCP',
      },
      {
        competency: 'Agile Delivery',
        importance: 'nice_to_have',
        evidence_from_jd: 'Scrum or Kanban preferred',
      },
    ],
    strategic_responsibilities: [],
    business_problems: [],
    cultural_signals: [],
    hidden_hiring_signals: [],
    language_keywords: [],
    industry: 'SaaS',
    ...overrides,
  };
}

function makeBenchmarkCandidate(
  overrides?: Partial<BenchmarkCandidate>,
): BenchmarkCandidate {
  return {
    ideal_profile_summary: 'A seasoned engineering executive with cloud expertise.',
    expected_achievements: [
      {
        area: 'Team Leadership and Mentorship',
        description: 'Built and scaled engineering orgs to 50+ people.',
        typical_metrics: '50+ reports, 5+ years at VP level',
      },
      {
        area: 'Cloud Infrastructure Architecture',
        description: 'Migrated legacy systems to cloud-native stacks.',
        typical_metrics: '30%+ cost reduction, 99.9% uptime',
      },
    ],
    expected_leadership_scope: 'VP / SVP',
    expected_industry_knowledge: ['SaaS', 'B2B'],
    expected_technical_skills: ['AWS', 'Kubernetes', 'TypeScript'],
    expected_certifications: ['AWS Solutions Architect'],
    differentiators: ['Revenue-aligned engineering', 'AI-first mindset'],
    ...overrides,
  };
}

function makePositioningAssessment(
  overrides?: Partial<PositioningAssessment>,
): PositioningAssessment {
  return {
    summary: 'Strong overall fit with some repositioning required.',
    requirement_map: [
      {
        requirement: 'Team Leadership',
        importance: 'must_have',
        status: 'strong',
        addressed_by: [
          {
            section: 'Experience — Acme Corp',
            bullet_text: 'Led a team of 45 engineers across 6 product teams.',
          },
        ],
      },
      {
        requirement: 'Cloud Infrastructure',
        importance: 'important',
        status: 'repositioned',
        addressed_by: [],
        strategy_used: 'Framed on-prem ops experience as cloud-equivalent scale',
      },
      {
        requirement: 'Agile Delivery',
        importance: 'nice_to_have',
        status: 'gap',
        addressed_by: [],
      },
    ],
    before_score: 62,
    after_score: 85,
    strategies_applied: ['Reframe scope', 'Keyword alignment'],
    ...overrides,
  };
}

function makeGapAnalysis(overrides?: Partial<GapAnalysis>): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'Team Leadership',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['Led 45-person org'],
      },
      {
        requirement: 'Cloud Infrastructure',
        importance: 'important',
        classification: 'partial',
        evidence: [],
      },
    ],
    coverage_score: 75,
    strength_summary: 'Good coverage with some gaps in cloud-native experience.',
    critical_gaps: [],
    pending_strategies: [],
    ...overrides,
  };
}

// ─── Coaching fixtures ───────────────────────────────────────────────────────

function makeGapCoachingCards(): GapCoachingCard[] {
  return [
    {
      requirement: 'Cloud Infrastructure',
      importance: 'important',
      classification: 'partial',
      ai_reasoning: 'I noticed you managed on-prem servers for 200+ nodes — that maps well to cloud-scale.',
      proposed_strategy: 'Reframe as cloud-equivalent scale operations',
      inferred_metric: '200 nodes x $500/mo = $100K monthly infrastructure',
      inference_rationale: 'Based on your team size and server fleet described in resume',
      evidence_found: ['Managed 200-node server fleet'],
    },
    {
      requirement: 'Agile Delivery',
      importance: 'nice_to_have',
      classification: 'missing',
      ai_reasoning: 'You led cross-functional teams which implies some form of agile methodology.',
      proposed_strategy: 'Position cross-functional leadership as agile practice',
      evidence_found: [],
    },
  ];
}

function makeResumeDraft(): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: 'VP Engineering',
    },
    executive_summary: {
      content: 'Experienced engineering leader.',
      is_new: false,
    },
    core_competencies: ['Leadership', 'Cloud Infrastructure'],
    selected_accomplishments: [],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: '2020',
        end_date: '2024',
        scope_statement: 'Led engineering organization.',
        bullets: [
          { text: 'Led a team of 45 engineers across 6 product teams.', is_new: false, addresses_requirements: ['Team Leadership'] },
          { text: 'Managed 200-node on-prem server fleet with 99.9% uptime.', is_new: false, addresses_requirements: ['Cloud Infrastructure'] },
        ],
      },
    ],
    education: [],
    certifications: [],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPanel(
  overrides: {
    jobIntelligence?: JobIntelligence;
    benchmarkCandidate?: BenchmarkCandidate | null;
    positioningAssessment?: PositioningAssessment | null;
    gapAnalysis?: GapAnalysis;
    activeRequirements?: string[];
    onRequirementClick?: (r: string) => void;
    gapCoachingCards?: GapCoachingCard[] | null;
    onRequestEdit?: (s: string, sec: string, a: EditAction, ci?: string, ec?: EditContext) => void;
    currentResume?: ResumeDraft | null;
    isEditing?: boolean;
  } = {},
) {
  const props = {
    jobIntelligence: overrides.jobIntelligence ?? makeJobIntelligence(),
    benchmarkCandidate:
      overrides.benchmarkCandidate !== undefined
        ? overrides.benchmarkCandidate
        : makeBenchmarkCandidate(),
    positioningAssessment:
      overrides.positioningAssessment !== undefined
        ? overrides.positioningAssessment
        : makePositioningAssessment(),
    gapAnalysis: overrides.gapAnalysis ?? makeGapAnalysis(),
    activeRequirements: overrides.activeRequirements ?? [],
    onRequirementClick: overrides.onRequirementClick ?? vi.fn(),
    gapCoachingCards: overrides.gapCoachingCards,
    onRequestEdit: overrides.onRequestEdit,
    currentResume: overrides.currentResume,
    isEditing: overrides.isEditing,
  };
  return render(<RequirementsChecklistPanel {...props} />);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Renders requirements grouped by importance
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — importance groups', () => {
  it('renders the "Must Have" group header when must_have competencies are present', () => {
    renderPanel();
    // The label appears in both the group header and in each row's inline badge.
    // Verify at least one instance is present.
    expect(screen.getAllByText('Must Have').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the "Important" group header when important competencies are present', () => {
    renderPanel();
    expect(screen.getAllByText('Important').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the "Nice to Have" group header when nice_to_have competencies are present', () => {
    renderPanel();
    expect(screen.getAllByText('Nice to Have').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render a group header for an importance level with no competencies', () => {
    const jd = makeJobIntelligence({
      core_competencies: [
        {
          competency: 'Strategic Planning',
          importance: 'must_have',
          evidence_from_jd: 'Required',
        },
      ],
    });
    renderPanel({ jobIntelligence: jd });
    expect(screen.queryByText('Important')).not.toBeInTheDocument();
    expect(screen.queryByText('Nice to Have')).not.toBeInTheDocument();
  });

  it('renders each competency text inside its group', () => {
    renderPanel();
    expect(screen.getByText('Team Leadership')).toBeInTheDocument();
    expect(screen.getByText('Cloud Infrastructure')).toBeInTheDocument();
    expect(screen.getByText('Agile Delivery')).toBeInTheDocument();
  });

  it('renders the role title and company name in the header', () => {
    renderPanel();
    expect(screen.getByText(/VP Engineering — Acme Corp/)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Status icons based on positioning assessment
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — status icons', () => {
  it('renders the "Addressed by" text for a strong match requirement', () => {
    renderPanel();
    // The text "Addressed by:" lives inside a <span> alongside a child <span> for the snippet.
    // Query the parent span whose text content contains the prefix.
    expect(
      screen.getByText((content, element) => {
        return (
          element?.tagName === 'SPAN' &&
          (element.textContent ?? '').startsWith('Addressed by:')
        );
      }),
    ).toBeInTheDocument();
  });

  it('renders the repositioned strategy text for a repositioned requirement', () => {
    renderPanel();
    expect(
      screen.getByText(/Framed on-prem ops experience as cloud-equivalent scale/),
    ).toBeInTheDocument();
  });

  it('renders the "GAP" label for a gap requirement', () => {
    renderPanel();
    expect(
      screen.getByText('GAP — Not addressed in resume'),
    ).toBeInTheDocument();
  });

  it('truncates bullet text longer than 80 characters with an ellipsis', () => {
    const longBullet = 'A'.repeat(90);
    const assessment = makePositioningAssessment({
      requirement_map: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          status: 'strong',
          addressed_by: [
            { section: 'Experience', bullet_text: longBullet },
          ],
        },
      ],
    });
    renderPanel({ positioningAssessment: assessment });
    // The component renders the snippet inside an italic <span> wrapped in curly-quote entities.
    // The italic span's textContent = \u201c + snippet + \u201d where snippet is 80 chars + "…".
    // Verify that the full original text (90 A's) is NOT present and the ellipsis IS present.
    const snippetEl = screen.getByText(/\u2026/);
    expect(snippetEl.textContent).toContain('\u2026');
    expect(snippetEl.textContent).not.toContain('A'.repeat(90));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Active requirement highlighting
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — active requirements', () => {
  it('marks a requirement button as aria-pressed when it matches activeRequirements', () => {
    renderPanel({ activeRequirements: ['Team Leadership'] });
    const button = screen.getByRole('button', { name: /Team Leadership/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not mark a requirement button as active when it is not in activeRequirements', () => {
    renderPanel({ activeRequirements: [] });
    const button = screen.getByRole('button', { name: /Team Leadership/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('active matching is case-insensitive', () => {
    renderPanel({ activeRequirements: ['team leadership'] });
    const button = screen.getByRole('button', { name: /Team Leadership/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('active matching ignores leading and trailing whitespace', () => {
    renderPanel({ activeRequirements: ['  Team Leadership  '] });
    const button = screen.getByRole('button', { name: /Team Leadership/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not mark other requirements as active when only one matches', () => {
    renderPanel({ activeRequirements: ['Team Leadership'] });
    const cloudButton = screen.getByRole('button', { name: /Cloud Infrastructure/i });
    expect(cloudButton).toHaveAttribute('aria-pressed', 'false');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Progress bar shows correct counts
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — progress bar', () => {
  it('shows "X of Y requirements addressed" in the summary bar', () => {
    // strong=1, repositioned=1, gap=1 → addressed=2 of 3
    renderPanel();
    expect(
      screen.getByText('2 of 3 requirements addressed'),
    ).toBeInTheDocument();
  });

  it('shows the correct percentage in the progress bar', () => {
    // 2/3 = 66%, rounded = 67%
    renderPanel();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('shows the strong count chip in the legend', () => {
    renderPanel();
    expect(screen.getByText('1 strong')).toBeInTheDocument();
  });

  it('shows the repositioned count chip in the legend', () => {
    renderPanel();
    expect(screen.getByText('1 repositioned')).toBeInTheDocument();
  });

  it('shows the gap count chip in the legend', () => {
    renderPanel();
    // 1 gap from core_competencies; no extra gaps in base fixture
    expect(screen.getByText(/1 gap/)).toBeInTheDocument();
  });

  it('includes extra gaps from gapAnalysis in the total gap count', () => {
    // Add an extra gap that does NOT appear in core_competencies
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Kubernetes Expertise',
          importance: 'important',
          classification: 'missing',
          evidence: [],
        },
      ],
    });
    // core_competencies has: must_have=strong, important=repositioned, nice_to_have=gap
    // extra gap: Kubernetes Expertise
    // Total: 1 strong, 1 repo, 2 gaps → addressed=2 of 4
    renderPanel({ gapAnalysis: gap });
    expect(screen.getByText('2 of 4 requirements addressed')).toBeInTheDocument();
  });

  it('returns null (renders nothing in footer) when there are no competencies at all', () => {
    const emptyJd = makeJobIntelligence({ core_competencies: [] });
    const emptyGap = makeGapAnalysis({ requirements: [] });
    const { container } = renderPanel({
      jobIntelligence: emptyJd,
      gapAnalysis: emptyGap,
    });
    // No "requirements addressed" text should appear
    expect(
      container.querySelector('[class*="border-t"]'),
    ).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Null positioningAssessment — all show as gaps
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — null positioningAssessment', () => {
  it('shows all requirements as gaps when positioningAssessment is null', () => {
    renderPanel({ positioningAssessment: null });
    const gapLabels = screen.getAllByText('GAP — Not addressed in resume');
    // All 3 core competencies should be shown as gaps
    expect(gapLabels).toHaveLength(3);
  });

  it('progress bar counts all requirements as gaps when positioningAssessment is null', () => {
    renderPanel({ positioningAssessment: null });
    // 0 strong, 0 repo, 3 gaps → 0 of 3 addressed
    expect(screen.getByText('0 of 3 requirements addressed')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Null benchmarkCandidate — no benchmark context shown
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — null benchmarkCandidate', () => {
  it('does not render any "Benchmark" context block when benchmarkCandidate is null', () => {
    renderPanel({ benchmarkCandidate: null });
    expect(screen.queryByText('Benchmark')).not.toBeInTheDocument();
  });

  it('renders benchmark context blocks when benchmarkCandidate is provided', () => {
    // The benchmark fixture has an achievement with area "Team Leadership and Mentorship"
    // which has a 2-word overlap ("team", "leadership") with the "Team Leadership" competency
    renderPanel({ benchmarkCandidate: makeBenchmarkCandidate() });
    // At least one "Benchmark" label should appear
    expect(screen.getAllByText('Benchmark').length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. onRequirementClick callback
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — onRequirementClick', () => {
  it('calls onRequirementClick with the requirement text when a row is clicked', () => {
    const onClick = vi.fn();
    renderPanel({ onRequirementClick: onClick });
    fireEvent.click(screen.getByRole('button', { name: /Team Leadership/i }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledWith('Team Leadership');
  });

  it('calls onRequirementClick with the correct requirement for each distinct row', () => {
    const onClick = vi.fn();
    renderPanel({ onRequirementClick: onClick });

    fireEvent.click(screen.getByRole('button', { name: /Cloud Infrastructure/i }));
    expect(onClick).toHaveBeenLastCalledWith('Cloud Infrastructure');

    fireEvent.click(screen.getByRole('button', { name: /Agile Delivery/i }));
    expect(onClick).toHaveBeenLastCalledWith('Agile Delivery');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('calls onRequirementClick when an extra-gap row is clicked', () => {
    const onClick = vi.fn();
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Kubernetes Expertise',
          importance: 'important',
          classification: 'missing',
          evidence: [],
        },
      ],
    });
    renderPanel({ gapAnalysis: gap, onRequirementClick: onClick });
    fireEvent.click(screen.getByRole('button', { name: /Kubernetes Expertise/i }));
    expect(onClick).toHaveBeenCalledWith('Kubernetes Expertise');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Extra gaps from gapAnalysis appear in "Additional Gaps" section
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — Additional Gaps section', () => {
  it('renders "Additional Gaps" header when gap requirements exist that are not in core_competencies', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Kubernetes Expertise',
          importance: 'important',
          classification: 'missing',
          evidence: [],
        },
      ],
    });
    renderPanel({ gapAnalysis: gap });
    expect(screen.getByText('Additional Gaps')).toBeInTheDocument();
  });

  it('renders the extra gap requirement text in the "Additional Gaps" section', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Kubernetes Expertise',
          importance: 'important',
          classification: 'missing',
          evidence: [],
        },
      ],
    });
    renderPanel({ gapAnalysis: gap });
    expect(screen.getByText('Kubernetes Expertise')).toBeInTheDocument();
  });

  it('does not render "Additional Gaps" when all missing requirements are already in core_competencies', () => {
    // "Agile Delivery" is already in core_competencies — a missing classification for it
    // should NOT appear in Additional Gaps
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Agile Delivery',
          importance: 'nice_to_have',
          classification: 'missing',
          evidence: [],
        },
      ],
    });
    renderPanel({ gapAnalysis: gap });
    expect(screen.queryByText('Additional Gaps')).not.toBeInTheDocument();
  });

  it('does not render "Additional Gaps" when gapAnalysis has no missing requirements', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led org of 45'],
        },
      ],
    });
    renderPanel({ gapAnalysis: gap });
    expect(screen.queryByText('Additional Gaps')).not.toBeInTheDocument();
  });

  it('shows the count of extra gaps in the section header', () => {
    const gap = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Kubernetes Expertise',
          importance: 'important',
          classification: 'missing',
          evidence: [],
        },
        {
          requirement: 'FinOps Certification',
          importance: 'nice_to_have',
          classification: 'missing',
          evidence: [],
        },
      ],
    });
    renderPanel({ gapAnalysis: gap });
    // The count "2" appears next to the "Additional Gaps" header
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. findBenchmarkContext requires ≥2 word overlap (no false positives)
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — benchmark context word-overlap guard', () => {
  it('does not show benchmark context when only 1 word overlaps', () => {
    // "Leadership" overlaps with "Team Leadership" — only 1 word
    const benchmark = makeBenchmarkCandidate({
      expected_achievements: [
        {
          area: 'Leadership Development',
          description: 'Develops individual contributors into managers.',
          typical_metrics: '5+ direct reports',
        },
      ],
    });
    // "Team Leadership" competency vs area "Leadership Development":
    // tokens of "Team Leadership" = ["team","leadership"]
    // tokens of "Leadership Development" = ["leadership","development"]
    // overlap = 1 ("leadership") → below threshold of 2, and not exact match
    renderPanel({ benchmarkCandidate: benchmark });
    // No "Benchmark" block should appear because overlap is only 1
    expect(screen.queryByText('Benchmark')).not.toBeInTheDocument();
  });

  it('shows benchmark context when exactly 2 words overlap', () => {
    // "Team Leadership" competency — need ≥2 overlapping words
    const benchmark = makeBenchmarkCandidate({
      expected_achievements: [
        {
          area: 'Team Leadership Skills',
          description: 'Built high-performing engineering teams.',
          typical_metrics: '20+ direct reports',
        },
      ],
    });
    // tokens of "Team Leadership" = ["team","leadership"]
    // tokens of "Team Leadership Skills" = ["team","leadership","skills"]
    // overlap = 2 → matches
    renderPanel({ benchmarkCandidate: benchmark });
    expect(screen.getByText('Benchmark')).toBeInTheDocument();
  });

  it('shows benchmark context on an exact case-insensitive match regardless of overlap count', () => {
    const benchmark = makeBenchmarkCandidate({
      expected_achievements: [
        {
          area: 'Team Leadership',
          description: 'Exact area match — should always match.',
          typical_metrics: 'N/A',
        },
      ],
    });
    renderPanel({ benchmarkCandidate: benchmark });
    expect(screen.getByText('Benchmark')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. fuzzyLookup matches when requirement text differs slightly between agents
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — fuzzyLookup for assessment matching', () => {
  it('falls back to fuzzy match when assessment key differs slightly from competency text', () => {
    // core_competency: "Cloud Infrastructure"
    // assessment entry: "Cloud Infrastructure Management" (close but not exact)
    // tokens of "cloud infrastructure" = ["cloud","infrastructure"]
    // tokens of "cloud infrastructure management" = ["cloud","infrastructure","management"]
    // overlap=2, score=2/3=0.67>0.5 → should match
    const assessment = makePositioningAssessment({
      requirement_map: [
        {
          requirement: 'Cloud Infrastructure Management',
          importance: 'important',
          status: 'strong',
          addressed_by: [
            {
              section: 'Experience',
              bullet_text: 'Managed multi-region AWS infrastructure.',
            },
          ],
        },
      ],
    });
    renderPanel({ positioningAssessment: assessment });
    // The "Cloud Infrastructure" competency should resolve to "strong" via fuzzy match
    // and render an "Addressed by:" span instead of "GAP".
    // The "Addressed by:" text is split across child elements, so match against
    // the parent <span> whose textContent starts with it.
    expect(
      screen.getByText((content, element) => {
        return (
          element?.tagName === 'SPAN' &&
          (element.textContent ?? '').startsWith('Addressed by:')
        );
      }),
    ).toBeInTheDocument();
  });

  it('does not fuzzy-match when overlap is only 1 word even if the score meets the threshold', () => {
    // "Cloud Infrastructure" (2 tokens) vs "Cloud Systems" (2 tokens)
    // overlap=1 ("cloud"), score=1/2=0.5 → below overlap>=2 guard
    // Result: falls back to gap
    const assessment = makePositioningAssessment({
      requirement_map: [
        {
          requirement: 'Cloud Systems',
          importance: 'important',
          status: 'strong',
          addressed_by: [{ section: 'Experience', bullet_text: 'Managed cloud systems.' }],
        },
        // Keep Team Leadership and Agile Delivery as gaps to avoid other "Addressed by" text
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          status: 'gap',
          addressed_by: [],
        },
        {
          requirement: 'Agile Delivery',
          importance: 'nice_to_have',
          status: 'gap',
          addressed_by: [],
        },
      ],
    });
    renderPanel({ positioningAssessment: assessment });
    // "Cloud Infrastructure" should NOT match "Cloud Systems" — all 3 should be gaps
    const gapLabels = screen.getAllByText('GAP — Not addressed in resume');
    expect(gapLabels).toHaveLength(3);
  });

  it('prefers exact match over fuzzy when both are present in the requirement_map', () => {
    const assessment = makePositioningAssessment({
      requirement_map: [
        {
          requirement: 'Cloud Infrastructure',
          importance: 'important',
          status: 'repositioned',
          addressed_by: [],
          strategy_used: 'Exact match strategy',
        },
        {
          requirement: 'Cloud Infrastructure Management',
          importance: 'important',
          status: 'strong',
          addressed_by: [{ section: 'Experience', bullet_text: 'Fuzzy match bullet.' }],
        },
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          status: 'gap',
          addressed_by: [],
        },
        {
          requirement: 'Agile Delivery',
          importance: 'nice_to_have',
          status: 'gap',
          addressed_by: [],
        },
      ],
    });
    renderPanel({ positioningAssessment: assessment });
    // The exact match ("Cloud Infrastructure") should win and show "Repositioned:" text
    expect(screen.getByText(/Exact match strategy/)).toBeInTheDocument();
    // The fuzzy match bullet text should NOT appear (it belongs to the other entry)
    expect(screen.queryByText('Fuzzy match bullet.')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Coaching drawer — expandable coaching content
// ─────────────────────────────────────────────────────────────────────────────

describe('RequirementsChecklistPanel — coaching drawer', () => {
  it('shows coaching drawer with AI reasoning when a row with coaching is expanded', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          importance: 'important',
          classification: 'partial',
          evidence: ['Managed 200-node server fleet'],
          strategy: {
            real_experience: 'On-prem server management at scale',
            positioning: 'Reframe as cloud-equivalent infrastructure management',
          },
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      gapCoachingCards: makeGapCoachingCards(),
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    // Row should have aria-expanded=false initially
    const rowButton = screen.getByRole('button', { name: /Cloud Infrastructure/i });
    expect(rowButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(rowButton);

    // aria-expanded should now be true
    expect(rowButton).toHaveAttribute('aria-expanded', 'true');

    // AI reasoning should be in the document
    expect(screen.getByText(/I noticed you managed on-prem servers/)).toBeInTheDocument();
  });

  it('shows strategy card with positioning text when expanded', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          importance: 'important',
          classification: 'partial',
          evidence: [],
          strategy: {
            real_experience: 'On-prem management',
            positioning: 'Reframe as cloud-equivalent infrastructure management',
          },
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      gapCoachingCards: makeGapCoachingCards(),
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Cloud Infrastructure/i }));
    expect(screen.getByText('Reframe as cloud-equivalent infrastructure management')).toBeInTheDocument();
  });

  it('shows inferred metrics when coaching card has them', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          importance: 'important',
          classification: 'partial',
          evidence: [],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      gapCoachingCards: makeGapCoachingCards(),
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Cloud Infrastructure/i }));
    expect(screen.getByText(/\$100K monthly infrastructure/)).toBeInTheDocument();
  });

  it('shows action buttons based on strong status', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 45-person org'],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Team Leadership/i }));
    expect(screen.getByTestId('action-strengthen')).toBeInTheDocument();
    expect(screen.getByTestId('action-add-metrics')).toBeInTheDocument();
  });

  it('shows "Strengthen" and "Refine Positioning" for repositioned status', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          importance: 'important',
          classification: 'partial',
          evidence: [],
          strategy: {
            real_experience: 'On-prem ops',
            positioning: 'Cloud-equivalent scale operations',
          },
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      gapCoachingCards: makeGapCoachingCards(),
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Cloud Infrastructure/i }));
    expect(screen.getByTestId('action-strengthen')).toBeInTheDocument();
    expect(screen.getByTestId('action-refine-positioning')).toBeInTheDocument();
    expect(screen.getByText('Refine Positioning')).toBeInTheDocument();
  });

  it('shows "Apply Safe Language" for gap status', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Agile Delivery',
          importance: 'nice_to_have',
          classification: 'missing',
          evidence: [],
          strategy: {
            real_experience: 'Cross-functional team management',
            positioning: 'Applied iterative delivery practices across teams',
          },
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      gapCoachingCards: makeGapCoachingCards(),
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Agile Delivery/i }));
    expect(screen.getByText('Apply Safe Language')).toBeInTheDocument();
  });

  it('shows "Add My Context" button when onRequestEdit is provided', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 45-person org'],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Team Leadership/i }));
    expect(screen.getByTestId('action-add-context')).toBeInTheDocument();
  });

  it('calls onRequestEdit with correct args when "Strengthen" is clicked', () => {
    const onRequestEdit = vi.fn();
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 45-person org'],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      onRequestEdit,
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Team Leadership/i }));
    fireEvent.click(screen.getByTestId('action-strengthen'));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      expect.any(String), // bullet text
      expect.any(String), // section
      'strengthen',
      undefined,
      expect.objectContaining({ requirement: 'Team Leadership' }),
    );
  });

  it('calls onRequestEdit with custom instruction when "Apply Safe Language" is clicked', () => {
    const onRequestEdit = vi.fn();
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Agile Delivery',
          importance: 'nice_to_have',
          classification: 'missing',
          evidence: [],
          strategy: {
            real_experience: 'Cross-functional team management',
            positioning: 'Applied iterative delivery practices across teams',
          },
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      gapCoachingCards: makeGapCoachingCards(),
      onRequestEdit,
      currentResume: makeResumeDraft(),
      positioningAssessment: makePositioningAssessment(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Agile Delivery/i }));
    fireEvent.click(screen.getByTestId('action-apply-strategy'));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'custom',
      expect.stringContaining('safe resume language'),
      expect.objectContaining({ requirement: 'Agile Delivery' }),
    );
  });

  it('calls onRequestEdit with add_metrics action when "Add Metrics" is clicked', () => {
    const onRequestEdit = vi.fn();
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 45-person org'],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      onRequestEdit,
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Team Leadership/i }));
    fireEvent.click(screen.getByTestId('action-add-metrics'));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'add_metrics',
      undefined,
      expect.objectContaining({ requirement: 'Team Leadership' }),
    );
  });

  it('submits user context and calls onRequestEdit with custom instruction', () => {
    const onRequestEdit = vi.fn();
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 45-person org'],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      onRequestEdit,
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Team Leadership/i }));
    fireEvent.click(screen.getByTestId('action-add-context'));

    const textarea = screen.getByLabelText(/Additional context for/);
    fireEvent.change(textarea, { target: { value: 'I also mentored 12 junior engineers' } });
    fireEvent.click(screen.getByTestId('submit-context'));

    expect(onRequestEdit).toHaveBeenCalledOnce();
    expect(onRequestEdit).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'custom',
      expect.stringContaining('I also mentored 12 junior engineers'),
      expect.objectContaining({ requirement: 'Team Leadership' }),
    );
  });

  it('does not render action buttons when new props are omitted (backward compatibility)', () => {
    renderPanel();
    // Without coaching/gapReq data matching, no drawer renders — no chevron, no actions
    expect(screen.queryByTestId('coaching-actions')).not.toBeInTheDocument();
  });

  it('does not render chevron when no coaching or gapReq data matches', () => {
    // Default gapAnalysis has Team Leadership and Cloud Infrastructure
    // but if we pass empty gapAnalysis, no gapReq matches core competencies
    renderPanel({ gapAnalysis: makeGapAnalysis({ requirements: [] }) });
    const button = screen.getByRole('button', { name: /Team Leadership/i });
    // No aria-expanded means no drawer
    expect(button).not.toHaveAttribute('aria-expanded');
  });

  it('does not scroll to bullet on collapse (only on expand)', () => {
    const onClick = vi.fn();
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 45-person org'],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      onRequirementClick: onClick,
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    const button = screen.getByRole('button', { name: /Team Leadership/i });

    // First click: expand — should fire onClick (scroll)
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    // Second click: collapse — should NOT fire onClick again
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows evidence chips in the coaching drawer when evidence exists', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Cloud Infrastructure',
          importance: 'important',
          classification: 'partial',
          evidence: ['Managed 200-node server fleet'],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      gapCoachingCards: makeGapCoachingCards(),
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Cloud Infrastructure/i }));
    expect(screen.getByText('Your Relevant Experience')).toBeInTheDocument();
    expect(screen.getByText('Managed 200-node server fleet')).toBeInTheDocument();
  });

  it('opens context textarea when "Add My Context" is clicked', () => {
    const gapAnalysis = makeGapAnalysis({
      requirements: [
        {
          requirement: 'Team Leadership',
          importance: 'must_have',
          classification: 'strong',
          evidence: ['Led 45-person org'],
        },
      ],
    });
    renderPanel({
      gapAnalysis,
      onRequestEdit: vi.fn(),
      currentResume: makeResumeDraft(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Team Leadership/i }));
    fireEvent.click(screen.getByTestId('action-add-context'));

    expect(screen.getByLabelText(/Additional context for/)).toBeInTheDocument();
    expect(screen.getByTestId('submit-context')).toBeInTheDocument();
  });
});
