/**
 * Context Compaction Tests (Bug 17 — Context Forgetfulness)
 *
 * Verifies:
 * 1. buildResumeScratchpadSummary produces structured section status
 * 2. Empty scratchpad returns empty string
 * 3. Presented sections are marked as "written + presented"
 * 4. Non-section keys are listed under "Other scratchpad data"
 * 5. Internal keys (_final_text, presented_*) are excluded from other data
 * 6. Generic buildScratchpadSummary (agent-loop.ts) lists keys without resume vocabulary
 */

import { describe, it, expect } from 'vitest';
import { buildScratchpadSummary } from '../agents/runtime/agent-loop.js';
import { buildResumeScratchpadSummary } from '../agents/resume/compaction.js';

describe('buildScratchpadSummary (generic)', () => {
  it('returns empty string for empty scratchpad', () => {
    expect(buildScratchpadSummary({})).toBe('');
  });

  it('returns empty string when all keys are internal', () => {
    expect(buildScratchpadSummary({ _final_text: 'done' })).toBe('');
  });

  it('lists available scratchpad keys', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text here', section: 'summary' },
      section_skills: { content: 'Skills content', section: 'skills' },
      gap_analysis: { coverage: 80 },
    };

    const result = buildScratchpadSummary(scratchpad);

    expect(result).toContain('Scratchpad data available:');
    expect(result).toContain('section_summary');
    expect(result).toContain('section_skills');
    expect(result).toContain('gap_analysis');
  });

  it('excludes _final_text from key listing', () => {
    const scratchpad = {
      some_data: 'value',
      _final_text: 'ignored',
    };

    const result = buildScratchpadSummary(scratchpad);

    expect(result).toContain('some_data');
    expect(result).not.toContain('_final_text');
  });
});

describe('buildResumeScratchpadSummary (resume-specific)', () => {
  it('returns empty string for empty scratchpad', () => {
    expect(buildResumeScratchpadSummary({})).toBe('');
  });

  it('returns scratchpad key list when no section_ keys exist', () => {
    const result = buildResumeScratchpadSummary({ some_key: 'value', _final_text: 'done' });
    expect(result).toContain('some_key');
    expect(result).not.toContain('_final_text');
  });

  it('lists written sections', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text here', section: 'summary' },
      section_skills: { content: 'Skills content', section: 'skills' },
    };

    const result = buildResumeScratchpadSummary(scratchpad);

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

    const result = buildResumeScratchpadSummary(scratchpad);

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

    const result = buildResumeScratchpadSummary(scratchpad);

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

    const result = buildResumeScratchpadSummary(scratchpad);

    expect(result).toContain('summary: written');
    expect(result).not.toContain('empty');
    expect(result).not.toContain('null');
  });

  it('marks approved sections as immutable (via _approved_sections key)', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text', section: 'summary' },
      presented_summary: true,
      section_experience_role_0: { content: 'Exp content', section: 'experience_role_0' },
      presented_experience_role_0: true,
      section_skills: { content: 'Skills content', section: 'skills' },
      _approved_sections: ['summary', 'experience_role_0'],
    };

    const result = buildResumeScratchpadSummary(scratchpad);

    expect(result).toContain('summary: written + presented + approved (immutable)');
    expect(result).toContain('experience_role_0: written + presented + approved (immutable)');
    expect(result).toContain('skills: written');
    expect(result).not.toContain('skills: written + presented');
  });

  it('handles approved sections without presented flag', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text', section: 'summary' },
      _approved_sections: ['summary'],
    };

    const result = buildResumeScratchpadSummary(scratchpad);

    expect(result).toContain('summary: written + presented + approved (immutable)');
  });

  it('handles missing _approved_sections gracefully', () => {
    const scratchpad = {
      section_summary: { content: 'Summary text', section: 'summary' },
      presented_summary: true,
    };

    const result = buildResumeScratchpadSummary(scratchpad);

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

    const result = buildResumeScratchpadSummary(scratchpad);

    // Should mention "Other scratchpad data" but capped at 10
    const otherMatch = result.match(/Other scratchpad data: (.+)/);
    expect(otherMatch).toBeTruthy();
    const items = otherMatch![1].split(', ');
    expect(items.length).toBeLessThanOrEqual(10);
  });
});
