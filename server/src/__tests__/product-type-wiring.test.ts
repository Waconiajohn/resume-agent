/**
 * Product Type Wiring — Static verification tests.
 *
 * Verifies that each product route file:
 *   1. Defines an `onBeforeStart` hook
 *   2. Sets the correct `product_type` value in that hook
 *
 * Strategy: Read source files directly (no imports, no mocks) to avoid
 * the heavyweight mock setup required by DB/auth/SSE dependencies.
 * These tests guard against regressions where a future route refactor
 * accidentally drops the product_type wiring.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROUTES_DIR = resolve(__dirname, '../routes');

function readRoute(filename: string): string {
  return readFileSync(resolve(ROUTES_DIR, filename), 'utf-8');
}

const ROUTE_PRODUCT_TYPES: Array<{ file: string; productType: string }> = [
  { file: 'case-study.ts', productType: 'case_study' },
  { file: 'content-calendar.ts', productType: 'content_calendar' },
  { file: 'cover-letter.ts', productType: 'cover_letter' },
  { file: 'executive-bio.ts', productType: 'executive_bio' },
  { file: 'interview-prep.ts', productType: 'interview_prep' },
  { file: 'job-finder.ts', productType: 'job_finder' },
  { file: 'job-tracker.ts', productType: 'job_tracker' },
  { file: 'linkedin-content.ts', productType: 'linkedin_content' },
  { file: 'linkedin-editor.ts', productType: 'linkedin_editor' },
  { file: 'linkedin-optimizer.ts', productType: 'linkedin_optimizer' },
  { file: 'mock-interview.ts', productType: 'mock_interview' },
  { file: 'networking-outreach.ts', productType: 'networking_outreach' },
  { file: 'ninety-day-plan.ts', productType: 'ninety_day_plan' },
  { file: 'onboarding.ts', productType: 'onboarding' },
  { file: 'retirement-bridge.ts', productType: 'retirement_bridge' },
  { file: 'salary-negotiation.ts', productType: 'salary_negotiation' },
  { file: 'thank-you-note.ts', productType: 'thank_you_note' },
];

describe('product_type wiring', () => {
  for (const { file, productType } of ROUTE_PRODUCT_TYPES) {
    describe(file, () => {
      let source: string;

      it('has an onBeforeStart hook', () => {
        source = readRoute(file);
        expect(source).toContain('onBeforeStart:');
      });

      it(`sets product_type to '${productType}'`, () => {
        source = source ?? readRoute(file);
        expect(source).toContain(`product_type: '${productType}'`);
      });

      it('imports supabaseAdmin', () => {
        source = source ?? readRoute(file);
        expect(source).toContain('supabaseAdmin');
      });
    });
  }
});
