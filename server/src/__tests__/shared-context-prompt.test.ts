import { describe, expect, it } from 'vitest';

import { createEmptySharedContext } from '../contracts/shared-context.js';
import { summarizeEvidenceInventory, type EvidenceItem } from '../contracts/shared-evidence.js';
import {
  renderClientProfileSection,
  renderCareerProfileSection,
  renderCareerNarrativeSection,
  renderBenchmarkProfileDirectionSection,
  renderEvidenceInventorySection,
  renderLinkedInAnalysisSection,
  renderPositioningStrategySection,
  renderTargetingSummaryLines,
  renderWhyMeStorySection,
} from '../contracts/shared-context-prompt.js';

function makeEvidenceItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'ev_1',
    level: 'DirectProof',
    statement: 'Led a turnaround that reduced operating costs by 18%.',
    sourceType: 'resume_bullet',
    sourceArtifactId: 'artifact-1',
    sourceExcerpt: 'Reduced operating costs by 18%',
    supports: ['operations leadership'],
    limitations: [],
    requiresConfirmation: false,
    finalArtifactEligible: true,
    riskLabel: 'Low',
    confidence: 'High',
    provenance: {
      origin: 'platform_context',
      sourceProduct: 'resume_v2',
      sourceSessionId: 'sess-1',
      sourceContextType: 'evidence_item',
      mapper: 'test',
    },
    ...overrides,
  };
}

describe('shared-context prompt formatter', () => {
  it('renders targeting summary lines from canonical shared context', () => {
    const shared = createEmptySharedContext();
    shared.targetRole.roleTitle = 'VP Operations';
    shared.targetRole.roleFamily = 'Operations';
    shared.industryContext.primaryIndustry = 'Manufacturing';

    const lines = renderTargetingSummaryLines(shared);

    expect(lines).toContain('- Target role: VP Operations');
    expect(lines).toContain('- Role family: Operations');
    expect(lines).toContain('- Target industry: Manufacturing');
  });

  it('renders positioning strategy details without dumping raw JSON', () => {
    const shared = createEmptySharedContext();
    shared.positioningStrategy.positioningAngle = 'Transformational operator';
    shared.positioningStrategy.supportingThemes = ['Scale', 'Execution'];
    shared.positioningStrategy.riskAreas = ['Needs clearer P&L evidence'];

    const lines = renderPositioningStrategySection({
      heading: '## Prior Positioning Strategy',
      sharedStrategy: shared.positioningStrategy,
    });

    expect(lines.join('\n')).toContain('Transformational operator');
    expect(lines.join('\n')).toContain('Scale, Execution');
    expect(lines.join('\n')).toContain('Needs clearer P&L evidence');
  });

  it('renders legacy positioning theme fields into readable strategy lines', () => {
    const lines = renderPositioningStrategySection({
      heading: '## Prior Positioning Strategy',
      legacyStrategy: {
        theme: 'digital transformation',
        themes: ['operating model redesign'],
      },
    });

    const text = lines.join('\n');
    expect(text).toContain('digital transformation');
    expect(text).toContain('operating model redesign');
  });

  it('renders benchmark profile direction as approved guidance plus guardrails', () => {
    const shared = createEmptySharedContext();
    shared.benchmarkCandidate.benchmarkSummary = 'Enterprise operator who turns ambiguity into delivery clarity.';
    shared.benchmarkCandidate.benchmarkWins = ['22,000-user Salesforce delivery proof'];
    shared.benchmarkCandidate.benchmarkSignals = ['Salesforce CRM', 'requirements traceability'];
    shared.positioningStrategy.approvedFraming = ['I bring order to complex enterprise delivery.'];
    shared.positioningStrategy.riskAreas = ['Do not claim direct architecture ownership without confirmation.'];
    shared.positioningStrategy.framingStillRequiringConfirmation = ['Confirm API ownership depth.'];
    shared.workflowState.pendingApprovals = 2;
    shared.workflowState.pendingQuestions = 1;

    const lines = renderBenchmarkProfileDirectionSection({
      heading: '## Benchmark Profile Direction',
      sharedContext: shared,
    });

    const text = lines.join('\n');
    expect(text).toContain('Enterprise operator who turns ambiguity into delivery clarity.');
    expect(text).toContain('I bring order to complex enterprise delivery.');
    expect(text).toContain('22,000-user Salesforce delivery proof');
    expect(text).toContain('Do not claim direct architecture ownership without confirmation.');
    expect(text).toContain('2 pending approvals, 1 pending discovery questions');
  });

  it('renders shared evidence inventory with evidence labels', () => {
    const inventory = summarizeEvidenceInventory([
      makeEvidenceItem(),
      makeEvidenceItem({
        id: 'ev_2',
        level: 'StrongAdjacentProof',
        statement: 'Built scorecards used in weekly operating reviews.',
        requiresConfirmation: true,
        riskLabel: 'Moderate',
        confidence: 'Moderate',
      }),
    ]);

    const lines = renderEvidenceInventorySection({
      heading: '## Evidence Items',
      sharedInventory: inventory,
      maxItems: 5,
    });

    const text = lines.join('\n');
    expect(text).toContain('[DirectProof]');
    expect(text).toContain('[StrongAdjacentProof | needs confirmation]');
    expect(text).toContain('Built scorecards used in weekly operating reviews.');
  });

  it('renders legacy evidence into readable summaries', () => {
    const lines = renderEvidenceInventorySection({
      heading: '## Prior Evidence Items',
      legacyEvidence: [
        { situation: 'Scaled team', action: 'Hired 20 engineers', result: '40% faster releases' },
      ],
      maxItems: 5,
    });

    const text = lines.join('\n');
    expect(text).toContain('Scaled team');
    expect(text).toContain('Hired 20 engineers');
    expect(text).toContain('40% faster releases');
  });

  it('renders career narrative as stable summary lines', () => {
    const shared = createEmptySharedContext();
    shared.careerNarrative.careerArc = 'Scaled operations teams through multi-site turnarounds.';
    shared.careerNarrative.signatureStrengths = ['Operational discipline', 'Leadership under pressure'];

    const lines = renderCareerNarrativeSection({
      heading: '## Career Narrative',
      sharedNarrative: shared.careerNarrative,
    });

    const text = lines.join('\n');
    expect(text).toContain('Scaled operations teams through multi-site turnarounds.');
    expect(text).toContain('Operational discipline, Leadership under pressure');
  });

  it('renders legacy career profile into readable prompt lines', () => {
    const lines = renderCareerProfileSection({
      heading: '## Career Profile',
      legacyCareerProfile: {
        profile_summary: 'Transformation executive',
        targeting: {
          target_roles: ['COO'],
          target_industries: ['Tech'],
          seniority: 'C-suite',
        },
        positioning: {
          positioning_statement: 'Transformation executive',
          core_strengths: ['Digital transformation'],
          differentiators: ['Operator'],
          leadership_scope: 'Global',
        },
      },
    });

    const text = lines.join('\n');
    expect(text).toContain('Transformation executive');
    expect(text).toContain('COO');
    expect(text).toContain('Digital transformation');
    expect(text).toContain('Global');
  });

  it('renders why-me story into readable prompt lines', () => {
    const lines = renderWhyMeStorySection({
      heading: '## Why-Me Story',
      legacyWhyMeStory: {
        colleaguesCameForWhat: 'fixing broken teams',
        knownForWhat: 'turnaround leadership',
        whyNotMe: 'deep operational experience others lack',
      },
    });

    const text = lines.join('\n');
    expect(text).toContain('fixing broken teams');
    expect(text).toContain('turnaround leadership');
    expect(text).toContain('deep operational experience others lack');
  });

  it('renders legacy client profile into readable prompt lines', () => {
    const lines = renderClientProfileSection({
      heading: '## Client Profile',
      legacyClientProfile: {
        career_level: 'vp',
        industry: 'Industrial',
        years_experience: 18,
        financial_segment: 'ideal',
        transition_type: 'voluntary',
        goals: ['Board role'],
        constraints: ['Chicago'],
        strengths_self_reported: ['Turnarounds'],
        urgency_score: 4,
        recommended_starting_point: 'resume',
        coaching_tone: 'direct',
      },
    });

    const text = lines.join('\n');
    expect(text).toContain('vp');
    expect(text).toContain('Industrial');
    expect(text).toContain('Board role');
    expect(text).toContain('Turnarounds');
    expect(text).toContain('resume');
  });

  it('renders legacy LinkedIn analysis into readable prompt lines', () => {
    const lines = renderLinkedInAnalysisSection({
      heading: '## LinkedIn Profile Analysis',
      legacyLinkedInAnalysis: {
        keyword_analysis: {
          coverage_score: 42,
          missing_keywords: ['Cloud', 'DevOps'],
          recommended_keywords: ['Platform'],
        },
        profile_analysis: {
          headline_assessment: 'Needs stronger target-role language',
          about_assessment: 'Good story, weak keyword density',
          positioning_gaps: ['Target role not explicit'],
          strengths: ['Strong leadership tone'],
        },
      },
    });

    const text = lines.join('\n');
    expect(text).toContain('42%');
    expect(text).toContain('Cloud, DevOps');
    expect(text).toContain('Needs stronger target-role language');
    expect(text).toContain('Strong leadership tone');
  });
});
