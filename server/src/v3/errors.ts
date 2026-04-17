// v3 shared error types.
// Implements: docs/v3-rebuild/OPERATING-MANUAL.md ("No silent fallbacks") and
// docs/v3-rebuild/kickoffs/phase-1-kickoff.md (stage stubs throw NotImplementedError).

export class NotImplementedError extends Error {
  constructor(stage: string) {
    super(`v3 stage not implemented: ${stage}`);
    this.name = 'NotImplementedError';
  }
}

export class PromptLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PromptLoadError';
  }
}
