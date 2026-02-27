# Conventions — Resume Agent

## TypeScript

- **Strict mode** enabled in both `app/tsconfig.json` and `server/tsconfig.json`.
- Both `app/` and `server/` must pass `npx tsc --noEmit`. This is the primary CI gate.
- Avoid `any` — use type guards, `unknown`, or explicit types instead. Only permitted when explicitly documented.
- No `eslint-disable` comments unless explicitly permitted for a specific case.

## Imports

- **Server**: Use `.js` extensions for all local imports (ESM requirement).
  ```ts
  import { something } from './my-module.js';
  ```
- **App**: Use `@/` path alias for imports.
  ```ts
  import { cn } from '@/lib/utils';
  ```

## Naming

| What | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `agent-loop.ts`, `pipeline-responder.ts` |
| Functions | camelCase | `waitForUser()`, `buildCraftsmanMessage()` |
| Constants | SCREAMING_SNAKE_CASE | `MODEL_PRIMARY`, `STALE_PIPELINE_MS` |
| React components | PascalCase | `SectionWorkbench`, `BlueprintReviewPanel` |
| Types/Interfaces | PascalCase | `PipelineState`, `AgentMessage` |
| Enum-like objects | SCREAMING_SNAKE_CASE keys | `{ INTAKE: 'intake', RESEARCH: 'research' }` |
| CSS classes | Tailwind utilities | Use `cn()` for conditional merging |

No abbreviations unless they are project-standard (SSE, LLM, RLS, ATS, JD, ADR).

## Error Handling

- Every external call (LLM API, Supabase, file I/O) wrapped in `try/catch`.
- Error message extraction pattern:
  ```ts
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, `Description: ${message}`);
  }
  ```
- Always use `finally` for cleanup (clearing timeouts, removing listeners, releasing locks).
- Pipeline wraps each stage in try/catch and emits `pipeline_error` events. Never throw from SSE handlers.
- LLM calls use `withRetry()` wrapper for resilience against Z.AI timeouts.
- Abort signals: use `createCombinedAbortSignal(userSignal, timeoutMs)` — never `AbortSignal.any` or `AbortSignal.timeout` directly.

## React / Frontend

- **Functional components only** — no class components.
- **Hooks** for state and side effects (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`).
- **Glass morphism** design system: use `GlassCard`, `GlassButton`, `GlassInput` components.
- **Class merging**: always use `cn()` from `@/lib/utils` for conditional Tailwind classes.
- **Panel components**: one per file in `app/src/components/panels/`, dispatched by `panel-renderer.tsx`.
- **PanelErrorBoundary**: wraps every panel for graceful error handling.
- **SSE state**: managed by `usePipeline.ts` hook; `sectionContextRef` for section context enrichment.

## Agent Tools

Agent tools are typed objects with this shape:
```ts
{
  name: string;
  description: string;
  input_schema: JSONSchema;
  execute: (input: T, context: AgentContext) => Promise<string>;
}
```
Tools wrap existing pipeline functions. The LLM sees the schema; `execute` runs when called.

## Model Routing

Use `getModelForTool(toolName)` in `llm.ts` to route tools to cost-appropriate tiers. Never hardcode model names in tool implementations.

## Pipeline Gates

- `waitForUser(gateName)` pauses the pipeline.
- Frontend responds via `POST /api/pipeline/respond`.
- **Never send `undefined` as a gate response.** Send `true` for simple approvals.
- Gate responses: `true` (approve), `{ approved: false, feedback }` (request changes), `{ approved: false, edited_content }` (direct edit).

## Testing

- **Unit tests**: Vitest. Server tests in `server/src/**/*.test.ts`, app tests in `app/src/**/*.test.ts`.
- **E2E tests**: Playwright. Tests in `e2e/tests/`, helpers in `e2e/helpers/`, fixtures in `e2e/fixtures/`.
- **E2E interaction**: Use `page.evaluate()` for DOM-direct access in zero-height panel layouts. Playwright's `fill()` doesn't reliably trigger React onChange in these contexts.
- **CI gate**: `tsc --noEmit` on both app and server.

## Git

- Commit message format for sprint work: `[SPRINT-X][STORY-NAME] Brief description of change`
- Descriptive messages for non-sprint work.
- `Co-Authored-By: Claude <noreply@anthropic.com>` for AI-assisted commits.
- Never force-push to main.
- Never skip hooks (`--no-verify`).

## Dependencies

- Every new dependency requires an ADR in `docs/DECISIONS.md` documenting why it was added.
- Prefer existing utilities before adding new packages.

## JSON from LLMs

- LLM responses often contain malformed JSON — always use `json-repair.ts` for parsing.
- Z.AI sometimes returns objects where strings are expected — add runtime coercion where needed.

## Feature Flags

- Defined in `server/src/lib/feature-flags.ts`.
- Gate-controlling flags: `FF_INTAKE_QUIZ`, `FF_RESEARCH_VALIDATION`, `FF_GAP_ANALYSIS_QUIZ`, `FF_QUALITY_REVIEW_APPROVAL`, `FF_BLUEPRINT_APPROVAL`.
- All default to `true`. Skipped in `fast_draft` workflow mode.
