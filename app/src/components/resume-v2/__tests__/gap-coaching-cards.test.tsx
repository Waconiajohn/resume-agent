// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { StrategyAuditCard } from '../cards/StrategyAuditCard';
import { WhatChangedCard } from '../cards/WhatChangedCard';
import { StrategyPlacementCard } from '../cards/StrategyPlacementCard';
import { NarrativeStrategyCard } from '../cards/NarrativeStrategyCard';

import type {
  PositioningAssessment,
  GapAnalysis,
  GapPositioningMapEntry,
  NarrativeStrategy,
  ResumeDraft,
} from '@/types/resume-v2';

// ─── Global mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) =>
    classes.filter(Boolean).join(' '),
}));

// scrollToBullet uses document.querySelectorAll — safe to no-op in tests
vi.mock('../useStrategyThread', () => ({
  scrollToBullet: vi.fn(),
  scrollToAndHighlight: vi.fn(),
  scrollToCoachingCard: vi.fn(),
  scrollToAuditRow: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeGapAnalysis(overrides?: Partial<GapAnalysis>): GapAnalysis {
  return {
    requirements: [
      {
        requirement: 'Enterprise SaaS leadership',
        importance: 'must_have',
        classification: 'strong',
        evidence: ['Led SaaS product team at Acme'],
        strategy: {
          real_experience: 'Led SaaS product team',
          positioning: 'Reframe cloud experience as SaaS leadership',
        },
      },
      {
        requirement: 'AI/ML product ownership',
        importance: 'important',
        classification: 'partial',
        evidence: [],
        strategy: {
          real_experience: 'Built ML pipeline tooling',
          positioning: 'Highlight ML tooling ownership',
        },
      },
      {
        requirement: 'Board-level reporting',
        importance: 'nice_to_have',
        classification: 'missing',
        evidence: [],
      },
    ],
    coverage_score: 72,
    strength_summary: 'Strong SaaS background with partial AI coverage',
    critical_gaps: ['Board-level reporting'],
    pending_strategies: [],
    ...overrides,
  };
}

function makePositioningAssessment(
  overrides?: Partial<PositioningAssessment>,
): PositioningAssessment {
  return {
    summary: 'Strong overall positioning with 1 gap',
    before_score: 62,
    after_score: 84,
    strategies_applied: ['Reframe cloud as SaaS', 'Highlight ML tooling'],
    requirement_map: [
      {
        requirement: 'Enterprise SaaS leadership',
        importance: 'must_have',
        status: 'strong',
        addressed_by: [
          { section: 'Experience', bullet_text: 'Led SaaS product team of 12 across 3 geographies' },
        ],
      },
      {
        requirement: 'AI/ML product ownership',
        importance: 'important',
        status: 'repositioned',
        strategy_used: 'Framed ML tooling ownership as AI product delivery',
        addressed_by: [
          { section: 'Experience', bullet_text: 'Owned end-to-end ML pipeline delivery for 4 data products' },
        ],
      },
      {
        requirement: 'Board-level reporting',
        importance: 'nice_to_have',
        status: 'gap',
        addressed_by: [],
      },
    ],
    ...overrides,
  };
}

function makeResumeDraft(label = 'A'): ResumeDraft {
  return {
    header: {
      name: `Jane Doe ${label}`,
      phone: '555-1234',
      email: 'jane@example.com',
      branded_title: `VP Engineering ${label}`,
    },
    executive_summary: {
      content: `Seasoned engineering leader ${label} with 15+ years driving outcomes.`,
      is_new: false,
    },
    core_competencies: ['Team Leadership', 'SaaS', 'Cloud'],
    selected_accomplishments: [
      { content: `Reduced deploy time by 60% ${label}`, is_new: false, addresses_requirements: [] },
    ],
    professional_experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: 'Jan 2020',
        end_date: 'Present',
        scope_statement: 'Led org of 45',
        bullets: [
          { text: `Shipped 3 major product lines ${label}`, is_new: false, addresses_requirements: [] },
          { text: `Reduced infra cost 30% ${label}`, is_new: false, addresses_requirements: [] },
        ],
      },
    ],
    education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
  };
}

function makeNarrativeStrategy(
  overrides?: Partial<NarrativeStrategy>,
): NarrativeStrategy {
  return {
    branded_title: 'Enterprise AI Product Leader',
    primary_narrative: 'Executive who turns AI complexity into repeatable product value',
    supporting_themes: ['AI Delivery', 'SaaS Scale', 'Cross-Functional Leadership'],
    why_me_story:
      'Over 15 years I have built teams that bridge research and revenue, shipping AI-powered products that generated $400M in ARR.',
    why_me_concise:
      'I close the gap between AI research and product revenue faster than anyone in my peer set.',
    why_me_best_line:
      'I make AI products that actually ship, scale, and sell.',
    section_guidance: {
      summary_angle: 'Lead with AI product delivery credibility',
      competency_themes: ['Machine Learning Delivery', 'Platform Strategy'],
      accomplishment_priorities: ['$400M ARR product launch', 'ML pipeline at scale'],
      experience_framing: {
        'Acme Corp': 'Frame as AI product incubation inside enterprise',
        'Beta Inc': 'Emphasise platform ownership and ML tooling',
      },
    },
    ...overrides,
  };
}

function makePositioningMap(): GapPositioningMapEntry[] {
  return [
    {
      requirement: 'Enterprise SaaS leadership',
      where_to_feature: 'Executive Summary + Acme bullet 1',
      narrative_positioning: 'Position as SaaS general manager, not just technical lead',
      narrative_justification: 'GM framing aligns with the board-level expectations in the JD',
    },
    {
      requirement: 'AI/ML product ownership',
      where_to_feature: 'Beta Inc bullets 2–4',
      narrative_positioning: 'Reframe ML pipeline work as end-to-end product ownership',
      narrative_justification: 'Ownership language matches the JD requirement exactly',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// StrategyAuditCard
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyAuditCard — summary counts', () => {
  it('shows the number of repositioned requirements', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    expect(screen.getByText(/1 positioned/i)).toBeInTheDocument();
  });

  it('shows the number of direct matches', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    expect(screen.getByText(/1 direct/i)).toBeInTheDocument();
  });

  it('shows the number of gaps', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    expect(screen.getByText(/1 gap/i)).toBeInTheDocument();
  });

  it('pluralises "direct matches" when count > 1', () => {
    const assessment = makePositioningAssessment({
      requirement_map: [
        {
          requirement: 'Req A',
          importance: 'must_have',
          status: 'strong',
          addressed_by: [],
        },
        {
          requirement: 'Req B',
          importance: 'important',
          status: 'strong',
          addressed_by: [],
        },
      ],
    });
    render(
      <StrategyAuditCard
        positioningAssessment={assessment}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    expect(screen.getByText(/2 direct/i)).toBeInTheDocument();
  });

  it('omits the "positioned" badge when count is 0', () => {
    const assessment = makePositioningAssessment({
      requirement_map: [
        { requirement: 'Req A', importance: 'must_have', status: 'strong', addressed_by: [] },
      ],
    });
    render(
      <StrategyAuditCard
        positioningAssessment={assessment}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    expect(screen.queryByText(/positioned/i)).not.toBeInTheDocument();
  });

  it('omits the "gap" badge when count is 0', () => {
    const assessment = makePositioningAssessment({
      requirement_map: [
        { requirement: 'Req A', importance: 'must_have', status: 'strong', addressed_by: [] },
      ],
    });
    render(
      <StrategyAuditCard
        positioningAssessment={assessment}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    expect(screen.queryByText(/\d+ gap/i)).not.toBeInTheDocument();
  });
});

describe('StrategyAuditCard — expand / collapse', () => {
  it('does not show individual requirement rows before the header is clicked', () => {
    const { container } = render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    // The row container is hidden via aria-hidden before expansion (CSS transition approach)
    const rowContainer = container.querySelector('[aria-hidden="true"]');
    expect(rowContainer).not.toBeNull();
  });

  it('reveals requirement rows after clicking the header', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    const header = screen.getByRole('button', { name: /strategy audit/i });
    fireEvent.click(header);
    expect(screen.getByText('Enterprise SaaS leadership')).toBeInTheDocument();
    expect(screen.getByText('AI/ML product ownership')).toBeInTheDocument();
    expect(screen.getByText('Board-level reporting')).toBeInTheDocument();
  });

  it('hides requirement rows again after a second header click', () => {
    const { container } = render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    const header = screen.getByRole('button', { name: /strategy audit/i });
    fireEvent.click(header);
    // After first click, rows should be visible (no aria-hidden on outer container)
    expect(container.querySelector('[data-strategy-audit] > div[aria-hidden="false"]')).not.toBeNull();
    fireEvent.click(header);
    // After second click, rows should be hidden again
    expect(container.querySelector('[data-strategy-audit] > div[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('StrategyAuditCard — importance badges', () => {
  it('shows "Must Have" badge for must_have requirements', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));
    expect(screen.getAllByText('Must Have').length).toBeGreaterThan(0);
  });

  it('shows "Important" badge for important requirements', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));
    expect(screen.getAllByText('Important').length).toBeGreaterThan(0);
  });

  it('shows "Nice to Have" badge for nice_to_have requirements', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));
    expect(screen.getAllByText('Nice to Have').length).toBeGreaterThan(0);
  });
});

describe('StrategyAuditCard — status indicators', () => {
  it('shows "Direct Match" for strong entries', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));
    expect(screen.getByText('Direct Match')).toBeInTheDocument();
  });

  it('shows "Positioned" for repositioned entries', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));
    // "Positioned" appears both in summary badge and in the status indicator
    expect(screen.getAllByText('Positioned').length).toBeGreaterThan(0);
  });

  it('shows "Gap" for gap entries', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));
    expect(screen.getByText('Gap')).toBeInTheDocument();
  });
});

describe('StrategyAuditCard — row expansion', () => {
  it('shows strategy_used text when a repositioned row is expanded', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    // Expand the card to see rows
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));

    // Find the row button for the repositioned requirement and expand it
    const repositionedRowBtn = screen.getByRole('button', {
      name: /AI\/ML product ownership/i,
    });
    fireEvent.click(repositionedRowBtn);

    expect(
      screen.getByText('Framed ML tooling ownership as AI product delivery'),
    ).toBeInTheDocument();
  });

  it('shows addressed_by bullet text for a strong row after expansion', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));

    const strongRowBtn = screen.getByRole('button', {
      name: /Enterprise SaaS leadership/i,
    });
    fireEvent.click(strongRowBtn);

    // Bullet text is rendered inside curly quotes (\u201c...\u201d) — use regex for partial match
    expect(
      screen.getByText(/Led SaaS product team of 12 across 3 geographies/i),
    ).toBeInTheDocument();
  });

  it('shows the gap fallback message for a gap row with no bullets', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));

    const gapRowBtn = screen.getByRole('button', {
      name: /Board-level reporting/i,
    });
    fireEvent.click(gapRowBtn);

    expect(
      screen.getByText(/No bullets address this requirement/i),
    ).toBeInTheDocument();
  });

  it('shows gap positioning strategy when gap analysis provides one', () => {
    render(
      <StrategyAuditCard
        positioningAssessment={makePositioningAssessment()}
        gapAnalysis={makeGapAnalysis()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /strategy audit/i }));

    const repositionedRowBtn = screen.getByRole('button', {
      name: /AI\/ML product ownership/i,
    });
    fireEvent.click(repositionedRowBtn);

    expect(
      screen.getByText('Highlight ML tooling ownership'),
    ).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WhatChangedCard
// ─────────────────────────────────────────────────────────────────────────────

describe('WhatChangedCard — no changes', () => {
  it('returns null when the two resumes are identical', () => {
    const resume = makeResumeDraft('same');
    const { container } = render(
      <WhatChangedCard
        previousResume={resume}
        currentResume={resume}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('WhatChangedCard — summary counts', () => {
  it('shows added count when bullets are added', () => {
    // Build prev and curr from the same base so only the new bullet differs
    const base = makeResumeDraft('shared');
    const curr: ResumeDraft = {
      ...base,
      professional_experience: [
        {
          ...base.professional_experience[0],
          bullets: [
            ...base.professional_experience[0].bullets,
            { text: 'Brand new achievement added in rerun', is_new: true, addresses_requirements: [] },
          ],
        },
      ],
    };
    render(
      <WhatChangedCard
        previousResume={base}
        currentResume={curr}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('added')).toBeInTheDocument();
  });

  it('shows removed count when bullets are removed', () => {
    const prev = makeResumeDraft('prev');
    const curr: ResumeDraft = {
      ...makeResumeDraft('curr'),
      professional_experience: [
        {
          ...makeResumeDraft('curr').professional_experience[0],
          bullets: [
            // Only one of the two original bullets survives
            { text: 'Shipped 3 major product lines prev', is_new: false, addresses_requirements: [] },
          ],
        },
      ],
    };
    render(
      <WhatChangedCard
        previousResume={prev}
        currentResume={curr}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('removed')).toBeInTheDocument();
  });

  it('shows modified count when the executive summary changes', () => {
    const prev = makeResumeDraft('prev');
    const curr: ResumeDraft = {
      ...prev,
      executive_summary: {
        content: 'Completely different summary with new positioning angle.',
        is_new: true,
      },
    };
    render(
      <WhatChangedCard
        previousResume={prev}
        currentResume={curr}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('modified')).toBeInTheDocument();
  });
});

describe('WhatChangedCard — dismiss', () => {
  it('calls onDismiss when the "Got it" button is clicked', () => {
    const onDismiss = vi.fn();
    const prev = makeResumeDraft('prev');
    const curr: ResumeDraft = {
      ...prev,
      core_competencies: [...prev.core_competencies, 'New Competency'],
    };
    render(
      <WhatChangedCard
        previousResume={prev}
        currentResume={curr}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when the X icon button is clicked', () => {
    const onDismiss = vi.fn();
    const prev = makeResumeDraft('prev');
    const curr: ResumeDraft = {
      ...prev,
      core_competencies: [...prev.core_competencies, 'New Competency'],
    };
    render(
      <WhatChangedCard
        previousResume={prev}
        currentResume={curr}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss changes summary/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('WhatChangedCard — bullet colours', () => {
  it('shows added bullets in the green colour class when details are expanded', () => {
    const prev: ResumeDraft = {
      ...makeResumeDraft('prev'),
      professional_experience: [
        {
          company: 'Acme Corp',
          title: 'VP Engineering',
          start_date: 'Jan 2020',
          end_date: 'Present',
          scope_statement: 'Led org of 45',
          bullets: [
            { text: 'Shipped 3 major product lines prev', is_new: false, addresses_requirements: [] },
          ],
        },
      ],
    };
    const curr: ResumeDraft = {
      ...makeResumeDraft('curr'),
      professional_experience: [
        {
          company: 'Acme Corp',
          title: 'VP Engineering',
          start_date: 'Jan 2020',
          end_date: 'Present',
          scope_statement: 'Led org of 45',
          bullets: [
            { text: 'Shipped 3 major product lines prev', is_new: false, addresses_requirements: [] },
            { text: 'Freshly added achievement here', is_new: true, addresses_requirements: [] },
          ],
        },
      ],
    };

    render(
      <WhatChangedCard
        previousResume={prev}
        currentResume={curr}
        onDismiss={vi.fn()}
      />,
    );

    // Details are expanded by default in jsdom (window.innerWidth >= 640)
    // No click needed — check the content is directly visible
    const addedText = screen.getByText('Freshly added achievement here');
    // The wrapping div carries the green background class
    expect(addedText.closest('div')?.className).toContain('bg-[#b5dec2]');
  });

  it('shows removed bullets in the red colour class when details are expanded', () => {
    const prev: ResumeDraft = {
      ...makeResumeDraft('prev'),
      professional_experience: [
        {
          company: 'Acme Corp',
          title: 'VP Engineering',
          start_date: 'Jan 2020',
          end_date: 'Present',
          scope_statement: 'Led org of 45',
          bullets: [
            { text: 'This bullet will be removed in rerun', is_new: false, addresses_requirements: [] },
            { text: 'Stable bullet that survives', is_new: false, addresses_requirements: [] },
          ],
        },
      ],
    };
    const curr: ResumeDraft = {
      ...makeResumeDraft('curr'),
      professional_experience: [
        {
          company: 'Acme Corp',
          title: 'VP Engineering',
          start_date: 'Jan 2020',
          end_date: 'Present',
          scope_statement: 'Led org of 45',
          bullets: [
            { text: 'Stable bullet that survives', is_new: false, addresses_requirements: [] },
          ],
        },
      ],
    };

    render(
      <WhatChangedCard
        previousResume={prev}
        currentResume={curr}
        onDismiss={vi.fn()}
      />,
    );

    // Details are expanded by default in jsdom (window.innerWidth >= 640)
    // No click needed — check the content is directly visible
    const removedText = screen.getByText('This bullet will be removed in rerun');
    expect(removedText.closest('div')?.className).toContain('bg-[#f0b8b8]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// StrategyPlacementCard
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyPlacementCard — null / empty cases', () => {
  it('returns null when positioningMap is an empty array', () => {
    const { container } = render(<StrategyPlacementCard positioningMap={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when positioningMap is null', () => {
    // Cast to satisfy TS — guards must handle this at runtime
    const { container } = render(
      <StrategyPlacementCard positioningMap={null as unknown as GapPositioningMapEntry[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when positioningMap is undefined', () => {
    const { container } = render(
      <StrategyPlacementCard positioningMap={undefined as unknown as GapPositioningMapEntry[]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('StrategyPlacementCard — content rendering', () => {
  it('renders the requirement text for each entry', () => {
    render(<StrategyPlacementCard positioningMap={makePositioningMap()} />);
    expect(screen.getByText('Enterprise SaaS leadership')).toBeInTheDocument();
    expect(screen.getByText('AI/ML product ownership')).toBeInTheDocument();
  });

  it('renders the where_to_feature destination for each entry', () => {
    render(<StrategyPlacementCard positioningMap={makePositioningMap()} />);
    // where_to_feature text appears in both the PlacementRow and the Sections Affected list
    expect(screen.getAllByText('Executive Summary + Acme bullet 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta Inc bullets 2–4').length).toBeGreaterThan(0);
  });

  it('renders narrative_positioning inside the details element', () => {
    const { container } = render(
      <StrategyPlacementCard positioningMap={makePositioningMap()} />,
    );
    // Open the native <details> element for the first entry
    const detailsEls = container.querySelectorAll('details');
    expect(detailsEls.length).toBe(2);

    // The text is in the DOM even when <details> is closed (just not visible)
    expect(
      screen.getByText('Position as SaaS general manager, not just technical lead'),
    ).toBeInTheDocument();
  });

  it('renders narrative_justification inside the details element', () => {
    render(<StrategyPlacementCard positioningMap={makePositioningMap()} />);
    expect(
      screen.getByText('GM framing aligns with the board-level expectations in the JD'),
    ).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NarrativeStrategyCard
// ─────────────────────────────────────────────────────────────────────────────

describe('NarrativeStrategyCard — primary content', () => {
  it('renders the branded_title', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    expect(screen.getByText('Enterprise AI Product Leader')).toBeInTheDocument();
  });

  it('renders the primary_narrative', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    expect(
      screen.getByText('Executive who turns AI complexity into repeatable product value'),
    ).toBeInTheDocument();
  });

  it('renders supporting_themes as chips', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    expect(screen.getByText('AI Delivery')).toBeInTheDocument();
    expect(screen.getByText('SaaS Scale')).toBeInTheDocument();
    expect(screen.getByText('Cross-Functional Leadership')).toBeInTheDocument();
  });

  it('renders why_me_concise', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    expect(
      screen.getByText(
        'I close the gap between AI research and product revenue faster than anyone in my peer set.',
      ),
    ).toBeInTheDocument();
  });

  it('renders why_me_best_line wrapped in quotes', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    // The component wraps the line in ldquo/rdquo entities
    const bestLine = screen.getByText(
      /I make AI products that actually ship, scale, and sell\./,
    );
    expect(bestLine).toBeInTheDocument();
  });
});

describe('NarrativeStrategyCard — narrative_angle_rationale', () => {
  it('renders narrative_angle_rationale when present', () => {
    const data = makeNarrativeStrategy({
      narrative_angle_rationale:
        'This angle was chosen because the JD emphasises transformation over maintenance.',
    });
    render(<NarrativeStrategyCard data={data} />);
    expect(
      screen.getByText(
        'This angle was chosen because the JD emphasises transformation over maintenance.',
      ),
    ).toBeInTheDocument();
  });

  it('does not render the rationale block when narrative_angle_rationale is absent', () => {
    const data = makeNarrativeStrategy({ narrative_angle_rationale: undefined });
    render(<NarrativeStrategyCard data={data} />);
    expect(
      screen.queryByText(
        'This angle was chosen because the JD emphasises transformation over maintenance.',
      ),
    ).not.toBeInTheDocument();
  });

  it('does not render the rationale block when narrative_angle_rationale is an empty string', () => {
    const data = makeNarrativeStrategy({ narrative_angle_rationale: '' });
    render(<NarrativeStrategyCard data={data} />);
    // An empty string is falsy — the block should not render
    // Verify by checking no Lightbulb icon sibling text leaks through
    const lightbulbContainers = document
      .querySelectorAll('[aria-hidden="true"]');
    // None of them should have empty adjacent text matching a rationale paragraph
    for (const el of lightbulbContainers) {
      const sibling = el.nextElementSibling;
      if (sibling) {
        expect(sibling.textContent).not.toBe('');
      }
    }
  });
});

describe('NarrativeStrategyCard — unique_differentiators', () => {
  it('renders unique_differentiators chips when present', () => {
    const data = makeNarrativeStrategy({
      unique_differentiators: ['AI-first operator', 'Revenue-linked engineer', 'Bi-modal thinker'],
    });
    render(<NarrativeStrategyCard data={data} />);
    expect(screen.getByText('AI-first operator')).toBeInTheDocument();
    expect(screen.getByText('Revenue-linked engineer')).toBeInTheDocument();
    expect(screen.getByText('Bi-modal thinker')).toBeInTheDocument();
  });

  it('does not render the "What Sets You Apart" section when unique_differentiators is absent', () => {
    const data = makeNarrativeStrategy({ unique_differentiators: undefined });
    render(<NarrativeStrategyCard data={data} />);
    expect(screen.queryByText(/what sets you apart/i)).not.toBeInTheDocument();
  });

  it('does not render the section when unique_differentiators is an empty array', () => {
    const data = makeNarrativeStrategy({ unique_differentiators: [] });
    render(<NarrativeStrategyCard data={data} />);
    expect(screen.queryByText(/what sets you apart/i)).not.toBeInTheDocument();
  });
});

describe('NarrativeStrategyCard — interview_talking_points', () => {
  it('renders interview_talking_points inside a details element when present', () => {
    const data = makeNarrativeStrategy({
      interview_talking_points: [
        'Explain how you delivered AI products faster than competitors',
        'Describe your approach to bridging research and revenue',
      ],
    });
    render(<NarrativeStrategyCard data={data} />);
    expect(
      screen.getByText('Explain how you delivered AI products faster than competitors'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Describe your approach to bridging research and revenue'),
    ).toBeInTheDocument();
  });

  it('does not render the talking points section when interview_talking_points is absent', () => {
    const data = makeNarrativeStrategy({ interview_talking_points: undefined });
    render(<NarrativeStrategyCard data={data} />);
    expect(screen.queryByText(/prepare for these conversations/i)).not.toBeInTheDocument();
  });

  it('does not render the talking points section when the array is empty', () => {
    const data = makeNarrativeStrategy({ interview_talking_points: [] });
    render(<NarrativeStrategyCard data={data} />);
    expect(screen.queryByText(/prepare for these conversations/i)).not.toBeInTheDocument();
  });
});

describe('NarrativeStrategyCard — section_guidance', () => {
  it('renders the summary_angle inside the collapsed details section', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    // The text is in the DOM regardless of open/closed state of <details>
    expect(
      screen.getByText('Lead with AI product delivery credibility'),
    ).toBeInTheDocument();
  });

  it('renders competency_themes chips inside the details section', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    expect(screen.getByText('Machine Learning Delivery')).toBeInTheDocument();
    expect(screen.getByText('Platform Strategy')).toBeInTheDocument();
  });

  it('renders accomplishment_priorities inside the details section', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    expect(screen.getByText('$400M ARR product launch')).toBeInTheDocument();
    expect(screen.getByText('ML pipeline at scale')).toBeInTheDocument();
  });

  it('renders experience framing company names inside the details section', () => {
    render(<NarrativeStrategyCard data={makeNarrativeStrategy()} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
  });
});
