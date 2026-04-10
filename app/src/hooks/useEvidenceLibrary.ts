/**
 * useEvidenceLibrary
 *
 * Aggregates evidence items from multiple sources:
 *   1. Master resume evidence_items (via onGetDefaultResume)
 *   2. Why Me story key phrases (from the WhyMeStory hook)
 *   3. Career Profile evidence_positioning_statements (via platform context)
 *
 * Returns a merged, deduplicated list with source badges.
 * MVP: read-only aggregation with a "manual entry" addition slot.
 */

import { useState, useEffect, useCallback } from 'react';
import type { MasterResume } from '@/types/resume';
import type { CareerProfileV2 } from '@/types/career-profile';
import type { WhyMeStory } from '@/components/career-iq/useWhyMeStory';

export type EvidenceSource = 'resume' | 'why_me' | 'career_profile' | 'manual';

export interface EvidenceItem {
  id: string;
  text: string;
  source: EvidenceSource;
  category?: string;
}

interface UseEvidenceLibraryOptions {
  onGetDefaultResume?: () => Promise<MasterResume | null>;
  whyMeStory?: WhyMeStory;
  careerProfile?: CareerProfileV2 | null;
}

function extractWhyMeItems(story: WhyMeStory): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  if (story.colleaguesCameForWhat.trim()) {
    items.push({
      id: 'why_me_colleagues',
      text: story.colleaguesCameForWhat.trim(),
      source: 'why_me',
      category: 'Clarity',
    });
  }
  if (story.knownForWhat.trim()) {
    items.push({
      id: 'why_me_known_for',
      text: story.knownForWhat.trim(),
      source: 'why_me',
      category: 'Alignment',
    });
  }
  if (story.whyNotMe.trim()) {
    items.push({
      id: 'why_me_not',
      text: story.whyNotMe.trim(),
      source: 'why_me',
      category: 'Differentiation',
    });
  }

  return items;
}

function extractCareerProfileItems(profile: CareerProfileV2): EvidenceItem[] {
  return profile.evidence_positioning_statements.map((statement, i) => ({
    id: `career_profile_${i}`,
    text: statement,
    source: 'career_profile' as EvidenceSource,
  }));
}

function extractResumeItems(resume: MasterResume): EvidenceItem[] {
  return resume.evidence_items.map((item, i) => ({
    id: `resume_evidence_${i}_${item.created_at}`,
    text: item.text,
    source: 'resume' as EvidenceSource,
    category: item.category,
  }));
}

export function useEvidenceLibrary({
  onGetDefaultResume,
  whyMeStory,
  careerProfile,
}: UseEvidenceLibraryOptions) {
  const [resumeItems, setResumeItems] = useState<EvidenceItem[]>([]);
  const [manualItems, setManualItems] = useState<EvidenceItem[]>([]);
  const [loadingResume, setLoadingResume] = useState(false);

  // Load master resume evidence
  useEffect(() => {
    if (!onGetDefaultResume) return;

    let cancelled = false;
    setLoadingResume(true);

    // Timeout: if resume doesn't load in 10s, stop spinning and continue without it
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoadingResume(false);
    }, 10_000);

    async function load() {
      try {
        const resume = await onGetDefaultResume!();
        clearTimeout(timeoutId);
        if (!cancelled && resume && resume.evidence_items.length > 0) {
          setResumeItems(extractResumeItems(resume));
        }
      } catch {
        clearTimeout(timeoutId);
        // Evidence from resume unavailable — continue with other sources
      } finally {
        if (!cancelled) setLoadingResume(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [onGetDefaultResume]);

  const whyMeItems: EvidenceItem[] = whyMeStory ? extractWhyMeItems(whyMeStory) : [];
  const careerProfileItems: EvidenceItem[] = careerProfile
    ? extractCareerProfileItems(careerProfile)
    : [];

  const addManualItem = useCallback((text: string) => {
    if (!text.trim()) return;
    const id = `manual_${Date.now()}`;
    setManualItems((prev) => [
      ...prev,
      { id, text: text.trim(), source: 'manual' as EvidenceSource },
    ]);
  }, []);

  // Merge all sources — Why Me first (most intentional), then career profile,
  // then resume evidence, then manual entries.
  const items: EvidenceItem[] = [
    ...whyMeItems,
    ...careerProfileItems,
    ...resumeItems,
    ...manualItems,
  ];

  const loading = loadingResume;

  return { items, loading, addManualItem };
}
