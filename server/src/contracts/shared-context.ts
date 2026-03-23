import type { EvidenceInventorySummary } from './shared-evidence.js';

export type SharedReviewStatus =
  | 'unknown'
  | 'not_started'
  | 'in_review'
  | 'needs_input'
  | 'approved'
  | 'stale';

export interface SharedArtifactReference {
  artifactId?: string | null;
  artifactType: string;
  contextType?: string | null;
  sourceProduct?: string | null;
  sourceSessionId?: string | null;
  updatedAt?: string | null;
  summary?: string | null;
}

export interface SharedCandidateProfile {
  candidateId: string | null;
  fullName: string | null;
  headline: string | null;
  location: string | null;
  seniorityLevel: string | null;
  yearsOfExperience: number | null;
  coreFunctions: string[];
  industries: string[];
  leadershipScope: {
    summary: string | null;
    scopeOfResponsibility: string | null;
  };
  education: Array<Record<string, unknown>>;
  certifications: string[];
  authenticVoiceNotes: string[];
  factualSummary: string | null;
}

export interface SharedTargetRole {
  roleTitle: string | null;
  roleFamily: string | null;
  roleLevel: string | null;
  jobDescriptionText: string | null;
  jobRequirements: string[];
  mustHaveRequirements: string[];
  preferredRequirements: string[];
  responsibilities: string[];
  locationRequirements: string[];
}

export interface SharedTargetCompany {
  companyName: string | null;
  companyStage: string | null;
  companySize: string | null;
  ownershipModel: string | null;
  businessModel: string | null;
  marketPosition: string | null;
  knownStrategicPriorities: string[];
}

export interface SharedIndustryContext {
  primaryIndustry: string | null;
  adjacentIndustries: string[];
  industryConstraints: string[];
  regulatoryContext: string[];
  commonSuccessSignals: string[];
  domainLanguage: string[];
}

export interface SharedSourceArtifacts {
  resume: SharedArtifactReference | null;
  jobDescription: SharedArtifactReference | null;
  linkedinProfile: SharedArtifactReference | null;
  coverLetter: SharedArtifactReference | null;
  careerProfile: SharedArtifactReference | null;
  clientProfile: SharedArtifactReference | null;
  targetRole: SharedArtifactReference | null;
  positioningStrategy: SharedArtifactReference | null;
  benchmarkCandidate: SharedArtifactReference | null;
  gapAnalysis: SharedArtifactReference | null;
  careerNarrative: SharedArtifactReference | null;
  industryContext: SharedArtifactReference | null;
  evidenceItems: SharedArtifactReference[];
  additionalArtifacts: SharedArtifactReference[];
}

export interface SharedCareerNarrative {
  careerArc: string | null;
  signatureStrengths: string[];
  careerThemes: string[];
  operatingStyle: string | null;
  leadershipIdentity: string | null;
  differentiators: string[];
  authenticPhrases: string[];
  sensitiveNarrativeAreas: string[];
  missingConfirmation: string[];
}

export interface SharedBenchmarkCandidate {
  benchmarkSummary: string | null;
  benchmarkRequirements: string[];
  benchmarkSignals: string[];
  benchmarkWins: string[];
  differentiators: string[];
  benchmarkGapsRelativeToCandidate: string[];
}

export interface SharedGapAnalysis {
  requirements: string[];
  mustHaveGaps: string[];
  preferredGaps: string[];
  benchmarkGaps: string[];
  criticalRisks: string[];
  nextBestActions: string[];
  coverageSummary: string | null;
}

export interface SharedPositioningStrategy {
  positioningAngle: string | null;
  supportingThemes: string[];
  narrativePriorities: string[];
  riskAreas: string[];
  approvedFraming: string[];
  framingStillRequiringConfirmation: string[];
}

export interface SharedArtifactTarget {
  artifactType: string | null;
  artifactSection: string | null;
  artifactGoal: string | null;
  targetAudience: string | null;
  successCriteria: string[];
}

export type SharedEvidenceInventory = EvidenceInventorySummary;

export interface SharedConstraints {
  mustRemainTruthful: boolean;
  allowedInferenceLevel: string | null;
  voiceConstraints: string[];
  exportConstraints: string[];
  regulatoryConstraints: string[];
  formatConstraints: string[];
  ageSensitivityGuidance: string[];
}

export interface SharedProvenance {
  contextVersion: number;
  legacyContextTypesLoaded: string[];
  sourceProducts: string[];
  sourceSummaries: Record<string, string>;
  inferenceNotes: string[];
  benchmarkSources: string[];
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
}

export interface SharedWorkflowState {
  room: string | null;
  stage: string | null;
  activeTask: string | null;
  reviewStatus: SharedReviewStatus;
  pendingQuestions: number;
  pendingApprovals: number;
  stalenessFlags: string[];
}

export interface SharedContext {
  candidateProfile: SharedCandidateProfile;
  targetRole: SharedTargetRole;
  targetCompany: SharedTargetCompany;
  industryContext: SharedIndustryContext;
  sourceArtifacts: SharedSourceArtifacts;
  careerNarrative: SharedCareerNarrative;
  benchmarkCandidate: SharedBenchmarkCandidate;
  gapAnalysis: SharedGapAnalysis;
  positioningStrategy: SharedPositioningStrategy;
  artifactTarget: SharedArtifactTarget;
  evidenceInventory: SharedEvidenceInventory;
  constraints: SharedConstraints;
  provenance: SharedProvenance;
  workflowState: SharedWorkflowState;
}

export function createEmptySharedContext(): SharedContext {
  return {
    candidateProfile: {
      candidateId: null,
      fullName: null,
      headline: null,
      location: null,
      seniorityLevel: null,
      yearsOfExperience: null,
      coreFunctions: [],
      industries: [],
      leadershipScope: {
        summary: null,
        scopeOfResponsibility: null,
      },
      education: [],
      certifications: [],
      authenticVoiceNotes: [],
      factualSummary: null,
    },
    targetRole: {
      roleTitle: null,
      roleFamily: null,
      roleLevel: null,
      jobDescriptionText: null,
      jobRequirements: [],
      mustHaveRequirements: [],
      preferredRequirements: [],
      responsibilities: [],
      locationRequirements: [],
    },
    targetCompany: {
      companyName: null,
      companyStage: null,
      companySize: null,
      ownershipModel: null,
      businessModel: null,
      marketPosition: null,
      knownStrategicPriorities: [],
    },
    industryContext: {
      primaryIndustry: null,
      adjacentIndustries: [],
      industryConstraints: [],
      regulatoryContext: [],
      commonSuccessSignals: [],
      domainLanguage: [],
    },
    sourceArtifacts: {
      resume: null,
      jobDescription: null,
      linkedinProfile: null,
      coverLetter: null,
      careerProfile: null,
      clientProfile: null,
      targetRole: null,
      positioningStrategy: null,
      benchmarkCandidate: null,
      gapAnalysis: null,
      careerNarrative: null,
      industryContext: null,
      evidenceItems: [],
      additionalArtifacts: [],
    },
    careerNarrative: {
      careerArc: null,
      signatureStrengths: [],
      careerThemes: [],
      operatingStyle: null,
      leadershipIdentity: null,
      differentiators: [],
      authenticPhrases: [],
      sensitiveNarrativeAreas: [],
      missingConfirmation: [],
    },
    benchmarkCandidate: {
      benchmarkSummary: null,
      benchmarkRequirements: [],
      benchmarkSignals: [],
      benchmarkWins: [],
      differentiators: [],
      benchmarkGapsRelativeToCandidate: [],
    },
    gapAnalysis: {
      requirements: [],
      mustHaveGaps: [],
      preferredGaps: [],
      benchmarkGaps: [],
      criticalRisks: [],
      nextBestActions: [],
      coverageSummary: null,
    },
    positioningStrategy: {
      positioningAngle: null,
      supportingThemes: [],
      narrativePriorities: [],
      riskAreas: [],
      approvedFraming: [],
      framingStillRequiringConfirmation: [],
    },
    artifactTarget: {
      artifactType: null,
      artifactSection: null,
      artifactGoal: null,
      targetAudience: null,
      successCriteria: [],
    },
    evidenceInventory: {
      evidenceItems: [],
      directProof: [],
      adjacentProof: [],
      unsupportedAreas: [],
      overreachRisks: [],
      artifactEligibleEvidenceIds: [],
    },
    constraints: {
      mustRemainTruthful: true,
      allowedInferenceLevel: null,
      voiceConstraints: [],
      exportConstraints: [],
      regulatoryConstraints: [],
      formatConstraints: [],
      ageSensitivityGuidance: [],
    },
    provenance: {
      contextVersion: 1,
      legacyContextTypesLoaded: [],
      sourceProducts: [],
      sourceSummaries: {},
      inferenceNotes: [],
      benchmarkSources: [],
      lastUpdatedAt: null,
      lastUpdatedBy: null,
    },
    workflowState: {
      room: null,
      stage: null,
      activeTask: null,
      reviewStatus: 'unknown',
      pendingQuestions: 0,
      pendingApprovals: 0,
      stalenessFlags: [],
    },
  };
}

export interface SharedContextOverride {
  artifactTarget?: Partial<SharedArtifactTarget>;
  workflowState?: Partial<SharedWorkflowState>;
}

export function hasMeaningfulSharedValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulSharedValue(item));
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => hasMeaningfulSharedValue(item));
  }
  return false;
}
