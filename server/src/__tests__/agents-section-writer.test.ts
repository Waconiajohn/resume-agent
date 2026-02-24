import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockChat = vi.hoisted(() => vi.fn());
vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

import { runSectionWriter, runSectionRevision } from '../agents/section-writer.js';
import type { SectionWriterInput, ArchitectOutput } from '../agents/types.js';

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeLLMResponse(data: Record<string, unknown>) {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function makeGlobalRules(): ArchitectOutput['global_rules'] {
  return {
    voice: 'Executive, direct, metrics-forward.',
    bullet_format: 'Action verb → scope → method → measurable result',
    length_target: '2 pages maximum',
    ats_rules: 'No tables, no columns, standard section headers only',
  };
}

function makeSectionWriterInput(section: string, overrides?: Partial<SectionWriterInput>): SectionWriterInput {
  return {
    section,
    blueprint_slice: {
      positioning_angle: 'Engineering executive who builds scalable platforms',
      must_include: ['cloud architecture', 'engineering leadership'],
      keywords_to_embed: ['cloud-native', 'P&L'],
      authentic_phrases_to_echo: ['build for scale'],
      length: '3-4 sentences',
      tone_guidance: 'Direct, confident, results-oriented',
    },
    evidence_sources: {
      evidence_library: [
        {
          id: 'ev_001',
          situation: 'Legacy infrastructure causing outages',
          action: 'Led full cloud migration',
          result: 'Reduced costs by $2.4M annually',
        },
      ],
    },
    global_rules: makeGlobalRules(),
    ...overrides,
  };
}

function makeValidWriterOutput() {
  return {
    content: 'Engineering executive with 12+ years building cloud-native platforms at scale. Led $2.4M cloud migration initiative while managing 45-person engineering organization. Deep expertise in P&L ownership and cross-functional leadership.',
    keywords_used: ['cloud-native', 'P&L'],
    requirements_addressed: ['cloud architecture', 'engineering leadership'],
    evidence_ids_used: ['ev_001'],
  };
}

// ─── runSectionWriter tests ───────────────────────────────────────────────────

describe('runSectionWriter', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns SectionWriterOutput with required fields', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidWriterOutput()));

    const result = await runSectionWriter(makeSectionWriterInput('summary'));

    expect(result).toHaveProperty('section', 'summary');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('keywords_used');
    expect(result).toHaveProperty('requirements_addressed');
    expect(result).toHaveProperty('evidence_ids_used');
  });

  it('generates section content from blueprint slice', async () => {
    const expected = makeValidWriterOutput();
    mockChat.mockResolvedValueOnce(makeLLMResponse(expected));

    const result = await runSectionWriter(makeSectionWriterInput('summary'));

    expect(result.content).toBe(expected.content);
    expect(result.keywords_used).toEqual(['cloud-native', 'P&L']);
    expect(result.requirements_addressed).toEqual(['cloud architecture', 'engineering leadership']);
  });

  it('tracks evidence_ids_used', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidWriterOutput()));

    const result = await runSectionWriter(makeSectionWriterInput('summary'));
    expect(result.evidence_ids_used).toContain('ev_001');
  });

  it('uses MODEL_MID for skills section', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: 'Cloud & Infrastructure: AWS, Kubernetes, Python',
      keywords_used: ['AWS'],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    await runSectionWriter(makeSectionWriterInput('skills'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-mid' }),
    );
  });

  it('uses MODEL_MID for education_and_certifications section', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: 'BS Computer Science — University of Washington',
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    await runSectionWriter(makeSectionWriterInput('education_and_certifications'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-mid' }),
    );
  });

  it('uses MODEL_MID for header section', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: 'Jane Smith | jane@example.com | Seattle, WA',
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    await runSectionWriter(makeSectionWriterInput('header'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-mid' }),
    );
  });

  it('uses MODEL_PRIMARY for summary section', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidWriterOutput()));

    await runSectionWriter(makeSectionWriterInput('summary'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-primary' }),
    );
  });

  it('uses MODEL_PRIMARY for experience section', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: '• Led cloud migration reducing costs by $2.4M',
      keywords_used: ['cloud'],
      requirements_addressed: ['cloud architecture'],
      evidence_ids_used: ['ev_001'],
    }));

    await runSectionWriter(makeSectionWriterInput('experience'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-primary' }),
    );
  });

  it('uses MODEL_PRIMARY for selected_accomplishments section', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: '• Reduced infrastructure costs by $2.4M via cloud migration',
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: ['ev_001'],
    }));

    await runSectionWriter(makeSectionWriterInput('selected_accomplishments'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-primary' }),
    );
  });

  it('falls back to raw response text when JSON parse fails', async () => {
    const rawContent = 'Jane Smith | VP Engineering | Cloud Architecture Expert';
    mockChat.mockResolvedValueOnce({
      text: rawContent, // Not valid JSON
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const result = await runSectionWriter(makeSectionWriterInput('header'));

    expect(result.content).toBe(rawContent.trim());
    expect(result.keywords_used).toEqual([]);
    expect(result.requirements_addressed).toEqual([]);
    expect(result.evidence_ids_used).toEqual([]);
  });

  it('coerces array content to joined string', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: [
        '• Led cloud migration reducing costs by $2.4M',
        '• Scaled engineering org from 8 to 45 engineers',
      ],
      keywords_used: ['cloud'],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    const result = await runSectionWriter(makeSectionWriterInput('experience'));

    expect(typeof result.content).toBe('string');
    expect(result.content).toContain('$2.4M');
    expect(result.content).toContain('45 engineers');
  });

  it('coerces object content to JSON string', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: { bullet_1: 'Led cloud migration', bullet_2: 'Scaled team' },
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    const result = await runSectionWriter(makeSectionWriterInput('experience'));

    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('removes ATS-unsafe pipe separators from content', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: 'AWS | Kubernetes | Python | Go',
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    const result = await runSectionWriter(makeSectionWriterInput('skills'));

    expect(result.content).not.toContain(' | ');
    // Should be replaced with comma
    expect(result.content).toContain(',');
  });

  it('passes signal through to LLM chat call', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidWriterOutput()));

    const controller = new AbortController();
    const input = makeSectionWriterInput('summary', { signal: controller.signal });
    await runSectionWriter(input);

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('returns default empty arrays when LLM omits keywords_used and requirements_addressed', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: 'Some content',
      // omit keywords_used, requirements_addressed, evidence_ids_used
    }));

    const result = await runSectionWriter(makeSectionWriterInput('summary'));

    expect(result.keywords_used).toEqual([]);
    expect(result.requirements_addressed).toEqual([]);
    expect(result.evidence_ids_used).toEqual([]);
  });
});

// ─── runSectionRevision tests ─────────────────────────────────────────────────

describe('runSectionRevision', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns SectionWriterOutput with revised content', async () => {
    const revisedOutput = {
      content: 'Engineering executive who built scalable cloud-native platforms, reducing infrastructure costs by $2.4M while managing 45-person engineering organization.',
      keywords_used: ['cloud-native', 'P&L'],
      requirements_addressed: ['cloud architecture'],
      evidence_ids_used: ['ev_001'],
    };
    mockChat.mockResolvedValueOnce(makeLLMResponse(revisedOutput));

    const result = await runSectionRevision(
      'summary',
      'Original summary lacking metrics.',
      'Add the $2.4M cost reduction metric and mention team size.',
      { positioning_angle: 'Cloud-first executive' },
      makeGlobalRules(),
    );

    expect(result.section).toBe('summary');
    expect(result.content).toContain('$2.4M');
    expect(result.keywords_used).toContain('cloud-native');
  });

  it('uses MODEL_PRIMARY for revisions', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: 'Revised content',
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    await runSectionRevision(
      'summary',
      'Original content.',
      'Fix the metrics.',
      {},
      makeGlobalRules(),
    );

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-primary' }),
    );
  });

  it('falls back to raw response when revision JSON parse fails', async () => {
    const rawText = 'Revised content that is plain text, not JSON.';
    mockChat.mockResolvedValueOnce({
      text: rawText,
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const result = await runSectionRevision(
      'summary',
      'Original.',
      'Improve metrics.',
      {},
      makeGlobalRules(),
    );

    expect(result.content).toBe(rawText.trim());
    expect(result.keywords_used).toEqual([]);
  });

  it('removes ATS-unsafe pipe separators from revised content', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: 'Cloud | AWS | Kubernetes | Python',
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    const result = await runSectionRevision('skills', 'Old skills', 'Add more', {}, makeGlobalRules());

    expect(result.content).not.toContain(' | ');
    expect(result.content).toContain(',');
  });

  it('passes abort signal to LLM', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: 'Revised content',
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    const controller = new AbortController();
    await runSectionRevision(
      'summary',
      'Original.',
      'Fix it.',
      {},
      makeGlobalRules(),
      { signal: controller.signal },
    );

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('coerces array revision content to joined string', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse({
      content: ['• Bullet one with metrics $2.4M', '• Bullet two with 300% improvement'],
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    }));

    const result = await runSectionRevision('experience', 'Old content', 'Fix bullets', {}, makeGlobalRules());

    expect(typeof result.content).toBe('string');
    expect(result.content).toContain('$2.4M');
    expect(result.content).toContain('300%');
  });
});
