import type { FinalResume } from '@/types/resume';

export function resumeToText(resume: FinalResume): string {
  const lines: string[] = [];

  if (resume.summary) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push(resume.summary);
    lines.push('');
  }

  if (resume.selected_accomplishments) {
    lines.push('SELECTED ACCOMPLISHMENTS');
    lines.push(resume.selected_accomplishments);
    lines.push('');
  }

  if (resume.experience) {
    if (Array.isArray(resume.experience) && resume.experience.length > 0) {
      lines.push('EXPERIENCE');
      for (const exp of resume.experience) {
        lines.push(`${exp.title} | ${exp.company}`);
        lines.push(`${exp.start_date} – ${exp.end_date} | ${exp.location}`);
        for (const bullet of exp.bullets ?? []) {
          lines.push(`  • ${bullet.text}`);
        }
        lines.push('');
      }
    } else if (typeof resume.experience === 'string') {
      lines.push('EXPERIENCE');
      lines.push(resume.experience);
      lines.push('');
    }
  }

  if (resume.skills) {
    if (typeof resume.skills === 'object' && !Array.isArray(resume.skills) && Object.keys(resume.skills).length > 0) {
      lines.push('SKILLS');
      for (const [category, items] of Object.entries(resume.skills)) {
        lines.push(`${category}: ${Array.isArray(items) ? items.join(', ') : String(items)}`);
      }
      lines.push('');
    } else if (typeof resume.skills === 'string') {
      lines.push('SKILLS');
      lines.push(resume.skills);
      lines.push('');
    }
  }

  if (resume.education) {
    if (Array.isArray(resume.education) && resume.education.length > 0) {
      lines.push('EDUCATION');
      for (const edu of resume.education) {
        lines.push(`${edu.degree} in ${edu.field}, ${edu.institution} (${edu.year})`);
      }
      lines.push('');
    } else if (typeof resume.education === 'string') {
      lines.push('EDUCATION');
      lines.push(resume.education);
      lines.push('');
    }
  }

  if (resume.certifications) {
    if (Array.isArray(resume.certifications) && resume.certifications.length > 0) {
      lines.push('CERTIFICATIONS');
      for (const cert of resume.certifications) {
        lines.push(`${cert.name} — ${cert.issuer} (${cert.year})`);
      }
    } else if (typeof resume.certifications === 'string') {
      lines.push('CERTIFICATIONS');
      lines.push(resume.certifications);
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
