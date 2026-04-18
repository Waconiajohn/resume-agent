# v3 Provider Factory

This directory implements the capability-based provider factory that v3 stages (classify, strategize, write, verify) use to reach LLMs. Stages **never** import concrete provider classes (`AnthropicProvider`, `VertexProvider`, etc.) directly. They call `getProvider(capability)` and the factory resolves the capability to a configured `{ provider, model }` pair per environment.

Decision record: `docs/v3-rebuild/04-Decision-Log.md` 2026-04-18 "Production routes through Vertex-hosted DeepSeek, not Anthropic models".

## Capabilities

| Capability         | Used by                                | Vertex default model                    | Anthropic default model |
|--------------------|----------------------------------------|-----------------------------------------|-------------------------|
| `strong-reasoning` | classify, strategize, verify           | `deepseek-ai/deepseek-v3.2-maas`        | `claude-opus-4-7`       |
| `fast-writer`      | write-summary/accomplishments/competencies/position/custom-section | `deepseek-ai/deepseek-v3.2-maas` | `claude-sonnet-4-6` |

Adding a new capability requires a Decision Log entry explaining why existing capabilities don't fit.

## Environment variables

| Variable                                  | Purpose                                            | Default   |
|-------------------------------------------|----------------------------------------------------|-----------|
| `RESUME_V3_PROVIDER`                      | Which backend to use: `vertex` or `anthropic`      | `vertex`  |
| `RESUME_V3_STRONG_REASONING_MODEL`        | Override the model for `strong-reasoning`          | per-backend default |
| `RESUME_V3_FAST_WRITER_MODEL`             | Override the model for `fast-writer`               | per-backend default |
| `VERTEX_PROJECT` (or `GCP_PROJECT`)       | Required when backend is `vertex`                  | —         |
| `VERTEX_REGION`                           | Region for Vertex; `global` for DeepSeek V3.2      | `global`  |
| `DEEPSEEK_API_KEY`                        | Enables 429-failover from Vertex → DeepSeek direct | optional  |
| `DEEPINFRA_API_KEY`                       | Enables 5xx/timeout-failover to DeepInfra          | optional  |

All Vertex auth is handled by `getVertexAccessToken()` in `server/src/lib/llm-provider.ts` (service-account JWT with 50-minute token cache).

## Failover chain (Vertex backend)

Mirrors v2's `writerLlm`:

```
RateLimitFailoverProvider(
  Vertex,                       # primary
  DeepSeek direct               # 429-failover (different quota pool)
)
  ↓ wrapped in FailoverProvider when DEEPINFRA_API_KEY is set:
FailoverProvider(
  (the above),
  DeepInfra                     # 5xx/timeout failover
)
  ↓ wrapped in DefensiveJsonProvider:
DefensiveJsonProvider           # mechanical fence-strip + 1-retry JSON handling
```

On `response_format: { type: 'json_object' }` calls, the wrapper strips markdown code fences from the response and, if JSON still fails to parse, retries once with the parser error fed back into the system prompt. Retry is visible in INFO logs. After the second failure the error propagates — no silent fallback.

## Adding a new capability

1. Add the string literal to the `Capability` type in `factory.ts`.
2. Add a `RESUME_V3_<NEW_CAP>_MODEL` env var handler in `buildVertexResolved` and `buildAnthropicResolved`.
3. Decide which model the capability maps to for each backend. Add to the table above.
4. Write a Decision Log entry explaining why `strong-reasoning` / `fast-writer` could not handle the new use case.

## How stages use it

```ts
import { getProvider } from '../providers/factory.js';
import { loadPrompt } from '../prompts/loader.js';

const prompt = loadPrompt('classify.v1');          // frontmatter has capability: strong-reasoning
const { provider, model } = getProvider('strong-reasoning');

const response = await provider.chat({
  model,
  system: prompt.systemMessage,
  messages: [{ role: 'user', content: userMessage }],
  response_format: { type: 'json_object' },
  max_tokens: 32_000,
  temperature: prompt.temperature,
});
```

Stages that need streaming still call `provider.stream(...)` — the defensive JSON retry applies only to `chat()`. Stage code that streams is responsible for its own JSON handling (`server/src/v3/classify/index.ts` is the canonical example).

## What the factory does NOT do

- Does not run startup-time Vertex auth. Providers instantiate lazily on first `getProvider()` call.
- Does not mask errors. After the one JSON retry, the error propagates loudly.
- Does not pick temperature or max_tokens. Those are stage decisions, kept in the prompt YAML frontmatter.
- Does not know about prompts. It resolves capabilities to `{ provider, model }`; the stage still loads the prompt and constructs the call.
