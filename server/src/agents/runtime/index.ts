/**
 * Agent Runtime — Public API
 */

export { runAgentLoop, type RunAgentParams } from './agent-loop.js';
export { AgentBus, type IAgentBus } from './agent-bus.js';
export { createAgentContext, type CreateContextParams, type ContextInternals } from './agent-context.js';
export {
  type AgentIdentity,
  type AgentTool,
  type AgentMessage,
  type AgentConfig,
  type AgentContext,
  type AgentResult,
  type ToolDef,
  type ToolInputSchema,
  type BaseEvent,
  type BaseState,
  toToolDef,
} from './agent-protocol.js';
export { agentRegistry, registerAgent, type AgentDescription } from './agent-registry.js';
export {
  type ProductConfig,
  type AgentPhase,
  type GateDef,
  type InterAgentHandler,
  type RuntimeParams,
} from './product-config.js';
export { runProductPipeline, type ProductPipelineResult } from './product-coordinator.js';
