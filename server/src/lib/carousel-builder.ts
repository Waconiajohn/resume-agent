/**
 * Carousel Builder — converts a LinkedIn post into structured multi-slide carousel data.
 *
 * LinkedIn document carousels (PDF posts) outperform text posts on reach because
 * the platform promotes content that keeps users swiping. This module takes a
 * finalized post text and splits it into a structured cover + content + CTA slide
 * sequence optimized for that format.
 *
 * Target: 8-12 content slides between the cover and CTA (10-14 total).
 * Copy target: presentation-style microcopy, not paragraphs on slides.
 */

export interface CarouselSlide {
  type: 'cover' | 'content' | 'cta';
  headline: string;
  body?: string;
  bulletPoints?: string[];
  slideNumber: number;
  totalSlides: number;
}

export interface CarouselOptions {
  /** Target number of slides (default: aim for 8-12 content slides). Actual count may vary. */
  slideCount?: number;
  /** If this post is part of a series, include series metadata for the cover slide. */
  seriesInfo?: { part: number; total: number; title: string };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const CONTENT_HEADLINE_MAX_WORDS = 7;
const CONTENT_HEADLINE_MAX_CHARS = 52;
const CONTENT_BODY_MAX_WORDS = 8;
const CONTENT_BODY_MAX_CHARS = 56;
const CONTENT_BULLET_MAX_WORDS = 6;
const CONTENT_BULLET_MAX_CHARS = 44;
const COVER_BODY_MAX_WORDS = 12;
const COVER_BODY_MAX_CHARS = 80;
const CTA_BODY_MAX_WORDS = 8;
const CTA_BODY_MAX_CHARS = 60;

/**
 * Splits text on sentence boundaries (. ! ?) while preserving the delimiter.
 * Returns only non-empty trimmed sentences.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function truncateMicrocopy(text: string, maxWords: number, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const words = normalized.split(/\s+/);
  let result = '';
  for (const word of words) {
    const next = result ? `${result} ${word}` : word;
    if (next.length > maxChars || next.split(/\s+/).length > maxWords) break;
    result = next;
  }

  const trimmed = result || normalized.slice(0, maxChars).trim();
  return trimmed.replace(/[,:;.!?]+$/g, '');
}

/**
 * Merges adjacent short paragraphs until total count is within target range.
 * "Short" means fewer than 80 characters after trimming.
 */
function mergeShortParagraphs(paragraphs: string[], maxCount: number): string[] {
  const result: string[] = [...paragraphs];

  while (result.length > maxCount) {
    // Find the shortest adjacent pair and merge them
    let bestIndex = 0;
    let bestLen = Infinity;

    for (let i = 0; i < result.length - 1; i++) {
      const combined = result[i].length + result[i + 1].length;
      if (combined < bestLen) {
        bestLen = combined;
        bestIndex = i;
      }
    }

    const merged = `${result[bestIndex]} ${result[bestIndex + 1]}`;
    result.splice(bestIndex, 2, merged);
  }

  return result;
}

/**
 * Expands paragraphs by splitting on sentence boundaries until count reaches target.
 */
function expandParagraphs(paragraphs: string[], minCount: number): string[] {
  const result: string[] = [...paragraphs];

  // Split the longest paragraphs first until we reach the target
  let attempts = 0;
  while (result.length < minCount && attempts < 20) {
    attempts++;
    let longestIndex = 0;
    let longestLen = 0;

    for (let i = 0; i < result.length; i++) {
      if (result[i].length > longestLen) {
        longestLen = result[i].length;
        longestIndex = i;
      }
    }

    const sentences = splitSentences(result[longestIndex]);
    if (sentences.length < 2) {
      // Can't split this paragraph further; stop trying
      break;
    }

    // Split roughly in half
    const mid = Math.ceil(sentences.length / 2);
    const firstHalf = sentences.slice(0, mid).join(' ');
    const secondHalf = sentences.slice(mid).join(' ');

    result.splice(longestIndex, 1, firstHalf, secondHalf);
  }

  return result;
}

/**
 * Derives a short headline from a chunk of text.
 * Uses presentation-style microcopy so each slide can be read at a glance.
 */
function deriveHeadline(text: string): string {
  const sentences = splitSentences(text);
  const source = sentences[0] ?? text;
  return truncateMicrocopy(source, CONTENT_HEADLINE_MAX_WORDS, CONTENT_HEADLINE_MAX_CHARS);
}

/**
 * Converts a text chunk into 1-2 very short bullet points.
 * Carousel slides should carry the idea in a few words, not paragraphs.
 */
function chunkToBullets(text: string): string[] {
  const sentences = splitSentences(text);
  const source = sentences.length > 1 ? sentences.slice(1) : sentences;
  const seen = new Set<string>();

  return source
    .map((sentence) => truncateMicrocopy(sentence, CONTENT_BULLET_MAX_WORDS, CONTENT_BULLET_MAX_CHARS))
    .filter((bullet) => {
      const key = bullet.toLowerCase();
      if (!bullet || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Converts a finalized LinkedIn post into a structured carousel slide sequence.
 *
 * Slide structure:
 * - Slide 1: Cover — topic as headline, hook sentence as short body
 * - Slides 2..N-1: Content — one main idea per slide, usually a headline plus
 *   0-2 micro-bullets
 * - Slide N: CTA — follow prompt + hashtags
 *
 * The function targets 8-12 content slides between cover and CTA. With the
 * cover and CTA added the total is typically 10-14 slides.
 */
export function buildCarouselSlides(
  postText: string,
  topic: string,
  authorName: string,
  hashtags: string[],
  options?: CarouselOptions,
): CarouselSlide[] {
  const targetMin = 8;
  const targetMax = 12;

  // ── Cover slide ────────────────────────────────────────────────────────────
  const coverHeadline = options?.seriesInfo
    ? `Part ${options.seriesInfo.part} of ${options.seriesInfo.total}: ${options.seriesInfo.title}`
    : topic;

  const coverSubtitle = options?.seriesInfo ? topic : undefined;

  // Extract hook — first sentence of the post
  const allSentences = splitSentences(postText);
  const hookSentence = allSentences[0] ?? topic;

  // ── Split post body into chunks ────────────────────────────────────────────
  // Remove the hashtag block from the bottom before splitting
  const hashtagPattern = /(\n+#\w[\s#\w]*)?$/;
  const bodyText = postText.replace(hashtagPattern, '').trim();

  // Primary split: double newlines (paragraph breaks)
  let paragraphs = bodyText
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  // Adjust count toward target range
  if (paragraphs.length < targetMin) {
    paragraphs = expandParagraphs(paragraphs, targetMin);
  } else if (paragraphs.length > targetMax) {
    paragraphs = mergeShortParagraphs(paragraphs, targetMax);
  }

  // ── Build content slides ───────────────────────────────────────────────────
  const contentSlides: Omit<CarouselSlide, 'slideNumber' | 'totalSlides'>[] = paragraphs.map(
    (chunk) => {
      const headline = deriveHeadline(chunk);
      const sentences = splitSentences(chunk);

      const bullets = sentences.length >= 2 ? chunkToBullets(chunk) : [];

      if (bullets.length > 0) {
        return {
          type: 'content' as const,
          headline,
          bulletPoints: bullets,
        };
      }

      const body = truncateMicrocopy(chunk, CONTENT_BODY_MAX_WORDS, CONTENT_BODY_MAX_CHARS);
      const normalizedHeadline = headline.toLowerCase();
      const normalizedBody = body.toLowerCase();

      return {
        type: 'content' as const,
        headline,
        ...(body && normalizedBody !== normalizedHeadline ? { body } : {}),
      };
    },
  );

  // ── CTA slide ──────────────────────────────────────────────────────────────
  // Derive a short value proposition from the author name for the CTA headline
  const ctaHeadline = `Follow ${authorName} for more`;

  // Topic area for the follow prompt (first 40 chars of topic)
  const topicArea = topic.length > 40 ? topic.slice(0, 40) + '...' : topic;

  const ctaSlide: Omit<CarouselSlide, 'slideNumber' | 'totalSlides'> = {
    type: 'cta',
    headline: ctaHeadline,
    body: truncateMicrocopy(`Follow for more insights on ${topicArea}`, CTA_BODY_MAX_WORDS, CTA_BODY_MAX_CHARS),
    bulletPoints: hashtags.length > 0 ? hashtags : undefined,
  };

  // ── Assemble and number all slides ────────────────────────────────────────
  const allSlides: Omit<CarouselSlide, 'slideNumber' | 'totalSlides'>[] = [
    {
      type: 'cover',
      headline: coverHeadline,
      body: coverSubtitle
        ? `${coverSubtitle}\n\n${truncateMicrocopy(hookSentence, COVER_BODY_MAX_WORDS, COVER_BODY_MAX_CHARS)}`
        : truncateMicrocopy(hookSentence, COVER_BODY_MAX_WORDS, COVER_BODY_MAX_CHARS),
    },
    ...contentSlides,
    ctaSlide,
  ];

  const total = allSlides.length;

  return allSlides.map((slide, index) => ({
    ...slide,
    slideNumber: index + 1,
    totalSlides: total,
  }));
}
