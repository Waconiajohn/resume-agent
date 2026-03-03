/**
 * Capture utilities for quality validation testing.
 * Scrapes quality scores and section content from the DOM during pipeline runs.
 * Uses page.evaluate() to bypass zero-height panel layout issues.
 */
import type { Page } from '@playwright/test';

export interface QualityScoreSet {
  /** Primary scores from ScoreRing (e.g., hiring_mgr, ats, authenticity) */
  primary: Record<string, number>;
  /** Secondary metrics (e.g., evidence_integrity, blueprint_compliance) */
  secondary: Record<string, number>;
}

export interface SectionCapture {
  title: string;
  lines: string[];
}

export interface PipelineCaptureData {
  qualityScores: QualityScoreSet | null;
  sections: SectionCapture[];
}

export function createCaptureData(): PipelineCaptureData {
  return { qualityScores: null, sections: [] };
}

const PANEL_SEL = '[data-panel-root]';

/**
 * Scrape quality scores from the quality dashboard panel.
 * Primary scores come from ScoreRing aria-labels (role="img").
 * Secondary metrics come from label/value text rows.
 */
export async function captureQualityScores(page: Page): Promise<QualityScoreSet | null> {
  return page.evaluate((panelSel) => {
    const panel = document.querySelector(panelSel);
    if (!panel) return null;

    // Primary scores from ScoreRing aria-labels: "ATS: 87%"
    const rings = Array.from(panel.querySelectorAll('[role="img"]'));
    const primary: Record<string, number> = {};
    for (const ring of rings) {
      const label = ring.getAttribute('aria-label') || '';
      const match = label.match(/^(.+?):\s*(\d+)%$/);
      if (match) {
        const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
        primary[key] = parseInt(match[2], 10);
      }
    }

    // Secondary metrics from flex rows (label span + value span)
    const metricLabels = [
      'Evidence Integrity',
      'Blueprint Compliance',
      'Narrative Coherence',
      'Keyword Coverage',
    ];
    const secondary: Record<string, number> = {};
    const allSpans = Array.from(panel.querySelectorAll('span'));
    for (const label of metricLabels) {
      const labelSpan = allSpans.find((s) => s.textContent?.trim() === label);
      if (labelSpan) {
        const parent = labelSpan.parentElement;
        if (parent) {
          const children = Array.from(parent.querySelectorAll('span'));
          const valueSpan = children[children.length - 1];
          const text = valueSpan?.textContent?.trim() || '';
          const pctMatch = text.match(/(\d+)%/);
          if (pctMatch) {
            const key = label.toLowerCase().replace(/\s+/g, '_');
            secondary[key] = parseInt(pctMatch[1], 10);
          }
        }
      }
    }

    return { primary, secondary };
  }, PANEL_SEL);
}

/**
 * Scrape section content from the section review panel.
 * Title from heading element, content from text paragraphs.
 */
export async function captureSectionContent(page: Page): Promise<SectionCapture | null> {
  return page.evaluate((panelSel) => {
    const panel = document.querySelector(panelSel);
    if (!panel) return null;

    // Title from h2 or h3 heading
    const heading = panel.querySelector('h2') || panel.querySelector('h3');
    const title = heading?.textContent?.trim() || 'Unknown';

    // Content paragraphs with text-sm styling
    const paragraphs = Array.from(panel.querySelectorAll('p'));
    const lines = paragraphs
      .filter((p) => {
        const cls = p.className || '';
        return (
          cls.includes('text-sm') &&
          cls.includes('text-white') &&
          !cls.includes('italic')
        );
      })
      .map((p) => p.textContent?.trim() || '')
      .filter((t) => t.length > 0 && t !== 'No content to display.');

    return { title, lines };
  }, PANEL_SEL);
}
