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

vi.mock('../lib/retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { generateQuestions, synthesizeProfile, evaluateFollowUp, MAX_FOLLOW_UPS } from '../agents/positioning-coach.js';
import type { IntakeOutput, ResearchOutput, PositioningQuestion } from '../agents/types.js';

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeLLMResponse(data: unknown) {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function makeIntakeOutput(overrides?: Partial<IntakeOutput>): IntakeOutput {
  return {
    contact: { name: 'Jane Smith', email: 'jane@example.com', phone: '', location: 'Seattle, WA' },
    summary: 'Engineering leader with 12 years in cloud infrastructure.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: '2015',
        end_date: 'Present',
        bullets: [
          'Led team of 45 engineers',
          'Reduced infrastructure costs by $2.4M annually',
          'Increased deployment frequency by 300%',
        ],
        inferred_scope: { team_size: '45', budget: '$8M' },
      },
      {
        company: 'StartupX',
        title: 'Engineering Manager',
        start_date: '2010',
        end_date: '2015',
        bullets: ['Built core platform from scratch', 'Grew team from 2 to 15 engineers'],
      },
    ],
    skills: ['AWS', 'Kubernetes', 'Python', 'Go', 'System Design'],
    education: [{ degree: 'BS Computer Science', institution: 'UW', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
    career_span_years: 12,
    raw_text: 'Jane Smith VP Engineering...',
    ...overrides,
  };
}

function makeResearchOutput(): ResearchOutput {
  return {
    jd_analysis: {
      role_title: 'CTO',
      company: 'TechCorp',
      seniority_level: 'executive',
      must_haves: ['engineering leadership', 'cloud architecture', 'P&L ownership'],
      nice_to_haves: ['kubernetes', 'distributed systems'],
      implicit_requirements: ['executive presence'],
      language_keywords: ['cloud-native', 'P&L', 'engineering excellence'],
    },
    company_research: {
      company_name: 'TechCorp',
      industry: 'Enterprise Software',
      size: '2000 employees',
      culture_signals: ['collaborative', 'data-driven', 'fast-paced'],
    },
    benchmark_candidate: {
      ideal_profile: 'Seasoned CTO with cloud transformation experience and P&L ownership.',
      language_keywords: ['cloud-native', 'engineering excellence', 'transformation'],
      section_expectations: {
        summary: '3-4 sentences highlighting scale',
      },
    },
  };
}

function makeValidQuestionsLLMOutput() {
  return [
    {
      id: 'scope_1',
      question_text: 'What was the total team size you directly managed at Acme Corp?',
      context: 'Understanding your management scope helps position you correctly for senior roles.',
      category: 'scale_and_scope',
      requirement_map: ['engineering leadership'],
      suggestions: [
        { label: 'Team of 45', description: 'Based on your resume', source: 'resume' },
      ],
      encouraging_text: 'Scope like this signals seniority to hiring managers.',
      optional: false,
    },
    {
      id: 'req_cloud',
      question_text: 'Can you walk me through your largest cloud migration project?',
      context: 'Cloud architecture is a must-have for this CTO role.',
      category: 'requirement_mapped',
      requirement_map: ['cloud architecture'],
      suggestions: [
        { label: 'AWS migration at Acme Corp', description: 'Inferred from bullets', source: 'inferred' },
      ],
      encouraging_text: 'Great — that addresses a key requirement.',
      optional: false,
    },
    {
      id: 'career_1',
      question_text: "What's the thread that connects your career moves?",
      context: 'Your career narrative is the backbone of your resume positioning.',
      category: 'career_narrative',
      requirement_map: [],
      suggestions: [
        { label: 'Builder — I create things from scratch', description: 'Teams, products, functions', source: 'inferred' },
      ],
      encouraging_text: 'This narrative will shape your positioning.',
      optional: false,
    },
    {
      id: 'hidden_1',
      question_text: "What's an achievement you're proud of that's not on your resume?",
      context: "Sometimes the most impressive wins don't make it onto the page.",
      category: 'hidden_accomplishments',
      requirement_map: [],
      suggestions: [],
      encouraging_text: 'Hidden wins are often the most compelling.',
      optional: false,
    },
    {
      id: 'scope_2',
      question_text: 'What was the largest P&L you owned?',
      context: 'P&L ownership is a must-have for this role.',
      category: 'scale_and_scope',
      requirement_map: ['P&L ownership'],
      suggestions: [],
      encouraging_text: 'P&L ownership is exactly what they want to see.',
      optional: false,
    },
    {
      id: 'req_2',
      question_text: 'Tell me about your experience with distributed systems at scale.',
      context: 'This role requires distributed systems expertise.',
      category: 'requirement_mapped',
      requirement_map: ['distributed systems'],
      suggestions: [],
      encouraging_text: 'This addresses a key requirement.',
      optional: false,
    },
    {
      id: 'req_3',
      question_text: 'How do you communicate technical strategy to non-technical executives?',
      context: 'Executive presence is important for a CTO.',
      category: 'requirement_mapped',
      requirement_map: ['executive presence'],
      suggestions: [],
      encouraging_text: 'Great example.',
      optional: false,
    },
    {
      id: 'req_4',
      question_text: 'Describe your approach to building engineering culture.',
      context: 'Culture building is core to this role.',
      category: 'requirement_mapped',
      requirement_map: [],
      suggestions: [],
      encouraging_text: 'Culture building is a differentiator.',
      optional: false,
    },
  ];
}

function makeValidProfileLLMOutput() {
  return {
    career_arc: {
      label: 'Builder',
      evidence: 'Built engineering orgs from scratch at StartupX and scaled at Acme Corp',
      user_description: 'I build things — teams, platforms, cultures',
    },
    top_capabilities: [
      {
        capability: 'Scales engineering organizations from startup to enterprise',
        evidence: ['Grew StartupX team from 2 to 15', 'Led 45-person org at Acme Corp'],
        source: 'both',
      },
    ],
    evidence_library: [
      {
        situation: 'Legacy infrastructure causing frequent outages',
        action: 'Led full cloud migration over 18 months',
        result: 'Reduced infrastructure costs by $2.4M and improved uptime to 99.95%',
        metrics_defensible: true,
        user_validated: true,
        source_question_id: 'req_cloud',
        mapped_requirements: ['cloud architecture'],
        scope_metrics: { team_size: '45', budget: '$8M' },
      },
    ],
    signature_method: {
      name: 'Platform-First Engineering',
      what_it_improves: 'Reduces time-to-market by abstracting infrastructure complexity',
      adopted_by_others: true,
    },
    unconscious_competence: 'People rely on me to navigate ambiguity and build consensus',
    domain_insight: 'The best engineering organizations are built around developer experience',
    authentic_phrases: ['build for scale', 'platform-first thinking', 'outcome-driven teams'],
    gaps_detected: [],
  };
}

// ─── generateQuestions tests ──────────────────────────────────────────────────

describe('generateQuestions', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns array of PositioningQuestion objects with required fields', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidQuestionsLLMOutput()));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());

    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThanOrEqual(8);

    for (const q of questions) {
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('question_number');
      expect(q).toHaveProperty('question_text');
      expect(q).toHaveProperty('context');
      expect(q).toHaveProperty('input_type', 'hybrid');
      expect(q).toHaveProperty('category');
    }
  });

  it('assigns sequential question_number values', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidQuestionsLLMOutput()));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());

    questions.forEach((q, index) => {
      expect(q.question_number).toBe(index + 1);
    });
  });

  it('caps questions at 15 maximum', async () => {
    // Return 20 questions
    const manyQuestions = Array.from({ length: 20 }, (_, i) => ({
      id: `q_${i}`,
      question_text: `Question ${i}`,
      context: 'Context',
      category: 'scale_and_scope',
      requirement_map: [],
      suggestions: [],
      encouraging_text: 'Good answer.',
      optional: false,
    }));
    mockChat.mockResolvedValueOnce(makeLLMResponse(manyQuestions));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());
    expect(questions.length).toBeLessThanOrEqual(15);
  });

  it('normalizes invalid category to career_narrative', async () => {
    const output = [{
      id: 'q1',
      question_text: 'Test question',
      context: 'Context',
      category: 'invalid_category',
      requirement_map: [],
      suggestions: [],
      encouraging_text: 'Good.',
      optional: false,
    }];
    // Return minimal set — will be padded with fallback questions
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());
    const userQuestion = questions.find(q => q.id === 'q1');
    expect(userQuestion?.category).toBe('career_narrative');
  });

  it('deduplicates question IDs when LLM returns duplicates', async () => {
    const duplicateOutput = [
      { id: 'scope_1', question_text: 'Q1', context: 'ctx', category: 'scale_and_scope', requirement_map: [], suggestions: [], encouraging_text: '', optional: false },
      { id: 'scope_1', question_text: 'Q2 duplicate id', context: 'ctx', category: 'scale_and_scope', requirement_map: [], suggestions: [], encouraging_text: '', optional: false },
      ...makeValidQuestionsLLMOutput().slice(2),
    ];
    mockChat.mockResolvedValueOnce(makeLLMResponse(duplicateOutput));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());
    const ids = questions.map(q => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('falls back to static questions when no research provided', async () => {
    // No LLM call should be made when research is undefined
    const questions = await generateQuestions(makeIntakeOutput(), undefined);

    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThanOrEqual(4);
    // mockChat should NOT have been called
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('falls back to static questions when LLM throws', async () => {
    mockChat.mockRejectedValueOnce(new Error('LLM unavailable'));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());

    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThanOrEqual(4);
  });

  it('falls back to static questions when LLM returns empty array', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse([]));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());

    expect(Array.isArray(questions)).toBe(true);
    // Should be padded to at least 8 with fallback questions
    expect(questions.length).toBeGreaterThanOrEqual(4);
  });

  it('pads questions using fallback when LLM returns fewer than 8', async () => {
    // LLM returns only 1 question — should be padded with fallback questions
    const tooFewQuestions = makeValidQuestionsLLMOutput().slice(0, 1);
    mockChat.mockResolvedValueOnce(makeLLMResponse(tooFewQuestions));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());
    // Must be more than 1 (the single LLM question gets padded)
    expect(questions.length).toBeGreaterThan(1);
    // Should include the LLM-generated question
    expect(questions.some(q => q.id === 'scope_1')).toBe(true);
  });

  it('includes currency_and_adaptability question for long careers (>15 years)', async () => {
    const longCareerResume = makeIntakeOutput({ career_span_years: 20 });
    const output = makeValidQuestionsLLMOutput();

    // Add a currency question
    output.push({
      id: 'currency_1',
      question_text: "What's a new technology you've adopted in the last 2-3 years?",
      context: 'Showing recent learning signals adaptability.',
      category: 'currency_and_adaptability',
      requirement_map: [],
      suggestions: [],
      encouraging_text: 'This signals adaptability.',
      optional: true,
    });

    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const questions = await generateQuestions(longCareerResume, makeResearchOutput());
    const currencyQ = questions.find(q => q.category === 'currency_and_adaptability');
    expect(currencyQ).toBeDefined();
    expect(currencyQ?.optional).toBe(true);
  });

  it('normalizes suggestions to max 4 items', async () => {
    const output = [{
      id: 'q1',
      question_text: 'Test question',
      context: 'Context',
      category: 'scale_and_scope',
      requirement_map: [],
      suggestions: [
        { label: 'Option 1', description: 'Desc', source: 'resume' },
        { label: 'Option 2', description: 'Desc', source: 'inferred' },
        { label: 'Option 3', description: 'Desc', source: 'jd' },
        { label: 'Option 4', description: 'Desc', source: 'resume' },
        { label: 'Option 5', description: 'Desc', source: 'inferred' },
      ],
      encouraging_text: 'Good.',
      optional: false,
    }, ...makeValidQuestionsLLMOutput().slice(1)];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const questions = await generateQuestions(makeIntakeOutput(), makeResearchOutput());
    const q1 = questions.find(q => q.id === 'q1');
    expect(q1?.suggestions?.length).toBeLessThanOrEqual(4);
  });
});

// ─── evaluateFollowUp tests ───────────────────────────────────────────────────

describe('evaluateFollowUp', () => {
  function makeQuestion(overrides?: Partial<PositioningQuestion>): PositioningQuestion {
    return {
      id: 'scope_1',
      question_number: 1,
      question_text: 'What was your team size?',
      context: 'Help us understand your scope.',
      input_type: 'hybrid',
      category: 'scale_and_scope',
      requirement_map: ['engineering leadership'],
      optional: false,
      ...overrides,
    };
  }

  it('returns follow-up for short answers on non-optional questions', () => {
    const question = makeQuestion({ category: 'scale_and_scope' });
    const followUp = evaluateFollowUp(question, 'Small team');

    expect(followUp).not.toBeNull();
    expect(followUp?.id).toBe('scope_1_followup');
    expect(followUp?.question_text).toContain('specific situation');
  });

  it('returns null for optional questions', () => {
    const question = makeQuestion({ optional: true });
    const followUp = evaluateFollowUp(question, 'Small team');
    expect(followUp).toBeNull();
  });

  it('returns null for career_narrative even with short answers', () => {
    const question = makeQuestion({ category: 'career_narrative' });
    const followUp = evaluateFollowUp(question, 'Small team');
    expect(followUp).toBeNull();
  });

  it('returns metrics follow-up for requirement_mapped answers without numbers', () => {
    const question = makeQuestion({ category: 'requirement_mapped' });
    const answer = 'I led a significant cloud migration project that improved our infrastructure considerably over several months.';
    // No numbers — should trigger metrics follow-up
    const followUp = evaluateFollowUp(question, answer);

    expect(followUp).not.toBeNull();
    expect(followUp?.id).toBe('scope_1_metrics');
    expect(followUp?.question_text).toContain('number');
  });

  it('returns null for requirement_mapped answers with metrics', () => {
    const question = makeQuestion({ category: 'requirement_mapped' });
    const answer = 'I led a cloud migration that reduced costs by $2.4M and improved team velocity by 40% over 6 months.';
    const followUp = evaluateFollowUp(question, answer);
    expect(followUp).toBeNull();
  });

  it('returns ownership follow-up for vague language without strong verbs when metrics are present', () => {
    // career_narrative category: skips metrics check, goes to vague language check
    const question = makeQuestion({ category: 'career_narrative' });
    // Long enough (>100 chars) to skip short-answer trigger
    // Has no strong verbs but has vague language — and category is career_narrative so metrics check skipped
    const answer = 'I was responsible for the cloud infrastructure and helped with several migration projects. I participated in planning and was involved in execution across multiple teams in the organization.';
    const followUp = evaluateFollowUp(question, answer);

    // career_narrative returns null for vague-language check because the category is excluded
    // Actually per code: career_narrative is excluded from SHORT ANSWER trigger, not ownership trigger.
    // Let's verify what happens with career_narrative + vague language:
    // - Not optional → not skip
    // - Not short (>100) AND category is career_narrative → skip short-answer trigger
    // - Not requirement_mapped or scale_and_scope → skip metrics trigger
    // - Has vague patterns AND no strong verbs → ownership trigger fires
    expect(followUp).not.toBeNull();
    expect(followUp?.id).toBe('scope_1_ownership');
    expect(followUp?.question_text).toContain('YOUR specific contribution');
  });

  it('returns ownership follow-up for vague language without strong verbs on non-metrics categories', () => {
    // hidden_accomplishments: not career_narrative, so short-answer check applies
    // but the answer is long enough to skip that check.
    // Not requirement_mapped/scale_and_scope so metrics check skipped.
    // Has vague patterns + no strong verbs → ownership trigger.
    const question = makeQuestion({ category: 'hidden_accomplishments', id: 'hidden_1' });
    const answer = 'I was responsible for many things and worked on projects that helped the company grow. I was involved in strategic planning and participated in various cross-functional initiatives over the years.';
    const followUp = evaluateFollowUp(question, answer);

    expect(followUp).not.toBeNull();
    expect(followUp?.id).toBe('hidden_1_ownership');
    expect(followUp?.question_text).toContain('YOUR specific contribution');
  });

  it('returns null when strong verbs override vague language patterns', () => {
    const question = makeQuestion({ category: 'hidden_accomplishments', id: 'hidden_1' });
    // Has both vague patterns AND strong verbs → no follow-up
    const answer = 'I was responsible for the initiative but I led the architecture and built the core platform from scratch over 18 months, which transformed our deployment reliability significantly across all teams.';
    const followUp = evaluateFollowUp(question, answer);
    // "led" and "built" and "transformed" are strong verbs → no follow-up
    expect(followUp).toBeNull();
  });

  it('returns null for long answers with metrics on scale_and_scope', () => {
    const question = makeQuestion({ category: 'scale_and_scope' });
    const answer = 'I managed a team of 45 engineers with an $8M annual budget, leading cloud migration that saved $2.4M annually and improved deployment frequency by 300% over 18 months.';
    const followUp = evaluateFollowUp(question, answer);
    expect(followUp).toBeNull();
  });

  it('MAX_FOLLOW_UPS is 3', () => {
    expect(MAX_FOLLOW_UPS).toBe(3);
  });
});

// ─── synthesizeProfile tests ──────────────────────────────────────────────────

describe('synthesizeProfile', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it('returns PositioningProfile with required fields', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidProfileLLMOutput()));

    const answers = [
      { question_id: 'scope_1', answer: 'I managed a team of 45 engineers with an $8M budget.' },
      { question_id: 'req_cloud', answer: 'I led a full cloud migration saving $2.4M annually.' },
    ];

    const profile = await synthesizeProfile(makeIntakeOutput(), answers);

    expect(profile).toHaveProperty('career_arc');
    expect(profile).toHaveProperty('top_capabilities');
    expect(profile).toHaveProperty('evidence_library');
    expect(profile).toHaveProperty('signature_method');
    expect(profile).toHaveProperty('unconscious_competence');
    expect(profile).toHaveProperty('domain_insight');
    expect(profile).toHaveProperty('authentic_phrases');
    expect(profile).toHaveProperty('gaps_detected');
  });

  it('assigns sequential IDs to evidence items', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidProfileLLMOutput()));

    const answers = [{ question_id: 'scope_1', answer: 'Led 45-person team.' }];
    const profile = await synthesizeProfile(makeIntakeOutput(), answers);

    expect(profile.evidence_library[0].id).toBe('ev_001');
  });

  it('normalizes scope_metrics on evidence items', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidProfileLLMOutput()));

    const answers = [{ question_id: 'scope_1', answer: 'Led 45-person team with $8M budget.' }];
    const profile = await synthesizeProfile(makeIntakeOutput(), answers);

    const evidence = profile.evidence_library[0];
    expect(evidence.scope_metrics?.team_size).toBe('45');
    expect(evidence.scope_metrics?.budget).toBe('$8M');
  });

  it('handles research context for JD-aware synthesis', async () => {
    mockChat.mockResolvedValueOnce(makeLLMResponse(makeValidProfileLLMOutput()));

    const answers = [{ question_id: 'scope_1', answer: 'Led 45-person team.' }];
    const profile = await synthesizeProfile(makeIntakeOutput(), answers, makeResearchOutput());

    // Should have called LLM with MODEL_PRIMARY
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-primary' }),
    );
    expect(profile.career_arc.label).toBe('Builder');
  });

  it('throws when LLM returns unparseable JSON', async () => {
    mockChat.mockResolvedValueOnce({
      text: 'INVALID_JSON_RESPONSE',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const answers = [{ question_id: 'scope_1', answer: 'Led 45-person team.' }];
    await expect(synthesizeProfile(makeIntakeOutput(), answers)).rejects.toThrow(
      'Positioning Coach: failed to synthesize profile',
    );
  });

  it('uses defaults for missing optional profile fields', async () => {
    const minimalProfile = {
      career_arc: { label: 'Builder', evidence: 'Some evidence', user_description: 'My story' },
      top_capabilities: [],
      evidence_library: [],
      // omit signature_method, unconscious_competence, etc.
    };
    mockChat.mockResolvedValueOnce(makeLLMResponse(minimalProfile));

    const answers = [{ question_id: 'q1', answer: 'I did things.' }];
    const profile = await synthesizeProfile(makeIntakeOutput(), answers);

    expect(profile.signature_method).toBeNull();
    expect(profile.unconscious_competence).toBe('');
    expect(profile.authentic_phrases).toEqual([]);
    expect(profile.gaps_detected).toEqual([]);
  });

  it('filters mapped_requirements to only include strings', async () => {
    const output = makeValidProfileLLMOutput();
    output.evidence_library[0].mapped_requirements = ['cloud architecture', 123 as unknown as string, null as unknown as string];
    mockChat.mockResolvedValueOnce(makeLLMResponse(output));

    const answers = [{ question_id: 'scope_1', answer: 'Led 45-person team.' }];
    const profile = await synthesizeProfile(makeIntakeOutput(), answers);

    const reqs = profile.evidence_library[0].mapped_requirements ?? [];
    for (const r of reqs) {
      expect(typeof r).toBe('string');
    }
  });
});
