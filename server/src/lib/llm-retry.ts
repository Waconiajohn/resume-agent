/**
 * Truncation-safe LLM call wrapper.
 *
 * When an LLM call hits max_tokens and the output is truncated
 * (finish_reason === 'length'), this wrapper automatically retries
 * with double the token budget. This prevents corrupted JSON from
 * repairJSON closing truncated strings mid-word.
 *
 * Root cause context: Groq/Llama truncates JSON mid-word at max_tokens.
 * repairJSON recovers the structure but the truncated text becomes
 * garbage content (e.g., "d knowledge of products" from "Applied
 * knowledge of products"). Detecting and retrying is the proper fix.
 */

import { llm } from './llm.js';
import type { LLMProvider, ChatParams, ChatResponse } from './llm-provider.js';
import logger from './logger.js';

/**
 * Call llm.chat with automatic retry on truncation.
 *
 * If the response has finish_reason === 'length' (output truncated at max_tokens),
 * retries once with double the max_tokens budget.
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
  const response = await provider.chat(params);

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
