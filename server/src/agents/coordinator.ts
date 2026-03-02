/**
 * Pipeline Coordinator (v3)
 *
 * Thin coordinator that replaces the 4100-line pipeline.ts monolith.
 * Sequences 3 agents: Strategist → Craftsman → Producer.
 * Handles user interaction (SSE gates), inter-agent messaging (Producer
 * revision requests back to Craftsman), error recovery, and token tracking.
 *
 * Zero LLM calls here — pure coordination logic.
 */

import { setMaxListeners } from 'node:events';
import {
  startUsageTracking,
  stopUsageTracking,
  setUsageTrackingContext,
} from '../lib/llm-provider.js';
import { createSessionLogger } from '../lib/logger.js';
import { MODEL_PRICING } from '../lib/llm.js';
import { captureError } from '../lib/sentry.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { FF_BLUEPRINT_APPROVAL } from '../lib/feature-flags.js';
import { runAtsComplianceCheck } from './ats-rules.js';
import { mergeMasterResume } from './master-resume-merge.js';
import { runAgentLoop } from './runtime/agent-loop.js';
import { AgentBus } from './runtime/agent-bus.js';
import { agentRegistry } from './runtime/agent-registry.js';
// Import agent modules to trigger self-registration with agentRegistry
import { strategistConfig } from './strategist/agent.js';
import { craftsmanConfig } from './craftsman/agent.js';
import { producerConfig } from './producer/agent.js';
import type {
  PipelineState,
  PipelineStage,
  PipelineSSEEvent,
  ArchitectOutput,
  SectionWriterOutput,
  IntakeOutput,
  MasterResumeEvidenceItem,
  MasterResumeData,
} from './types.js';
import type { AgentMessage } from './runtime/agent-protocol.js';
import type { CreateContextParams } from './runtime/agent-context.js';

// ─── Public API (matches old pipeline.ts exports) ─────────────────────

export type PipelineEmitter = (event: PipelineSSEEvent) => void;

/**
 * User-interaction callback — the pipeline pauses at interactive gates
 * and calls this to wait for user input.
 */
export type WaitForUser = <T>(gate: string) => Promise<T>;

export interface PipelineConfig {
  session_id: string;
  user_id: string;
  raw_resume_text: string;
  job_description: string;
  company_name: string;
  workflow_mode?: 'fast_draft' | 'balanced' | 'deep_dive';
  minimum_evidence_target?: number;
  resume_priority?: 'authentic' | 'ats' | 'impact' | 'balanced';
  seniority_delta?: 'same' | 'one_up' | 'big_jump' | 'step_back';
  master_resume_id?: string;
  master_resume?: MasterResumeData;
  emit: PipelineEmitter;
  waitForUser: WaitForUser;
}

// ─── Internal types ───────────────────────────────────────────────────

interface FinalResumePayload {
  summary: string;
  selected_accomplishments?: string;
  experience: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date: string;
    location: string;
    bullets: Array<{ text: string; source: string }>;
  }>;
  skills: Record<string, string[]>;
  education: Array<{ institution: string; degree: string; field: string; year: string }>;
  certifications: Array<{ name: string; issuer: string; year: string }>;
  ats_score: number;
  contact_info?: Record<string, string>;
  section_order?: string[];
  company_name?: string;
  job_title?: string;
  _raw_sections?: Record<string, string>;
  selected_template?: { id: string; name: string; font: string; accent: string };
}

// ─── Stage timing helpers ─────────────────────────────────────────────

type StageTimingMap = Partial<Record<PipelineStage, number>>;

function makeStageTimer() {
  const starts = new Map<PipelineStage, number>();
  const timings: StageTimingMap = {};

  return {
    start(stage: PipelineStage): void {
      starts.set(stage, Date.now());
    },
    end(stage: PipelineStage): number {
      const t = starts.get(stage);
      if (t) {
        timings[stage] = Date.now() - t;
      }
      return timings[stage] ?? 0;
    },
    get(stage: PipelineStage): number | undefined {
      return timings[stage];
    },
    all(): StageTimingMap {
      return timings;
    },
  };
}

// ─── Cost calculation ─────────────────────────────────────────────────

/**
 * Estimate USD cost from accumulated token counts.
 * Uses the same blended rate as the old pipeline: 50% LIGHT (free),
 * 30% MID, 20% PRIMARY — a reasonable approximation for a mixed-model run.
 */
function calculateCost(usage: { input_tokens: number; output_tokens: number }): number {
  const lightPrice  = MODEL_PRICING['glm-4.7-flash']  ?? { input: 0,    output: 0    };
  const midPrice    = MODEL_PRICING['glm-4.5-air']    ?? { input: 0.20, output: 1.10 };
  const primaryPrice = MODEL_PRICING['glm-4.7']       ?? { input: 0.60, output: 2.20 };

  const blendedInput  = lightPrice.input  * 0.5 + midPrice.input  * 0.3 + primaryPrice.input  * 0.2;
  const blendedOutput = lightPrice.output * 0.5 + midPrice.output * 0.3 + primaryPrice.output * 0.2;

  return Number(
    (
      (usage.input_tokens  / 1_000_000) * blendedInput +
      (usage.output_tokens / 1_000_000) * blendedOutput
    ).toFixed(4),
  );
}

// ─── Initial messages ─────────────────────────────────────────────────

/**
 * Build the opening message handed to the Strategist.
 *
 * Contains everything the Strategist needs to drive the intelligence phase:
 * raw resume, job description, company name, and user preferences.
 */
function buildStrategistMessage(config: PipelineConfig): string {
  const prefs: string[] = [];
  if (config.workflow_mode)          prefs.push(`Workflow mode: ${config.workflow_mode}`);
  if (config.resume_priority)        prefs.push(`Resume priority: ${config.resume_priority}`);
  if (config.seniority_delta)        prefs.push(`Seniority delta: ${config.seniority_delta}`);
  if (config.minimum_evidence_target != null)
    prefs.push(`Minimum evidence target: ${config.minimum_evidence_target}`);

  // Build master resume section if available (with size caps to bound context)
  const MAX_BULLETS_PER_ROLE = 15;
  const MAX_EVIDENCE_ITEMS_INJECTED = 50;
  const masterResumeSection: string[] = [];
  if (config.master_resume) {
    const mr = config.master_resume;
    masterResumeSection.push('## MASTER RESUME — ACCUMULATED EVIDENCE FROM PRIOR SESSIONS');
    masterResumeSection.push('This candidate has completed previous resume sessions. The following evidence has been accumulated:');
    masterResumeSection.push('');

    // Experience with capped bullets (original + crafted)
    if (Array.isArray(mr.experience) && mr.experience.length > 0) {
      masterResumeSection.push('### Experience');
      for (const role of mr.experience) {
        masterResumeSection.push(`**${role.title}** at ${role.company} (${role.start_date} – ${role.end_date})`);
        const cappedBullets = role.bullets.slice(0, MAX_BULLETS_PER_ROLE);
        for (const bullet of cappedBullets) {
          masterResumeSection.push(`  - [${bullet.source}] ${bullet.text}`);
        }
        if (role.bullets.length > MAX_BULLETS_PER_ROLE) {
          masterResumeSection.push(`  - ... and ${role.bullets.length - MAX_BULLETS_PER_ROLE} more bullets`);
        }
        masterResumeSection.push('');
      }
    }

    // Evidence items (crafted bullets, interview answers from prior sessions)
    const evidenceItems = Array.isArray(mr.evidence_items) ? mr.evidence_items : [];
    if (evidenceItems.length > 0) {
      masterResumeSection.push('### Accumulated Evidence Items');
      const bySource = { crafted: [] as string[], upgraded: [] as string[], interview: [] as string[] };
      for (const item of evidenceItems) {
        const list = bySource[item.source] ?? bySource.crafted;
        list.push(`  - ${item.category ? `[${item.category}] ` : ''}${item.text}`);
      }
      let injectedCount = 0;
      for (const [label, sourceKey] of [['Crafted bullets from prior sessions', 'crafted'], ['Upgraded bullets from prior sessions', 'upgraded'], ['Interview answers from prior sessions', 'interview']] as const) {
        const list = bySource[sourceKey];
        if (list.length > 0) {
          const remaining = MAX_EVIDENCE_ITEMS_INJECTED - injectedCount;
          if (remaining <= 0) break;
          masterResumeSection.push(`**${label}:**`);
          masterResumeSection.push(...list.slice(0, remaining));
          injectedCount += Math.min(list.length, remaining);
          if (list.length > remaining) {
            masterResumeSection.push(`  - ... and ${list.length - remaining} more items`);
          }
        }
      }
      masterResumeSection.push('');
    }

    // Skills inventory
    if (mr.skills && typeof mr.skills === 'object' && Object.keys(mr.skills).length > 0) {
      masterResumeSection.push('### Skills Inventory');
      for (const [category, skills] of Object.entries(mr.skills)) {
        masterResumeSection.push(`**${category}:** ${skills.join(', ')}`);
      }
      masterResumeSection.push('');
    }
  }

  return [
    '## Raw Resume',
    config.raw_resume_text.trim(),
    '',
    '## Job Description',
    config.job_description.trim(),
    '',
    `## Company Name\n${config.company_name}`,
    '',
    ...(prefs.length > 0
      ? ['## User Preferences', prefs.join('\n'), '']
      : []),
    ...(masterResumeSection.length > 0
      ? [...masterResumeSection, '']
      : []),
    'Begin the intelligence phase now. Parse the resume, analyze the JD, research the company, interview the candidate, run gap analysis, and produce the architect blueprint.',
  ].join('\n');
}

/**
 * Build the opening message handed to the Craftsman.
 *
 * Contains the complete blueprint and evidence library from the Strategist.
 */
function buildCraftsmanMessage(state: PipelineState): string {
  const blueprint  = state.architect!;
  const positioning = state.positioning;
  const gapAnalysis = state.gap_analysis;
  const transcript = state.interview_transcript;

  return [
    '## Architect Blueprint',
    JSON.stringify(blueprint, null, 2),
    '',
    ...(positioning ? [
      '## Evidence Library (Positioning Profile)',
      JSON.stringify(positioning.evidence_library, null, 2),
      '',
      '## Candidate Voice',
      `Career Arc: ${positioning.career_arc.label}`,
      `In their own words: "${positioning.career_arc.user_description}"`,
      `Authentic Phrases: ${positioning.authentic_phrases.map(p => `"${p}"`).join(', ')}`,
      '',
    ] : []),
    ...(transcript && transcript.length > 0 ? [
      '## Interview Transcript (Candidate\'s Own Words)',
      '**Use these answers as source material for the candidate\'s authentic voice.**',
      '**Echo their phrasing, their way of describing impact, their natural language.**',
      '',
      ...transcript.map(t => `Q: ${t.question_text}\nA: ${t.answer}\n`),
    ] : []),
    ...(gapAnalysis ? [
      '## Gap Analysis',
      JSON.stringify(gapAnalysis, null, 2),
      '',
    ] : []),
    '## Global Rules',
    JSON.stringify(blueprint.global_rules, null, 2),
    '',
    '## Section Plan',
    `Section order: ${blueprint.section_plan.order.join(', ')}`,
    `Rationale: ${blueprint.section_plan.rationale}`,
    '',
    'Write every section in the blueprint. Follow the self-review protocol before presenting each section to the user.',
  ].join('\n');
}

/**
 * Build the opening message handed to the Producer.
 *
 * Contains all written sections, the blueprint, JD analysis, and evidence library.
 */
function buildProducerMessage(state: PipelineState): string {
  const sections   = state.sections ?? {};
  const blueprint  = state.architect!;
  const research   = state.research;
  const positioning = state.positioning;

  const sectionSummaries = Object.entries(sections)
    .map(([key, out]) => `### ${key}\n${out.content.slice(0, 500)}${out.content.length > 500 ? '…' : ''}`)
    .join('\n\n');

  return [
    '## Written Sections',
    sectionSummaries,
    '',
    '## Full Section Content (for review)',
    JSON.stringify(
      Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.content])),
      null,
      2,
    ),
    '',
    '## Architect Blueprint',
    JSON.stringify(blueprint, null, 2),
    '',
    ...(research ? [
      '## JD Analysis',
      JSON.stringify(research.jd_analysis, null, 2),
      '',
    ] : []),
    ...(positioning ? [
      '## Evidence Library',
      JSON.stringify(positioning.evidence_library, null, 2),
      '',
    ] : []),
    'Perform full quality review: template selection, cross-section consistency, blueprint compliance, ATS compliance, humanize check, and adversarial review. Route targeted revision requests to the Craftsman if needed.',
  ].join('\n');
}

// ─── Resume assembly ──────────────────────────────────────────────────

/**
 * Assemble the full resume text for ATS compliance checking.
 * Mirrors the logic from the old pipeline.ts assembleResume().
 */
function assembleResume(
  sections: Record<string, SectionWriterOutput> | undefined,
  blueprint: ArchitectOutput | undefined,
): string {
  if (!sections || !blueprint) return '';
  const parts: string[] = [];

  for (const sectionName of blueprint.section_plan.order) {
    if (sectionName === 'experience') {
      const roleKeys = Object.keys(sections)
        .filter(k => k.startsWith('experience_role_'))
        .sort(compareExperienceRoleKeys);
      for (const key of roleKeys) {
        parts.push(sections[key].content);
      }
      if (sections['earlier_career']) {
        parts.push(sections['earlier_career'].content);
      }
      continue;
    }
    const section = sections[sectionName];
    if (section) {
      parts.push(section.content);
    }
  }

  return parts.join('\n\n');
}

// ─── Final resume payload ─────────────────────────────────────────────

function compareExperienceRoleKeys(a: string, b: string): number {
  const ai = Number.parseInt(a.replace('experience_role_', ''), 10);
  const bi = Number.parseInt(b.replace('experience_role_', ''), 10);
  if (Number.isNaN(ai) || Number.isNaN(bi)) return a.localeCompare(b);
  return ai - bi;
}

function stripLeadingSectionTitle(content: string): string {
  const lines = content.split('\n');
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  if (lines.length === 0) return '';
  const first = lines[0].trim();

  if (/^[A-Z][A-Z &/]+$/.test(first) && first.length > 2) {
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  } else if (
    /^(Professional Summary|Selected Accomplishments|Core Competencies|Skills|Education|Certifications|Experience|Professional Experience|Earlier Career)$/i.test(first)
  ) {
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  }

  return lines.join('\n').trim();
}

function normalizeSkills(intakeSkills: string[]): Record<string, string[]> {
  if (!Array.isArray(intakeSkills) || intakeSkills.length === 0) return {};
  return { 'Core Skills': intakeSkills.slice(0, 30) };
}

function sanitizeEducationYear(
  rawYear: string | undefined,
  ageProtection: ArchitectOutput['age_protection'] | undefined,
): string {
  const yearText = (rawYear ?? '').trim();
  if (!yearText) return '';
  if (!ageProtection || ageProtection.clean) return yearText;

  const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return yearText;
  const yearToken = yearMatch[0];

  const flaggedYears = new Set<string>();
  for (const flag of ageProtection.flags ?? []) {
    const matches = `${flag.item} ${flag.risk} ${flag.action}`.match(/\b(19|20)\d{2}\b/g) ?? [];
    for (const y of matches) flaggedYears.add(y);
  }
  if (flaggedYears.has(yearToken)) return '';

  const numericYear = Number.parseInt(yearToken, 10);
  if (!Number.isNaN(numericYear) && new Date().getFullYear() - numericYear >= 20) {
    return '';
  }

  return yearText;
}

function parseExperienceRoleForStructuredPayload(
  crafted: string | undefined,
  fallback: IntakeOutput['experience'][number],
): {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  location: string;
  bullets: Array<{ text: string; source: string }>;
} {
  if (!crafted) {
    return {
      title: fallback.title,
      company: fallback.company,
      start_date: fallback.start_date,
      end_date: fallback.end_date,
      location: '',
      bullets: fallback.bullets.map(b => ({ text: b, source: 'resume' })),
    };
  }

  const stripMd = (s: string) => s.replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '');
  const lines = crafted.split('\n').map(l => stripMd(l.trim())).filter(Boolean);
  const bulletLines = lines.filter(l => /^[•\-*]\s/.test(l));
  const nonBullets  = lines.filter(l => !/^[•\-*]\s/.test(l));

  const headerLines = nonBullets.filter(l => {
    if (/^[A-Z][A-Z &/]+$/.test(l) && l.length > 2) return false;
    if (/^(Experience|Professional Experience|Earlier Career)$/i.test(l)) return false;
    return true;
  });

  let startDate = fallback.start_date;
  let endDate   = fallback.end_date;
  let location  = '';

  const DATE_LINE_RE = /^(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+)?\d{4}\s*[–\-]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+)?\d{4}|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+)?\d{4}\s*[–\-]\s*(?:Present|Current)$/i;
  const YEAR_EXTRACT_RE = /\b(\d{4})\b/g;

  const dateLine = headerLines.find(l => DATE_LINE_RE.test(l));
  if (dateLine) {
    const yearMatches = Array.from(dateLine.matchAll(YEAR_EXTRACT_RE)).map(m => m[1]);
    if (yearMatches.length >= 2) {
      startDate = yearMatches[0];
      endDate   = yearMatches[1];
    } else if (yearMatches.length === 1) {
      startDate = yearMatches[0];
      if (/Present|Current/i.test(dateLine)) endDate = 'Present';
    }
  }

  const contentHeaders = headerLines.filter(l => !DATE_LINE_RE.test(l));
  // The last non-date, non-title line is most likely a city/state location
  if (contentHeaders.length >= 2) {
    const last = contentHeaders[contentHeaders.length - 1];
    if (/,\s*[A-Z]{2}$/.test(last) || /Remote/i.test(last)) {
      location = last;
    }
  }

  const titleLine  = contentHeaders[0] ?? fallback.title;
  const companyLine = contentHeaders[1] ?? fallback.company;

  return {
    title:      titleLine  === fallback.title   ? fallback.title   : titleLine,
    company:    companyLine === fallback.company ? fallback.company : companyLine,
    start_date: startDate,
    end_date:   endDate,
    location,
    bullets: bulletLines.map(b => ({
      text:   b.replace(/^[•\-*]\s+/, '').trim(),
      source: 'crafted',
    })),
  };
}

/**
 * Build the structured FinalResumePayload from pipeline state.
 * Used for the pipeline_complete SSE event and Supabase persistence.
 */
function buildFinalResumePayload(state: PipelineState, config: PipelineConfig): FinalResumePayload {
  const sections = state.sections ?? {};
  const intake   = state.intake!;
  const log      = createSessionLogger(state.session_id);

  const sectionOrder = (
    state.architect?.section_plan.order ?? ['summary', 'experience', 'skills', 'education', 'certifications']
  )
    .flatMap(s => {
      if (s === 'education_and_certifications') return ['education', 'certifications'];
      if (s === 'experience') {
        const roleKeys = Object.keys(state.sections ?? {})
          .filter(k => k.startsWith('experience_role_'))
          .sort(compareExperienceRoleKeys);
        const keys = roleKeys.length > 0 ? roleKeys : ['experience'];
        if (state.sections?.['earlier_career']) keys.push('earlier_career');
        return keys;
      }
      return [s];
    })
    .filter(s => s !== 'header');

  const resume: FinalResumePayload = {
    summary: stripLeadingSectionTitle(sections.summary?.content ?? intake.summary ?? ''),
    selected_accomplishments: sections.selected_accomplishments?.content
      ? stripLeadingSectionTitle(sections.selected_accomplishments.content)
      : undefined,
    experience: (() => {
      const craftedRoleKeys = Object.keys(sections)
        .filter(k => k.startsWith('experience_role_'))
        .sort(compareExperienceRoleKeys);

      if (craftedRoleKeys.length > 0) {
        return craftedRoleKeys
          .map(key => {
            const idx = parseInt(key.replace('experience_role_', ''), 10);
            const fallbackRole = intake.experience[idx];
            if (!fallbackRole) {
              log.warn({ section_key: key }, 'Skipping crafted role without matching intake entry');
              return null;
            }
            return parseExperienceRoleForStructuredPayload(sections[key]?.content, fallbackRole);
          })
          .filter((role): role is NonNullable<typeof role> => role !== null);
      }

      return intake.experience.map((exp, idx) =>
        parseExperienceRoleForStructuredPayload(sections[`experience_role_${idx}`]?.content, exp),
      );
    })(),
    skills: normalizeSkills(intake.skills),
    education: intake.education.map(edu => ({
      institution: edu.institution,
      degree:      edu.degree,
      field:       '',
      year:        sanitizeEducationYear(edu.year, state.architect?.age_protection),
    })),
    certifications: intake.certifications.map(cert => ({
      name:   cert,
      issuer: '',
      year:   '',
    })),
    ats_score:    state.quality_review?.scores.ats_score ?? 0,
    contact_info: intake.contact,
    section_order: sectionOrder,
    company_name: config.company_name,
    job_title:    state.research?.jd_analysis.role_title,
    _raw_sections: Object.fromEntries(
      Object.entries(sections).map(([k, v]) => [k, stripLeadingSectionTitle(v.content)]),
    ),
    selected_template: state.selected_template,
  };

  // Best-effort: parse skills section into structured categories when present
  const skillsText = sections.skills?.content;
  if (skillsText) {
    const parsedSkills: Record<string, string[]> = {};
    for (const line of skillsText.split('\n')) {
      const trimmed = line
        .trim()
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/^[-•*]\s*/, '');
      const idx = trimmed.indexOf(':');
      if (idx <= 0) continue;
      const key   = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!key || !value) continue;
      parsedSkills[key] = value.split(/[,|;\u2022]/).map(s => s.trim()).filter(Boolean);
    }
    if (Object.keys(parsedSkills).length > 0) {
      resume.skills = parsedSkills;
    } else {
      log.warn('Skills section could not be parsed into categories; falling back to intake skills');
    }
  }

  return resume;
}

// ─── Master resume merge & save ──────────────────────────────────────

/**
 * Extract evidence items from a completed pipeline run.
 * Sources: crafted bullets from sections, interview transcript answers.
 */
const MAX_EVIDENCE_TEXT_LENGTH = 1000;

/** Truncate text at a word boundary if it exceeds the cap. */
function capEvidenceText(text: string): string {
  if (text.length <= MAX_EVIDENCE_TEXT_LENGTH) return text;
  const truncated = text.slice(0, MAX_EVIDENCE_TEXT_LENGTH).replace(/\s\S*$/, '');
  return truncated + '...';
}

function extractEvidenceItems(
  state: PipelineState,
  sessionId: string,
): MasterResumeEvidenceItem[] {
  const now = new Date().toISOString();
  const items: MasterResumeEvidenceItem[] = [];

  // Crafted bullets from written sections
  const sections = state.sections ?? {};
  for (const [key, section] of Object.entries(sections)) {
    if (!key.startsWith('experience_role_') && key !== 'summary' && key !== 'selected_accomplishments' && key !== 'earlier_career') continue;

    const rawContent = section.content ?? '';

    // Prose sections (summary, accomplishments): capture full content as single evidence item
    if (key === 'summary' || key === 'selected_accomplishments') {
      const text = capEvidenceText(rawContent.trim());
      if (text.length > 10) {
        items.push({ text, source: 'crafted', category: key, source_session_id: sessionId, created_at: now });
      }
      continue;
    }

    // Bullet-based sections: extract individual bullets
    const lines = rawContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[•\-*]\s/.test(trimmed)) {
        const text = capEvidenceText(trimmed.replace(/^[•\-*]\s+/, '').trim());
        if (text.length > 10) {
          items.push({
            text,
            source: 'crafted',
            category: key,
            source_session_id: sessionId,
            created_at: now,
          });
        }
      }
    }
  }

  // Interview transcript answers
  const transcript = state.interview_transcript ?? [];
  for (const entry of transcript) {
    const answerText = capEvidenceText(entry.answer?.trim() ?? '');
    if (answerText.length > 10) {
      items.push({
        text: answerText,
        source: 'interview',
        category: entry.category,
        source_session_id: sessionId,
        created_at: now,
      });
    }
  }

  return items;
}

/**
 * Auto-save master resume after pipeline completion.
 * If an existing master resume is linked to this session, merge new data into it.
 * If no master resume exists, create one from the pipeline output.
 * Non-critical — failure is logged but does not throw.
 */
async function saveMasterResume(
  state: PipelineState,
  config: PipelineConfig,
  finalResume: FinalResumePayload,
): Promise<void> {
  const log = createSessionLogger(state.session_id);

  try {
    const evidenceItems = extractEvidenceItems(state, state.session_id);

    // Load existing master resume if one was used for this session
    let existing: MasterResumeData | null = null;
    if (config.master_resume_id) {
      const { data, error: loadError } = await supabaseAdmin
        .from('master_resumes')
        .select('id, summary, experience, skills, education, certifications, evidence_items, contact_info, raw_text, version')
        .eq('id', config.master_resume_id)
        .eq('user_id', state.user_id)
        .single();

      if (loadError && loadError.code !== 'PGRST116') {
        // Real DB error (not "row not found") — log and bail to avoid duplicate INSERT
        log.warn({ error: loadError.message, code: loadError.code, master_resume_id: config.master_resume_id }, 'saveMasterResume: failed to load existing — skipping save');
        return;
      }

      if (data) {
        const mrData = data as unknown as MasterResumeData;
        existing = {
          ...mrData,
          evidence_items: Array.isArray(mrData.evidence_items) ? mrData.evidence_items : [],
        };
      }
    }

    if (existing) {
      // Merge into existing and UPDATE in-place (not INSERT)
      const merged = mergeMasterResume(existing, finalResume, evidenceItems);

      const { data: updatedRows, error } = await supabaseAdmin
        .from('master_resumes')
        .update({
          summary: merged.summary,
          experience: merged.experience as unknown as Record<string, unknown>[],
          skills: merged.skills,
          education: merged.education as unknown as Record<string, unknown>[],
          certifications: merged.certifications as unknown as Record<string, unknown>[],
          contact_info: merged.contact_info ?? {},
          evidence_items: merged.evidence_items as unknown as Record<string, unknown>[],
          raw_text: config.raw_resume_text || merged.raw_text,
          source_session_id: state.session_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.master_resume_id)
        .eq('user_id', state.user_id)
        .select('id');

      if (error) {
        log.warn({ error: error.message }, 'saveMasterResume: merge UPDATE failed');
      } else if (!updatedRows || updatedRows.length === 0) {
        // Row was deleted between load and UPDATE — fall through to CREATE
        log.warn({ master_resume_id: config.master_resume_id }, 'saveMasterResume: UPDATE matched zero rows — row may have been deleted, falling through to CREATE');
        existing = null;
      } else {
        log.info({ master_resume_id: config.master_resume_id, evidence_count: merged.evidence_items.length }, 'Master resume merged with new evidence');
      }
    }

    if (!existing) {
      // Create new master resume from pipeline output
      const { data: newMr, error } = await supabaseAdmin.rpc('create_master_resume_atomic', {
        p_user_id: state.user_id,
        p_raw_text: config.raw_resume_text,
        p_summary: finalResume.summary,
        p_experience: finalResume.experience,
        p_skills: finalResume.skills,
        p_education: finalResume.education,
        p_certifications: finalResume.certifications,
        p_contact_info: finalResume.contact_info ?? {},
        p_source_session_id: state.session_id,
        p_set_as_default: true,
        p_evidence_items: evidenceItems,
      });

      if (error) {
        log.warn({ error: error.message }, 'saveMasterResume: create RPC failed');
      } else {
        // Link the new master resume back to the session so subsequent runs find it
        const newId = typeof newMr === 'object' && newMr !== null ? (newMr as Record<string, unknown>).id : undefined;
        if (newId) {
          const { error: linkError } = await supabaseAdmin
            .from('coach_sessions')
            .update({ master_resume_id: newId })
            .eq('id', state.session_id);
          if (linkError) {
            log.warn({ error: linkError.message, newMasterResumeId: newId }, 'saveMasterResume: failed to link new master resume to session');
          } else {
            log.info({ master_resume_id: newId, evidence_count: evidenceItems.length }, 'Master resume created and linked to session');
          }
        } else {
          log.info({ evidence_count: evidenceItems.length }, 'Master resume created from pipeline output (no ID returned)');
        }
      }
    }
  } catch (err) {
    // Non-critical — master resume save failure must not stop the pipeline
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'saveMasterResume failed');
  }
}

// ─── Database persistence ─────────────────────────────────────────────

/**
 * Save the final positioning profile to Supabase.
 * Upserts by user_id — one canonical profile per user.
 */
async function savePositioningProfile(
  state: PipelineState,
): Promise<void> {
  if (!state.positioning) return;
  const log = createSessionLogger(state.session_id);

  try {
    const { data: existing } = await supabaseAdmin
      .from('user_positioning_profiles')
      .select('id')
      .eq('user_id', state.user_id)
      .single();

    if (existing?.id) {
      const existingRecord = existing as unknown as Record<string, unknown>;
      const currentVersion = typeof existingRecord.version === 'number' ? existingRecord.version : 0;
      const { error: updateError } = await supabaseAdmin
        .from('user_positioning_profiles')
        .update({
          positioning_data: state.positioning,
          updated_at: new Date().toISOString(),
          version: currentVersion + 1,
        })
        .eq('id', existing.id);
      if (updateError) {
        log.warn({ error: updateError.message, profile_id: existing.id }, 'savePositioningProfile: update failed');
      } else {
        state.positioning_profile_id = existing.id;
        log.info({ profile_id: existing.id }, 'Positioning profile updated');
      }
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('user_positioning_profiles')
        .insert({
          user_id:          state.user_id,
          positioning_data: state.positioning,
          version:          1,
        })
        .select('id')
        .single();
      if (insertError) {
        log.warn({ error: insertError.message }, 'savePositioningProfile: insert failed');
      } else if (inserted?.id) {
        state.positioning_profile_id = inserted.id;
        log.info({ profile_id: inserted.id }, 'Positioning profile created');
      }
    }
  } catch (err) {
    // Non-critical — profile persistence failure must not stop the pipeline
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'savePositioningProfile failed');
  }
}

/**
 * Persist the completed session to Supabase coach_sessions table.
 * Non-critical — failure is logged but does not throw.
 */
async function persistSession(
  state: PipelineState,
  finalResume: FinalResumePayload | undefined,
  emit: PipelineEmitter,
): Promise<void> {
  const log = createSessionLogger(state.session_id);
  try {
    const { data: updatedRows, error } = await supabaseAdmin
      .from('coach_sessions')
      .update({
        status:               'completed',
        input_tokens_used:    state.token_usage.input_tokens,
        output_tokens_used:   state.token_usage.output_tokens,
        estimated_cost_usd:   state.token_usage.estimated_cost_usd,
        positioning_profile_id: state.positioning_profile_id,
        last_panel_type:      'completion',
        last_panel_data:      finalResume ? { resume: finalResume } : undefined,
      })
      .eq('id',      state.session_id)
      .eq('user_id', state.user_id)
      .select('id');

    if (error) {
      throw error;
    }

    if (!updatedRows || updatedRows.length === 0) {
      log.warn({ session_id: state.session_id }, 'persistSession: UPDATE matched zero rows — session may have been deleted');
    }
  } catch (err) {
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'persistSession failed');
    emit({
      type:    'transparency',
      stage:   'complete',
      message: 'Note: Your session could not be saved to the database. Please export your resume now to avoid losing it.',
    });
  }
}

// ─── Inter-agent revision handler ────────────────────────────────────

/**
 * Subscribe to the bus and handle revision requests from the Producer
 * back to the Craftsman.
 *
 * When the Producer's quality review finds issues requiring content changes,
 * it sends a 'request' message to 'craftsman' with revision_instructions.
 * The coordinator intercepts this, runs a targeted Craftsman sub-loop for
 * each affected section, and updates state.sections in place.
 *
 * Returns a cleanup function that removes the bus subscription.
 */
const MAX_REVISION_ROUNDS = 3;

function subscribeToRevisionRequests(
  bus: AgentBus,
  state: PipelineState,
  emit: PipelineEmitter,
  waitForUser: WaitForUser,
  signal: AbortSignal,
  log: ReturnType<typeof createSessionLogger>,
): () => void {
  // Ensure revision_counts is initialized on state (handles sessions restored from DB)
  if (!state.revision_counts) state.revision_counts = {};

  const handler = async (msg: AgentMessage): Promise<void> => {
    if (msg.type !== 'request' || msg.from !== 'producer') return;

    // Support both formats:
    // 1. Array format: payload.revision_instructions = [{ target_section, issue, instruction, priority }]
    // 2. Flat format (from Producer tool): payload = { section, issue, instruction }
    let instructions: Array<{
      target_section: string;
      issue: string;
      instruction: string;
      priority: 'high' | 'medium' | 'low';
      severity?: 'revision' | 'rewrite';
    }>;

    if (Array.isArray(msg.payload.revision_instructions)) {
      instructions = msg.payload.revision_instructions as typeof instructions;
    } else if (typeof msg.payload.section === 'string' && typeof msg.payload.instruction === 'string') {
      // Single flat revision request from Producer's request_content_revision tool
      const severity = msg.payload.severity === 'rewrite' ? 'rewrite' : 'revision';
      instructions = [{
        target_section: msg.payload.section as string,
        issue: (msg.payload.issue as string) ?? '',
        instruction: msg.payload.instruction as string,
        priority: 'high' as const,
        severity,
      }];
    } else {
      return;
    }

    if (instructions.length === 0) return;

    // Process all instructions (flat format is always treated as high priority)
    // Skip sections the user already approved — approved sections are immutable to automated revisions
    const highPriority = instructions
      .filter(i => i.priority === 'high' || i.priority === undefined)
      .filter(i => !state.approved_sections.includes(i.target_section));
    if (highPriority.length === 0) return;

    // Enforce per-section revision cap
    const withinCap = highPriority.filter(i => {
      const count = state.revision_counts[i.target_section] ?? 0;
      if (count >= MAX_REVISION_ROUNDS) {
        log.warn({ section: i.target_section, rounds: count }, 'Coordinator: revision cap reached — accepting content as-is');
        emit({
          type: 'transparency',
          stage: 'revision',
          message: `Revision cap (${MAX_REVISION_ROUNDS} rounds) reached for "${i.target_section}" — accepting current content.`,
        });
        return false;
      }
      return true;
    });

    if (withinCap.length === 0) return;

    // Increment revision counts for sections being revised
    for (const i of withinCap) {
      state.revision_counts[i.target_section] = (state.revision_counts[i.target_section] ?? 0) + 1;
    }

    log.info({ sections: withinCap.map(i => i.target_section) }, 'Coordinator: handling revision requests from Producer');

    emit({
      type:    'revision_start',
      instructions: withinCap,
    });

    emit({
      type:    'transparency',
      stage:   'revision',
      message: `Routing ${withinCap.length} revision request(s) from quality review back to the Craftsman...`,
    });

    // Separate rewrite requests from revision requests
    const rewrites = withinCap.filter(i => i.severity === 'rewrite');
    const revisions = withinCap.filter(i => i.severity !== 'rewrite');

    // Run a focused Craftsman sub-loop for the revision/rewrite instructions
    const messageParts: string[] = [];

    if (rewrites.length > 0) {
      messageParts.push(
        '## REWRITE Instructions from Quality Review',
        'These sections need to be written from scratch using write_section (not revise_section):',
        JSON.stringify(rewrites, null, 2),
      );
    }

    if (revisions.length > 0) {
      messageParts.push(
        '## Revision Instructions from Quality Review',
        JSON.stringify(revisions, null, 2),
      );
    }

    messageParts.push(
      '',
      '## Current Section Content',
      JSON.stringify(
        Object.fromEntries(
          withinCap
            .map(i => i.target_section)
            .filter(s => state.sections?.[s])
            .map(s => [s, state.sections![s].content]),
        ),
        null,
        2,
      ),
      '',
      '## Blueprint',
      JSON.stringify(state.architect ?? {}, null, 2),
      '',
      rewrites.length > 0
        ? 'For REWRITE sections: call write_section fresh with the blueprint slice — start from scratch, do not reference the old content. For REVISION sections: apply targeted changes only, preserve everything else.'
        : 'Apply the revision instructions to the affected sections only. Preserve all other content unchanged.',
    );
    const revisionMessage = messageParts.join('\n');

    const contextParams: CreateContextParams<PipelineState, PipelineSSEEvent> = {
      sessionId:   state.session_id,
      userId:      state.user_id,
      state,
      emit,
      waitForUser,
      signal,
      bus,
      identity:    craftsmanConfig.identity,
    };

    try {
      const result = await runAgentLoop({
        config:         craftsmanConfig,
        contextParams,
        initialMessage: revisionMessage,
      });
      log.info({ rounds: result.rounds_used }, 'Coordinator: Craftsman revision sub-loop complete');
    } catch (err) {
      log.error({ error: err instanceof Error ? err.message : String(err) }, 'Coordinator: Craftsman revision sub-loop failed');
    }
  };

  // Wrap in synchronous subscriber — async handler fires and forgets internally
  const syncHandler = (msg: AgentMessage) => void handler(msg);
  bus.subscribe('craftsman', syncHandler);

  return () => bus.unsubscribe('craftsman');
}

// ─── Main coordinator ─────────────────────────────────────────────────

/**
 * Run the full 3-agent pipeline from start to finish.
 *
 * Stages:
 *   Strategist → Craftsman → Producer
 *
 * For frontend compatibility the coordinator emits the full legacy stage
 * progression: intake → research → positioning → gap_analysis → architect
 * → section_writing → quality_review → complete.
 * The Strategist internally covers stages intake through architect;
 * Craftsman covers section_writing; Producer covers quality_review.
 */
export async function runPipeline(config: PipelineConfig): Promise<PipelineState> {
  const { session_id, user_id, emit, waitForUser } = config;
  const log = createSessionLogger(session_id);

  // ── Usage tracking ──────────────────────────────────────────────
  const usageAcc = startUsageTracking(session_id, user_id);
  setUsageTrackingContext(session_id);

  // ── Initial pipeline state ──────────────────────────────────────
  const state: PipelineState = {
    session_id,
    user_id,
    current_stage: 'intake',
    approved_sections: [],
    revision_count: 0,
    revision_counts: {},
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
    user_preferences: {
      resume_priority:          config.resume_priority ?? 'balanced',
      seniority_delta:          config.seniority_delta,
      workflow_mode:            config.workflow_mode,
      minimum_evidence_target:  config.minimum_evidence_target,
    },
  };

  // ── Shared abort controller ─────────────────────────────────────
  const pipelineAbort = new AbortController();
  setMaxListeners(20, pipelineAbort.signal);

  // ── Stage timing ────────────────────────────────────────────────
  const timer = makeStageTimer();

  // ── Agent bus ───────────────────────────────────────────────────
  const bus = new AgentBus();

  try {
    // ──────────────────────────────────────────────────────────────
    // PHASE 1: STRATEGIST
    // Drives the full intelligence phase:
    //   intake → research → positioning → gap_analysis → architect
    // ──────────────────────────────────────────────────────────────

    log.info('Coordinator: starting Strategist');

    // Emit the first visible stage so the frontend immediately shows activity
    emit({ type: 'stage_start', stage: 'intake', message: 'Step 1 of 7: Parsing and structuring your resume...' });
    state.current_stage = 'intake';
    timer.start('intake');

    const strategistContextParams: CreateContextParams<PipelineState, PipelineSSEEvent> = {
      sessionId:   session_id,
      userId:      user_id,
      state,
      emit,
      waitForUser,
      signal:      pipelineAbort.signal,
      bus,
      identity:    strategistConfig.identity,
    };

    const strategistResult = await runAgentLoop({
      config:         strategistConfig,
      contextParams:  strategistContextParams,
      initialMessage: buildStrategistMessage(config),
    });

    log.info(
      { rounds: strategistResult.rounds_used, messages_out: strategistResult.messages_out.length },
      'Coordinator: Strategist complete',
    );

    // Validate that the Strategist populated the required state fields.
    // Tools called by the Strategist update state in-place via ctx.updateState().
    if (!state.intake) {
      throw new Error('Strategist did not produce intake data. Check parse_resume tool execution.');
    }
    if (!state.architect) {
      throw new Error('Strategist did not produce an architect blueprint. Check design_blueprint tool execution.');
    }

    // Emit stage_complete for architect (last sub-stage the Strategist drives)
    timer.end('architect');
    emit({
      type:        'stage_complete',
      stage:       'architect',
      message:     'Blueprint complete — beginning section writing',
      duration_ms: timer.get('architect'),
    });

    // Save positioning profile after Strategist completes
    if (state.positioning) {
      await savePositioningProfile(state);
    }

    // ──── Blueprint approval gate ────────────────────────────────
    // The Strategist already emitted `blueprint_ready` from design_blueprint,
    // so the frontend has the BlueprintReviewPanel ready. We just need to wait
    // for the user's approval (or auto-approve in fast_draft / flag-off mode).
    if (FF_BLUEPRINT_APPROVAL && config.workflow_mode !== 'fast_draft') {
      log.info('Coordinator: waiting for blueprint approval');
      const blueprintResponse = await waitForUser<
        true | { approved?: boolean; edits?: { positioning_angle?: string; section_order?: string[] } }
      >('architect_review');

      // Apply user edits if provided
      if (typeof blueprintResponse === 'object' && state.architect) {
        const edits = blueprintResponse.edits;
        if (edits?.positioning_angle) {
          state.architect.positioning_angle = edits.positioning_angle;
          log.info({ angle: edits.positioning_angle }, 'User edited positioning angle');
        }
        if (edits?.section_order?.length) {
          state.architect.section_plan.order = edits.section_order;
          log.info({ order: edits.section_order }, 'User reordered sections');
        }
      }
      log.info('Coordinator: blueprint approved, proceeding to Craftsman');
    } else {
      log.info('Coordinator: blueprint gate skipped (fast_draft or flag off)');
    }

    // ──────────────────────────────────────────────────────────────
    // PHASE 2: CRAFTSMAN
    // Writes every resume section from the blueprint.
    //   section_writing
    // ──────────────────────────────────────────────────────────────

    log.info('Coordinator: starting Craftsman');

    emit({ type: 'stage_start', stage: 'section_writing', message: 'Step 6 of 7: Writing each resume section...' });
    state.current_stage = 'section_writing';
    timer.start('section_writing');

    const craftsmanContextParams: CreateContextParams<PipelineState, PipelineSSEEvent> = {
      sessionId:   session_id,
      userId:      user_id,
      state,
      emit,
      waitForUser,
      signal:      pipelineAbort.signal,
      bus,
      identity:    craftsmanConfig.identity,
    };

    const craftsmanResult = await runAgentLoop({
      config:         craftsmanConfig,
      contextParams:  craftsmanContextParams,
      initialMessage: buildCraftsmanMessage(state),
    });

    // Transfer Craftsman sections from scratchpad to state.sections
    const craftsmanSections: Record<string, SectionWriterOutput> = {};
    for (const [key, val] of Object.entries(craftsmanResult.scratchpad)) {
      if (key.startsWith('section_') && val && typeof val === 'object' && 'content' in (val as Record<string, unknown>)) {
        const sectionName = key.replace('section_', '');
        craftsmanSections[sectionName] = val as SectionWriterOutput;
      }
    }
    if (Object.keys(craftsmanSections).length > 0) {
      state.sections = { ...(state.sections ?? {}), ...craftsmanSections };
      log.info({ count: Object.keys(craftsmanSections).length, keys: Object.keys(craftsmanSections) }, 'Coordinator: transferred Craftsman sections to state');
    }

    timer.end('section_writing');

    log.info(
      { rounds: craftsmanResult.rounds_used, sections: Object.keys(state.sections ?? {}).length },
      'Coordinator: Craftsman complete',
    );

    if (!state.sections || Object.keys(state.sections).length === 0) {
      // Warn but do not abort — Producer can still run quality review on partial output
      log.warn('Coordinator: Craftsman produced no sections');
      emit({
        type:    'transparency',
        stage:   'section_writing',
        message: 'Warning: section writing produced no output. Quality review will run on available content.',
      });
    }

    emit({
      type:        'stage_complete',
      stage:       'section_writing',
      message:     'Step 6 of 7 complete: all sections written',
      duration_ms: timer.get('section_writing'),
    });

    // ──────────────────────────────────────────────────────────────
    // PHASE 3: PRODUCER
    // Quality review, consistency check, ATS compliance, humanize,
    // adversarial review, and export packaging.
    //   quality_review
    //
    // The Producer may request targeted revisions from the Craftsman
    // via the agent bus. The coordinator handles that routing.
    // ──────────────────────────────────────────────────────────────

    log.info('Coordinator: starting Producer');

    emit({ type: 'stage_start', stage: 'quality_review', message: 'Step 7 of 7: Running quality review...' });
    state.current_stage = 'quality_review';
    timer.start('quality_review');

    // Subscribe to revision requests before running the Producer
    const cleanupRevisionSubscription = subscribeToRevisionRequests(
      bus, state, emit, waitForUser, pipelineAbort.signal, log,
    );

    const producerContextParams: CreateContextParams<PipelineState, PipelineSSEEvent> = {
      sessionId:   session_id,
      userId:      user_id,
      state,
      emit,
      waitForUser,
      signal:      pipelineAbort.signal,
      bus,
      identity:    producerConfig.identity,
    };

    let producerResult: Awaited<ReturnType<typeof runAgentLoop>>;
    try {
      producerResult = await runAgentLoop({
        config:         producerConfig,
        contextParams:  producerContextParams,
        initialMessage: buildProducerMessage(state),
      });
    } finally {
      // Always unsubscribe revision listener even if the Producer throws
      cleanupRevisionSubscription();
    }

    timer.end('quality_review');

    log.info(
      {
        rounds:    producerResult.rounds_used,
        decision:  state.quality_review?.decision,
        scores:    state.quality_review?.scores,
      },
      'Coordinator: Producer complete',
    );

    // Re-emit quality_scores with detailed findings from Producer scratchpad
    // so the frontend can show all 7 quality dimensions with collapsible details
    if (state.quality_review?.scores) {
      const scratchpad = producerResult.scratchpad;
      emit({
        type: 'quality_scores',
        scores: state.quality_review.scores,
        details: {
          narrative_coherence: typeof scratchpad.narrative_coherence_score === 'number'
            ? scratchpad.narrative_coherence_score : undefined,
          humanize_issues: Array.isArray(scratchpad.humanize_issues)
            ? scratchpad.humanize_issues : undefined,
          coherence_issues: Array.isArray(scratchpad.narrative_coherence_issues)
            ? scratchpad.narrative_coherence_issues : undefined,
          ats_findings: Array.isArray(scratchpad.ats_findings)
            ? scratchpad.ats_findings : undefined,
        },
      });
    }

    emit({
      type:        'stage_complete',
      stage:       'quality_review',
      message:     'Step 7 of 7 complete: final resume ready for export',
      duration_ms: timer.get('quality_review'),
    });

    // ──────────────────────────────────────────────────────────────
    // FINALIZE
    // Build the pipeline_complete payload, run ATS compliance check,
    // collect token usage, persist to Supabase.
    // ──────────────────────────────────────────────────────────────

    state.current_stage = 'complete';

    const finalResume    = buildFinalResumePayload(state, config);
    const assembledText  = assembleResume(state.sections, state.architect);
    const atsFindings    = runAtsComplianceCheck(assembledText);

    emit({
      type:         'pipeline_complete',
      session_id,
      contact_info:  state.intake?.contact,
      company_name:  config.company_name,
      resume:        finalResume,
      export_validation: {
        passed:   atsFindings.length === 0,
        findings: atsFindings,
      },
    });

    // Collect accumulated token usage from all LLM calls made during this run
    state.token_usage.input_tokens    = usageAcc.input_tokens;
    state.token_usage.output_tokens   = usageAcc.output_tokens;
    state.token_usage.estimated_cost_usd = calculateCost(usageAcc);

    stopUsageTracking(session_id);

    // Persist the completed session
    await persistSession(state, finalResume, emit);

    // Auto-save master resume with accumulated evidence
    await saveMasterResume(state, config, finalResume);

    log.info(
      {
        stages_completed: 3,
        sections:         Object.keys(state.sections ?? {}).length,
        quality_decision: state.quality_review?.decision ?? 'n/a',
        token_usage:      state.token_usage,
        stage_timings_ms: timer.all(),
      },
      'Coordinator: pipeline complete',
    );

    return state;

  } catch (error) {
    pipelineAbort.abort();
    stopUsageTracking(session_id);

    const errorMsg = error instanceof Error ? error.message : String(error);
    captureError(error, { sessionId: session_id, stage: state.current_stage });
    log.error({ error: errorMsg, stage: state.current_stage }, 'Coordinator: pipeline error');

    emit({
      type:  'pipeline_error',
      stage: state.current_stage,
      error: errorMsg,
    });

    throw error;
  }
}
