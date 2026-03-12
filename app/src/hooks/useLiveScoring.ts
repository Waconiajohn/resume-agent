/**
 * useLiveScoring — Debounced ATS re-scoring after inline edits
 *
 * Calls the /rescore endpoint after the user accepts an edit.
 * Debounced at 2 seconds to avoid hammering the API during rapid edits.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import type { ResumeDraft } from '@/types/resume-v2';

export interface LiveScores {
  ats_score: number;
  keywords_found: string[];
  keywords_missing: string[];
  top_suggestions: string[];
}

const DEBOUNCE_MS = 2000;

export function useLiveScoring(
  accessToken: string | null,
  sessionId: string,
  jobDescription: string,
) {
  const [scores, setScores] = useState<LiveScores | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const requestRescore = useCallback((resume: ResumeDraft) => {
    if (!accessToken || !sessionId || !jobDescription) return;

    // Cancel any pending request
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsScoring(true);

      try {
        const resumeText = resumeToText(resume);
        const response = await fetch(`${API_BASE}/pipeline/${sessionId}/rescore`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ resume_text: resumeText, job_description: jobDescription }),
          signal: controller.signal,
        });

        if (!response.ok) return;

        const result = (await response.json()) as LiveScores;
        if (!controller.signal.aborted) {
          setScores(result);
        }
      } catch {
        // Silently ignore — scoring is best-effort
      } finally {
        if (!controller.signal.aborted) {
          setIsScoring(false);
        }
      }
    }, DEBOUNCE_MS);
  }, [accessToken, sessionId, jobDescription]);

  const setInitialScores = useCallback((atsScore: number) => {
    setScores(prev => prev ?? { ats_score: atsScore, keywords_found: [], keywords_missing: [], top_suggestions: [] });
  }, []);

  return { scores, isScoring, requestRescore, setInitialScores };
}

function resumeToText(r: ResumeDraft): string {
  const parts: string[] = [
    r.header.name,
    r.header.branded_title,
    r.executive_summary.content,
    r.core_competencies.join(' | '),
    ...r.selected_accomplishments.map(a => a.content),
  ];
  for (const exp of r.professional_experience) {
    parts.push(`${exp.title} | ${exp.company}`);
    parts.push(exp.scope_statement);
    for (const b of exp.bullets) parts.push(b.text);
  }
  return parts.join('\n');
}
