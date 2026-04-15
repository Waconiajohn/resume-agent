import { jsPDF } from 'jspdf';
import { sanitizePdfText } from '@/lib/export-pdf';
import { saveBlobWithFilename } from '@/lib/download';

export interface CarouselSlide {
  type: 'cover' | 'content' | 'cta';
  headline: string;
  body?: string;
  bulletPoints?: string[];
  slideNumber: number;
  totalSlides: number;
}

interface CarouselOptions {
  brandColor?: string;
  accentColor?: string;
  authorName?: string;
}

// A4 landscape — 297mm x 210mm
const PAGE_W_MM = 297;
const PAGE_H_MM = 210;

// Layout constants (in mm, passed to jsPDF which accepts mm unit)
const MARGIN_X = 18;
const MARGIN_Y = 16;
const CONTENT_W = PAGE_W_MM - MARGIN_X * 2;

// Default brand colors as RGB tuples
const DEFAULT_BRAND: [number, number, number] = [26, 54, 93];   // #1a365d navy
const DEFAULT_ACCENT: [number, number, number] = [49, 130, 206]; // #3182ce blue
const WHITE: [number, number, number] = [255, 255, 255];
const TEXT_DARK: [number, number, number] = [30, 36, 50];
const TEXT_MID: [number, number, number] = [90, 100, 120];
const LIGHT_BG: [number, number, number] = [248, 250, 253];

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return DEFAULT_BRAND;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return DEFAULT_BRAND;
  return [r, g, b];
}

function setFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function setTextColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setDrawColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function renderCoverSlide(
  doc: jsPDF,
  slide: CarouselSlide,
  brand: [number, number, number],
  accent: [number, number, number],
  authorName: string,
) {
  // White background
  setFill(doc, WHITE);
  doc.rect(0, 0, PAGE_W_MM, PAGE_H_MM, 'F');

  // Top brand stripe — full width, 12mm tall
  setFill(doc, brand);
  doc.rect(0, 0, PAGE_W_MM, 12, 'F');

  // Accent bottom stripe — full width, 4mm tall
  setFill(doc, accent);
  doc.rect(0, PAGE_H_MM - 4, PAGE_W_MM, 4, 'F');

  // Subtle light background rectangle for content area
  setFill(doc, LIGHT_BG);
  doc.rect(MARGIN_X, 22, CONTENT_W, PAGE_H_MM - 40, 'F');

  // Left accent bar
  setFill(doc, accent);
  doc.rect(MARGIN_X, 22, 3, PAGE_H_MM - 40, 'F');

  // Headline — centered vertically in content area
  const headlineY = 58;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  setTextColor(doc, brand);

  const headline = sanitizePdfText(slide.headline);
  const headlineLines: string[] = doc.splitTextToSize(headline, CONTENT_W - 16);
  const lineHeight = 10;

  for (let i = 0; i < headlineLines.length; i++) {
    doc.text(headlineLines[i], PAGE_W_MM / 2, headlineY + i * lineHeight, { align: 'center' });
  }

  // Subtitle / body
  if (slide.body) {
    const bodyY = headlineY + headlineLines.length * lineHeight + 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    setTextColor(doc, TEXT_MID);
    const bodyLines: string[] = doc.splitTextToSize(sanitizePdfText(slide.body), CONTENT_W - 16);
    for (let i = 0; i < bodyLines.length && i < 4; i++) {
      doc.text(bodyLines[i], PAGE_W_MM / 2, bodyY + i * 7.5, { align: 'center' });
    }
  }

  // Author name at bottom
  if (authorName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setTextColor(doc, brand);
    doc.text(sanitizePdfText(authorName), PAGE_W_MM / 2, PAGE_H_MM - 9, { align: 'center' });
  }

  // Slide number indicator — top right corner of stripe
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, WHITE);
  doc.text(`1 / ${slide.totalSlides}`, PAGE_W_MM - MARGIN_X, 8, { align: 'right' });
}

function renderContentSlide(
  doc: jsPDF,
  slide: CarouselSlide,
  brand: [number, number, number],
  accent: [number, number, number],
) {
  // White background
  setFill(doc, WHITE);
  doc.rect(0, 0, PAGE_W_MM, PAGE_H_MM, 'F');

  // Thin top accent bar — 3mm
  setFill(doc, accent);
  doc.rect(0, 0, PAGE_W_MM, 3, 'F');

  // Headline
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  setTextColor(doc, brand);

  const headline = sanitizePdfText(slide.headline);
  const headlineLines: string[] = doc.splitTextToSize(headline, CONTENT_W);
  const headlineLineH = 9;
  const headlineStartY = MARGIN_Y + 12;

  for (let i = 0; i < headlineLines.length && i < 3; i++) {
    doc.text(headlineLines[i], MARGIN_X, headlineStartY + i * headlineLineH);
  }

  // Separator line under headline
  const sepY = headlineStartY + Math.min(headlineLines.length, 3) * headlineLineH + 4;
  setDrawColor(doc, accent);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, sepY, MARGIN_X + 40, sepY);
  setDrawColor(doc, [220, 220, 220]);

  let currentY = sepY + 8;

  // Body paragraph
  if (slide.body) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    setTextColor(doc, TEXT_DARK);
    const bodyLines: string[] = doc.splitTextToSize(sanitizePdfText(slide.body), CONTENT_W);
    for (let i = 0; i < bodyLines.length && i < 5; i++) {
      doc.text(bodyLines[i], MARGIN_X, currentY + i * 6.5);
    }
    currentY += Math.min(bodyLines.length, 5) * 6.5 + 6;
  }

  // Bullet points
  if (slide.bulletPoints && slide.bulletPoints.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    setTextColor(doc, TEXT_DARK);

    const bulletIndent = 8;
    const markerX = MARGIN_X + 2;
    const textX = MARGIN_X + bulletIndent;
    const bulletW = CONTENT_W - bulletIndent;

    for (const rawBullet of slide.bulletPoints.slice(0, 6)) {
      const bulletText = sanitizePdfText(rawBullet);
      if (!bulletText) continue;

      // Bullet dot — use accent color
      setFill(doc, accent);
      doc.circle(markerX, currentY - 1.5, 1, 'F');
      setFill(doc, WHITE); // reset

      const bulletLines: string[] = doc.splitTextToSize(bulletText, bulletW);
      setTextColor(doc, TEXT_DARK);

      for (let li = 0; li < bulletLines.length && li < 3; li++) {
        doc.text(bulletLines[li], textX, currentY + li * 6);
      }
      currentY += Math.min(bulletLines.length, 3) * 6 + 4;

      if (currentY > PAGE_H_MM - MARGIN_Y - 10) break;
    }
  }

  // Slide number — bottom right, subtle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, TEXT_MID);
  doc.text(
    `${slide.slideNumber} / ${slide.totalSlides}`,
    PAGE_W_MM - MARGIN_X,
    PAGE_H_MM - MARGIN_Y + 2,
    { align: 'right' },
  );
}

function renderCtaSlide(
  doc: jsPDF,
  slide: CarouselSlide,
  brand: [number, number, number],
  accent: [number, number, number],
  authorName: string,
) {
  // Brand-colored background
  setFill(doc, brand);
  doc.rect(0, 0, PAGE_W_MM, PAGE_H_MM, 'F');

  // Decorative accent rectangle — bottom right corner
  setFill(doc, accent);
  doc.rect(PAGE_W_MM - 60, PAGE_H_MM - 30, 60, 30, 'F');

  // Decorative light rectangle — top left corner
  const lightBrand: [number, number, number] = [
    Math.min(brand[0] + 30, 255),
    Math.min(brand[1] + 30, 255),
    Math.min(brand[2] + 40, 255),
  ];
  setFill(doc, lightBrand);
  doc.rect(0, 0, 40, 40, 'F');

  // Main headline — centered
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  setTextColor(doc, WHITE);

  const headline = sanitizePdfText(slide.headline);
  const headlineLines: string[] = doc.splitTextToSize(headline, CONTENT_W);
  const centerY = PAGE_H_MM / 2 - (headlineLines.length * 11) / 2;

  for (let i = 0; i < headlineLines.length && i < 3; i++) {
    doc.text(headlineLines[i], PAGE_W_MM / 2, centerY + i * 11, { align: 'center' });
  }

  // Hashtags or body
  if (slide.bulletPoints && slide.bulletPoints.length > 0) {
    const hashtagsY = centerY + Math.min(headlineLines.length, 3) * 11 + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    setTextColor(doc, accent);
    const hashtagText = slide.bulletPoints
      .slice(0, 5)
      .map((h) => sanitizePdfText(h.startsWith('#') ? h : `#${h}`))
      .join('  ');
    doc.text(hashtagText, PAGE_W_MM / 2, hashtagsY, { align: 'center' });
  } else if (slide.body) {
    const bodyY = centerY + Math.min(headlineLines.length, 3) * 11 + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    setTextColor(doc, WHITE);
    const bodyLines: string[] = doc.splitTextToSize(sanitizePdfText(slide.body), CONTENT_W);
    for (let i = 0; i < bodyLines.length && i < 3; i++) {
      doc.text(bodyLines[i], PAGE_W_MM / 2, bodyY + i * 7, { align: 'center' });
    }
  }

  // Author name — bottom center
  if (authorName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setTextColor(doc, WHITE);
    doc.text(sanitizePdfText(authorName), PAGE_W_MM / 2, PAGE_H_MM - MARGIN_Y, { align: 'center' });
  }

  // Slide number
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, WHITE);
  doc.text(
    `${slide.slideNumber} / ${slide.totalSlides}`,
    PAGE_W_MM - MARGIN_X,
    PAGE_H_MM - MARGIN_Y + 2,
    { align: 'right' },
  );
}

function buildCarouselBlob(slides: CarouselSlide[], options: CarouselOptions): Blob {
  const brand = options.brandColor ? hexToRgb(options.brandColor) : DEFAULT_BRAND;
  const accent = options.accentColor ? hexToRgb(options.accentColor) : DEFAULT_ACCENT;
  const authorName = options.authorName ?? '';

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) doc.addPage();

    const slide = slides[i];
    switch (slide.type) {
      case 'cover':
        renderCoverSlide(doc, slide, brand, accent, authorName);
        break;
      case 'content':
        renderContentSlide(doc, slide, brand, accent);
        break;
      case 'cta':
        renderCtaSlide(doc, slide, brand, accent, authorName);
        break;
    }
  }

  return doc.output('blob');
}

function deriveTopicSlug(slides: CarouselSlide[]): string {
  const coverSlide = slides.find((s) => s.type === 'cover');
  const headline = coverSlide?.headline ?? slides[0]?.headline ?? 'carousel';
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-+$/, '') || 'carousel';
}

export async function exportCarouselPdf(
  slides: CarouselSlide[],
  options?: CarouselOptions,
): Promise<void> {
  if (slides.length === 0) return;

  const blob = buildCarouselBlob(slides, options ?? {});
  const topicSlug = deriveTopicSlug(slides);
  saveBlobWithFilename(blob, `${topicSlug}-carousel`, 'pdf');
}
