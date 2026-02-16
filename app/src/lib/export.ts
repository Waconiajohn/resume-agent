import type { FinalResume, ContactInfo } from '@/types/resume';
import { DEFAULT_SECTION_ORDER } from '@/lib/constants';

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
    return ['SELECTED ACCOMPLISHMENTS', resume.selected_accomplishments, ''];
  },
  experience: (resume) => {
    if (!Array.isArray(resume.experience) || resume.experience.length === 0) {
      if (typeof resume.experience === 'string') {
        return ['EXPERIENCE', extractProposedContent(resume.experience), ''];
      }
      return [];
    }
    const lines = ['EXPERIENCE'];
    for (const exp of resume.experience) {
      lines.push(`${exp.title} | ${exp.company}`);
      lines.push(`${exp.start_date} – ${exp.end_date} | ${exp.location}`);
      for (const bullet of exp.bullets ?? []) {
        lines.push(`  • ${bullet.text}`);
      }
      lines.push('');
    }
    return lines;
  },
  skills: (resume) => {
    if (typeof resume.skills === 'object' && !Array.isArray(resume.skills) && Object.keys(resume.skills).length > 0) {
      const lines = ['SKILLS'];
      for (const [category, items] of Object.entries(resume.skills)) {
        lines.push(`${category}: ${Array.isArray(items) ? items.join(', ') : String(items)}`);
      }
      lines.push('');
      return lines;
    }
    if (typeof resume.skills === 'string') return ['SKILLS', resume.skills, ''];
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
  const lines: string[] = [];

  // Contact header
  if (resume.contact_info?.name) {
    lines.push(...contactHeaderText(resume.contact_info));
  }

  // Render sections in order
  const order = resume.section_order ?? DEFAULT_SECTION_ORDER;
  const rendered = new Set<string>();

  for (const sectionName of order) {
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
