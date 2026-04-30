import type { AIFieldInferencePayload, ATSPlatform } from './types.js';
import { detectPlatform, normalizeJobUrl } from './url-normalizer.js';

export interface ResumeLookupRequest {
  job_url: string;
}

export interface JobDiscoverRequest {
  job_url: string;
  raw_url: string;
  page_title: string;
  platform: ATSPlatform;
}

export interface ApplyStatusRequest {
  job_url: string;
  platform: ATSPlatform;
}

export interface InferFieldRequest {
  field_name: string;
  field_value: string;
  form_snapshot: Array<{
    index: number;
    label: string;
    name: string;
    placeholder: string;
    type: string;
  }>;
  platform: ATSPlatform;
}

export function buildResumeLookupRequest(jobUrl: string): ResumeLookupRequest {
  return { job_url: normalizeJobUrl(jobUrl) };
}

export function buildJobDiscoverRequest(tabUrl: string, pageTitle = ''): JobDiscoverRequest {
  const normalizedUrl = normalizeJobUrl(tabUrl);
  return {
    job_url: normalizedUrl,
    raw_url: tabUrl,
    page_title: pageTitle,
    platform: detectPlatform(tabUrl),
  };
}

export function buildApplyStatusRequest(jobUrl: string, platform: ATSPlatform): ApplyStatusRequest {
  return {
    job_url: normalizeJobUrl(jobUrl),
    platform,
  };
}

export function buildInferFieldRequest(payload: AIFieldInferencePayload): InferFieldRequest {
  return {
    field_name: payload.fieldName,
    field_value: payload.fieldValue,
    form_snapshot: payload.formSnapshot.map((item) => ({
      index: item.index,
      label: item.labelText,
      name: item.name,
      placeholder: item.placeholder,
      type: item.type,
    })),
    platform: payload.platform,
  };
}

export function readElementIndex(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null;
  const value = (response as { element_index?: unknown; elementIndex?: unknown }).element_index
    ?? (response as { elementIndex?: unknown }).elementIndex;
  return typeof value === 'number' ? value : null;
}
