/**
 * Centralized vi.mock() helper functions for common module mocks.
 *
 * IMPORTANT: vi.mock() calls are hoisted by Vitest to the top of the test file
 * at compile time. That means these functions CANNOT be called at runtime inside
 * a test or describe block — they must be called at module scope in the test file.
 *
 * ⚠️  PATH RESOLUTION WARNING: The relative paths in vi.mock() calls below
 * (e.g., '../lib/llm.js') resolve relative to THIS file's location
 * (server/src/__tests__/helpers/). They will work for test files in
 * server/src/__tests__/ but NOT for test files at other depths (e.g.,
 * server/src/agents/strategist/__tests__/). If you need mocks from a
 * different directory depth, inline vi.mock() with the correct relative path
 * in your test file instead.
 *
 * Usage (in a test file at server/src/__tests__/):
 *
 *   import { mockLLMModule, mockLoggerModule } from './helpers/mock-modules.js';
 *   const { mockChat } = mockLLMModule();
 *   mockLoggerModule();
 *
 *   // Then import the module under test:
 *   import { myFunction } from '../lib/my-module.js';
 *
 * For tests that need to configure per-test mock return values, use vi.hoisted()
 * and the makeMock* factories from mock-factories.ts alongside these helpers.
 */

import { vi } from 'vitest';

// ─── LLM module mock ──────────────────────────────────────────────────────────

/**
 * Mocks `../lib/llm.js` with a stubbed `llm.chat` function and all model
 * tier constants set to recognizable test values.
 *
 * The returned `mockChat` spy can be configured per-test with `.mockResolvedValueOnce()`.
 *
 * Example:
 *   const { mockChat } = mockLLMModule();
 *   mockChat.mockResolvedValueOnce(makeMockLLMResponse({ score: 8 }));
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockLLMModule() {
  const mockChat = vi.hoisted(() => vi.fn());

  vi.mock('../lib/llm.js', () => ({
    llm: { chat: mockChat },
    MODEL_LIGHT: 'mock-light',
    MODEL_PRIMARY: 'mock-primary',
    MODEL_MID: 'mock-mid',
    MODEL_ORCHESTRATOR: 'mock-orchestrator',
    MODEL_PRICING: {},
  }));

  return { mockChat };
}

// ─── Logger module mock ───────────────────────────────────────────────────────

/**
 * Mocks `../lib/logger.js` with silent no-op implementations.
 *
 * Prevents logger output from polluting test output and suppresses
 * unresolvable import errors from pino internals.
 *
 * Example:
 *   mockLoggerModule();
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockLoggerModule() {
  vi.mock('../lib/logger.js', () => ({
    default: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
    createSessionLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }));
}

// ─── Supabase module mock ─────────────────────────────────────────────────────

/**
 * Mocks `../lib/supabase.js` with hoisted `mockFrom` and `mockRpc` spies.
 *
 * Returns the spies so test files can configure per-test behavior:
 *   const { mockFrom } = mockSupabaseModule();
 *   mockFrom.mockReturnValue(makeMockSupabaseChain({ data: myRow, error: null }));
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockSupabaseModule() {
  const mockFrom = vi.hoisted(() => vi.fn());
  const mockRpc = vi.hoisted(() => vi.fn());

  vi.mock('../lib/supabase.js', () => ({
    supabaseAdmin: {
      from: mockFrom,
      rpc: mockRpc,
    },
  }));

  return { mockFrom, mockRpc };
}

// ─── Platform context module mock ──────────────────────────────────────────────

/**
 * Mocks `../lib/platform-context.js` with no-op stubs.
 *
 * getUserContext resolves to an empty array (no stored context).
 * upsertUserContext resolves to null (success, nothing returned).
 *
 * Override these per-test as needed:
 *   const { mockGetUserContext } = mockPlatformContextModule();
 *   mockGetUserContext.mockResolvedValueOnce([{ context_type: 'positioning_strategy', ... }]);
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockPlatformContextModule() {
  const mockGetUserContext = vi.hoisted(() => vi.fn().mockResolvedValue([]));
  const mockUpsertUserContext = vi.hoisted(() => vi.fn().mockResolvedValue(null));

  vi.mock('../lib/platform-context.js', () => ({
    getUserContext: mockGetUserContext,
    upsertUserContext: mockUpsertUserContext,
  }));

  return { mockGetUserContext, mockUpsertUserContext };
}

// ─── JSON repair module mock ──────────────────────────────────────────────────

/**
 * Mocks `../lib/json-repair.js` with a passthrough implementation.
 *
 * In tests, the LLM mock always returns valid JSON, so repair is a no-op.
 * Tests that exercise malformed JSON handling should override this mock.
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockJsonRepairModule() {
  vi.mock('../lib/json-repair.js', () => ({
    repairJSON: vi.fn((text: string) => text),
  }));
}

// ─── Emotional baseline module mock ──────────────────────────────────────────

/**
 * Mocks `../lib/emotional-baseline.js` with null-returning stubs.
 *
 * Most agents that import emotional-baseline do so for optional tone
 * guidance. Returning null from both functions is the "no signal" path.
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockEmotionalBaselineModule() {
  vi.mock('../lib/emotional-baseline.js', () => ({
    getToneGuidanceFromInput: vi.fn().mockReturnValue(null),
    getDistressFromInput: vi.fn().mockReturnValue(null),
  }));
}

// ─── Agent registry module mock ───────────────────────────────────────────────

/**
 * Mocks `../agents/runtime/agent-registry.js` to prevent registration
 * side effects from polluting test runs.
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockAgentRegistryModule() {
  vi.mock('../agents/runtime/agent-registry.js', () => ({
    registerAgent: vi.fn(),
    agentRegistry: {
      get: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      has: vi.fn().mockReturnValue(false),
      describe: vi.fn().mockReturnValue(undefined),
      listDomains: vi.fn().mockReturnValue([]),
      findByCapability: vi.fn().mockReturnValue([]),
    },
  }));
}

// ─── Sentry module mock ───────────────────────────────────────────────────────

/**
 * Mocks `@sentry/node` with no-op stubs for all commonly used APIs.
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockSentryModule() {
  vi.mock('@sentry/node', () => ({
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setTag: vi.fn(),
    setExtra: vi.fn(),
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
    withScope: vi.fn((callback: (scope: unknown) => void) => callback({ setTag: vi.fn(), setExtra: vi.fn() })),
    getCurrentHub: vi.fn().mockReturnValue({
      getClient: vi.fn().mockReturnValue({ flush: vi.fn().mockResolvedValue(true) }),
    }),
  }));
}

// ─── Shared tools module mock ─────────────────────────────────────────────────

/**
 * Mocks `../agents/runtime/shared-tools.js` so agent config imports
 * don't trigger real LLM calls via emit_transparency tool creation.
 *
 * WARNING: vi.mock() is hoisted. Call this at file scope, not inside describe/it.
 */
export function mockSharedToolsModule() {
  vi.mock('../agents/runtime/shared-tools.js', () => ({
    createEmitTransparency: vi.fn().mockReturnValue({
      name: 'emit_transparency',
      description: 'Emit a transparency message',
      model_tier: 'light',
      input_schema: { type: 'object', properties: {}, required: [] },
      execute: vi.fn().mockResolvedValue('ok'),
    }),
  }));
}
