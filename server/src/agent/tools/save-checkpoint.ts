import { supabaseAdmin } from '../../lib/supabase.js';
import type { SessionContext } from '../context.js';
import { createSessionLogger } from '../../lib/logger.js';

export async function executeSaveCheckpoint(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ success: boolean; phase: string; error?: string; code?: string; recoverable?: boolean }> {
  const phase = (input.phase as string) || ctx.currentPhase;
  const log = createSessionLogger(ctx.sessionId);

  // Try with prompt versioning columns first; fall back to base checkpoint
  // if migration 005 hasn't been applied yet (schema cache error).
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
    return { success: false, phase, error: 'Failed to save checkpoint', code: 'CHECKPOINT_SAVE_FAILED', recoverable: true };
  }

  return { success: true, phase };
}
