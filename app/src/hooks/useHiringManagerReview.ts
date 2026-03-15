/**
 * useHiringManagerReview — Triggers and manages hiring manager review state
 */

import { useState, useCallback } from 'react';
import { API_BASE } from '@/lib/api';

export interface HiringManagerStrength {
  observation: string;
  why_it_matters: string;
}

export interface HiringManagerConcern {
  observation: string;
  severity: 'critical' | 'moderate' | 'minor';
  recommendation: string;
  target_section?: string;
}

export interface HiringManagerMissingElement {
  element: string;
  recommendation: string;
}

export interface HiringManagerReviewResult {
  overall_impression: string;
  verdict: 'strong_candidate' | 'promising_needs_work' | 'significant_gaps';
  strengths: HiringManagerStrength[];
  concerns: HiringManagerConcern[];
  missing_elements: HiringManagerMissingElement[];
}

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
    hidden_signals?: string[];
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

  return { result, isLoading, error, requestReview, reset };
}
