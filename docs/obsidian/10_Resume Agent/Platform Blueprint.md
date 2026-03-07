# Platform Blueprint

> Canonical source: `~/resume-agent/docs/PLATFORM_BLUEPRINT.md`

## Overview

33-agent career coaching platform. The agent runtime (loop, bus, context, protocol) is domain-agnostic. Each product provides typed tools, AgentConfig, product state type, and a coordinator.

## Lifecycle Hooks

Route factory `createProductRoutes()` accepts these hooks:

| Hook | Purpose |
|------|---------|
| `onBeforeStart` | Validation, capacity checks |
| `transformInput` | Shape raw request into product state |
| `onEvent` | SSE event processing (panels, artifacts) |
| `onBeforeRespond` | Gate response validation |
| `onRespond` | Gate response handling |
| `onComplete` | Cleanup, platform context persistence |
| `onError` | Error handling, session cleanup |

## Shared Platform Context

`user_platform_context` table stores cross-product data (positioning strategy, evidence library). Products can load context from other products at startup.

## Agent Design Patterns

- **2-agent pipeline** (most common): Research/analyze agent -> writing agent
- **3-agent pipeline** (Resume only): Strategist -> Craftsman -> Producer
- **1-agent pipeline** (Executive Bio, Thank You Note): Single writer agent

All agents except Resume run autonomously (no user gates).

## Related

- [[Project Hub]]
- [[Architecture Overview]]

#type/spec
