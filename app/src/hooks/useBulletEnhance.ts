import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import type { GapChatContext } from '@/types/resume-v2';

export type EnhanceAction = 'show_transformation' | 'demonstrate_leadership' | 'connect_to_role' | 'show_accountability';

export interface EnhanceResult {
  enhancedBullet: string;
  alternatives: Array<{ text: string; angle: string }>;
}

export interface EnhanceContext {
  lineKind?: GapChatContext['lineKind'];
  sectionKey?: string;
  sectionLabel?: string;
  sectionRationale?: string;
  sectionRecommendedForJob?: boolean;
  sourceEvidence?: string;
  relatedRequirements?: string[];
  coachingGoal?: string;
  clarifyingQuestions?: string[];
}

export function useBulletEnhance(accessToken: string | null, sessionId: string | null) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight request when the hook's owner unmounts (Fix 7)
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const enhance = useCallback(async (
    action: EnhanceAction,
    bulletText: string,
    requirement: string,
    evidence?: string,
    jobContext?: string,
    context?: EnhanceContext,
  ): Promise<EnhanceResult | null> => {
    if (!accessToken || !sessionId) return null;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsEnhancing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/pipeline/${sessionId}/bullet-enhance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action,
          bullet_text: bulletText,
          requirement,
          evidence,
          job_context: jobContext,
          line_kind: context?.lineKind,
          section_key: context?.sectionKey,
          section_label: context?.sectionLabel,
          section_rationale: context?.sectionRationale,
          section_recommended_for_job: context?.sectionRecommendedForJob,
          source_evidence: context?.sourceEvidence,
          related_requirements: context?.relatedRequirements,
          coaching_goal: context?.coachingGoal,
          clarifying_questions: context?.clarifyingQuestions,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      const enhanceResult: EnhanceResult = {
        enhancedBullet: data.enhanced_bullet,
        alternatives: data.alternatives ?? [],
      };
      setResult(enhanceResult);
      return enhanceResult;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      const msg = err instanceof Error ? err.message : 'Enhancement failed';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsEnhancing(false);
    }
  }, [accessToken, sessionId]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setIsEnhancing(false);
    setResult(null);
    setError(null);
  }, []);

  return { enhance, isEnhancing, result, error, reset };
}
