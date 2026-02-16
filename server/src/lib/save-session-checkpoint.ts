import { supabaseAdmin } from './supabase.js';
import { createSessionLogger } from './logger.js';
import type { SessionContext } from '../agent/context.js';

interface CheckpointResult {
  success: boolean;
  error?: string;
}

/**
 * Save a session checkpoint to the database, trying with prompt versioning
 * columns first and falling back to the base checkpoint if migration 005
 * hasn't been applied yet (schema cache error).
 */
export async function saveSessionCheckpoint(ctx: SessionContext): Promise<CheckpointResult> {
  const log = createSessionLogger(ctx.sessionId);

  let checkpoint: Record<string, unknown> = ctx.toCheckpointWithPromptVersion();
  let { error } = await supabaseAdmin
    .from('coach_sessions')
    .update(checkpoint)
    .eq('id', ctx.sessionId)
    .eq('user_id', ctx.userId);

  if (error?.message?.includes('schema cache')) {
    log.warn('Prompt versioning columns missing, saving without them');
    checkpoint = ctx.toCheckpoint();
    ({ error } = await supabaseAdmin
      .from('coach_sessions')
      .update(checkpoint)
      .eq('id', ctx.sessionId)
      .eq('user_id', ctx.userId));
  }

  if (error) {
    log.error({ error: error.message }, 'Checkpoint save error');
    return { success: false, error: error.message };
  }

  return { success: true };
}
