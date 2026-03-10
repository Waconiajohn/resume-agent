/**
 * Virtual Coach Tool — estimate_task_cost
 *
 * Pure lookup — no LLM call, no DB query. Returns the historical average
 * pipeline cost for a given product and compares it against the client's
 * remaining daily budget.
 *
 * Call this BEFORE dispatch_pipeline to give the client cost transparency
 * and confirm the budget can support the recommended action.
 */

import type { CoachTool } from '../types.js';

// ─── Cost table ────────────────────────────────────────────────────

/**
 * Historical average LLM cost per completed pipeline run.
 * Updated manually based on observed metrics (Groq provider, ~$0.08/pipeline
 * at base; these reflect full product end-to-end costs).
 *
 * Source: MEMORY.md pipeline cost estimates + sprint metrics.
 */
const PRODUCT_COST_ESTIMATES: Record<string, number> = {
  resume: 0.23,
  cover_letter: 0.05,
  linkedin_editor: 0.08,
  linkedin_content: 0.06,
  interview_prep: 0.12,
  mock_interview: 0.15,
  salary_negotiation: 0.10,
  networking_outreach: 0.06,
  executive_bio: 0.05,
  case_study: 0.08,
  thank_you_note: 0.03,
  ninety_day_plan: 0.08,
  personal_brand: 0.06,
  onboarding: 0.01,
  job_finder: 0.05,
  job_tracker: 0.01,
  retirement_bridge: 0.10,
};

/** Fallback cost when a product is not in the table */
const DEFAULT_COST_USD = 0.10;

// ─── Tool ──────────────────────────────────────────────────────────

const estimateTaskCostTool: CoachTool = {
  name: 'estimate_task_cost',
  description:
    'Estimate the AI cost of running a specific product pipeline and check whether the client\'s ' +
    'daily budget can afford it. Returns the estimated cost in USD, remaining budget, and a ' +
    'plain-language note. Call this BEFORE dispatch_pipeline to ensure cost transparency and avoid ' +
    'sending the client into a pipeline they cannot afford to complete.',
  model_tier: undefined, // Pure lookup — no LLM call
  input_schema: {
    type: 'object',
    properties: {
      product: {
        type: 'string',
        description:
          'The product domain to estimate (e.g., "resume", "cover_letter", "linkedin_editor", ' +
          '"interview_prep", "salary_negotiation")',
      },
    },
    required: ['product'],
  },

  async execute(input, ctx) {
    const product = String(input.product ?? '').trim();

    if (!product) {
      return JSON.stringify({ error: 'Product domain is required' });
    }

    const state = ctx.getState();
    const budget = state.budget;

    const estimatedCost = PRODUCT_COST_ESTIMATES[product] ?? DEFAULT_COST_USD;
    const remainingBudget = budget?.remaining_daily_usd ?? 5.0;
    const canAfford = remainingBudget >= estimatedCost;
    const budgetAfter = canAfford ? +(remainingBudget - estimatedCost).toFixed(4) : remainingBudget;

    const note = canAfford
      ? `Budget OK — estimated $${estimatedCost.toFixed(2)}, $${remainingBudget.toFixed(2)} remaining after this run.`
      : `Budget low — estimated $${estimatedCost.toFixed(2)} but only $${remainingBudget.toFixed(2)} remaining. Consider waiting until the daily reset.`;

    const knownProduct = product in PRODUCT_COST_ESTIMATES;

    return JSON.stringify({
      product,
      estimated_cost_usd: estimatedCost,
      is_estimate: !knownProduct,
      remaining_daily_budget_usd: remainingBudget,
      can_afford: canAfford,
      budget_after_dispatch_usd: budgetAfter,
      note,
    });
  },
};

export { estimateTaskCostTool };
