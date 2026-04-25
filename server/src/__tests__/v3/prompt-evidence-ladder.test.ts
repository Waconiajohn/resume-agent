import { describe, expect, it } from 'vitest';
import { loadPrompt } from '../../v3/prompts/loader.js';

describe('v3 prompts — evidence ladder integration', () => {
  it('loads strategize with the evidence ladder and editorial fields', () => {
    const prompt = loadPrompt('strategize.v1');

    expect(prompt.version).toBe('1.7');
    expect(prompt.systemMessage).toContain('Evidence Ladder');
    expect(prompt.systemMessage).toContain('evidenceOpportunities');
    expect(prompt.systemMessage).toContain('editorialAssessment');
    expect(prompt.systemMessage).toContain('Do not use `positionIndex: null` merely because');
  });

  it('loads writer prompts with the evidence ladder fragment', () => {
    for (const name of ['write-summary.v1', 'write-accomplishments.v1', 'write-competencies.v1']) {
      const prompt = loadPrompt(name);
      expect(prompt.systemMessage).toContain('Evidence Ladder');
    }
  });
});
