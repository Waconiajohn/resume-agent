import { anthropic, MODEL as CLAUDE_MODEL, extractResponseText } from './anthropic.js';
import { createSessionLogger } from './logger.js';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';
const MODEL = 'sonar-pro';

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  choices: Array<{
    message: { content: string; role: string };
  }>;
}

export async function queryPerplexity(
  messages: PerplexityMessage[],
  options?: { temperature?: number; max_tokens?: number },
): Promise<string> {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY environment variable is required');
  }

  const response = await fetch(PERPLEXITY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.max_tokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as PerplexityResponse;
  return data.choices[0]?.message?.content ?? '';
}

/**
 * Query Perplexity for research, falling back to Claude if Perplexity is unavailable.
 * Consolidates the try-Perplexity/catch-use-Claude pattern used by research tools.
 */
export async function queryWithFallback(
  sessionId: string,
  messages: PerplexityMessage[],
  claudeOptions?: { system?: string; prompt: string },
): Promise<string> {
  try {
    return await queryPerplexity(messages);
  } catch (error) {
    const log = createSessionLogger(sessionId);
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Perplexity API unavailable, falling back to Claude',
    );
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      ...(claudeOptions?.system ? { system: claudeOptions.system } : {}),
      messages: [{ role: 'user', content: claudeOptions?.prompt ?? messages[messages.length - 1].content }],
    });
    return extractResponseText(response);
  }
}
