/**
 * Carousel Builder — unit tests for `buildCarouselSlides`.
 *
 * Covers Story 1.1 (PDF Carousel Generation for LinkedIn Posts) acceptance criteria:
 *  - Produces 8-12 content slides (in addition to cover + CTA)
 *  - Cover / content / CTA three-part structure
 *  - Content derived from post paragraphs
 *  - Slide numbering is 1-based with consistent totalSlides
 *  - Hashtag block stripped from body before splitting
 *  - Series info surfaces on the cover slide
 *  - Hashtags flow into the CTA slide
 */

import { describe, expect, it } from 'vitest';
import { buildCarouselSlides, type CarouselSlide } from '../lib/carousel-builder.js';

const AUTHOR = 'Jane Doe';
const TOPIC = 'Scaling Operations';
const HASHTAGS = ['Operations', 'Leadership', 'Scale'];

/** 5 short paragraphs — below the 8-slide target, so expandParagraphs should split. */
const SHORT_POST = [
  'Scaling operations is less about adding capacity and more about removing bottlenecks. Most leaders miss this.',
  'The first instinct when volume rises is to hire. But headcount without process discipline creates chaos, not throughput. The bottleneck shifts — it never leaves.',
  'What works instead is measurement. You cannot improve what you do not measure. Start with cycle time, then work backward to the constraint.',
  'Once the constraint is visible, the rest of the team can stop guessing. Everyone aligns around the same bottleneck.',
  'That discipline compounds. A quarter of focused work on one constraint beats a year of generic "operational excellence" initiatives.',
  '#Operations #Leadership #Scale',
].join('\n\n');

/** 11 paragraphs — inside the 8-12 target band, so no splits or merges. */
const MEDIUM_POST = [
  'When I joined the operations team, we were shipping late 40% of the time.',
  'The instinct was to throw people at the problem.',
  'I pushed back. More hands does not fix a flow problem.',
  'Instead, we mapped cycle time across the full stack — design, procurement, assembly, QA.',
  'The bottleneck was not where we expected. It was in QA.',
  'Specifically, the hand-off from assembly to QA took 18 hours of queue time on average.',
  'We redesigned the hand-off to be continuous rather than batched.',
  'Queue time dropped to under 2 hours within six weeks.',
  'On-time shipment climbed from 60% to 92%.',
  'The team size did not grow. The process did.',
  'That is the leverage of constraint-first thinking. And it applies well beyond manufacturing.',
  '#Operations #Leadership #Scale',
].join('\n\n');

/** 16 paragraphs — above the 12-slide cap, so mergeShortParagraphs should trim. */
const LONG_POST = Array.from({ length: 16 }, (_, i) => `Paragraph ${i + 1} describing one specific observation about scaling operations.`).join('\n\n') + '\n\n#Operations';

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildCarouselSlides — structure', () => {
  it('produces cover, content, and CTA slides in that order', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);

    expect(slides.length).toBeGreaterThanOrEqual(3);
    expect(slides[0].type).toBe('cover');
    expect(slides[slides.length - 1].type).toBe('cta');
    for (let i = 1; i < slides.length - 1; i++) {
      expect(slides[i].type).toBe('content');
    }
  });

  it('slide numbering is 1-based and totalSlides matches the length', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);
    const total = slides.length;

    slides.forEach((slide, i) => {
      expect(slide.slideNumber).toBe(i + 1);
      expect(slide.totalSlides).toBe(total);
    });
  });
});

describe('buildCarouselSlides — 360Brew slide-count target', () => {
  it('medium-length posts (11 paragraphs) stay within the 8-12 content-slide band', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);
    const contentSlides = slides.filter((s) => s.type === 'content');

    expect(contentSlides.length).toBeGreaterThanOrEqual(8);
    expect(contentSlides.length).toBeLessThanOrEqual(12);
  });

  it('short posts (5 paragraphs) are expanded to meet the 8-slide minimum', () => {
    const slides = buildCarouselSlides(SHORT_POST, TOPIC, AUTHOR, HASHTAGS);
    const contentSlides = slides.filter((s) => s.type === 'content');

    expect(contentSlides.length).toBeGreaterThanOrEqual(8);
  });

  it('long posts (16 paragraphs) are merged down to the 12-slide cap', () => {
    const slides = buildCarouselSlides(LONG_POST, TOPIC, AUTHOR, HASHTAGS);
    const contentSlides = slides.filter((s) => s.type === 'content');

    expect(contentSlides.length).toBeLessThanOrEqual(12);
  });
});

describe('buildCarouselSlides — cover slide', () => {
  it('uses the topic as the cover headline in single-post mode', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);
    expect(slides[0].headline).toBe(TOPIC);
  });

  it('surfaces series info (part N of M) in the cover headline when provided', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS, {
      seriesInfo: { part: 3, total: 12, title: 'Operations Playbook' },
    });

    expect(slides[0].type).toBe('cover');
    expect(slides[0].headline).toContain('Part 3 of 12');
    expect(slides[0].headline).toContain('Operations Playbook');
    // The topic still appears in the body so the reader knows what THIS post is about.
    expect(slides[0].body).toContain(TOPIC);
  });
});

describe('buildCarouselSlides — CTA slide', () => {
  it('names the author in the CTA headline', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);
    const cta = slides[slides.length - 1];

    expect(cta.type).toBe('cta');
    expect(cta.headline).toContain(AUTHOR);
  });

  it('flows hashtags into the CTA slide bulletPoints', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);
    const cta = slides[slides.length - 1];

    expect(cta.bulletPoints).toEqual(HASHTAGS);
  });

  it('omits CTA bulletPoints when no hashtags are provided', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, []);
    const cta = slides[slides.length - 1];

    expect(cta.bulletPoints).toBeUndefined();
  });
});

describe('buildCarouselSlides — body handling', () => {
  it('strips the trailing hashtag block before splitting into content slides', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);

    // None of the content slides should contain the raw hashtag text.
    const anyContentHasHashtag = slides
      .filter((s: CarouselSlide) => s.type === 'content')
      .some((s) => (s.body ?? '').includes('#Operations') || (s.bulletPoints ?? []).some((b) => b.includes('#Operations')));

    expect(anyContentHasHashtag).toBe(false);
  });

  it('content slides use bullet points when the chunk has multiple sentences', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);
    const contentSlides = slides.filter((s) => s.type === 'content');

    // At least one content slide produced from a multi-sentence chunk should carry bullets.
    const anyHasBullets = contentSlides.some((s) => Array.isArray(s.bulletPoints) && s.bulletPoints.length > 0);
    expect(anyHasBullets).toBe(true);
  });

  it('every content slide has a non-empty headline', () => {
    const slides = buildCarouselSlides(MEDIUM_POST, TOPIC, AUTHOR, HASHTAGS);
    const contentSlides = slides.filter((s) => s.type === 'content');

    for (const slide of contentSlides) {
      expect(slide.headline).toBeTruthy();
      expect(slide.headline.length).toBeGreaterThan(0);
    }
  });
});
