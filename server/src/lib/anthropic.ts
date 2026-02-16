import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

export const anthropic = new Anthropic({ apiKey });
export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';
export const MAX_TOKENS = parseInt(process.env.MAX_TOKENS ?? '8192', 10);

/**
 * Extract the text content from the first text block in an Anthropic API response.
 * Returns an empty string if no text block is found.
 */
export function extractResponseText(response: Anthropic.Message): string {
  const firstBlock = response.content[0];
  return firstBlock?.type === 'text' ? firstBlock.text : '';
}
