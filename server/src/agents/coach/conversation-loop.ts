/**
 * Virtual Coach — Conversation Loop.
 *
 * Wraps runAgentLoop with message persistence:
 * 1. Load messages from coach_conversations table
 * 2. Load client snapshot from platform context + active sessions
 * 3. Assemble system prompt with methodology + snapshot + mode
 * 4. Run one agent loop invocation per user message
 * 5. Save updated messages back to DB
 */

import { runAgentLoop, FINAL_TEXT_KEY, type RunAgentParams } from '../runtime/agent-loop.js';
import { AgentBus } from '../runtime/agent-bus.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { getLatestUserContext, listUserContextByType } from '../../lib/platform-context.js';
import type { ChatMessage } from '../../lib/llm-provider.js';
import type { CoachState, CoachSSEEvent, ClientSnapshot, CoachBudget } from './types.js';
import type { AgentConfig } from '../runtime/agent-protocol.js';
import { determineJourneyPhase } from './knowledge/journey-phases.js';
import { COACHING_METHODOLOGY } from './knowledge/methodology.js';
import logger from '../../lib/logger.js';

const log = logger.child({ agent: 'coach' });

// ─── Public API ─────────────────────────────────────────────────────

export interface ConversationTurnParams {
  userId: string;
  conversationId: string;
  userMessage: string;
  config: AgentConfig<CoachState, CoachSSEEvent>;
  emit: (event: CoachSSEEvent) => void;
  signal: AbortSignal;
}

export interface ConversationTurnResult {
  response: string;
  turn_count: number;
  usage: { input_tokens: number; output_tokens: number };
}

export async function runConversationTurn(params: ConversationTurnParams): Promise<ConversationTurnResult> {
  const { userId, conversationId, userMessage, config, emit, signal } = params;

  // 1. Load or create conversation
  const conversation = await loadOrCreateConversation(userId, conversationId);
  const priorMessages: ChatMessage[] = conversation.messages ?? [];

  // 2. Load client snapshot
  const snapshot = await loadClientSnapshot(userId);

  // 3. Load recent coaching memory
  const recentMemory = await loadRecentMemory(userId);

  // 4. Load budget
  const budget = await loadBudget(userId);

  // 5. Assemble state
  const state: CoachState = {
    session_id: conversationId,
    user_id: userId,
    mode: (conversation.mode as CoachState['mode']) ?? 'guided',
    client_snapshot: snapshot,
    budget,
    conversation_history: [],
  };

  // 6. Assemble system prompt
  const systemPrompt = assembleSystemPrompt(
    config.system_prompt,
    snapshot,
    state.mode,
    recentMemory,
  );

  // 7. Run agent loop
  const bus = new AgentBus();
  const loopParams: RunAgentParams<CoachState, CoachSSEEvent> = {
    config: { ...config, system_prompt: systemPrompt },
    contextParams: {
      state,
      emit,
      sessionId: conversationId,
      userId,
      signal,
      bus,
      identity: { name: 'coach', domain: 'platform' },
      waitForUser: async () => {
        throw new Error('Coach does not use pipeline gates — use conversational turns instead');
      },
    },
    initialMessage: userMessage,
    priorMessages,
  };

  const result = await runAgentLoop<CoachState, CoachSSEEvent>(loopParams);

  // 8. Extract response — last assistant message
  const responseText = extractResponseText(result);

  // 9. Save updated messages
  const updatedMessages: ChatMessage[] = [
    ...priorMessages,
    { role: 'user' as const, content: userMessage },
    { role: 'assistant' as const, content: responseText },
  ];

  const newTurnCount = (conversation.turn_count ?? 0) + 1;

  const { error: upsertError } = await supabaseAdmin
    .from('coach_conversations')
    .upsert({
      id: conversationId,
      user_id: userId,
      messages: updatedMessages,
      turn_count: newTurnCount,
      mode: state.mode,
    });

  if (upsertError) {
    log.error({ error: upsertError.message, conversationId, userId }, 'Failed to save conversation');
  }

  return {
    response: responseText,
    turn_count: newTurnCount,
    usage: {
      input_tokens: result.usage?.input_tokens ?? 0,
      output_tokens: result.usage?.output_tokens ?? 0,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function loadOrCreateConversation(userId: string, conversationId: string) {
  const { data, error: selectError } = await supabaseAdmin
    .from('coach_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  // PGRST116 = "no rows returned" — not a real error, just means new conversation
  if (selectError && selectError.code !== 'PGRST116') {
    log.error({ error: selectError.message, conversationId, userId }, 'Failed to load conversation from DB');
    throw new Error(`Failed to load conversation: ${selectError.message}`);
  }

  if (data) return data;

  // Create new conversation
  const { data: created, error: insertError } = await supabaseAdmin
    .from('coach_conversations')
    .insert({
      id: conversationId,
      user_id: userId,
      messages: [],
      turn_count: 0,
      mode: 'guided',
    })
    .select()
    .single();

  if (insertError) {
    log.warn({ error: insertError.message, conversationId, userId }, 'Failed to insert new conversation — using in-memory fallback');
  }

  return created ?? { id: conversationId, messages: [], turn_count: 0, mode: 'guided' };
}

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
  const { data: sessions } = await supabaseAdmin
    .from('coach_sessions')
    .select('id, product_type, pipeline_status, pipeline_stage, pending_gate, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

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

  // Determine journey phase
  const contextTypes = [
    clientProfile ? 'client_profile' : null,
    positioning ? 'positioning_strategy' : null,
    emotional ? 'emotional_baseline' : null,
  ].filter(Boolean) as string[];

  const journeyPhase = determineJourneyPhase(completedProducts, contextTypes);

  // Days since last activity
  const lastActivity = allSessions[0]?.updated_at;
  const daysSinceLastActivity = lastActivity
    ? Math.floor((now - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  // Extract client name from profile
  const profile = clientProfile?.content as Record<string, unknown> | undefined;
  const name = (profile?.name as string) ?? (profile?.full_name as string) ?? undefined;

  return {
    user_id: userId,
    name,
    journey_phase: journeyPhase,
    client_profile: clientProfile?.content as Record<string, unknown> | undefined,
    positioning_strategy: positioning?.content as Record<string, unknown> | undefined,
    emotional_baseline: emotional?.content as Record<string, unknown> | undefined,
    evidence_items: evidenceRows.map((r) => r.content as Record<string, unknown>),
    career_narratives: narrativeRows.map((r) => r.content as Record<string, unknown>),
    active_pipelines: activePipelines,
    completed_products: [...new Set(completedProducts)],
    stalled_items: stalledItems,
    days_since_last_activity: daysSinceLastActivity,
    last_activity_at: lastActivity ?? undefined,
  };
}

async function loadRecentMemory(userId: string): Promise<Array<{ note: string; context: string }>> {
  try {
    const { data } = await supabaseAdmin
      .from('coach_memory')
      .select('content, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    return (data ?? []).map((d) => ({
      note: (d.content as string) ?? '',
      context: typeof d.metadata === 'object' && d.metadata !== null ? JSON.stringify(d.metadata) : '',
    }));
  } catch {
    return []; // Table may not exist yet
  }
}

async function loadBudget(userId: string): Promise<CoachBudget> {
  try {
    const { data } = await supabaseAdmin
      .from('coach_budget')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (data) {
      const dailyLimit = Number(data.daily_budget_usd) || 0.50;
      const usedToday = Number(data.daily_spent_usd) || 0;
      return {
        daily_limit_usd: dailyLimit,
        used_today_usd: usedToday,
        remaining_daily_usd: Math.max(0, dailyLimit - usedToday),
        reset_at: (data.last_reset_daily as string) ?? new Date().toISOString(),
      };
    }
  } catch {
    // Table may not exist yet
  }
  return { daily_limit_usd: 0.50, used_today_usd: 0, remaining_daily_usd: 0.50, reset_at: new Date().toISOString() };
}

export function assembleSystemPrompt(
  template: string,
  snapshot: ClientSnapshot,
  mode: CoachState['mode'],
  recentMemory: Array<{ note: string; context: string }>,
): string {
  const rawName = snapshot.name ?? 'there';
  // Sanitize: strip control chars, limit length, remove potential injection markers
  const clientName = rawName.replace(/[^\w\s'-]/g, '').trim().slice(0, 50) || 'there';
  const phaseLabel = snapshot.journey_phase;
  const modeInstructions = mode === 'guided'
    ? 'Present recommendations and wait for the client\'s confirmation before dispatching any pipeline. Never act autonomously.'
    : 'Engage in open conversation. Answer questions, provide strategy, and recommend tools when appropriate.';

  const memorySection = recentMemory.length > 0
    ? '\n\n## Recent Coaching Notes\n' + recentMemory.map((m) => {
        // Sanitize: strip markdown headings, system prompt markers, and cap length
        const sanitized = m.note
          .replace(/#{1,6}\s/g, '')
          .replace(/---+/g, '')
          .replace(/```[\s\S]*?```/g, '[code block removed]')
          .slice(0, 500);
        return `- ${sanitized}`;
      }).join('\n')
    : '';

  return template
    .replace('{{client_name}}', clientName)
    .replace('{{journey_phase}}', phaseLabel)
    .replace('{{mode_instructions}}', modeInstructions)
    .replace('{{recent_memory}}', memorySection)
    .replace('{{methodology}}', COACHING_METHODOLOGY);
}

function extractResponseText(result: { scratchpad: Record<string, unknown> }): string {
  // The agent loop stores the final text in scratchpad[FINAL_TEXT_KEY]
  if (typeof result.scratchpad[FINAL_TEXT_KEY] === 'string') {
    return result.scratchpad[FINAL_TEXT_KEY] as string;
  }
  // Fallback: check for a response key
  if (typeof result.scratchpad.response === 'string') {
    return result.scratchpad.response;
  }
  return 'I\'m here to help with your career transition. What would you like to work on?';
}

