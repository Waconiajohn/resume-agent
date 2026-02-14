import { supabaseAdmin } from '../../lib/supabase.js';
import type { SessionContext } from '../context.js';

export async function executeSaveCheckpoint(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ success: boolean; phase: string; error?: string; code?: string; recoverable?: boolean }> {
  const phase = (input.phase as string) || ctx.currentPhase;

  const checkpoint = ctx.toCheckpoint();

  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update(checkpoint)
    .eq('id', ctx.sessionId)
    .eq('user_id', ctx.userId);

  if (error) {
    console.error('Checkpoint save error:', error);
    return { success: false, phase, error: 'Failed to save checkpoint', code: 'CHECKPOINT_SAVE_FAILED', recoverable: true };
  }

  return { success: true, phase };
}
