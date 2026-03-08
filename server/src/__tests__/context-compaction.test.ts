/**
 * Context Compaction Tests (Bug 17 — Context Forgetfulness)
 *
 * Verifies:
 * 1. buildScratchpadSummary produces structured section status
 * 2. Empty scratchpad returns empty string
 * 3. Presented sections are marked as "written + presented"
 * 4. Non-section keys are listed under "Other scratchpad data"
 * 5. Internal keys (_final_text, presented_*) are excluded from other data
 */

import { describe, it, expect } from 'vitest';
import { buildScratchpadSummary } from '../agents/runtime/agent-loop.js';

describe('buildScratchpadSummary', () => {
  it('returns empty string for empty scratchpad', () => {
    expect(buildScratchpadSummary({})).toBe('');
  });

  it('returns empty string when no section_ keys exist', () => {
    expect(buildScratchpadSummary({ some_key: 'value', _final_text: 'done' })).toBe('');
  });

  it('lists written sections', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text here', section: 'summary' },
      section_skills: { content: 'Skills content', section: 'skills' },
    };

    const result = buildScratchpadSummary(scratchpad);

    expect(result).toContain('Completed sections in scratchpad:');
    expect(result).toContain('summary: written');
    expect(result).toContain('skills: written');
  });

  it('marks presented sections as "written + presented"', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text', section: 'summary' },
      presented_summary: true,
      section_experience_role_0: { content: 'Exp content', section: 'experience_role_0' },
    };

    const result = buildScratchpadSummary(scratchpad);

    expect(result).toContain('summary: written + presented');
    expect(result).toContain('experience_role_0: written');
    expect(result).not.toContain('experience_role_0: written + presented');
  });

  it('includes other scratchpad keys (non-section, non-internal)', () => {
    const scratchpad = {
      section_summary: { content: 'Summary', section: 'summary' },
      gap_analysis: { coverage: 80 },
      positioning: { career_arc: {} },
      _final_text: 'ignored',
      presented_summary: true,
    };

    const result = buildScratchpadSummary(scratchpad);

    expect(result).toContain('Other scratchpad data:');
    expect(result).toContain('gap_analysis');
    expect(result).toContain('positioning');
    expect(result).not.toContain('_final_text');
    expect(result).not.toContain('presented_summary');
  });

  it('skips section entries without content property', () => {
    const scratchpad = {
      section_summary: { content: 'Valid content', section: 'summary' },
      section_empty: {},
      section_null: null,
    };

    const result = buildScratchpadSummary(scratchpad);

    expect(result).toContain('summary: written');
    expect(result).not.toContain('empty');
    expect(result).not.toContain('null');
  });

  it('marks approved sections as immutable', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text', section: 'summary' },
      presented_summary: true,
      section_experience_role_0: { content: 'Exp content', section: 'experience_role_0' },
      presented_experience_role_0: true,
      section_skills: { content: 'Skills content', section: 'skills' },
    };
    const approvedSections = ['summary', 'experience_role_0'];

    const result = buildScratchpadSummary(scratchpad, approvedSections);

    expect(result).toContain('summary: written + presented + approved (immutable)');
    expect(result).toContain('experience_role_0: written + presented + approved (immutable)');
    expect(result).toContain('skills: written');
    expect(result).not.toContain('skills: written + presented');
  });

  it('handles approved sections without presented flag', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text', section: 'summary' },
    };
    const approvedSections = ['summary'];

    const result = buildScratchpadSummary(scratchpad, approvedSections);

    expect(result).toContain('summary: written + presented + approved (immutable)');
  });

  it('handles undefined approvedSections gracefully', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text', section: 'summary' },
      presented_summary: true,
    };

    const result = buildScratchpadSummary(scratchpad, undefined);

    expect(result).toContain('summary: written + presented');
    expect(result).not.toContain('approved');
  });

  it('limits other keys to 10', () => {
    const scratchpad: Record<string, unknown> = {
      section_summary: { content: 'text', section: 'summary' },
    };
    for (let i = 0; i < 15; i++) {
      scratchpad[`data_${i}`] = { value: i };
    }

    const result = buildScratchpadSummary(scratchpad);

    // Should mention "Other scratchpad data" but capped at 10
    const otherMatch = result.match(/Other scratchpad data: (.+)/);
    expect(otherMatch).toBeTruthy();
    const items = otherMatch![1].split(', ');
    expect(items.length).toBeLessThanOrEqual(10);
  });
});
