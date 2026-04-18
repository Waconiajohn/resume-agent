# v2 Prompt and Vertex Integration Inventory

**Date:** 2026-04-18
**Author:** Claude Code (Phase 3.5 prep, read-only)
**Scope:** `server/src/agents/resume-v2/` + `server/src/lib/llm*.ts`. Non-resume agents (cover-letter, LinkedIn, interview-prep, etc.) explicitly out of scope.
**Purpose:** Surface the institutional knowledge baked into v2 (prompts, Vertex routing, defensive patterns) so the v3 provider refactor + prompt port to DeepSeek-on-Vertex can reuse what v2 already learned.

This document is read-only output — no v2 code has been modified.

---

## Section 1 — Vertex + DeepSeek provider integration

### 1a. `VertexProvider` class structure

**File:** `server/src/lib/llm-provider.ts:946-1001`

`VertexProvider` **extends `ZAIProvider`** — the OpenAI-compatible base class used by Groq, DeepSeek, DeepInfra, and Z.AI. The inheritance gets the entire OpenAI-compatible `chat()` / `stream()` implementation for free (line ~365-700 of the same file). Vertex only overrides what's Vertex-specific.

Constructor defaults (lines 946-968):

```ts
super({
  apiKey: config.accessToken || 'placeholder',
  baseUrl,  // region-aware; see below
  providerName: 'vertex',
  chatTimeoutMs: 60_000,    // 60s
  streamTimeoutMs: 90_000,  // 90s — shorter than DeepSeek's (180s/240s)
  disableParallelToolCalls: false,
});
```

Base URL is computed from `region`:
- `global` (default) → `https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/endpoints/openapi`
- any other region → `https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/endpoints/openapi`

**Critical flag in `llm.ts:134`**: `VERTEX_REGION ?? 'global'` — comment says "DeepSeek V3.2 is global-only on Vertex". v3 must default to global.

### 1b. The system-prompt merge quirk

**Location:** `llm-provider.ts:970-1000`

Vertex rejects `role: 'system'` as the first message. VertexProvider's overridden `chat()` transparently merges the system prompt into the first user message:

```ts
const mergedFirstMessage: ChatMessage = {
  role: 'user',
  content: `${params.system}\n\n---\n\n${firstUserContent}`,
};

return super.chat({
  ...params,
  system: '',  // Empty system — content merged into user message
  messages: [mergedFirstMessage, ...params.messages.slice(1)],
});
```

**Separator is literal: `\n\n---\n\n`.** A blank line, three hyphens, blank line.

This is **invisible to callers** — any code that does `vertexProvider.chat({ system, messages })` gets the merge automatically. The caller composes the prompt the same way they'd compose it for any OpenAI-compatible provider.

Quirks of this pattern the v3 port should know:
- The merged message can get long. With v2's resume-writer _SYSTEM_PROMPT (~15K tokens) + user context (~5-10K tokens), the first user message easily exceeds 20K tokens. Vertex handles it; mention anyway.
- If the caller already has a `system` param AND the first `messages[]` entry is role `'assistant'` (tool continuation), the merge target fires into the wrong message. v2 never does this in practice because resume flows are single-turn. v3 should remain single-turn per stage.
- Re-reading the override: when `params.messages[0]?.content` is a content-block array (not a string), the merge extracts empty string — silently dropping the system prompt. v2 never passes block arrays; again, single-turn.

### 1c. Token refresh and caching

**Function:** `getVertexAccessToken()` — `llm-provider.ts:1021-1061`

Priority order:

1. **Preferred path — service-account JWT exchange.** When `GOOGLE_APPLICATION_CREDENTIALS` points to a service-account JSON key, the function:
   - Reads the JSON (uses `client_email`, `private_key`, `token_uri`)
   - Signs an RS256 JWT with the private key
   - POSTs to Google's token endpoint (`https://oauth2.googleapis.com/token` or the key's custom `token_uri`)
   - Caches the resulting access token for **50 minutes** (Google issues 60-minute tokens; 10-min safety margin).
   - Module-level cache: `cachedServiceAccountToken` at `llm-provider.ts:1008` — survives instance boundaries within a process.
   - On failure: logs a warning and falls through.

2. **Fallback — `gcloud auth print-access-token`** invoked via `execSync`. 5-second timeout. Token must be >20 characters to be considered valid. Works in dev with `gcloud auth application-default login`.

3. **Last resort — `VERTEX_ACCESS_TOKEN` env var.**

4. **Throw** with instructions spanning all three mechanisms.

**Per-instance token expiry:** `VertexProvider` keeps `tokenExpiry: 0` as an instance field and refreshes **on every call** if `Date.now() > tokenExpiry`, setting the new expiry to 50 minutes out. This double-caches against the module-level cache, which is fine; the JWT exchange is cheap.

### 1d. 429 / rate-limit fallback

**Not in VertexProvider itself.** The 429-specific fallback lives in `llm.ts:211-283`.

- `isRateLimitError(err)` at `llm-provider.ts:1135-1137` — regex against `"API error 429"` in the error message. Every OpenAI-compatible provider emits errors in that format (see `ZAIProvider.chat()` at line 413).
- `RateLimitFailoverProvider` at `llm.ts:211-250` — wraps a primary + a fallback + a fallback model name. On primary rate limit (429), logs a warn, then re-runs the SAME `chat()` / `stream()` params against the fallback provider with `model: fallbackModel`. Transparent to the caller — no throw, no retry semantics changed.
- **Wiring:** `llm.ts:263-283` — `writerLlm` (the resume-v2 provider) wraps Vertex with `RateLimitFailoverProvider` pointing at DeepSeek direct using model `'deepseek-chat'` when `DEEPSEEK_API_KEY` is set. Different quota pool → different 429 envelope.
- On top of that, there's a general-purpose `FailoverProvider` at `llm-provider.ts:1187-1288` — threshold-based (3 consecutive 5xx errors) with a 5-minute recovery window. Different from the 429 path; catches server-side outages.

So the writer LLM has **two failover layers**:
1. `RateLimitFailoverProvider` — single-shot on 429
2. `FailoverProvider` wrapping the outer primary+global — threshold on 5xx/timeouts

Both are transparent to the prompt author. The only thing the prompt sees is a successful response from whichever provider ended up servicing the call.

### 1e. Timeouts (Vertex-specific)

- chatTimeoutMs: 60_000 (60s)
- streamTimeoutMs: 90_000 (90s)

Compared to other providers in the same file:
- Anthropic stream timeout: 300_000 (5 min)
- DeepSeek chat/stream: 120s / 180s
- DeepInfra chat/stream: 180s / 240s
- Groq chat/stream: 75s / 60s

Vertex is the tightest of the cohort. The 207 tok/s output rate cited elsewhere makes this reasonable: ≈12K-output-tokens fits in 60s. v3's classify (32K max_tokens) would exceed it; classify would need streaming or `max_tokens` trimming when routed to Vertex.

### 1f. v2 model routing for the resume writer

**File:** `server/src/lib/model-constants.ts:99-114`

```ts
function selectResumeV2Provider(): { model: string; provider: string } {
  if (process.env.RESUME_V2_WRITER_PROVIDER && process.env.RESUME_V2_WRITER_MODEL) {
    return { model: process.env.RESUME_V2_WRITER_MODEL, provider: process.env.RESUME_V2_WRITER_PROVIDER };
  }
  if (process.env.VERTEX_PROJECT || process.env.GCP_PROJECT) {
    return { model: VERTEX_DEEPSEEK_MODEL, provider: 'vertex' };
  }
  if (process.env.DEEPINFRA_API_KEY) {
    return { model: DEEPINFRA_MODEL, provider: 'deepinfra' };
  }
  return { model: DEEPSEEK_MODEL_PRIMARY, provider: 'deepseek' };
}
```

Priority order for the writer:
1. Explicit env override (`RESUME_V2_WRITER_PROVIDER` + `RESUME_V2_WRITER_MODEL`)
2. Vertex-hosted DeepSeek — model id `deepseek-ai/deepseek-v3.2-maas`
3. DeepInfra (US-hosted DeepSeek) — model id `deepseek-ai/DeepSeek-V3.2`
4. DeepSeek direct — model id `deepseek-chat`

The constants inline at `model-constants.ts:95-96`:
```ts
const DEEPINFRA_MODEL = 'deepseek-ai/DeepSeek-V3.2';
const VERTEX_DEEPSEEK_MODEL = 'deepseek-ai/deepseek-v3.2-maas';
```

Note the inconsistent naming (`DeepSeek-V3.2` vs `deepseek-v3.2-maas`). That's not a bug — it's the vendor's model-id convention. Vertex uses `-maas` (Model-as-a-Service) suffix.

Pricing table in the same file (lines 130-158):
- Vertex DeepSeek V3.2: input $0.56 / output $1.68 per M tokens
- DeepInfra DeepSeek V3.2: input $0.26 / output $0.38 per M tokens
- DeepSeek direct: input $0.14 / output $0.28 per M tokens
- Opus 4.7 (v3 Phase 4 prototype): input $15.00 / output $75.00 per M tokens

Vertex is about 27x cheaper than Opus on input, 45x cheaper on output. That's the $49/month unit-economics driver.

---

## Section 2 — How v2 calls Vertex for resume work

### 2a. Pipeline orchestration (`orchestrator.ts:1-676`)

v2's resume pipeline runs 10 stages sequentially, wired by `orchestrator.ts`:

1. **Job Intelligence** — parses the JD (`MODEL_MID` via global `llm`)
2. **Source Resume Outline** — deterministic regex parser, no LLM (`source-resume-outline.ts`)
3. **Candidate Intelligence** — parses the resume (`MODEL_MID` via global `llm`)
4. **Benchmark Candidate** — builds competitive profile (`MODEL_PRIMARY` via global `llm`, with optional Perplexity research call)
5. **Gap Analysis** — maps requirements to evidence (`MODEL_PRIMARY` via global `llm`)
6. **Narrative Strategy** — builds the 5-layer story (`MODEL_PRIMARY` via global `llm`)
7. **Resume Writer** — generates all content (uses `writerLlm` / `resumeV2Llm`, the Vertex-first provider described in §1f)
8. **Truth Verification** — fact-checks claims (`MODEL_PRIMARY` via global `llm`)
9. **Executive Tone** — flags junior/AI-voice (`MODEL_MID` via global `llm`)
10. **Assembly** — deterministic merge (no LLM)

Two providers are active in parallel through the pipeline:
- **`llm`** (global) — used by stages 1, 3-6, 8, 9. Configured by `LLM_PROVIDER` env or inferred from available API keys.
- **`writerLlm` / `resumeV2Llm`** — ONLY used by stage 7 (Resume Writer). Routes Vertex → DeepInfra → DeepSeek direct.

Only one stage (stage 7) touches Vertex in the current code path. Everything else runs on the global provider (typically Groq in production).

### 2b. The writer's call-site shape

**File:** `server/src/agents/resume-v2/resume-writer/section-writer.ts:29-34`

```ts
function chatWithRetry(params: ChatParams, options?: { retryMaxTokens?: number }): Promise<ChatResponse> {
  return _chatWithTruncationRetry(
    { temperature: 0.5, ...params },  // Default temp 0.5 for consistent, human-sounding writing
    { ...options, provider: resumeV2Llm },
  );
}
```

Every section call goes through `_chatWithTruncationRetry` from `lib/llm-retry.ts`, scoped to `resumeV2Llm`. The retry wrapper (not shown here, but referenced) re-runs with `retryMaxTokens` when the provider returns `finish_reason: 'length'`.

Request shape for the summary section (representative of all five):

```ts
await chatWithRetry({
  model: RESUME_V2_WRITER_MODEL,
  system: SUMMARY_SYSTEM,                                   // See §3 below
  messages: [{ role: 'user', content: userMessage }],
  response_format: { type: 'json_object' },                 // Forces JSON mode on providers that support it
  max_tokens: 2048,                                          // per-section budget
  signal,
});
```

Call sites use the same `response_format: { type: 'json_object' }` across every section — this is the OpenAI-compatible flag Vertex/DeepSeek/DeepInfra all honor. Anthropic's SDK does NOT honor this parameter (see v3's Phase 3 report §3a).

### 2c. Env vars controlling v2 writer routing

- `RESUME_V2_WRITER_PROVIDER` — explicit override. Values: `vertex`, `deepinfra`, `deepseek`.
- `RESUME_V2_WRITER_MODEL` — pairs with the above.
- `VERTEX_PROJECT` or `GCP_PROJECT` — either triggers Vertex as the writer target.
- `DEEPINFRA_API_KEY` — triggers DeepInfra if Vertex isn't available.
- `DEEPSEEK_API_KEY` — triggers DeepSeek direct (used also for 429 fallback).
- `VERTEX_REGION` — defaults to `global`.
- `GOOGLE_APPLICATION_CREDENTIALS` — service-account JSON path for JWT auth.
- `VERTEX_ACCESS_TOKEN` — last-resort manual token.

No per-stage env var exists for stages 1-6, 8, 9 — they all inherit `LLM_PROVIDER`.

### 2d. DeepSeek-specific handling

The main DeepSeek-specific plumbing in v2:
- **Truncation retry** (`llm-retry.ts` / `chatWithTruncationRetry`) — DeepSeek V3.2 occasionally hits `max_tokens` mid-generation and returns a truncated JSON. The retry wrapper detects `finish_reason === 'length'`, bumps `max_tokens`, and re-runs.
- **`repairJSON`** (`lib/json-repair.ts`) — called on every parse. Handles DeepSeek's known quirks: stray trailing commas, truncated trailing braces, `"field": "value"."` with extra period at end.
- **JSON mode** (`response_format: { type: 'json_object' }`) — Vertex and DeepInfra honor this and error out if the model tries to emit non-JSON. DeepSeek direct also honors it.
- **Parallel tool calls disabled for Groq only** (`GroqProvider` constructor). Vertex and DeepSeek/DeepInfra keep parallel enabled.
- **Global tool-use recovery** (`ZAIProvider.recoverFromToolValidation` at `llm-provider.ts:716-845`) — for any OpenAI-compatible provider, when the model returns a 400 with `tool_use_failed` in `failed_generation`, extracts the first tool call from the truncated output and returns it as a successful response. This is Groq-motivated but works across providers.

---

## Section 3 — Prompts (organized by stage)

This section documents every prompt in the v2 pipeline. For the shorter system prompts (stages 1-5, 7-9) I provide full verbatim text. For the longer section-writer prompts (stage 6 subdivisions) I also provide full text since those are the highest-value ports for v3's write stage.

All prompts interpolate `${SOURCE_DISCIPLINE}` at the end — a 6-line block preventing hallucinated metrics and stale context carry-forward. Text at `knowledge/resume-rules.ts:381-388`:

```
SOURCE DISCIPLINE — NON-NEGOTIABLE:
- Read the candidate's actual resume text and job description fresh for this evaluation.
- Never assume metrics, accomplishments, or credentials from prior context.
- Never carry forward or cache numbers between evaluations.
- If a fact is not in the source resume or job description provided, it does not exist.
- Every claim must trace to text in the provided inputs.
- Do not reference anything from a previous pipeline run.
```

Many stage-6 prompts also end with `${JSON_RULES}` (from `section-writer.ts:50`):

```
Return exactly one JSON object. First character must be {, last must be }. No markdown fences. No prose outside the JSON.
```

For brevity below, `${SOURCE_DISCIPLINE}` and `${JSON_RULES}` are shown as interpolation markers rather than re-quoted.

### Stage 1 — Job Intelligence (parses the JD)

**File:** `server/src/agents/resume-v2/job-intelligence/agent.ts:19-87` (69 lines, ≈3K tokens)
**Constant:** `SYSTEM_PROMPT`
**Model:** `MODEL_MID` via the global `llm` (Groq Scout in production)
**Call site:** `llm.chat({ model: MODEL_MID, system: SYSTEM_PROMPT, messages, response_format: { type: 'json_object' }, max_tokens: 4096 })`

Captured verbatim by the Explore pass; see that report. Opening:

> "You are a senior executive recruiter who has placed 500+ candidates at the VP/C-suite level. Your job is to deconstruct a job description and extract what the hiring manager ACTUALLY wants — not what HR wrote."

Patterns: numbered rule sections (1. ROLE PROFILE, 2. CORE COMPETENCIES, 3. LANGUAGE KEYWORDS, 4. CONFIDENCE SCORING), explicit `OUTPUT FORMAT: Return valid JSON:` block, trailing `SOURCE DISCIPLINE` block.

### Stage 3 — Candidate Intelligence (parses the resume)

**File:** `server/src/agents/resume-v2/candidate-intelligence/agent.ts:32-126` (94 lines, ≈4K tokens)
**Constant:** `SYSTEM_PROMPT`
**Model:** `MODEL_MID` via global `llm`
**Opens with:** "You are a senior executive career strategist. You've reviewed 10,000+ executive resumes. Your job is to extract a structured profile from a resume based strictly on what is explicitly written."

Patterns: section headers (PROFESSIONAL EXPERIENCE, EDUCATION, AI READINESS, QUANTIFIED OUTCOMES, PHANTOM EXPERIENCE FILTERING), explicit anti-placeholder rule ("Never output placeholder names like 'John Doe'"), 4-tier confidence scale. **This is the prompt v3's `classify` replaced.** Its phantom-filtering rules are valuable reference for how classify.v1.md's Rule 1 (career gap notes) evolved.

### Stage 4 — Benchmark Candidate (ideal-hire profile)

**File:** `server/src/agents/resume-v2/benchmark-candidate/agent.ts:25-90` (65 lines, ≈2.5K tokens)
**Constant:** `SYSTEM_PROMPT`
**Model:** `MODEL_PRIMARY` via global `llm`
**Opens with:** "You are the Benchmark Candidate Intelligence agent for CareerIQ. Your output informs downstream agents about what the ideal candidate looks like. Downstream agents decide independently how to position the actual candidate's real experience."

5 strategic questions as the prompt spine: `role_problem_hypothesis`, `direct_matches`, `gap_assessment`, `positioning_frame`, `hiring_manager_objections`. **The `positioning_frame` vocabulary is the direct antecedent of v3's `strategy.positioningFrame`.** The `hiring_manager_objections` output parallels v3's `strategy.objections`.

### Stage 5 — Gap Analysis (requirement-to-evidence mapping)

**File:** `server/src/agents/resume-v2/gap-analysis/agent.ts:53-205` (152 lines, ≈6K tokens). The longest non-writer prompt in the pipeline.
**Constant:** `SYSTEM_PROMPT`
**Model:** `MODEL_PRIMARY` via global `llm`
**Call site:** `chatWithTruncationRetry({ model: MODEL_PRIMARY, system: SYSTEM_PROMPT, messages, response_format: { type: 'json_object' }, max_tokens: 8192 })` at `gap-analysis/agent.ts:219-227`

**Opens with:** "You are a $3,000/engagement executive resume strategist. Your specialty: mapping a candidate's real experience to job requirements honestly — noting where evidence is strong, partial, or absent."

Distinct high-value rules in this prompt (verbatim key excerpts):

```
INFERRED METRIC RULE: When you infer a number from scope (like budget from team size), you MUST:
1. Back off 10-20% from the calculated value so the candidate can defend it
2. Label it explicitly as inferred: e.g., "~$3M payroll budget — INFERRED from team of 40 × ~$85K avg, backed off to $3M+"
3. Populate inference_rationale with the full math/logic
The inferred label is not optional. The resume writer will decide whether to use the inferred metric.
```

```
HARD REQUIREMENT RULE: critical_gaps is STRICTLY reserved for formal credentials the candidate is missing. The ONLY items that belong in critical_gaps are:
  1. Academic degrees (BS, MS, PhD, MBA, etc.) explicitly required by the JD
  2. Professional certifications (PMP, CPA, PE, CFA, OSHA, IADC, Well Control, etc.) explicitly required
  3. Professional licenses (PE license, medical license, law license, bar admission, etc.)
  4. Explicit years-of-experience thresholds stated as minimum requirements (e.g., "minimum 10 years required")
NEVER put skills, soft skills, achievements, performance metrics, behavioral competencies, or operational experience into critical_gaps.
```

```
ANTI-REPETITION RULE: Each positioning statement must use distinct phrasing. Never start multiple positioning statements with the same verb or pattern.
```

```
SPECIFICITY TEST: Before writing positioning, check: does this sentence contain at least ONE of [specific metric, company/project name, team size, tool/methodology, geographic scope, timeframe]? If not, rewrite it until it does.
```

```
PRESERVATION RULE: The positioning MUST preserve or improve upon the specificity of the evidence. If the candidate's resume says "Reduced BHA failures from 2.0 to 1.6 per lateral", your positioning must keep those exact numbers and details — never flatten them into "Optimized drilling performance".
```

Also includes a nested user-message builder at line 427 (`function buildPromptRequirements`) that formats the JD requirements list for the user side. High-volume mode at `agent.ts:207-208` trims candidate requirements to 35 when the full list exceeds `HIGH_VOLUME_BENCHMARK_LIMIT`.

**This prompt is effectively v3's strategize prompt predecessor** — the "inferred metric", "positioning", and "critical_gaps" vocabulary directly inform Rule 3 (objections) and Rule 1 (emphasized accomplishments) of v3's `strategize.v1.md`.

### Stage 6 — Narrative Strategy (5-layer story scaffolding)

**File:** `server/src/agents/resume-v2/narrative-strategy/agent.ts:28-258` (230 lines, ≈7K tokens)
**Constant:** `SYSTEM_PROMPT`
**Model:** `MODEL_PRIMARY` via global `llm`
**Opens with:** "You are a master brand strategist and narrative architect who has positioned 500+ executives for career transitions."

**5-layer scaffolding (the prompt's spine):**

- LAYER 1: CAREER PATTERN
- LAYER 2: PROGRESSION ARC
- LAYER 3: UNIQUE COMBINATION
- LAYER 4: WHY THIS ROLE?
- LAYER 5: IMPACT LENS

Plus AGE-PROOFING rules specifically for the 45-60 candidate segment:
- "Suppress graduation years for degrees earned 20+ years ago"
- "Never use 'extensive experience' or '30+ years'"
- "Use 'deep expertise' instead of 'I've done this forever'"

**`primary_narrative` output field is a 2-3 word brand essence** — directly comparable to v3's `positioningFrame` (2-5 word phrase in `strategize.v1.md` Rule 2). v2's "builder", "consolidator", "turnaround" vocabulary is the ancestor.

### Stage 7 — Resume Writer (the five section prompts)

**File:** `server/src/agents/resume-v2/resume-writer/section-writer.ts`
**Provider:** `resumeV2Llm` / `writerLlm` (Vertex → DeepInfra → DeepSeek direct)
**Model:** `RESUME_V2_WRITER_MODEL` = `deepseek-ai/deepseek-v3.2-maas` when Vertex available
**Temperature:** `0.5` (default; set in `chatWithRetry` wrapper at line 31)

The file's opening comment (lines 1-21) is itself architectural documentation:

> "Section-by-section resume writer. Splits the single-pass 32K-token resume writer into 5 focused LLM calls, each with section-specific rules and explicit cross-section evidence tracking.
>
> Why: A single prompt with 50+ rules and 20K tokens of output causes the model to drop structural rules, repeat evidence across sections, and produce thin custom sections. One focused call per section group fixes all three failure modes."

This is the key insight for v3's Phase 4 architecture — splitting write into four parallel section prompts was v2's response to the single-pass monolithic-writer failure mode. v3 did the same thing by design.

Two helper constants at the top:

```ts
const JSON_RULES = `Return exactly one JSON object. First character must be {, last must be }. No markdown fences. No prose outside the JSON.`;

const RETRY_SYSTEM =
  'You are a JSON extraction machine. Return ONLY valid JSON. Start with { and end with }. No markdown fences, no commentary, no text before or after the JSON object.';
```

The `RETRY_SYSTEM` is used on JSON-parse-failure as a stricter second-attempt system prompt (see Section 5 below).

#### Stage 7a — Executive Summary (`SUMMARY_SYSTEM`, lines 83-140)

```
You are a ghostwriter for a senior executive. A hiring manager will spend 6 seconds on this summary. Your job: make those 6 seconds count.

STEP 1 — EXTRACT THE CANDIDATE'S VOICE
Before writing anything, read the candidate's original resume text below. Find 3-5 phrases where the candidate sounds most like themselves — specific language, industry terms, accomplishments they clearly own. Write these down mentally. Your summary must echo THEIR voice, not yours.

STEP 2 — IDENTIFY THE JOB'S TOP NEED
Read the top JD requirements provided below. What is the #1 problem this company is hiring someone to solve? Your summary must answer: "This person solves THAT problem."

STEP 3 — WRITE THE SUMMARY
Write 3-4 sentences. Total: 60-100 words. Follow this structure:

SENTENCE 1 — WHO THEY ARE (not what they've done):
Write how a trusted colleague would introduce them at a conference.
  ✓ "Operations executive who turns around underperforming manufacturing plants."
  ✓ "Finance leader who builds reporting infrastructure that boards actually use."
  ✗ "Results-driven professional with 22 years of experience in operations."
  ✗ "Seasoned leader passionate about driving operational excellence."

SENTENCE 2 — THEIR STRONGEST PROOF (with a number):
One accomplishment that directly addresses the job's top need. Use the XYZ formula: Accomplished [X] as measured by [Y] by doing [Z].
  ✓ "Turned around a $210M division — eliminated $18M in waste, improved throughput 22% in under two years."
  ✓ "Built the FP&A function from scratch, delivering the first board-ready financial model within 90 days."
  ✗ "Proven track record of driving improvements and delivering results."

SENTENCE 3 — WHY THIS ROLE (connect to the JD):
Bridge their experience to what THIS specific job needs. Be concrete.
  ✓ "Combines deep Lean expertise with hands-on budget management across 3 plants serving automotive OEMs."
  ✗ "Passionate about operational excellence and committed to continuous improvement."

STEP 4 — SELF-CRITIQUE
Before outputting, check your summary against these tests:
- PERSON TEST: Could you hear a real person say this at a dinner party? If it sounds like a LinkedIn bot, rewrite.
- SPECIFICITY TEST: Does every sentence contain at least one concrete detail (number, company type, methodology, industry)?
- BUZZWORD TEST: Scan for these AI fingerprints and REMOVE any you find: spearheaded, leveraged, orchestrated, championed, fostered, driving [noun], ensuring [noun], cross-functional collaboration, stakeholder engagement, transformational, innovative solutions, best-in-class, cutting-edge, holistic, robust, end-to-end, operational excellence, proven track record, results-driven, seasoned professional.
- XYZ TEST: Does sentence 2 follow Accomplished [X] as measured by [Y] by doing [Z]?
- FLOW TEST: Read the summary as one paragraph. Does it flow naturally from sentence to sentence? Or does it feel like three bullets mashed together? If the latter, rewrite transitions.

If any test fails, revise that sentence before outputting.

HARD CONSTRAINTS:
- No first-person pronouns (I, my, we, our)
- No personal pronouns referring to the candidate (he, she, his, her, him, they, their, them). We do not guess gender.
- No name-led third-person narrator voice either — never start a sentence with the candidate's name. That reads like a bio, not a resume. Use ACTIVE VOICE exclusively: start sentences with the action verb or the identity descriptor.
  BAD (pronoun): "He eliminated 90% of manual data input. His approach combines Lean and Six Sigma."
  BAD (name-led narrator): "Tatiana eliminated 90% of manual data input — pairing Lean and Six Sigma to cut cycle time in regulated environments."
  GOOD: "Eliminated 90% of manual data input. Combines Lean and Six Sigma frameworks to cut cycle time in regulated environments."
  GOOD: "Operations executive who turns around underperforming manufacturing plants. Eliminated 90% of manual data input in the most recent role."
- No naming the target company
- Every metric must come from the source resume — never invent numbers
- If career span > 20 years: say "deep expertise" not "30 years of experience"
- Read your summary aloud before outputting. If any sentence has the same word appearing twice, rewrite it. If any sentence has more than 2 commas, split it into two sentences.
- Each sentence should make ONE point. Do not chain multiple accomplishments with "and" or commas.
  BAD: "Reduced costs by $18M delivering 22% throughput improvement and 0.9% defect rate through structured value stream mapping and capital-efficient kaizen cycles."
  GOOD: "Cut $18M in annual waste through plant-wide Lean transformation. Improved throughput 22% while driving defect rates down to 0.9%."
- The summary must read as smooth prose, not a compressed bullet list. Write it as if you were introducing this person to a CEO at a dinner — clear, confident, brief.

${SOURCE_DISCIPLINE}
${JSON_RULES}
```

**Max tokens:** 2048. **JSON shape:** `{ "content": string, "is_new": boolean }`.

The `parse()` function at line 224-283 has **heavy post-processing guardrails** — strips pipe/slash branded titles, removes sentences with repeated metrics, prefixes with clean role title if output looks like a bare title fragment. These are DeepSeek-defensive behaviors.

#### Stage 7b — Selected Accomplishments (`ACCOMPLISHMENTS_SYSTEM`, lines 344-376)

```
You are an expert executive resume writer. Your only job right now is to write 3-4 Selected Accomplishments — the spectacular proof points that make a hiring manager stop and re-read.

## WHAT MAKES A GREAT ACCOMPLISHMENT
- One primary JD requirement it proves — every accomplishment must be tied to a real job need
- Format: Strong Action Verb + What You Did (with context) + Measurable Result
- Every accomplishment must have a substantive metric: $X saved, Y% improved, Z people/systems/sites impacted
- "Managed" and "Supported" are NOT strong verbs — use Drove, Championed, Transformed, Negotiated, Architected, Scaled
- Must be traceable to the original resume — no fabrication

## HARD RULES
- 3-4 accomplishments maximum — quality over quantity
- Each accomplishment must address a DIFFERENT primary JD requirement — do not repeat proof themes
- No accomplishment may duplicate evidence already used in another section
- Every accomplishment must have is_new set correctly (true if enhanced beyond verbatim original)

## OUTPUT FORMAT
Return this JSON object:
{
  "accomplishments": [
    {
      "content": "Strong action verb sentence with metric",
      "is_new": false,
      "addresses_requirements": ["requirement name"],
      "source": "original",
      "requirement_source": "job_description",
      "evidence_found": "quote from original resume or empty string",
      "confidence": "strong"
    }
  ]
}

${SOURCE_DISCIPLINE}
${JSON_RULES}
```

**Max tokens:** 4096. Note the `addresses_requirements`, `source`, `requirement_source`, `evidence_found`, `confidence` fields — v2 carries rich provenance per bullet. v3's `WrittenResume.selectedAccomplishments` is currently `string[]`; the v2 richer shape is worth porting.

#### Stage 7c — Core Competencies (`COMPETENCIES_SYSTEM`, lines 502-521)

```
You are an expert executive resume writer. Your only job right now is to write 12-18 Core Competencies for an executive resume.

## RULES
- Mirror exact phrases from the job description wherever possible — this section is the primary ATS keyword magnet
- Group by narrative themes, not as a raw keyword dump
- Include BOTH technical domain skills AND strategic soft skills appropriate to the candidate's seniority level
- Soft skills like "Cross-Functional Collaboration," "Executive Stakeholder Communication," "Change Management," and "Strategic Planning" signal seniority and belong on executive resumes — include them whether or not the JD mentions them
- Only exclude truly meaningless generics that add zero signal at any level: "hard worker," "team player," "self-starter," "detail-oriented," "people person"
- For executive candidates, AI readiness means leadership of technology adoption and digital transformation — frame it at the executive level: "AI-Enabled Process Optimization" not "Machine Learning"
- Include the candidate's domain strengths and industry-specific technical capabilities
- Avoid duplicating competencies — each entry should be distinct

## OUTPUT FORMAT
Return this JSON object:
{ "competencies": ["skill1", "skill2", "skill3", ...] }

12 minimum, 18 maximum. Quality over exhaustiveness.

${SOURCE_DISCIPLINE}
${JSON_RULES}
```

**Max tokens:** 2048. **Count range: 12-18** (v3's `write-competencies.v1.md` says 9-15 — subtly different).

Note that this prompt **allows executive soft skills** (Cross-Functional Collaboration, Change Management) which v3's write-competencies explicitly BANS. This is a genuine divergence worth discussing: v2 treats executive-level soft skills as signal; v3 currently treats them as noise. Section 6 has a recommendation.

#### Stage 7d — Custom Sections (`CUSTOM_SECTIONS_SYSTEM`, lines 629-670)

```
You are an expert executive resume writer. Your only job right now is to write content for recommended custom resume sections.

## CRITICAL RULE — EVIDENCE EXCLUSIVITY
Each custom section must contain UNIQUE proof NOT already used in Selected Accomplishments or other sections.
If the evidence pool for a section is too thin to produce 2+ unique proof points, return an empty lines array for that section — it will be filtered out automatically.
Do NOT repeat accomplishments, metrics, or proof points that appear in the "Already Used Evidence" list below.

## TRUTHFULNESS — DO NOT SILENTLY INVENT
You may CREATIVELY REFRAME real experience to fit a section's theme. That is expected and valuable.
You may NOT invent accomplishments, tools, methodologies, or metrics that do not appear in the candidate's background.

The difference:
- GOOD (creative reframe): Candidate did "automated server provisioning with Ansible" → reframe as "Implemented infrastructure automation reducing manual overhead and enabling scalable operations"
- BAD (invention): Candidate has no ML experience → write "Developed machine learning models to optimize resource utilization" — this is fabrication

When evidence is genuinely thin for a section, you have two options:
1. Write what IS real, even if it's only 1-2 lines of reframed proof. The system will surface these as areas for the candidate to strengthen.
2. Return empty lines if nothing real can fill the section. The section will be filtered out.

Either option is better than inventing accomplishments the candidate cannot defend in an interview.

## SECTION CONTENT GUIDELINES
- Each line must be substantive: action + context + result
- Lines should read as resume bullets, not as paragraph prose
- Back off 10-20% on inferred metrics and mark with "~" or "up to"
- Every line must trace back to the original resume or user-provided context — creative reframing of real experience is encouraged, invention of new experience is not

## OUTPUT FORMAT
Return this JSON object:
{
  "sections": [
    {
      "id": "section_id_here",
      "lines": ["line 1", "line 2", "line 3"]
    }
  ]
}

Return an entry for EVERY recommended section. If a section has insufficient unique evidence, return an empty lines array: { "id": "...", "lines": [] }

${SOURCE_DISCIPLINE}
${JSON_RULES}
```

**Max tokens:** 4096. **v3 has no direct equivalent** — v3's `WrittenResume` has `summary`, `selectedAccomplishments`, `coreCompetencies`, `positions`. Custom sections ("AI Leadership & Transformation", "Transformation Highlights", "Selected Projects", "Board & Advisory Experience") live in `section-planning.ts`. v3 will need either a custom-sections stage or schema additions if these are important to preserve.

#### Stage 7e — Professional Experience (`EXPERIENCE_SYSTEM`, lines 783-928)

The longest prompt in v2 (146 lines, ≈7K tokens). Called ONCE PER ROLE via `buildSinglePositionMessage` — parallel across all positions. This was v2's answer to the "writing 20 positions in one call drops structural rules" failure.

Major sections:

- **EVIDENCE-BOUND WRITING — YOUR #1 RULE**: 5 bullet rules explicitly forbidding invented metrics, upgraded verbs, added companies, "collaborated"-to-"led" upgrades without user confirmation.
- **STEP 1-5 workflow:** read source role → map JD requirements → write bullets using one of 4 story formats (TRANSFORMATION, GROWTH, RECOVERY, IMPACT) → check work (VERB DEDUP, BANNED LANGUAGE) → self-critique.
- **4 bullet story formats** with explicit templates and examples.
- **BANNED LANGUAGE list**: Spearheaded, Championed, Orchestrated, Fostered, Pioneered, "Driving [noun]", "Ensuring [noun]", Cross-functional collaboration, Stakeholder engagement, Transformational, Innovative solutions, Best-in-class, End-to-end, Holistic, Robust, Cutting-edge, Operational excellence.
- **PREFERRED VERBS** list: Built, Grew, Cut, Launched, Designed, Negotiated, Reduced, Expanded, Closed, Fixed, Hired, Shipped, Opened, Restructured, Merged, Won, Saved, Automated, Standardized, Eliminated, Inherited, Took over, Stood up, Consolidated.
- **CAREER CONTEXT — 45+ EXECUTIVES**: age-specific framing rules (gap handling, overqualification handling, 20+-year weighting toward recent roles).
- **SECTION BOUNDARIES — DO NOT MIX**: explicit rules against bullets containing certifications, skills lists, or education entries (prevents the "education blob" v2 bug from doc 05).
- **Rich JSON output schema** including `is_new`, `source`, `requirement_source`, `evidence_found`, `confidence` per bullet AND per scope statement.

**Max tokens:** 4096 per role. **Per-position timeout:** 90 seconds (line 960).

**Identity lock** at lines 1147-1153: when the LLM response is parsed, `company / title / start_date / end_date` are FORCED back to source values, preventing identity drift that would confuse downstream matchers.

This is the prompt that maps most directly to v3's `write-position.v1.md`. v3's Rule 3 (outcome-method-scope) is a simpler version of v2's 4-story-format system. v3's banned-language list overlaps v2's (Spearheaded, Orchestrated, End-to-end, etc.) but v2's is richer.

### Stage 8 — Truth Verification

**File:** `server/src/agents/resume-v2/truth-verification/agent.ts:27-66` (39 lines, ≈2.5K tokens)
**Constant:** `SYSTEM_PROMPT`
**Model:** `MODEL_PRIMARY` via global `llm`

4-tier confidence scale: `verified | plausible | unverified | fabricated`. Outputs `truth_score = (verified + plausible) / total × 100`. Direct ancestor of v3's `verify.v1.md`, though v3 uses binary `passed` + severity-tagged issues instead of a percentage score.

### Stage 9 — ATS Optimization

**File:** `server/src/agents/resume-v2/ats-optimization/agent.ts:28-56` (28 lines, ≈2K tokens)
**Constant:** `SYSTEM_PROMPT`
**Model:** `MODEL_LIGHT` via global `llm`

JSON shape: `{ match_score, keywords_found[], keywords_missing[], keyword_suggestions[], formatting_issues[] }`. Match score: `(keywords_found / total_important_keywords) × 100`. v3 currently has no ATS stage — kept but simplified per doc 01's "probable kills" list ("ATS scoring (kept but simplified — mechanical keyword match only)"). Deterministic-only replacement would be trivial (regex keyword hit rate).

### Stage 10 — Executive Tone

**File:** `server/src/agents/resume-v2/executive-tone/agent.ts:26-101` (75 lines, ≈3.5K tokens)
**Constant:** `SYSTEM_PROMPT`
**Model:** `MODEL_MID` via global `llm`

Outputs `findings[]` with severity tags (junior_language, ai_generated, generic_filler, passive_voice, banned_phrase, wordiness, metric_free_claim, gerund_chain, self_assessment, abstract_nouns) and a `tone_score` starting from 100 minus 3 per finding. `BANNED_PHRASES` list comes from `knowledge/resume-rules.ts:270-291` (imported as a regex-compiled list for the deterministic fallback). Max 12 findings.

**Critical constraint (verbatim):**

> "Your rewrites may ONLY change wording and style. You may NOT add new facts, metrics, numbers, certifications, titles, company names, or scope claims that are not already in the text you are rewriting."

v3's `verify.v1.md` covers a subset of this (Check 2 — no pronouns when null, Check 6 — no AI artifacts). The full tone-audit pipeline is absent from v3. For Phase 5 we may want to port the tone-flag taxonomy into verify.

### Stage vestigial — Single-pass Resume Writer

**File:** `server/src/agents/resume-v2/resume-writer/agent.ts:91`
**Constant:** `_SYSTEM_PROMPT`

This is a ~15K-token monolithic writer prompt. `grep _SYSTEM_PROMPT server/src/agents/resume-v2/` returns ONE hit (the declaration itself). **This constant is dead code** — the underscore prefix suggests the author marked it as private-to-file, and the section-writer.ts header comment explains why: the monolithic prompt "caused the model to drop structural rules, repeat evidence across sections, and produce thin custom sections." The split into 5 section-writer prompts replaced it.

Recommendation: leave the dead code in place for v2 reference; v3 should not port from it.

---

## Section 4 — Cross-cutting prompt patterns

Reading the full corpus together, these patterns repeat:

### 4a. Structural patterns

- **Role-playing opener**: every system prompt opens with "You are a [specific expert] who has [done specific thing many times]." Counts across 9 stage prompts:
  - "senior executive recruiter who has placed 500+" (job-intel)
  - "senior executive career strategist. You've reviewed 10,000+" (candidate-intel)
  - "Benchmark Candidate Intelligence agent for CareerIQ" (benchmark)
  - "$3,000/engagement executive resume strategist" (gap-analysis)
  - "master brand strategist and narrative architect who has positioned 500+" (narrative)
  - "ghostwriter for a senior executive" (summary, experience)
  - "expert executive resume writer" (accomplishments, competencies, custom)
  - "fact-checker for executive resumes" (truth)
  - "executive communications director who has edited 1,000+" (tone)
  - "ATS optimization specialist" (ats)

- **Interpolated shared blocks**: every prompt ends with `${SOURCE_DISCIPLINE}`; every section-writer prompt also ends with `${JSON_RULES}`.

- **`## RULES`** and **`## HARD RULES`** section headers, sometimes both in the same prompt.

- **✓ / ✗ contrasts**: nearly every section-writer prompt uses ✓/✗ before/after examples. This pattern shows up ≈20 times across the five section prompts.

- **Self-critique steps**: 3 of the 5 section prompts include a "STEP X — SELF-CRITIQUE" block with explicit tests to run before outputting (PERSON TEST, SPECIFICITY TEST, BUZZWORD TEST, XYZ TEST, FLOW TEST).

- **Numbered step workflows**: 2 section prompts (summary, experience) lay out STEP 1 through STEP 5 with explicit instructions for each.

### 4b. Output-format scaffolding

- **`OUTPUT FORMAT: Return valid JSON:`** followed by a code block with the exact shape. 8 of 9 agent prompts use this exact phrasing.
- **`RETRY_SYSTEM`** constant (`section-writer.ts:52`): swapped in as the second-attempt system prompt when the first JSON parse fails. Much shorter, more forceful:
  > "You are a JSON extraction machine. Return ONLY valid JSON. Start with { and end with }. No markdown fences, no commentary, no text before or after the JSON object."
- **`response_format: { type: 'json_object' }`** — every writer call sets this. Vertex, DeepInfra, DeepSeek direct all honor it.

### 4c. Banned-language lists

Three different prompts maintain banned-language lists:
- **summary (`SUMMARY_SYSTEM`)**: inline list of 20+ buzzwords within the BUZZWORD TEST.
- **experience (`EXPERIENCE_SYSTEM`)**: inline list of 15+ banned openers and phrases under BANNED LANGUAGE.
- **tone agent (`executive-tone/SYSTEM_PROMPT`)**: references `BANNED_PHRASES` from `knowledge/resume-rules.ts:270-291`. That constant is also compiled into a regex for the deterministic fallback, which is a unique pattern — the banned list is both prompt rule and executable guardrail.

The three lists overlap but aren't identical. v3's `write-position.v1.md` has its own inline list. Any port should consolidate these into one shared `BANNED_LANGUAGE` block in the prompt library.

### 4d. Evidence-tracking vocabulary

v2's section writers carry explicit evidence-tracking fields on each output item:
- `is_new` (boolean) — true if the writer enhanced beyond the verbatim source
- `source` — `"original" | "enhanced" | "drafted"`
- `requirement_source` — `"job_description" | "benchmark"`
- `evidence_found` — the exact source text that backs the bullet
- `confidence` — `"strong" | "partial" | "needs_validation"`

v3's schema has confidence per bullet but drops `is_new`, `source`, `requirement_source`, `evidence_found`. This is a regression worth considering: `evidence_found` in particular is load-bearing for verify — without it, Stage 5's "trace every claim to source" check has to re-derive the source, which is expensive and unreliable.

### 4e. Career-context rules specific to the age-45-60 cohort

Both `narrative-strategy/SYSTEM_PROMPT` (5 rules under AGE-PROOFING) and `section-writer/EXPERIENCE_SYSTEM` (3 rules under CAREER CONTEXT — 45+ EXECUTIVES) surface the same customer segment:
- Suppress graduation years for 20+-year-old degrees
- Never use "30+ years of experience" — use "deep expertise"
- Weight recent roles (last 10 years) heavily; older roles go to an "Earlier Career" section
- Don't draw attention to career gaps

v3 has none of this baked in. For the core target demographic, these rules should port. v3's `strategize.v1.md` Rule 6 (notes for tension flags) could mention age-proofing; v3's `write-position.v1.md` Rule 1 (bullet-count by emphasis) already weights recent roles heavier, which is a structural solution to the same concern.

### 4f. DeepSeek-on-Vertex-specific defensive patterns

Patterns that appear specifically because DeepSeek V3.2 misbehaves without them:

- **`is_new: true/false`** — DeepSeek tends to mark everything as rewritten even when it isn't; the field is required explicitly to force a distinction.
- **JSON mode + strict first-character rule** ("First character must be {, last must be }") — DeepSeek occasionally prepends whitespace, summary text, or `json:` prefix. The rule catches it.
- **`RETRY_SYSTEM`** with explicit "no markdown fences" — DeepSeek's most common failure mode is wrapping the response in ```json ... ```. (This is the same failure v3's write stage hit with Sonnet; v3's mechanical fence-strip is appropriate defense.)
- **`addresses_requirements: [...]`** — forces DeepSeek to enumerate which JD requirements each output item addresses. Without it, the model emits items without tying them to requirements, making downstream attribution impossible.
- **Identity lock after parse** (`section-writer.ts:1147-1153`) — forces `company / title / start_date / end_date` back to source values after the LLM returns, because DeepSeek sometimes paraphrases these fields.
- **Pipe/slash branded-title stripping** (`section-writer.ts:233-246`) — DeepSeek occasionally returns "Leader | Domain | Scale. Rest of summary..." format; the post-processor strips the prefix.
- **Repeated-metric deduplication** (`section-writer.ts:249-266`) — DeepSeek sometimes mentions the same dollar figure twice; the parser drops the second sentence.
- **"Never repeat evidence"** as an explicit first-order rule — DeepSeek otherwise duplicates proof across sections.

### 4g. System prompt length distribution

| Stage | Tokens | Bucket |
|-------|--------|--------|
| ATS Optimization | 2K | short |
| Truth Verification | 2.5K | short |
| Benchmark Candidate | 2.5K | short |
| Job Intelligence | 3K | medium |
| Executive Tone | 3.5K | medium |
| Candidate Intelligence | 4K | medium |
| Gap Analysis | 6K | long |
| Narrative Strategy | 7K | long |
| Experience Writer | 7K | long |
| Summary Writer | 2.5K | short |
| Accomplishments Writer | 2K | short |
| Competencies Writer | 1.5K | short |
| Custom Sections Writer | 2K | short |

Most v2 prompts are in the 2-4K range. Only gap-analysis, narrative-strategy, and experience-writer exceed 5K. v3's Phase 4 prompts (strategize 3K, write-summary 1K, write-accomplishments 1K, write-competencies 1K, write-position 2.5K, verify 2K) run a bit shorter because they're targeting one stage's responsibility rather than mixing strategic and executional rules in the same prompt.

---

## Section 5 — Defensive / guardrail code tied to prompt outputs

These are the functions that exist because v2 prompts produce bad output and the code cleans up. Each entry maps a failure mode to the guard.

Inventory from `resume-writer/agent.ts` (matches the "17 guardrail functions" claim in doc 05):

| Function | File:line | Purpose (failure mode it defends) |
|----------|-----------|-----------------------------------|
| `sanitizeDraftForDisplay` | `resume-writer/agent.ts:589` | Strips template placeholders, LLM-artifact strings before DB write |
| `sanitizeDisplayText` | `resume-writer/agent.ts:758` | Per-field sanitization helper |
| `deriveSelectedAccomplishmentTargets` | `resume-writer/agent.ts:1323` | Computes targets when the writer output is thin |
| `mergeSelectedAccomplishmentTargets` | `resume-writer/agent.ts:1392` | Reconciles writer output with deterministic targets |
| `ensureMinimumBulletCounts` | `resume-writer/agent.ts:1508` | Backfills bullets from source when writer returns too few |
| `ensureBulletMetadata` | `resume-writer/agent.ts:2412` | Fills in missing `is_new`, `source`, `confidence` fields when writer drops them |
| `ensureAllPositionsPresent` | `resume-writer/agent.ts:2621` | Re-attaches positions the writer dropped |
| `ensureRelevantPositionsRemainDetailed` | `resume-writer/agent.ts:2672` | Prevents primary-weight roles from losing their bullets |
| `trimConcatenationArtifacts` | `resume-writer/agent.ts:2731` | Detects "sentence. and then another" concat patterns and splits or trims |
| `deduplicateWithinRole` | `resume-writer/agent.ts:2808` | Removes near-duplicate bullets the writer emitted in a single role |
| `ensureDatePopulation` | `resume-writer/agent.ts:2840` | Fills in dates when writer output them as "undefined" or blank |
| `derivePositionLayoutPlan` | `resume-writer/agent.ts:2919` | Enforces position-emphasis layout per strategy |
| `derivePositionPrioritySignals` | `resume-writer/agent.ts:2977` | Signals primary/secondary/brief from gap analysis when strategy is missing |
| `deriveSourceBackedDiscipline` | `resume-writer/agent.ts:3270` | **The "manufacturing operations" regex** — maps resume text to discipline (the v3 rebuild's origin story) |
| `ensureSentence` | `resume-writer/agent.ts:3306` | Forces a trailing period, capitalizes first letter |
| `coerceContentOrigin` | `resume-writer/agent.ts:3323` | Normalizes the `source` field |

Plus in `assembly/agent.ts`:
- `applyToneFixes` (lines 72-126) — applies executive-tone's findings to body text
- `applyTruthGate` (lines 141-294) — demotes unverified claims to "confirm_fit" or "code_red" review state
- `applyPresentationSafety` (lines 296-352) — final sanitization before render

And in `section-writer.ts` (post-processing inside the summary parse function):
- Pipe/slash stripping (line 233-246)
- Repeated-metric deduplication (line 249-266)
- Word-count floor check (line 275-279)
- Fallback to deterministic summary from candidate quantified_outcomes (line 332-336)

**Every guardrail exists because a prompt produces something wrong.** Mapping:

| Guardrail | What the prompt fails at |
|-----------|-------------------------|
| `ensureMinimumBulletCounts` | Writer returns too few bullets |
| `ensureBulletMetadata` | Writer drops `is_new` / `source` / `confidence` |
| `trimConcatenationArtifacts` | Writer emits "sentence. and then another" concat |
| `deduplicateWithinRole` | Writer repeats the same accomplishment as two bullets |
| `ensureDatePopulation` | Writer serializes missing dates as `"undefined"` |
| `deriveSourceBackedDiscipline` | Writer's discipline string is wrong or generic |
| `ensureAllPositionsPresent` | Writer drops positions entirely |
| Pipe/slash stripping | Writer returns "Leader \| Domain. Summary text" format |
| Repeated-metric dedup | Writer mentions the same dollar figure twice |
| `applyTruthGate` | Writer emits fabricated claims that truth-verification caught |

v3's architectural thesis is that all of these can be eliminated by fixing the upstream prompt. The v2 code is a shopping list of things v3's prompts must preempt.

---

## Section 6 — Recommendations for v3

Based on the inventory, here are proposals for the Phase 3.5 port work. These are recommendations, not decisions — review with John before committing.

### 6a. Prompts to inspire v3 directly

| v2 prompt | v3 target | How to use v2 |
|-----------|-----------|---------------|
| `candidate-intelligence/SYSTEM_PROMPT` | `classify.v1.md` | Already covered; v1.2 is solid. Port the PHANTOM EXPERIENCE FILTERING examples as additional Rule-1 examples. |
| `gap-analysis/SYSTEM_PROMPT` | `strategize.v1.md` | Borrow the INFERRED METRIC RULE (10-20% back-off, `inferred_metric` label) into strategize Rule 3 (objections). v3 currently doesn't handle metric inference explicitly; gap-analysis's discipline is worth porting. |
| `narrative-strategy/SYSTEM_PROMPT` | `strategize.v1.md` | Port the 5-LAYER NARRATIVE SCAFFOLDING as optional additional guidance to supplement Rule 2 (positioning frame). Keep the "2-3 word brand essence" vocabulary. Add AGE-PROOFING rules to v3's Rule 6 (notes). |
| `section-writer/SUMMARY_SYSTEM` | `write-summary.v1.md` | Borrow the STEP 1-4 workflow (Extract voice → Identify job's top need → Write → Self-critique). Borrow the inline BUZZWORD TEST list. Borrow the HARD CONSTRAINTS including the "no name-led third-person narrator" rule (fixture-Rose precedent). |
| `section-writer/ACCOMPLISHMENTS_SYSTEM` | `write-accomplishments.v1.md` | Expand v3's output schema to include `is_new`, `source`, `requirement_source`, `evidence_found`, `confidence` per bullet. This is v2's richest evidence-tracking — v3 verify can't do its job without it. |
| `section-writer/COMPETENCIES_SYSTEM` | `write-competencies.v1.md` | **Revisit v3's ban on executive soft skills.** v2 explicitly includes them. The fixture corpus classifier (`classify.v1.md` Rule 12) also bans soft skills in `skills`, but competencies and skills are different sections. Align v3's competencies prompt with v2's policy: allow strategic soft skills at executive level. |
| `section-writer/EXPERIENCE_SYSTEM` | `write-position.v1.md` | Port the 4 story formats (TRANSFORMATION, GROWTH, RECOVERY, IMPACT) with examples. Port the PREFERRED VERBS + BANNED LANGUAGE lists. Port the SECTION BOUNDARIES block (no certs/skills/education in bullets — explicit defense against the education-blob bug). Port the identity-lock parse behavior. |
| `section-writer/CUSTOM_SECTIONS_SYSTEM` | NEW v3 stage OR schema addition | v3 currently has no custom-sections equivalent. Decision point: either add `customSections: [{id, lines: string[]}]` to `WrittenResume` with a matching write-customs prompt, or push this into Phase 5. |
| `truth-verification/SYSTEM_PROMPT` | `verify.v1.md` | Already covered; v3's 9-check list is more rigorous. Consider porting the 4-tier `verified/plausible/unverified/fabricated` confidence scale alongside v3's binary passed. |
| `executive-tone/SYSTEM_PROMPT` | NEW v3 verify check OR new stage | v3 verify doesn't cover the full tone taxonomy (junior_language, gerund_chain, self_assessment, abstract_nouns). Adding these as verify warnings (not errors) would preserve the value without a new stage. |

### 6b. Patterns that are DeepSeek-on-Vertex-specific and must carry forward

- **`response_format: { type: 'json_object' }`** on every call. Missing from v3 today (Anthropic provider doesn't honor it). When routing to Vertex, re-add it.
- **`RETRY_SYSTEM`** second-attempt pattern. v3 currently throws on first JSON parse failure; for DeepSeek that's too strict. Add a retry path with the strict-extraction system prompt.
- **`JSON_RULES`** inline on every writer prompt. v3's write-summary/accomplishments/competencies/position prompts need the strict first-character-is-`{`/last-is-`}` rule spelled out.
- **Truncation retry** via `chatWithTruncationRetry`. DeepSeek hits `max_tokens` more often than Opus; add a bump-and-retry on `finish_reason: 'length'`.
- **`repairJSON`** light-touch parser. v3 currently uses `JSON.parse` directly. For DeepSeek, using `repairJSON` to handle trailing-comma/comment quirks is mechanical (not semantic repair) and acceptable under OPERATING-MANUAL.md. Classify's strict parse stays if Opus is ever used; write's relaxed parse mirrors v2.

### 6c. Patterns that were v2-era workarounds and should NOT carry forward

- **`_SYSTEM_PROMPT` monolithic writer** — confirmed dead code in v2. Do not port.
- **`filterPhantomExperience` and similar guardrails** — v3's classify.v1.2 prevents the source failure modes; these guardrails are redundant. v3's Phase 4 write stage must not re-introduce them.
- **`deriveSourceBackedDiscipline` (the manufacturing-operations regex)** — already excluded per doc 05. v3's discipline field is LLM-generated (classify Rule 5).
- **`source-resume-outline.ts` deterministic parser** — replaced wholesale by classify.
- **Dual parse reconciliation** (candidate-intelligence + source-resume-outline) — v3 has one source of truth (classify).

### 6d. How should v3 handle the Vertex system-merge requirement?

Two options:

**A. Transparent (loader-level)** — v3's prompt loader detects when the routed provider is Vertex and auto-merges the system prompt into the first user message. Prompts stay written with `# System` / `# User message template` structure; the loader does the work.

**B. Explicit (prompt-level)** — prompt YAML frontmatter carries a `vertex_merge: true` flag and the prompt authors know they're targeting a provider that requires merging.

**Recommendation: A (transparent).** The system-prompt-merge is a provider quirk, not a semantic decision. v2's VertexProvider already handles it transparently at the provider layer; v3's equivalent provider-factory should do the same. Prompt authors should not need to know which provider they're targeting — the prompt text stays format-agnostic and the adapter handles provider-specific framing.

One caveat: when the merge fires, the first user message becomes huge. If v3's classify prompt (17K tokens system + 6K tokens resume = 23K tokens) is routed to Vertex, the merged first message is 23K+ tokens in one field. This IS supported by Vertex (>100K input-token capacity on DeepSeek V3.2) but it's worth logging the merge + total user-token count at INFO level so we can spot-check.

### 6e. Capability-request routing

Rather than pinning each stage to a specific model, v3 stages should declare a capability and let the provider factory resolve it per environment. Proposed capability vocabulary:

| Capability | Today's resolution (env → model) | Stages that want it |
|-----------|----------------------------------|---------------------|
| `strong-reasoning` | vertex=deepseek-v3.2-maas, anthropic=claude-opus-4-7 | classify, strategize, verify |
| `fast-writer` | vertex=deepseek-v3.2-maas, anthropic=claude-sonnet-4-6 | write-summary/accomplishments/competencies/position |

Two capabilities are enough for Phase 5. If we later want separate "factual extraction" vs "creative generation" capabilities we can split. Keeping it at two means the factory is a small function.

Env-variable control:
- `V3_STRONG_REASONING_MODEL` + `V3_STRONG_REASONING_PROVIDER` (optional override)
- `V3_FAST_WRITER_MODEL` + `V3_FAST_WRITER_PROVIDER` (optional override)
- Absent overrides, factory picks based on `LLM_PROVIDER` env the same way v2's model-constants.ts does.

### 6f. Sequencing for the port

1. **Provider factory + capability routing** — one small refactor to `server/src/v3/` that adds a `getProvider(capability)` function. All five stages call it instead of constructing `AnthropicProvider` directly.
2. **Prompt YAML `capability:` frontmatter** — replace `model:` in each prompt with `capability:`. Loader resolves via the factory.
3. **Port v2 defensive patterns into v3 prompts** — JSON_RULES, RETRY_SYSTEM, banned-language lists, identity-lock parse behavior. Update write/index.ts to use RETRY_SYSTEM on JSON parse failure.
4. **Add `response_format`, `chatWithTruncationRetry`, `repairJSON` to v3's write/index.ts pipeline** — these are DeepSeek-defensive and mechanical.
5. **Re-run full 19-fixture corpus against DeepSeek-on-Vertex** — compare to the Opus reference snapshot committed under the `v3-phase4-opus-prototype` tag. Iterate prompts on divergence.
6. **Evidence-tracking schema enrichment** — add `is_new`, `source`, `evidence_found`, `confidence` to WrittenResume's accomplishments/positions bullets. This is schema work, not prompt work; do after step 5 so we don't change the target while iterating.

---

## Section 7 — Surprises and inconsistencies

- **`_SYSTEM_PROMPT` at `resume-writer/agent.ts:91` is dead code.** Single hit in grep; no caller. The underscore prefix and the section-writer.ts header comment confirm it's vestigial. Do not port from it.
- **Custom sections have no v3 equivalent.** `section-planning.ts` generates 4 custom section types (AI, Transformation, Projects, Board). `CUSTOM_SECTIONS_SYSTEM` writes them. v3's `WrittenResume` has no field for these. Decision needed: add to schema or defer to Phase 5.
- **Two overlapping pronoun rules.** `SUMMARY_SYSTEM` says "no pronouns ever" (HARD CONSTRAINTS block). v3's classify Rule 6 says "pronoun inferred from first name, else null". These are consistent in spirit: when pronoun is null, writers default to active voice. But v2's summary prompt is more aggressive — no pronouns even when inferable. v3 may want to adopt the stricter summary-level rule.
- **Competencies section includes executive soft skills in v2 but not v3.** v2 explicitly lists "Cross-Functional Collaboration, Executive Stakeholder Communication, Change Management, Strategic Planning" as acceptable; v3's `write-competencies.v1.md` explicitly bans "Generic soft skills". Decision: align v3 with v2 on this. Soft skills are executive-level signal at this seniority; banning them was an over-correction from the classify Rule 12 intent.
- **`JSON_RULES` appears at end of writer prompts, not start.** Some prompts put JSON-output instructions at the top; v2 writers put them at the bottom. This is stylistic but consistent across v2's five section writers. v3 can keep its current top-placement.
- **v2's banned-language lists are scattered.** `SUMMARY_SYSTEM` has its own list inline, `EXPERIENCE_SYSTEM` has another, `knowledge/resume-rules.ts:270-291` has a third (used by the tone agent). They overlap but aren't identical. Consolidation opportunity.
- **Truth Verification outputs percentage, Verify outputs binary.** v2's `truth_score` is (verified+plausible)/total × 100. v3's `verify.v1.md` is `passed: boolean`. Both have issues/warnings lists. Percentage score is a useful additional signal; consider adding `truth_score` alongside `passed` in v3.
- **The `scope_statement_is_new` optional flag.** v2's experience writer output has `scope_statement_source`, `scope_statement_confidence`, `scope_statement_evidence_found`, and an optional `scope_statement_is_new`. The scope statement is a first-class field with the same evidence-tracking as bullets. v3 has `scope?: string` on `WrittenPosition` — just a plain optional string. Port the richer shape if evidence tracking matters.
- **`EXPERIENCE_SYSTEM` per-position timeout is 90 seconds.** v3's AnthropicProvider stream timeout is 300 seconds (5 minutes). For Vertex (90s stream timeout), a single per-position call running close to the limit is a risk. Phase 4 pilot ran 9.5s for the slowest position; Vertex would likely be faster (DeepSeek is fast on Vertex). Worth monitoring.
- **Dead import in `section-writer.ts:25`:** `import { chatWithTruncationRetry as _chatWithTruncationRetry } from '../../../lib/llm-retry.js';` — imported with alias, used once at line 29-34 inside the `chatWithRetry` wrapper. Not technically dead, but the alias is curious.
- **Env-var priority order for `resumeV2Llm` prefers Vertex even when DeepInfra key is present.** (`model-constants.ts:99-114`) This is intentional per the comment "Vertex (fastest — 207 tok/s output)". v3 should do the same.
- **One prompt mentions a specific customer persona.** `narrative-strategy/SYSTEM_PROMPT` line ~130: "AGE-PROOFING (critical for 45-60)". v3 is building for a specific demographic; the fact that v2 makes that explicit in a prompt is a signal that our target market's concerns should surface in prompts, not just in code.

---

## Summary

- **Total v2 prompts inventoried:** 14 (9 stage agents + 5 section writers). All under 7K tokens individually.
- **Total v2 prompt tokens:** ≈50K.
- **Model routing in v2:** 9 stages on global `llm` (Groq Scout in production); 1 stage (resume-writer) on `writerLlm` (Vertex → DeepInfra → DeepSeek direct).
- **17 guardrail/defensive functions** in `resume-writer/agent.ts`; each maps to a specific prompt failure mode that v3's cleaner classify output should eliminate.
- **7 shared knowledge constants** in `knowledge/resume-rules.ts` (SOURCE_DISCIPLINE, BANNED_PHRASES, WRITING_RULES, GUARDRAILS, QUALITY_GATES, SECTION_RULES, `getResumeRulesPrompt()` composer).
- **Biggest port target:** `section-writer/EXPERIENCE_SYSTEM` — the four story formats, banned-language list, and identity-lock parse behavior all inform v3's `write-position.v1.md`.
- **Biggest architectural decision surfaced:** whether v3's `WrittenResume` schema adopts v2's richer per-bullet evidence tracking (`is_new`, `source`, `evidence_found`, `confidence`). Affects every write prompt and every verify check.

**Recommended next step:** John reviews this document and scopes the combined provider refactor + prompt port task. Claude Code does not begin the port work until direction lands.
