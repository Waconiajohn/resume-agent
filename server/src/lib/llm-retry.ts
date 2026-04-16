/**
 * Truncation-safe LLM call wrapper with 429 rate-limit retry.
 *
 * When an LLM call hits max_tokens and the output is truncated
 * (finish_reason === 'length'), this wrapper automatically retries
 * with double the token budget. This prevents corrupted JSON from
 * repairJSON closing truncated strings mid-word.
 *
 * When a provider returns HTTP 429 (rate limited), retries up to 3 times
 * with exponential backoff (3s, 6s, 12s) before throwing. This applies
 * to all providers — Vertex, DeepSeek, Groq, etc.
 *
 * Root cause context: Groq/Llama truncates JSON mid-word at max_tokens.
 * repairJSON recovers the structure but the truncated text becomes
 * garbage content (e.g., "d knowledge of products" from "Applied
 * knowledge of products"). Detecting and retrying is the proper fix.
 */

import { llm } from './llm.js';
import type { LLMProvider, ChatParams, ChatResponse } from './llm-provider.js';
import { isRateLimitError } from './llm-provider.js';
import logger from './logger.js';

/** Exponential backoff delays for 429 retry (3s, 6s, 12s). */
const RATE_LIMIT_BACKOFF_MS = [3_000, 6_000, 12_000];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call llm.chat with automatic retry on truncation and 429 rate limiting.
 *
 * 429 handling: If the provider returns HTTP 429, waits with exponential
 * backoff (3s, 6s, 12s) and retries up to 3 times before throwing.
 *
 * Truncation handling: If the response has finish_reason === 'length'
 * (output truncated at max_tokens), retries once with double the max_tokens budget.
 *
 * @param params - Standard ChatParams
 * @param options - Optional: retryMaxTokens override (default: 2x original),
 *                  optional provider override (default: global llm)
 * @returns ChatResponse from either the original or retry call
 */
export async function chatWithTruncationRetry(
  params: ChatParams,
  options?: { retryMaxTokens?: number; provider?: LLMProvider },
): Promise<ChatResponse> {
  const provider = options?.provider ?? llm;

  // Phase 1: Attempt call with 429 exponential backoff retry
  let response: ChatResponse;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await provider.chat(params);
      break;
    } catch (err) {
      if (isRateLimitError(err) && attempt < RATE_LIMIT_BACKOFF_MS.length) {
        const delayMs = RATE_LIMIT_BACKOFF_MS[attempt];
        logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: RATE_LIMIT_BACKOFF_MS.length,
            delayMs,
            model: params.model,
            provider: provider.name,
          },
          'Rate limited (429) — retrying with exponential backoff',
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }

  // Phase 2: Truncation retry (existing logic)
  if (response.finish_reason === 'length') {
    const originalMax = params.max_tokens;
    const retryMax = options?.retryMaxTokens ?? originalMax * 2;

    logger.warn(
      {
        output_tokens: response.usage.output_tokens,
        original_max_tokens: originalMax,
        retry_max_tokens: retryMax,
        model: params.model,
      },
      'LLM output truncated at max_tokens — retrying with higher limit',
    );

    const retryResponse = await provider.chat({
      ...params,
      max_tokens: retryMax,
    });

    if (retryResponse.finish_reason === 'length') {
      logger.error(
        {
          output_tokens: retryResponse.usage.output_tokens,
          retry_max_tokens: retryMax,
          model: params.model,
        },
        'LLM output still truncated after retry — output may contain corrupted content',
      );
    }

    return retryResponse;
  }

  return response;
}
