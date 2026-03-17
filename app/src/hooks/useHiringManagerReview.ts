/**
 * useHiringManagerReview — Triggers and manages hiring manager review state
 */

import { useState, useCallback } from 'react';
import { API_BASE } from '@/lib/api';
import type { FinalReviewConcern, FinalReviewResult } from '@/types/resume-v2';

export type HiringManagerConcern = FinalReviewConcern;
export type HiringManagerReviewResult = FinalReviewResult;

export function useHiringManagerReview(
  accessToken: string | null,
  sessionId: string,
) {
  const [result, setResult] = useState<HiringManagerReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReview = useCallback(async (params: {
    resume_text: string;
    job_description: string;
    company_name: string;
    role_title: string;
    requirements?: string[];
    job_requirements?: string[];
    hidden_signals?: string[];
    benchmark_profile_summary?: string;
    benchmark_requirements?: string[];
  }) => {
    if (!accessToken || !sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/hiring-manager-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Review failed' }));
        throw new Error(err.error || 'Review failed');
      }

      const data = await response.json() as HiringManagerReviewResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, sessionId]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const hydrateResult = useCallback((nextResult: HiringManagerReviewResult | null) => {
    setResult(nextResult);
    setError(null);
  }, []);

  return { result, isLoading, error, requestReview, reset, hydrateResult };
}
