// v3 master-resume types.
//
// We keep the wire shape thin: structured sections suitable for rendering
// and a `raw_text` rollup for full-text search / export fallback.
// `master_resumes` rows carry more (skills by category, evidence_items, etc.);
// the load adapter preserves what v3 needs and drops the rest.

import type { Bullet, DateRange } from '../types.js';

export interface V3MasterContactInfo {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
}

/** Stored shape for an experience row in master_resumes.experience jsonb column. */
export interface V3MasterExperienceRow {
  company: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  scope_statement?: string | null;
  bullets: Array<{
    text: string;
    source?: 'resume' | 'crafted' | 'upgraded' | 'interview';
  }>;
}

export interface V3MasterEducationRow {
  degree: string;
  institution: string;
  location?: string | null;
  year?: string | null;
  notes?: string | null;
}

export interface V3MasterCertificationRow {
  name: string;
  issuer?: string | null;
  year?: string | null;
}

export interface V3MasterEvidenceItem {
  text: string;
  source: 'crafted' | 'upgraded' | 'interview';
  category?: string;
  source_session_id: string;
  created_at: string;
}

/**
 * Subset of master_resumes row fields v3 actually reads.
 * Skills live as an object (category → [names]) in the DB; we keep it flat
 * for v3's load-into-classify-shape path.
 */
export interface V3MasterResumeRecord {
  id: string;
  user_id: string;
  version: number;
  is_default: boolean;
  raw_text: string;
  summary: string;
  contact_info: V3MasterContactInfo;
  experience: V3MasterExperienceRow[];
  education: V3MasterEducationRow[];
  certifications: V3MasterCertificationRow[];
  skills: Record<string, string[]>;
  evidence_items?: V3MasterEvidenceItem[];
  created_at: string;
  updated_at: string;
}

/** Shape returned from GET /api/v3-pipeline/master to the frontend. */
export interface V3MasterSummary {
  id: string;
  version: number;
  is_default: boolean;
  updated_at: string;
  hasExperience: boolean;
  hasEvidence: boolean;
  positionCount: number;
  evidenceCount: number;
}

// Internal helper type for promotion logic.
export interface V3PromoteBulletInput {
  positionIndex: number;
  text: string;
  source: 'crafted' | 'upgraded';
}
export interface V3PromoteScopeInput {
  positionIndex: number;
  text: string;
}
export interface V3PromoteSummaryInput {
  text: string;
}
export interface V3PromoteEvidenceInput {
  text: string;
  category?: string;
}

export type V3DateRangeCopy = DateRange;
export type V3BulletCopy = Bullet;
