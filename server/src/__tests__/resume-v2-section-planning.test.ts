import { describe, expect, it } from 'vitest';

import { applySectionPlanning } from '../agents/resume-v2/section-planning.js';
import type {
  CandidateIntelligenceOutput,
  GapAnalysisOutput,
  ResumeDraftOutput,
} from '../agents/resume-v2/types.js';

function makeDraft(): ResumeDraftOutput {
  return {
    header: {
      name: 'Jane Doe',
      phone: '555-1234',
      email: 'jane@example.com',
      branded_title: 'Enterprise Operator',
    },
    executive_summary: {
      content: 'Executive operator who scales teams and systems.',
      is_new: false,
    },
    core_competencies: ['Operations', 'Transformation'],
    selected_accomplishments: [
      {
        content: 'Built weekly KPI reviews across 3 sites.',
        is_new: false,
        addresses_requirements: ['KPI ownership'],
        source: 'original',
        confidence: 'partial',
        evidence_found: 'Built weekly KPI reviews across 3 sites.',
        requirement_source: 'job_description',
      },
    ],
    professional_experience: [
      {
        company: 'Acme',
        title: 'COO',
        start_date: '2020',
        end_date: 'Present',
        scope_statement: 'Led plant operations and continuous improvement.',
        scope_statement_source: 'original',
        scope_statement_confidence: 'strong',
        scope_statement_evidence_found: 'Led plant operations and continuous improvement.',
        bullets: [],
      },
    ],
    education: [],
    certifications: [],
  };
}

function makeCandidate(): CandidateIntelligenceOutput {
  return {
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-1234',
    },
    career_themes: ['Operations'],
    leadership_scope: 'Regional operations',
    quantified_outcomes: [],
    industry_depth: ['Manufacturing'],
    technologies: ['SAP'],
    operational_scale: '3 sites',
    career_span_years: 20,
    experience: [],
    education: [],
    certifications: [],
    hidden_accomplishments: [],
    raw_text: 'resume',
    ai_readiness: {
      strength: 'moderate',
      signals: [
        {
          family: 'automation',
          evidence: 'Rolled out workflow automation across plant operations.',
          executive_framing: 'Used automation and data workflows to tighten operating rhythm across multiple sites.',
        },
      ],
      summary: 'Demonstrated AI-adjacent readiness through automation and operating-model change.',
    },
  };
}

function makeGapAnalysis(): GapAnalysisOutput {
  return {
    requirements: [
      {
        requirement: 'Own KPI development, scorecards, and operating rhythm',
        source: 'job_description',
        importance: 'must_have',
        classification: 'partial',
        evidence: ['Built weekly KPI reviews across 3 sites.'],
      },
      {
        requirement: 'Lead AI-enabled operations transformation',
        source: 'benchmark',
        importance: 'important',
        classification: 'missing',
        evidence: [],
      },
    ],
    coverage_score: 70,
    strength_summary: 'Strong operator with room to sharpen AI transformation story.',
    critical_gaps: ['Lead AI-enabled operations transformation'],
    requirement_work_items: [
      {
        id: 'wi-ai',
        requirement: 'Lead AI-enabled operations transformation',
        source: 'benchmark',
        importance: 'important',
        candidate_evidence: [],
        proof_level: 'inferable',
        framing_guardrail: 'soft_inference',
        current_claim_strength: 'confirm_fit',
        next_best_action: 'confirm',
      },
    ],
    pending_strategies: [],
  };
}

describe('applySectionPlanning', () => {
  it('adds an AI highlights section when the candidate has AI-readiness evidence', () => {
    const result = applySectionPlanning(makeDraft(), makeCandidate(), makeGapAnalysis());

    expect(result.custom_sections?.find((section) => section.id === 'ai_highlights')).toBeTruthy();
    expect(result.section_plan?.map((item) => item.id)).toContain('ai_highlights');
  });

  it('moves AI highlights near the top when the role explicitly values AI', () => {
    const result = applySectionPlanning(makeDraft(), makeCandidate(), makeGapAnalysis());
    const order = result.section_plan?.map((item) => item.id) ?? [];

    expect(order[0]).toBe('executive_summary');
    expect(order[1]).toBe('selected_accomplishments');
    expect(order[2]).toBe('ai_highlights');
  });
});
