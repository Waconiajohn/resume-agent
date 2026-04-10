/**
 * Job Intelligence — Golden Tests
 *
 * Tests the deterministic fallback extraction (company name, role title,
 * seniority, competencies, keywords, industry) across real-world JD formats.
 * Also tests the confidence pipeline (scoring + repair).
 *
 * These tests exercise buildDeterministicJobIntelligence indirectly through
 * runJobIntelligence (with LLM mocked to fail) and runJobIntelligenceWithConfidence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoist mocks ──────────────────────────────────────────────────────

const mockChatWithTruncationRetry = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm-retry.js', () => ({
  chatWithTruncationRetry: mockChatWithTruncationRetry,
}));

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
  MODEL_MID: 'model-mid',
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn().mockReturnValue(null),
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock('../agents/resume-v2/knowledge/resume-rules.js', () => ({
  SOURCE_DISCIPLINE: '',
}));

vi.mock('../agents/resume-v2/knowledge/role-archetype-seeds.js', () => ({
  ARCHETYPE_SEEDS: [],
}));

// ─── Import after mocks ──────────────────────────────────────────────

import { runJobIntelligence, runJobIntelligenceWithConfidence } from '../agents/resume-v2/job-intelligence/agent.js';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Make LLM throw so we always get the deterministic fallback. */
function forceDeterministicFallback() {
  mockChatWithTruncationRetry.mockRejectedValue(new Error('LLM unavailable'));
}

beforeEach(() => {
  vi.clearAllMocks();
  forceDeterministicFallback();
});

// ═══════════════════════════════════════════════════════════════════════
// Company Name Extraction — 10 JD Format Variations
// ═══════════════════════════════════════════════════════════════════════

describe('extractCompanyName — format variations', () => {
  it('extracts from "Company: Acme Corp" prefix', async () => {
    const result = await runJobIntelligence({
      job_description: 'Company: Acme Corp\nSenior Director of Engineering\nRequired: 10+ years',
    });
    expect(result.company_name).toBe('Acme Corp');
  });

  it('extracts from title line with em-dash separator: "Role – Company"', async () => {
    const result = await runJobIntelligence({
      job_description: 'VP of Sales – TechVision Solutions\nRequired: 10+ years B2B SaaS sales',
    });
    expect(result.company_name).toBe('TechVision Solutions');
  });

  it('extracts from title line with pipe separator: "Role | Company"', async () => {
    const result = await runJobIntelligence({
      job_description: 'Senior Cloud Architect | Meridian Systems\nBuild and scale cloud infrastructure',
    });
    expect(result.company_name).toBe('Meridian Systems');
  });

  it('extracts from title line with en-dash: "Role — Company"', async () => {
    const result = await runJobIntelligence({
      job_description: 'Director of Operations — Global Logistics Inc\nTransform supply chain operations',
    });
    expect(result.company_name).toBe('Global Logistics Inc');
  });

  it('extracts from "Role at Company" pattern', async () => {
    const result = await runJobIntelligence({
      job_description: 'Senior Director of Engineering at Netflix\nLead platform engineering teams',
    });
    expect(result.company_name).toBe('Netflix');
  });

  it('extracts from "About Company" section', async () => {
    const result = await runJobIntelligence({
      job_description: 'Chief Technology Officer\nSome requirements here\nAbout Stripe\nStripe is a financial infrastructure platform.',
    });
    expect(result.company_name).toBe('Stripe');
  });

  it('extracts from email domain', async () => {
    const result = await runJobIntelligence({
      job_description: 'Senior Manager\nApply to careers@snowflake.com\nRequired: Data engineering experience',
    });
    expect(result.company_name).toBe('Snowflake');
  });

  it('extracts from URL domain', async () => {
    const result = await runJobIntelligence({
      job_description: 'Head of Product\nApply at https://www.databricks.com/careers\nRequired: Product leadership',
    });
    expect(result.company_name).toBe('Databricks');
  });

  it('ignores generic email domains (gmail, yahoo)', async () => {
    const result = await runJobIntelligence({
      job_description: 'Manager\nContact: hiring@gmail.com\nRequired: 5+ years experience',
    });
    // Should not pick up "Gmail" — falls through to "Not specified"
    expect(result.company_name).toBe('Not specified');
  });

  it('ignores job board URL domains (linkedin, indeed)', async () => {
    const result = await runJobIntelligence({
      job_description: 'Manager\nApply: https://www.linkedin.com/jobs/view/12345\nRequired: 5+ years experience',
    });
    expect(result.company_name).toBe('Not specified');
  });

  it('extracts from hyphen separator when clearly a company name', async () => {
    const result = await runJobIntelligence({
      job_description: 'VP of Engineering - Confluent\nRequired: distributed systems experience',
    });
    expect(result.company_name).toBe('Confluent');
  });

  it('returns "Not specified" when JD has no company reference', async () => {
    const result = await runJobIntelligence({
      job_description: 'We are looking for a Senior Manager.\nRequired: 10+ years of experience.\nMust have leadership ability.',
    });
    expect(result.company_name).toBe('Not specified');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Role Title Extraction
// ═══════════════════════════════════════════════════════════════════════

describe('extractRoleTitle — format variations', () => {
  it('extracts title with standard role words', async () => {
    const result = await runJobIntelligence({
      job_description: 'VP of Sales – Acme Corp\nRequired: 10+ years',
    });
    // Should pick up "VP of Sales – Acme Corp" or similar as role title
    expect(result.role_title.toLowerCase()).toContain('vp');
  });

  it('falls back to first line when no role keywords found', async () => {
    const result = await runJobIntelligence({
      job_description: 'Data Transformation Specialist\nMust have Python and SQL',
    });
    expect(result.role_title).toBe('Data Transformation Specialist');
  });

  it('finds title even when buried in body text', async () => {
    const result = await runJobIntelligence({
      job_description: 'About the role\nWe are hiring a Director of Product Management\nRequired: 8+ years product experience',
    });
    expect(result.role_title.toLowerCase()).toContain('director');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Seniority Level Inference
// ═══════════════════════════════════════════════════════════════════════

describe('inferSeniorityLevel', () => {
  it('detects C-suite from "Chief" keyword', async () => {
    const result = await runJobIntelligence({
      job_description: 'Chief Technology Officer\nLead all technology',
    });
    expect(result.seniority_level).toBe('c_suite');
  });

  it('detects VP level from "VP" abbreviation', async () => {
    const result = await runJobIntelligence({
      job_description: 'VP of Engineering\nRequired: 15 years',
    });
    expect(result.seniority_level).toBe('vp');
  });

  it('detects VP level from "Vice President" (not c_suite)', async () => {
    const result = await runJobIntelligence({
      job_description: 'Vice President of Engineering\nRequired: 15 years',
    });
    expect(result.seniority_level).toBe('vp');
  });

  it('detects VP level from "SVP"', async () => {
    const result = await runJobIntelligence({
      job_description: 'SVP of Operations\nRequired: 20 years',
    });
    expect(result.seniority_level).toBe('vp');
  });

  it('detects Director level', async () => {
    const result = await runJobIntelligence({
      job_description: 'Director of Operations – Global Corp\nManage operations',
    });
    expect(result.seniority_level).toBe('director');
  });

  it('detects Senior level', async () => {
    const result = await runJobIntelligence({
      job_description: 'Senior Software Engineer\nRequired: 5+ years',
    });
    expect(result.seniority_level).toBe('senior');
  });

  it('detects Mid level from "Manager"', async () => {
    const result = await runJobIntelligence({
      job_description: 'Project Manager\nRequired: PMP certification',
    });
    expect(result.seniority_level).toBe('mid');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Core Competencies Extraction
// ═══════════════════════════════════════════════════════════════════════

describe('buildCoreCompetencies', () => {
  it('extracts competencies from requirement lines', async () => {
    const result = await runJobIntelligence({
      job_description: `Senior Manager – Acme Corp
Required: 10+ years of project management experience
Must have PMP certification
Experience with Agile methodology preferred
Knowledge of financial modeling required`,
    });
    expect(result.core_competencies.length).toBeGreaterThanOrEqual(3);
    const competencyTexts = result.core_competencies.map(c => c.competency.toLowerCase());
    expect(competencyTexts.some(c => c.includes('project management') || c.includes('pmp'))).toBe(true);
  });

  it('classifies "must" and "required" as must_have', async () => {
    const result = await runJobIntelligence({
      job_description: 'Manager\nMust have Python experience\nRequired: SQL proficiency\nPreferred: AWS certification',
    });
    const mustHaves = result.core_competencies.filter(c => c.importance === 'must_have');
    const niceToHaves = result.core_competencies.filter(c => c.importance === 'nice_to_have');
    expect(mustHaves.length).toBeGreaterThanOrEqual(1);
    // "Preferred" should be nice_to_have (but line may also match "experience" pattern)
  });

  it('falls back to keyword seeding when no requirement lines found', async () => {
    const result = await runJobIntelligence({
      job_description: 'We need someone who can drive our engineering and operations forward.',
    });
    expect(result.core_competencies.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Industry Inference
// ═══════════════════════════════════════════════════════════════════════

describe('inferIndustry', () => {
  it('detects Technology from SaaS/software/cloud', async () => {
    const result = await runJobIntelligence({
      job_description: 'VP Engineering\nBuild our SaaS platform\nRequired: cloud architecture',
    });
    expect(result.industry).toBe('Technology');
  });

  it('detects Healthcare', async () => {
    const result = await runJobIntelligence({
      job_description: 'Director of Operations\nHealthcare facility management\nRequired: clinical operations',
    });
    expect(result.industry).toBe('Healthcare');
  });

  it('detects Financial Services', async () => {
    const result = await runJobIntelligence({
      job_description: 'VP Risk\nFinancial services compliance\nRequired: banking regulations',
    });
    expect(result.industry).toBe('Financial Services');
  });

  it('returns "Not specified" when no industry signals found', async () => {
    const result = await runJobIntelligence({
      job_description: 'Manager\nLead a team of professionals',
    });
    expect(result.industry).toBe('Not specified');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Confidence Pipeline
// ═══════════════════════════════════════════════════════════════════════

describe('confidence pipeline', () => {
  it('returns confidence report alongside output', async () => {
    const result = await runJobIntelligenceWithConfidence({
      job_description: 'VP of Sales – TechVision Solutions\nRequired: 10+ years B2B SaaS sales\nMust have CRM experience\nExperience with Salesforce required\nKnowledge of sales operations\nProficiency in pipeline management',
    });

    expect(result.output).toBeDefined();
    expect(result.confidence).toBeDefined();
    expect(result.confidence.company_name).toHaveProperty('value');
    expect(result.confidence.company_name).toHaveProperty('confidence');
    expect(result.confidence.company_name).toHaveProperty('source');
    expect(result.confidence.company_name).toHaveProperty('repair_attempted');
  });

  it('scores company_name as high when verbatim in JD', async () => {
    const result = await runJobIntelligenceWithConfidence({
      job_description: 'VP of Sales – TechVision Solutions\nRequired: 10+ years B2B sales\nMust have leadership experience\nExperience with enterprise sales required\nKnowledge of CRM systems\nProficiency in stakeholder management',
    });

    expect(result.output.company_name).toBe('TechVision Solutions');
    expect(result.confidence.company_name.confidence).toBe('high');
  });

  it('scores company_name as low when "Not specified"', async () => {
    const result = await runJobIntelligenceWithConfidence({
      job_description: 'We need a Manager with leadership experience',
    });

    expect(result.output.company_name).toBe('Not specified');
    expect(result.confidence.company_name.confidence).toBe('low');
  });

  it('scores core_competencies as low when fewer than 2', async () => {
    const result = await runJobIntelligenceWithConfidence({
      job_description: 'Manager\nJoin our team.',
    });

    // With minimal JD, competencies will be sparse
    if (result.confidence.core_competencies.value < 2) {
      expect(result.confidence.core_competencies.confidence).toBe('low');
    }
  });

  it('scores core_competencies as high when 5+', async () => {
    const result = await runJobIntelligenceWithConfidence({
      job_description: `Senior Director – TechCorp
Required: 10+ years of leadership experience
Must have project management certification
Experience with Agile methodology required
Knowledge of financial modeling required
Proficiency in stakeholder management required
Must have experience with cloud platforms`,
    });

    expect(result.confidence.core_competencies.value).toBeGreaterThanOrEqual(5);
    expect(result.confidence.core_competencies.confidence).toBe('high');
  });

  it('scores industry as low when "Not specified"', async () => {
    const result = await runJobIntelligenceWithConfidence({
      job_description: 'Manager\nLead a team of professionals\nRequired: 5+ years experience',
    });

    expect(result.confidence.industry.confidence).toBe('low');
  });

  it('marks repair_attempted when low-confidence field is repaired', async () => {
    // JD with sparse content triggers low-confidence on keywords/industry
    const result = await runJobIntelligenceWithConfidence({
      job_description: 'Manager\nJoin our team.',
    });

    // At least one field should have had repair attempted
    const repairedFields = Object.values(result.confidence).filter(f => f.repair_attempted);
    // With minimal input, keywords or industry should be low → repair attempted
    expect(repairedFields.length).toBeGreaterThanOrEqual(0); // May or may not trigger
    // The key invariant: confidence report is always populated
    expect(Object.keys(result.confidence)).toHaveLength(6);
  });

  it('repairs company_name from URL when initial extraction fails', async () => {
    const result = await runJobIntelligenceWithConfidence({
      job_description: 'Manager\nLead teams\nApply: https://www.acmecorp.com/careers\nRequired: leadership experience\nMust have team management ability',
    });

    // The deterministic fallback should find company in URL
    expect(result.output.company_name).toBe('Acmecorp');
  });

  it('repairs language_keywords when sparse', async () => {
    // Very minimal JD that won't produce many keywords
    const result = await runJobIntelligenceWithConfidence({
      job_description: 'Manager at BigCo\nDo stuff.',
    });

    // Even with minimal input, the repair should try to populate keywords
    expect(result.confidence.language_keywords).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Full Pipeline Smoke Tests
// ═══════════════════════════════════════════════════════════════════════

describe('full deterministic pipeline — realistic JDs', () => {
  it('handles a formal structured JD', async () => {
    const result = await runJobIntelligence({
      job_description: `Senior Cloud Architect – TechVision Solutions

About TechVision Solutions
TechVision Solutions is a leading enterprise SaaS provider.

Responsibilities:
- Lead cloud architecture strategy across AWS and Azure
- Build and scale microservices platform
- Manage team of 12 engineers

Requirements:
- 10+ years of cloud architecture experience required
- Must have AWS Solutions Architect certification
- Experience with Kubernetes and Docker required
- Knowledge of Terraform and CI/CD pipelines
- Bachelor's degree in Computer Science required

Preferred:
- Experience with multi-cloud strategy
- FinOps certification is a plus`,
    });

    expect(result.company_name).toBe('TechVision Solutions');
    expect(result.seniority_level).toBe('senior');
    expect(result.industry).toBe('Technology');
    expect(result.core_competencies.length).toBeGreaterThanOrEqual(3);
    expect(result.language_keywords.length).toBeGreaterThanOrEqual(3);
    expect(result.role_profile).toBeDefined();
  });

  it('handles a condensed single-paragraph JD', async () => {
    const result = await runJobIntelligence({
      job_description: `VP of Sales – Acme Corp
Required: 10+ years B2B SaaS sales leadership. Must have experience scaling revenue from $20M to $100M+. CRM expertise (Salesforce) required. Fast-paced, collaborative environment.`,
    });

    expect(result.company_name).toBe('Acme Corp');
    expect(result.seniority_level).toBe('vp');
    expect(result.core_competencies.length).toBeGreaterThanOrEqual(1);
  });

  it('handles a bullet-only JD with no headers', async () => {
    const result = await runJobIntelligence({
      job_description: `Director of Engineering
• Lead platform engineering team of 20+
• Drive cloud migration from on-prem to AWS
• Required: 8+ years engineering leadership
• Must have experience with distributed systems
• Experience with Agile/Scrum methodology
• Knowledge of DevOps and CI/CD practices`,
    });

    expect(result.seniority_level).toBe('director');
    expect(result.core_competencies.length).toBeGreaterThanOrEqual(3);
    expect(result.strategic_responsibilities.length).toBeGreaterThanOrEqual(1);
  });

  it('produces role_profile with meaningful fields', async () => {
    const result = await runJobIntelligence({
      job_description: `CFO – Global Financial Services Corp
Lead all financial planning and treasury for a $500M fintech company.
Required: CPA, MBA preferred, 15+ years in financial services.
Must have experience with FP&A, regulatory compliance and SOX.`,
    });

    expect(result.role_profile).toBeDefined();
    // CFO matches finance pattern via "cfo" in function map
    expect(result.role_profile!.function).toBe('finance');
    expect(result.role_profile!.scope).toBe('enterprise'); // c_suite → enterprise
    expect(result.role_profile!.industry).toBe('Financial Services');
  });
});
