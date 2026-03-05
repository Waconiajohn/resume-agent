import { useMemo, useRef, useState, useEffect } from 'react';
import type { WorkspaceNodeSnapshot } from '@/types/workflow';

export type UIMode = 'interview' | 'review' | 'edit';

const INTERVIEW_PHASES = new Set([
  'intake',
  'onboarding',
  'positioning',
  'positioning_profile_choice',
  'research',
  'gap_analysis',
  'architect',
  'architect_review',
  'resume_design',
]);

const REVIEW_PHASES = new Set([
  'section_writing',
  'section_review',
  'section_craft',
  'revision',
]);

const EDIT_PHASES = new Set([
  'quality_review',
  'complete',
]);

export function phaseToUIMode(phase: string | null | undefined): UIMode {
  if (!phase) return 'interview';
  if (INTERVIEW_PHASES.has(phase)) return 'interview';
  if (REVIEW_PHASES.has(phase)) return 'review';
  if (EDIT_PHASES.has(phase)) return 'edit';
  return 'interview';
}

interface UseUIModeOptions {
  effectiveCurrentPhase: string;
  isViewingLiveNode: boolean;
  selectedSnapshot: WorkspaceNodeSnapshot | null;
  /** Debounce interview→review transition to prevent flash in fast_draft mode */
  debounceMs?: number;
}

export function useUIMode({
  effectiveCurrentPhase,
  isViewingLiveNode,
  selectedSnapshot,
  debounceMs = 500,
}: UseUIModeOptions): UIMode {
  const rawMode = useMemo(() => {
    if (!isViewingLiveNode && selectedSnapshot) {
      return phaseToUIMode(selectedSnapshot.currentPhase);
    }
    return phaseToUIMode(effectiveCurrentPhase);
  }, [effectiveCurrentPhase, isViewingLiveNode, selectedSnapshot]);

  // Debounce interview→review to prevent flash during fast_draft
  const [debouncedMode, setDebouncedMode] = useState(rawMode);
  const prevRawRef = useRef(rawMode);

  useEffect(() => {
    const prev = prevRawRef.current;
    prevRawRef.current = rawMode;

    // Only debounce interview→review transition
    if (prev === 'interview' && rawMode === 'review' && debounceMs > 0) {
      const timer = setTimeout(() => setDebouncedMode(rawMode), debounceMs);
      return () => clearTimeout(timer);
    }

    setDebouncedMode(rawMode);
  }, [rawMode, debounceMs]);

  return debouncedMode;
}
