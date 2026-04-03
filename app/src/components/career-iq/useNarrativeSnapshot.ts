import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { NarrativeStrategy } from '@/types/resume-v2';

export interface NarrativeSnapshot {
  branded_title: string;
  why_me_concise: string;
  why_me_best_line: string;
  why_me_story: string;
  unique_differentiators: string[];
}

type NarrativeSnapshotStatus = 'loading' | 'ready' | 'none';

export interface UseNarrativeSnapshotResult {
  snapshot: NarrativeSnapshot | null;
  status: NarrativeSnapshotStatus;
  refresh: () => void;
}

function extractSnapshot(raw: unknown): NarrativeSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const branded_title = typeof r.branded_title === 'string' ? r.branded_title.trim() : '';
  const why_me_concise = typeof r.why_me_concise === 'string' ? r.why_me_concise.trim() : '';

  // Require at minimum a branded title or a concise narrative to be considered useful
  if (!branded_title && !why_me_concise) return null;

  return {
    branded_title,
    why_me_concise,
    why_me_best_line: typeof r.why_me_best_line === 'string' ? r.why_me_best_line.trim() : '',
    why_me_story: typeof r.why_me_story === 'string' ? r.why_me_story.trim() : '',
    unique_differentiators: Array.isArray(r.unique_differentiators)
      ? (r.unique_differentiators as unknown[]).filter((item): item is string => typeof item === 'string')
      : [],
  };
}

function extractNarrativeFromPipelineData(pipelineData: unknown): NarrativeSnapshot | null {
  if (!pipelineData || typeof pipelineData !== 'object') return null;
  const pd = pipelineData as Record<string, unknown>;

  // Standard v2 pipeline_data shape: { narrativeStrategy: NarrativeStrategy }
  if (pd.narrativeStrategy) {
    return extractSnapshot(pd.narrativeStrategy);
  }

  // Fallback: narrative_strategy key (snake_case variant)
  if (pd.narrative_strategy) {
    return extractSnapshot(pd.narrative_strategy);
  }

  return null;
}

/**
 * Loads the narrative strategy snapshot from the most recent completed
 * resume pipeline session for the current user.
 *
 * Data is read-only in this context — editing happens inside the pipeline.
 */
export function useNarrativeSnapshot(): UseNarrativeSnapshotResult {
  const [snapshot, setSnapshot] = useState<NarrativeSnapshot | null>(null);
  const [status, setStatus] = useState<NarrativeSnapshotStatus>('loading');
  const [fetchTick, setFetchTick] = useState(0);

  const refresh = useCallback(() => {
    setFetchTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchSnapshot() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) {
          if (!cancelled) setStatus('none');
          return;
        }

        // Query the most recent completed resume v2 session
        const { data, error } = await supabase
          .from('coach_sessions')
          .select('tailored_sections')
          .eq('user_id', user.id)
          .eq('pipeline_status', 'complete')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          setSnapshot(null);
          setStatus('none');
          return;
        }

        // Pipeline data is nested: tailored_sections.pipeline_data.narrativeStrategy
        const stored = data.tailored_sections as Record<string, unknown> | null;
        const pipelineData = stored?.pipeline_data ?? stored;
        const found = extractNarrativeFromPipelineData(pipelineData);
        if (!cancelled) {
          setSnapshot(found);
          setStatus(found ? 'ready' : 'none');
        }
      } catch {
        if (!cancelled) {
          setSnapshot(null);
          setStatus('none');
        }
      }
    }

    void fetchSnapshot();
    return () => { cancelled = true; };
  }, [fetchTick]);

  // Re-fetch when the window regains focus so navigating back after a pipeline
  // run picks up new narrative data without requiring a full page reload.
  useEffect(() => {
    const handler = () => { setFetchTick((t) => t + 1); };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, []);

  return { snapshot, status, refresh };
}

// Re-export the NarrativeStrategy type so consumers don't need a separate import
export type { NarrativeStrategy };
