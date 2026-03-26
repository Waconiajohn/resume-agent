/** Shared humanize helpers for scoring report and tone analysis */

export function humanizeIssueType(issue: string): string {
  const labels: Record<string, string> = {
    'banned_phrase': 'Banned Phrase Detected',
    'generic_filler': 'Generic Filler Language',
    'passive_voice': 'Passive Voice',
    'junior_language': 'Junior-Level Language',
    'ai_generated': 'AI-Generated Sounding',
    'weak_verb': 'Weak Action Verb',
    'cliche': 'Resume Cliche',
  };
  return labels[issue] ?? issue.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function humanizeSectionName(section: string): string {
  const labels: Record<string, string> = {
    'summary': 'Executive Summary',
    'executive_summary': 'Executive Summary',
    'experience': 'Professional Experience',
    'professional_experience': 'Professional Experience',
    'education': 'Education',
    'skills': 'Skills & Competencies',
    'certifications': 'Certifications',
    'accomplishments': 'Key Accomplishments',
    'selected_accomplishments': 'Key Accomplishments',
    'projects': 'Projects',
    'headline': 'Resume Headline',
    'contact': 'Contact Information',
  };
  return labels[section.toLowerCase()] ?? section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
