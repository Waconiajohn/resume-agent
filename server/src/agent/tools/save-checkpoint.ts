import { supabaseAdmin } from '../../lib/supabase.js';
import type { SessionContext } from '../context.js';

export async function executeSaveCheckpoint(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ success: boolean; phase: string }> {
  const phase = (input.phase as string) || ctx.currentPhase;

  const checkpoint = ctx.toCheckpoint();

  const { error } = await supabaseAdmin
    .from('coach_sessions')
    .update(checkpoint)
    .eq('id', ctx.sessionId);

  if (error) {
    console.error('Checkpoint save error:', error);
    return { success: false, phase };
  }

  return { success: true, phase };
}
