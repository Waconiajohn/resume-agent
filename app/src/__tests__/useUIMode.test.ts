import { describe, it, expect } from 'vitest';
import { phaseToUIMode, type UIMode } from '../hooks/useUIMode';

describe('phaseToUIMode', () => {
  const interviewPhases = [
    'intake',
    'onboarding',
    'positioning',
    'positioning_profile_choice',
    'research',
    'gap_analysis',
    'architect',
    'architect_review',
    'resume_design',
  ];

  const reviewPhases = [
    'section_writing',
    'section_review',
    'section_craft',
    'revision',
  ];

  const editPhases = [
    'quality_review',
    'complete',
  ];

  it.each(interviewPhases)('maps "%s" to interview mode', (phase) => {
    expect(phaseToUIMode(phase)).toBe('interview' satisfies UIMode);
  });

  it.each(reviewPhases)('maps "%s" to review mode', (phase) => {
    expect(phaseToUIMode(phase)).toBe('review' satisfies UIMode);
  });

  it.each(editPhases)('maps "%s" to edit mode', (phase) => {
    expect(phaseToUIMode(phase)).toBe('edit' satisfies UIMode);
  });

  it('returns interview for null/undefined', () => {
    expect(phaseToUIMode(null)).toBe('interview');
    expect(phaseToUIMode(undefined)).toBe('interview');
  });

  it('returns interview for unknown phases', () => {
    expect(phaseToUIMode('some_unknown_phase')).toBe('interview');
    expect(phaseToUIMode('')).toBe('interview');
  });
});
