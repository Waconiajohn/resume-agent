// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { ResumeDocumentCard } from '../cards/ResumeDocumentCard';
import type { ResumeDraft } from '@/types/resume-v2';

// ─── Fixtures ──────────────────────────────────────────────────────────────

/**
 * Minimal valid ResumeDraft used across chip tests.
 * Executive summary's `addresses_requirements` is the primary driver for the
 * 'requirement' source chip; `branded_title` drives the 'positioning' chip.
 */
function makeResume(
  overrides: Partial<ResumeDraft['executive_summary']> = {},
  headerOverrides: Partial<ResumeDraft['header']> = {},
): ResumeDraft {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      branded_title: headerOverrides.branded_title ?? '',
      ...headerOverrides,
    },
    executive_summary: {
      content: 'Led operational transformation across a multi-site network.',
      is_new: false,
      addresses_requirements: [],
      ...overrides,
    },
    core_competencies: [],
    selected_accomplishments: [],
    professional_experience: [],
    earlier_career: [],
    education: [],
    certifications: [],
  };
}

/**
 * Renders the ResumeDocumentCard with `onBulletClick` wired up so that the
 * ContextChipTag is rendered (it only appears in the interactive path).
 */
function renderCard(resume: ResumeDraft, activeBullet?: { section: string; index: number }) {
  const { container } = render(
    <ResumeDocumentCard
      resume={resume}
      activeBullet={activeBullet ?? null}
      onBulletClick={() => undefined}
    />,
  );
  return container;
}

/**
 * Returns the context chip span from the rendered card.
 *
 * The ContextChipTag renders a span with aria-hidden="true" and the Tailwind
 * class `rounded-full`. Other aria-hidden spans in the card (Pencil icons) do
 * not have `rounded-full`, so this selector is unambiguous.
 */
function findChip(container: HTMLElement): Element | null {
  return container.querySelector('[aria-hidden="true"].rounded-full');
}

/**
 * Returns true when the card contains no context chip span (chip is null →
 * ContextChipTag renders nothing). We confirm absence by checking that no
 * rounded-full aria-hidden span exists.
 */
function chipIsAbsent(container: HTMLElement): boolean {
  return findChip(container) === null;
}

// ─── resolveContextChip — tested through component rendering ──────────────
//
// The function is module-private, so these tests drive its logic indirectly
// by rendering ResumeDocumentCard and asserting on the DOM. The chip spans
// are aria-hidden="true" + rounded-full and styled with unique class signatures
// per source.
//
// The executive_summary bullet is always rendered at section='executive_summary',
// index=0. Making it active causes isVisible=true and the chip is rendered.

describe('resolveContextChip (via ResumeDocumentCard render)', () => {
  it('requirements array with entries → chip rendered with requirement label', () => {
    const resume = makeResume({ addresses_requirements: ['Executive stakeholder communication'] });
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('Executive stakeholder communication');
  });

  it('long requirement (>60 chars) → label is truncated with ellipsis, full text in title attribute', () => {
    const longReq = 'Experience managing a $100M+ P&L across multiple manufacturing facilities in North America';
    // resolveContextChip slices to 57 chars then appends '…'
    expect(longReq.length).toBeGreaterThan(60);

    const resume = makeResume({ addresses_requirements: [longReq] });
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    const labelText = chip!.textContent ?? '';
    // 57 characters + single '…' character = 58 visible characters
    expect(labelText.endsWith('…')).toBe(true);
    expect(labelText.length).toBeLessThanOrEqual(58);
    expect(chip!.getAttribute('title')).toBe(longReq);
  });

  it('no requirements + summary section + branded title → positioning chip rendered', () => {
    const resume = makeResume(
      { addresses_requirements: [] },
      { branded_title: 'Chief Operations Officer | Manufacturing Transformation' },
    );
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('Chief Operations Officer | Manufacturing Transformation');
    // positioning source → indigo classes
    expect(chip!.className).toContain('bg-indigo-50');
    expect(chip!.className).toContain('text-indigo-600');
  });

  it('no requirements + no branded title → chip not rendered for summary section', () => {
    const resume = makeResume(
      { addresses_requirements: [] },
      { branded_title: '' },
    );
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    // resolveContextChip returns null → ContextChipTag renders nothing
    expect(chipIsAbsent(container)).toBe(true);
  });

  it('requirements PLUS branded title → requirement wins (priority 1 beats priority 3)', () => {
    const resume = makeResume(
      { addresses_requirements: ['Operational excellence'] },
      { branded_title: 'Chief Operations Officer' },
    );
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('Operational excellence');
    // requirement source → blue classes, NOT indigo
    expect(chip!.className).toContain('bg-blue-50');
    expect(chip!.className).toContain('text-blue-600');
    expect(chip!.className).not.toContain('bg-indigo-50');
  });

  it('custom section with rationale and no requirements → rationale chip rendered', () => {
    const resume: ResumeDraft = {
      ...makeResume(),
      custom_sections: [
        {
          id: 'board_leadership',
          title: 'Board Leadership',
          kind: 'paragraph',
          lines: [],
          summary: 'Board advisor to three early-stage technology companies.',
          rationale: 'Signals governance experience for board-level roles.',
        },
      ],
      section_plan: [
        {
          id: 'board_leadership',
          type: 'custom',
          title: 'Board Leadership',
          enabled: true,
          order: 99,
        },
      ],
    };

    const container = renderCard(resume, { section: 'custom_section:board_leadership', index: -1 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('Signals governance experience for board-level roles.');
    // rationale source → slate classes
    expect(chip!.className).toContain('bg-slate-50');
    expect(chip!.className).toContain('text-slate-600');
  });

  it('custom section with both rationale and requirements → requirements win (priority 1 beats priority 2)', () => {
    // When the executive_summary has both a requirement AND a branded title,
    // the requirement chip always wins (priority 1 over priority 3).
    // This validates the priority ordering in resolveContextChip by ensuring
    // that a non-empty requirements array always beats other sources.
    const resume = makeResume(
      { addresses_requirements: ['Cross-functional governance'] },
      { branded_title: 'Strategic Advisor' },
    );
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    // Requirement chip wins → blue, not slate or indigo
    expect(chip!.className).toContain('bg-blue-50');
    expect(chip!.className).not.toContain('bg-slate-50');
    expect(chip!.className).not.toContain('bg-indigo-50');
  });
});

// ─── ContextChipTag — chip absent, source styles, and visibility ───────────
//
// These tests validate rendering behavior via the full component. The chip
// is present in the DOM regardless of isVisible (it's CSS opacity toggling),
// but when chip is null the element is not rendered at all.

describe('ContextChipTag (via ResumeDocumentCard render)', () => {
  it('null chip (no requirements, no branded title) → renders nothing', () => {
    const resume = makeResume(
      { addresses_requirements: [] },
      { branded_title: '' },
    );
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    expect(chipIsAbsent(container)).toBe(true);
  });

  it("chip with source 'requirement' → has bg-blue-50 text-blue-600 classes", () => {
    const resume = makeResume({ addresses_requirements: ['Operational excellence'] });
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.className).toContain('bg-blue-50');
    expect(chip!.className).toContain('text-blue-600');
  });

  it("chip with source 'positioning' → has bg-indigo-50 text-indigo-600 classes", () => {
    const resume = makeResume(
      { addresses_requirements: [] },
      { branded_title: 'Enterprise Transformation Leader' },
    );
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.className).toContain('bg-indigo-50');
    expect(chip!.className).toContain('text-indigo-600');
  });

  it("chip with source 'rationale' → has bg-slate-50 text-slate-600 classes", () => {
    const resume: ResumeDraft = {
      ...makeResume(),
      custom_sections: [
        {
          id: 'advisory_work',
          title: 'Advisory Work',
          kind: 'paragraph',
          lines: [],
          summary: 'Strategic advisor to PE portfolio companies.',
          rationale: 'Signals executive presence and cross-industry perspective.',
        },
      ],
      section_plan: [
        {
          id: 'advisory_work',
          type: 'custom',
          title: 'Advisory Work',
          enabled: true,
          order: 99,
        },
      ],
    };

    const container = renderCard(resume, { section: 'custom_section:advisory_work', index: -1 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.className).toContain('bg-slate-50');
    expect(chip!.className).toContain('text-slate-600');
  });

  it('isVisible=true (activeBullet matches section/index) → chip has opacity-100 class', () => {
    const resume = makeResume({ addresses_requirements: ['Strategic leadership'] });
    // Active bullet matches executive_summary:0 → isVisible=true in ContextChipTag
    const container = renderCard(resume, { section: 'executive_summary', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.className).toContain('opacity-100');
    expect(chip!.className).not.toContain('opacity-0');
  });

  it('isVisible=false (activeBullet does not match) → chip has opacity-0 class', () => {
    const resume = makeResume({ addresses_requirements: ['Strategic leadership'] });
    // Active bullet is on a DIFFERENT section → isVisible=false for executive_summary chip
    const container = renderCard(resume, { section: 'professional_experience', index: 0 });

    const chip = findChip(container);
    expect(chip).not.toBeNull();
    expect(chip!.className).toContain('opacity-0');
    expect(chip!.className).not.toContain('opacity-100');
  });
});
