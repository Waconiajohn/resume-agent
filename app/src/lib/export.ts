import type { FinalResume } from '@/types/resume';

export function resumeToText(resume: FinalResume): string {
  const lines: string[] = [];

  if (resume.summary) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push(resume.summary);
    lines.push('');
  }

  if (resume.experience.length > 0) {
    lines.push('EXPERIENCE');
    for (const exp of resume.experience) {
      lines.push(`${exp.title} | ${exp.company}`);
      lines.push(`${exp.start_date} – ${exp.end_date} | ${exp.location}`);
      for (const bullet of exp.bullets) {
        lines.push(`  • ${bullet.text}`);
      }
      lines.push('');
    }
  }

  if (Object.keys(resume.skills).length > 0) {
    lines.push('SKILLS');
    for (const [category, items] of Object.entries(resume.skills)) {
      lines.push(`${category}: ${items.join(', ')}`);
    }
    lines.push('');
  }

  if (resume.education.length > 0) {
    lines.push('EDUCATION');
    for (const edu of resume.education) {
      lines.push(`${edu.degree} in ${edu.field}, ${edu.institution} (${edu.year})`);
    }
    lines.push('');
  }

  if (resume.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const cert of resume.certifications) {
      lines.push(`${cert.name} — ${cert.issuer} (${cert.year})`);
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
