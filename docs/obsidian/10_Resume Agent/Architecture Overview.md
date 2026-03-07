# Architecture Overview

> Canonical source: `~/resume-agent/docs/ARCHITECTURE.md`

## Core Pattern: ProductConfig

Every agent product follows the same pattern:
1. Typed tools -- `AgentTool<TState, TEvent>` with Zod schemas
2. AgentConfig -- identity, system prompt, model tier, timeouts
3. Product state type
4. Coordinator -- sequences agents, manages gates, owns SSE

The generic runtime (`agents/runtime/`) is domain-agnostic. Products layer on top.

## Runtime Layer

| Component | File | Purpose |
|-----------|------|---------|
| Agent Loop | `runtime/agent-loop.ts` | Multi-round LLM + tool calling with retries, timeouts |
| Message Bus | `runtime/agent-bus.ts` | Inter-agent communication |
| Protocol | `runtime/agent-protocol.ts` | Generic types: AgentTool, AgentConfig, AgentContext |
| Context | `runtime/agent-context.ts` | Creates runtime context for tools |
| Registry | `runtime/agent-registry.ts` | Agent discovery |

## Product Definition Layer

| Component | File | Purpose |
|-----------|------|---------|
| ProductConfig | `agents/resume/product.ts` | Declares agents, initial state, coordinator |
| Pipeline Runner | `runProductPipeline()` | Generic execution engine |
| Route Factory | `createProductRoutes()` | Route factory with lifecycle hooks |

## SSE Communication

Pipeline emits events via `PipelineEmitter`. Key event flow:
`stage_start` -> tool execution -> `transparency` -> `pipeline_gate` (user interaction) -> `stage_complete`

11 panel types dispatched by `panel-renderer.tsx`. See [[SSE Event System]].

## Key Patterns

- All agent loops use MODEL_ORCHESTRATOR for reasoning
- Individual tools route to cost-appropriate tiers via `getModelForTool()` in `llm.ts`
- Only Resume (Agent #1) is interactive with gates; all others run autonomously
- `json-repair.ts` handles malformed LLM JSON responses
- `session-lock.ts` prevents concurrent pipeline runs per session

## Related

- [[Project Hub]]
- [[Model Routing]]
- [[Platform Blueprint]]

#type/spec
