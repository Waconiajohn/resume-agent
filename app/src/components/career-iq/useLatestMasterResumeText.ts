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

    async function loadResume() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from('master_resumes')
          .select('raw_text')
          .eq('user_id', user.id)
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
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    resumeText,
    loading,
  };
}
