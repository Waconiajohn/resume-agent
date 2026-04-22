/**
 * ApiErrorToaster — subscribes to apiFetch's error events and surfaces them
 * to the user via the existing useToast API.
 *
 * Sprint C7. Mounted once inside ToastProvider in App. No props, no children;
 * just a side-effect component.
 */
import { useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { subscribeApiErrors } from '@/lib/api-fetch';

export function ApiErrorToaster() {
  const { addToast } = useToast();

  useEffect(() => {
    return subscribeApiErrors((detail) => {
      // Keep the surface short; detail.message can be long and server-shaped.
      const context = detail.context?.trim();
      const statusLabel = detail.status === 0
        ? 'Network error'
        : `HTTP ${detail.status}`;
      const lines = [
        context ? `${context} failed` : 'Request failed',
        detail.message ? ` — ${detail.message}` : '',
      ];
      addToast({
        type: detail.status >= 500 || detail.status === 0 ? 'error' : 'warning',
        message: `${lines.join('')} (${statusLabel})`,
      });
    });
  }, [addToast]);

  return null;
}
