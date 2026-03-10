import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { CoachMessage, CoachMode, CoachMessageResponse, CoachEvent } from '@/types/coach';

interface CoachState {
  messages: CoachMessage[];
  mode: CoachMode;
  loading: boolean;
  error: string | null;
  turnCount: number;
  events: CoachEvent[];
}

export function useCoach(conversationId: string) {
  const [state, setState] = useState<CoachState>({
    messages: [],
    mode: 'guided',
    loading: false,
    error: null,
    turnCount: 0,
    events: [],
  });

  const mountedRef = useRef(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load existing conversation on mount
  const loadConversation = useCallback(async () => {
    if (loadedRef.current) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    try {
      const res = await fetch(
        `${API_BASE}/coach/conversation?conversation_id=${conversationId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const data = await res.json() as {
        messages?: Array<{ role: string; content: string }>;
        mode?: string;
        turn_count?: number;
      };
      if (mountedRef.current) {
        loadedRef.current = true;
        setState((prev) => ({
          ...prev,
          messages: (data.messages ?? []).map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          mode: (data.mode as CoachMode | undefined) ?? 'guided',
          turnCount: data.turn_count ?? 0,
        }));
      }
    } catch {
      // Conversation may not exist yet — that's fine
    }
  }, [conversationId]);

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  // Send a message
  const sendMessage = useCallback(
    async (text: string): Promise<string | null> => {
      if (!text.trim()) return null;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setState((prev) => ({ ...prev, error: 'Not authenticated' }));
        return null;
      }

      // Optimistically add user message
      const userMsg: CoachMessage = { role: 'user', content: text, timestamp: Date.now() };
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        loading: true,
        error: null,
      }));

      try {
        const res = await fetch(`${API_BASE}/coach/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            message: text,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Coach error (${res.status}): ${body}`);
        }

        const data = (await res.json()) as CoachMessageResponse;

        if (mountedRef.current) {
          const assistantMsg: CoachMessage = {
            role: 'assistant',
            content: data.response,
            timestamp: Date.now(),
          };
          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, assistantMsg],
            loading: false,
            turnCount: data.turn_count,
            events: data.events ?? [],
          }));
        }

        return data.response;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            messages: prev.messages.filter((m) => m !== userMsg),
            loading: false,
            error: message,
          }));
        }
        return null;
      }
    },
    [conversationId],
  );

  // Switch mode
  const setMode = useCallback(
    async (mode: CoachMode) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE}/coach/mode`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ conversation_id: conversationId, mode }),
        });
        if (!res.ok) {
          throw new Error(`Mode switch failed (${res.status})`);
        }
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, mode }));
        }
      } catch (err) {
        if (mountedRef.current) {
          const msg = err instanceof Error ? err.message : 'Mode switch failed';
          setState((prev) => ({ ...prev, error: msg }));
        }
      }
    },
    [conversationId],
  );

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    messages: state.messages,
    mode: state.mode,
    loading: state.loading,
    error: state.error,
    turnCount: state.turnCount,
    events: state.events,
    sendMessage,
    setMode,
    clearError,
  };
}
