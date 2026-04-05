/**
 * useStoryBank
 *
 * Loads, updates, and deletes STAR+R stories from the user's Story Bank.
 * Stories are persisted via /api/platform-context/story-bank.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/lib/api';

export interface InterviewStory {
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  themes: string[];
  objections_addressed: string[];
  source_job_id: string | null;
  generated_at: string;
  used_count: number;
}

export interface StoryBankRow {
  id: string;
  index: number;
  content: InterviewStory;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function useStoryBank() {
  const [stories, setStories] = useState<StoryBankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadAttemptedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/platform-context/story-bank`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('Failed to load story bank');
        return;
      }
      const data = (await res.json()) as { stories: StoryBankRow[] };
      setStories(data.stories ?? []);
    } catch {
      setError('Failed to load story bank');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;
    void load();
  }, [load]);

  const updateStory = useCallback(
    async (id: string, content: InterviewStory): Promise<boolean> => {
      try {
        const token = await getAccessToken();
        if (!token) return false;
        const res = await fetch(`${API_BASE}/platform-context/story-bank/${id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(content),
        });
        if (!res.ok) return false;
        setStories((prev) =>
          prev.map((s) => (s.id === id ? { ...s, content } : s)),
        );
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const deleteStory = useCallback(async (id: string): Promise<boolean> => {
    try {
      const token = await getAccessToken();
      if (!token) return false;
      const res = await fetch(`${API_BASE}/platform-context/story-bank/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      setStories((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { stories, loading, error, reload: load, updateStory, deleteStory };
}
