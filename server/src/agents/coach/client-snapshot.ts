/**
 * Virtual Coach — Client Snapshot Loader
 *
 * Assembles a ClientSnapshot from the database — platform context records,
 * active/completed pipeline sessions, and derived journey phase.
 *
 * Extracted from conversation-loop.ts so the GET /recommend endpoint can
 * load client context without depending on the full conversational agent.
 */

import { supabaseAdmin } from '../../lib/supabase.js';
import { getLatestUserContext, listUserContextByType } from '../../lib/platform-context.js';
import type { ClientSnapshot } from './types.js';
import { determineJourneyPhase } from './knowledge/journey-phases.js';
import logger from '../../lib/logger.js';

const log = logger.child({ agent: 'coach' });

export async function loadClientSnapshot(userId: string): Promise<ClientSnapshot> {
  // Load single-row context types individually, multi-row types via list query
  const [clientProfile, positioning, emotional, allContextRows] = await Promise.all([
    getLatestUserContext(userId, 'client_profile').catch(() => null),
    getLatestUserContext(userId, 'positioning_strategy').catch(() => null),
    getLatestUserContext(userId, 'emotional_baseline').catch(() => null),
    listUserContextByType(userId, ['evidence_item', 'career_narrative']).catch(() => []),
  ]);

  const evidenceRows = allContextRows.filter((r) => r.context_type === 'evidence_item');
  const narrativeRows = allContextRows.filter((r) => r.context_type === 'career_narrative');

  // Load active and completed pipelines
  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, product_type, pipeline_status, pipeline_stage, pending_gate, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (sessionsError) {
    log.warn({ error: sessionsError.message, userId }, 'loadClientSnapshot: sessions query failed — snapshot may be incomplete');
  }

  const allSessions = sessions ?? [];
  const now = Date.now();
  const STALL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

  const activePipelines = allSessions
    .filter((s) => s.pipeline_status === 'running' || s.pipeline_status === 'waiting')
    .map((s) => ({
      session_id: s.id,
      product_type: s.product_type ?? 'unknown',
      pipeline_status: s.pipeline_status as 'running' | 'waiting',
      pipeline_stage: s.pipeline_stage ?? undefined,
      pending_gate: s.pending_gate ?? undefined,
      started_at: s.created_at,
    }));

  const completedProducts = allSessions
    .filter((s) => s.pipeline_status === 'complete')
    .map((s) => s.product_type ?? 'unknown');

  const sessionMap = new Map(allSessions.map((s) => [s.id, s]));

  const stalledItems = activePipelines
    .filter((s) => {
      const sess = sessionMap.get(s.session_id);
      return sess && (now - new Date(sess.updated_at).getTime() > STALL_THRESHOLD_MS);
    })
    .map((s) => {
      const sess = sessionMap.get(s.session_id)!;
      return {
        session_id: s.session_id,
        product_type: s.product_type,
        pipeline_stage: s.pipeline_stage,
        stalled_days: Math.floor((now - new Date(sess.updated_at).getTime()) / (24 * 60 * 60 * 1000)),
      };
    });

  // Determine journey phase.
  // NOTE: Keep this context type list in sync with loadClientContextTool in
  // tools/load-client-context.ts if that tool is ever reintroduced.
  const contextTypes = [
    clientProfile ? 'client_profile' : null,
    positioning ? 'positioning_strategy' : null,
    emotional ? 'emotional_baseline' : null,
    evidenceRows.length > 0 ? 'evidence_item' : null,
    narrativeRows.length > 0 ? 'career_narrative' : null,
  ].filter(Boolean) as string[];

  const journeyPhase = determineJourneyPhase(completedProducts, contextTypes);

  // Days since last activity.
  // Brand-new users with no sessions at all default to 0 (not 999) — they are
  // not inactive, they simply haven't started yet. 999 would trigger stale-user
  // logic incorrectly for first-time visitors.
  const lastActivity = allSessions[0]?.updated_at;
  const daysSinceLastActivity = lastActivity
    ? Math.floor((now - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Extract client name from profile
  const profile = clientProfile?.content;
  const name = (profile?.name as string) ?? (profile?.full_name as string) ?? undefined;

  return {
    user_id: userId,
    name,
    journey_phase: journeyPhase,
    client_profile: clientProfile?.content,
    positioning_strategy: positioning?.content,
    emotional_baseline: emotional?.content,
    evidence_items: evidenceRows.map((r) => r.content),
    career_narratives: narrativeRows.map((r) => r.content),
    active_pipelines: activePipelines,
    completed_products: [...new Set(completedProducts)],
    stalled_items: stalledItems,
    days_since_last_activity: daysSinceLastActivity,
    last_activity_at: lastActivity ?? undefined,
  };
}
