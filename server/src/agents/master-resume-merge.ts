/**
 * Master Resume merge logic — pure functions with no external dependencies.
 * Extracted from coordinator.ts for testability.
 */

import type { MasterResumeEvidenceItem, MasterResumeData } from './types.js';

/** The subset of FinalResumePayload needed for merging. */
export interface MergeableResumePayload {
  summary: string;
  experience: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date: string;
    location?: string;
    bullets: Array<{ text: string; source: string }>;
  }>;
  skills: Record<string, string[]>;
  education: Array<{ institution: string; degree: string; field: string; year: string }>;
  certifications: Array<{ name: string; issuer: string; year: string }>;
  contact_info?: Record<string, string>;
}

export interface MergedMasterResume {
  summary: string;
  experience: MasterResumeData['experience'];
  skills: Record<string, string[]>;
  education: MasterResumeData['education'];
  certifications: MasterResumeData['certifications'];
  evidence_items: MasterResumeEvidenceItem[];
  raw_text: string;
  contact_info?: Record<string, string>;
}

/** Maximum evidence items stored per master resume. */
const EVIDENCE_CAP = 200;

/** Safely coerce unknown values to string (guards against null/undefined from DB). */
const safeStr = (s: unknown): string => (typeof s === 'string' ? s : '');

/**
 * Pure merge function: combine existing master resume with new pipeline output.
 * No LLM calls — pure code deduplication.
 */
export function mergeMasterResume(
  existing: MasterResumeData,
  newResume: MergeableResumePayload,
  newEvidenceItems: MasterResumeEvidenceItem[],
): MergedMasterResume {
  // ── Summary: always use the latest crafted summary ──
  const summary = newResume.summary || existing.summary;

  // ── Experience: match by company+title, merge bullets ──
  // Deep-clone existing roles to prevent caller mutation
  const mergedExperience = existing.experience.map(role => ({
    ...role,
    bullets: [...role.bullets.map(b => ({ ...b }))],
  }));
  const existingIndex = new Map<string, number>();
  for (let i = 0; i < mergedExperience.length; i++) {
    const key = `${safeStr(mergedExperience[i].company).trim().toLowerCase()}|${safeStr(mergedExperience[i].title).trim().toLowerCase()}`;
    existingIndex.set(key, i);
  }

  for (const newRole of newResume.experience) {
    const key = `${safeStr(newRole.company).trim().toLowerCase()}|${safeStr(newRole.title).trim().toLowerCase()}`;
    const idx = existingIndex.get(key);

    if (idx !== undefined) {
      // Merge bullets: append new ones that don't already exist
      const existingTexts = new Set(
        mergedExperience[idx].bullets.map(b => b.text.trim().toLowerCase()),
      );
      for (const bullet of newRole.bullets) {
        if (!existingTexts.has(bullet.text.trim().toLowerCase())) {
          mergedExperience[idx].bullets.push(bullet);
          existingTexts.add(bullet.text.trim().toLowerCase());
        }
      }
      // Update dates if newer data has them
      if (newRole.start_date) mergedExperience[idx].start_date = newRole.start_date;
      if (newRole.end_date) mergedExperience[idx].end_date = newRole.end_date;
      if (newRole.location) mergedExperience[idx].location = newRole.location;
    } else {
      // New role — append
      mergedExperience.push({
        company: newRole.company,
        title: newRole.title,
        start_date: newRole.start_date,
        end_date: newRole.end_date,
        location: newRole.location ?? '',
        bullets: newRole.bullets.map(b => ({ ...b })),
      });
      existingIndex.set(key, mergedExperience.length - 1);
    }
  }

  // ── Skills: union (case-insensitive dedup) ──
  const mergedSkills: Record<string, string[]> = {};
  // Deep-clone existing skill arrays to prevent caller mutation
  for (const [cat, skills] of Object.entries(existing.skills)) {
    if (!safeStr(cat).trim()) continue;
    mergedSkills[cat] = [...skills];
  }
  for (const [category, skillList] of Object.entries(newResume.skills)) {
    if (!safeStr(category).trim()) continue;
    const existingSkills = [...(mergedSkills[category] ?? [])];
    const lowerSet = new Set(existingSkills.map(s => s.toLowerCase()));
    for (const skill of skillList) {
      if (!skill.trim()) continue;
      if (!lowerSet.has(skill.toLowerCase())) {
        existingSkills.push(skill);
        lowerSet.add(skill.toLowerCase());
      }
    }
    mergedSkills[category] = existingSkills;
  }

  // ── Education: keep existing, append new entries ──
  const mergedEducation = [...existing.education];
  const eduKeys = new Set(
    mergedEducation.map(e => `${safeStr(e.institution).trim().toLowerCase()}|${safeStr(e.degree).trim().toLowerCase()}`),
  );
  for (const edu of newResume.education) {
    const key = `${safeStr(edu.institution).trim().toLowerCase()}|${safeStr(edu.degree).trim().toLowerCase()}`;
    if (!eduKeys.has(key)) {
      mergedEducation.push({ ...edu });
      eduKeys.add(key);
    }
  }

  // ── Certifications: keep existing, append new entries ──
  const mergedCertifications = [...existing.certifications];
  const certKeys = new Set(
    mergedCertifications.map(c => safeStr(c.name).trim().toLowerCase()),
  );
  for (const cert of newResume.certifications) {
    if (!certKeys.has(safeStr(cert.name).trim().toLowerCase())) {
      mergedCertifications.push({ ...cert });
      certKeys.add(safeStr(cert.name).trim().toLowerCase());
    }
  }

  // ── Evidence items: append new, dedup by exact text, enforce cap ──
  const mergedEvidence = [...(Array.isArray(existing.evidence_items) ? existing.evidence_items : [])];
  const existingEvidenceTexts = new Set(
    mergedEvidence.map(e => safeStr(e.text).trim().toLowerCase()),
  );
  for (const item of newEvidenceItems) {
    const text = safeStr(item.text).trim();
    if (!text || text.length <= 10) continue;
    if (!existingEvidenceTexts.has(text.toLowerCase())) {
      mergedEvidence.push(item);
      existingEvidenceTexts.add(text.toLowerCase());
    }
  }
  // Enforce cap — keep newest items (items at end are newest)
  const cappedEvidence = mergedEvidence.length > EVIDENCE_CAP
    ? mergedEvidence.slice(mergedEvidence.length - EVIDENCE_CAP)
    : mergedEvidence;

  // ── Contact info: merge fields (existing as base, new overwrites per-field) ──
  const contactInfo = { ...(existing.contact_info ?? {}), ...(newResume.contact_info ?? {}) };

  return {
    summary,
    experience: mergedExperience,
    skills: mergedSkills,
    education: mergedEducation,
    certifications: mergedCertifications,
    evidence_items: cappedEvidence,
    raw_text: existing.raw_text,
    contact_info: contactInfo,
  };
}
