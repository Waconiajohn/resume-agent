import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface UseLatestMasterResumeTextResult {
  resumeText: string;
  loading: boolean;
}

export function useLatestMasterResumeText(): UseLatestMasterResumeTextResult {
  const [resumeText, setResumeText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadResume(userIdOverride?: string | null) {
      setLoading(true);
      try {
        const resolvedUserId = userIdOverride === undefined
          ? (await supabase.auth.getUser()).data.user?.id ?? null
          : userIdOverride;

        if (!resolvedUserId || cancelled) {
          if (!cancelled) {
            setResumeText('');
            setLoading(false);
          }
          return;
        }
        const { data } = await supabase
          .from('master_resumes')
          .select('raw_text')
          .eq('user_id', resolvedUserId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (!cancelled) {
          setResumeText(data?.raw_text ?? '');
        }
      } catch {
        if (!cancelled) {
          setResumeText('');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadResume();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadResume(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return {
    resumeText,
    loading,
  };
}
