import { describe, expect, it } from 'vitest';

import { createEmptySharedContext } from '../contracts/shared-context.js';
import { summarizeEvidenceInventory, type EvidenceItem } from '../contracts/shared-evidence.js';
import {
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
  renderTargetingSummaryLines,
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
});
