import { saveSessionCheckpoint } from '../../lib/save-session-checkpoint.js';
import type { SessionContext } from '../context.js';

export async function executeSaveCheckpoint(
  input: Record<string, unknown>,
  ctx: SessionContext,
): Promise<{ success: boolean; phase: string; error?: string; code?: string; recoverable?: boolean }> {
  const phase = (input.phase as string) || ctx.currentPhase;

  const result = await saveSessionCheckpoint(ctx);
  if (!result.success) {
    return { success: false, phase, error: 'Failed to save checkpoint', code: 'CHECKPOINT_SAVE_FAILED', recoverable: true };
  }

  return { success: true, phase };
}
