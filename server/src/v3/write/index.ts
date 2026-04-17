// Stage 4 — Write.
// Parallel LLM calls — summary, selected accomplishments, core competencies,
// and one per position — produce the final written content.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 4.
// Status: Phase 1 stub. Real implementation lands in Phase 4.

import { NotImplementedError } from '../errors.js';
import type { Strategy, StructuredResume, WrittenResume } from '../types.js';

export async function write(
  _resume: StructuredResume,
  _strategy: Strategy,
): Promise<WrittenResume> {
  throw new NotImplementedError('write');
}
