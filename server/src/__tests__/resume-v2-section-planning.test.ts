import { describe, expect, it } from 'vitest';

import { applySectionPlanning, buildWriterSectionStrategy } from '../agents/resume-v2/section-planning.js';
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
    quantified_outcomes: [
      {
        outcome: 'improved throughput by 18%',
        metric_type: 'scope',
        value: '18%',
      },
    ],
    industry_depth: ['Manufacturing'],
    technologies: ['SAP'],
    operational_scale: '3 sites',
    career_span_years: 20,
    experience: [
      {
        company: 'Acme',
        title: 'COO',
        start_date: '2020',
        end_date: 'Present',
        bullets: ['Led enterprise operating-model redesign across three sites.'],
      },
    ],
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
      {
        requirement: 'Lead enterprise-wide transformation programs and critical initiatives',
        source: 'job_description',
        importance: 'important',
        classification: 'partial',
        evidence: ['Led enterprise operating-model redesign across three sites.'],
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
      {
        id: 'wi-projects',
        requirement: 'Lead enterprise-wide transformation programs and critical initiatives',
        source: 'job_description',
        importance: 'important',
        candidate_evidence: [
          {
            text: 'Led enterprise operating-model redesign across three sites.',
            source_type: 'uploaded_resume',
            evidence_strength: 'direct',
          },
        ],
        best_evidence_excerpt: 'Led enterprise operating-model redesign across three sites.',
        recommended_bullet: 'Led enterprise-wide transformation programs across three sites.',
        proof_level: 'direct',
        framing_guardrail: 'exact',
        current_claim_strength: 'supported',
        next_best_action: 'accept',
      },
    ],
    pending_strategies: [],
  };
}

function makeNonAIRoleGapAnalysis(): GapAnalysisOutput {
  return {
    requirements: [
      {
        requirement: 'Own KPI development, scorecards, and operating rhythm',
        source: 'job_description',
        importance: 'must_have',
        classification: 'partial',
        evidence: ['Built weekly KPI reviews across 3 sites.'],
      },
    ],
    coverage_score: 82,
    strength_summary: 'Strong operator with clear KPI and operating-rhythm evidence.',
    critical_gaps: [],
    requirement_work_items: [
      {
        id: 'wi-kpi',
        requirement: 'Own KPI development, scorecards, and operating rhythm',
        source: 'job_description',
        importance: 'must_have',
        candidate_evidence: [],
        proof_level: 'direct',
        framing_guardrail: 'exact',
        current_claim_strength: 'supported',
        next_best_action: 'accept',
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

  it('keeps AI highlights below competencies when the role does not explicitly value AI', () => {
    const result = applySectionPlanning(makeDraft(), makeCandidate(), makeNonAIRoleGapAnalysis());
    const order = result.section_plan?.map((item) => item.id) ?? [];

    expect(order).toContain('ai_highlights');
    expect(order.indexOf('ai_highlights')).toBeGreaterThan(order.indexOf('core_competencies'));
  });

  it('places recommended transformation sections before competencies and experience', () => {
    const result = applySectionPlanning(makeDraft(), makeCandidate(), makeGapAnalysis());
    const order = result.section_plan?.map((item) => item.id) ?? [];
    const transformationSection = result.custom_sections?.find((section) => section.id === 'transformation_highlights');

    expect(order).toContain('transformation_highlights');
    expect(order.indexOf('transformation_highlights')).toBeLessThan(order.indexOf('core_competencies'));
    expect(order.indexOf('transformation_highlights')).toBeLessThan(order.indexOf('professional_experience'));
    expect(transformationSection?.summary).toContain('Lead AI-enabled operations transformation');
  });

  it('adds selected projects when the role emphasizes initiatives and launches', () => {
    const result = applySectionPlanning(makeDraft(), makeCandidate(), makeGapAnalysis());
    const projectSection = result.custom_sections?.find((section) => section.id === 'selected_projects');

    expect(projectSection).toBeTruthy();
    expect(projectSection?.summary).toContain('Lead enterprise-wide transformation programs and critical initiatives');
    expect(projectSection?.lines ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Led enterprise-wide transformation programs across three sites'),
      ]),
    );
  });
});

describe('buildWriterSectionStrategy', () => {
  it('gives the writer concrete recommended section guidance with evidence lines', () => {
    const strategy = buildWriterSectionStrategy(makeCandidate(), makeGapAnalysis());
    const transformationSection = strategy.recommended_custom_sections.find((section) => section.id === 'transformation_highlights');

    expect(strategy.recommended_custom_sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['ai_highlights', 'transformation_highlights', 'selected_projects']),
    );
    expect(transformationSection?.summary).toContain('Lead AI-enabled operations transformation');
    expect(transformationSection?.lines ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Used automation and data workflows'),
      ]),
    );
    expect(strategy.guidance_lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Treat dedicated highlight sections as proof-above-the-fold content.'),
        expect.stringContaining('AI Leadership & Transformation'),
        expect.stringContaining('Transformation Highlights'),
        expect.stringContaining('Evidence 1:'),
      ]),
    );
  });
});
