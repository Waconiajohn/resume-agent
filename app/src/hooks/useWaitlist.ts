import { useCallback, useState } from 'react';
import { API_BASE } from '@/lib/api';

type WaitlistStatus = 'idle' | 'loading' | 'joined' | 'already_joined' | 'error';

interface UseWaitlistReturn {
  status: WaitlistStatus;
  errorMessage: string | null;
  submit: (email: string, productSlug: string) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for joining a product waitlist.
 *
 * Calls POST /api/waitlist with { email, product_slug }.
 * The endpoint is public (no auth required).
 *
 * Status transitions:
 *   idle → loading → joined      (new signup)
 *   idle → loading → already_joined  (duplicate)
 *   idle → loading → error       (network / validation failure)
 */
export function useWaitlist(): UseWaitlistReturn {
  const [status, setStatus] = useState<WaitlistStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = useCallback(async (email: string, productSlug: string) => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, product_slug: productSlug }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as Record<string, unknown>;
        const message = typeof data.error === 'string'
          ? data.error
          : `Request failed (${response.status})`;
        setErrorMessage(message);
        setStatus('error');
        return;
      }

      const data = await response.json() as { status: string };
      if (data.status === 'already_joined') {
        setStatus('already_joined');
      } else {
        setStatus('joined');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setErrorMessage(message);
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  return { status, errorMessage, submit, reset };
}
