// Stage 5 — Verify.
// One LLM call reviews the WrittenResume for factual accuracy, style, and
// JD fit. Returns pass/fail plus specific issues. Last-line quality gate.
//
// Implements: docs/v3-rebuild/01-Architecture-Vision.md §Stage 5.
// Status: Phase 1 stub. Real implementation lands in Phase 4.

import { NotImplementedError } from '../errors.js';
import type {
  Strategy,
  StructuredResume,
  VerifyResult,
  WrittenResume,
} from '../types.js';

export async function verify(
  _resume: WrittenResume,
  _source: StructuredResume,
  _strategy: Strategy,
): Promise<VerifyResult> {
  throw new NotImplementedError('verify');
}
