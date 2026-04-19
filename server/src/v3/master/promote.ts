// Promote selected v3 outputs into the user's master resume.
//
// Called from POST /api/v3-pipeline/promote. Computes a diff of the
// incoming payload against the existing master and writes a new version
// via create_master_resume_atomic RPC.

import { supabaseAdmin } from '../../lib/supabase.js';
import { createV3Logger } from '../observability/logger.js';
import { fetchDefaultMaster } from './load.js';
import type {
  V3MasterExperienceRow,
  V3MasterEvidenceItem,
  V3PromoteBulletInput,
  V3PromoteEvidenceInput,
  V3PromoteScopeInput,
  V3PromoteSummaryInput,
} from './types.js';

const log = createV3Logger('pipeline', { module: 'master.promote' });

export interface PromoteParams {
  userId: string;
  sourceSessionId: string;
  summary?: V3PromoteSummaryInput;
  scopes?: V3PromoteScopeInput[];
  bullets?: V3PromoteBulletInput[];
  evidence?: V3PromoteEvidenceInput[];
}

export interface PromoteResult {
  ok: boolean;
  new_version?: number;
  error?: string;
}

/** Normalize text for dup checks — lower, trim, collapse whitespace. */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function promoteToMaster(params: PromoteParams): Promise<PromoteResult> {
  const base = await fetchDefaultMaster(params.userId);
  if (!base) {
    return { ok: false, error: 'No master resume found to promote into. Run the pipeline at least once to auto-initialize the master.' };
  }

  // Start with a deep-cloned copy of the existing master so we modify fields
  // safely. create_master_resume_atomic creates a new version; we're just
  // building the new version's payload.
  const nextExperience: V3MasterExperienceRow[] = (base.experience ?? []).map((row) => ({
    ...row,
    bullets: [...(row.bullets ?? [])],
  }));
  const nextEvidence: V3MasterEvidenceItem[] = [...(base.evidence_items ?? [])];
  let nextSummary = base.summary;
  let changedSummary = false;
  let addedBullets = 0;
  let updatedScopes = 0;
  let addedEvidence = 0;

  // Summary swap (dup-check against current master).
  if (params.summary?.text && norm(params.summary.text) !== norm(base.summary ?? '')) {
    nextSummary = params.summary.text.trim();
    changedSummary = true;
  }

  // Scope statements — update by positionIndex. If the index is beyond the
  // master's experience array, we silently skip rather than fabricate a
  // position; position creation is not a v3 promote responsibility.
  for (const s of params.scopes ?? []) {
    const row = nextExperience[s.positionIndex];
    if (!row) continue;
    if (norm(s.text) === norm(row.scope_statement ?? '')) continue;
    row.scope_statement = s.text.trim();
    updatedScopes += 1;
  }

  // Bullets — append new bullet text to the target position. Skip if a
  // normalized duplicate already exists on that position.
  for (const b of params.bullets ?? []) {
    const row = nextExperience[b.positionIndex];
    if (!row) continue;
    const existingTexts = new Set((row.bullets ?? []).map((x) => norm(x.text)));
    if (existingTexts.has(norm(b.text))) continue;
    row.bullets.push({ text: b.text.trim(), source: b.source });
    addedBullets += 1;
  }

  // Evidence items — append with current timestamp + session linkage.
  const nowIso = new Date().toISOString();
  for (const e of params.evidence ?? []) {
    const dupKey = norm(e.text);
    const exists = nextEvidence.some((x) => norm(x.text) === dupKey);
    if (exists) continue;
    nextEvidence.push({
      text: e.text.trim(),
      source: 'crafted',
      category: e.category ?? 'rewritten_bullet',
      source_session_id: params.sourceSessionId,
      created_at: nowIso,
    });
    addedEvidence += 1;
  }

  if (!changedSummary && updatedScopes === 0 && addedBullets === 0 && addedEvidence === 0) {
    return { ok: true, new_version: base.version };
  }

  // Build a fresh raw_text rollup from the updated structured content so
  // search + export consumers stay in sync with the structured columns.
  const rawText = buildRawTextRollup({
    summary: nextSummary,
    contactInfo: base.contact_info ?? {},
    experience: nextExperience,
    education: base.education ?? [],
    certifications: base.certifications ?? [],
    skills: base.skills ?? {},
  });

  const { data, error } = await supabaseAdmin.rpc('create_master_resume_atomic', {
    p_user_id: params.userId,
    p_raw_text: rawText,
    p_summary: nextSummary,
    p_experience: nextExperience,
    p_skills: base.skills ?? {},
    p_education: base.education ?? [],
    p_certifications: base.certifications ?? [],
    p_contact_info: base.contact_info ?? {},
    p_source_session_id: null, // v3 doesn't mint coach_sessions rows
    p_set_as_default: true,
    p_evidence_items: nextEvidence,
  });

  if (error) {
    log.warn(
      { userId: params.userId, error: error.message },
      'promoteToMaster: RPC failed',
    );
    return { ok: false, error: error.message };
  }

  const rpcPayload = data as { version?: number } | null;
  log.info(
    {
      userId: params.userId,
      addedBullets,
      updatedScopes,
      changedSummary,
      addedEvidence,
      newVersion: rpcPayload?.version,
    },
    'v3 master resume promoted',
  );

  return { ok: true, new_version: rpcPayload?.version };
}

function buildRawTextRollup(parts: {
  summary: string;
  contactInfo: { name?: string; email?: string; phone?: string; linkedin?: string; location?: string };
  experience: V3MasterExperienceRow[];
  education: Array<{ degree?: string; institution?: string; year?: string | null }>;
  certifications: Array<{ name?: string; issuer?: string | null; year?: string | null }>;
  skills: Record<string, string[]>;
}): string {
  const lines: string[] = [];
  const name = parts.contactInfo.name ?? '';
  if (name) lines.push(name);
  const contactLine = [
    parts.contactInfo.email,
    parts.contactInfo.phone,
    parts.contactInfo.linkedin,
    parts.contactInfo.location,
  ].filter(Boolean).join(' · ');
  if (contactLine) lines.push(contactLine);
  if (parts.summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(parts.summary);
  }
  if (parts.experience.length > 0) {
    lines.push('');
    lines.push('EXPERIENCE');
    for (const role of parts.experience) {
      const dateRange = [role.start_date, role.end_date].filter(Boolean).join(' – ');
      lines.push(`${role.company} — ${role.title}${dateRange ? ` (${dateRange})` : ''}`);
      if (role.scope_statement) lines.push(role.scope_statement);
      for (const b of role.bullets ?? []) {
        if (b?.text) lines.push(`• ${b.text}`);
      }
      lines.push('');
    }
  }
  if (parts.education.length > 0) {
    lines.push('EDUCATION');
    for (const e of parts.education) {
      lines.push(`${e.degree ?? ''} — ${e.institution ?? ''}${e.year ? ` (${e.year})` : ''}`);
    }
    lines.push('');
  }
  if (parts.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const c of parts.certifications) {
      lines.push([c.name, c.issuer, c.year].filter(Boolean).join(' · '));
    }
    lines.push('');
  }
  for (const [cat, list] of Object.entries(parts.skills)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    lines.push(`${cat.toUpperCase()}: ${list.join(', ')}`);
  }
  return lines.join('\n').trim();
}
