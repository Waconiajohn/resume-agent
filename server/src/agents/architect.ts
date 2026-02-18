/**
 * Agent 5: Resume Architect
 *
 * The brain of the pipeline. Makes ALL strategic decisions about the resume:
 * section order, evidence allocation, keyword placement, gap reframes,
 * age protection, and tone guidance. Produces a blueprint so precise that
 * the Section Writer has zero strategic discretion.
 *
 * Uses MODEL_PRIMARY (quality of blueprint determines quality of resume).
 *
 * Output is surfaced to user as a reviewable design step before writing begins.
 */

import logger from '../lib/logger.js';
import { llm, MODEL_PRIMARY } from '../lib/llm.js';
import { repairJSON } from '../lib/json-repair.js';
import { ATS_RULEBOOK_PROMPT } from './ats-rules.js';
import type {
  ArchitectInput,
  ArchitectOutput,
  SummaryBlueprint,
  EvidenceAllocation,
  SkillsBlueprint,
  ExperienceBlueprint,
  AgeProtectionAudit,
  KeywordTarget,
} from './types.js';

export async function runArchitect(input: ArchitectInput): Promise<ArchitectOutput> {
  const { parsed_resume, positioning, research, gap_analysis } = input;

  // Build a comprehensive context for the Architect
  const resumeOverview = buildResumeOverview(input);
  const positioningBrief = buildPositioningBrief(input);
  const gapBrief = buildGapBrief(input);
  const keywordBrief = buildKeywordBrief(input);

  const userContent = `Create a complete resume blueprint for this candidate.

TARGET ROLE: ${research.jd_analysis.role_title} at ${research.jd_analysis.company || research.company_research.company_name}
SENIORITY: ${research.jd_analysis.seniority_level}

${resumeOverview}

${positioningBrief}

${gapBrief}

${keywordBrief}

CAREER SPAN: ${parsed_resume.career_span_years} years

Now make the 7 strategic decisions and return the complete blueprint as JSON.

CRITICAL: Return ONLY valid JSON. Do NOT wrap in markdown fences. Do NOT add any text before or after the JSON.

Return ONLY valid JSON matching this structure:
{
  "blueprint_version": "2.0",
  "target_role": "role title at company",
  "positioning_angle": "One sentence describing how this candidate should be positioned",

  "section_plan": {
    "order": ["header", "summary", "selected_accomplishments", "experience", "skills", "education_and_certifications"],
    "rationale": "Why this order"
  },

  "summary_blueprint": {
    "positioning_angle": "The positioning statement the summary should convey",
    "must_include": ["Element 1 mapped to JD must-have", "Element 2"],
    "gap_reframe": { "P&L ownership": "Position budget authority as financial stewardship" },
    "tone_guidance": "How the summary should sound, based on authentic phrases",
    "keywords_to_embed": ["keyword1", "keyword2"],
    "authentic_phrases_to_echo": ["phrase from positioning interview"],
    "length": "3-4 sentences"
  },

  "evidence_allocation": {
    "selected_accomplishments": [
      {
        "evidence_id": "ev_001",
        "achievement": "The achievement to highlight",
        "maps_to_requirements": ["requirement1"],
        "placement_rationale": "Why this goes here",
        "enhancement": "How to strengthen it"
      }
    ],
    "experience_section": {
      "role_0": {
        "company": "CompanyName",
        "bullets_to_write": [
          {
            "focus": "What this bullet covers",
            "maps_to": "Which JD requirement",
            "evidence_source": "Where the evidence comes from",
            "instruction": "Specific writing instruction",
            "target_metric": "The metric to include if available"
          }
        ],
        "bullets_to_keep": ["Original bullets that are already strong"],
        "bullets_to_cut": ["Original bullets to remove and why"]
      }
    },
    "unallocated_requirements": [
      {
        "requirement": "A requirement that cannot be addressed",
        "resolution": "Why and what to do about it"
      }
    ]
  },

  "skills_blueprint": {
    "format": "categorized",
    "categories": [
      {
        "label": "Category Name",
        "skills": ["skill1", "skill2"],
        "rationale": "Why this category leads / is included"
      }
    ],
    "keywords_still_missing": ["Keywords to add only if user confirms familiarity"],
    "age_protection_removals": ["Dated skills to remove"]
  },

  "experience_blueprint": {
    "roles": [
      {
        "company": "CompanyName",
        "title": "Job Title",
        "dates": "2019 – Present",
        "title_adjustment": "Adjusted title if warranted, or null",
        "bullet_count": 5
      }
    ],
    "earlier_career": {
      "include": true,
      "roles": [{ "title": "Old Title", "company": "OldCo" }],
      "format": "one-liner per role, no bullets",
      "rationale": "Why these are condensed"
    }
  },

  "age_protection": {
    "flags": [
      {
        "item": "What triggers the flag",
        "risk": "What age signal it reveals",
        "action": "What to do about it"
      }
    ],
    "clean": false
  },

  "keyword_map": {
    "keyword_name": {
      "target_density": 3,
      "placements": ["summary sentence 1", "experience.role_0.bullet_2"],
      "current_count": 1,
      "action": "Add to summary and skills section"
    }
  },

  "global_rules": {
    "voice": "Description of how the resume should sound",
    "bullet_format": "Action verb → scope → method → measurable result",
    "length_target": "2 pages maximum",
    "ats_rules": "No tables, no columns, standard section headers only"
  }
}`;

  // Try up to 2 attempts — Z.AI sometimes returns unparseable text on first try
  let parsed: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 8192,
      system: ARCHITECT_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: attempt === 0
          ? userContent
          : userContent + '\n\nIMPORTANT: You MUST return raw JSON only. No markdown, no explanation, no commentary. Start with { and end with }.',
      }],
    });

    logger.info({ attempt, responseLength: response.text.length, snippet: response.text.substring(0, 150) }, 'Architect LLM response');

    parsed = repairJSON<Record<string, unknown>>(response.text);
    if (parsed) break;

    logger.warn({ attempt, rawSnippet: response.text.substring(0, 500) }, 'Architect: blueprint parse failed, retrying');
  }

  if (!parsed) {
    logger.error('Architect: all parse attempts failed, returning default blueprint');
    return buildDefaultBlueprint(input);
  }

  return normalizeBlueprint(parsed, input);
}

// ─── System prompt ───────────────────────────────────────────────────

const ARCHITECT_SYSTEM_PROMPT = `You are an elite Resume Architect — a strategic decision-maker, not a writer. Your job is to produce a blueprint so precise that a Section Writer can execute each section without making ANY strategic choices.

You make 7 decisions:
1. SECTION ORDER & INCLUSION — which sections exist and in what order
2. SUMMARY POSITIONING — what the summary communicates and how
3. EVIDENCE ALLOCATION — which proof point goes where (no duplication!)
4. SKILLS STRATEGY — how skills are organized for ATS + human readability
5. EXPERIENCE STRUCTURE — bullet counts, what each covers, what gets cut
6. AGE PROTECTION — flag and mitigate anything that reveals candidate age
7. KEYWORD INTEGRATION — where each JD keyword appears in the resume

RULES:
- The same achievement NEVER appears in both Selected Accomplishments and Experience
- Every JD must-have is addressed somewhere, reframed, or explicitly marked as unaddressable
- For gaps: only reframe with adjacent evidence. NEVER fabricate.
- Age protection: hide graduation years 20+ years old, remove obsolete tech, never say "20+ years"
- Show last 15 years in detail. Earlier roles get one-liner treatment (title + company, no dates)
- Voice guidance must reference the candidate's authentic phrases from positioning interview
- Every bullet instruction must include: focus, evidence source, and target metric
- Maximum 2 pages. Cut aggressively from older/less relevant roles.
- ATS-safe: no tables, no columns, no text boxes. Standard section headers only.
${ATS_RULEBOOK_PROMPT}`;

// ─── Context builders ────────────────────────────────────────────────

function buildResumeOverview(input: ArchitectInput): string {
  const { parsed_resume } = input;
  const lines = ['CANDIDATE RESUME:'];

  lines.push(`Name: ${parsed_resume.contact.name}`);
  lines.push(`Summary: ${parsed_resume.summary}`);
  lines.push('');

  for (let i = 0; i < parsed_resume.experience.length; i++) {
    const e = parsed_resume.experience[i];
    lines.push(`Role ${i}: ${e.title} at ${e.company} (${e.start_date}–${e.end_date})`);
    if (e.inferred_scope) {
      const scope = Object.entries(e.inferred_scope).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ');
      if (scope) lines.push(`  Scope: ${scope}`);
    }
    for (let j = 0; j < e.bullets.length; j++) {
      lines.push(`  [${i}.${j}] ${e.bullets[j]}`);
    }
    lines.push('');
  }

  lines.push(`Skills: ${parsed_resume.skills.join(', ')}`);
  lines.push(`Education: ${parsed_resume.education.map(e => `${e.degree} — ${e.institution}${e.year ? ` (${e.year})` : ''}`).join('; ')}`);
  if (parsed_resume.certifications.length > 0) {
    lines.push(`Certifications: ${parsed_resume.certifications.join(', ')}`);
  }

  return lines.join('\n');
}

function buildPositioningBrief(input: ArchitectInput): string {
  const { positioning } = input;
  const lines = ['POSITIONING PROFILE (from "Why Me" interview):'];

  lines.push(`Career Arc: ${positioning.career_arc.label} — ${positioning.career_arc.evidence}`);
  lines.push(`User's own words: "${positioning.career_arc.user_description}"`);
  lines.push('');

  lines.push('Top Capabilities:');
  for (const cap of positioning.top_capabilities) {
    lines.push(`- ${cap.capability} [source: ${cap.source}]`);
    lines.push(`  Evidence: ${cap.evidence.join('; ')}`);
  }
  lines.push('');

  lines.push('Evidence Library:');
  for (const ev of positioning.evidence_library) {
    lines.push(`- [${ev.id}] Situation: ${ev.situation}`);
    lines.push(`  Action: ${ev.action}`);
    lines.push(`  Result: ${ev.result} (defensible: ${ev.metrics_defensible}, validated: ${ev.user_validated})`);
  }
  lines.push('');

  if (positioning.signature_method?.name) {
    lines.push(`Signature Method: "${positioning.signature_method.name}" — ${positioning.signature_method.what_it_improves} (adopted by others: ${positioning.signature_method.adopted_by_others})`);
  }

  lines.push(`Unconscious Competence: ${positioning.unconscious_competence}`);
  lines.push(`Domain Insight: ${positioning.domain_insight}`);
  lines.push(`Authentic Phrases: ${positioning.authentic_phrases.map(p => `"${p}"`).join(', ')}`);

  if (positioning.gaps_detected.length > 0) {
    lines.push(`\nGaps Detected by Coach: ${positioning.gaps_detected.join('; ')}`);
  }

  return lines.join('\n');
}

function buildGapBrief(input: ArchitectInput): string {
  const { gap_analysis } = input;
  const lines = [`GAP ANALYSIS (coverage: ${gap_analysis.coverage_score}%):`];
  lines.push(gap_analysis.strength_summary);
  lines.push('');

  for (const req of gap_analysis.requirements) {
    const tag = req.classification.toUpperCase();
    lines.push(`[${tag}] ${req.requirement}`);
    if (req.evidence.length > 0) lines.push(`  Evidence: ${req.evidence.join('; ')}`);
    if (req.strengthen) lines.push(`  Strengthen: ${req.strengthen}`);
    if (req.mitigation) lines.push(`  Mitigation: ${req.mitigation}`);
    if (req.unaddressable) lines.push(`  ⚠ UNADDRESSABLE — no evidence exists`);
  }

  if (gap_analysis.critical_gaps.length > 0) {
    lines.push(`\nCritical Gaps: ${gap_analysis.critical_gaps.join(', ')}`);
  }

  return lines.join('\n');
}

function buildKeywordBrief(input: ArchitectInput): string {
  const { research } = input;
  const keywords = [
    ...research.jd_analysis.language_keywords,
    ...research.benchmark_candidate.language_keywords,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return `JD KEYWORDS TO INTEGRATE (target 60-80% coverage):\n${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}`;
}

// ─── Output normalization ────────────────────────────────────────────

function normalizeBlueprint(raw: Record<string, unknown>, input: ArchitectInput): ArchitectOutput {
  const section_plan = raw.section_plan as { order: string[]; rationale: string } ?? {
    order: ['header', 'summary', 'experience', 'skills', 'education_and_certifications'],
    rationale: 'Default order',
  };

  const summary_blueprint = (raw.summary_blueprint ?? {}) as Record<string, unknown>;
  const evidence_allocation = (raw.evidence_allocation ?? {}) as Record<string, unknown>;
  const skills_blueprint = (raw.skills_blueprint ?? {}) as Record<string, unknown>;
  const experience_blueprint = (raw.experience_blueprint ?? {}) as Record<string, unknown>;
  const age_protection = (raw.age_protection ?? {}) as Record<string, unknown>;
  const keyword_map = (raw.keyword_map ?? {}) as Record<string, Record<string, unknown>>;
  const global_rules = (raw.global_rules ?? {}) as Record<string, unknown>;
  const normalizedOrder = normalizeSectionOrder(
    Array.isArray(section_plan.order)
      ? section_plan.order
      : ['header', 'summary', 'experience', 'skills', 'education_and_certifications'],
  );

  return {
    blueprint_version: String(raw.blueprint_version ?? '2.0'),
    target_role: String(raw.target_role ?? `${input.research.jd_analysis.role_title}`),
    positioning_angle: String(raw.positioning_angle ?? ''),

    section_plan: {
      order: normalizedOrder.length > 0
        ? normalizedOrder
        : ['header', 'summary', 'experience', 'skills', 'education_and_certifications'],
      rationale: String(section_plan.rationale ?? ''),
    },

    summary_blueprint: {
      positioning_angle: String(summary_blueprint.positioning_angle ?? ''),
      must_include: (summary_blueprint.must_include as string[]) ?? [],
      gap_reframe: (summary_blueprint.gap_reframe as Record<string, string>) ?? {},
      tone_guidance: String(summary_blueprint.tone_guidance ?? ''),
      keywords_to_embed: (summary_blueprint.keywords_to_embed as string[]) ?? [],
      authentic_phrases_to_echo: (summary_blueprint.authentic_phrases_to_echo as string[]) ?? [],
      length: String(summary_blueprint.length ?? '3-4 sentences'),
    } as SummaryBlueprint,

    evidence_allocation: {
      selected_accomplishments: (evidence_allocation.selected_accomplishments as EvidenceAllocation['selected_accomplishments']) ?? [],
      experience_section: (evidence_allocation.experience_section as EvidenceAllocation['experience_section']) ?? {},
      unallocated_requirements: (evidence_allocation.unallocated_requirements as EvidenceAllocation['unallocated_requirements']) ?? [],
    },

    skills_blueprint: {
      format: 'categorized',
      categories: (skills_blueprint.categories as SkillsBlueprint['categories']) ?? [],
      keywords_still_missing: (skills_blueprint.keywords_still_missing as string[]) ?? [],
      age_protection_removals: (skills_blueprint.age_protection_removals as string[]) ?? [],
    },

    experience_blueprint: {
      roles: (experience_blueprint.roles as ExperienceBlueprint['roles']) ?? [],
      earlier_career: (experience_blueprint.earlier_career as ExperienceBlueprint['earlier_career']) ?? undefined,
    },

    age_protection: {
      flags: (age_protection.flags as AgeProtectionAudit['flags']) ?? [],
      clean: Boolean(age_protection.clean),
    },

    keyword_map: Object.fromEntries(
      Object.entries(keyword_map).map(([key, val]) => [key, {
        target_density: Number(val.target_density ?? 2),
        placements: (val.placements as string[]) ?? [],
        current_count: Number(val.current_count ?? 0),
        action: String(val.action ?? ''),
      } as KeywordTarget])
    ),

    global_rules: {
      voice: String(global_rules.voice ?? 'Professional, direct, metrics-forward.'),
      bullet_format: String(global_rules.bullet_format ?? 'Action verb → scope → method → measurable result'),
      length_target: String(global_rules.length_target ?? '2 pages maximum'),
      ats_rules: String(global_rules.ats_rules ?? 'No tables, no columns, standard section headers only'),
    },
  };
}

function normalizeSectionName(rawName: string): string | null {
  const key = rawName.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliasMap: Record<string, string> = {
    header: 'header',
    summary: 'summary',
    professional_summary: 'summary',
    executive_summary: 'summary',
    selected_accomplishments: 'selected_accomplishments',
    key_accomplishments: 'selected_accomplishments',
    accomplishments: 'selected_accomplishments',
    experience: 'experience',
    professional_experience: 'experience',
    work_experience: 'experience',
    employment_history: 'experience',
    skills: 'skills',
    core_competencies: 'skills',
    competencies: 'skills',
    technical_skills: 'skills',
    education_and_certifications: 'education_and_certifications',
    'education_&_certifications': 'education_and_certifications',
    education: 'education_and_certifications',
    certifications: 'education_and_certifications',
  };
  return aliasMap[key] ?? null;
}

function normalizeSectionOrder(rawOrder: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const section of rawOrder) {
    if (typeof section !== 'string') continue;
    const canonical = normalizeSectionName(section);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push(canonical);
  }
  return normalized;
}

/**
 * Fallback blueprint when all LLM parse attempts fail.
 * Returns a valid structure derived from pipeline inputs so the pipeline can continue.
 */
function buildDefaultBlueprint(input: ArchitectInput): ArchitectOutput {
  const { parsed_resume, positioning, research, gap_analysis } = input;
  const roleTitle = research.jd_analysis.role_title ?? 'Target Role';
  const company = research.jd_analysis.company || research.company_research.company_name || 'Target Company';

  // Build experience roles from parsed resume
  const roles = parsed_resume.experience.map((exp, i) => ({
    company: exp.company,
    title: exp.title,
    dates: `${exp.start_date} – ${exp.end_date}`,
    title_adjustment: undefined as string | undefined,
    bullet_count: i < 2 ? 5 : 3,
  }));

  // Build evidence allocations from positioning evidence library
  const accomplishments = (positioning.evidence_library ?? []).slice(0, 5).map((ev) => ({
    evidence_id: String(ev.id ?? ''),
    achievement: `${ev.situation} — ${ev.result}`,
    maps_to_requirements: [] as string[],
    placement_rationale: 'Auto-allocated from evidence library',
    enhancement: '',
  }));

  // Build skill categories from parsed resume
  const categories = [{
    label: 'Core Skills',
    skills: parsed_resume.skills.slice(0, 12),
    rationale: 'Primary skills from resume',
  }];

  // Keywords from JD
  const keywords = [
    ...research.jd_analysis.language_keywords,
    ...research.benchmark_candidate.language_keywords,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return {
    blueprint_version: '2.0',
    target_role: `${roleTitle} at ${company}`,
    positioning_angle: positioning.career_arc?.label ?? '',

    section_plan: {
      order: ['header', 'summary', 'selected_accomplishments', 'experience', 'skills', 'education_and_certifications'],
      rationale: 'Standard order (fallback — LLM blueprint parsing failed)',
    },

    summary_blueprint: {
      positioning_angle: positioning.career_arc?.label ?? '',
      must_include: (research.jd_analysis.must_haves ?? []).map((mh: string | { requirement: string }) => typeof mh === 'string' ? mh : mh.requirement).slice(0, 4),
      gap_reframe: {},
      tone_guidance: 'Professional, direct, results-oriented.',
      keywords_to_embed: keywords.slice(0, 8),
      authentic_phrases_to_echo: positioning.authentic_phrases?.slice(0, 3) ?? [],
      length: '3-4 sentences',
    },

    evidence_allocation: {
      selected_accomplishments: accomplishments,
      experience_section: {},
      unallocated_requirements: gap_analysis.critical_gaps?.map((g: string) => ({
        requirement: g,
        resolution: 'Manual review recommended',
      })) ?? [],
    },

    skills_blueprint: {
      format: 'categorized' as const,
      categories,
      keywords_still_missing: keywords.slice(8),
      age_protection_removals: [],
    },

    experience_blueprint: {
      roles,
      earlier_career: roles.length > 3
        ? {
            include: true,
            roles: roles.slice(3).map(r => ({ title: r.title, company: r.company })),
            format: 'one-liner per role, no bullets',
            rationale: 'Condense older roles to save space',
          }
        : undefined,
    },

    age_protection: {
      flags: [],
      clean: true,
    },

    keyword_map: Object.fromEntries(
      keywords.slice(0, 10).map(kw => [kw, {
        target_density: 2,
        placements: ['summary', 'skills'],
        current_count: 0,
        action: 'Add to resume',
      }])
    ),

    global_rules: {
      voice: 'Professional, direct, metrics-forward.',
      bullet_format: 'Action verb → scope → method → measurable result',
      length_target: '2 pages maximum',
      ats_rules: 'No tables, no columns, standard section headers only',
    },
  };
}
