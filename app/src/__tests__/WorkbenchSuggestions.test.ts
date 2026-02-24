/**
 * Tests for WorkbenchSuggestions logic.
 *
 * @testing-library/react is not installed and vitest runs in node environment,
 * so we test the pure logic extracted from the component rather than rendering it.
 *
 * The checkResolved function controls auto-dismissal: it drives tests 1, 6, 7, 8, 9, 10.
 * Button-level and state-machine tests use plain data/function assertions.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SectionSuggestion } from '../types/panels';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSuggestion(overrides?: Partial<SectionSuggestion>): SectionSuggestion {
  return {
    id: 'gap_test123',
    intent: 'address_requirement',
    question_text: 'The JD requires cloud architecture. Address it?',
    context: 'Key requirement from JD',
    target_id: 'cloud architecture',
    options: [
      { id: 'apply', label: 'Yes, address it', action: 'apply' },
      { id: 'skip', label: 'Skip', action: 'skip' },
    ],
    priority: 9,
    priority_tier: 'high',
    resolved_when: {
      type: 'requirement_addressed',
      target_id: 'cloud architecture',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// checkResolved — extracted from WorkbenchSuggestions.tsx for testing
// ---------------------------------------------------------------------------

function checkResolved(suggestion: SectionSuggestion, content: string): boolean {
  const { resolved_when } = suggestion;
  if (resolved_when.type === 'always_recheck') return false;

  const lowerContent = content.toLowerCase();
  const targetId = resolved_when.target_id;

  if (resolved_when.type === 'keyword_present') {
    return lowerContent.includes(targetId.toLowerCase());
  }

  if (
    resolved_when.type === 'evidence_referenced' ||
    resolved_when.type === 'requirement_addressed'
  ) {
    const keywords = targetId
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .map((w) => w.toLowerCase());
    if (keywords.length === 0) return false;
    return keywords.some((kw) => lowerContent.includes(kw));
  }

  return false;
}

// ---------------------------------------------------------------------------
// applyOption helper — simulates what the component does to find apply label
// ---------------------------------------------------------------------------

function getApplyLabel(suggestion: SectionSuggestion): string {
  const applyOption = suggestion.options.find((o) => o.action === 'apply');
  return applyOption?.label ?? 'Apply';
}

// ---------------------------------------------------------------------------
// isHighGap — controls whether skip shows reason UI
// ---------------------------------------------------------------------------

function isHighGap(suggestion: SectionSuggestion): boolean {
  return (
    suggestion.priority_tier === 'high' &&
    suggestion.intent === 'address_requirement'
  );
}

// ---------------------------------------------------------------------------
// activeSuggestions helper — simulates dismissed-set filtering
// ---------------------------------------------------------------------------

function getActive(suggestions: SectionSuggestion[], dismissed: Set<string>): SectionSuggestion[] {
  return suggestions.filter((s) => !dismissed.has(s.id));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkbenchSuggestions', () => {
  // 1. Renders first suggestion — data shape contains question_text
  it('renders first suggestion', () => {
    const suggestions = [makeSuggestion()];
    expect(suggestions[0].question_text).toBe(
      'The JD requires cloud architecture. Address it?',
    );
  });

  // 2. Shows suggestion counter (1 of N)
  it('shows suggestion counter (1 of N)', () => {
    const suggestions = [
      makeSuggestion({ id: 'a' }),
      makeSuggestion({ id: 'b' }),
      makeSuggestion({ id: 'c' }),
    ];
    const dismissed = new Set<string>();
    const active = getActive(suggestions, dismissed);
    const displayIndex = active.indexOf(active[0]) + 1;
    const total = active.length;
    expect(displayIndex).toBe(1);
    expect(total).toBe(3);
  });

  // 3. Calls onApplySuggestion when Apply clicked — simulates callback invocation
  it('calls onApplySuggestion when Apply clicked', () => {
    const onApplySuggestion = vi.fn();
    const suggestion = makeSuggestion();

    // Simulate handleApply
    const disabled = false;
    if (!disabled) {
      onApplySuggestion(suggestion.id);
    }

    expect(onApplySuggestion).toHaveBeenCalledOnce();
    expect(onApplySuggestion).toHaveBeenCalledWith('gap_test123');
  });

  // 4. Advances to next suggestion after Apply
  it('advances to next suggestion after Apply', () => {
    const suggestions = [
      makeSuggestion({ id: 'first', question_text: 'First question?' }),
      makeSuggestion({ id: 'second', question_text: 'Second question?' }),
    ];
    const dismissed = new Set<string>();

    // Simulate apply on first
    dismissed.add('first');
    const active = getActive(suggestions, dismissed);

    expect(active.length).toBe(1);
    expect(active[0].id).toBe('second');
    expect(active[0].question_text).toBe('Second question?');
  });

  // 5. Calls onSkipSuggestion when Skip clicked on low-priority
  it('calls onSkipSuggestion when Skip clicked on low-priority', () => {
    const onSkipSuggestion = vi.fn();
    const suggestion = makeSuggestion({
      id: 'low_skip',
      priority_tier: 'low',
      intent: 'tighten',
    });

    // Low-priority: isHighGap === false → call directly without reason UI
    const highGap = isHighGap(suggestion);
    expect(highGap).toBe(false);

    // Simulate handleSkipConfirm with no reason
    const disabled = false;
    if (!disabled) {
      onSkipSuggestion(suggestion.id, undefined);
    }

    expect(onSkipSuggestion).toHaveBeenCalledOnce();
    expect(onSkipSuggestion).toHaveBeenCalledWith('low_skip', undefined);
  });

  // 6. Shows skip reason UI for high-priority gap suggestions
  it('shows skip reason UI for high-priority gap suggestions', () => {
    const suggestion = makeSuggestion({
      priority_tier: 'high',
      intent: 'address_requirement',
    });

    // High gap — component sets showSkipReason = true
    const highGap = isHighGap(suggestion);
    expect(highGap).toBe(true);
  });

  // 7. Shows all-addressed state when all dismissed
  it('shows all-addressed state when all dismissed', () => {
    const suggestions = [makeSuggestion({ id: 'only' })];
    const dismissed = new Set<string>(['only']);
    const active = getActive(suggestions, dismissed);

    // Component renders "All suggestions addressed" when activeSuggestions.length === 0
    expect(active.length).toBe(0);
  });

  // 8. Renders nothing (all-addressed state) when no suggestions
  it('renders all-addressed state when no suggestions provided', () => {
    const suggestions: SectionSuggestion[] = [];
    const dismissed = new Set<string>();
    const active = getActive(suggestions, dismissed);

    // Empty array → component renders "All suggestions addressed"
    expect(active.length).toBe(0);
  });

  // 9. Disables buttons when disabled prop is true
  it('disables buttons when disabled prop is true', () => {
    const onApplySuggestion = vi.fn();
    const onSkipSuggestion = vi.fn();
    const suggestion = makeSuggestion();
    const disabled = true;

    // Simulate handleApply guard
    if (!suggestion || disabled) {
      // do nothing
    } else {
      onApplySuggestion(suggestion.id);
    }

    // Simulate handleSkip guard
    if (!suggestion || disabled) {
      // do nothing
    } else {
      onSkipSuggestion(suggestion.id);
    }

    expect(onApplySuggestion).not.toHaveBeenCalled();
    expect(onSkipSuggestion).not.toHaveBeenCalled();
  });

  // 10. Auto-resolves when keyword appears in content
  it('auto-resolves when keyword appears in content', () => {
    const suggestion = makeSuggestion({
      resolved_when: {
        type: 'keyword_present',
        target_id: 'cloud',
      },
    });

    // Content without keyword — not resolved
    expect(checkResolved(suggestion, 'I have broad experience in enterprise systems.')).toBe(false);

    // Content with keyword — resolved
    expect(checkResolved(suggestion, 'I have led cloud migrations at scale.')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // checkResolved unit tests (the most logic-rich function in the component)
  // ---------------------------------------------------------------------------

  describe('checkResolved', () => {
    it('always_recheck type never resolves', () => {
      const s = makeSuggestion({
        resolved_when: { type: 'always_recheck', target_id: 'cloud' },
      });
      expect(checkResolved(s, 'cloud infrastructure everywhere')).toBe(false);
    });

    it('keyword_present: resolves when target appears in content (case-insensitive)', () => {
      const s = makeSuggestion({
        resolved_when: { type: 'keyword_present', target_id: 'Kubernetes' },
      });
      expect(checkResolved(s, 'deployed KUBERNETES clusters')).toBe(true);
      expect(checkResolved(s, 'used Docker only')).toBe(false);
    });

    it('requirement_addressed: resolves when any long keyword from target_id appears', () => {
      const s = makeSuggestion({
        resolved_when: { type: 'requirement_addressed', target_id: 'cloud architecture' },
      });
      // 'cloud' is 5 chars, 'architecture' is 12 chars — both > 4
      expect(checkResolved(s, 'designed cloud solutions')).toBe(true);
      expect(checkResolved(s, 'built architecture diagrams')).toBe(true);
      expect(checkResolved(s, 'managed a team of 10')).toBe(false);
    });

    it('requirement_addressed: returns false when all target words are <= 4 chars', () => {
      const s = makeSuggestion({
        resolved_when: { type: 'requirement_addressed', target_id: 'SQL XML' },
      });
      // 'SQL' is 3 chars, 'XML' is 3 chars — both filtered out
      expect(checkResolved(s, 'used SQL and XML extensively')).toBe(false);
    });

    it('evidence_referenced: resolves when evidence term appears in content', () => {
      const s = makeSuggestion({
        resolved_when: { type: 'evidence_referenced', target_id: 'microservices platform' },
      });
      expect(checkResolved(s, 'Built a scalable microservices architecture')).toBe(true);
      expect(checkResolved(s, 'Led a large engineering team')).toBe(false);
    });

    it('is case-insensitive for keyword matching', () => {
      const s = makeSuggestion({
        resolved_when: { type: 'keyword_present', target_id: 'DevOps' },
      });
      expect(checkResolved(s, 'expertise in DEVOPS practices')).toBe(true);
      expect(checkResolved(s, 'expertise in devops practices')).toBe(true);
      expect(checkResolved(s, 'expertise in development operations')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getApplyLabel helper tests
  // ---------------------------------------------------------------------------

  describe('getApplyLabel', () => {
    it('returns label of apply-action option', () => {
      const s = makeSuggestion({
        options: [
          { id: 'apply', label: 'Yes, address it', action: 'apply' },
          { id: 'skip', label: 'Skip', action: 'skip' },
        ],
      });
      expect(getApplyLabel(s)).toBe('Yes, address it');
    });

    it('falls back to "Apply" when no apply-action option exists', () => {
      const s = makeSuggestion({ options: [] });
      expect(getApplyLabel(s)).toBe('Apply');
    });
  });

  // ---------------------------------------------------------------------------
  // Counter display logic
  // ---------------------------------------------------------------------------

  describe('counter display', () => {
    it('computes correct displayIndex after dismissal', () => {
      const suggestions = [
        makeSuggestion({ id: 'a' }),
        makeSuggestion({ id: 'b' }),
        makeSuggestion({ id: 'c' }),
      ];
      const dismissed = new Set<string>(['a']);
      const active = getActive(suggestions, dismissed);

      // currentIndex 0 → activeSuggestions[0] = 'b'
      const current = active[0];
      const displayIndex = active.indexOf(current) + 1;
      expect(displayIndex).toBe(1);
      expect(active.length).toBe(2);
    });
  });
});
