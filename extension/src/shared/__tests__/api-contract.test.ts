import { describe, expect, it } from 'vitest';
import {
  buildApplyStatusRequest,
  buildInferFieldRequest,
  buildJobDiscoverRequest,
  buildResumeLookupRequest,
  readElementIndex,
} from '../api-contract.js';

describe('extension API contract', () => {
  it('uses the server resume lookup shape', () => {
    expect(buildResumeLookupRequest('https://www.linkedin.com/jobs/view/123?utm_source=google')).toEqual({
      job_url: 'https://www.linkedin.com/jobs/view/123',
    });
  });

  it('uses the server job discovery shape', () => {
    expect(buildJobDiscoverRequest('https://boards.greenhouse.io/acme/jobs/999?ref=feed', 'VP Ops')).toEqual({
      job_url: 'https://boards.greenhouse.io/acme/jobs/999',
      raw_url: 'https://boards.greenhouse.io/acme/jobs/999?ref=feed',
      page_title: 'VP Ops',
      platform: 'GREENHOUSE',
    });
  });

  it('uses the server apply-status shape', () => {
    expect(buildApplyStatusRequest('https://jobs.lever.co/acme/abc/apply', 'LEVER')).toEqual({
      job_url: 'https://jobs.lever.co/acme/abc',
      platform: 'LEVER',
    });
  });

  it('maps AI field inference payloads to the server schema', () => {
    expect(buildInferFieldRequest({
      fieldName: 'first_name',
      fieldValue: 'Ada',
      platform: 'WORKDAY',
      formSnapshot: [{
        index: 0,
        tag: 'input',
        type: 'text',
        name: 'candidate-first-name',
        id: 'first',
        placeholder: 'First',
        ariaLabel: 'First name',
        labelText: 'Legal first name',
      }],
    })).toEqual({
      field_name: 'first_name',
      field_value: 'Ada',
      platform: 'WORKDAY',
      form_snapshot: [{
        index: 0,
        label: 'Legal first name',
        name: 'candidate-first-name',
        placeholder: 'First',
        type: 'text',
      }],
    });
  });

  it('reads current and legacy element-index response names', () => {
    expect(readElementIndex({ element_index: 2 })).toBe(2);
    expect(readElementIndex({ elementIndex: 3 })).toBe(3);
    expect(readElementIndex({ element_index: null })).toBeNull();
  });
});
