/**
 * Semantic similarity via OpenAI embeddings.
 *
 * Embeds text into vectors and computes cosine similarity for
 * resume-to-JD requirement matching. Uses text-embedding-3-small
 * at $0.02/1M tokens (~$0.0004 per pipeline run of ~80 sentences).
 *
 * Integration: called by gap-analysis to augment keyword-based scoring
 * with semantic understanding. "Kubernetes expertise" now matches
 * "container orchestration at scale" even without shared keywords.
 */

import OpenAI from 'openai';
import logger from './logger.js';

// ─── Configuration ──────────────────────────────────────────────────

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 512; // Reduced from 1536 for faster cosine math, <2% quality loss

/** Thresholds derived from resume matching research (Resume2Vec, ConFit v2) */
export const SIMILARITY_THRESHOLDS = {
  strong: 0.80,
  partial: 0.70,
} as const;

// ─── Client ─────────────────────────────────────────────────────────

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OpenAI_API_KEY;
  if (!apiKey) {
    logger.warn('No OpenAI API key found — semantic matching disabled, falling back to keyword matching');
    return null;
  }
  client = new OpenAI({ apiKey });
  return client;
}

// ─── Core API ───────────────────────────────────────────────────────

/**
 * Embed a batch of texts into vectors. Returns null if the API is unavailable.
 * All texts are embedded in a single API call for efficiency.
 */
export async function embedBatch(texts: string[]): Promise<number[][] | null> {
  const openai = getClient();
  if (!openai || texts.length === 0) return null;

  if (texts.length > 2048) {
    logger.warn({ count: texts.length }, 'Embedding batch exceeds API limit of 2048 — truncating');
  }
  const batch = texts.length > 2048 ? texts.slice(0, 2048) : texts;

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Embeddings API call failed — falling back to keyword matching',
    );
    return null;
  }
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Compute a similarity matrix between requirements and evidence.
 * Returns null if embeddings are unavailable.
 *
 * Result: similarityMatrix[requirementIndex][evidenceIndex] = cosine similarity score
 */
export async function computeSimilarityMatrix(
  requirements: string[],
  evidence: string[],
): Promise<number[][] | null> {
  if (requirements.length === 0 || evidence.length === 0) return null;

  const allTexts = [...requirements, ...evidence];
  const embeddings = await embedBatch(allTexts);
  if (!embeddings) return null;

  const requirementEmbeddings = embeddings.slice(0, requirements.length);
  const evidenceEmbeddings = embeddings.slice(requirements.length);

  const matrix: number[][] = [];
  for (const reqEmb of requirementEmbeddings) {
    const row: number[] = [];
    for (const evEmb of evidenceEmbeddings) {
      row.push(cosineSimilarity(reqEmb, evEmb));
    }
    matrix.push(row);
  }

  logger.info(
    { requirements: requirements.length, evidence: evidence.length, model: EMBEDDING_MODEL },
    'Semantic similarity matrix computed',
  );

  return matrix;
}

/**
 * Find the best semantic match for a requirement against evidence corpus.
 * Returns the best score and matching evidence texts.
 */
export function findBestMatches(
  requirementIndex: number,
  matrix: number[][],
  evidenceTexts: string[],
  limit = 3,
): Array<{ text: string; score: number }> {
  const row = matrix[requirementIndex];
  if (!row) return [];

  return row
    .map((score, evidenceIndex) => ({ text: evidenceTexts[evidenceIndex], score }))
    .filter((item) => item.score >= SIMILARITY_THRESHOLDS.partial)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
