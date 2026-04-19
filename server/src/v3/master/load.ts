// Fetch helpers for the v3 master-resume integration.
//
// - fetchDefaultMaster(userId): returns the user's default master_resumes
//   row (or the most recent if no explicit default) as a V3MasterResumeRecord.
//   Returns null if the user has none.
// - fetchMasterSummary(userId): compact shape for the intake-form "card"
//   ("using your master resume, last updated 2 days ago").
// - createMasterFromClassify(): wraps the create_master_resume_atomic RPC
//   for the auto-init path.

import { supabaseAdmin } from '../../lib/supabase.js';
import { createV3Logger } from '../observability/logger.js';
import type {
  V3MasterResumeRecord,
  V3MasterSummary,
} from './types.js';
import { adaptStructuredResumeToMaster, type V3CreateMasterPayload } from './from-classify.js';
import type { StructuredResume } from '../types.js';

const log = createV3Logger('pipeline', { module: 'master' });

/**
 * Return the user's default master resume if one exists. Falls back to the
 * most recent master resume if no row is explicitly marked `is_default`.
 * Returns null if the user has no master resumes at all.
 */
export async function fetchDefaultMaster(userId: string): Promise<V3MasterResumeRecord | null> {
  const { data: explicit, error: eErr } = await supabaseAdmin
    .from('master_resumes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eErr) {
    log.warn({ userId, error: eErr.message }, 'fetchDefaultMaster: explicit-default query failed');
  }
  if (explicit) return explicit as unknown as V3MasterResumeRecord;

  const { data: latest, error: lErr } = await supabaseAdmin
    .from('master_resumes')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lErr) {
    log.warn({ userId, error: lErr.message }, 'fetchDefaultMaster: fallback-latest query failed');
  }
  return (latest as unknown as V3MasterResumeRecord | null) ?? null;
}

/**
 * Returns a compact summary suitable for the intake-form "using your master"
 * card. Null when no master exists.
 */
export async function fetchMasterSummary(userId: string): Promise<V3MasterSummary | null> {
  const row = await fetchDefaultMaster(userId);
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    is_default: row.is_default,
    updated_at: row.updated_at,
    hasExperience: Array.isArray(row.experience) && row.experience.length > 0,
    hasEvidence: Array.isArray(row.evidence_items) && row.evidence_items.length > 0,
    positionCount: Array.isArray(row.experience) ? row.experience.length : 0,
    evidenceCount: Array.isArray(row.evidence_items) ? row.evidence_items.length : 0,
  };
}

/**
 * Auto-init: create the first master resume from a v3 StructuredResume.
 * Non-throwing — logs on failure and returns null so pipeline continues.
 */
export async function createMasterFromClassify(params: {
  userId: string;
  resume: StructuredResume;
  sessionId: string;
}): Promise<V3MasterResumeRecord | null> {
  const payload: V3CreateMasterPayload = adaptStructuredResumeToMaster(params.resume, {
    sessionId: params.sessionId,
    setAsDefault: true,
  });
  try {
    const { data, error } = await supabaseAdmin.rpc('create_master_resume_atomic', {
      p_user_id: params.userId,
      p_raw_text: payload.raw_text,
      p_summary: payload.summary,
      p_experience: payload.experience,
      p_skills: payload.skills,
      p_education: payload.education,
      p_certifications: payload.certifications,
      p_contact_info: payload.contact_info,
      p_source_session_id: payload.source_session_id,
      p_set_as_default: payload.set_as_default,
      p_evidence_items: payload.evidence_items,
    });
    if (error) {
      log.warn({ userId: params.userId, error: error.message }, 'createMasterFromClassify: RPC failed');
      return null;
    }
    if (!data || typeof data !== 'object') {
      log.warn({ userId: params.userId }, 'createMasterFromClassify: RPC returned empty payload');
      return null;
    }
    log.info({ userId: params.userId, rpcResult: data }, 'v3 master resume auto-initialized from classify');
    // Re-fetch to get the full row shape — the RPC return varies.
    return await fetchDefaultMaster(params.userId);
  } catch (err) {
    log.warn(
      { userId: params.userId, err: err instanceof Error ? err.message : String(err) },
      'createMasterFromClassify: unexpected throw',
    );
    return null;
  }
}
