export function supabaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function supabaseErrorMessage(error: unknown): string {
  if (!error) return 'Unknown Supabase error';
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

export function isSupabaseNoRowsError(error: unknown): boolean {
  const code = supabaseErrorCode(error);
  if (code === 'PGRST116') return true;
  return supabaseErrorMessage(error).toLowerCase().includes('no rows');
}
