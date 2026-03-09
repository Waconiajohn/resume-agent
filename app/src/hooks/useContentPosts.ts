import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export type PostStatus = 'draft' | 'approved' | 'published';

export interface ContentPost {
  id: string;
  user_id: string;
  platform: string;
  post_type: string;
  topic: string;
  content: string;
  hashtags: string[] | null;
  status: PostStatus;
  quality_scores: { authenticity?: number; engagement_potential?: number } | null;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ContentPostsState {
  posts: ContentPost[];
  loading: boolean;
  error: string | null;
}

async function getAuthHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function useContentPosts() {
  const [state, setState] = useState<ContentPostsState>({
    posts: [],
    loading: false,
    error: null,
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Auto-fetch on mount
    void fetchPosts();
    return () => {
      mountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPosts = useCallback(async (status?: PostStatus): Promise<void> => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, loading: false, error: 'Not authenticated' }));
        }
        return;
      }

      const url = status
        ? `${API_BASE}/content-posts/posts?status=${encodeURIComponent(status)}`
        : `${API_BASE}/content-posts/posts`;

      const res = await fetch(url, { headers: authHeader });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: `Failed to fetch posts (${res.status}): ${body}`,
          }));
        }
        return;
      }

      const data = (await res.json()) as { posts: ContentPost[] };
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, posts: data.posts, loading: false }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: message }));
      }
    }
  }, []);

  const updatePostStatus = useCallback(
    async (id: string, status: PostStatus): Promise<boolean> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return false;

        const res = await fetch(`${API_BASE}/content-posts/posts/${id}`, {
          method: 'PATCH',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        if (!res.ok) return false;

        const data = (await res.json()) as { post: ContentPost };
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            posts: prev.posts.map((p) => (p.id === id ? data.post : p)),
          }));
        }
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const deletePost = useCallback(async (id: string): Promise<boolean> => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return false;

      const res = await fetch(`${API_BASE}/content-posts/posts/${id}`, {
        method: 'DELETE',
        headers: authHeader,
      });

      if (!res.ok) return false;

      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          posts: prev.posts.filter((p) => p.id !== id),
        }));
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    ...state,
    fetchPosts,
    updatePostStatus,
    deletePost,
  };
}
