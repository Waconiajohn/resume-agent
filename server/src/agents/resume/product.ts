/**
 * Resume Product Configuration
 *
 * Implements ProductConfig<PipelineState, PipelineSSEEvent> for the resume product.
 * All resume-specific orchestration logic extracted from the old coordinator.ts.
 *
 * Owns: PipelineConfig, message builders, resume assembly, persistence,
 * revision routing, blueprint approval gate.
 */

import { createSessionLogger } from '../../lib/logger.js';
import { FF_BLUEPRINT_APPROVAL } from '../../lib/feature-flags.js';
import { runAtsComplianceCheck } from '../ats-rules.js';
import { mergeMasterResume } from '../master-resume-merge.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { runAgentLoop } from '../runtime/agent-loop.js';
import { strategistConfig } from '../strategist/agent.js';
import { craftsmanConfig } from '../craftsman/agent.js';
import { producerConfig } from '../producer/agent.js';
import type { ProductConfig, AgentPhase, InterAgentHandler, GateDef } from '../runtime/product-config.js';
import type { CreateContextParams } from '../runtime/agent-context.js';
import type { AgentMessage } from '../runtime/agent-protocol.js';
import type {
  PipelineState,
  PipelineStage,
  PipelineSSEEvent,
  ArchitectOutput,
  SectionWriterOutput,
  IntakeOutput,
  MasterResumeEvidenceItem,
  MasterResumeData,
} from '../types.js';

// Re-export PipelineEmitter and WaitForUser for route compatibility
export type PipelineEmitter = (event: PipelineSSEEvent) => void;
export type WaitForUser = <T>(gate: string) => Promise<T>;

// ─── PipelineConfig (public input type for resume pipelines) ─────────

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

// ─── FinalResumePayload ──────────────────────────────────────────────

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

// ─── Message builders ────────────────────────────────────────────────

function buildStrategistMessage(input: Record<string, unknown>): string {
  const config = input as unknown as PipelineConfig;

  const prefs: string[] = [];
  if (config.workflow_mode)          prefs.push(`Workflow mode: ${config.workflow_mode}`);
  if (config.resume_priority)        prefs.push(`Resume priority: ${config.resume_priority}`);
  if (config.seniority_delta)        prefs.push(`Seniority delta: ${config.seniority_delta}`);
  if (config.minimum_evidence_target != null)
    prefs.push(`Minimum evidence target: ${config.minimum_evidence_target}`);

  const MAX_BULLETS_PER_ROLE = 15;
  const MAX_EVIDENCE_ITEMS_INJECTED = 50;
  const masterResumeSection: string[] = [];
  if (config.master_resume) {
    const mr = config.master_resume;
    masterResumeSection.push('## MASTER RESUME — ACCUMULATED EVIDENCE FROM PRIOR SESSIONS');
    masterResumeSection.push('This candidate has completed previous resume sessions. The following evidence has been accumulated:');
    masterResumeSection.push('');

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

function buildCraftsmanMessage(state: PipelineState): string {
  const blueprint   = state.architect!;
  const positioning = state.positioning;
  const gapAnalysis = state.gap_analysis;
  const transcript  = state.interview_transcript;

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

function buildProducerMessage(state: PipelineState): string {
  const sections    = state.sections ?? {};
  const blueprint   = state.architect!;
  const research    = state.research;
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

// ─── Resume assembly helpers ─────────────────────────────────────────

function compareExperienceRoleKeys(a: string, b: string): number {
  const ai = Number.parseInt(a.replace('experience_role_', ''), 10);
  const bi = Number.parseInt(b.replace('experience_role_', ''), 10);
  if (Number.isNaN(ai) || Number.isNaN(bi)) return a.localeCompare(b);
  return ai - bi;
}

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

function buildFinalResumePayload(state: PipelineState, input: Record<string, unknown>): FinalResumePayload {
  const config = input as unknown as PipelineConfig;
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

// ─── Evidence extraction ─────────────────────────────────────────────

const MAX_EVIDENCE_TEXT_LENGTH = 1000;

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

  const sections = state.sections ?? {};
  for (const [key, section] of Object.entries(sections)) {
    if (!key.startsWith('experience_role_') && key !== 'summary' && key !== 'selected_accomplishments' && key !== 'earlier_career') continue;
    const rawContent = section.content ?? '';

    if (key === 'summary' || key === 'selected_accomplishments') {
      const text = capEvidenceText(rawContent.trim());
      if (text.length > 10) {
        items.push({ text, source: 'crafted', category: key, source_session_id: sessionId, created_at: now });
      }
      continue;
    }

    const lines = rawContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[•\-*]\s/.test(trimmed)) {
        const text = capEvidenceText(trimmed.replace(/^[•\-*]\s+/, '').trim());
        if (text.length > 10) {
          items.push({ text, source: 'crafted', category: key, source_session_id: sessionId, created_at: now });
        }
      }
    }
  }

  const transcript = state.interview_transcript ?? [];
  for (const entry of transcript) {
    const answerText = capEvidenceText(entry.answer?.trim() ?? '');
    if (answerText.length > 10) {
      items.push({ text: answerText, source: 'interview', category: entry.category, source_session_id: sessionId, created_at: now });
    }
  }

  return items;
}

// ─── Persistence ─────────────────────────────────────────────────────

async function savePositioningProfile(state: PipelineState): Promise<void> {
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
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'savePositioningProfile failed');
  }
}

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

    if (error) throw error;

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

async function saveMasterResume(
  state: PipelineState,
  input: Record<string, unknown>,
  finalResume: FinalResumePayload,
): Promise<void> {
  const config = input as unknown as PipelineConfig;
  const log = createSessionLogger(state.session_id);

  try {
    const evidenceItems = extractEvidenceItems(state, state.session_id);

    let existing: MasterResumeData | null = null;
    if (config.master_resume_id) {
      const { data, error: loadError } = await supabaseAdmin
        .from('master_resumes')
        .select('id, summary, experience, skills, education, certifications, evidence_items, contact_info, raw_text, version')
        .eq('id', config.master_resume_id)
        .eq('user_id', state.user_id)
        .single();

      if (loadError && loadError.code !== 'PGRST116') {
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
        log.warn({ master_resume_id: config.master_resume_id }, 'saveMasterResume: UPDATE matched zero rows — row may have been deleted, falling through to CREATE');
        existing = null;
      } else {
        log.info({ master_resume_id: config.master_resume_id, evidence_count: merged.evidence_items.length }, 'Master resume merged with new evidence');
      }
    }

    if (!existing) {
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
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'saveMasterResume failed');
  }
}

// ─── Revision handler (InterAgentHandler) ────────────────────────────

const MAX_REVISION_ROUNDS = 3;

function createRevisionHandler(): InterAgentHandler<PipelineState, PipelineSSEEvent> {
  return {
    listenTo: 'craftsman',
    handler: async (msg, state, ctx) => {
      if (msg.type !== 'request' || msg.from !== 'producer') return;

      const log = createSessionLogger(state.session_id);

      if (!state.revision_counts) state.revision_counts = {};

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

      const highPriority = instructions
        .filter(i => i.priority === 'high' || i.priority === undefined)
        .filter(i => !state.approved_sections.includes(i.target_section));
      if (highPriority.length === 0) return;

      const withinCap = highPriority.filter(i => {
        const count = state.revision_counts[i.target_section] ?? 0;
        if (count >= MAX_REVISION_ROUNDS) {
          log.warn({ section: i.target_section, rounds: count }, 'Coordinator: revision cap reached — accepting content as-is');
          ctx.emit({
            type: 'transparency',
            stage: 'revision',
            message: `Revision cap (${MAX_REVISION_ROUNDS} rounds) reached for "${i.target_section}" — accepting current content.`,
          });
          return false;
        }
        return true;
      });

      if (withinCap.length === 0) return;

      for (const i of withinCap) {
        state.revision_counts[i.target_section] = (state.revision_counts[i.target_section] ?? 0) + 1;
      }

      log.info({ sections: withinCap.map(i => i.target_section) }, 'Coordinator: handling revision requests from Producer');

      ctx.emit({ type: 'revision_start', instructions: withinCap });
      ctx.emit({
        type:    'transparency',
        stage:   'revision',
        message: `Routing ${withinCap.length} revision request(s) from quality review back to the Craftsman...`,
      });

      const rewrites  = withinCap.filter(i => i.severity === 'rewrite');
      const revisions = withinCap.filter(i => i.severity !== 'rewrite');

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

      const contextParams: CreateContextParams<PipelineState, PipelineSSEEvent> = {
        sessionId:   state.session_id,
        userId:      state.user_id,
        state,
        emit:        ctx.emit,
        waitForUser: ctx.waitForUser,
        signal:      ctx.signal,
        bus:         ctx.bus,
        identity:    craftsmanConfig.identity,
      };

      try {
        const result = await ctx.runAgentLoop({
          config:         craftsmanConfig,
          contextParams,
          initialMessage: messageParts.join('\n'),
        });
        log.info({ rounds: result.rounds_used }, 'Coordinator: Craftsman revision sub-loop complete');
      } catch (err) {
        log.error({ error: err instanceof Error ? err.message : String(err) }, 'Coordinator: Craftsman revision sub-loop failed');
      }
    },
  };
}

// ─── Blueprint approval gate ─────────────────────────────────────────

function createBlueprintGate(input: Record<string, unknown>): GateDef<PipelineState> {
  const config = input as unknown as PipelineConfig;

  return {
    name: 'architect_review',
    condition: () => FF_BLUEPRINT_APPROVAL && config.workflow_mode !== 'fast_draft',
    onResponse: (response, state) => {
      if (typeof response === 'object' && response !== null && state.architect) {
        const edits = (response as Record<string, unknown>).edits as
          | { positioning_angle?: string; section_order?: string[] }
          | undefined;
        if (edits?.positioning_angle) {
          state.architect.positioning_angle = edits.positioning_angle;
        }
        if (edits?.section_order?.length) {
          state.architect.section_plan.order = edits.section_order;
        }
      }
    },
  };
}

// ─── Resume ProductConfig ────────────────────────────────────────────

export function createResumeProductConfig(input: Record<string, unknown>): ProductConfig<PipelineState, PipelineSSEEvent> {
  return {
    domain: 'resume',

    agents: [
      // Phase 1: Strategist — intelligence phase
      {
        name: 'strategist',
        config: strategistConfig,
        stageMessage: {
          startStage: 'intake',
          start: 'Step 1 of 7: Parsing and structuring your resume...',
          completeStage: 'architect',
          complete: 'Blueprint complete — beginning section writing',
        },
        gates: [createBlueprintGate(input)],
        onComplete: (scratchpad, state, emit) => {
          // Strategist stores results in state via tools — just validate + save profile
          if (state.positioning) {
            // Fire-and-forget positioning profile save
            void savePositioningProfile(state);
          }
        },
      },
      // Phase 2: Craftsman — section writing
      {
        name: 'craftsman',
        config: craftsmanConfig,
        stageMessage: {
          startStage: 'section_writing',
          start: 'Step 6 of 7: Writing each resume section...',
          complete: 'Step 6 of 7 complete: all sections written',
        },
        onComplete: (scratchpad, state, emit) => {
          // Transfer Craftsman sections from scratchpad to state.sections
          const craftsmanSections: Record<string, SectionWriterOutput> = {};
          for (const [key, val] of Object.entries(scratchpad)) {
            if (key.startsWith('section_') && val && typeof val === 'object' && 'content' in (val as Record<string, unknown>)) {
              const sectionName = key.replace('section_', '');
              craftsmanSections[sectionName] = val as SectionWriterOutput;
            }
          }
          if (Object.keys(craftsmanSections).length > 0) {
            state.sections = { ...(state.sections ?? {}), ...craftsmanSections };
          }

          if (!state.sections || Object.keys(state.sections).length === 0) {
            emit({
              type:    'transparency',
              stage:   'section_writing',
              message: 'Warning: section writing produced no output. Quality review will run on available content.',
            });
          }
        },
      },
      // Phase 3: Producer — quality review
      {
        name: 'producer',
        config: producerConfig,
        stageMessage: {
          startStage: 'quality_review',
          start: 'Step 7 of 7: Running quality review...',
          complete: 'Step 7 of 7 complete: final resume ready for export',
        },
        onComplete: (scratchpad, state, emit) => {
          // Re-emit quality_scores with detailed findings from Producer scratchpad
          if (state.quality_review?.scores) {
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
        },
      },
    ],

    createInitialState: (sessionId, userId, input) => {
      const config = input as unknown as PipelineConfig;
      return {
        session_id: sessionId,
        user_id: userId,
        current_stage: 'intake' as PipelineStage,
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
    },

    buildAgentMessage: (agentName, state, input) => {
      switch (agentName) {
        case 'strategist': return buildStrategistMessage(input);
        case 'craftsman':  return buildCraftsmanMessage(state);
        case 'producer':   return buildProducerMessage(state);
        default:           return '';
      }
    },

    finalizeResult: (state, input, emit) => {
      state.current_stage = 'complete';
      const finalResume   = buildFinalResumePayload(state, input);
      const assembledText = assembleResume(state.sections, state.architect);
      const atsFindings   = runAtsComplianceCheck(assembledText);

      emit({
        type:         'pipeline_complete',
        session_id:   state.session_id,
        contact_info:  state.intake?.contact,
        company_name:  (input as unknown as PipelineConfig).company_name,
        resume:        finalResume,
        export_validation: {
          passed:   atsFindings.length === 0,
          findings: atsFindings,
        },
      });

      return finalResume;
    },

    persistResult: async (state, result, input) => {
      const config = input as unknown as PipelineConfig;
      const finalResume = result as FinalResumePayload;
      await persistSession(state, finalResume, config.emit);
      await saveMasterResume(state, input, finalResume);
    },

    interAgentHandlers: [createRevisionHandler()],

    validateAfterAgent: (agentName, state) => {
      if (agentName === 'strategist') {
        if (!state.intake) {
          throw new Error('Strategist did not produce intake data. Check parse_resume tool execution.');
        }
        if (!state.architect) {
          throw new Error('Strategist did not produce an architect blueprint. Check design_blueprint tool execution.');
        }
      }
    },

    emitError: (stage, error, emit) => {
      emit({
        type:  'pipeline_error',
        stage: stage as PipelineStage,
        error,
      });
    },
  };
}
