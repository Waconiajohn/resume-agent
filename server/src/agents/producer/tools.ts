/**
 * Producer Agent — Tools
 *
 * Nine tools for document production and quality assurance:
 *
 * 1. select_template               — Heuristic template selection (no LLM) + transparency SSE
 * 2. adversarial_review            — Wraps runQualityReviewer() (hiring manager perspective)
 * 3. ats_compliance_check          — Wraps runAtsComplianceCheck() (rule-based, no LLM)
 * 4. humanize_check                — LLM scan for AI patterns and clichés (MODEL_LIGHT)
 * 5. check_blueprint_compliance    — Verifies sections match the architect's blueprint
 * 6. verify_cross_section_consistency — Date/tense/contact/formatting consistency
 * 7. check_narrative_coherence     — LLM narrative arc + duplication + tone check (MODEL_MID)
 * 8. request_content_revision      — Routes a targeted revision request to the Craftsman
 * 9. emit_transparency             — Emits a transparency SSE event
 */

import { llm, MODEL_LIGHT, MODEL_MID } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import { runQualityReviewer } from '../quality-reviewer.js';
import { runAtsComplianceCheck } from '../ats-rules.js';
import { EXECUTIVE_TEMPLATES } from '../knowledge/formatting-guide.js';
import type { AgentTool, AgentContext } from '../runtime/agent-protocol.js';
import type {
  QualityReviewerInput,
  ArchitectOutput,
  JDAnalysis,
  EvidenceItem,
  QualityScores,
} from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function safeStr(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

function safeNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function safeBool(val: unknown, fallback = false): boolean {
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return fallback;
}

function safeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => safeStr(v)).filter(Boolean);
}

// ─── Tool: select_template ────────────────────────────────────────────

const selectTemplate: AgentTool = {
  name: 'select_template',
  description:
    'Select the best executive resume template based on role title, industry, and candidate career span. Returns the selected template with its specs.',
  input_schema: {
    type: 'object',
    properties: {
      role_title: {
        type: 'string',
        description: 'Target role title (e.g. "VP of Engineering", "Chief Operating Officer")',
      },
      industry: {
        type: 'string',
        description: 'Target industry (e.g. "technology", "healthcare", "consulting")',
      },
      candidate_career_span: {
        type: 'number',
        description: 'Years of professional experience',
      },
    },
    required: ['role_title', 'industry', 'candidate_career_span'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const role = safeStr(input.role_title).toLowerCase();
    const industry = safeStr(input.industry).toLowerCase();
    const careerSpan = safeNum(input.candidate_career_span, 15);

    // Keyword sets aligned to template best_for fields
    const templateScores: Array<{ template: typeof EXECUTIVE_TEMPLATES[number]; score: number }> =
      EXECUTIVE_TEMPLATES.map((t) => {
        const bestFor = t.best_for.toLowerCase();
        let score = 0;

        // Score by direct keyword overlap between role+industry and best_for
        const roleWords = role.split(/\W+/).filter((w) => w.length > 3);
        const industryWords = industry.split(/\W+/).filter((w) => w.length > 3);
        const allTokens = [...roleWords, ...industryWords];

        for (const token of allTokens) {
          if (bestFor.includes(token)) score += 2;
        }

        // Specific heuristics for common role/industry patterns
        if (
          (role.includes('cto') ||
            role.includes('chief technology') ||
            role.includes('vp engineer') ||
            role.includes('vp of engineer') ||
            role.includes('engineering') ||
            role.includes('software') ||
            role.includes('technology') ||
            industry.includes('tech') ||
            industry.includes('saas') ||
            industry.includes('software') ||
            industry.includes('startup') ||
            industry.includes('innovation')) &&
          t.id === 'modern-executive'
        ) {
          score += 5;
        }

        if (
          (role.includes('coo') ||
            role.includes('chief operating') ||
            role.includes('finance') ||
            role.includes('cfo') ||
            role.includes('chief financial') ||
            role.includes('operations') ||
            role.includes('consulting') ||
            industry.includes('finance') ||
            industry.includes('consulting') ||
            industry.includes('private equity') ||
            industry.includes('pe') ||
            industry.includes('vc')) &&
          t.id === 'strategic-leader'
        ) {
          score += 5;
        }

        if (
          (role.includes('ceo') ||
            role.includes('chief executive') ||
            role.includes('president') ||
            role.includes('board') ||
            role.includes('c-suite') ||
            industry.includes('traditional') ||
            industry.includes('financial services') ||
            (careerSpan >= 25 && industry.includes('banking'))) &&
          t.id === 'executive-classic'
        ) {
          score += 5;
        }

        if (
          (role.includes('doctor') ||
            role.includes('vp clinical') ||
            role.includes('medical') ||
            role.includes('manufacturing') ||
            role.includes('engineer') ||
            role.includes('regulated') ||
            industry.includes('healthcare') ||
            industry.includes('manufacturing') ||
            industry.includes('engineering') ||
            industry.includes('biotech') ||
            industry.includes('pharmaceutical') ||
            industry.includes('regulated')) &&
          t.id === 'industry-expert'
        ) {
          score += 5;
        }

        if (
          (role.includes('turnaround') ||
            role.includes('transformation') ||
            role.includes('change') ||
            role.includes('digital transform') ||
            role.includes('restructur') ||
            role.includes('interim') ||
            industry.includes('turnaround') ||
            industry.includes('transformation') ||
            industry.includes('change management')) &&
          t.id === 'transformation-agent'
        ) {
          score += 5;
        }

        return { template: t, score };
      });

    // Sort descending by score; ties broken by array order (preserves intent)
    templateScores.sort((a, b) => b.score - a.score);
    if (templateScores.length === 0) {
      throw new Error('No resume templates available for scoring');
    }
    const selected = templateScores[0].template;

    // Store in pipeline state so coordinator can pass to export
    ctx.updateState({
      selected_template: {
        id: selected.id,
        name: selected.name,
        font: selected.font,
        accent: selected.accent,
      },
    });

    // Emit transparency so the user sees the template decision
    const alternatives = templateScores.slice(1, 4).map(ts => `${ts.template.name} (score: ${ts.score})`).join(', ');
    ctx.emit({
      type: 'transparency',
      stage: ctx.getState().current_stage,
      message: `Producer: Selected "${selected.name}" template. ${alternatives ? `Alternatives considered: ${alternatives}` : ''}`,
    });

    return {
      selected_template_id: selected.id,
      name: selected.name,
      font: selected.font,
      accent: selected.accent,
      best_for: selected.best_for,
      selection_rationale: `Matched "${selected.best_for}" for role "${input.role_title}" in "${input.industry}" with ${careerSpan} years experience.`,
      all_candidates: templateScores.map((ts) => ({
        id: ts.template.id,
        name: ts.template.name,
        score: ts.score,
      })),
    };
  },
};

// ─── Tool: adversarial_review ─────────────────────────────────────────

const adversarialReview: AgentTool = {
  name: 'adversarial_review',
  description:
    'Run the full 6-dimension quality review from a skeptical hiring manager perspective. Wraps runQualityReviewer(). Returns QualityReviewerOutput with scores, decision, and revision instructions.',
  input_schema: {
    type: 'object',
    properties: {
      assembled_resume: {
        type: 'object',
        description: 'The assembled resume with sections map and full_text string',
        properties: {
          sections: {
            type: 'object',
            description: 'Record<string, string> — section name → section content',
          },
          full_text: {
            type: 'string',
            description: 'All sections concatenated as plain text',
          },
        },
        required: ['sections', 'full_text'],
      },
      blueprint: {
        type: 'object',
        description: 'ArchitectOutput — the architect blueprint used to generate the sections',
      },
      jd_analysis: {
        type: 'object',
        description: 'JDAnalysis — job description analysis with must_haves, nice_to_haves, keywords',
      },
      evidence_library: {
        type: 'array',
        description: 'Array of EvidenceItem — the candidate evidence used during section writing',
        items: { type: 'object' },
      },
    },
    required: ['assembled_resume', 'blueprint', 'jd_analysis', 'evidence_library'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const rawAssembled = input.assembled_resume as Record<string, unknown>;
    const rawBlueprint = input.blueprint as Record<string, unknown>;
    const rawJd = input.jd_analysis as Record<string, unknown>;
    const rawEvidence = (input.evidence_library as Record<string, unknown>[]) ?? [];

    // Build typed QualityReviewerInput, coercing as needed
    const assembled = {
      sections: (rawAssembled.sections ?? {}) as Record<string, string>,
      full_text: safeStr(rawAssembled.full_text),
    };

    const reviewerInput: QualityReviewerInput = {
      assembled_resume: assembled,
      architect_blueprint: rawBlueprint as unknown as ArchitectOutput,
      jd_analysis: rawJd as unknown as JDAnalysis,
      evidence_library: rawEvidence as unknown as EvidenceItem[],
    };

    const result = await runQualityReviewer(reviewerInput);

    // Emit quality scores SSE event immediately so the frontend gets them
    ctx.emit({
      type: 'quality_scores',
      scores: result.scores,
    });

    // Store in scratchpad
    ctx.scratchpad.adversarial_review = result;
    ctx.scratchpad.decision = result.decision;
    ctx.scratchpad.overall_pass = result.overall_pass;

    return result;
  },
};

// ─── Tool: ats_compliance_check ───────────────────────────────────────

const atsComplianceCheck: AgentTool = {
  name: 'ats_compliance_check',
  description:
    'Run the rule-based ATS compliance scanner on the full resume text. No LLM needed — checks for forbidden patterns (tables, pipes, icons) and required headings. Returns array of AtsFinding.',
  input_schema: {
    type: 'object',
    properties: {
      full_text: {
        type: 'string',
        description: 'The complete assembled resume as plain text',
      },
    },
    required: ['full_text'],
  },

  async execute(input: Record<string, unknown>): Promise<unknown> {
    const fullText = safeStr(input.full_text);
    const findings = runAtsComplianceCheck(fullText);

    const highCount = findings.filter((f) => f.priority === 'high').length;
    const mediumCount = findings.filter((f) => f.priority === 'medium').length;

    return {
      findings,
      summary: {
        total: findings.length,
        high_priority: highCount,
        medium_priority: mediumCount,
        low_priority: findings.filter((f) => f.priority === 'low').length,
        passes: highCount === 0,
      },
    };
  },
};

// ─── Tool: humanize_check ─────────────────────────────────────────────

const humanizeCheck: AgentTool = {
  name: 'humanize_check',
  description:
    'Scan resume content for AI-generated patterns, clichés, and robotically uniform structure. Uses MODEL_LIGHT. Returns { score: number (0-100), issues: string[] }. Scores below 70 require revision.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The full assembled resume text or a specific section to check',
      },
    },
    required: ['content'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const content = safeStr(input.content);

    const response = await llm.chat({
      model: MODEL_LIGHT,
      max_tokens: 1024,
      signal: ctx.signal,
      session_id: ctx.sessionId,
      system: `You are an authenticity reviewer. You detect AI-generated resume content and flag patterns that make a resume sound robotic, generic, or templated.

Your job is to score the content on a 0-100 humanization scale where:
- 90-100: Clearly human-written, unique voice, specific details
- 70-89: Mostly human, minor generic phrases
- 50-69: Noticeable AI patterns, needs revision
- Below 50: Heavily AI-generated, uniform structure, clichés throughout

Common AI tells to look for:
- Uniform bullet structure (every bullet starts with an action verb + metric + result)
- Generic corporate buzzwords with no specificity (leverage, synergy, spearheaded, orchestrated)
- Parallel list patterns where all items follow identical grammar
- Missing personality or voice — could describe anyone at this level
- Phrases that sound like they were designed to impress rather than inform
- Lack of company-specific or role-specific language
- Missing authentic quirks, specific context, or unusual framing

Return ONLY valid JSON: { "score": 82, "issues": ["List of specific issues found, or empty array if score >= 90"] }`,
      messages: [
        {
          role: 'user',
          content: `Score this resume content for human authenticity and return JSON:\n\n${content.slice(0, 8000)}`,
        },
      ],
    });

    const parsed = repairJSON<Record<string, unknown>>(response.text);
    if (!parsed) {
      return { score: 75, issues: ['Humanize check could not parse response — manual review recommended'] };
    }

    const score = Math.max(0, Math.min(100, safeNum(parsed.score, 75)));
    const issues = safeStringArray(parsed.issues);

    ctx.scratchpad.humanize_score = score;
    ctx.scratchpad.humanize_issues = issues;

    return { score, issues };
  },
};

// ─── Tool: check_blueprint_compliance ────────────────────────────────

const checkBlueprintCompliance: AgentTool = {
  name: 'check_blueprint_compliance',
  description:
    'Verify the written sections follow the architect blueprint. Checks section order, required elements, keyword placements, and age-protection flags. Returns { compliance_pct: number, deviations: string[] }.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'object',
        description: 'Record<string, string> — section name → section content as written',
      },
      blueprint: {
        type: 'object',
        description: 'ArchitectOutput — the architect blueprint the sections were written against',
      },
    },
    required: ['sections', 'blueprint'],
  },

  async execute(input: Record<string, unknown>): Promise<unknown> {
    const sections = (input.sections ?? {}) as Record<string, string>;
    const blueprint = (input.blueprint ?? {}) as Record<string, unknown>;

    const deviations: string[] = [];
    let checksTotal = 0;
    let checksPassed = 0;

    // 1. Section order check
    const sectionPlan = (blueprint.section_plan ?? {}) as Record<string, unknown>;
    const expectedOrder = safeStringArray(sectionPlan.order);
    if (expectedOrder.length > 0) {
      checksTotal++;
      const actualKeys = Object.keys(sections);
      const presentExpected = expectedOrder.filter((key) =>
        actualKeys.some((k) => k.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(k.toLowerCase())),
      );

      // Check that expected sections appear in the correct relative order
      let lastIdx = -1;
      let orderViolation = false;
      for (const key of presentExpected) {
        const idx = actualKeys.findIndex(
          (k) => k.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(k.toLowerCase()),
        );
        if (idx < lastIdx) {
          orderViolation = true;
          break;
        }
        lastIdx = idx;
      }

      if (orderViolation) {
        deviations.push(`Section order deviates from blueprint. Expected: ${expectedOrder.join(' → ')}`);
      } else {
        checksPassed++;
      }
    }

    // 2. Required summary elements check
    const summaryBlueprint = (blueprint.summary_blueprint ?? {}) as Record<string, unknown>;
    const mustInclude = safeStringArray(summaryBlueprint.must_include);
    const summaryContent = safeStr(
      sections['summary'] ?? sections['professional_summary'] ?? sections['professional summary'] ?? '',
    ).toLowerCase();

    if (mustInclude.length > 0 && summaryContent) {
      checksTotal++;
      const missingElements = mustInclude.filter(
        (el) => !summaryContent.includes(el.toLowerCase().slice(0, 20)),
      );
      if (missingElements.length > 0) {
        deviations.push(
          `Summary missing required elements: ${missingElements.slice(0, 3).join('; ')}${missingElements.length > 3 ? ` (+${missingElements.length - 3} more)` : ''}`,
        );
      } else {
        checksPassed++;
      }
    }

    // 3. Keyword map check — top keywords should appear in sections
    const keywordMap = (blueprint.keyword_map ?? {}) as Record<string, Record<string, unknown>>;
    const topKeywords = Object.entries(keywordMap)
      .filter(([, v]) => safeNum(v.target_density, 0) >= 2)
      .map(([k]) => k);

    if (topKeywords.length > 0) {
      checksTotal++;
      const allContent = Object.values(sections).join(' ').toLowerCase();
      const missingKeywords = topKeywords.filter((kw) => !allContent.includes(kw.toLowerCase()));

      if (missingKeywords.length > topKeywords.length * 0.4) {
        deviations.push(
          `High-priority keywords missing from content: ${missingKeywords.slice(0, 5).join(', ')}`,
        );
      } else {
        checksPassed++;
      }
    }

    // 4. Age protection check
    const ageProtection = (blueprint.age_protection ?? {}) as Record<string, unknown>;
    const ageFlags = Array.isArray(ageProtection.flags) ? ageProtection.flags as Array<Record<string, unknown>> : [];
    if (ageFlags.length > 0) {
      checksTotal++;
      const allContent = Object.values(sections).join(' ').toLowerCase();
      const violations = ageFlags.filter((flag) => {
        const item = safeStr(flag.item).toLowerCase();
        const action = safeStr(flag.action).toLowerCase();
        // If action is 'remove' or 'omit', check the item is NOT in content
        if (action.includes('remov') || action.includes('omit') || action.includes('exclud')) {
          // If it's still present, that's a violation
          return item.length > 5 && allContent.includes(item.slice(0, 20));
        }
        return false;
      });

      if (violations.length > 0) {
        deviations.push(
          `Age protection violations: ${violations.map((v) => safeStr(v.item)).slice(0, 3).join('; ')}`,
        );
      } else {
        checksPassed++;
      }
    }

    // 5. Global rules — voice check (basic heuristic)
    const globalRules = (blueprint.global_rules ?? {}) as Record<string, unknown>;
    const voice = safeStr(globalRules.voice).toLowerCase();
    if (voice) {
      checksTotal++;
      const summarySection = safeStr(
        sections['summary'] ?? sections['professional_summary'] ?? '',
      );
      if (summarySection.length < 50) {
        deviations.push('Summary section appears empty or too short — voice instructions not applied');
      } else {
        checksPassed++;
      }
    }

    const compliance_pct =
      checksTotal === 0 ? 100 : Math.round((checksPassed / checksTotal) * 100);

    return { compliance_pct, deviations, checks_total: checksTotal, checks_passed: checksPassed };
  },
};

// ─── Tool: verify_cross_section_consistency ───────────────────────────

const verifyCrossSectionConsistency: AgentTool = {
  name: 'verify_cross_section_consistency',
  description:
    'Check date formats, verb tense consistency, contact info presence, and formatting consistency across all resume sections. Returns { consistent: boolean, issues: string[] }.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'object',
        description: 'Record<string, string> — all section names mapped to their content',
      },
    },
    required: ['sections'],
  },

  async execute(input: Record<string, unknown>): Promise<unknown> {
    const sections = (input.sections ?? {}) as Record<string, string>;
    const issues: string[] = [];

    const allContent = Object.values(sections).join('\n');

    // 1. Date format consistency check
    // Look for mixed date formats: "Jan 2020" vs "January 2020" vs "01/2020" vs "2020-01"
    const datePatterns = {
      abbreviated: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/,
      full_month: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/,
      numeric_slash: /\b\d{1,2}\/\d{4}\b/,
      iso_partial: /\b\d{4}-\d{2}\b/,
    };

    const foundFormats: string[] = [];
    if (datePatterns.abbreviated.test(allContent)) foundFormats.push('abbreviated (Mon YYYY)');
    if (datePatterns.full_month.test(allContent)) foundFormats.push('full month (Month YYYY)');
    if (datePatterns.numeric_slash.test(allContent)) foundFormats.push('numeric slash (MM/YYYY)');
    if (datePatterns.iso_partial.test(allContent)) foundFormats.push('ISO partial (YYYY-MM)');

    if (foundFormats.length > 1) {
      issues.push(`Mixed date formats detected: ${foundFormats.join(', ')} — standardize to abbreviated month format (e.g. "Mar 2021")`);
    }

    // 2. Verb tense consistency in experience bullets
    const experienceContent = safeStr(
      sections['experience'] ??
        sections['professional_experience'] ??
        sections['work_experience'] ??
        '',
    );

    if (experienceContent) {
      // Past roles should use past tense; current role should use present tense
      // Simple heuristic: check for mixed present/past tense action verbs
      const presentTenseVerbs = ['leads', 'manages', 'oversees', 'drives', 'builds', 'develops', 'directs', 'creates', 'delivers'];
      const pastTenseVerbs = ['led', 'managed', 'oversaw', 'drove', 'built', 'developed', 'directed', 'created', 'delivered'];

      const presentCount = presentTenseVerbs.filter((v) =>
        new RegExp(`\\b${v}\\b`, 'i').test(experienceContent),
      ).length;
      const pastCount = pastTenseVerbs.filter((v) =>
        new RegExp(`\\b${v}\\b`, 'i').test(experienceContent),
      ).length;

      if (presentCount > 0 && pastCount > 0) {
        // This is expected — current role is present, past roles are past
        // Only flag if past roles use present tense (harder to detect heuristically)
        // Flag for manual review if both counts are significant
        if (presentCount >= 3 && pastCount >= 3) {
          issues.push('Verb tense mixing detected in experience section — verify current role uses present tense and all prior roles use past tense');
        }
      }
    }

    // 3. Contact info presence check
    const summaryOrHeader = safeStr(
      sections['header'] ??
        sections['contact'] ??
        sections['contact_info'] ??
        sections['summary'] ??
        Object.values(sections)[0] ??
        '',
    );

    // Email should appear somewhere in the document
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    if (!emailRegex.test(allContent)) {
      issues.push('No email address found in resume — contact information may be missing');
    }

    // Phone number should appear somewhere
    const phoneRegex = /[\+]?[\d\s\-\(\)]{10,}/;
    if (!phoneRegex.test(allContent)) {
      issues.push('No phone number found in resume — contact information may be missing');
    }

    // Name should appear at the top (in header or first section)
    if (summaryOrHeader.length < 20) {
      issues.push('Header or first section appears very short — name and contact info may be missing');
    }

    // 4. Consistent bullet character usage
    const bulletTypes = {
      hyphen: (allContent.match(/^\s*-\s/gm) ?? []).length,
      bullet_dot: (allContent.match(/^\s*•\s/gm) ?? []).length,
      asterisk: (allContent.match(/^\s*\*\s/gm) ?? []).length,
      dash_em: (allContent.match(/^\s*—\s/gm) ?? []).length,
    };

    const usedBulletTypes = Object.entries(bulletTypes).filter(([, count]) => count > 0);
    if (usedBulletTypes.length > 1) {
      issues.push(
        `Mixed bullet character types: ${usedBulletTypes.map(([type, count]) => `${type} (${count}×)`).join(', ')} — standardize to a single bullet character`,
      );
    }

    // 5. Section header casing consistency
    const sectionKeys = Object.keys(sections);
    const allCaps = sectionKeys.filter((k) => k === k.toUpperCase() && k.length > 2).length;
    const titleCase = sectionKeys.filter((k) => /^[A-Z][a-z]/.test(k)).length;
    const lowerCase = sectionKeys.filter((k) => k === k.toLowerCase() && k.length > 2).length;

    const dominantStyle =
      allCaps > titleCase && allCaps > lowerCase
        ? 'ALL_CAPS'
        : titleCase >= allCaps && titleCase >= lowerCase
          ? 'Title Case'
          : 'lower_case';

    if (allCaps > 0 && titleCase > 0) {
      issues.push(`Section headers use mixed casing (${allCaps} ALL_CAPS, ${titleCase} Title Case) — standardize header format`);
    }

    void dominantStyle; // used in analysis above

    const consistent = issues.length === 0;

    return { consistent, issues, checks_run: 5 };
  },
};

// ─── Tool: request_content_revision ──────────────────────────────────

const requestContentRevision: AgentTool = {
  name: 'request_content_revision',
  description:
    'Send a targeted revision request to the Craftsman agent for a specific content issue. The coordinator routes this message. Use this for content problems only — not formatting issues you can note directly.',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'The section name that needs revision (e.g. "summary", "experience_role_0")',
      },
      issue: {
        type: 'string',
        description: 'Clear description of what is wrong with the current content',
      },
      instruction: {
        type: 'string',
        description: 'Specific, actionable instruction for the Craftsman on what to change and how',
      },
    },
    required: ['section', 'issue', 'instruction'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const section = safeStr(input.section);
    const issue = safeStr(input.issue);
    const instruction = safeStr(input.instruction);

    ctx.sendMessage({
      to: 'craftsman',
      type: 'request',
      domain: 'resume',
      payload: { section, issue, instruction },
    });

    // Track revision requests in scratchpad
    const revisionRequests = (ctx.scratchpad.revision_requests as Array<Record<string, string>>) ?? [];
    revisionRequests.push({ section, issue, instruction, requested_at: new Date().toISOString() });
    ctx.scratchpad.revision_requests = revisionRequests;

    return {
      acknowledged: true,
      message: `Revision request sent to Craftsman for section "${section}": ${issue}`,
      section,
      instruction,
    };
  },
};

// ─── Tool: emit_transparency ──────────────────────────────────────────

const emitTransparency: AgentTool = {
  name: 'emit_transparency',
  description:
    'Emit a transparency SSE event so the user can see what the Producer is currently doing.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Human-readable description of the current action or progress update',
      },
    },
    required: ['message'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const message = safeStr(input.message);
    const state = ctx.getState();

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: `Producer: ${message}`,
    });

    return { emitted: true, message };
  },
};

// ─── Tool: check_narrative_coherence ──────────────────────────────────

const checkNarrativeCoherence: AgentTool = {
  name: 'check_narrative_coherence',
  description:
    'Evaluate all resume sections together as a cohesive narrative. Checks if summary → experience → accomplishments tell one story, identifies achievement duplication across sections, verifies positioning angle is threaded throughout, and assesses tonal consistency. Uses MODEL_MID. Returns { coherence_score: number (0-100), issues: string[] }.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'object',
        description: 'Record<string, string> — all section names mapped to their content',
      },
      positioning_angle: {
        type: 'string',
        description: 'The positioning angle from the architect blueprint',
      },
    },
    required: ['sections', 'positioning_angle'],
  },

  async execute(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const sections = (input.sections ?? {}) as Record<string, string>;
    const positioningAngle = safeStr(input.positioning_angle);

    const sectionText = Object.entries(sections)
      .map(([name, content]) => `=== ${name} ===\n${content}`)
      .join('\n\n');

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      signal: ctx.signal,
      session_id: ctx.sessionId,
      system: `You are a resume narrative analyst. You read ALL sections of a resume together and evaluate whether they form a cohesive, non-repetitive narrative that consistently reinforces the candidate's positioning.

Score on a 0-100 scale:
- 90-100: Unified narrative, clear throughline, no duplication, consistent voice
- 70-89: Mostly cohesive, minor duplication or tone shifts
- 50-69: Noticeable gaps in narrative arc, achievement duplication, or tonal inconsistency
- Below 50: Sections read like separate documents, significant duplication

Evaluate:
1. NARRATIVE ARC — Does the summary set up a story that experience and accomplishments prove?
2. DUPLICATION — Are the same achievements described in multiple sections?
3. POSITIONING — Is the positioning angle woven throughout, not just in the summary?
4. TONAL CONSISTENCY — Does every section sound like the same person wrote it?
5. MOMENTUM — Does the resume build toward a clear conclusion about who this candidate is?

Return ONLY valid JSON: { "coherence_score": 82, "issues": ["specific issues found"] }`,
      messages: [{
        role: 'user',
        content: `Evaluate this resume's narrative coherence. The positioning angle is: "${positioningAngle}"\n\n${sectionText.slice(0, 12000)}`,
      }],
    });

    const parsed = repairJSON<Record<string, unknown>>(response.text);
    if (!parsed) {
      return { coherence_score: 75, issues: ['Narrative coherence check could not parse response — manual review recommended'] };
    }

    const coherenceScore = Math.max(0, Math.min(100, safeNum(parsed.coherence_score, 75)));
    const issues = safeStringArray(parsed.issues);

    ctx.scratchpad.narrative_coherence_score = coherenceScore;
    ctx.scratchpad.narrative_coherence_issues = issues;

    return { coherence_score: coherenceScore, issues };
  },
};

// ─── Exports ─────────────────────────────────────────────────────────

export const producerTools: AgentTool[] = [
  selectTemplate,
  adversarialReview,
  atsComplianceCheck,
  humanizeCheck,
  checkBlueprintCompliance,
  verifyCrossSectionConsistency,
  checkNarrativeCoherence,
  requestContentRevision,
  emitTransparency,
];
