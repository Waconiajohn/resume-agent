import type { PanelData } from '@/types/panels';
import { validatePanelData } from './panel-renderer';

let hasRun = false;

function samplePanels(): PanelData[] {
  return [
    { type: 'onboarding_summary', strengths: ['Execution'] },
    {
      type: 'research_dashboard',
      company: {},
      jd_requirements: {},
      benchmark: {
        required_skills: [],
        experience_expectations: '',
        culture_fit_traits: [],
        communication_style: '',
        industry_standards: [],
        competitive_differentiators: [],
        language_keywords: [],
        ideal_candidate_summary: '',
      },
    },
    {
      type: 'gap_analysis',
      requirements: [],
      strong_count: 0,
      partial_count: 0,
      gap_count: 0,
      total: 0,
      addressed: 0,
    },
    { type: 'design_options', options: [] },
    { type: 'live_resume', active_section: 'summary', changes: [] },
    { type: 'quality_dashboard', ats_score: 0, keyword_coverage: 0, authenticity_score: 0 },
    { type: 'completion', ats_score: 0 },
    { type: 'positioning_interview', questions_total: 6, questions_answered: 0 },
    {
      type: 'blueprint_review',
      target_role: 'Target Role',
      positioning_angle: 'Positioning angle',
      section_plan: { order: ['summary', 'experience'], rationale: 'Coverage' },
      age_protection: { clean: true, flags: [] },
      evidence_allocation_count: 0,
      keyword_count: 0,
    },
    { type: 'section_review', section: 'summary', content: 'Example section content' },
  ];
}

export function runPanelPayloadSmokeChecks(): void {
  if (hasRun || import.meta.env.PROD) return;
  hasRun = true;

  const failures = samplePanels()
    .map((panel) => ({ panel: panel.type, error: validatePanelData(panel) }))
    .filter((result) => !!result.error);

  if (failures.length > 0) {
    console.warn('[panel-smoke] Panel payload validation failures detected:', failures);
  }
}
