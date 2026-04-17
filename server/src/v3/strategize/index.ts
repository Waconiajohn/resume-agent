// Stage 3 — Strategize.
// One LLM call produces a positioning Strategy for a given StructuredResume
// and target JobDescription.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 3.
// Status: Phase 1 stub. Real implementation lands in Phase 4.

import { NotImplementedError } from '../errors.js';
import type { JobDescription, Strategy, StructuredResume } from '../types.js';

export async function strategize(
  _resume: StructuredResume,
  _jd: JobDescription,
): Promise<Strategy> {
  throw new NotImplementedError('strategize');
}
