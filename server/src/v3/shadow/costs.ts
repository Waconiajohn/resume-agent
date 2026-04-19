// Per-stage cost computation for v3 shadow runs.
//
// Used by the shadow worker to populate `v3_stage_costs_json` in
// resume_v3_shadow_runs. Pricing mirrors server/scripts/pipeline-fixtures.mjs
// (the fixture runner) so shadow-deploy cost math compares directly to
// Phase 4.10-4.13 validation numbers.

export interface ModelPricing {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

const PRICING: Record<string, ModelPricing> = {
  'deepseek-ai/deepseek-v3.2-maas': { input: 0.14, output: 0.28 },
  'deepseek-ai/DeepSeek-V3.2': { input: 0.14, output: 0.28 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-5': { input: 5.0, output: 15.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
};

/** Strip OpenAI date-suffix variants (e.g. gpt-4.1-2025-04-14 → gpt-4.1). */
function resolveModelKey(model: string): string | null {
  if (PRICING[model]) return model;
  // OpenAI dated variants: gpt-X-YYYY-MM-DD
  const stripped = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  if (PRICING[stripped]) return stripped;
  return null;
}

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const key = resolveModelKey(model);
  if (!key) return 0;
  const p = PRICING[key]!;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}
