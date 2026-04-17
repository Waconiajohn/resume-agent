// Stage 2 — Classify.
// One LLM call turns clean plaintext into a StructuredResume. All semantic
// parsing judgment lives in this stage's prompt. No downstream stage
// second-guesses this output.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 2.
// Status: Phase 1 stub. Real implementation lands in Phase 3.

import { NotImplementedError } from '../errors.js';
import type { ExtractResult, StructuredResume } from '../types.js';

export async function classify(_extracted: ExtractResult): Promise<StructuredResume> {
  throw new NotImplementedError('classify');
}
