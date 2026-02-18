import type { FinalResume, ContactInfo } from '@/types/resume';
import { DEFAULT_SECTION_ORDER } from '@/lib/constants';
import { saveBlobWithFilename } from '@/lib/download';

/**
 * Extract clean text from a string that may contain a JSON wrapper
 * (e.g., AI response with ```json fences, proposed_content, changes, etc.)
 */
function extractProposedContent(text: string): string {
  // Strip markdown fences
  let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
  // Try to parse as JSON and extract proposed_content
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.proposed_content === 'string') return parsed.proposed_content;
    if (typeof parsed?.content === 'string') return parsed.content;
  } catch {
    // Not JSON — use as-is but strip common wrapper artifacts
  }
  // Strip leading { "proposed_content": " and trailing artifacts if present
  cleaned = cleaned.replace(/^\s*\{\s*"proposed_content"\s*:\s*"/, '').replace(/"\s*,\s*"changes"\s*:[\s\S]*$/, '');
  return cleaned;
}

type TextSectionRenderer = (resume: FinalResume) => string[];

const textSectionRenderers: Record<string, TextSectionRenderer> = {
  summary: (resume) => {
    if (!resume.summary) return [];
    return ['PROFESSIONAL SUMMARY', resume.summary, ''];
  },
  selected_accomplishments: (resume) => {
    if (!resume.selected_accomplishments) return [];
    // Strip leading heading if the LLM baked it into the content
    const content = resume.selected_accomplishments.replace(/^\s*SELECTED ACCOMPLISHMENTS\s*/i, '').trim();
    return ['SELECTED ACCOMPLISHMENTS', content, ''];
  },
  experience: (resume) => {
    // Prefer raw section text from experience_role_* keys (more reliable than parsed structured data)
    const rawSections = resume._raw_sections ?? {};
    const roleKeys = Object.keys(rawSections)
      .filter(k => k.startsWith('experience_role_'))
      .sort();
    if (roleKeys.length > 0) {
      const lines = ['PROFESSIONAL EXPERIENCE'];
      for (const key of roleKeys) {
        const text = rawSections[key];
        if (!text?.trim()) continue;
        // Strip duplicate heading if LLM included one, then add the role text
        const cleaned = text.replace(/^\s*PROFESSIONAL EXPERIENCE\s*\n?/i, '').trim();
        lines.push(cleaned, '');
      }
      const earlier = rawSections.earlier_career;
      if (earlier?.trim()) {
        lines.push(earlier.trim(), '');
      }
      return lines;
    }

    if (!Array.isArray(resume.experience) || resume.experience.length === 0) {
      if (typeof resume.experience === 'string') {
        return ['EXPERIENCE', extractProposedContent(resume.experience), ''];
      }
      return [];
    }
    const lines = ['PROFESSIONAL EXPERIENCE'];
    for (const exp of resume.experience) {
      lines.push(`${exp.title} | ${exp.company}`);
      lines.push(`${exp.start_date} – ${exp.end_date}${exp.location ? ` | ${exp.location}` : ''}`);
      for (const bullet of exp.bullets ?? []) {
        lines.push(`  • ${bullet.text}`);
      }
      lines.push('');
    }
    return lines;
  },
  skills: (resume) => {
    // Prefer raw section text if categories are richer there
    const rawSkills = resume._raw_sections?.skills;
    if (rawSkills?.trim()) {
      const cleaned = rawSkills.replace(/^\s*(?:SKILLS|CORE COMPETENCIES)\s*\n?/i, '').trim();
      if (cleaned) return ['CORE COMPETENCIES', cleaned, ''];
    }
    if (typeof resume.skills === 'object' && !Array.isArray(resume.skills) && Object.keys(resume.skills).length > 0) {
      const lines = ['CORE COMPETENCIES'];
      for (const [category, items] of Object.entries(resume.skills)) {
        lines.push(`${category}: ${Array.isArray(items) ? items.join(', ') : String(items)}`);
      }
      lines.push('');
      return lines;
    }
    if (typeof resume.skills === 'string') return ['CORE COMPETENCIES', resume.skills, ''];
    return [];
  },
  education: (resume) => {
    if (Array.isArray(resume.education) && resume.education.length > 0) {
      const lines = ['EDUCATION'];
      for (const edu of resume.education) {
        lines.push(`${edu.degree} in ${edu.field}, ${edu.institution} (${edu.year})`);
      }
      lines.push('');
      return lines;
    }
    if (typeof resume.education === 'string') return ['EDUCATION', resume.education, ''];
    return [];
  },
  certifications: (resume) => {
    if (Array.isArray(resume.certifications) && resume.certifications.length > 0) {
      const lines = ['CERTIFICATIONS'];
      for (const cert of resume.certifications) {
        lines.push(`${cert.name} — ${cert.issuer} (${cert.year})`);
      }
      return lines;
    }
    if (typeof resume.certifications === 'string') return ['CERTIFICATIONS', resume.certifications];
    return [];
  },
};

function contactHeaderText(contactInfo: ContactInfo): string[] {
  const lines: string[] = [];
  if (contactInfo.name) {
    lines.push(contactInfo.name.toUpperCase());
  }
  const parts: string[] = [];
  if (contactInfo.email) parts.push(contactInfo.email);
  if (contactInfo.phone) parts.push(contactInfo.phone);
  if (contactInfo.linkedin) parts.push(contactInfo.linkedin);
  if (contactInfo.location) parts.push(contactInfo.location);
  if (parts.length > 0) {
    lines.push(parts.join(' | '));
  }
  if (lines.length > 0) {
    lines.push('═'.repeat(60));
    lines.push('');
  }
  return lines;
}

export function resumeToText(resume: FinalResume): string {
  const hasStructuredContent =
    !!resume.summary?.trim() ||
    (Array.isArray(resume.experience) && resume.experience.length > 0) ||
    (resume.skills && Object.keys(resume.skills).length > 0) ||
    (Array.isArray(resume.education) && resume.education.length > 0) ||
    (Array.isArray(resume.certifications) && resume.certifications.length > 0);

  // Fallback path: raw section text only when structured content is unavailable.
  const rawSections = resume._raw_sections;
  if (!hasStructuredContent && rawSections && Object.keys(rawSections).length > 0) {
    const order = resume.section_order ?? Object.keys(rawSections);
    return order
      .map(name => rawSections[name])
      .filter(Boolean)
      .join('\n\n');
  }

  // Preferred path: structured resume data.
  const lines: string[] = [];

  // Contact header
  if (resume.contact_info?.name) {
    lines.push(...contactHeaderText(resume.contact_info));
  }

  // Render sections in order
  const order = resume.section_order ?? DEFAULT_SECTION_ORDER;
  const rendered = new Set<string>();

  let experienceRendered = false;
  for (const sectionName of order) {
    // Map experience_role_* and earlier_career to the single experience renderer
    if (sectionName.startsWith('experience_role_') || sectionName === 'earlier_career') {
      if (!experienceRendered) {
        lines.push(...textSectionRenderers.experience(resume));
        rendered.add('experience');
        experienceRendered = true;
      }
      continue;
    }
    const renderer = textSectionRenderers[sectionName];
    if (renderer) {
      lines.push(...renderer(resume));
      rendered.add(sectionName);
    } else {
      console.warn(`[export] Unknown section in section_order: ${sectionName}`);
    }
  }

  // Render any remaining sections not in the order list
  for (const sectionName of DEFAULT_SECTION_ORDER) {
    if (!rendered.has(sectionName)) {
      const renderer = textSectionRenderers[sectionName];
      if (renderer) {
        lines.push(...renderer(resume));
      }
    }
  }

  return lines.join('\n');
}

export function downloadAsText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  saveBlobWithFilename(blob, filename, 'txt');
}
