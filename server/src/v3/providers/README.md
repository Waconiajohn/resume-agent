# v3 Provider Factory

This directory implements capability-based provider routing for v3 stages (classify, strategize, write, verify). Stages **never** import concrete provider classes directly. They call `getProvider(capability)` and the factory resolves the capability to a `{ provider, model, backend }` triple per the environment.

Decision records:
- `docs/v3-rebuild/04-Decision-Log.md` 2026-04-18 — "Production routes through Vertex-hosted DeepSeek"
- `docs/v3-rebuild/reports/phase-4-cleanup-report.md` 2026-04-18 — "Option B (hybrid): OpenAI for write-position"
- `docs/v3-rebuild/06-Production-Routing.md` — current production map (this doc complements it)

## Capabilities

| Capability         | Used by                                                                      | Production backend       | Production model    | Notes |
|--------------------|------------------------------------------------------------------------------|--------------------------|---------------------|-------|
| `strong-reasoning` | classify, strategize, verify                                                 | `vertex`                 | `deepseek-ai/deepseek-v3.2-maas` | Default since Phase 3.5. |
| `fast-writer`      | write-summary, write-accomplishments, write-competencies, write-custom-section | `vertex`               | `deepseek-ai/deepseek-v3.2-maas` | Same model as strong-reasoning (DeepSeek V3.2 handles both tiers well on these short sections). |
| `deep-writer`      | write-position                                                               | **`openai`** (primary) / `vertex` (fallback) | `gpt-4.1` (primary) / `deepseek-ai/deepseek-v3.2-maas` + `thinking: true` (fallback) | Phase 4.5 hybrid. Phase 4 Intervention 4 showed GPT-4.1 cleanly resolves editorial-synthesis bugs that DeepSeek-thinking could not close. |

Adding a new capability requires a Decision Log entry explaining why existing capabilities don't fit.

## Backend precedence (per capability)

```
RESUME_V3_<CAP>_BACKEND   # strongest — per-capability override
RESUME_V3_PROVIDER        # global fallback
built-in default          # vertex / vertex / openai
```

The per-capability env vars:

- `RESUME_V3_STRONG_REASONING_BACKEND` (default: `vertex`)
- `RESUME_V3_FAST_WRITER_BACKEND` (default: `vertex`)
- `RESUME_V3_DEEP_WRITER_BACKEND` (default: `openai`)

Valid values: `vertex`, `openai`, `anthropic`. Case-insensitive.

If none of the three per-capability vars are set, the factory reads `RESUME_V3_PROVIDER` as a global override. If that's also unset, the built-in defaults above apply.

## Environment variables

| Variable                                       | Purpose                                                      | Default   |
|------------------------------------------------|--------------------------------------------------------------|-----------|
| `RESUME_V3_<CAP>_BACKEND`                      | Per-capability backend (vertex/openai/anthropic)             | See above |
| `RESUME_V3_PROVIDER`                           | Global backend fallback                                      | (none)    |
| `RESUME_V3_STRONG_REASONING_MODEL`             | Model for strong-reasoning on vertex/anthropic               | per-backend default |
| `RESUME_V3_FAST_WRITER_MODEL`                  | Model for fast-writer on vertex/anthropic                    | per-backend default |
| `RESUME_V3_DEEP_WRITER_MODEL`                  | Model for deep-writer on vertex/anthropic                    | per-backend default |
| `RESUME_V3_STRONG_REASONING_MODEL_OPENAI`      | Override specifically on the openai backend                  | `gpt-4.1` |
| `RESUME_V3_FAST_WRITER_MODEL_OPENAI`           | Override specifically on the openai backend                  | `gpt-4.1-mini` |
| `RESUME_V3_DEEP_WRITER_MODEL_OPENAI`           | Override specifically on the openai backend                  | `gpt-4.1` |
| `VERTEX_PROJECT` (or `GCP_PROJECT`)            | Required when any capability resolves to vertex              | —         |
| `VERTEX_REGION`                                | Region for Vertex; `global` for DeepSeek V3.2                | `global`  |
| `GOOGLE_APPLICATION_CREDENTIALS`               | Service account JSON key path (required for Vertex auth)     | —         |
| `OpenAI_API_KEY` (or `OPENAI_API_KEY`)         | Required when any capability resolves to openai              | —         |
| `DEEPSEEK_API_KEY`                             | Enables 429-failover from Vertex → DeepSeek direct           | optional  |
| `DEEPINFRA_API_KEY`                            | Enables 5xx/timeout-failover to DeepInfra                    | optional  |

## Failover chains

### Vertex backend (strong-reasoning, fast-writer)
```
RateLimitFailoverProvider(
  Vertex,                       # primary
  DeepSeek direct               # 429-failover (different quota pool)
)
  ↓ wrapped (when DEEPINFRA_API_KEY is set) in:
FailoverProvider(
  (the above),
  DeepInfra                     # 5xx/timeout failover
)
  ↓ wrapped in:
DefensiveJsonProvider           # mechanical fence-strip + 1-retry JSON handling
```

### Deep-writer hybrid (deep-writer default)
```
DeepWriterFallbackProvider(
  OpenAI GPT-4.1,               # PRIMARY — quality-first path
  Vertex DeepSeek V3.2 + thinking mode   # FALLBACK — kicks in on any OpenAI failure
)
  ↓ wrapped in:
DefensiveJsonProvider
```

**This is the ONE explicit fallback in the system.** All other failures (429s after retry, provider-chain exhaustion, etc.) surface loudly. The deep-writer fallback is carved out specifically because write-position is the quality-critical path and a degraded-but-working fallback serves users better than an outage.

The fallback:
- Triggers on any error from OpenAI (auth, rate limit, network, timeout, 5xx).
- Does NOT trigger on `AbortError` (user cancellation).
- Logs at WARN with primary/fallback backend and the reason.
- Adds `thinking: true` to the Vertex call (DeepSeek's thinking mode) — the writer reasoning mechanism the fallback uses to approximate GPT-4.1's attribution discipline.
- If Vertex is also unavailable (e.g., local dev without GCP credentials), the wrapper is instantiated without a fallback and OpenAI failures propagate.

## How stages use the factory

```ts
import { getProvider } from '../providers/factory.js';
import { loadPrompt } from '../prompts/loader.js';

const prompt = loadPrompt('write-position.v1');          // frontmatter: capability: deep-writer
const { provider, model, extraParams } = getProvider(prompt.capability);

for await (const event of provider.stream({
  model,
  system: prompt.systemMessage,
  messages: [{ role: 'user', content: userMessage }],
  max_tokens: extraParams?.thinking ? MAX * 2 : MAX,   // thinking mode uses more output tokens
  temperature: prompt.temperature,
  ...(extraParams?.thinking && { thinking: true }),
})) {
  // ...
}
```

The `extraParams?.thinking` branch is set only when the factory resolves to the Vertex backend. On the openai backend (the hybrid primary), `extraParams` is `undefined` — the wrapper internally manages the thinking flag on the fallback path.

## Local development overrides

**Run everything on DeepSeek (no OpenAI credits):**
```
RESUME_V3_DEEP_WRITER_BACKEND=vertex
```

**Run everything on OpenAI (pure-OpenAI quality pilot):**
```
RESUME_V3_STRONG_REASONING_BACKEND=openai
RESUME_V3_FAST_WRITER_BACKEND=openai
RESUME_V3_DEEP_WRITER_BACKEND=openai
```

**Run everything on Anthropic (Opus/Sonnet for debug):**
```
RESUME_V3_PROVIDER=anthropic
```

**Use GPT-5 for write-position when the OpenAI project gains access:**
```
RESUME_V3_DEEP_WRITER_MODEL_OPENAI=gpt-5
```

## What the factory does NOT do

- Does not run startup-time auth. Providers instantiate lazily on first `getProvider()` call.
- Does not mask errors outside the deep-writer fallback. Every other error propagates loudly.
- Does not pick temperature or max_tokens. Those are stage decisions, kept in prompt YAML frontmatter.
- Does not know about prompts. It resolves capabilities to `{ provider, model, extraParams }`; the stage still loads the prompt and constructs the call.
