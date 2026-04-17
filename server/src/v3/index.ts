// v3 public surface.
// Re-exports the pipeline orchestrator and the shared types so consumers
// can import from a single path: `import { runPipeline, ... } from '.../v3/index.js'`.
//
// Implements: docs/v3-rebuild/kickoffs/phase-1-kickoff.md §1.

export { runPipeline } from './pipeline.js';
export { loadPrompt } from './prompts/loader.js';
export { createV3Logger } from './observability/logger.js';
export { NotImplementedError, PromptLoadError } from './errors.js';
export type * from './types.js';
