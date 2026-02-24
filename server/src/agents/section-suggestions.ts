/**
 * Two-pass section suggestion generator.
 *
 * Pass 1 (deterministic, instant): Scores unresolved gaps/evidence/keywords
 * against curated templates from the question bank.
 *
 * Pass 2 (LLM, async, optional): MODEL_LIGHT ranks and rewords for tone.
 * On timeout/failure, deterministic suggestions stand alone.
 */

import { createHash } from 'node:crypto';
import type {
  SectionSuggestion,
  SuggestionIntent,
  GapAnalystOutput,
  JDAnalysis,
  ArchitectOutput,
  PositioningProfile,
  ResearchOutput,
  EvidenceItem,
} from './types.js';
import {
  SUGGESTION_TEMPLATES,
  findTemplates,
  interpolate,
  type SuggestionTemplate,
} from './section-suggestion-bank.js';
import { llm, MODEL_LIGHT } from '../lib/llm.js';
import { repairJSON } from '../lib/json-repair.js';
import logger from '../lib/logger.js';

const MAX_SUGGESTIONS = 5;
const LLM_TIMEOUT_MS = 5_000;

// ─── Scored Gap Map ──────────────────────────────────────────────────

export interface ScoredGap {
  requirement: string;
  classification: 'partial' | 'gap';
  criticality: number;          // 3=must_have, 2=nice_to_have, 1=implicit
  evidence_deficit: number;     // 3=no_evidence, 2=no_metrics, 1=weak
  addressed_in_sections: string[];
}

export function buildUnresolvedGapMap(
  gapAnalysis: GapAnalystOutput,
  jdAnalysis: JDAnalysis,
): ScoredGap[] {
  const mustHaves = new Set(jdAnalysis.must_haves.map(r => r.toLowerCase()));
  const niceToHaves = new Set(jdAnalysis.nice_to_haves.map(r => r.toLowerCase()));

  return gapAnalysis.requirements
    .filter(r => r.classification !== 'strong')
    .map(r => {
      const lower = r.requirement.toLowerCase();
      let criticality = 1; // implicit
      if (mustHaves.has(lower)) criticality = 3;
      else if (niceToHaves.has(lower)) criticality = 2;
      // Heuristic: if it appears in must_haves set (substring match)
      else if ([...mustHaves].some(m => lower.includes(m) || m.includes(lower))) criticality = 3;
      else if ([...niceToHaves].some(n => lower.includes(n) || n.includes(lower))) criticality = 2;

      const hasEvidence = r.evidence.length > 0;
      const hasMetrics = r.evidence.some(e => /\d/.test(e));
      let evidence_deficit = 3; // no evidence
      if (hasEvidence && hasMetrics) evidence_deficit = 1;
      else if (hasEvidence) evidence_deficit = 2;

      return {
        requirement: r.requirement,
        classification: r.classification as 'partial' | 'gap',
        criticality,
        evidence_deficit,
        addressed_in_sections: [],
      };
    });
}

/** Mark requirements as addressed when evidence appears in approved section content */
export function markGapAddressed(
  gapMap: ScoredGap[],
  section: string,
  content: string,
): void {
  const lower = content.toLowerCase();
  for (const gap of gapMap) {
    const keywords = gap.requirement.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (keywords.length > 0 && keywords.some(kw => lower.includes(kw))) {
      if (!gap.addressed_in_sections.includes(section)) {
        gap.addressed_in_sections.push(section);
      }
    }
  }
}

// ─── ID Hashing ─────────────────────────────────────────────────────

function hashId(prefix: string, value: string): string {
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `${prefix}_${hash}`;
}

// ─── Pass 1: Deterministic Suggestions ──────────────────────────────

function sectionRelevance(section: string, _requirement: string): number {
  // Experience sections are most relevant for addressing requirements
  if (section.startsWith('experience')) return 1.0;
  if (section === 'summary') return 0.8;
  if (section === 'skills') return 0.6;
  if (section === 'selected_accomplishments') return 0.7;
  return 0.4;
}

function priorityTier(score: number): 'high' | 'medium' | 'low' {
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

export function generateDeterministicSuggestions(
  section: string,
  content: string,
  gapMap: ScoredGap[],
  architect: ArchitectOutput,
  positioning: PositioningProfile,
  research: ResearchOutput,
): SectionSuggestion[] {
  const suggestions: SectionSuggestion[] = [];
  const lowerContent = content.toLowerCase();

  // 1. Gap requirements → address_requirement suggestions
  const unresolvedGaps = gapMap.filter(g => g.addressed_in_sections.length === 0);
  for (const gap of unresolvedGaps) {
    const relevance = sectionRelevance(section, gap.requirement);
    const basePriority = gap.criticality * gap.evidence_deficit * relevance;
    const templates = findTemplates('address_requirement', section);
    const template = templates.find(t =>
      t.scenario === (gap.classification === 'gap' ? 'requirement_gap' : 'requirement_partial'),
    ) ?? templates[0];
    if (!template) continue;

    const priority = basePriority + template.priority_boost;
    suggestions.push({
      id: hashId('gap', gap.requirement),
      intent: 'address_requirement',
      question_text: interpolate(template.question_template, { requirement: gap.requirement }),
      context: gap.classification === 'gap'
        ? 'This is a key requirement from the job description that needs to be addressed.'
        : 'You have some evidence for this — strengthening it would improve your match.',
      target_id: gap.requirement,
      options: [
        { id: 'apply', label: template.option_labels?.apply ?? 'Yes, address it', action: 'apply' },
        { id: 'skip', label: template.option_labels?.skip ?? 'Skip', action: 'skip' },
      ],
      priority,
      priority_tier: priorityTier(priority),
      resolved_when: {
        type: 'requirement_addressed',
        target_id: gap.requirement,
      },
    });
  }

  // 2. Unused evidence → weave_evidence suggestions
  const usedEvidenceIds = new Set<string>();
  // Extract evidence IDs referenced in content (heuristic: check result keywords)
  for (const ev of positioning.evidence_library) {
    if (!ev.id) continue;
    const resultKeywords = ev.result.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    if (resultKeywords.some(kw => lowerContent.includes(kw))) {
      usedEvidenceIds.add(ev.id);
    }
  }
  for (const ev of positioning.evidence_library) {
    if (!ev.id || usedEvidenceIds.has(ev.id)) continue;
    // Only suggest evidence relevant to this section
    if (section.startsWith('experience') || section === 'summary' || section === 'selected_accomplishments') {
      const templates = findTemplates('weave_evidence', section);
      const template = templates.find(t => t.scenario === 'unused_evidence') ?? templates[0];
      if (!template) continue;

      const resultExcerpt = ev.result.length > 60 ? ev.result.slice(0, 60) + '...' : ev.result;
      suggestions.push({
        id: hashId('ev', ev.id),
        intent: 'weave_evidence',
        question_text: interpolate(template.question_template, {
          result_excerpt: resultExcerpt,
          scope: ev.scope_metrics?.team_size ?? ev.scope_metrics?.budget ?? '',
        }),
        target_id: ev.id,
        options: [
          { id: 'apply', label: template.option_labels?.apply ?? 'Weave it in', action: 'apply' },
          { id: 'skip', label: template.option_labels?.skip ?? 'Skip', action: 'skip' },
        ],
        priority: 2 + template.priority_boost,
        priority_tier: 'medium',
        resolved_when: {
          type: 'evidence_referenced',
          target_id: ev.result,
        },
      });
    }
  }

  // 3. Missing keywords → integrate_keyword suggestions
  const keywordMap = architect.keyword_map ?? {};
  for (const [keyword, target] of Object.entries(keywordMap)) {
    if (!keyword || lowerContent.includes(keyword.toLowerCase())) continue;
    if (target.current_count > 0) continue; // Already used somewhere

    const templates = findTemplates('integrate_keyword', section);
    const template = templates[0];
    if (!template) continue;

    suggestions.push({
      id: `kw_${keyword.toLowerCase().replace(/\s+/g, '_')}`,
      intent: 'integrate_keyword',
      question_text: interpolate(template.question_template, { keyword }),
      target_id: keyword,
      options: [
        { id: 'apply', label: template.option_labels?.apply ?? 'Add it', action: 'apply' },
        { id: 'skip', label: template.option_labels?.skip ?? 'Skip', action: 'skip' },
      ],
      priority: 1.5 + template.priority_boost,
      priority_tier: 'low',
      resolved_when: {
        type: 'keyword_present',
        target_id: keyword,
      },
    });
  }

  // 4. Bullets without metrics → quantify_bullet suggestions
  if (section.startsWith('experience') || section === 'selected_accomplishments') {
    const bullets = content.split('\n').filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'));
    const bulletsWithoutMetrics = bullets.filter(b => !/\d/.test(b));
    if (bulletsWithoutMetrics.length > 0 && bulletsWithoutMetrics.length >= bullets.length * 0.5) {
      const templates = findTemplates('quantify_bullet', section);
      const template = templates.find(t => t.scenario === 'no_metrics') ?? templates[0];
      if (template) {
        suggestions.push({
          id: `qual_metrics_${section}`,
          intent: 'quantify_bullet',
          question_text: interpolate(template.question_template, {}),
          target_id: section,
          options: [
            { id: 'apply', label: template.option_labels?.apply ?? 'Add metrics', action: 'apply' },
            { id: 'skip', label: template.option_labels?.skip ?? 'Skip', action: 'skip' },
          ],
          priority: 1 + template.priority_boost,
          priority_tier: 'low',
          resolved_when: {
            type: 'always_recheck',
            target_id: section,
          },
        });
      }
    }
  }

  // Sort by priority descending (gap suggestions always score higher)
  suggestions.sort((a, b) => b.priority - a.priority);

  // Hard cap
  return suggestions.slice(0, MAX_SUGGESTIONS);
}

// ─── Pass 2: LLM Enrichment ────────────────────────────────────────

export async function generateLLMEnrichedSuggestions(
  deterministic: SectionSuggestion[],
  section: string,
  content: string,
): Promise<SectionSuggestion[]> {
  if (deterministic.length === 0) return deterministic;

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), LLM_TIMEOUT_MS);

  try {
    const summaryList = deterministic.map((s, i) =>
      `${i + 1}. [${s.intent}] ${s.question_text}`
    ).join('\n');

    const response = await llm.chat({
      model: MODEL_LIGHT,
      system: 'You rank and reword resume section suggestions for conversational tone. Return JSON only.',
      messages: [{
        role: 'user',
        content: `Section: ${section}\nContent excerpt: ${content.slice(0, 500)}\n\nSuggestions to rank/reword:\n${summaryList}\n\nReturn JSON array of objects: [{index: number, reworded_question: string}] sorted by impact (highest first). Only reword — do not change intent or meaning.`,
      }],
      max_tokens: 1024,
      signal: abort.signal,
    });

    const parsed = repairJSON<Array<{ index: number; reworded_question: string }>>(response.text);
    if (!Array.isArray(parsed)) return deterministic;

    // Apply reworded questions and reorder
    const reordered: SectionSuggestion[] = [];
    for (const item of parsed) {
      const idx = typeof item.index === 'number' ? item.index - 1 : -1;
      if (idx >= 0 && idx < deterministic.length) {
        const original = deterministic[idx];
        reordered.push({
          ...original,
          question_text: typeof item.reworded_question === 'string' && item.reworded_question.length > 0
            ? item.reworded_question.slice(0, 300)
            : original.question_text,
        });
      }
    }

    // Add any deterministic suggestions not referenced by the LLM
    for (const s of deterministic) {
      if (!reordered.some(r => r.id === s.id)) {
        reordered.push(s);
      }
    }

    return reordered.slice(0, MAX_SUGGESTIONS);
  } catch (err) {
    // Swallow — deterministic suggestions are sufficient
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('abort')) {
      logger.warn({ section, error: msg }, 'LLM suggestion enrichment failed — using deterministic');
    }
    return deterministic;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Revision Instruction Builder ───────────────────────────────────

export function buildRevisionInstruction(
  suggestion: SectionSuggestion,
): string {
  const templates = findTemplates(suggestion.intent, suggestion.target_id ?? '');
  // Also try broad match with wildcard
  const allTemplates = templates.length > 0 ? templates : SUGGESTION_TEMPLATES.filter(
    t => t.intent === suggestion.intent && t.section_match.includes('*'),
  );

  const template = allTemplates[0];
  if (!template) {
    // Fallback: generic instruction from the intent
    return `${suggestion.intent.replace(/_/g, ' ')}: ${suggestion.question_text}`;
  }

  return interpolate(template.revision_template, {
    requirement: suggestion.target_id ?? '',
    keyword: suggestion.target_id ?? '',
    result_excerpt: suggestion.target_id ?? '',
    scope: '',
    angle: suggestion.target_id ?? '',
    word_count: '',
    target: '',
  });
}
