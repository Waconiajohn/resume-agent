import { resumeToText } from '@/lib/export';
import type {
  ContactInfo,
  FinalResume,
  MasterResume,
  MasterResumeCertification,
  MasterResumeEducation,
  MasterResumeEvidenceItem,
  MasterResumeExperience,
} from '@/types/resume';
import type { MasterPromotionItem, ResumeDraft } from '@/types/resume-v2';

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cloneExperience(experience: MasterResumeExperience[]): MasterResumeExperience[] {
  return experience.map((item) => ({
    ...item,
    bullets: item.bullets.map((bullet) => ({ ...bullet })),
  }));
}

function draftToExperience(draft: ResumeDraft): MasterResumeExperience[] {
  return draft.professional_experience.map((experience) => ({
    company: experience.company,
    title: experience.title,
    start_date: experience.start_date,
    end_date: experience.end_date,
    location: '',
    bullets: experience.bullets.map((bullet) => ({
      text: bullet.text,
      source: bullet.is_new ? 'upgraded' : 'crafted',
    })),
  }));
}

function draftToEducation(draft: ResumeDraft): MasterResumeEducation[] {
  return draft.education.map((education) => ({
    institution: education.institution,
    degree: education.degree,
    field: '',
    year: education.year ?? '',
  }));
}

function draftToCertifications(draft: ResumeDraft): MasterResumeCertification[] {
  return draft.certifications.map((certification) => ({
    name: certification,
    issuer: '',
    year: '',
  }));
}

function draftToContact(draft: ResumeDraft): ContactInfo {
  return {
    name: draft.header.name,
    email: draft.header.email,
    phone: draft.header.phone,
    linkedin: draft.header.linkedin,
  };
}

export function getPromotableResumeItems(draft: ResumeDraft | null | undefined): MasterPromotionItem[] {
  if (!draft) return [];

  const items: MasterPromotionItem[] = [];

  draft.selected_accomplishments.forEach((item, index) => {
    if (!item.is_new) return;
    items.push({
      id: `selected_accomplishment:${index}`,
      category: 'selected_accomplishment',
      section: 'Selected Accomplishments',
      label: 'Selected accomplishment',
      text: item.content,
      addressesRequirements: item.addresses_requirements,
    });
  });

  draft.professional_experience.forEach((experience, experienceIndex) => {
    const section = `Professional Experience - ${experience.company}`;

    if (experience.scope_statement_is_new && experience.scope_statement.trim()) {
      items.push({
        id: `scope_statement:${experienceIndex}`,
        category: 'scope_statement',
        section,
        label: `${experience.title} scope statement`,
        text: experience.scope_statement,
        company: experience.company,
        title: experience.title,
      });
    }

    experience.bullets.forEach((bullet, bulletIndex) => {
      if (!bullet.is_new) return;
      items.push({
        id: `experience_bullet:${experienceIndex}:${bulletIndex}`,
        category: 'experience_bullet',
        section,
        label: `${experience.title} bullet`,
        text: bullet.text,
        company: experience.company,
        title: experience.title,
        addressesRequirements: bullet.addresses_requirements,
      });
    });
  });

  return items;
}

function ensureExperienceSlot(
  experience: MasterResumeExperience[],
  item: MasterPromotionItem,
  fallbackExperience: MasterResumeExperience[],
): MasterResumeExperience {
  const match = experience.find((entry) => (
    entry.company.toLowerCase() === item.company?.toLowerCase()
      && entry.title.toLowerCase() === item.title?.toLowerCase()
  ));
  if (match) return match;

  const fallback = fallbackExperience.find((entry) => (
    entry.company.toLowerCase() === item.company?.toLowerCase()
      && entry.title.toLowerCase() === item.title?.toLowerCase()
  ));
  if (fallback) {
    const next = {
      ...fallback,
      bullets: fallback.bullets.map((bullet) => ({ ...bullet })),
    };
    experience.push(next);
    return next;
  }

  const next = {
    company: item.company ?? 'Additional Experience',
    title: item.title ?? 'Experience',
    start_date: '',
    end_date: '',
    location: '',
    bullets: [] as Array<{ text: string; source: string }>,
  };
  experience.push(next);
  return next;
}

function selectedAccomplishmentText(items: MasterPromotionItem[]): string | undefined {
  const lines = items
    .filter((item) => item.category === 'selected_accomplishment')
    .map((item) => item.text.trim())
    .filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : undefined;
}

export function buildMasterResumePromotionPayload(args: {
  draft: ResumeDraft;
  baseResume: MasterResume | null;
  selectedItems: MasterPromotionItem[];
  sourceSessionId?: string | null;
  companyName?: string;
  jobTitle?: string;
  atsScore?: number;
}): {
  summary: string;
  experience: MasterResumeExperience[];
  skills: Record<string, string[]>;
  education: MasterResumeEducation[];
  certifications: MasterResumeCertification[];
  contact_info: ContactInfo;
  raw_text: string;
  evidence_items: MasterResumeEvidenceItem[];
} {
  const {
    draft,
    baseResume,
    selectedItems,
    sourceSessionId,
    companyName,
    jobTitle,
    atsScore,
  } = args;

  const fallbackExperience = draftToExperience(draft);
  const experience = baseResume ? cloneExperience(baseResume.experience) : cloneExperience(fallbackExperience);
  const education = baseResume ? [...baseResume.education] : draftToEducation(draft);
  const certifications = baseResume ? [...baseResume.certifications] : draftToCertifications(draft);
  const contact_info = baseResume?.contact_info ?? draftToContact(draft);
  const summary = baseResume?.summary ?? draft.executive_summary.content;
  const skills = baseResume?.skills ?? (draft.core_competencies.length > 0 ? { 'Core Competencies': [...draft.core_competencies] } : {});

  for (const item of selectedItems) {
    if (item.category === 'selected_accomplishment') continue;

    const targetExperience = ensureExperienceSlot(experience, item, fallbackExperience);
    const existing = targetExperience.bullets.some((bullet) => normalizeText(bullet.text) === normalizeText(item.text));
    if (!existing) {
      targetExperience.bullets.push({ text: item.text, source: 'upgraded' });
    }
  }

  const existingEvidence = baseResume?.evidence_items ?? [];
  const evidenceItems = [...existingEvidence];

  for (const item of selectedItems) {
    const exists = evidenceItems.some((entry) => normalizeText(entry.text) === normalizeText(item.text));
    if (exists || !sourceSessionId) continue;

    evidenceItems.push({
      text: item.text,
      source: 'upgraded',
      category: item.category,
      source_session_id: sourceSessionId,
      created_at: new Date().toISOString(),
    });
  }

  const finalResume: FinalResume = {
    summary,
    experience,
    skills,
    education,
    certifications,
    selected_accomplishments: selectedAccomplishmentText(selectedItems),
    ats_score: atsScore ?? 0,
    contact_info,
    company_name: companyName,
    job_title: jobTitle,
  };

  return {
    summary,
    experience,
    skills,
    education,
    certifications,
    contact_info,
    raw_text: resumeToText(finalResume),
    evidence_items: evidenceItems,
  };
}
