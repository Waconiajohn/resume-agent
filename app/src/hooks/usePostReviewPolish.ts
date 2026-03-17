/**
 * usePostReviewPolish — Background ATS + tone rerun after accepted Final Review edits
 */

import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { PostReviewPolishResult, PostReviewPolishState, ResumeDraft } from '@/types/resume-v2';
import { resumeToPlainText } from './useInlineEdit';

export function usePostReviewPolish(
  accessToken: string | null,
  sessionId: string,
) {
  const [state, setState] = useState<PostReviewPolishState>({
    status: 'idle',
    message: 'Run Final Review fixes to refresh tone and match score.',
    result: null,
  });
  const lastResultRef = useRef<PostReviewPolishResult | null>(null);
  lastResultRef.current = state.result;

  const runPolish = useCallback(async (
    resume: ResumeDraft,
    jobDescription: string,
    options?: {
      concernId?: string | null;
    },
  ): Promise<PostReviewPolishResult | null> => {
    if (!accessToken || !sessionId || !jobDescription) return null;

    setState({
      status: 'running',
      message: 'Refreshing tone and match score...',
      result: lastResultRef.current,
      last_triggered_by_concern_id: options?.concernId ?? null,
      updated_at: new Date().toISOString(),
    });

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/polish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          resume_text: resumeToPlainText(resume),
          job_description: jobDescription,
        }),
      });

      if (!response.ok) {
        throw new Error('Post-review polish failed');
      }

      const result = await response.json() as PostReviewPolishResult;
      setState({
        status: 'complete',
        message: 'Tone and match score were refreshed after your Final Review fix.',
        result,
        last_triggered_by_concern_id: options?.concernId ?? null,
        updated_at: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Post-review polish failed',
        result: lastResultRef.current,
        last_triggered_by_concern_id: options?.concernId ?? null,
        updated_at: new Date().toISOString(),
      });
      return null;
    }
  }, [accessToken, sessionId]);

  const hydrateState = useCallback((nextState: PostReviewPolishState | null) => {
    if (!nextState) {
      setState({
        status: 'idle',
        message: 'Run Final Review fixes to refresh tone and match score.',
        result: null,
      });
      return;
    }
    setState(nextState);
  }, []);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      message: 'Run Final Review fixes to refresh tone and match score.',
      result: null,
    });
  }, []);

  return {
    state,
    runPolish,
    hydrateState,
    reset,
  };
}
