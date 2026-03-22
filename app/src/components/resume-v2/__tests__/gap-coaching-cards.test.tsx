// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { WhatChangedCard } from '../cards/WhatChangedCard';
import { NarrativeStrategyCard } from '../cards/NarrativeStrategyCard';

import type {
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
    expect(screen.queryByText(/points to emphasize/i)).not.toBeInTheDocument();
  });

  it('does not render the section when unique_differentiators is an empty array', () => {
    const data = makeNarrativeStrategy({ unique_differentiators: [] });
    render(<NarrativeStrategyCard data={data} />);
    expect(screen.queryByText(/points to emphasize/i)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/talking points to keep in mind/i)).not.toBeInTheDocument();
  });

  it('does not render the talking points section when the array is empty', () => {
    const data = makeNarrativeStrategy({ interview_talking_points: [] });
    render(<NarrativeStrategyCard data={data} />);
    expect(screen.queryByText(/talking points to keep in mind/i)).not.toBeInTheDocument();
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
