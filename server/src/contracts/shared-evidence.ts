export type EvidenceLevel =
  | 'DirectProof'
  | 'StrongAdjacentProof'
  | 'SupportableInference'
  | 'BenchmarkInformedGap'
  | 'UserUnconfirmedClaim'
  | 'Unsupported'
  | 'HighOverreachRisk';

export type EvidenceRiskLabel = 'Low' | 'Moderate' | 'High' | 'Critical';
export type EvidenceConfidence = 'High' | 'Moderate' | 'Low';

export interface EvidenceProvenance {
  origin:
    | 'platform_context'
    | 'truth_verification'
    | 'benchmark_analysis'
    | 'gap_analysis'
    | 'compatibility_mapper'
    | 'unknown';
  sourceProduct?: string | null;
  sourceSessionId?: string | null;
  sourceContextType?: string | null;
  capturedAt?: string | null;
  mapper?: string;
}

export interface EvidenceItem {
  id: string;
  level: EvidenceLevel;
  statement: string;
  sourceType: string;
  sourceArtifactId?: string | null;
  sourceExcerpt?: string | null;
  supports: string[];
  limitations: string[];
  requiresConfirmation: boolean;
  finalArtifactEligible: boolean;
  riskLabel: EvidenceRiskLabel;
  confidence: EvidenceConfidence;
  provenance: EvidenceProvenance;
  metadata?: Record<string, unknown>;
}

export interface EvidenceInventorySummary {
  evidenceItems: EvidenceItem[];
  directProof: EvidenceItem[];
  adjacentProof: EvidenceItem[];
  unsupportedAreas: EvidenceItem[];
  overreachRisks: EvidenceItem[];
  artifactEligibleEvidenceIds: string[];
}

export type LegacyTruthConfidence = 'verified' | 'plausible' | 'unverified' | 'fabricated';

export interface LegacyTruthClaimLike {
  claim: string;
  section: string;
  source_found: boolean;
  source_text?: string;
  confidence: LegacyTruthConfidence;
  note?: string;
}

export interface LegacyPlatformEvidenceLike {
  text?: unknown;
  source?: unknown;
  category?: unknown;
  source_session_id?: unknown;
  created_at?: unknown;
  [key: string]: unknown;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function makeEvidenceId(parts: Array<string | null | undefined>): string {
  const normalized = parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(':')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return normalized ? `ev_${normalized}` : `ev_${Date.now()}`;
}

export function mapTruthConfidenceToEvidenceLevel(confidence: LegacyTruthConfidence): EvidenceLevel {
  switch (confidence) {
    case 'verified':
      return 'DirectProof';
    case 'plausible':
      return 'StrongAdjacentProof';
    case 'unverified':
      return 'UserUnconfirmedClaim';
    case 'fabricated':
    default:
      return 'HighOverreachRisk';
  }
}

export function evidenceConfidenceForLevel(level: EvidenceLevel): EvidenceConfidence {
  switch (level) {
    case 'DirectProof':
    case 'BenchmarkInformedGap':
      return 'High';
    case 'StrongAdjacentProof':
    case 'SupportableInference':
    case 'UserUnconfirmedClaim':
      return 'Moderate';
    case 'Unsupported':
    case 'HighOverreachRisk':
    default:
      return 'Low';
  }
}

export function evidenceRiskForLevel(level: EvidenceLevel): EvidenceRiskLabel {
  switch (level) {
    case 'DirectProof':
      return 'Low';
    case 'StrongAdjacentProof':
    case 'BenchmarkInformedGap':
      return 'Moderate';
    case 'SupportableInference':
    case 'UserUnconfirmedClaim':
      return 'High';
    case 'Unsupported':
    case 'HighOverreachRisk':
    default:
      return 'Critical';
  }
}

export function isEvidenceEligibleForFinalArtifact(item: EvidenceItem): boolean {
  if (!item.finalArtifactEligible) return false;
  if (item.requiresConfirmation) return false;

  return item.level === 'DirectProof' || item.level === 'StrongAdjacentProof';
}

export function mapTruthClaimToEvidenceItem(
  claim: LegacyTruthClaimLike,
  meta?: {
    sourceProduct?: string | null;
    sourceSessionId?: string | null;
    capturedAt?: string | null;
  },
): EvidenceItem {
  const level = mapTruthConfidenceToEvidenceLevel(claim.confidence);
  const requiresConfirmation = level !== 'DirectProof';
  const finalArtifactEligible = level === 'DirectProof' || level === 'StrongAdjacentProof';
  const limitationNote = normalizeText(claim.note);

  return {
    id: makeEvidenceId(['truth', claim.section, claim.claim]),
    level,
    statement: claim.claim.trim(),
    sourceType: 'truth_verification_claim',
    sourceArtifactId: meta?.sourceSessionId ?? null,
    sourceExcerpt: normalizeText(claim.source_text) || null,
    supports: normalizeText(claim.section) ? [claim.section] : [],
    limitations: limitationNote ? [limitationNote] : [],
    requiresConfirmation,
    finalArtifactEligible,
    riskLabel: evidenceRiskForLevel(level),
    confidence: evidenceConfidenceForLevel(level),
    provenance: {
      origin: 'truth_verification',
      sourceProduct: meta?.sourceProduct ?? 'resume_v2',
      sourceSessionId: meta?.sourceSessionId ?? null,
      capturedAt: meta?.capturedAt ?? null,
      mapper: 'mapTruthClaimToEvidenceItem',
    },
    metadata: {
      source_found: claim.source_found,
      section: claim.section,
      legacy_confidence: claim.confidence,
    },
  };
}

export function mapLegacyPlatformEvidenceToEvidenceItem(
  raw: LegacyPlatformEvidenceLike,
  meta?: {
    sourceProduct?: string | null;
    sourceContextType?: string | null;
    sourceArtifactId?: string | null;
    capturedAt?: string | null;
  },
): EvidenceItem | null {
  const statement = normalizeText(raw.text);
  if (!statement) return null;

  const source = normalizeText(raw.source).toLowerCase();
  const category = normalizeText(raw.category);

  const level: EvidenceLevel = source === 'upgraded'
    ? 'StrongAdjacentProof'
    : 'DirectProof';

  const requiresConfirmation = level === 'StrongAdjacentProof';
  const finalArtifactEligible = level === 'DirectProof' || level === 'StrongAdjacentProof';

  return {
    id: makeEvidenceId(['platform', category || source, statement]),
    level,
    statement,
    sourceType: source || 'legacy_evidence_item',
    sourceArtifactId: normalizeText(raw.source_session_id) || meta?.sourceArtifactId || null,
    sourceExcerpt: statement,
    supports: category ? [category] : [],
    limitations: source === 'upgraded' ? ['Legacy upgraded evidence should remain reviewable until richer provenance exists.'] : [],
    requiresConfirmation,
    finalArtifactEligible,
    riskLabel: evidenceRiskForLevel(level),
    confidence: evidenceConfidenceForLevel(level),
    provenance: {
      origin: 'platform_context',
      sourceProduct: meta?.sourceProduct ?? null,
      sourceSessionId: normalizeText(raw.source_session_id) || null,
      sourceContextType: meta?.sourceContextType ?? 'evidence_item',
      capturedAt: normalizeText(raw.created_at) || meta?.capturedAt || null,
      mapper: 'mapLegacyPlatformEvidenceToEvidenceItem',
    },
    metadata: category ? { category } : undefined,
  };
}

export function mapTruthVerificationOutputToEvidenceItems(
  claims: LegacyTruthClaimLike[],
  meta?: {
    sourceProduct?: string | null;
    sourceSessionId?: string | null;
    capturedAt?: string | null;
  },
): EvidenceItem[] {
  return claims
    .map((claim) => mapTruthClaimToEvidenceItem(claim, meta))
    .filter((item) => !!item.statement.trim());
}

export function summarizeEvidenceInventory(items: EvidenceItem[]): EvidenceInventorySummary {
  const normalized = items.filter((item) => item.statement.trim().length > 0);

  return {
    evidenceItems: normalized,
    directProof: normalized.filter((item) => item.level === 'DirectProof'),
    adjacentProof: normalized.filter((item) => item.level === 'StrongAdjacentProof'),
    unsupportedAreas: normalized.filter(
      (item) => item.level === 'Unsupported' || item.level === 'UserUnconfirmedClaim',
    ),
    overreachRisks: normalized.filter((item) => item.level === 'HighOverreachRisk'),
    artifactEligibleEvidenceIds: normalized
      .filter((item) => isEvidenceEligibleForFinalArtifact(item))
      .map((item) => item.id),
  };
}

export function createBenchmarkGapEvidenceItem(args: {
  statement: string;
  supports?: string[];
  sourceArtifactId?: string | null;
  sourceExcerpt?: string | null;
  sourceProduct?: string | null;
  capturedAt?: string | null;
}): EvidenceItem {
  return {
    id: makeEvidenceId(['benchmark', args.statement]),
    level: 'BenchmarkInformedGap',
    statement: args.statement.trim(),
    sourceType: 'benchmark_candidate',
    sourceArtifactId: args.sourceArtifactId ?? null,
    sourceExcerpt: args.sourceExcerpt ?? null,
    supports: args.supports ?? [],
    limitations: ['Benchmark guidance is not candidate proof.'],
    requiresConfirmation: false,
    finalArtifactEligible: false,
    riskLabel: evidenceRiskForLevel('BenchmarkInformedGap'),
    confidence: evidenceConfidenceForLevel('BenchmarkInformedGap'),
    provenance: {
      origin: 'benchmark_analysis',
      sourceProduct: args.sourceProduct ?? null,
      capturedAt: args.capturedAt ?? null,
      mapper: 'createBenchmarkGapEvidenceItem',
    },
  };
}
