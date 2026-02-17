import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useWaitlist() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(email: string) {
    setStatus('submitting');
    setError(null);
    const { error: dbError } = await supabase
      .from('waitlist_emails')
      .insert({ email, source: 'sales_page' });
    if (dbError) {
      setStatus('error');
      if (dbError.code === '23505') {
        setError("You're already on the list!");
      } else {
        setError('Something went wrong. Please try again.');
      }
    } else {
      setStatus('success');
    }
  }

  function reset() {
    setStatus('idle');
    setError(null);
  }

  return { submit, status, error, reset };
}
