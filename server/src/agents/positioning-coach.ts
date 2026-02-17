/**
 * Agent 2: Positioning Coach ("Why Me" Agent)
 *
 * Conducts a guided 6-question interview to extract the user's authentic
 * positioning data. Uses pre-populated suggestions from the parsed resume
 * to reduce user effort and increase answer quality.
 *
 * Uses MODEL_PRIMARY (needs coaching intelligence and pattern recognition).
 *
 * Unlike other agents, the Positioning Coach is interactive — it emits
 * questions via SSE and waits for user responses. The pipeline orchestrator
 * manages the back-and-forth.
 */

import { llm, MODEL_PRIMARY } from '../lib/llm.js';
import { repairJSON } from '../lib/json-repair.js';
import type {
  IntakeOutput,
  PositioningProfile,
  PositioningQuestion,
  EvidenceItem,
} from './types.js';

// ─── Question generation ─────────────────────────────────────────────

/**
 * Generate the 6 positioning questions with pre-populated suggestions
 * derived from the parsed resume.
 */
export function generateQuestions(resume: IntakeOutput): PositioningQuestion[] {
  return [
    generateCareerArcQuestion(resume),
    generateBestWinQuestion(resume),
    generateHiddenWinQuestion(resume),
    generateUnconsciousCompetenceQuestion(resume),
    generateMethodQuestion(resume),
    generateDomainInsightQuestion(resume),
  ];
}

function generateCareerArcQuestion(resume: IntakeOutput): PositioningQuestion {
  // Analyze resume for arc signals
  const titles = resume.experience.map(e => e.title.toLowerCase());
  const bullets = resume.experience.flatMap(e => e.bullets).join(' ').toLowerCase();

  const arcSuggestions: Array<{ label: string; description: string; keywords: string[] }> = [
    { label: 'Builder', description: 'You\'ve repeatedly built teams, products, or functions from scratch', keywords: ['built', 'launched', 'established', 'founded', 'created', 'stood up', 'greenfield', '0-to-1', 'startup'] },
    { label: 'Scaler', description: 'You take what\'s working and grow it significantly', keywords: ['scaled', 'grew', 'expanded', 'growth', 'doubled', 'tripled', '10x', 'hypergrowth'] },
    { label: 'Fixer / Turnaround', description: 'You\'re brought in when things are broken or underperforming', keywords: ['restructured', 'turned around', 'turnaround', 'reduced costs', 'improved', 'fixed', 'reorganized', 'transformation'] },
    { label: 'Operator', description: 'You make complex systems run reliably at scale', keywords: ['operations', 'operational', 'efficiency', 'process', 'compliance', 'sla', 'reliability', 'optimization'] },
    { label: 'Connector', description: 'You bridge gaps between teams, functions, or organizations', keywords: ['cross-functional', 'partnership', 'stakeholder', 'collaboration', 'alignment', 'liaison', 'bridge'] },
  ];

  // Score each arc by keyword presence
  const scored = arcSuggestions.map(arc => ({
    ...arc,
    score: arc.keywords.filter(kw => bullets.includes(kw) || titles.some(t => t.includes(kw))).length,
  })).sort((a, b) => b.score - a.score);

  // Top 3 with non-zero scores, or top 3 anyway
  const topArcs = scored.filter(a => a.score > 0).slice(0, 3);
  const suggestions = (topArcs.length >= 2 ? topArcs : scored.slice(0, 3)).map(arc => ({
    label: arc.label,
    description: arc.description,
    source: 'inferred' as const,
  }));

  return {
    id: 'career_arc',
    question_number: 1,
    question_text: 'What\'s the thread that connects your last few career moves — what were you chasing?',
    context: `Looking at your career path (${resume.experience.slice(0, 3).map(e => e.title).join(' → ')}), I see a pattern. Which of these resonates, or tell me in your own words:`,
    input_type: 'hybrid',
    suggestions,
    follow_ups: [
      'What about that pattern is intentional vs. what just happened?',
      'If we had to name your "repeatable mission," what would it be?',
    ],
  };
}

function generateBestWinQuestion(resume: IntakeOutput): PositioningQuestion {
  // Pull strongest resume bullets (those with metrics/numbers)
  const metricsPattern = /\$[\d,.]+|\d+%|\d+[xX]|\d+\+?\s*(million|billion|users|customers|clients|employees|team|reports)/i;

  const rankedBullets = resume.experience
    .flatMap((e, i) => e.bullets.map(b => ({
      text: b,
      role: `${e.title} at ${e.company}`,
      recency: i, // lower = more recent
      hasMetrics: metricsPattern.test(b),
    })))
    .sort((a, b) => {
      // Prefer metrics, then recency
      if (a.hasMetrics !== b.hasMetrics) return a.hasMetrics ? -1 : 1;
      return a.recency - b.recency;
    })
    .slice(0, 4);

  const suggestions = rankedBullets.map(b => ({
    label: b.text.length > 80 ? b.text.slice(0, 77) + '...' : b.text,
    description: `From your role as ${b.role}`,
    source: 'resume' as const,
  }));

  return {
    id: 'best_win',
    question_number: 2,
    question_text: 'Which of these best represents what you bring to the table — or is there something better I\'m missing?',
    context: 'I pulled what look like your strongest proof points:',
    input_type: 'hybrid',
    suggestions,
    follow_ups: [
      'What was the situation before you got involved?',
      'What decision did you make that someone else in your role wouldn\'t have?',
      'What\'s the metric we can confidently put on a resume?',
    ],
  };
}

function generateHiddenWinQuestion(resume: IntakeOutput): PositioningQuestion {
  // Detect what themes ARE on the resume to ask what's missing
  const allBullets = resume.experience.flatMap(e => e.bullets).join(' ').toLowerCase();

  const themes = [
    { area: 'revenue growth or sales impact', keywords: ['revenue', 'sales', 'arr', 'pipeline', 'deals', 'quota'] },
    { area: 'team building or mentoring', keywords: ['hired', 'mentored', 'coached', 'developed', 'team', 'culture'] },
    { area: 'cost reduction or efficiency', keywords: ['cost', 'savings', 'efficiency', 'reduced', 'optimized'] },
    { area: 'innovation or product development', keywords: ['launched', 'product', 'innovation', 'patent', 'designed'] },
    { area: 'customer outcomes or satisfaction', keywords: ['customer', 'client', 'nps', 'retention', 'satisfaction', 'churn'] },
    { area: 'process improvement or operations', keywords: ['process', 'operations', 'streamlined', 'automated', 'compliance'] },
  ];

  const present = themes.filter(t => t.keywords.some(kw => allBullets.includes(kw))).map(t => t.area);
  const missing = themes.filter(t => !t.keywords.some(kw => allBullets.includes(kw))).map(t => t.area);

  const topPresent = present.slice(0, 2).join(' and ');
  const suggestions = missing.slice(0, 3).map(area => ({
    label: `Yes — I have a story about ${area}`,
    description: `Your resume doesn't highlight ${area} — is there something there?`,
    source: 'inferred' as const,
  }));

  // Always add an open-ended option
  suggestions.push({
    label: 'Something else entirely',
    description: 'An achievement that doesn\'t fit the categories above',
    source: 'inferred' as const,
  });

  return {
    id: 'hidden_win',
    question_number: 3,
    question_text: 'What\'s an achievement you\'re proud of that\'s NOT on your resume — and why did you leave it off?',
    context: topPresent
      ? `Your resume focuses heavily on ${topPresent}. That tells me what you showcase — but what are you leaving out?`
      : 'Sometimes the most impressive things don\'t make it onto the page.',
    input_type: 'hybrid',
    suggestions,
    follow_ups: [
      'What was your specific contribution (not the team\'s)?',
      'What does that reveal about how you operate?',
    ],
  };
}

function generateUnconsciousCompetenceQuestion(resume: IntakeOutput): PositioningQuestion {
  // Detect recurring action verbs and patterns across roles
  const allBullets = resume.experience.flatMap(e => e.bullets);

  const patterns = [
    { pattern: 'figuring things out when there\'s no playbook', keywords: ['ambiguous', 'undefined', 'greenfield', 'new', 'first', 'pioneer', 'establish'] },
    { pattern: 'getting misaligned stakeholders on the same page', keywords: ['stakeholder', 'alignment', 'cross-functional', 'consensus', 'negotiate', 'collaborate'] },
    { pattern: 'translating complex problems for different audiences', keywords: ['present', 'communicate', 'translate', 'executive', 'board', 'simplif'] },
    { pattern: 'finding and fixing the root cause, not the symptom', keywords: ['root cause', 'diagnos', 'troubleshoot', 'investigat', 'analyz', 'audit'] },
    { pattern: 'building repeatable systems from one-off chaos', keywords: ['process', 'framework', 'standardize', 'systematize', 'playbook', 'template', 'automat'] },
    { pattern: 'developing people and getting the best out of teams', keywords: ['mentor', 'coach', 'develop', 'train', 'promote', 'succession', 'talent'] },
  ];

  const bulletText = allBullets.join(' ').toLowerCase();
  const scored = patterns.map(p => ({
    ...p,
    score: p.keywords.filter(kw => bulletText.includes(kw)).length,
  })).sort((a, b) => b.score - a.score);

  const topPatterns = scored.filter(p => p.score > 0).slice(0, 3);
  const suggestions = (topPatterns.length >= 2 ? topPatterns : scored.slice(0, 3)).map(p => ({
    label: p.pattern,
    description: `I see this pattern across your experience`,
    source: 'inferred' as const,
  }));

  return {
    id: 'unconscious_competence',
    question_number: 4,
    question_text: 'What do people consistently come to you for — even when it\'s not your job?',
    context: 'I keep seeing patterns across your roles. Do any of these ring true?',
    input_type: 'hybrid',
    suggestions,
    follow_ups: [
      'What part of that feels effortless to you but seems hard for others?',
      'If you left tomorrow, what would break or slow down?',
    ],
  };
}

function generateMethodQuestion(resume: IntakeOutput): PositioningQuestion {
  // Look for process/framework signals in bullets
  const allBullets = resume.experience.flatMap(e => e.bullets);
  const methodSignals = allBullets.filter(b =>
    /framework|methodology|process|playbook|model|approach|system|program|initiative/i.test(b)
  );

  const suggestions: PositioningQuestion['suggestions'] = [];

  if (methodSignals.length > 0) {
    // Pull specific method bullets as suggestions
    suggestions.push(...methodSignals.slice(0, 2).map(b => ({
      label: b.length > 80 ? b.slice(0, 77) + '...' : b,
      description: 'This looks like it could be a signature approach',
      source: 'resume' as const,
    })));
  }

  suggestions.push({
    label: 'I have a consistent approach but haven\'t formalized it',
    description: 'You do things a certain way but haven\'t named it',
    source: 'inferred' as const,
  });
  suggestions.push({
    label: 'Not really — I adapt to whatever the situation needs',
    description: 'This is a valid answer — not everyone has a signature framework',
    source: 'inferred' as const,
  });

  return {
    id: 'signature_method',
    question_number: 5,
    question_text: 'Have you created a process, framework, or way of working that others adopted?',
    context: 'Some people develop a signature approach — a repeatable way they tackle problems.',
    input_type: 'hybrid',
    suggestions,
    follow_ups: [
      'What problem did it solve?',
      'Did others adopt it? What did it improve?',
    ],
    optional: true,
  };
}

function generateDomainInsightQuestion(resume: IntakeOutput): PositioningQuestion {
  // Infer domain from most recent roles and skills
  const recentTitles = resume.experience.slice(0, 2).map(e => `${e.title} at ${e.company}`);
  const yearsInField = resume.career_span_years;

  const suggestions: PositioningQuestion['suggestions'] = [
    {
      label: 'A problem everyone talks about but nobody fixes well',
      description: 'Something your industry gets wrong that you see clearly',
      source: 'inferred' as const,
    },
    {
      label: 'A shift that\'s coming that most people aren\'t ready for',
      description: 'A trend or disruption you see before others',
      source: 'inferred' as const,
    },
    {
      label: 'Something that\'s harder than outsiders realize',
      description: 'A complexity in your domain that you navigate well',
      source: 'inferred' as const,
    },
  ];

  return {
    id: 'domain_insight',
    question_number: 6,
    question_text: 'What\'s a problem in your field you understand unusually well — and what\'s your point of view on how it should be solved?',
    context: yearsInField > 0
      ? `You've spent ${yearsInField}+ years in this space (most recently ${recentTitles[0] ?? 'your current role'}). What do you see that others miss?`
      : `Based on your experience as ${recentTitles[0] ?? 'a professional in your field'}, what do you see that others miss?`,
    input_type: 'hybrid',
    suggestions,
    follow_ups: [
      'If a CEO asked you to fix that in 90 days, what\'s the first thing you\'d do?',
    ],
  };
}

// ─── Answer synthesis ────────────────────────────────────────────────

/**
 * After all 6 questions are answered, synthesize the responses into
 * a structured PositioningProfile using MODEL_PRIMARY.
 */
export async function synthesizeProfile(
  resume: IntakeOutput,
  answers: Array<{ question_id: string; answer: string; selected_suggestion?: string }>,
): Promise<PositioningProfile> {
  const answerBlock = answers.map(a => {
    const label = a.selected_suggestion ? ` [Selected: ${a.selected_suggestion}]` : '';
    return `Q: ${a.question_id}${label}\nA: ${a.answer}`;
  }).join('\n\n');

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    max_tokens: 4096,
    system: `You are an expert career positioning strategist. You have conducted a "Why Me" interview with a professional and need to synthesize their responses into a structured positioning profile.

Your output will be consumed by a Resume Architect agent that uses it to make strategic decisions about resume content, structure, and positioning. Be precise, evidence-based, and honest — do not inflate or fabricate.

IMPORTANT: Capture the person's authentic language. When they use distinctive phrases or metaphors, preserve them in the "authentic_phrases" field. These will be woven into their resume to maintain their voice.`,
    messages: [{
      role: 'user',
      content: `Here is the professional's resume summary and recent experience for context:

RESUME SUMMARY: ${resume.summary}

RECENT EXPERIENCE:
${resume.experience.slice(0, 3).map(e => `${e.title} at ${e.company} (${e.start_date}–${e.end_date})\n${e.bullets.slice(0, 3).join('\n')}`).join('\n\n')}

INTERVIEW RESPONSES:
${answerBlock}

Synthesize this into a positioning profile. Return ONLY valid JSON:

{
  "career_arc": {
    "label": "Builder|Scaler|Fixer|Operator|Connector|other",
    "evidence": "Specific evidence from their career that supports this label",
    "user_description": "How they described their own career thread, in their words"
  },
  "top_capabilities": [
    {
      "capability": "What they do distinctively (verb + context)",
      "evidence": ["Specific proof point 1", "Proof point 2"],
      "source": "resume|interview|both"
    }
  ],
  "evidence_library": [
    {
      "situation": "The context/challenge",
      "action": "What they specifically did",
      "result": "The measurable outcome",
      "metrics_defensible": true,
      "user_validated": true
    }
  ],
  "signature_method": {
    "name": "Name of their approach or null if they don't have one",
    "what_it_improves": "What problem it solves",
    "adopted_by_others": true
  },
  "unconscious_competence": "What people rely on them for, in their words",
  "domain_insight": "Their point of view on their field, 1-2 sentences",
  "authentic_phrases": ["Exact phrases they used that sound distinctly like them"],
  "gaps_detected": ["Areas where they may be underselling or have blind spots"]
}

Extract 3-5 top capabilities, 3-5 evidence items, and as many authentic phrases as you can find. Be specific — "strategic thinker" is useless, "turns ambiguous stakeholder conflicts into aligned roadmaps" is valuable.`,
    }],
  });

  const parsed = repairJSON<PositioningProfile>(response.text);
  if (!parsed) {
    throw new Error('Positioning Coach: failed to synthesize profile from interview responses');
  }

  // Assign IDs to evidence items
  const evidence_library: EvidenceItem[] = (parsed.evidence_library ?? []).map((item, i) => ({
    ...item,
    id: `ev_${String(i + 1).padStart(3, '0')}`,
  }));

  return {
    career_arc: parsed.career_arc ?? { label: 'Unknown', evidence: '', user_description: '' },
    top_capabilities: parsed.top_capabilities ?? [],
    evidence_library,
    signature_method: parsed.signature_method ?? null,
    unconscious_competence: parsed.unconscious_competence ?? '',
    domain_insight: parsed.domain_insight ?? '',
    authentic_phrases: parsed.authentic_phrases ?? [],
    gaps_detected: parsed.gaps_detected ?? [],
  };
}
