/**
 * Shared test helpers for server unit tests.
 *
 * Re-exports all factory functions and mock module helpers from
 * mock-factories.ts and mock-modules.ts for a single import point.
 *
 * Usage:
 *   import {
 *     makeMockAgentContext,
 *     makeMockPipelineState,
 *     makeMockLLMResponse,
 *     makeMockSupabaseChain,
 *   } from '../helpers/index.js';
 *
 * NOTE: mock-modules.ts exports vi.mock() wrappers that must be called
 * at file scope (not inside describe/it) due to Vitest hoisting rules.
 * See mock-modules.ts for detailed usage guidance.
 */

export {
  // PipelineState / context factories
  makeMockPipelineState,
  makeMockEmit,
  makeMockAgentContext,
  makeMockGenericContext,

  // LLM response factories
  makeMockLLMResponse,
  makeMockLLMRawResponse,

  // Pipeline data fixtures
  makeMockIntakeOutput,
  makeMockResearchOutput,
  makeMockGapAnalystOutput,
  makeMockArchitectOutput,
  makeMockSectionWriterOutput,
  makeMockGlobalRules,

  // Supabase factories
  makeMockSupabaseChain,
  makeMockSupabase,

  // Types
  type MockResumeAgentContext,
  type MockAgentContext,
  type MockSupabaseChain,
} from './mock-factories.js';

export {
  // Module-level vi.mock() helpers
  mockLLMModule,
  mockLoggerModule,
  mockSupabaseModule,
  mockPlatformContextModule,
  mockJsonRepairModule,
  mockEmotionalBaselineModule,
  mockAgentRegistryModule,
  mockSentryModule,
  mockSharedToolsModule,
} from './mock-modules.js';
