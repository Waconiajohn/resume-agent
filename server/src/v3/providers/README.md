# v3 Provider Factory

This directory implements the capability-based provider factory that v3 stages (classify, strategize, write, verify) use to reach LLMs. Stages **never** import concrete provider classes (`AnthropicProvider`, `VertexProvider`, etc.) directly. They call `getProvider(capability)` and the factory resolves the capability to a configured `{ provider, model }` pair per environment.

Decision record: `docs/v3-rebuild/04-Decision-Log.md` 2026-04-18 "Production routes through Vertex-hosted DeepSeek, not Anthropic models".

## Capabilities

| Capability         | Used by                                | Vertex default model                    | Anthropic default model | Extra flags |
|--------------------|----------------------------------------|-----------------------------------------|-------------------------|-------------|
| `strong-reasoning` | classify, strategize, verify           | `deepseek-ai/deepseek-v3.2-maas`        | `claude-opus-4-7`       | —           |
| `fast-writer`      | write-summary/accomplishments/competencies/custom-section | `deepseek-ai/deepseek-v3.2-maas` | `claude-sonnet-4-6` | —     |
| `deep-writer`      | write-position (Phase 4 cleanup Intervention 3) | `deepseek-ai/deepseek-v3.2-maas` (with thinking mode) | `claude-opus-4-7` | `thinking: true` on the request |

Adding a new capability requires a Decision Log entry explaining why existing capabilities don't fit.

### Thinking mode (`deep-writer`)

`deep-writer` sets `chat_template_kwargs: { thinking: true }` in the request body when the backend is Vertex-hosted DeepSeek V3.2. The response carries two fields:

- `content` — the final answer; this is what the stage consumes downstream.
- `reasoning_content` — the model's thinking tokens; logged at `debug` level, **discarded** from what the stage sees.

Thinking mode roughly doubles output token count (reasoning + answer). The `runSection` write-stage code path recognizes `extraParams.thinking === true` from the factory and:
1. Doubles `max_tokens` so the answer has room after reasoning consumes its share.
2. Passes `thinking: true` into the `provider.stream()` call (which the ZAIProvider base layer translates into `chat_template_kwargs`).

On the Anthropic backend, `deep-writer` maps to `claude-opus-4-7` as the closest analog — Anthropic does not use the `chat_template_kwargs` mechanism, so thinking is not requested on that path. This mapping is for dev comparison runs only.

## Environment variables

| Variable                                  | Purpose                                            | Default   |
|-------------------------------------------|----------------------------------------------------|-----------|
| `RESUME_V3_PROVIDER`                      | Backend: `vertex` (prod) \| `anthropic` (dev) \| `openai` (comparison) | `vertex`  |
| `RESUME_V3_STRONG_REASONING_MODEL`        | Override the model for `strong-reasoning`          | per-backend default |
| `RESUME_V3_FAST_WRITER_MODEL`             | Override the model for `fast-writer`               | per-backend default |
| `RESUME_V3_DEEP_WRITER_MODEL`             | Override the model for `deep-writer`               | per-backend default |
| `RESUME_V3_<CAP>_MODEL_OPENAI`            | Per-backend override for the OpenAI backend only  | per-backend default |
| `VERTEX_PROJECT` (or `GCP_PROJECT`)       | Required when backend is `vertex`                  | —         |
| `VERTEX_REGION`                           | Region for Vertex; `global` for DeepSeek V3.2      | `global`  |
| `DEEPSEEK_API_KEY`                        | Enables 429-failover from Vertex → DeepSeek direct | optional  |
| `DEEPINFRA_API_KEY`                       | Enables 5xx/timeout-failover to DeepInfra          | optional  |
| `OpenAI_API_KEY` (or `OPENAI_API_KEY`)    | Required when backend is `openai`                  | —         |

### OpenAI backend (comparison only)

OpenAI is NOT a production backend. It exists as a diagnostic tool — e.g., Phase 4 cleanup Intervention 4 compared GPT-5 against DeepSeek-thinking on a 5-fixture subset to determine whether remaining quality gaps are model-specific.

Default model mapping (GPT-5 / o-series not available on the project we tested on; defaults use gpt-4.1 / gpt-4o-mini as the available flagships):
- `strong-reasoning` → `gpt-4.1`
- `fast-writer` → `gpt-4o-mini`
- `deep-writer` → `gpt-4.1` (no `reasoning_effort` parameter wired — comparison is diagnostic, not a production port)

Production defaults stay on Vertex-DeepSeek unless a Decision Log entry explicitly flips this.

Project-level override (e.g. if the OpenAI project gains GPT-5 access):
```
RESUME_V3_STRONG_REASONING_MODEL_OPENAI=gpt-5
RESUME_V3_FAST_WRITER_MODEL_OPENAI=gpt-5-mini
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5
```

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
