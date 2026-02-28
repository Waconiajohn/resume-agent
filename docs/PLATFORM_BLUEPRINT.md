# Platform Blueprint — 33-Agent Platform

> **Version:** 1.0
> **Date:** 2026-02-28
> **Status:** Accepted
> **Audience:** Engineers joining the platform team or building new products on the agent runtime

---

## 1. Platform Overview

This codebase is the first product on a 33-agent platform. The platform is designed so that the agent runtime — the loop, the bus, the context, the protocol — is entirely domain-agnostic. Products layer on top of the runtime by providing:

1. A set of typed tools
2. An `AgentConfig` (identity, system prompt, model, timeouts, max rounds)
3. A product-specific state type (e.g., `PipelineState` for resume)
4. A coordinator that sequences agents and owns all user interaction

The resume product demonstrates this pattern with three agents (Strategist, Craftsman, Producer) sequenced by a coordinator. Every architectural decision in the resume product was made with the goal of being repeatable across all 33 future products.

### Platform vs Product

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Runtime | `agents/runtime/` | LLM loop, message bus, context creation, protocol types |
| Knowledge | `agents/knowledge/` | Domain-specific rules and formatting guides |
| Product | `agents/<agent-name>/` | Agent configs, tool implementations, system prompts |
| Coordinator | `agents/coordinator.ts` | Sequences agents, manages gates, owns state transitions |
| Product Types | `agents/types.ts` | State shape, SSE event union, I/O interfaces between agents |

The runtime layer (`agents/runtime/`) must remain domain-agnostic. It never imports from product directories or references `PipelineState` directly — it receives state through the `AgentContext` interface, which abstracts away the concrete state type via `getState()` and `updateState()`.

### The 33-Agent Vision

Each of the 33 agents on the platform represents a distinct professional capability. The resume product demonstrates the pattern that all 33 will follow:

- A coordinator sequences 2-5 domain agents to complete a product workflow
- Agents are autonomous — each decides which tools to call and when to stop
- Agents communicate through the standard message bus
- User interaction is gated and handled exclusively by the coordinator
- All products share the same runtime infrastructure (loop, bus, LLM provider, logger)

---

## 2. Agent Runtime Contract

Every agent must implement the `AgentConfig` interface defined in `server/src/agents/runtime/agent-protocol.ts`. This is the complete contract.

### AgentConfig

```typescript
interface AgentConfig {
  identity: AgentIdentity;      // { name: string; domain: string }
  system_prompt: string;        // Full system prompt — may use {{placeholders}}
  tools: AgentTool[];           // All tools available to this agent
  model: string;                // LLM model for the main loop (tool selection + reasoning)
  max_rounds: number;           // Maximum LLM round-trips per invocation
  round_timeout_ms: number;     // Per-round timeout in milliseconds
  overall_timeout_ms: number;   // Total invocation timeout in milliseconds
}
```

### AgentIdentity

```typescript
interface AgentIdentity {
  name: string;    // Unique within its domain (e.g., 'strategist', 'craftsman')
  domain: string;  // Product domain (e.g., 'resume', 'cover_letter')
}
```

The `name` is used as the routing key on the agent bus. The `domain` namespaces agents across products, preventing message collisions when multiple products run concurrently.

### AgentTool

```typescript
interface AgentTool {
  name: string;
  description: string;
  input_schema: ToolInputSchema;  // JSON Schema — sent to the LLM verbatim
  model_tier?: 'primary' | 'mid' | 'orchestrator' | 'light';
  execute: (input: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
}
```

The LLM sees `name`, `description`, and `input_schema`. It never sees `execute` or `model_tier`. When the LLM calls a tool, the runtime invokes `execute(input, ctx)`.

The `model_tier` field is a hint to the tool implementation about which cost tier to use for any downstream LLM calls the tool makes. The agent loop itself always uses the model specified in `AgentConfig.model`.

### AgentContext

`AgentContext` is passed to every tool `execute` function. It provides:

```typescript
interface AgentContext {
  readonly sessionId: string;
  readonly userId: string;

  // Emit an SSE event to the frontend
  emit: (event: PipelineSSEEvent) => void;

  // Pause for user input at a named gate
  waitForUser: <T>(gate: string) => Promise<T>;

  // Read the shared product state
  getState: () => PipelineState;

  // Patch the shared product state (in-memory only — no DB write)
  updateState: (patch: Partial<PipelineState>) => void;

  // Per-agent scratchpad — accumulates results across rounds
  scratchpad: Record<string, unknown>;

  // AbortSignal for the current invocation
  signal: AbortSignal;

  // Send a message to another agent via the bus
  sendMessage: (msg: Omit<AgentMessage, 'id' | 'from' | 'timestamp'>) => void;
}
```

The `scratchpad` is private to each agent invocation. It does not persist to the database and is not visible to other agents. It is the agent's working memory for intermediate results across rounds. When an agent completes, the coordinator reads key fields from the scratchpad via `AgentResult.scratchpad`.

The `getState()` / `updateState()` methods operate on the shared `PipelineState`. Updates are in-memory only — the coordinator is responsible for persisting state to the database at appropriate checkpoints.

### AgentResult

When an agent loop completes, it returns:

```typescript
interface AgentResult {
  scratchpad: Record<string, unknown>;  // Final scratchpad state
  messages_out: AgentMessage[];         // Messages sent to other agents
  usage: { input_tokens: number; output_tokens: number };
  rounds_used: number;
}
```

The coordinator inspects `scratchpad` to verify the agent completed its required work (e.g., checking that `scratchpad.blueprint` is present after the Strategist runs).

---

## 3. The Agent Loop

The core runtime is `runAgentLoop()` in `server/src/agents/runtime/agent-loop.ts`.

### What it does

```
1. Build initial conversation: [system_prompt + tools] + [initialMessage]
2. Loop up to max_rounds:
   a. Call LLM with current messages and tool definitions
   b. If no tool calls → agent is done (store final text in scratchpad._final_text)
   c. If tool calls → execute each tool → append results → loop
3. Return AgentResult
```

### Timeouts

Two levels of timeout are enforced:

- `overall_timeout_ms`: The total wall-clock time for the entire agent invocation. Implemented via `createCombinedAbortSignal()` which combines the user's abort signal with a timeout.
- `round_timeout_ms`: Applied per tool execution (not per LLM call). Interactive tools (those with "interview", "present_to_user", or "questionnaire" in their name) are exempt from per-round timeout — they wait for the user and are bounded only by the overall timeout.

### Context compaction

To prevent context overflow on long sessions (Bug 17 mitigation), the loop compacts conversation history when `messages.length > 30`. It keeps the initial instruction message and the most recent 20 messages, replacing the middle with a system note. Results from compacted rounds are still available via the scratchpad.

### Retry

Each LLM call is wrapped in `withRetry()` with up to 3 attempts and 2-second base delay. Abort errors are not retried.

### Model routing

The agent loop always uses `AgentConfig.model` for the main LLM call (tool selection reasoning). Individual tools route their downstream LLM calls to the appropriate cost tier via `getModelForTool()` in `llm.ts`:

| Tier | Model | Primary Use |
|------|-------|-------------|
| PRIMARY | glm-4.7 | Section writing, synthesis, adversarial review |
| MID | glm-4.5-air | Gap analysis, benchmark, question generation, coherence check |
| ORCHESTRATOR | glm-4.7-flashx | Main loop reasoning (all 3 agents) |
| LIGHT | glm-4.7-flash | JD analysis, humanize check, research |

All three current agents use `MODEL_ORCHESTRATOR` for their main loop. This is intentional — the main loop is pure coordination (deciding which tool to call next) and does not need the capability of a heavier model.

---

## 4. Bus Protocol

The agent bus (`server/src/agents/runtime/agent-bus.ts`) handles inter-agent messaging within a single pipeline run.

### Current implementation

The bus is an in-memory pub/sub system. Each agent registers a handler before it starts, and unregisters when it completes.

```typescript
class AgentBus {
  subscribe(agentName: string, handler: (msg: AgentMessage) => void): void
  unsubscribe(agentName: string): void
  send(partial: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage
  getLog(): readonly AgentMessage[]
  reset(): void
}
```

The bus is instantiated per pipeline run (in the coordinator), not as a singleton. This ensures complete isolation between concurrent sessions.

### Message format

```typescript
interface AgentMessage {
  id: string;           // UUID, assigned by the bus
  from: string;         // Agent name (e.g., 'producer')
  to: string;           // Agent name (e.g., 'craftsman')
  type: 'handoff' | 'request' | 'response' | 'notification';
  domain: string;       // Product domain (e.g., 'resume')
  payload: Record<string, unknown>;
  timestamp: string;    // ISO 8601
}
```

### Message types

| Type | Usage |
|------|-------|
| `handoff` | One agent passes primary output to the next. Used for Strategist → Craftsman. |
| `request` | One agent asks another to perform work. Used for Producer → Craftsman revision requests. |
| `response` | Reply to a `request`. |
| `notification` | One-way informational message. No reply expected. |

### Routing

The bus routes by `to` field (exact agent name match). If no handler is registered for the recipient, the bus logs a warning and the message is dropped. This is a known limitation of the in-memory bus — see Section 8 for distributed bus requirements.

### How tools send messages

Tools send messages via `ctx.sendMessage()`, which is wired to the bus in `createAgentContext()`. Sent messages are accumulated in `ContextInternals.messagesOut` and returned to the coordinator in `AgentResult.messages_out`. The coordinator then routes these messages to the appropriate agent.

### Current message flows

```
Strategist → (blueprint handoff in pipeline state, not bus)
Producer  --[request]--> Craftsman (revision requests)
Craftsman --[response]--> Producer (revised section content)
```

The Strategist → Craftsman handoff is currently done via shared pipeline state (not the bus), because the coordinator needs to apply the blueprint gate between them. Future products can use the bus for this handoff if no gate is needed.

---

## 5. Coordinator Pattern

The coordinator (`server/src/agents/coordinator.ts`) is a thin orchestration layer. It sequences agents, manages user interaction, routes inter-agent messages, and tracks token usage. It makes zero content decisions and calls the LLM zero times directly.

### Core responsibilities

1. Initialize pipeline state from the config (resume text, JD, preferences)
2. Build opening messages for each agent (context marshaling)
3. Call `runAgentLoop()` for each agent in sequence
4. Manage user interaction gates between agent phases
5. Route `request` messages from the Producer back to the Craftsman
6. Persist state to the database at key checkpoints
7. Assemble the final resume payload and emit `pipeline_complete`

### Gate management

The coordinator uses `waitForUser(gate: string)` to pause execution at user interaction points. The mechanics:

1. Coordinator calls `waitForUser('blueprint_review')` — returns a `Promise<T>`
2. The pending gate queue stores the resolve function, keyed by gate name
3. Frontend receives a gate event via SSE
4. User interacts and POSTs to `/api/pipeline/respond`
5. The route handler resolves the pending promise
6. Coordinator continues with the user's response

Gates are named strings. The gate name is used as both the SSE event identifier and the pending queue key. Gate names for the current pipeline:

| Gate | Trigger | User action |
|------|---------|-------------|
| `positioning_q_{id}` | `interview_candidate` tool emits question | Answer question |
| `questionnaire_{id}` | `interview_candidate_batch` emits questionnaire | Submit batch answers |
| `architect_review` | Coordinator after Strategist completes | Approve or edit blueprint |
| `section_review_{section}` | `present_to_user` tool | Approve, edit, or request changes |

### State handoff between agents

The coordinator passes context to each agent via a plain-text "opening message" built by a dedicated builder function:

| Builder | Recipient | Contents |
|---------|-----------|----------|
| `buildStrategistMessage()` | Strategist | Raw resume, JD, company name, user preferences, master resume evidence (if returning user) |
| `buildCraftsmanMessage()` | Craftsman | Blueprint JSON, evidence library, interview transcript (candidate voice), gap analysis |
| `buildProducerMessage()` | Producer | All written sections, blueprint, JD analysis, evidence library |

Agents read their initial context from this opening message and accumulate working state in their scratchpad. Agents write important results to both the scratchpad and `ctx.updateState()` so the coordinator can read them after the loop completes.

### Feature flags

Optional gates are controlled by feature flags in `server/src/lib/feature-flags.ts`:

- `FF_INTAKE_QUIZ` — Structured intake questionnaire
- `FF_RESEARCH_VALIDATION` — Research validation gate
- `FF_GAP_ANALYSIS_QUIZ` — Gap analysis questionnaire
- `FF_QUALITY_REVIEW_APPROVAL` — Quality review gate
- `FF_BLUEPRINT_APPROVAL` — Blueprint review gate (skipped in `fast_draft` mode)

All flags default to `true`. Products should use feature flags to control optional interaction points.

### Error handling

The coordinator wraps each agent invocation in a try/catch. Errors emit a `pipeline_error` SSE event and stop the pipeline. The coordinator never re-throws from SSE handlers.

### Token tracking

The coordinator accumulates token usage across all three agent invocations and emits a blended cost estimate in the final `pipeline_complete` event. Each `AgentResult` carries `usage: { input_tokens, output_tokens }`.

---

## 6. Product vs Runtime Type Separation

This separation is the most important architectural constraint for platform scalability.

### The rule

**Runtime types live in `agents/runtime/agent-protocol.ts`.** These types are domain-agnostic and stable across all 33 products:

- `AgentIdentity`
- `AgentTool` and `ToolInputSchema`
- `AgentConfig`
- `AgentContext`
- `AgentMessage`
- `AgentResult`
- `ToolDef` and `toToolDef()`

**Product types live in `agents/types.ts` (or a product-specific module).** These types are specific to the resume product:

- `PipelineState` — the concrete shared state type
- `PipelineStage` — the stage enum
- `PipelineSSEEvent` — the SSE event union
- All agent I/O interfaces (`IntakeOutput`, `ArchitectOutput`, `SectionWriterOutput`, etc.)

### The current coupling

`agent-protocol.ts` currently imports from `../types.js` to get `PipelineSSEEvent` and `PipelineState`:

```typescript
// In agent-protocol.ts — this import creates a product dependency in the runtime layer
import type { PipelineSSEEvent, PipelineState } from '../types.js';
```

This coupling manifests in two places in `AgentContext`:

```typescript
emit: (event: PipelineSSEEvent) => void;   // Resume-specific SSE event type
getState: () => PipelineState;             // Resume-specific state type
updateState: (patch: Partial<PipelineState>) => void;
```

The correct platform pattern is to make these generic:

```typescript
// Target: runtime/agent-protocol.ts with generics
interface AgentContext<TState = Record<string, unknown>, TEvent = Record<string, unknown>> {
  emit: (event: TEvent) => void;
  getState: () => TState;
  updateState: (patch: Partial<TState>) => void;
  // ...
}
```

This work is tracked as Story 18 in Sprint 4 and must be completed before adding a second product to the platform.

### Why this matters

Without this separation, adding a second product (e.g., a cover letter agent) would require importing resume types into the runtime layer, creating circular dependencies and making the runtime tightly coupled to the first product. The generics approach keeps the runtime completely ignorant of any product's state shape.

---

## 7. Adding a New Agent (4th Agent Example)

This section is a step-by-step guide for adding a 4th agent to the existing resume product. The example agent is a "Positioning Coach" that runs after the Producer and generates positioning strategy for the cover letter.

### Step 1: Define the agent directory structure

```
server/src/agents/positioning-coach/
  agent.ts       — AgentConfig export
  prompts.ts     — System prompt constant
  tools.ts       — AgentTool array export
```

### Step 2: Define the system prompt in `prompts.ts`

```typescript
// server/src/agents/positioning-coach/prompts.ts
export const POSITIONING_COACH_SYSTEM_PROMPT = `
You are an expert executive positioning coach...
[domain-specific instructions]
`;
```

### Step 3: Define tools in `tools.ts`

Each tool must implement the `AgentTool` interface:

```typescript
// server/src/agents/positioning-coach/tools.ts
import type { AgentTool, AgentContext } from '../runtime/agent-protocol.js';

const generateAngleTool: AgentTool = {
  name: 'generate_positioning_angle',
  description: 'Generate 3 positioning angle options based on the approved blueprint.',
  input_schema: {
    type: 'object',
    properties: {
      target_audience: {
        type: 'string',
        description: 'Who will read this cover letter.',
      },
    },
    required: ['target_audience'],
  },
  model_tier: 'primary',
  execute: async (input: Record<string, unknown>, ctx: AgentContext) => {
    const state = ctx.getState();
    const blueprint = state.architect;
    if (!blueprint) throw new Error('generate_positioning_angle: blueprint not found in state.');

    // ... implementation
    const angles = await generateAngles(blueprint, String(input.target_audience));
    ctx.scratchpad.positioning_angles = angles;
    return { success: true, angles };
  },
};

export const positioningCoachTools: AgentTool[] = [generateAngleTool, /* other tools */];
```

### Step 4: Define the agent config in `agent.ts`

```typescript
// server/src/agents/positioning-coach/agent.ts
import { MODEL_ORCHESTRATOR } from '../../lib/llm.js';
import type { AgentConfig } from '../runtime/agent-protocol.js';
import { POSITIONING_COACH_SYSTEM_PROMPT } from './prompts.js';
import { positioningCoachTools } from './tools.js';

export const positioningCoachConfig: AgentConfig = {
  identity: {
    name: 'positioning_coach',
    domain: 'resume',
  },
  system_prompt: POSITIONING_COACH_SYSTEM_PROMPT,
  tools: positioningCoachTools,
  model: MODEL_ORCHESTRATOR,
  max_rounds: 8,
  round_timeout_ms: 120_000,
  overall_timeout_ms: 480_000,
};
```

### Step 5: Add the agent's output to the shared state

In `server/src/agents/types.ts`, add the new agent's output type and add it to `PipelineState`:

```typescript
// In types.ts
export interface PositioningCoachOutput {
  positioning_angles: Array<{ label: string; rationale: string; draft_hook: string }>;
  recommended_angle: string;
}

export interface PipelineState {
  // ... existing fields
  positioning_coach?: PositioningCoachOutput;
}
```

### Step 6: Add the stage to `PipelineStage`

```typescript
// In types.ts
export type PipelineStage =
  | 'intake'
  | 'positioning'
  // ... existing stages
  | 'positioning_coach'  // new stage
  | 'complete';
```

### Step 7: Wire the agent into the coordinator

In `coordinator.ts`:

1. Import the new config:
   ```typescript
   import { positioningCoachConfig } from './positioning-coach/agent.js';
   ```

2. Add a builder function for the opening message:
   ```typescript
   function buildPositioningCoachMessage(state: PipelineState): string {
     return [
       '## Approved Blueprint',
       JSON.stringify(state.architect, null, 2),
       '## Quality Review Results',
       JSON.stringify(state.quality_review, null, 2),
       'Generate positioning angles for the cover letter.',
     ].join('\n');
   }
   ```

3. Add the execution block after the Producer phase:
   ```typescript
   // After producer completes...
   state.current_stage = 'positioning_coach';
   emit({ type: 'stage_start', stage: 'positioning_coach', message: 'Generating positioning angles...' });

   const coachResult = await runAgentLoop({
     config: positioningCoachConfig,
     contextParams: {
       sessionId: config.session_id,
       userId: config.user_id,
       state,
       emit,
       waitForUser,
       signal,
       bus,
       identity: positioningCoachConfig.identity,
     },
     initialMessage: buildPositioningCoachMessage(state),
   });

   // Read results back from scratchpad
   if (coachResult.scratchpad.positioning_angles) {
     state.positioning_coach = coachResult.scratchpad as PositioningCoachOutput;
   }
   ```

4. Subscribe to bus messages if the new agent needs to receive requests from other agents:
   ```typescript
   bus.subscribe('positioning_coach', (msg) => {
     // handle messages
   });
   // ...unsubscribe in finally block
   bus.unsubscribe('positioning_coach');
   ```

### Step 8: Add SSE events if the agent needs to show UI

In `agents/types.ts`, add to the `PipelineSSEEvent` union:
```typescript
| { type: 'positioning_angles_ready'; angles: PositioningCoachOutput['positioning_angles'] }
```

In the frontend `usePipeline.ts`, handle the new event type.

### Step 9: Verify

1. `cd server && npx tsc --noEmit` — must pass
2. `cd app && npx tsc --noEmit` — must pass if frontend changes were made
3. Add unit tests for new tools
4. Add coordinator integration test for the new agent phase

---

## 8. Adding a New Product

A new product (e.g., a "cover letter" product) is a new coordinator plus a new set of agents that share the same runtime infrastructure.

### What is shared

- `agents/runtime/` — entirely reused, no changes
- `lib/llm-provider.ts`, `lib/llm.ts` — entirely reused
- `lib/supabase.ts`, `lib/logger.ts` — entirely reused
- The gate and SSE infrastructure

### What is new per product

| Artifact | Location | Notes |
|----------|----------|-------|
| Product state type | `agents/<product>/types.ts` | Shape of shared state for this product |
| SSE event union | `agents/<product>/types.ts` | All events this product can emit |
| Agent directories | `agents/<product>/<agent-name>/` | One directory per agent |
| Coordinator | `agents/<product>/coordinator.ts` | Sequences this product's agents |
| Route | `routes/<product>.ts` | POST start, GET stream, POST respond |

### Step-by-step for a new product

1. Create `server/src/agents/<product-name>/` directory
2. Define `types.ts` with the product's state type and SSE event union
3. Define 1-5 agent directories following the pattern in Section 7 (Steps 1-4)
4. Write a coordinator that sequences the agents using `runAgentLoop()`
5. Add a new Hono route in `server/src/routes/<product-name>.ts`:
   - `POST /api/<product-name>/start` — initialize state, start coordinator
   - `GET /api/<product-name>/:sessionId/stream` — SSE stream
   - `POST /api/<product-name>/respond` — gate responses
6. Wire the route in `server/src/index.ts`
7. Add frontend components as needed (hook, panels, etc.)

### Key constraints

- Each product must use distinct agent identity `domain` values to prevent bus message cross-contamination
- The `AgentContext.emit` type must match the product's SSE event union — once Story 18 (type extraction) is complete, this is enforced via generics
- Never import one product's types into another product's agents

---

## 9. Distributed Bus Requirements

The current `AgentBus` is in-memory and per-session. This is sufficient for single-server deployment but will not scale to:

- Horizontal scaling (multiple server instances)
- Long-running agents across server restarts
- Cross-product agent communication (e.g., a resume agent requesting data from a skills assessment agent)

### What would change for Redis/NATS

The `AgentBus` public interface is intentionally narrow:

```typescript
subscribe(agentName: string, handler: MessageHandler): void
unsubscribe(agentName: string): void
send(partial: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage
getLog(): readonly AgentMessage[]
reset(): void
```

A distributed bus implementation would replace the in-memory `Map<string, MessageHandler>` with a Redis pub/sub channel per agent, or a NATS subject per agent. The interface stays the same — callers would not need to change.

### Key design questions for a distributed bus

1. **Message ordering**: Does the bus need to guarantee ordered delivery within a session? Redis streams provide this; pub/sub does not.

2. **Persistence**: Should messages survive server restarts? If yes, Redis streams (consumer groups) are the right model. If no, pub/sub is simpler.

3. **Fan-out**: Should a message be receivable by multiple subscribers? The current model is one handler per agent name — fan-out is not needed today.

4. **Request/response correlation**: `request`/`response` message pairs need correlation IDs (already present as `AgentMessage.id`). The responder needs to address the reply to the original sender, which is in `AgentMessage.from`.

5. **Session isolation**: Bus messages must be scoped to a session. A Redis key prefix per session (`session:{id}:agent:{name}`) achieves this.

6. **Message log**: The current bus keeps a 500-message capped log for debugging. A distributed bus should write to a separate audit stream.

### Recommended path

A Redis Streams implementation using one stream per `(session_id, agent_name)` tuple. Consumer groups are unnecessary for the current point-to-point model. This preserves ordering, survives restarts, and enables debugging via Redis CLI. See Story 21 (Redis Bus Spike) in the Sprint 4 backlog for the formal ADR.

### What does not change

- `AgentMessage` format — wire-compatible
- `AgentContext.sendMessage()` — API unchanged
- Tool implementations — no changes
- Coordinator subscription patterns — no changes

The goal is that replacing the bus is a zero-change swap for all product code. Only `agent-bus.ts` changes.

---

## 10. Capability-Based Context

As the platform grows, agents from different products may need to share capabilities. The pattern for this is capability-based context injection, not direct inter-product imports.

### Current pattern (sufficient for 3 agents)

All three resume agents share context via `PipelineState`. The coordinator passes relevant slices of state to each agent in its opening message.

### Future pattern (for cross-product capabilities)

When agents across products need to share capabilities (e.g., a "skills assessor" agent that is useful to both the resume product and the job search product), the recommended approach is:

1. Define the capability as a standalone tool package: `agents/capabilities/<capability-name>/`
2. Each capability package exports an `AgentTool[]` that any product can import
3. Capability tools receive context via `AgentContext` — they work against whatever state the product provides
4. Capability tools must not assume a specific state shape (i.e., they use `ctx.getState()` defensively)

This is the correct extension point. It avoids the alternative (a giant shared state type that all products reference) and keeps product state types small and focused.

---

## 11. Multi-Product Routing

When the platform runs multiple products, the server needs to route requests to the correct coordinator. The current pattern (one route file per product) scales cleanly.

### Current routing

```
POST /api/pipeline/start      → coordinator.ts (resume product)
GET  /api/pipeline/:id/stream → coordinator.ts
POST /api/pipeline/respond    → coordinator.ts
```

### Target routing (multi-product)

```
POST /api/resume/start        → agents/resume/coordinator.ts
GET  /api/resume/:id/stream   → agents/resume/coordinator.ts
POST /api/resume/respond      → agents/resume/coordinator.ts

POST /api/cover-letter/start  → agents/cover-letter/coordinator.ts
GET  /api/cover-letter/:id/stream → ...
POST /api/cover-letter/respond    → ...
```

### Session isolation

Each session belongs to exactly one product run. The `coach_sessions` table stores the product type alongside the session. The `session_locks` mechanism (which prevents concurrent pipeline runs per session) is already product-agnostic.

### SSE connection registry

The SSE connection registry in `routes/sessions.ts` is keyed by `session_id`. This is already product-agnostic — any route can emit to any session's SSE stream via the `AnySSEEvent` type.

---

## 12. Open Questions

These are known gaps that require decisions before the platform can host a second product.

### Unresolved

| # | Question | Impact | Tracked |
|---|----------|--------|---------|
| 1 | Should `AgentContext` use generics for `TState` and `TEvent`, or should the platform define a minimal base state interface? | High — blocks adding a second product cleanly | Story 18 |
| 2 | Should each product define its own `PipelineSSEEvent` union, or should there be a platform-wide event registry? | Medium — affects frontend SSE hook architecture | Backlog |
| 3 | Should the agent registry (Story 19) be static (map at startup) or dynamic (loadable at runtime)? | Medium — affects plugin-style agent deployment | Story 19 |
| 4 | Redis bus vs NATS vs in-memory: what triggers the switch? Is it horizontal scaling, cross-product messaging, or both? | Medium — affects ops complexity | Story 21 (spike) |
| 5 | When a `request` message crosses product boundaries (e.g., a cover letter agent requesting resume data), who manages the response timeout? | Low for now, high when cross-product messaging is needed | Backlog |
| 6 | Should coordinators be hot-reloadable, or does adding a new agent always require a server restart? | Low | Backlog |

### Resolved (for reference)

| Decision | Resolution | Reasoning |
|----------|------------|-----------|
| In-memory vs persistent bus | In-memory for now | Single-server, per-session runs do not need persistence |
| One coordinator per product | Yes | Each product has unique sequencing logic and gate management |
| Agent loop in runtime, not product | Yes | Prevents duplication; all 33 agents benefit from same hardening |
| Scratchpad vs shared state | Scratchpad for intermediate work; shared state for cross-agent handoffs | Scratchpad is agent-private; shared state is the source of truth for the coordinator |
| Feature flags for optional gates | Yes | Allows `fast_draft` to skip gates without coordinator branching logic |

---

## Appendix A: File Reference

| File | Purpose |
|------|---------|
| `server/src/agents/runtime/agent-protocol.ts` | Runtime contract — all shared type definitions |
| `server/src/agents/runtime/agent-loop.ts` | Core agentic loop: LLM rounds, tool execution, compaction, timeouts |
| `server/src/agents/runtime/agent-bus.ts` | In-memory inter-agent message routing |
| `server/src/agents/runtime/agent-context.ts` | `createAgentContext()` — wires state, emit, gates, bus into `AgentContext` |
| `server/src/agents/types.ts` | Resume product types: `PipelineState`, `PipelineSSEEvent`, agent I/O interfaces |
| `server/src/agents/coordinator.ts` | Sequences 3 resume agents, manages gates, handles revision requests |
| `server/src/agents/strategist/agent.ts` | Strategist `AgentConfig` |
| `server/src/agents/craftsman/agent.ts` | Craftsman `AgentConfig` |
| `server/src/agents/producer/agent.ts` | Producer `AgentConfig` |
| `server/src/agents/strategist/tools.ts` | Example: 9 tools wrapping intake, research, interview, gap analysis, blueprint |
| `server/src/lib/llm.ts` | Model routing: `getModelForTool()`, `MODEL_PRICING`, tier constants |
| `server/src/lib/llm-provider.ts` | `ZAIProvider` + `AnthropicProvider`, `createCombinedAbortSignal()` |
| `server/src/lib/feature-flags.ts` | Feature flags for optional gates |

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| Agent | An autonomous LLM-powered unit with a defined identity, tools, and completion criteria. Runs as a loop until it decides it is done. |
| Coordinator | A product-level sequencer. Calls agents in order, manages gates, routes bus messages. Makes zero LLM calls. |
| Gate | A named pause point where the pipeline waits for user input via `waitForUser()`. |
| Scratchpad | Per-agent working memory. Accumulates tool results across rounds. Not visible to other agents. |
| Pipeline State | Shared mutable state for a product run. Written by agents via `ctx.updateState()`, read by the coordinator after each agent completes. |
| Domain | The product namespace for agent identity (e.g., `'resume'`). Prevents bus message collisions across products. |
| Model Tier | A cost/capability classification (`primary`, `mid`, `orchestrator`, `light`) that routes LLM calls to the appropriate model. |
| Bus | The in-memory pub/sub system that routes `AgentMessage` objects between agents in the same pipeline run. |
| Feature Flag | A boolean environment variable that controls whether an optional gate or feature is active. |
