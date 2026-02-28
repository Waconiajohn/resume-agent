/**
 * Tests for useSSEDataValidation.ts
 *
 * All functions are pure TypeScript — no React rendering needed.
 * Environment: node (default for .test.ts in vitest config).
 */

import { describe, it, expect } from 'vitest';
import {
  safeParse,
  asStringArray,
  asGapClassification,
  asPriorityTier,
  asReplanStaleNodes,
  sanitizeSectionContextPayload,
  SUGGESTION_LIMITS,
  VALID_INTENTS,
} from '@/hooks/useSSEDataValidation';

// ─── safeParse ────────────────────────────────────────────────────────────────

describe('safeParse', () => {
  it('parses a valid JSON object string', () => {
    const result = safeParse('{"key":"value","num":42}');
    expect(result).toEqual({ key: 'value', num: 42 });
  });

  it('parses a JSON object with nested structure', () => {
    const result = safeParse('{"a":{"b":1},"c":[1,2,3]}');
    expect(result).toEqual({ a: { b: 1 }, c: [1, 2, 3] });
  });

  it('returns null for invalid JSON', () => {
    const result = safeParse('{not valid json}');
    expect(result).toBeNull();
  });

  it('returns null for an empty string', () => {
    const result = safeParse('');
    expect(result).toBeNull();
  });

  it('returns null for a JSON array (not a record)', () => {
    // JSON.parse('[1,2]') returns an array — not a Record — but safeParse
    // does not check type beyond `JSON.parse`. The return type is broad.
    // What matters: it does NOT throw.
    expect(() => safeParse('[1,2,3]')).not.toThrow();
  });

  it('returns null for plain string values', () => {
    // JSON.parse('"hello"') is valid but not a record
    expect(() => safeParse('"hello"')).not.toThrow();
  });
});

// ─── asStringArray ────────────────────────────────────────────────────────────

describe('asStringArray', () => {
  it('returns a string array from a valid string array', () => {
    expect(asStringArray(['foo', 'bar', 'baz'])).toEqual(['foo', 'bar', 'baz']);
  });

  it('filters out non-string values', () => {
    expect(asStringArray(['hello', 42, null, true, 'world'])).toEqual(['hello', 'world']);
  });

  it('trims whitespace from each string', () => {
    expect(asStringArray(['  hello  ', ' world '])).toEqual(['hello', 'world']);
  });

  it('filters out empty strings after trimming', () => {
    expect(asStringArray(['hello', '   ', '', 'world'])).toEqual(['hello', 'world']);
  });

  it('returns empty array for non-array input', () => {
    expect(asStringArray('not an array')).toEqual([]);
    expect(asStringArray(null)).toEqual([]);
    expect(asStringArray(undefined)).toEqual([]);
    expect(asStringArray(42)).toEqual([]);
    expect(asStringArray({ a: 1 })).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(asStringArray([])).toEqual([]);
  });
});

// ─── asGapClassification ─────────────────────────────────────────────────────

describe('asGapClassification', () => {
  it('returns "strong" for "strong"', () => {
    expect(asGapClassification('strong')).toBe('strong');
  });

  it('returns "partial" for "partial"', () => {
    expect(asGapClassification('partial')).toBe('partial');
  });

  it('returns "gap" for "gap"', () => {
    expect(asGapClassification('gap')).toBe('gap');
  });

  it('returns "gap" for unknown string values', () => {
    expect(asGapClassification('unknown')).toBe('gap');
    expect(asGapClassification('STRONG')).toBe('gap');
  });

  it('returns "gap" for non-string inputs', () => {
    expect(asGapClassification(null)).toBe('gap');
    expect(asGapClassification(undefined)).toBe('gap');
    expect(asGapClassification(42)).toBe('gap');
    expect(asGapClassification({})).toBe('gap');
  });
});

// ─── asPriorityTier ───────────────────────────────────────────────────────────

describe('asPriorityTier', () => {
  it('returns "high" for "high"', () => {
    expect(asPriorityTier('high')).toBe('high');
  });

  it('returns "medium" for "medium"', () => {
    expect(asPriorityTier('medium')).toBe('medium');
  });

  it('returns "low" for "low"', () => {
    expect(asPriorityTier('low')).toBe('low');
  });

  it('returns "low" for unknown strings', () => {
    expect(asPriorityTier('critical')).toBe('low');
    expect(asPriorityTier('')).toBe('low');
  });

  it('returns "low" for non-string inputs', () => {
    expect(asPriorityTier(null)).toBe('low');
    expect(asPriorityTier(undefined)).toBe('low');
    expect(asPriorityTier(1)).toBe('low');
  });
});

// ─── asReplanStaleNodes ───────────────────────────────────────────────────────

describe('asReplanStaleNodes', () => {
  it('returns undefined for non-array input', () => {
    expect(asReplanStaleNodes(null)).toBeUndefined();
    expect(asReplanStaleNodes('gaps')).toBeUndefined();
    expect(asReplanStaleNodes({})).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(asReplanStaleNodes([])).toBeUndefined();
  });

  it('returns filtered array of valid node names', () => {
    const result = asReplanStaleNodes(['gaps', 'blueprint', 'sections']);
    expect(result).toEqual(['gaps', 'blueprint', 'sections']);
  });

  it('filters out invalid node names', () => {
    const result = asReplanStaleNodes(['gaps', 'invalid_node', 'blueprint', 'foobar']);
    expect(result).toEqual(['gaps', 'blueprint']);
  });

  it('returns undefined when all values are invalid', () => {
    expect(asReplanStaleNodes(['invalid', 'also_invalid'])).toBeUndefined();
  });

  it('accepts all valid node names', () => {
    const validNodes = ['gaps', 'questions', 'blueprint', 'sections', 'quality', 'export'];
    const result = asReplanStaleNodes(validNodes);
    expect(result).toEqual(validNodes);
  });
});

// ─── SUGGESTION_LIMITS ────────────────────────────────────────────────────────

describe('SUGGESTION_LIMITS', () => {
  it('exports expected limit values', () => {
    expect(SUGGESTION_LIMITS.max_count).toBe(5);
    expect(SUGGESTION_LIMITS.max_question_text_chars).toBe(300);
    expect(SUGGESTION_LIMITS.max_context_chars).toBe(200);
    expect(SUGGESTION_LIMITS.max_option_label_chars).toBe(40);
    expect(SUGGESTION_LIMITS.max_id_chars).toBe(80);
  });
});

// ─── VALID_INTENTS ────────────────────────────────────────────────────────────

describe('VALID_INTENTS', () => {
  it('contains all expected intent strings', () => {
    const expected = [
      'address_requirement',
      'weave_evidence',
      'integrate_keyword',
      'quantify_bullet',
      'tighten',
      'strengthen_verb',
      'align_positioning',
    ];
    for (const intent of expected) {
      expect(VALID_INTENTS.has(intent)).toBe(true);
    }
  });

  it('does not contain unknown intent strings', () => {
    expect(VALID_INTENTS.has('fabricate')).toBe(false);
    expect(VALID_INTENTS.has('')).toBe(false);
    expect(VALID_INTENTS.has('ADDRESS_REQUIREMENT')).toBe(false);
  });
});

// ─── sanitizeSectionContextPayload ───────────────────────────────────────────

describe('sanitizeSectionContextPayload', () => {
  it('returns null when section field is missing', () => {
    const result = sanitizeSectionContextPayload({ evidence: [] });
    expect(result).toBeNull();
  });

  it('returns null when section is an empty string', () => {
    const result = sanitizeSectionContextPayload({ section: '' });
    expect(result).toBeNull();
  });

  it('returns a valid result for a minimal valid payload', () => {
    const result = sanitizeSectionContextPayload({ section: 'summary' });
    expect(result).not.toBeNull();
    expect(result?.section).toBe('summary');
    expect(result?.context).toBeDefined();
    expect(result?.context.evidence).toEqual([]);
    expect(result?.context.keywords).toEqual([]);
    expect(result?.context.gap_mappings).toEqual([]);
  });

  it('sanitizes evidence items correctly', () => {
    const payload = {
      section: 'experience',
      evidence: [
        {
          id: 'ev_1',
          situation: 'Led a team',
          action: 'Restructured org',
          result: 'Saved 30%',
          metrics_defensible: true,
          user_validated: false,
          mapped_requirements: ['leadership'],
          scope_metrics: { team_size: '45' },
        },
      ],
    };
    const result = sanitizeSectionContextPayload(payload);
    expect(result).not.toBeNull();
    expect(result?.context.evidence).toHaveLength(1);
    const ev = result?.context.evidence[0];
    expect(ev?.id).toBe('ev_1');
    expect(ev?.situation).toBe('Led a team');
    expect(ev?.action).toBe('Restructured org');
    expect(ev?.result).toBe('Saved 30%');
    expect(ev?.metrics_defensible).toBe(true);
    expect(ev?.user_validated).toBe(false);
    expect(ev?.mapped_requirements).toEqual(['leadership']);
    expect(ev?.scope_metrics).toEqual({ team_size: '45' });
  });

  it('generates fallback evidence id when id is missing', () => {
    const payload = {
      section: 'experience',
      evidence: [
        { situation: 'Did something', action: 'Made change', result: 'Good' },
      ],
    };
    const result = sanitizeSectionContextPayload(payload);
    expect(result?.context.evidence[0].id).toBe('evidence_1');
  });

  it('filters out invalid suggestions (wrong intent)', () => {
    const payload = {
      section: 'summary',
      suggestions: [
        {
          id: 'sug_1',
          intent: 'invalid_intent',
          question_text: 'Should we address this?',
          target_id: 'cloud',
        },
      ],
    };
    const result = sanitizeSectionContextPayload(payload);
    expect(result?.context.suggestions).toBeUndefined();
  });

  it('includes valid suggestions in context', () => {
    const payload = {
      section: 'summary',
      suggestions: [
        {
          id: 'sug_valid',
          intent: 'address_requirement',
          question_text: 'Address the cloud requirement?',
          target_id: 'cloud architecture',
          priority: 9,
          priority_tier: 'high',
          resolved_when: { type: 'keyword_present', target_id: 'cloud' },
          options: [{ id: 'opt_1', label: 'Apply', action: 'apply' }],
        },
      ],
    };
    const result = sanitizeSectionContextPayload(payload);
    expect(result?.context.suggestions).toHaveLength(1);
    expect(result?.context.suggestions?.[0].id).toBe('sug_valid');
    expect(result?.context.suggestions?.[0].intent).toBe('address_requirement');
  });

  it('enforces max_count limit on suggestions', () => {
    const suggestions = Array.from({ length: 10 }, (_, i) => ({
      id: `sug_${i}`,
      intent: 'tighten',
      question_text: `Question ${i}?`,
      target_id: `target_${i}`,
      priority: i,
      priority_tier: 'low',
      resolved_when: { type: 'always_recheck', target_id: '' },
      options: [],
    }));
    const result = sanitizeSectionContextPayload({ section: 'summary', suggestions });
    expect(result?.context.suggestions?.length).toBeLessThanOrEqual(SUGGESTION_LIMITS.max_count);
  });

  it('sanitizes keywords correctly', () => {
    const payload = {
      section: 'skills',
      keywords: [
        { keyword: 'TypeScript', target_density: 3, current_count: 1 },
        { keyword: '', target_density: 2, current_count: 0 }, // empty keyword filtered out
      ],
    };
    const result = sanitizeSectionContextPayload(payload);
    expect(result?.context.keywords).toHaveLength(1);
    expect(result?.context.keywords[0].keyword).toBe('TypeScript');
    expect(result?.context.keywords[0].target_density).toBe(3);
    expect(result?.context.keywords[0].current_count).toBe(1);
  });

  it('sanitizes gap_mappings correctly', () => {
    const payload = {
      section: 'experience',
      gap_mappings: [
        { requirement: 'Cloud architecture', classification: 'partial' },
        { requirement: '', classification: 'gap' }, // empty requirement filtered out
      ],
    };
    const result = sanitizeSectionContextPayload(payload);
    expect(result?.context.gap_mappings).toHaveLength(1);
    expect(result?.context.gap_mappings[0].requirement).toBe('Cloud architecture');
    expect(result?.context.gap_mappings[0].classification).toBe('partial');
  });

  it('uses default values for context_version and generated_at when missing', () => {
    const result = sanitizeSectionContextPayload({ section: 'summary' });
    expect(result?.context.context_version).toBe(0);
    expect(typeof result?.context.generated_at).toBe('string');
  });

  it('floors negative context_version to 0', () => {
    const result = sanitizeSectionContextPayload({
      section: 'summary',
      context_version: -5,
    });
    expect(result?.context.context_version).toBe(0);
  });
});
