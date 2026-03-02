/**
 * Tool Model Routing — Unit tests for model_tier resolution.
 *
 * Verifies:
 * - getModelForTier() maps all 4 tiers correctly
 * - getModelForTool() falls back to TOOL_MODEL_MAP / orchestrator
 * - resolveToolModel() checks registry first, falls back to static map
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getModelForTier,
  getModelForTool,
  resolveToolModel,
  MODEL_PRIMARY,
  MODEL_MID,
  MODEL_ORCHESTRATOR,
  MODEL_LIGHT,
  type ToolRegistryLike,
} from '../lib/llm.js';

describe('getModelForTier', () => {
  it('maps primary to MODEL_PRIMARY', () => {
    expect(getModelForTier('primary')).toBe(MODEL_PRIMARY);
  });

  it('maps mid to MODEL_MID', () => {
    expect(getModelForTier('mid')).toBe(MODEL_MID);
  });

  it('maps orchestrator to MODEL_ORCHESTRATOR', () => {
    expect(getModelForTier('orchestrator')).toBe(MODEL_ORCHESTRATOR);
  });

  it('maps light to MODEL_LIGHT', () => {
    expect(getModelForTier('light')).toBe(MODEL_LIGHT);
  });
});

describe('getModelForTool', () => {
  it('returns MODEL_PRIMARY for write_section', () => {
    expect(getModelForTool('write_section')).toBe(MODEL_PRIMARY);
  });

  it('returns MODEL_MID for classify_fit', () => {
    expect(getModelForTool('classify_fit')).toBe(MODEL_MID);
  });

  it('returns MODEL_LIGHT for analyze_jd', () => {
    expect(getModelForTool('analyze_jd')).toBe(MODEL_LIGHT);
  });

  it('falls back to MODEL_ORCHESTRATOR for unknown tools', () => {
    expect(getModelForTool('nonexistent_tool')).toBe(MODEL_ORCHESTRATOR);
  });
});

describe('resolveToolModel', () => {
  function makeRegistry(agents: Array<{ tools: Array<{ name: string; model_tier?: 'primary' | 'mid' | 'orchestrator' | 'light' }> }>): ToolRegistryLike {
    return {
      list: () => agents,
      listByDomain: () => agents,
    };
  }

  it('resolves from registry when tool has model_tier', () => {
    const registry = makeRegistry([
      {
        tools: [
          { name: 'my_custom_tool', model_tier: 'primary' },
          { name: 'another_tool', model_tier: 'light' },
        ],
      },
    ]);

    expect(resolveToolModel('my_custom_tool', undefined, registry)).toBe(MODEL_PRIMARY);
    expect(resolveToolModel('another_tool', undefined, registry)).toBe(MODEL_LIGHT);
  });

  it('scopes lookup to domain when provided', () => {
    const listByDomainSpy = vi.fn(() => [
      { tools: [{ name: 'domain_tool', model_tier: 'mid' as const }] },
    ]);

    const registry: ToolRegistryLike = {
      list: () => [],
      listByDomain: listByDomainSpy,
    };

    expect(resolveToolModel('domain_tool', 'resume', registry)).toBe(MODEL_MID);
    expect(listByDomainSpy).toHaveBeenCalledWith('resume');
  });

  it('falls back to TOOL_MODEL_MAP when tool not in registry', () => {
    const registry = makeRegistry([
      { tools: [{ name: 'other_tool', model_tier: 'light' }] },
    ]);

    // write_section is in TOOL_MODEL_MAP as MODEL_PRIMARY
    expect(resolveToolModel('write_section', undefined, registry)).toBe(MODEL_PRIMARY);
  });

  it('falls back to MODEL_ORCHESTRATOR when tool not found anywhere', () => {
    const registry = makeRegistry([]);

    expect(resolveToolModel('totally_unknown_tool', undefined, registry)).toBe(MODEL_ORCHESTRATOR);
  });

  it('falls back gracefully when registry is not provided', () => {
    // Without registry param, falls through to TOOL_MODEL_MAP
    expect(resolveToolModel('analyze_jd')).toBe(MODEL_LIGHT);
  });

  it('falls back gracefully when registry throws', () => {
    const registry: ToolRegistryLike = {
      list: () => { throw new Error('Registry broken'); },
      listByDomain: () => { throw new Error('Registry broken'); },
    };

    expect(resolveToolModel('analyze_jd', undefined, registry)).toBe(MODEL_LIGHT);
  });
});
