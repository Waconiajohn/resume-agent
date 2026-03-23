export type RequirementCoachingFamily =
  | 'metrics'
  | 'cloudMulti'
  | 'cloudPlatform'
  | 'executiveScope'
  | 'regulated'
  | 'financial'
  | 'communication'
  | 'talent'
  | 'acquisition'
  | 'industry40'
  | 'peBacked'
  | 'portfolio'
  | 'platformScale'
  | 'architecture'
  | 'erp'
  | 'technical'
  | 'scale';

export type RequirementCoachingClassification = 'strong' | 'partial' | 'missing';

export interface RequirementCoachingPolicySnapshot {
  primaryFamily: RequirementCoachingFamily | null;
  families: RequirementCoachingFamily[];
  clarifyingQuestion: string;
  proofActionRequiresInput: string;
  proofActionDirect: string;
  rationale: string;
  lookingFor: string;
}

type RequirementFamilyPolicy = {
  family: RequirementCoachingFamily;
  matches: (normalizedRequirement: string, rawRequirement: string) => boolean;
  clarifyingQuestion: string;
  interviewQuestion?: string;
  proofActionDetail: string;
  rationale: string;
  lookingFor: string;
  targetedQuestionPatterns: RegExp[];
};

function normalizeRequirementText(value: string): string {
  return value.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
}

function summarizeRequirementEvidenceSnippet(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 140) return trimmed;
  return `${trimmed.slice(0, 137).trimEnd()}...`;
}

const REQUIREMENT_FAMILY_POLICIES: readonly RequirementFamilyPolicy[] = [
  {
    family: 'metrics',
    matches: (normalized) => /\b(metric|metrics|kpi|kpis|scorecard|scorecards|dashboard|dashboards|performance tracking|reporting cadence|measure(?:ment|ments)?)\b/.test(normalized),
    clarifyingQuestion: 'Which metrics or scorecards did you personally track, how often did you review them, and what decision or improvement did they drive?',
    proofActionDetail: 'which metrics or scorecards you tracked, how often you reviewed them, and what decision or improvement they drove.',
    rationale: 'Specific metrics, review cadence, and decisions make performance-management claims believable on a resume.',
    lookingFor: 'Named metrics, reporting cadence, and the decision or improvement they drove.',
    targetedQuestionPatterns: [/\b(metric|metrics|kpi|kpis|scorecard|scorecards|dashboard|dashboards|track|tracked|reviewed|reporting)\b/i],
  },
  {
    family: 'cloudMulti',
    matches: (normalized) => /\b(aws)\b.*\b(azure|gcp|additional cloud)\b|\b(azure|gcp|additional cloud)\b.*\baws\b/.test(normalized),
    clarifyingQuestion: 'Where have you used AWS together with Azure or GCP, what did you deliver across those environments, and why did it matter to the business?',
    proofActionDetail: 'where you used AWS together with Azure or GCP, what you delivered across those environments, and why that mattered to the business.',
    rationale: 'Multi-cloud claims only read credibly when the environments, delivery scope, and business reason are explicit.',
    lookingFor: 'Specific AWS plus Azure or GCP context, what was delivered across those environments, and the business outcome.',
    targetedQuestionPatterns: [/\b(aws|azure|gcp|multi-?cloud|cloud)\b/i],
  },
  {
    family: 'cloudPlatform',
    matches: (normalized) => /\b(azure|gcp|google cloud|cloud platform|cloud environments?)\b/.test(normalized),
    clarifyingQuestion: 'Where have you used Azure or GCP, what did you personally own, and what outcome came from that work?',
    proofActionDetail: 'where you used Azure or GCP, what you personally owned, and what outcome came from that work.',
    rationale: 'Cloud-platform claims need the environment, owned scope, and outcome to read as real experience instead of a keyword.',
    lookingFor: 'Specific Azure or GCP context, what was personally owned there, and the business or technical outcome.',
    targetedQuestionPatterns: [/\b(azure|gcp|google cloud|cloud)\b/i],
  },
  {
    family: 'executiveScope',
    matches: (normalized, raw) => /\b(vp|vice president|cmo|chief marketing officer|chief operating officer|chief|director|head of)\b/.test(normalized)
      && /(\d+\+|\$|team|teams|organization|organizations|company|companies|global|enterprise|multi-site|multisite|plant|plants|facility|facilities|people|person|scaling|scale)/i.test(raw),
    clarifyingQuestion: 'What title did you hold, what was the company or business scale, and what business outcome did you lead at that level?',
    proofActionDetail: 'the title you held, the company or business scale involved, and the business outcome you led at that level.',
    rationale: 'Executive-level claims need the title, business scale, and outcome to feel credible.',
    lookingFor: 'Title, company or business scale, and the business outcome delivered at that level.',
    targetedQuestionPatterns: [/\b(title|role|scale|company|business|outcome|director|vp|head)\b/i],
  },
  {
    family: 'regulated',
    matches: (normalized) => /\b(regulated industries?|financial services|healthcare|soc 2|hipaa|pci(?:-dss)?|fedramp|gdpr|cmmc|sox|glba|compliance frameworks?)\b/.test(normalized),
    clarifyingQuestion: 'Where have you worked in a regulated environment, and which industry, compliance framework, or control context was involved?',
    proofActionDetail: 'where you worked in a regulated environment and which industry, compliance framework, or control context was involved.',
    rationale: 'Regulated-environment claims are believable only when the industry or control context is explicit.',
    lookingFor: 'Industry, compliance framework, control context, and where that work happened.',
    targetedQuestionPatterns: [/\b(regulated|compliance|control|hipaa|pci|sox|fedramp|gdpr|industry)\b/i],
  },
  {
    family: 'financial',
    matches: (normalized) => /\b(p&l|budget|revenue|financial|cost optimization|finops|spend)\b/.test(normalized),
    clarifyingQuestion: 'What budget, spend, revenue, or P&L scope did you personally own, and what business decision or outcome did it influence?',
    proofActionDetail: 'the budget, spend, revenue, or P&L scope you owned and the business outcome tied to it.',
    rationale: 'Financial scope only reads credibly when the owned dollars and decisions are explicit.',
    lookingFor: 'Budget, spend, revenue, or P&L scope plus the business result tied to that ownership.',
    targetedQuestionPatterns: [/\b(budget|revenue|financial|p&l|spend|cost)\b/i],
  },
  {
    family: 'communication',
    matches: (normalized) => /\b(communication|executive stakeholder|executive-facing|board|presenting|presentation|influence)\b/.test(normalized),
    clarifyingQuestion: 'Who was the audience, what did you present or align on, and what decision or next step came from it?',
    proofActionDetail: 'who the audience was, what you communicated or aligned on, and what decision or outcome followed.',
    rationale: 'Executive communication only counts when the audience, message, and outcome are clear.',
    lookingFor: 'Audience seniority, what was presented, and the decision, alignment, or outcome that followed.',
    targetedQuestionPatterns: [/\b(audience|stakeholder|stakeholders|present|presented|board|communicat|align|decision)\b/i],
  },
  {
    family: 'talent',
    matches: (normalized) => /\b(talent development|leadership pipeline|bench strength|succession|develop(?:ing)? leaders|high-performing teams?|hiring|hire|coach(?:ing)?|mentor(?:ing)?|promot(?:e|ed|ion)|people development)\b/.test(normalized)
      || /\b(build|built|lead|leading|led)\b.*\b(team|teams|organization|organizations|people)\b/.test(normalized),
    clarifyingQuestion: 'Who did you hire, coach, develop, or promote, and what changed because of that leadership?',
    interviewQuestion: 'How many people did you lead, hire, coach, or promote, and what changed because of your leadership?',
    proofActionDetail: 'who you hired, developed, coached, or promoted and what changed because of that leadership.',
    rationale: 'Leadership pipeline claims become credible when the team scope and people outcomes are explicit.',
    lookingFor: 'Team size, hiring or development scope, and the leadership or business result that followed.',
    targetedQuestionPatterns: [/\b(team|people|hire|hired|coach|coached|develop|developed|promot|leadership)\b/i],
  },
  {
    family: 'acquisition',
    matches: (normalized) => /\b(post-acquisition|post acquisition|acquisition integration|merger integration|integration workstream)\b/.test(normalized),
    clarifyingQuestion: 'What acquisition or merger integration workstream did you lead, which operational area was involved, and what changed after the integration?',
    proofActionDetail: 'the acquisition or merger integration workstream you led, what operational area was involved, and what changed after the integration.',
    rationale: 'Acquisition-integration claims need the workstream, operating area, and post-integration change to feel real.',
    lookingFor: 'Integration workstream, operational area, and what changed after the acquisition or merger.',
    targetedQuestionPatterns: [/\b(acquisition|merger|integration|workstream)\b/i],
  },
  {
    family: 'industry40',
    matches: (normalized) => /\b(industry 4\.0|digital transformation|smart manufacturing|predictive maintenance|digital twin|iot)\b/.test(normalized),
    clarifyingQuestion: 'What Industry 4.0 or digital transformation initiative did you lead, what technology or operating change was involved, and what business result came from it?',
    proofActionDetail: 'the Industry 4.0 or digital transformation initiative you led, what technology or operating change was involved, and the business result.',
    rationale: 'Transformation claims only land when the operating change, technology, and business result are concrete.',
    lookingFor: 'Specific Industry 4.0 or transformation initiative, the operating or technology change, and the business result.',
    targetedQuestionPatterns: [/\b(industry 4\.0|digital transformation|smart manufacturing|predictive maintenance|digital twin|iot|technology|operating change)\b/i],
  },
  {
    family: 'peBacked',
    matches: (normalized) => /\b(pe-backed|private equity|private-equity|value creation)\b/.test(normalized),
    clarifyingQuestion: 'Where have you operated in a PE-backed environment, and what growth, turnaround, or value-creation result did you drive there?',
    proofActionDetail: 'how you operated in a PE-backed environment and what growth, turnaround, or value-creation result you drove there.',
    rationale: 'PE-backed experience is credible only when the operating context and value-creation result are clear.',
    lookingFor: 'Private-equity operating context plus the growth, turnaround, or value-creation outcome.',
    targetedQuestionPatterns: [/\b(pe-backed|private equity|value creation|turnaround|growth)\b/i],
  },
  {
    family: 'portfolio',
    matches: (normalized) => /\b(multi-brand|portfolio management|portfolio strategy|brand architecture|product lines|brand portfolio|category portfolio)\b/.test(normalized),
    clarifyingQuestion: 'Which brands, product lines, or categories were involved, how did you coordinate them, and what business result came from that work?',
    proofActionDetail: 'the brands, product lines, or categories involved, how you coordinated them, and the business result that followed.',
    rationale: 'Portfolio claims need the brands or categories involved plus the coordination outcome.',
    lookingFor: 'Brands, product lines, or categories involved, how they were coordinated, and the business result.',
    targetedQuestionPatterns: [/\b(brand|brands|product lines?|categories|portfolio)\b/i],
  },
  {
    family: 'platformScale',
    matches: (normalized) => /\b(data platform|transactions?|transactional|api requests?|throughput|latency|uptime|availability|distributed systems?|platform components?|real-time|realtime)\b/.test(normalized),
    clarifyingQuestion: 'What scale did you support, such as transaction volume, uptime, latency, or system footprint, and what did you build or improve at that scale?',
    proofActionDetail: 'the scale involved, such as transaction volume, uptime, latency, or system footprint, and what you built or improved at that scale.',
    rationale: 'Technical scale claims become believable when the environment, scale, and outcome are concrete.',
    lookingFor: 'Transaction scale, uptime, latency, system footprint, and what was built or improved at that scale.',
    targetedQuestionPatterns: [/\b(transaction|transactions|request|requests|uptime|latency|availability|scale|footprint|system)\b/i],
  },
  {
    family: 'architecture',
    matches: (normalized) => /\b(cross-functional architecture decisions|architecture decisions|architectural decisions|technical decisions|design decisions|stakeholders|trade-?offs|cross-functional)\b/.test(normalized),
    clarifyingQuestion: 'Which stakeholders were involved, what tradeoff or architecture decision did you lead, and what outcome came from it?',
    proofActionDetail: 'the architecture or cross-functional decision you led, the tradeoff involved, and the resulting outcome.',
    rationale: 'Architecture requirements become believable when stakeholders, tradeoffs, and outcomes are explicit.',
    lookingFor: 'Stakeholders, tradeoffs, decisions led, and the resulting technical or business outcome.',
    targetedQuestionPatterns: [/\b(architecture|architectural|stakeholder|stakeholders|tradeoff|trade-off|decision|design)\b/i],
  },
  {
    family: 'erp',
    matches: (normalized) => /\b(erp|sap|oracle|netsuite|workday|enterprise resource planning)\b/.test(normalized),
    clarifyingQuestion: 'Where have you used ERP systems (SAP, Oracle, or similar), what did you personally own, and what outcome came from that work?',
    proofActionDetail: 'where you used ERP systems (SAP, Oracle, or similar), what you personally owned, and what outcome came from that work.',
    rationale: 'ERP claims need the system context, owned responsibility, and outcome to read as real operating experience.',
    lookingFor: 'ERP system context, personal ownership, and the business or operating result that followed.',
    targetedQuestionPatterns: [/\b(erp|sap|oracle|netsuite|workday|system)\b/i],
  },
  {
    family: 'technical',
    matches: (normalized) => /\b(aws|azure|gcp|cloud|soc 2|hipaa|pci|kubernetes|terraform|disaster recovery|chaos engineering|digital transformation|erp|sap|oracle|netsuite|workday|enterprise systems?)\b/.test(normalized),
    clarifyingQuestion: 'Which platform, framework, or technical environment was involved, and what did you personally deliver there?',
    proofActionDetail: 'the technical environment involved and what you personally delivered there.',
    rationale: 'Technical requirements become believable when the environment and personal contribution are concrete.',
    lookingFor: 'Specific platform or framework context plus what the candidate personally delivered there.',
    targetedQuestionPatterns: [/\b(platform|framework|technical|aws|azure|gcp|cloud|kubernetes|terraform|environment|erp|sap|oracle|netsuite|workday)\b/i],
  },
  {
    family: 'scale',
    matches: (_normalized, raw) => /(\d+\+|\$|team|teams|organization|organizations|company|companies|global|enterprise|multi-site|multisite|plant|plants|facility|facilities|people|person|scaling|scale)/i.test(raw),
    clarifyingQuestion: 'What exact scale was involved, such as team size, budget, sites, revenue, or footprint, and what result did you drive?',
    proofActionDetail: 'the exact scale involved, such as team size, budget, sites, revenue, or operating footprint, and the result you drove.',
    rationale: 'Scale-based claims only land when the concrete scope and result are explicit.',
    lookingFor: 'Concrete scale such as team size, sites, budget, revenue, or footprint, plus the outcome achieved.',
    targetedQuestionPatterns: [/\b(scale|team|budget|sites|revenue|footprint|organization|plants?|facilities)\b/i],
  },
] as const;

function getPrimaryRequirementFamilyPolicy(requirement: string): RequirementFamilyPolicy | undefined {
  const normalizedRequirement = normalizeRequirementText(requirement);
  return REQUIREMENT_FAMILY_POLICIES.find((policy) => policy.matches(normalizedRequirement, requirement));
}

function extractRequirementExperienceSubject(requirement: string): string | null {
  const trimmed = requirement.trim().replace(/[.?!]+$/, '');
  if (!trimmed) return null;

  const match = trimmed.match(/\b(?:experience with|experience in|experience using|expertise in|background in|knowledge of|familiarity with)\s+(.+)$/i);
  if (!match?.[1]) return null;

  return match[1].trim();
}

export function detectRequirementCoachingFamilies(requirement: string): RequirementCoachingFamily[] {
  const normalizedRequirement = normalizeRequirementText(requirement);
  return REQUIREMENT_FAMILY_POLICIES
    .filter((policy) => policy.matches(normalizedRequirement, requirement))
    .map((policy) => policy.family);
}

export function buildRequirementClarifyingQuestion(requirement: string): string {
  const primaryPolicy = getPrimaryRequirementFamilyPolicy(requirement);
  if (primaryPolicy) {
    return primaryPolicy.clarifyingQuestion;
  }

  const experienceSubject = extractRequirementExperienceSubject(requirement);
  if (experienceSubject) {
    return `Where did you use ${experienceSubject}, what did you personally own, and what outcome came from that work?`;
  }

  return `What is the clearest concrete example that proves "${requirement.trim()}" for this role?`;
}

export function buildRequirementProofAction(requirement: string, requiresCandidateInput: boolean): string {
  const prefix = requiresCandidateInput
    ? 'If you have this experience, add one concrete example showing '
    : 'Add one concrete example showing ';
  const primaryPolicy = getPrimaryRequirementFamilyPolicy(requirement);

  if (primaryPolicy) {
    return `${prefix}${primaryPolicy.proofActionDetail}`;
  }

  const experienceSubject = extractRequirementExperienceSubject(requirement);
  if (experienceSubject) {
    return `${prefix}where you used ${experienceSubject}, what you personally owned, and what outcome came from that work.`;
  }

  return `${prefix}${requirement.trim().replace(/[.?!]+$/, '')}.`;
}

export function isGenericClarifyingQuestion(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [
    /^what is the strongest (real )?example from your background/,
    /^what additional detail/,
    /^can you provide specific examples?/,
    /^can you provide specific examples of your experience/,
    /^can you provide examples of/,
    /^can you provide more information about/,
    /^can you provide (?:an|a) example of/,
    /^can you describe any/,
    /^can you describe your experience with/,
    /^can you share any/,
    /^can you tell me more about/,
    /truthful example/,
    /this must-have requirement/,
    /, if any\??$/,
  ].some((pattern) => pattern.test(normalized));
}

export function looksLikeRequirementRewrite(text: string | null | undefined): text is string {
  if (typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (!trimmed) return false;

  const wordCount = trimmed.split(/\s+/).length;
  const hasStrongVerb = /\b(led|built|developed|tracked|drove|improved|managed|owned|created|launched|delivered|oversaw|designed|implemented|optimized|reduced|increased|grew|guided|ran|used|partnered|presented|executed|standardized|scaled)\b/i.test(trimmed);
  const hasMetricSignal = /[$%]|\b\d+\b|\b(kpi|kpis|metric|metrics|scorecard|scorecards|dashboard|dashboards|budget|revenue|cost|throughput|latency|uptime)\b/i.test(trimmed);
  const hasCredentialSignal = /\b(bachelor'?s|master'?s|mba|phd|doctorate|degree|certification|certified|license|licensed|licensure|aws|azure|gcp|pmp|cpa|rn|pe)\b/i.test(trimmed);
  const hasIndustrySignal = /\b(financial services|banking|healthcare|insurance|energy|oil|gas|manufacturing|retail|telecom|logistics|transportation|saas|software|fintech|medtech|pharma|public sector|government|education)\b/i.test(trimmed);
  const looksLikeLabel = /\b(experience|expertise|background|exposure|knowledge|skills?)\b/i.test(trimmed) && wordCount <= 7;
  const looksLikeInstruction = /^(use|acknowledge|frame|highlight|position|naturally|translate|connect|show|bring|surface|tie|focus on|lean on|answer|tell us)\b/i.test(trimmed);
  const looksLikeWeakOpener = /^(experience with|background in|related |familiar with|proven ability to|knowledge of)\b/i.test(trimmed.toLowerCase());

  if (looksLikeLabel || looksLikeInstruction || looksLikeWeakOpener) return false;
  if (wordCount < 3 && !hasStrongVerb && !hasMetricSignal && !hasCredentialSignal && !hasIndustrySignal) return false;

  return true;
}

export function looksLikeTargetedRequirementQuestion(question: string | null | undefined, requirement: string): question is string {
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

  const primaryPolicy = getPrimaryRequirementFamilyPolicy(requirement);
  if (!primaryPolicy) {
    return true;
  }

  return primaryPolicy.targetedQuestionPatterns.some((pattern) => pattern.test(trimmed));
}

export function buildRequirementFallbackQuestion(args: {
  requirement: string;
  classification: RequirementCoachingClassification;
  evidence: string[];
  jobDescriptionExcerpt?: string | null;
}): string {
  const evidenceSnippet = summarizeRequirementEvidenceSnippet(args.evidence[0] ?? null);
  const prefix = evidenceSnippet
    ? `Your resume already shows "${evidenceSnippet}". `
    : args.classification === 'missing'
      ? 'The resume does not show this directly yet. '
      : '';

  const primaryPolicy = getPrimaryRequirementFamilyPolicy(args.requirement);
  if (primaryPolicy) {
    return `${prefix}${primaryPolicy.clarifyingQuestion}`;
  }

  const experienceSubject = extractRequirementExperienceSubject(args.requirement);
  if (experienceSubject) {
    return `${prefix}Where did you use ${experienceSubject}, what did you personally own, and what outcome came from that work?`;
  }

  const jdSnippet = summarizeRequirementEvidenceSnippet(args.jobDescriptionExcerpt ?? null);
  if (jdSnippet && normalizeRequirementText(jdSnippet) !== normalizeRequirementText(args.requirement)) {
    return `${prefix}What is the clearest example from your background that proves this role need: "${jdSnippet}"?`;
  }

  return `${prefix}What is the clearest concrete example that proves "${args.requirement}" for this role?`;
}

export function buildRequirementFallbackResponse(args: {
  requirement: string;
  classification: RequirementCoachingClassification;
  evidence: string[];
}): string {
  const evidenceSnippet = summarizeRequirementEvidenceSnippet(args.evidence[0] ?? null);
  if (evidenceSnippet) {
    return `Right now the strongest proof we have is "${evidenceSnippet}". That points in the right direction, but it still does not make "${args.requirement}" obvious enough on the resume. I need one more concrete detail before I should draft a stronger line.`;
  }

  if (args.classification === 'missing') {
    return `Right now the resume does not show direct proof for "${args.requirement}". I need one concrete detail from your background before I should draft resume language for it.`;
  }

  return `The proof for "${args.requirement}" is still too thin to rewrite safely. I need one more concrete detail before I should turn this into resume language.`;
}

export function buildRequirementInterviewQuestion(args: {
  requirement: string;
  hardRequirement?: boolean;
  evidenceSnippet?: string | null;
  companyReference?: string | null;
}): string {
  const prefix = args.evidenceSnippet
    ? `Your resume already shows "${summarizeRequirementEvidenceSnippet(args.evidenceSnippet) ?? args.evidenceSnippet}". `
    : args.companyReference
      ? `Thinking about ${args.companyReference}, `
      : '';

  if (args.hardRequirement) {
    return `${prefix}Do you actually have ${args.requirement}, or is this a true gap we need to leave visible?`;
  }

  const primaryPolicy = getPrimaryRequirementFamilyPolicy(args.requirement);
  if (primaryPolicy) {
    return `${prefix}${primaryPolicy.interviewQuestion ?? primaryPolicy.clarifyingQuestion}`;
  }

  const experienceSubject = extractRequirementExperienceSubject(args.requirement);
  if (experienceSubject) {
    return `${prefix}Where did you use ${experienceSubject}, what did you personally own, and what outcome came from that work?`;
  }

  return `${prefix}What is the clearest concrete example that proves "${args.requirement}" for this role?`;
}

export function buildRequirementInterviewQuestionRationale(requirement: string, hardRequirement = false): string {
  if (hardRequirement) {
    return 'We need to confirm whether this requirement actually exists before we decide how to position the risk.';
  }

  const primaryPolicy = getPrimaryRequirementFamilyPolicy(requirement);
  if (primaryPolicy) {
    return primaryPolicy.rationale;
  }

  return 'One concrete detail will turn adjacent proof into stronger, more defensible resume language.';
}

export function buildRequirementInterviewQuestionLookingFor(requirement: string, hardRequirement = false): string {
  if (hardRequirement) {
    return 'Confirmation that the credential, degree, or license exists, or confirmation that it is truly missing.';
  }

  const primaryPolicy = getPrimaryRequirementFamilyPolicy(requirement);
  if (primaryPolicy) {
    return primaryPolicy.lookingFor;
  }

  return 'Scope, scale, stakeholders, measurable outcomes, or technical depth tied directly to the requirement.';
}

export function getRequirementCoachingPolicySnapshot(requirement: string): RequirementCoachingPolicySnapshot {
  const families = detectRequirementCoachingFamilies(requirement);
  return {
    primaryFamily: families[0] ?? null,
    families,
    clarifyingQuestion: buildRequirementClarifyingQuestion(requirement),
    proofActionRequiresInput: buildRequirementProofAction(requirement, true),
    proofActionDirect: buildRequirementProofAction(requirement, false),
    rationale: buildRequirementInterviewQuestionRationale(requirement),
    lookingFor: buildRequirementInterviewQuestionLookingFor(requirement),
  };
}
