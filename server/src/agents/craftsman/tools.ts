/**
 * Craftsman Agent — Tool Definitions
 *
 * 8 tools covering the full write → self-review → revise → present cycle.
 *
 * Tool responsibilities:
 *   write_section          — Wraps runSectionWriter(); emits section_draft SSE
 *   self_review_section    — LLM-based quality checklist evaluation (MODEL_MID)
 *   revise_section         — Wraps runSectionRevision(); emits section_revised SSE
 *   check_keyword_coverage — String-matching coverage check (no LLM)
 *   check_anti_patterns    — Regex/string anti-pattern check (no LLM)
 *   check_evidence_integrity — LLM cross-reference of claims vs evidence (MODEL_LIGHT)
 *   present_to_user        — Emits section SSE + waits for user feedback
 *   emit_transparency      — Emits transparency SSE event
 */

import { randomUUID } from 'node:crypto';
import { llm, MODEL_MID, MODEL_LIGHT } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import { runSectionWriter, runSectionRevision } from '../section-writer.js';
import { QUALITY_CHECKLIST, RESUME_ANTI_PATTERNS } from '../knowledge/rules.js';
import type { AgentTool, AgentContext } from '../runtime/agent-protocol.js';
import type {
  SectionWriterInput,
  SectionWriterOutput,
  ArchitectOutput,
  EvidenceItem,
  PipelineStage,
} from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Extract cliché phrases from RESUME_ANTI_PATTERNS for fast string matching */
function extractClichePhrases(): string[] {
  // Parse the CLICHE PHRASES block from the anti-patterns string
  const lines = RESUME_ANTI_PATTERNS.split('\n');
  const phrases: string[] = [];
  let inClicheBlock = false;

  for (const line of lines) {
    if (line.includes('CLICHE PHRASES')) {
      inClicheBlock = true;
      continue;
    }
    // Stop at the next all-caps section heading (e.g., STRUCTURAL ANTI-PATTERNS)
    if (inClicheBlock && /^[A-Z][A-Z\s-]+:/.test(line.trim()) && !line.includes('CLICHE')) {
      inClicheBlock = false;
      continue;
    }
    if (inClicheBlock && line.trim().startsWith('- "')) {
      // Extract text between the first and last quote on the line
      const match = line.match(/-\s*"([^"]+)"/);
      if (match) phrases.push(match[1].toLowerCase());
    }
  }

  return phrases;
}

/** Structural anti-patterns as regex patterns */
const STRUCTURAL_PATTERNS: Array<{ re: RegExp; message: string }> = [
  {
    re: /\bresponsible for\b/i,
    message: '"responsible for" — replace with strong action verb',
  },
  {
    re: /\bhelped (with|to)\b/i,
    message: '"helped with/to" — replace with direct ownership verb',
  },
  {
    re: /\bassisted in\b/i,
    message: '"assisted in" — replace with direct ownership verb',
  },
  {
    re: /\bworked on\b/i,
    message: '"worked on" — replace with specific action verb',
  },
  {
    re: /\bpassionate about\b/i,
    message: '"passionate about" — cliché, remove or replace with evidence',
  },
  {
    re: /\bsynerg(y|ize[sd]?)\b/i,
    message: '"synergy/synergize" — corporate buzzword, remove',
  },
  {
    re: /\bproven track record\b/i,
    message: '"proven track record" — generic cliché, replace with specific achievement',
  },
  {
    re: /\bresults[- ]oriented\b/i,
    message: '"results-oriented" — generic cliché, show results instead',
  },
  {
    re: /\bdynamic leader\b/i,
    message: '"dynamic leader" — empty adjective, remove',
  },
  {
    re: /\bseasoned professional\b/i,
    message: '"seasoned professional" — age-sensitive cliché, remove',
  },
  {
    re: /\bteam player\b/i,
    message: '"team player" — generic soft skill, remove or replace with example',
  },
  {
    re: /\bself[- ]starter\b/i,
    message: '"self-starter" — generic soft skill, remove',
  },
  {
    re: /\bdetail[- ]oriented\b/i,
    message: '"detail-oriented" — generic soft skill, remove',
  },
  {
    re: /\bthink outside the box\b/i,
    message: '"think outside the box" — cliché, remove',
  },
  {
    re: /\bstrategic thinker\b/i,
    message: '"strategic thinker" without evidence — show strategy in bullets instead',
  },
  {
    re: /\bgo[- ]to person\b/i,
    message: '"go-to person" — informal cliché, remove',
  },
  // Age-sensitive patterns
  {
    re: /\b(30|25|20)\+?\s+years?\s+(of\s+)?experience\b/i,
    message: 'Age-revealing experience quantifier — remove and focus on impact timeframes',
  },
  {
    re: /references\s+available\s+(upon\s+)?request/i,
    message: '"References available upon request" — outdated convention, remove',
  },
  {
    re: /\s\|\s/,
    message: 'Vertical bar separator (" | ") — ATS parse risk, replace with comma or newline',
  },
];

const CLICHE_PHRASES = extractClichePhrases();

// ─── Tool: write_section ──────────────────────────────────────────────

const writeSectionTool: AgentTool = {
  name: 'write_section',
  description:
    'Write a single resume section from the blueprint slice and evidence sources. ' +
    'Stores the result in scratchpad[section_{name}] and emits a section_draft SSE event. ' +
    'Always call self_review_section immediately after.',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Section identifier (e.g. "summary", "skills", "experience_role_0")',
      },
      blueprint_slice: {
        type: 'object',
        description: 'The blueprint instructions for this specific section from ArchitectOutput',
      },
      evidence_sources: {
        type: 'object',
        description: 'Relevant evidence items from the positioning profile evidence library',
      },
      global_rules: {
        type: 'object',
        description: 'Global resume rules from ArchitectOutput.global_rules (voice, bullet_format, length_target, ats_rules)',
        properties: {
          voice: { type: 'string' },
          bullet_format: { type: 'string' },
          length_target: { type: 'string' },
          ats_rules: { type: 'string' },
        },
        required: ['voice', 'bullet_format', 'length_target', 'ats_rules'],
      },
    },
    required: ['section', 'blueprint_slice', 'evidence_sources', 'global_rules'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const section = input.section as string;
    const blueprint_slice = input.blueprint_slice as Record<string, unknown>;
    const evidence_sources = input.evidence_sources as Record<string, unknown>;
    const global_rules = input.global_rules as ArchitectOutput['global_rules'];

    // Build cross-section context from previously completed sections
    const crossSectionContext: Record<string, string> = {};
    for (const [key, val] of Object.entries(ctx.scratchpad)) {
      if (key.startsWith('section_')) {
        if (val && typeof (val as Record<string, unknown>).content === 'string') {
          crossSectionContext[key.replace('section_', '')] = ((val as Record<string, unknown>).content as string).slice(0, 300);
        }
      }
    }

    const writerInput: SectionWriterInput = {
      section,
      blueprint_slice,
      evidence_sources,
      global_rules,
      cross_section_context: Object.keys(crossSectionContext).length > 0 ? crossSectionContext : undefined,
      signal: ctx.signal,
    };

    const result: SectionWriterOutput = await runSectionWriter(writerInput);

    // Store in scratchpad
    ctx.scratchpad[`section_${section}`] = result;

    // Emit section_draft SSE event
    ctx.emit({
      type: 'section_draft',
      section: result.section,
      content: result.content,
    });

    return {
      section: result.section,
      content: result.content,
      keywords_used: result.keywords_used,
      requirements_addressed: result.requirements_addressed,
      evidence_ids_used: result.evidence_ids_used,
    };
  },
};

// ─── Tool: self_review_section ────────────────────────────────────────

const selfReviewSectionTool: AgentTool = {
  name: 'self_review_section',
  description:
    'Evaluate a section against the 10-point quality checklist using LLM analysis. ' +
    'Returns { passed, score, issues[] }. If score < 7 or passed is false, ' +
    'call revise_section before presenting to the user.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Section identifier being reviewed',
      },
      content: {
        type: 'string',
        description: 'The section content to evaluate',
      },
    },
    required: ['section', 'content'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const section = input.section as string;
    const content = input.content as string;

    const checklistText = QUALITY_CHECKLIST.map(
      (item, idx) => `${idx + 1}. ${item}`,
    ).join('\n');

    const prompt = `You are a senior resume quality reviewer. Evaluate the following resume section against the quality checklist.

SECTION: ${section}

CONTENT TO REVIEW:
${content}

QUALITY CHECKLIST (10 points):
${checklistText}

For each checklist item, determine:
- PASS: The section clearly satisfies this criterion
- FAIL: The section fails or only partially meets this criterion

After evaluating each point, provide an overall score (1-10, where 10 means all 10 criteria are fully met) and a list of specific issues.

Return ONLY valid JSON:
{
  "evaluations": [
    { "criterion": "Is this quantified?", "result": "PASS" | "FAIL", "note": "brief explanation" }
  ],
  "score": 8,
  "passed": true,
  "issues": ["Specific issue 1 that should be fixed", "Specific issue 2"]
}

Rules:
- passed = true if score >= 7 AND no more than 2 FAIL results
- issues should be actionable revision instructions, not generic comments
- Be strict — a section with vague impact, missing metrics, or passive voice FAILS those criteria`;

    const response = await llm.chat({
      model: MODEL_MID,
      system: 'You are a rigorous resume quality reviewer. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      signal: ctx.signal,
      session_id: ctx.sessionId,
    });

    const parsed = repairJSON<{
      evaluations: Array<{ criterion: string; result: string; note: string }>;
      score: number;
      passed: boolean;
      issues: string[];
    }>(response.text);

    if (!parsed || typeof parsed.score !== 'number' || !Array.isArray(parsed.issues)) {
      return {
        passed: false,
        score: 0,
        issues: ['Quality review response was malformed — revision recommended'],
      };
    }

    // Coerce score to number in case LLM returns a string
    const score = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score) || 6;
    const passed = score >= 7 && Array.isArray(parsed.issues) && parsed.issues.length <= 2;

    return {
      passed,
      score,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  },
};

// ─── Tool: revise_section ─────────────────────────────────────────────

const reviseSectionTool: AgentTool = {
  name: 'revise_section',
  description:
    'Revise a section to fix identified issues. Wraps runSectionRevision(). ' +
    'Updates scratchpad[section_{name}] and emits a section_revised SSE event. ' +
    'After revising, always call self_review_section and check_anti_patterns again.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Section identifier being revised',
      },
      content: {
        type: 'string',
        description: 'Current section content to revise',
      },
      issues: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of specific issues to fix, from self_review_section or user feedback',
      },
    },
    required: ['section', 'content', 'issues'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const section = input.section as string;
    const content = input.content as string;
    const issues = input.issues as string[];

    // Pull blueprint_slice and global_rules from scratchpad if available
    const stored = ctx.scratchpad[`section_${section}`] as SectionWriterOutput | undefined;
    const blueprintSlice =
      (ctx.scratchpad[`blueprint_slice_${section}`] as Record<string, unknown>) ?? {};
    const globalRules = (ctx.scratchpad['global_rules'] as ArchitectOutput['global_rules']) ?? {
      voice: 'executive',
      bullet_format: 'RAS',
      length_target: '1-2 pages',
      ats_rules: 'standard',
    };

    const revisionInstruction = issues.join('\n\n');

    const result: SectionWriterOutput = await runSectionRevision(
      section,
      content,
      revisionInstruction,
      blueprintSlice,
      globalRules,
      { signal: ctx.signal },
    );

    // Update scratchpad with revised content
    ctx.scratchpad[`section_${section}`] = result;

    // Emit section_revised SSE event
    ctx.emit({
      type: 'section_revised',
      section: result.section,
      content: result.content,
    });

    return {
      section: result.section,
      content: result.content,
      keywords_used: result.keywords_used,
      requirements_addressed: result.requirements_addressed,
      evidence_ids_used: result.evidence_ids_used,
    };
  },
};

// ─── Tool: check_keyword_coverage ─────────────────────────────────────

const checkKeywordCoverageTool: AgentTool = {
  name: 'check_keyword_coverage',
  description:
    'Check which target keywords appear in the section content using case-insensitive string matching. ' +
    'Returns { found, missing, coverage_pct }. No LLM call. ' +
    'If coverage_pct < 60, consider revising to weave in missing keywords naturally.',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Section identifier being checked',
      },
      content: {
        type: 'string',
        description: 'Section content to check',
      },
      target_keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of keywords that should appear in this section',
      },
    },
    required: ['section', 'content', 'target_keywords'],
  },

  async execute(input: Record<string, unknown>, _ctx: AgentContext): Promise<unknown> {
    const content = (input.content as string).toLowerCase();
    const targetKeywords = (input.target_keywords as string[]) ?? [];

    const found: string[] = [];
    const missing: string[] = [];

    for (const kw of targetKeywords) {
      if (content.includes(kw.toLowerCase())) {
        found.push(kw);
      } else {
        missing.push(kw);
      }
    }

    const coverage_pct =
      targetKeywords.length > 0
        ? Math.round((found.length / targetKeywords.length) * 100)
        : 100;

    return { found, missing, coverage_pct };
  },
};

// ─── Tool: check_anti_patterns ────────────────────────────────────────

const checkAntiPatternsTool: AgentTool = {
  name: 'check_anti_patterns',
  description:
    'Check section content against the resume anti-patterns list using regex and string matching. ' +
    'Returns { found_patterns, clean }. No LLM call. ' +
    'If clean is false, call revise_section to fix the found patterns.',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Section identifier being checked',
      },
      content: {
        type: 'string',
        description: 'Section content to check against anti-patterns',
      },
    },
    required: ['section', 'content'],
  },

  async execute(input: Record<string, unknown>, _ctx: AgentContext): Promise<unknown> {
    const content = input.content as string;
    const found_patterns: string[] = [];

    // Check structural regex patterns
    for (const pattern of STRUCTURAL_PATTERNS) {
      if (pattern.re.test(content)) {
        found_patterns.push(pattern.message);
      }
    }

    // Check cliché phrases (case-insensitive string matching)
    const contentLower = content.toLowerCase();
    for (const phrase of CLICHE_PHRASES) {
      if (contentLower.includes(phrase)) {
        // Skip if already caught by structural patterns to avoid duplicates
        const alreadyCaught = found_patterns.some((p) =>
          p.toLowerCase().includes(phrase.split(' ')[0] ?? ''),
        );
        if (!alreadyCaught) {
          found_patterns.push(`Cliché phrase detected: "${phrase}"`);
        }
      }
    }

    return {
      found_patterns,
      clean: found_patterns.length === 0,
    };
  },
};

// ─── Tool: check_evidence_integrity ──────────────────────────────────

const checkEvidenceIntegrityTool: AgentTool = {
  name: 'check_evidence_integrity',
  description:
    'Cross-reference claims made in the section content against the evidence library. ' +
    'Uses LLM (MODEL_LIGHT) to flag claims that cannot be verified from the evidence. ' +
    'Returns { claims_verified, claims_flagged[] }. If claims are flagged, revise to remove fabricated specifics.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Section identifier being verified',
      },
      content: {
        type: 'string',
        description: 'Section content whose claims should be verified',
      },
      evidence_library: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of EvidenceItem objects from the positioning profile',
      },
    },
    required: ['section', 'content', 'evidence_library'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const section = input.section as string;
    const content = input.content as string;
    const evidenceLibrary = (input.evidence_library as EvidenceItem[]) ?? [];

    // Build a compact evidence summary for the LLM
    const evidenceSummary = evidenceLibrary
      .map((item, idx) => {
        const id = item.id ?? `evidence_${idx}`;
        return `[${id}] Situation: ${item.situation} | Action: ${item.action} | Result: ${item.result}${
          item.scope_metrics ? ` | Scope: ${JSON.stringify(item.scope_metrics)}` : ''
        }`;
      })
      .join('\n');

    const prompt = `You are an evidence integrity auditor for executive resumes. Your job is to identify specific claims in a resume section that cannot be traced to the provided evidence library.

SECTION: ${section}

RESUME CONTENT:
${content}

EVIDENCE LIBRARY:
${evidenceSummary || '(No evidence items provided)'}

Review each specific claim in the resume content — especially metrics (percentages, dollar amounts, team sizes), named initiatives, and scope statements.

For each claim:
- VERIFIED: The claim can be reasonably traced to one or more evidence items
- FLAGGED: The claim appears to be invented or cannot be linked to any evidence

Return ONLY valid JSON:
{
  "claims_verified": 5,
  "claims_flagged": [
    "The 42% revenue increase in Q3 — no evidence item mentions a 42% figure or Q3 timeframe",
    "Reference to managing a 200-person team — largest team mentioned in evidence is 50"
  ]
}

Rules:
- Only flag SPECIFIC numbers/claims that clearly contradict or exceed what the evidence supports.
- Do NOT flag qualitative claims that could reasonably derive from the evidence context.
- If the evidence library is empty, flag all specific metrics as unverifiable.
- If no claims are problematic, return an empty claims_flagged array.`;

    const response = await llm.chat({
      model: MODEL_LIGHT,
      system: 'You are a resume authenticity auditor. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      signal: ctx.signal,
      session_id: ctx.sessionId,
    });

    const parsed = repairJSON<{
      claims_verified: number;
      claims_flagged: string[];
    }>(response.text);

    if (!parsed) {
      logger.warn({ session_id: ctx.sessionId, section }, 'check_evidence_integrity: repairJSON returned null — falling back to empty result');
      return {
        claims_verified: 0,
        claims_flagged: ['Evidence integrity check could not be parsed — manual review recommended'],
      };
    }

    return {
      claims_verified: typeof parsed.claims_verified === 'number' ? parsed.claims_verified : 0,
      claims_flagged: Array.isArray(parsed.claims_flagged) ? parsed.claims_flagged : [],
    };
  },
};

// ─── Tool: present_to_user ────────────────────────────────────────────

const presentToUserTool: AgentTool = {
  name: 'present_to_user',
  description:
    'Present the polished section to the user for review. ' +
    'Emits a section_draft or section_revised SSE event and waits for user feedback via the section_review gate. ' +
    'Returns the user response: true (approved), { approved: false, feedback: string } (changes requested), ' +
    'or { approved: false, edited_content: string } (direct edit). ' +
    'If the user requests changes, call revise_section with their feedback, then call present_to_user again.',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Section identifier being presented',
      },
      content: {
        type: 'string',
        description: 'The polished section content to show the user',
      },
      review_token: {
        type: 'string',
        description: 'Unique token to prevent stale-gate collisions. Generate with randomUUID() if not provided.',
      },
    },
    required: ['section', 'content'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const section = input.section as string;
    const content = input.content as string;
    const review_token = (input.review_token as string | undefined) ?? randomUUID();

    // Determine whether this is a first draft or a revision
    const isRevision = ctx.scratchpad[`presented_${section}`] === true;
    const eventType = isRevision ? 'section_revised' : 'section_draft';

    // Emit the appropriate SSE event
    ctx.emit({
      type: eventType,
      section,
      content,
      review_token,
    });

    // Mark that this section has been presented at least once
    ctx.scratchpad[`presented_${section}`] = true;

    // Wait for user response via the section_review gate
    const userResponse = await ctx.waitForUser<
      true | { approved: boolean; feedback?: string; edited_content?: string; review_token?: string }
    >(`section_review_${section}`);

    // If the user directly edited the content, update the scratchpad
    if (
      typeof userResponse === 'object' &&
      userResponse.edited_content
    ) {
      const stored = ctx.scratchpad[`section_${section}`] as SectionWriterOutput | undefined;
      if (stored) {
        ctx.scratchpad[`section_${section}`] = {
          ...stored,
          content: userResponse.edited_content,
        };
      }
      ctx.emit({ type: 'section_approved', section });
    } else if (userResponse === true || (typeof userResponse === 'object' && userResponse.approved === true)) {
      ctx.emit({ type: 'section_approved', section });
    }

    return userResponse;
  },
};

// ─── Tool: emit_transparency ──────────────────────────────────────────

const emitTransparencyTool: AgentTool = {
  name: 'emit_transparency',
  description:
    'Emit a transparency SSE event to inform the user what the Craftsman is currently doing. ' +
    'Call this before starting each section and before any long-running operation.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Human-readable status message (e.g. "Writing summary section...", "Self-reviewing skills section...")',
      },
    },
    required: ['message'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const message = input.message as string;
    const state = ctx.getState();

    ctx.emit({
      type: 'transparency',
      message,
      stage: state.current_stage as PipelineStage,
    });

    return { emitted: true, message };
  },
};

// ─── Exports ──────────────────────────────────────────────────────────

export const craftsmanTools: AgentTool[] = [
  writeSectionTool,
  selfReviewSectionTool,
  reviseSectionTool,
  checkKeywordCoverageTool,
  checkAntiPatternsTool,
  checkEvidenceIntegrityTool,
  presentToUserTool,
  emitTransparencyTool,
];
