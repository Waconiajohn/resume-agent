import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

export const anthropic = new Anthropic({ apiKey });
export const MODEL = 'claude-sonnet-4-5-20250929';
export const MAX_TOKENS = 8192;
