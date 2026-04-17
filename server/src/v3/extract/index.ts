// Stage 1 — Extract.
// Deterministic plaintext extraction from PDF / DOCX / text input.
// No LLM. No semantic interpretation.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 1 and
//             docs/v3-rebuild/02-Migration-Plan.md Week 1 Day 1-2.
// Status: Phase 1 stub. Real implementation lands in Phase 2.

import { NotImplementedError } from '../errors.js';
import type { ExtractResult, PipelineInput } from '../types.js';

export async function extract(_input: PipelineInput['resume']): Promise<ExtractResult> {
  throw new NotImplementedError('extract');
}
