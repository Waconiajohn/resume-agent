export async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  if (data && typeof data === 'object') {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) {
      return error;
    }
  }

  return fallback;
}
