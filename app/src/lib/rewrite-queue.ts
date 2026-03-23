import type {
  BenchmarkCandidate,
  CoachingThreadSnapshot,
  FinalReviewResult,
  GapAnalysis,
  GapCoachingCard,
  GapChatMessage,
  JobIntelligence,
  RequirementGap,
  ResumeDraft,
  RewriteQueueCategory,
  RewriteQueueEvidence,
  RewriteQueueItem,
  RewriteQueueSource,
  RewriteQueueSummary,
} from '@/types/resume-v2';
import { evidenceLooksDirectForRequirement } from './requirement-evidence';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
}

function hasMeaningfulSourceEvidence(text: string | null | undefined): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^#+\s*/.test(trimmed)) return false;
  if (/canonical requirement catalog/i.test(trimmed)) return false;
  if (/^(job description|benchmark|jd|requirement catalog|resume evidence|required qualifications?)$/i.test(trimmed)) return false;
  return true;
}

function looksLikeResumeRewrite(text: string | null | undefined): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const wordCount = trimmed.split(/\s+/).length;
  const hasStrongVerb = /\b(led|built|developed|tracked|drove|improved|managed|owned|created|launched|delivered|oversaw|designed|implemented|optimized|reduced|increased|grew|guided|ran|used|partnered)\b/i.test(trimmed);
  const looksLikeLabel = /\b(experience|expertise|background|exposure)\b/i.test(trimmed) && wordCount <= 6;
  const looksLikeInstruction = /^(use|acknowledge|frame|highlight|position|naturally\b|translate|connect|show|bring|surface|tie|focus on|lean on)\b/i.test(trimmed);

  if (looksLikeLabel) return false;
  if (looksLikeInstruction) return false;
  if (wordCount < 5) return false;

  return hasStrongVerb || wordCount >= 8;
}

function looksLikeResumeEvidenceSnippet(text: string | null | undefined, requirement: string): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^#+\s*/.test(trimmed)) return false;
  if (/^(job description|benchmark|jd|canonical requirement catalog|requirement catalog|resume evidence|required qualifications?|source evidence)$/i.test(trimmed)) {
    return false;
  }

  if (normalize(trimmed) === normalize(requirement)) return false;

  const wordCount = trimmed.split(/\s+/).length;
  const hasStrongVerb = /\b(led|built|developed|tracked|drove|improved|managed|owned|created|launched|delivered|oversaw|designed|implemented|optimized|reduced|increased|grew|guided|ran|used|partnered|presented|executed|standardized|scaled)\b/i.test(trimmed);
  const hasMetricSignal = /[$%]|\b\d+\b|\b(kpi|kpis|metric|metrics|scorecard|scorecards|dashboard|dashboards|budget|revenue|cost|throughput|latency|uptime)\b/i.test(trimmed);
  const hasCredentialSignal = /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|certification|certified|license|licensed|licensure|aws|azure|gcp|pmp|cpa|rn|pe)\b/i.test(trimmed);
  const hasIndustrySignal = /\b(financial services|banking|healthcare|insurance|energy|oil|gas|manufacturing|retail|telecom|logistics|transportation|saas|software|fintech|medtech|pharma|public sector|government|education)\b/i.test(trimmed);
  const looksLikeLabel = /\b(experience|expertise|background|exposure|knowledge|skills?)\b/i.test(trimmed) && wordCount <= 7;

  if (looksLikeLabel) return false;
  if (wordCount < 3 && !hasStrongVerb && !hasMetricSignal && !hasCredentialSignal && !hasIndustrySignal) return false;

  return true;
}

function detectRequirementSignals(requirement: string): {
  architecture: boolean;
  cloudMulti: boolean;
  cloudPlatform: boolean;
  communication: boolean;
  erp: boolean;
  financial: boolean;
  metrics: boolean;
  platformScale: boolean;
  portfolio: boolean;
  scale: boolean;
  talent: boolean;
  technical: boolean;
} {
  const normalizedRequirement = normalize(requirement);

  return {
    architecture: /\b(cross-functional architecture decisions|architecture decisions|architectural decisions|technical decisions|design decisions|stakeholders|trade-?offs|cross-functional)\b/.test(normalizedRequirement),
    cloudMulti: /\b(aws)\b.*\b(azure|gcp|additional cloud)\b|\b(azure|gcp|additional cloud)\b.*\baws\b/.test(normalizedRequirement),
    cloudPlatform: /\b(azure|gcp|google cloud|cloud platform|cloud environments?)\b/.test(normalizedRequirement),
    communication: /\b(communication|executive stakeholder|executive-facing|board|presenting|presentation|influence)\b/.test(normalizedRequirement),
    erp: /\b(erp|sap|oracle|netsuite|workday|enterprise resource planning)\b/.test(normalizedRequirement),
    financial: /\b(p&l|budget|revenue|financial|cost optimization|finops|spend)\b/.test(normalizedRequirement),
    metrics: /\b(metric|metrics|kpi|kpis|scorecard|scorecards|dashboard|dashboards|performance tracking|reporting cadence|measure(?:ment|ments)?)\b/.test(normalizedRequirement),
    platformScale: /\b(data platform|transactions?|transactional|api requests?|throughput|latency|uptime|availability|distributed systems?|platform components?|real-time|realtime)\b/.test(normalizedRequirement),
    portfolio: /\b(multi-brand|portfolio management|portfolio strategy|brand architecture|product lines|brand portfolio|category portfolio)\b/.test(normalizedRequirement),
    scale: /(\d+\+|\$|team|teams|organization|organizations|company|companies|global|enterprise|multi-site|multisite|plant|plants|facility|facilities|people|person|scaling|scale)/i.test(requirement),
    talent: /\b(talent development|leadership pipeline|bench strength|succession|develop(?:ing)? leaders|high-performing teams?|hiring|hire|coach(?:ing)?|mentor(?:ing)?|promot(?:e|ed|ion)|people development)\b/.test(normalizedRequirement),
    technical: /\b(aws|azure|gcp|cloud|soc 2|hipaa|pci|kubernetes|terraform|disaster recovery|chaos engineering|industry 4\.0|digital transformation)\b/.test(normalizedRequirement),
  };
}

function summarizeEvidenceSnippet(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 140) return trimmed;
  return `${trimmed.slice(0, 137).trimEnd()}...`;
}

function buildStarterQuestion(args: {
  requirement: string;
  category: RewriteQueueCategory;
  source: RewriteQueueSource;
  currentEvidenceText?: string | null;
  sourceEvidenceText?: string | null;
}): string {
  const signals = detectRequirementSignals(args.requirement);
  const evidenceSnippet = summarizeEvidenceSnippet(args.currentEvidenceText ?? null);
  const promptPrefix = evidenceSnippet
    ? `Your resume already shows "${evidenceSnippet}". `
    : args.source === 'benchmark'
      ? 'Strong benchmark candidates usually show this more directly. '
      : '';

  if (args.category === 'hard_gap') {
    return `Do you actually have ${args.requirement}, or is this a real gap we should keep visible?`;
  }

  if (signals.metrics) {
    return `${promptPrefix}Which metrics or scorecards did you personally track, how often did you review them, and what decision or improvement did they drive?`;
  }

  if (signals.cloudMulti) {
    return `${promptPrefix}Where have you used AWS together with Azure or GCP, what did you deliver across those environments, and why did it matter to the business?`;
  }

  if (signals.cloudPlatform) {
    return `${promptPrefix}Where have you used Azure or GCP, what did you personally own, and what outcome came from that work?`;
  }

  if (signals.erp) {
    return `${promptPrefix}Where have you used ERP systems (SAP, Oracle, or similar), what did you personally own, and what outcome came from that work?`;
  }

  if (signals.financial) {
    return `${promptPrefix}What budget, spend, revenue, or P&L scope did you personally own, and what business decision or outcome did it influence?`;
  }

  if (signals.communication) {
    return `${promptPrefix}Who was the audience, what did you present or align on, and what decision or next step came from it?`;
  }

  if (signals.talent) {
    return `${promptPrefix}How many people did you lead, hire, coach, or promote, and what changed because of your leadership?`;
  }

  if (signals.portfolio) {
    return `${promptPrefix}Which brands, product lines, or categories were involved, how did you coordinate them, and what result came from that work?`;
  }

  if (signals.platformScale) {
    return `${promptPrefix}What scale did you support, such as transaction volume, request volume, uptime, latency, or system footprint, and what did you build or improve at that scale?`;
  }

  if (signals.architecture) {
    return `${promptPrefix}Which stakeholders were involved, what tradeoff or architecture decision did you lead, and what outcome came from it?`;
  }

  if (signals.technical) {
    return `${promptPrefix}Which platform, framework, or technical environment was involved, and what did you personally deliver there?`;
  }

  if (signals.scale) {
    return `${promptPrefix}What exact scale was involved, such as team size, budget, sites, revenue, or footprint, and what result did you drive?`;
  }

  const sourceSnippet = summarizeEvidenceSnippet(args.sourceEvidenceText ?? null);
  if (sourceSnippet && normalize(sourceSnippet) !== normalize(args.requirement)) {
    return `${promptPrefix}What is the clearest example from your background that proves this role need: "${sourceSnippet}"?`;
  }

  return `${promptPrefix}What is the clearest concrete example that proves "${args.requirement}" for this role?`;
}

function looksLikeTargetedStarterQuestion(question: string | null | undefined, requirement: string): boolean {
  if (typeof question !== 'string') return false;
  const trimmed = question.trim();
  if (!trimmed) return false;

  const normalizedQuestion = trimmed.toLowerCase();
  if (
    /^(tell me about|can you walk me through your experience|what experience do you have|share any experience|describe your experience)\b/.test(normalizedQuestion)
    || /\brelated to\b/.test(normalizedQuestion)
  ) {
    return false;
  }

  const signals = detectRequirementSignals(requirement);
  if (signals.metrics && !/\b(metric|metrics|kpi|kpis|scorecard|scorecards|dashboard|dashboards|track|tracked|reviewed|reporting)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.cloudMulti && !/\b(aws|azure|gcp|multi-?cloud|cloud)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.cloudPlatform && !/\b(azure|gcp|google cloud|cloud)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.erp && !/\b(erp|sap|oracle|netsuite|workday|system)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.financial && !/\b(budget|revenue|financial|p&l|spend|cost)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.communication && !/\b(audience|stakeholder|stakeholders|present|presented|board|communicat|align)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.talent && !/\b(team|people|hire|hired|coach|coached|develop|developed|promot|leadership)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.portfolio && !/\b(brand|brands|product lines?|categories|portfolio)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.platformScale && !/\b(transaction|transactions|request|requests|uptime|latency|scale|footprint|system)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.architecture && !/\b(architecture|architectural|stakeholder|stakeholders|tradeoff|trade-off|decision|design)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.technical && !/\b(platform|framework|technical|aws|azure|gcp|cloud|kubernetes|terraform|environment)\b/i.test(trimmed)) {
    return false;
  }
  if (signals.scale && !/\b(scale|team|budget|sites|revenue|footprint|organization)\b/i.test(trimmed)) {
    return false;
  }

  return true;
}

function classificationWeight(classification: RequirementGap['classification']): number {
  if (classification === 'missing') return 0;
  if (classification === 'partial') return 1;
  return 2;
}

function importanceWeight(importance?: RequirementGap['importance']): number {
  if (importance === 'must_have') return 0;
  if (importance === 'important') return 1;
  return 2;
}

function bucketWeight(bucket: RewriteQueueItem['bucket']): number {
  if (bucket === 'needs_attention') return 0;
  if (bucket === 'partially_addressed') return 1;
  return 2;
}

function categoryWeight(category: RewriteQueueCategory): number {
  switch (category) {
    case 'quick_win':
      return 0;
    case 'proof_upgrade':
      return 1;
    case 'hard_gap':
      return 2;
    case 'benchmark_stretch':
      return 3;
    case 'final_review_issue':
    default:
      return 4;
  }
}

function actionWeight(action: RewriteQueueItem['recommendedNextStep']['action']): number {
  switch (action) {
    case 'review_edit':
    case 'review_suggested_fix':
      return 0;
    case 'answer_question':
      return 1;
    case 'check_hard_requirement':
      return 2;
    case 'view_in_resume':
    case 'verify':
    case 'rerun_final_review':
    default:
      return 3;
  }
}

function latestAssistantMessage(snapshot: CoachingThreadSnapshot | null | undefined, key: string): GapChatMessage | null {
  const messages = snapshot?.items[normalize(key)]?.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index];
    }
  }
  return null;
}

function resolvedLanguage(snapshot: CoachingThreadSnapshot | null | undefined, key: string): string | null {
  return snapshot?.items[normalize(key)]?.resolvedLanguage ?? null;
}

function collectResumeEvidenceForRequirement(resume: ResumeDraft | null | undefined, requirement: string): RewriteQueueEvidence[] {
  if (!resume) return [];
  const normalizedRequirement = normalize(requirement);
  const evidence: RewriteQueueEvidence[] = [];

  const matchesRequirement = (requirements: string[] | undefined) => (
    (requirements ?? []).some((item) => normalize(item) === normalizedRequirement)
  );

  if (matchesRequirement(resume.executive_summary.addresses_requirements)) {
    if (evidenceLooksDirectForRequirement(requirement, resume.executive_summary.content)) {
      evidence.push({
        text: resume.executive_summary.content,
        source: 'resume',
        section: 'Executive Summary',
        isNew: resume.executive_summary.is_new,
        basis: 'mapped',
      });
    }
  }

  for (const accomplishment of resume.selected_accomplishments) {
    if (matchesRequirement(accomplishment.addresses_requirements)) {
      if (!evidenceLooksDirectForRequirement(requirement, accomplishment.content)) {
        continue;
      }
      evidence.push({
        text: accomplishment.content,
        source: 'resume',
        section: 'Selected Accomplishments',
        isNew: accomplishment.is_new,
        basis: 'mapped',
      });
    }
  }

  for (const experience of resume.professional_experience) {
    if (matchesRequirement(experience.scope_statement_addresses_requirements)) {
      if (!evidenceLooksDirectForRequirement(requirement, experience.scope_statement)) {
        continue;
      }
      evidence.push({
        text: experience.scope_statement,
        source: 'resume',
        section: `Professional Experience - ${experience.company}`,
        isNew: experience.scope_statement_is_new ?? false,
        basis: 'mapped',
      });
    }

    for (const bullet of experience.bullets) {
      if (matchesRequirement(bullet.addresses_requirements)) {
        if (!evidenceLooksDirectForRequirement(requirement, bullet.text)) {
          continue;
        }
        evidence.push({
          text: bullet.text,
          source: 'resume',
          section: `Professional Experience - ${experience.company}`,
          isNew: bullet.is_new,
          basis: 'mapped',
        });
      }
    }
  }

  return evidence;
}

function sourceEvidenceForRequirement(args: {
  requirement: RequirementGap;
  jobIntelligence: JobIntelligence;
  benchmarkCandidate?: BenchmarkCandidate | null;
}): RewriteQueueEvidence[] {
  const source = args.requirement.source ?? (args.requirement.score_domain === 'benchmark' ? 'benchmark' : 'job_description');
  const evidence: RewriteQueueEvidence[] = [];

  if (source === 'job_description') {
    const competency = args.jobIntelligence.core_competencies.find(
      (item) => normalize(item.competency) === normalize(args.requirement.requirement),
    );
    if (hasMeaningfulSourceEvidence(competency?.evidence_from_jd)) {
      evidence.push({
        text: competency.evidence_from_jd,
        source: 'job_description',
        basis: 'source',
      });
    } else if (hasMeaningfulSourceEvidence(args.requirement.source_evidence)) {
      evidence.push({
        text: args.requirement.source_evidence,
        source: 'job_description',
        basis: 'source',
      });
    } else {
      evidence.push({
        text: args.requirement.requirement,
        source: 'job_description',
        basis: 'source',
      });
    }
  }

  if (source === 'benchmark' && hasMeaningfulSourceEvidence(args.requirement.source_evidence)) {
    evidence.push({
      text: args.requirement.source_evidence,
      source: 'benchmark',
      basis: 'source',
    });
  }

  if (source === 'benchmark' && evidence.length === 0 && args.benchmarkCandidate) {
    evidence.push({
      text: args.benchmarkCandidate.ideal_profile_summary,
      source: 'benchmark',
      basis: 'source',
    });
  }

  return evidence;
}

function hardRequirementText(requirement: string, sourceEvidence: RewriteQueueEvidence[]): boolean {
  const combined = [requirement, ...sourceEvidence.map((item) => item.text)].join(' ').toLowerCase();
  return /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|certification|certified|license|licensed|licensure|foreign equivalent|pe\b|pmp\b|cpa\b|rn\b)\b/.test(combined);
}

function whyRequirementMatters(source: RewriteQueueSource, sourceEvidence: RewriteQueueEvidence[]): string {
  const primarySourceText = sourceEvidence[0]?.text?.trim();

  if (hardRequirementText(primarySourceText ?? '', sourceEvidence)) {
    return 'This looks like a hard requirement and could become a real screen-out risk if it is truly missing.';
  }

  if (source === 'job_description') {
    return primarySourceText || 'This comes straight from the job description and affects how closely your resume matches the role.';
  }

  if (source === 'benchmark') {
    return primarySourceText || 'This is common among stronger candidates and can improve competitiveness once the core job fit is in place.';
  }

  return 'This issue affects the final interview-readiness verdict.';
}

function categoryForRequirement(args: {
  source: RewriteQueueSource;
  status: RewriteQueueItem['status'];
  liveEvidenceCount: number;
  inferredEvidenceCount: number;
  hasSuggestedLanguage: boolean;
  isHardRequirement: boolean;
}): RewriteQueueCategory {
  if (args.status === 'already_covered') {
    return args.source === 'benchmark' ? 'benchmark_stretch' : 'quick_win';
  }

  if (args.isHardRequirement && args.liveEvidenceCount === 0) {
    return 'hard_gap';
  }

  if (args.source === 'benchmark') {
    return 'benchmark_stretch';
  }

  if (args.hasSuggestedLanguage || args.liveEvidenceCount > 0 || args.inferredEvidenceCount > 0) {
    return 'quick_win';
  }

  return 'proof_upgrade';
}

function bucketForItem(
  status: RewriteQueueItem['status'],
  category: RewriteQueueCategory,
): RewriteQueueItem['bucket'] {
  if (status === 'already_covered') return 'resolved';
  if (category === 'benchmark_stretch') return 'partially_addressed';
  if (status === 'partially_addressed' && category !== 'hard_gap') return 'partially_addressed';
  return 'needs_attention';
}

function aiPlanForRequirement(args: {
  category: RewriteQueueCategory;
  status: RewriteQueueItem['status'];
  liveEvidenceCount: number;
  inferredEvidenceCount: number;
  hasSuggestedLanguage: boolean;
}): string {
  if (args.category === 'hard_gap') {
    return 'We will confirm whether you truly have this requirement. If you do, we will add proof. If you do not, we will keep it visible as a real risk.';
  }

  if (args.category === 'benchmark_stretch') {
    return 'We are checking whether you have adjacent experience that can truthfully strengthen this stretch item without distracting from the core job fit.';
  }

  if (args.hasSuggestedLanguage) {
    return 'We already drafted stronger language for this item. The next step is to review it carefully and keep it only if it is exactly true.';
  }

  if (args.liveEvidenceCount > 0) {
    return 'We already found proof on the resume. The next move is to sharpen it so the requirement is obvious without stretching the truth.';
  }

  if (args.inferredEvidenceCount > 0) {
    return 'We found nearby evidence, but it is still indirect. One focused detail should let us turn it into direct proof.';
  }

  if (args.status === 'already_covered') {
    return 'The current draft already carries this requirement. We are keeping it visible so you can confirm the proof is still in the strongest place.';
  }

  return 'We need one or two better details before this becomes believable resume proof.';
}

function userInstructionForRequirement(args: {
  requirement: string;
  category: RewriteQueueCategory;
  status: RewriteQueueItem['status'];
  liveEvidenceCount: number;
  inferredEvidenceCount: number;
  hasSuggestedLanguage: boolean;
}): string {
  const signals = detectRequirementSignals(args.requirement);

  if (args.category === 'hard_gap') {
    return 'Confirm whether you actually have this requirement. Do not stretch it. If you do not have it, leave it marked as a real risk.';
  }

  if (args.category === 'benchmark_stretch') {
    return 'Only work this if it is real and supportable. Core job-description fit comes first.';
  }

  if (args.status === 'already_covered') {
    return 'Read the current proof on the resume and make sure it still belongs in the strongest place.';
  }

  if (args.hasSuggestedLanguage) {
    return 'Review the suggested language and accept it only if it is fully accurate and supportable.';
  }

  if (signals.communication) {
    return 'Answer with one concrete executive-facing example: who the audience was, what you communicated, and what outcome it influenced.';
  }

  if (signals.financial) {
    return 'Answer with the financial scope you owned, what decisions were yours, and the business outcome.';
  }

  if (signals.talent) {
    return 'Answer with who you hired, developed, or promoted, how you built the leadership bench, and what business result came from it.';
  }

  if (signals.portfolio) {
    return 'Answer with the brands, product lines, or categories you managed together, how you coordinated them, and what business outcome came from that portfolio work.';
  }

  if (signals.platformScale) {
    return 'Answer with the platform scale involved, such as transaction volume, request volume, uptime, latency, or system footprint, and what you architected at that scale.';
  }

  if (signals.architecture) {
    return 'Answer with one architecture decision: who the stakeholders were, what tradeoff you led, and what outcome came from that decision.';
  }

  if (signals.metrics) {
    return 'Answer with the metrics or scorecards you tracked, how often you reviewed them, and what decision or improvement they drove.';
  }

  if (signals.cloudMulti) {
    return 'Answer with where you used AWS together with Azure or GCP, what you delivered across those environments, and why it mattered to the business.';
  }

  if (signals.cloudPlatform) {
    return 'Answer with where you used Azure or GCP, what you personally owned, and what outcome came from that work.';
  }

  if (signals.erp) {
    return 'Answer with where you used ERP systems, what you personally owned there, and what outcome came from that work.';
  }

  if (signals.scale) {
    return 'Answer with the exact scale involved here, such as company size, team size, budget, revenue, or operational footprint.';
  }

  if (signals.technical) {
    return 'Answer with the exact platform, framework, or technical environment you worked in and what you delivered there.';
  }

  if (args.liveEvidenceCount > 0 || args.inferredEvidenceCount > 0) {
    return 'Tell us one concrete example so we can turn the related proof into direct evidence for this requirement.';
  }

  return 'Tell us one concrete example so we can find truthful proof before we draft a stronger line.';
}

function mergeEvidence(left: RequirementGap['evidence'], right: RequirementGap['evidence']): string[] {
  const merged = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return Array.from(new Set(merged));
}

function dedupeRequirements(requirements: RequirementGap[]): RequirementGap[] {
  const merged = new Map<string, RequirementGap>();

  for (const requirement of requirements) {
    const source = requirement.source ?? (requirement.score_domain === 'benchmark' ? 'benchmark' : 'job_description');
    const key = `${source}:${normalize(requirement.requirement)}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...requirement,
        evidence: mergeEvidence(requirement.evidence, []),
      });
      continue;
    }

    const mergedRequirement: RequirementGap = {
      ...existing,
      importance:
        importanceWeight(requirement.importance) < importanceWeight(existing.importance)
          ? requirement.importance
          : existing.importance,
      classification:
        classificationWeight(requirement.classification) < classificationWeight(existing.classification)
          ? requirement.classification
          : existing.classification,
      evidence: mergeEvidence(existing.evidence, requirement.evidence),
      source_evidence: existing.source_evidence || requirement.source_evidence,
      strategy: existing.strategy ?? requirement.strategy,
    };

    merged.set(key, mergedRequirement);
  }

  return Array.from(merged.values());
}

export function buildRewriteQueue(args: {
  jobIntelligence: JobIntelligence;
  gapAnalysis: GapAnalysis;
  currentResume?: ResumeDraft | null;
  benchmarkCandidate?: BenchmarkCandidate | null;
  gapCoachingCards?: GapCoachingCard[] | null;
  gapChatSnapshot?: CoachingThreadSnapshot | null;
  finalReviewResult?: FinalReviewResult | null;
  finalReviewChatSnapshot?: CoachingThreadSnapshot | null;
  resolvedFinalReviewConcernIds?: string[];
}): {
  items: RewriteQueueItem[];
  summary: RewriteQueueSummary;
  nextItem: RewriteQueueItem | null;
} {
  const coachingLookup = new Map(
    (args.gapCoachingCards ?? []).map((card) => [normalize(card.requirement), card]),
  );

  const dedupedRequirements = dedupeRequirements(args.gapAnalysis.requirements);

  const items = dedupedRequirements.map((requirement) => {
    const normalizedRequirement = normalize(requirement.requirement);
    const source = requirement.source ?? (requirement.score_domain === 'benchmark' ? 'benchmark' : 'job_description');
    const coachingCard = coachingLookup.get(normalizedRequirement);
    const acceptedLanguage = resolvedLanguage(args.gapChatSnapshot, requirement.requirement);
    const latestAssistant = latestAssistantMessage(args.gapChatSnapshot, requirement.requirement);
    const liveEvidence = collectResumeEvidenceForRequirement(args.currentResume, requirement.requirement);
    const inferredEvidence = Array.isArray(requirement.evidence)
      ? requirement.evidence.filter((item): item is string => (
        typeof item === 'string'
        && item.trim().length > 0
        && looksLikeResumeEvidenceSnippet(item, requirement.requirement)
        && evidenceLooksDirectForRequirement(requirement.requirement, item)
      ))
      : [];
    const sourceEvidence = sourceEvidenceForRequirement({
      requirement,
      jobIntelligence: args.jobIntelligence,
      benchmarkCandidate: args.benchmarkCandidate,
    });
    const isHardRequirement = hardRequirementText(requirement.requirement, sourceEvidence);
    const hasSuggestedLanguage = Boolean(latestAssistant?.suggestedLanguage);
    const sharedCoachingPolicy = coachingCard?.coaching_policy ?? requirement.strategy?.coaching_policy;

    const status: RewriteQueueItem['status'] = requirement.classification === 'strong'
      ? 'already_covered'
      : acceptedLanguage || liveEvidence.some((item) => item.isNew)
        ? 'partially_addressed'
        : requirement.classification === 'partial' || liveEvidence.length > 0 || latestAssistant?.needsCandidateInput || Boolean(latestAssistant?.currentQuestion)
          ? 'needs_more_evidence'
          : 'not_addressed';

    const category = categoryForRequirement({
      source,
      status,
      liveEvidenceCount: liveEvidence.length,
      inferredEvidenceCount: inferredEvidence.length,
      hasSuggestedLanguage,
      isHardRequirement,
    });

    const recommendedNextStep = status === 'already_covered'
      ? {
          action: 'view_in_resume' as const,
          label: 'Check Current Proof',
          detail: 'Confirm the current resume line is still the strongest proof for this requirement.',
        }
      : category === 'hard_gap'
        ? {
            action: 'check_hard_requirement' as const,
            label: 'Check This Requirement',
            detail: 'Confirm whether you actually have this credential or degree. If not, keep it visible as a real risk.',
          }
        : hasSuggestedLanguage
          ? {
              action: 'review_edit' as const,
              label: 'Review Edit',
              detail: 'A stronger line is ready. Review it and only accept it if it is fully true.',
            }
          : {
              action: 'answer_question' as const,
              label: 'Answer 1 Question',
              detail: category === 'benchmark_stretch'
                ? 'Answer one targeted question so we can decide whether this stretch item is really supportable.'
                : status === 'not_addressed'
                  ? 'Answer one targeted question so we can find truthful proof for this job requirement and draft the right edit.'
                  : 'Answer one targeted question so we can strengthen the proof already on the page.',
            };

    const aiPlan = aiPlanForRequirement({
      category,
      status,
      liveEvidenceCount: liveEvidence.length,
      inferredEvidenceCount: inferredEvidence.length,
      hasSuggestedLanguage,
    });

    const fallbackUserInstruction = userInstructionForRequirement({
      requirement: requirement.requirement,
      category,
      status,
      liveEvidenceCount: liveEvidence.length,
      inferredEvidenceCount: inferredEvidence.length,
      hasSuggestedLanguage,
    });
    const userInstruction = status === 'already_covered' || category === 'hard_gap' || hasSuggestedLanguage
      ? fallbackUserInstruction
      : latestAssistant?.needsCandidateInput === false && sharedCoachingPolicy?.proofActionDirect
        ? sharedCoachingPolicy.proofActionDirect
        : sharedCoachingPolicy?.proofActionRequiresInput ?? fallbackUserInstruction;
    const fallbackStarterQuestion = buildStarterQuestion({
      requirement: requirement.requirement,
      category,
      source,
      currentEvidenceText: liveEvidence[0]?.text ?? inferredEvidence[0] ?? null,
      sourceEvidenceText: sourceEvidence[0]?.text ?? null,
    });
    const starterQuestion = looksLikeTargetedStarterQuestion(latestAssistant?.currentQuestion, requirement.requirement)
      ? latestAssistant?.currentQuestion?.trim()
      : sharedCoachingPolicy?.clarifyingQuestion?.trim()
        || (looksLikeTargetedStarterQuestion(coachingCard?.interview_questions?.[0]?.question, requirement.requirement)
          ? coachingCard?.interview_questions?.[0]?.question?.trim()
          : looksLikeTargetedStarterQuestion(requirement.strategy?.interview_questions?.[0]?.question, requirement.requirement)
            ? requirement.strategy?.interview_questions?.[0]?.question?.trim()
            : fallbackStarterQuestion);

    return {
      id: `requirement:${source}:${normalizedRequirement}`,
      kind: 'requirement' as const,
      source,
      category,
      title: requirement.requirement,
      status,
      bucket: bucketForItem(status, category),
      isResolved: status === 'already_covered',
      whyItMatters: whyRequirementMatters(source, sourceEvidence),
      aiPlan,
      userInstruction,
      currentEvidence: liveEvidence.length > 0
        ? liveEvidence
        : inferredEvidence.map((text) => ({ text, source: 'resume' as const, basis: 'nearby' as const })),
      sourceEvidence,
      recommendedNextStep,
      requirement: requirement.requirement,
      importance: requirement.importance,
      classification: requirement.classification,
      candidateInputNeeded: latestAssistant?.needsCandidateInput ?? false,
      coachingReasoning: coachingCard?.ai_reasoning ?? requirement.strategy?.ai_reasoning,
      starterQuestion,
      riskNote: category === 'hard_gap'
        ? 'If this is truly missing, keep it visible as a real risk instead of forcing it into the resume.'
        : undefined,
      suggestedDraft: looksLikeResumeRewrite(latestAssistant?.suggestedLanguage)
        ? latestAssistant?.suggestedLanguage
        : looksLikeResumeRewrite(requirement.strategy?.positioning)
          ? requirement.strategy?.positioning
          : undefined,
    };
  }).sort((left, right) => {
    const bucketDiff = bucketWeight(left.bucket) - bucketWeight(right.bucket);
    if (bucketDiff !== 0) return bucketDiff;

    const categoryDiff = categoryWeight(left.category) - categoryWeight(right.category);
    if (categoryDiff !== 0) return categoryDiff;

    const actionDiff = actionWeight(left.recommendedNextStep.action) - actionWeight(right.recommendedNextStep.action);
    if (actionDiff !== 0) return actionDiff;

    const leftSource = left.source === 'job_description' ? 0 : left.source === 'benchmark' ? 1 : 2;
    const rightSource = right.source === 'job_description' ? 0 : right.source === 'benchmark' ? 1 : 2;
    if (leftSource !== rightSource) return leftSource - rightSource;

    const importanceDiff = importanceWeight(left.importance) - importanceWeight(right.importance);
    if (importanceDiff !== 0) return importanceDiff;

    const evidenceDiff = right.currentEvidence.length - left.currentEvidence.length;
    if (evidenceDiff !== 0) return evidenceDiff;

    return left.title.localeCompare(right.title);
  });

  const summary = items.reduce<RewriteQueueSummary>((accumulator, item) => {
    accumulator.total += 1;
    if (item.bucket === 'needs_attention') accumulator.needsAttention += 1;
    if (item.bucket === 'partially_addressed') accumulator.partiallyAddressed += 1;
    if (item.bucket === 'resolved') accumulator.resolved += 1;
    if (item.category === 'hard_gap' && item.bucket !== 'resolved') accumulator.hardGapCount += 1;
    return accumulator;
  }, {
    total: 0,
    needsAttention: 0,
    partiallyAddressed: 0,
    resolved: 0,
    hardGapCount: 0,
  });

  return {
    items,
    summary,
    nextItem: items.find((item) => item.bucket !== 'resolved') ?? items[0] ?? null,
  };
}
