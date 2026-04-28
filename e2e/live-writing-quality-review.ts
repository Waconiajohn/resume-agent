import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { STRESS_TEST_PROFILES } from './fixtures/stress-test-profiles.js';
import { createEmptySharedContext } from '../server/src/contracts/shared-context.js';
import { editorTools as linkedInEditorTools } from '../server/src/agents/linkedin-editor/editor/tools.js';
import { writerTools as linkedInContentTools } from '../server/src/agents/linkedin-content/writer/tools.js';
import { analystTools as coverLetterAnalystTools } from '../server/src/agents/cover-letter/analyst/tools.js';
import { writerTools as coverLetterWriterTools } from '../server/src/agents/cover-letter/writer/tools.js';
import { writerTools as thankYouTools } from '../server/src/agents/thank-you-note/writer/tools.js';
import { writerTools as followUpTools } from '../server/src/agents/follow-up-email/writer/tools.js';
import { writerTools as interviewPrepTools } from '../server/src/agents/interview-prep/writer/tools.js';

import type { SharedContext } from '../server/src/contracts/shared-context.js';
import type { LinkedInEditorState, ProfileSection } from '../server/src/agents/linkedin-editor/types.js';
import type { LinkedInContentState } from '../server/src/agents/linkedin-content/types.js';
import type { CoverLetterState, CoverLetterSSEEvent } from '../server/src/agents/cover-letter/types.js';
import type { ThankYouNoteState, ThankYouNoteSSEEvent } from '../server/src/agents/thank-you-note/types.js';
import type { FollowUpEmailState, FollowUpEmailSSEEvent } from '../server/src/agents/follow-up-email/types.js';
import type { InterviewPrepState, InterviewPrepSSEEvent } from '../server/src/agents/interview-prep/types.js';

type AnyEvent = Record<string, unknown>;
const artifactIssueSummary: Array<{ title: string; issues: string[] }> = [];

function makeCtx<TState extends { session_id: string; user_id: string }, TEvent = AnyEvent>(state: TState) {
  const events: TEvent[] = [];
  return {
    sessionId: state.session_id,
    userId: state.user_id,
    getState: () => state,
    updateState: (patch: Partial<TState>) => Object.assign(state, patch),
    emit: (event: TEvent) => events.push(event),
    waitForUser: async () => true,
    scratchpad: {} as Record<string, unknown>,
    signal: new AbortController().signal,
    sendMessage: async () => undefined,
    events,
  };
}

function makeSharedContext(): SharedContext {
  const shared = createEmptySharedContext();
  shared.candidateProfile.fullName = 'David Harrington';
  shared.candidateProfile.headline = 'VP Operations | Multi-Site Manufacturing | Lean Transformation | Supply Chain Optimization';
  shared.candidateProfile.seniorityLevel = 'VP';
  shared.candidateProfile.yearsOfExperience = 20;
  shared.candidateProfile.coreFunctions = ['Manufacturing operations', 'Lean transformation', 'Supply chain', 'Capital programs'];
  shared.candidateProfile.industries = ['Industrial manufacturing', 'Precision-machined components'];
  shared.candidateProfile.leadershipScope.summary = 'Three manufacturing facilities, 1,100 employees, $210M operating budget partnership.';
  shared.candidateProfile.leadershipScope.scopeOfResponsibility = 'Operations, plant leadership, quality, logistics, supplier performance, capital modernization.';
  shared.candidateProfile.certifications = ['Lean Six Sigma Master Black Belt', 'CPIM'];
  shared.candidateProfile.factualSummary =
    'Operations executive with 20 years leading multi-site manufacturing, Lean/Six Sigma transformation, quality improvement, supplier performance, and capital modernization.';

  shared.targetRole.roleTitle = 'Chief Operating Officer';
  shared.targetRole.roleLevel = 'C-suite';
  shared.targetRole.jobRequirements = [
    'Own consolidated manufacturing and supply chain P&L',
    'Lead cross-divisional integration',
    'Represent operations to Board and PE sponsor',
    'Drive $25M Lean savings over 24 months',
    'Oversee $60M capital modernization program',
  ];
  shared.targetRole.mustHaveRequirements = [
    'True P&L ownership',
    'Board or PE sponsor presentations',
    'Multi-facility manufacturing leadership',
  ];
  shared.targetCompany.companyName = 'Coventry Industrial Holdings';
  shared.targetCompany.ownershipModel = 'Private equity-backed';
  shared.targetCompany.businessModel = 'Industrial manufacturing across four operating divisions';
  shared.targetCompany.knownStrategicPriorities = [
    'Unify operating model across divisions',
    'Build operating data room for recapitalization',
    'Deliver margin recovery and Lean savings',
  ];

  shared.careerNarrative.careerArc =
    'David has repeatedly moved from hands-on manufacturing engineering into broader operating leadership, turning shop-floor discipline into executive operating cadence.';
  shared.careerNarrative.leadershipIdentity = 'operating-system builder';
  shared.careerNarrative.signatureStrengths = [
    'Makes operational waste visible and measurable',
    'Standardizes messy multi-site environments',
    'Turns Lean into sustained operating discipline',
  ];
  shared.careerNarrative.careerThemes = ['Multi-site operations', 'Lean transformation', 'Supplier and capital discipline'];
  shared.careerNarrative.differentiators = [
    'Can connect shop-floor mechanics to executive operating rhythm',
    'Has real scale across people, facilities, budget influence, and suppliers',
  ];
  shared.careerNarrative.authenticPhrases = [
    'I turn recurring firefighting into repeatable operating cadence.',
    'I make the operating system visible enough that leaders can actually manage it.',
  ];

  shared.benchmarkCandidate.benchmarkSummary =
    'The benchmark COO can own P&L, speak credibly to a PE board, unify divisions, and still understand the manufacturing mechanics behind Lean savings.';
  shared.benchmarkCandidate.benchmarkRequirements = shared.targetRole.jobRequirements;
  shared.benchmarkCandidate.benchmarkSignals = [
    'P&L ownership',
    'Board-level operating narrative',
    'Cross-divisional integration',
    'Lean savings with hard metrics',
  ];
  shared.benchmarkCandidate.differentiators = [
    'Manufacturing transformation credibility',
    'Multi-site scale',
    'Supplier and capital discipline',
  ];
  shared.benchmarkCandidate.benchmarkGapsRelativeToCandidate = [
    'No explicit final P&L sign-off',
    'No confirmed PE board presentation ownership',
  ];

  shared.positioningStrategy.positioningAngle =
    'Manufacturing operating-system builder who can unify multi-site execution and turn Lean discipline into board-visible margin improvement.';
  shared.positioningStrategy.supportingThemes = [
    'Multi-site standardization',
    'Lean savings and quality improvement',
    'Capital and supplier discipline',
  ];
  shared.positioningStrategy.riskAreas = [
    'Do not overclaim true P&L ownership',
    'Do not invent board or PE sponsor presentation history',
  ];
  shared.positioningStrategy.approvedFraming = [
    '$210M operating budget partnership with VP Finance is adjacent proof for P&L discipline, not full P&L ownership.',
    'Cincinnati Manufacturing Consortium advisory board is adjacent proof for board-level communication, not PE board reporting.',
  ];
  shared.positioningStrategy.framingStillRequiringConfirmation = [
    'Has David personally presented operating results to a board or PE sponsor?',
    'Did David own any final P&L sign-off or only cost-per-unit targets?',
  ];

  const evidence = [
    {
      id: 'ev_lean_18m',
      statement: 'Directed Lean transformation across three sites, eliminating $18M in annualized waste over four years.',
      supports: ['Lean transformation', 'margin improvement', 'multi-site operations'],
      sourceExcerpt: 'Directed Lean transformation program across all sites, eliminating $18M in annualized waste over four years.',
    },
    {
      id: 'ev_quality_defects',
      statement: 'Reduced defect rate from 4.2% to 0.9% through Six Sigma DMAIC projects and internal Black Belt cohort development.',
      supports: ['quality systems', 'Six Sigma', 'operational discipline'],
      sourceExcerpt: 'Reduced manufacturing defect rate from 4.2% to 0.9%.',
    },
    {
      id: 'ev_capex_47m',
      statement: 'Oversaw $47M capital expenditure modernization program that improved throughput 22% and came in $2.1M under budget.',
      supports: ['capital modernization', 'throughput', 'budget discipline'],
      sourceExcerpt: 'Oversaw $47M capital expenditure program... 22% throughput improvement... $2.1M under budget.',
    },
    {
      id: 'ev_supplier_6m',
      statement: 'Negotiated $6M in supplier cost reductions while improving on-time delivery from 81% to 96%.',
      supports: ['supplier management', 'working capital', 'cost reduction'],
      sourceExcerpt: 'Managed relationships with 40+ suppliers, negotiating $6M in annual cost reductions.',
    },
  ].map((item) => ({
    ...item,
    level: 'DirectProof' as const,
    sourceType: 'resume',
    sourceArtifactId: 'stress_fixture_vp_ops',
    limitations: [],
    requiresConfirmation: false,
    finalArtifactEligible: true,
    riskLabel: 'Low' as const,
    confidence: 'High' as const,
    provenance: { origin: 'platform_context' as const, sourceProduct: 'fixture', mapper: 'live-writing-quality-review' },
  }));
  shared.evidenceInventory.evidenceItems = evidence;
  shared.evidenceInventory.directProof = evidence;
  shared.evidenceInventory.artifactEligibleEvidenceIds = evidence.map((item) => item.id);
  shared.gapAnalysis.criticalRisks = [
    'True final P&L ownership is not directly supported.',
    'Board/PE sponsor presentation experience is adjacent, not direct.',
  ];
  shared.gapAnalysis.coverageSummary =
    'Strong manufacturing transformation fit with high-risk gaps around P&L ownership and board/PE communication.';
  return shared;
}

const profile = STRESS_TEST_PROFILES[0];
if (!profile) throw new Error('Missing stress profile 0');
const sharedContext = makeSharedContext();

const resumeData = {
  name: 'David Harrington',
  current_title: 'Vice President of Operations',
  career_summary:
    'Operations executive with 20 years leading multi-site manufacturing, Lean/Six Sigma transformation, supplier performance, quality improvement, and capital modernization.',
  key_skills: [
    'Multi-site manufacturing operations',
    'Lean transformation',
    'Six Sigma DMAIC',
    'Supplier negotiation',
    'Capital modernization',
    'Quality systems',
    'Operating budget partnership',
  ],
  key_achievements: [
    'Eliminated $18M in annualized waste across three manufacturing sites.',
    'Reduced manufacturing defect rate from 4.2% to 0.9%.',
    'Improved supplier on-time delivery from 81% to 96% while negotiating $6M in annual savings.',
    'Delivered a $47M CNC modernization program with 22% throughput improvement and $2.1M under budget.',
    'Collaborated with VP Finance on a $210M annual operating budget, with accountability for cost-per-unit targets but not final P&L sign-off.',
  ],
  work_history: [
    {
      company: 'Meridian Industrial Group',
      title: 'Vice President of Operations',
      duration: '2017 – Present',
      highlights: [
        'Lead operations for three manufacturing facilities employing 1,100 people.',
        'Eliminated $18M in annualized waste through Lean transformation.',
        'Reduced defect rate from 4.2% to 0.9% through Six Sigma DMAIC projects.',
        'Oversaw $47M capital modernization program that improved throughput 22% and came in $2.1M under budget.',
        'Negotiated $6M in annual supplier cost reductions while improving on-time delivery from 81% to 96%.',
        'Collaborated with VP Finance on annual operating budget of $210M; accountable for cost-per-unit targets but not ultimate P&L sign-off.',
      ],
    },
    {
      company: 'Fortis Components LLC',
      title: 'Director of Manufacturing Operations',
      duration: '2011 – 2017',
      highlights: [
        'Managed daily operations across two stamping and assembly plants with 620 employees.',
        'Increased Overall Equipment Effectiveness from 67% to 84% through TPM.',
        'Reduced WIP inventory by 31%, freeing $4.8M in working capital.',
        'Led ISO 9001:2015 recertification and introduced statistical process control on 14 product lines.',
      ],
    },
  ],
};

const jdAnalysis = {
  company_name: 'Coventry Industrial Holdings',
  role_title: 'Chief Operating Officer',
  requirements: [
    'Own consolidated P&L for manufacturing and supply chain',
    'Lead cross-divisional integration of operating standards, ERP systems, and procurement contracts',
    'Represent operations to the Board and PE sponsor in quarterly reviews',
    'Drive enterprise-wide Lean program targeting $25M in savings over 24 months',
    'Oversee capital allocation for $60M equipment and facility modernization program',
    'Partner with CFO on working capital optimization',
  ],
  culture_cues: ['private equity-backed', 'value-creation plan', 'recapitalization', 'operating discipline'],
};

const interviewJdAnalysis = {
  ...jdAnalysis,
  seniority_level: 'c_suite' as const,
  raw_job_description: profile.jobDescription,
  requirements: jdAnalysis.requirements.map((requirement, index) => ({
    requirement,
    expanded_definition:
      index === 0
        ? 'Own financial and operational accountability, not merely coordinate operations.'
        : index === 2
          ? 'Translate operating performance into board-level financial narrative for PE stakeholders.'
          : `Deliver executive-level ownership for ${requirement.toLowerCase()}.`,
    rank: index + 1,
  })),
};

const companyResearch = {
  company_name: 'Coventry Industrial Holdings',
  overview:
    'Coventry is a fictional, PE-backed industrial manufacturer with $480M revenue across four operating divisions in precision machined components, coatings, engineered plastics, and contract assembly.',
  revenue_streams: ['Precision machined components', 'Specialty coatings', 'Engineered plastics', 'Contract assembly'],
  industry: 'Industrial manufacturing',
  growth_areas: ['Operating-model unification', 'Lean savings', 'Recapitalization readiness'],
  risks: ['Integration complexity', 'P&L gap risk', 'Board-confidence pressure', 'ERP and procurement standardization'],
  competitors: [],
  strategic_priorities: ['Unify operating standards', 'Build operating data room', 'Deliver $25M savings plan'],
  culture_signals: ['PE-backed accountability', 'Board-visible metrics', 'Operating discipline'],
  role_impact:
    'The COO is the execution owner for margin recovery, integration, COGS discipline, capital allocation, and recapitalization readiness.',
  source_confidence: 'jd_only' as const,
};

function qualityScan(text: string) {
  const issues: string[] = [];
  const lower = text.toLowerCase();
  if (text.trim().startsWith('{') || /"\w+"\s*:/.test(text.slice(0, 250))) issues.push('Possible raw JSON rendering.');
  if (/\[[^\]]+\]|\{\{[^}]+\}\}|<[^>]+>/.test(text)) issues.push('Placeholder or bracketed scaffold detected.');
  if (/(?:best|sincerely|regards),?\s*\n\s*(?:the candidate|candidate)\s*$/i.test(text.trim())) issues.push('Candidate-name sign-off missing.');
  if (/i am writing to express my interest/i.test(text)) issues.push('Generic cover-letter opener.');
  if (/^Dear Hiring Manager,/m.test(text)) issues.push('Generic salutation.');
  if (/hope this (email )?finds you well/i.test(text)) issues.push('Banned email cliche.');
  if (/sorry to bother|just wanted to|i know you'?re busy/i.test(lower)) issues.push('Subordinate/desperate tone.');
  if (/results-driven|proven track record|dynamic leader|passionate about|leverage my/i.test(lower)) issues.push('AI/resume-speak filler.');
  if (/perfect fit|ideal candidate/i.test(lower)) issues.push('Overclaiming language.');
  if (/true p&l ownership|owned the p&l/i.test(lower) && !/not final p&l|not ultimate p&l|adjacent|cost-per-unit/i.test(lower)) {
    issues.push('Potential P&L overclaim.');
  }
  if (/board|pe sponsor/i.test(lower) && /presented|represented|reported/i.test(lower) && !/advisory|prepare|ready|adjacent|not direct|if asked/i.test(lower)) {
    issues.push('Potential board/PE overclaim.');
  }
  return issues;
}

function summarizeArtifact(title: string, text: string, notes: string[] = []) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const issues = qualityScan(text);
  artifactIssueSummary.push({ title, issues });
  return [
    `## ${title}`,
    '',
    `- Words: ${words}`,
    `- Automated issues: ${issues.length ? issues.join('; ') : 'none detected'}`,
    ...notes.map((note) => `- ${note}`),
    '',
    '```markdown',
    text.trim(),
    '```',
    '',
  ].join('\n');
}

function formatCarouselSlides(slides: unknown): string {
  if (!Array.isArray(slides)) return String(slides ?? '');
  return slides.map((slide, index) => {
    const record = slide && typeof slide === 'object' ? slide as Record<string, unknown> : {};
    const lines = [
      `Slide ${String(record.slideNumber ?? index + 1)} (${String(record.type ?? 'content')})`,
      `Headline: ${String(record.headline ?? '').trim()}`,
    ];
    if (record.body) lines.push(`Body: ${String(record.body).trim()}`);
    const bullets = Array.isArray(record.bulletPoints) ? record.bulletPoints.map(String).filter(Boolean) : [];
    if (bullets.length) lines.push(`Bullets: ${bullets.join(' | ')}`);
    return lines.join('\n');
  }).join('\n\n');
}

async function run() {
  const sections: string[] = [
    '# Live Writing Quality Review — David Harrington / Coventry COO',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Scenario: VP Operations candidate targeting a COO role at a PE-backed manufacturer. This run intentionally tests strategic creativity, adjacent-proof handling, and overclaim prevention around P&L and Board/PE experience.',
    '',
    '## Human Assessment Summary',
    '',
    'This live run is being evaluated as a professional career strategist would evaluate it: does the output make a strong candidate more memorable, more discoverable, and more credible without inventing facts?',
    '',
  ];

  // LinkedIn profile editor.
  const linkedinProfileState: LinkedInEditorState = {
    session_id: randomUUID(),
    user_id: 'live-review-user',
    current_stage: 'editor',
    current_profile: `David Harrington
Vice President of Operations | Lean Six Sigma | Manufacturing Operations | Supply Chain

About
Operations executive with 20 years of experience in manufacturing operations. I lead teams, improve processes, and drive Lean initiatives. I have experience with suppliers, quality, and capital projects.

Experience
Vice President of Operations, Meridian Industrial Group
Director of Manufacturing Operations, Fortis Components`,
    platform_context: {
      positioning_strategy: {
        angle: sharedContext.positioningStrategy.positioningAngle,
        riskAreas: sharedContext.positioningStrategy.riskAreas,
      },
      evidence_items: sharedContext.evidenceInventory.evidenceItems,
      career_narrative: {
        leadershipIdentity: sharedContext.careerNarrative.leadershipIdentity,
        careerArc: sharedContext.careerNarrative.careerArc,
      },
    },
    shared_context: sharedContext,
    sections_completed: [],
    section_drafts: {},
    section_feedback: {},
    quality_scores: {},
  };
  const linkedinCtx = makeCtx<LinkedInEditorState>(linkedinProfileState);
  for (const section of ['headline', 'about'] as ProfileSection[]) {
    await linkedInEditorTools.find((tool) => tool.name === 'write_section')!.execute({ section }, linkedinCtx as never);
    await linkedInEditorTools.find((tool) => tool.name === 'self_review_section')!.execute({ section }, linkedinCtx as never);
    linkedinProfileState.section_drafts[section] = String(linkedinCtx.scratchpad[`draft_${section}`] ?? '');
    linkedinProfileState.quality_scores[section] = linkedinCtx.scratchpad[`scores_${section}`] as never;
  }
  sections.push(summarizeArtifact(
    'LinkedIn Profile Editor — Headline',
    linkedinProfileState.section_drafts.headline ?? '',
    [`Scores: ${JSON.stringify(linkedinProfileState.quality_scores.headline ?? {})}`],
  ));
  sections.push(summarizeArtifact(
    'LinkedIn Profile Editor — About',
    linkedinProfileState.section_drafts.about ?? '',
    [`Scores: ${JSON.stringify(linkedinProfileState.quality_scores.about ?? {})}`],
  ));

  // LinkedIn content/blog and carousel.
  const linkedinContentState: LinkedInContentState = {
    session_id: randomUUID(),
    user_id: 'live-review-user',
    current_stage: 'writing',
    selected_topic: 'How operating leaders turn recurring firefighting into repeatable cadence',
    shared_context: sharedContext,
    platform_context: {
      evidence_items: sharedContext.evidenceInventory.evidenceItems,
      positioning_strategy: { angle: sharedContext.positioningStrategy.positioningAngle },
      career_narrative: { leadershipIdentity: sharedContext.careerNarrative.leadershipIdentity },
    },
  };
  const contentCtx = makeCtx<LinkedInContentState>(linkedinContentState);
  await linkedInContentTools.find((tool) => tool.name === 'write_post')!.execute({
    topic: linkedinContentState.selected_topic,
    style: 'insight',
  }, contentCtx as never);
  await linkedInContentTools.find((tool) => tool.name === 'self_review_post')!.execute({}, contentCtx as never);
  await linkedInContentTools.find((tool) => tool.name === 'generate_carousel')!.execute({
    post_text: String(contentCtx.scratchpad.post_draft ?? ''),
    topic: linkedinContentState.selected_topic,
  }, contentCtx as never);
  sections.push(summarizeArtifact(
    'LinkedIn Content Creator — Blog/Post',
    String(contentCtx.scratchpad.post_draft ?? ''),
    [
      `Hashtags: ${JSON.stringify(contentCtx.scratchpad.post_hashtags ?? [])}`,
      `Scores: ${JSON.stringify(contentCtx.scratchpad.quality_scores ?? {})}`,
    ],
  ));
  sections.push(summarizeArtifact(
    'LinkedIn Carousel Creator — Slides',
    formatCarouselSlides(contentCtx.scratchpad.carousel_slides ?? []),
    ['Expected consumer guidance: carousel slides should use sparse copy, only a few words per slide.'],
  ));

  // Cover letter.
  const coverState: CoverLetterState = {
    session_id: randomUUID(),
    user_id: 'live-review-user',
    current_stage: 'analysis',
    resume_data: resumeData,
    jd_analysis: jdAnalysis,
    shared_context: sharedContext,
  };
  const coverCtx = makeCtx<CoverLetterState, CoverLetterSSEEvent>(coverState);
  coverCtx.scratchpad.requirement_matches = jdAnalysis.requirements.map((requirement) => ({
    requirement,
    matched_skill: 'multi-site manufacturing operations / Lean transformation',
    strength: 'moderate',
  }));
  await coverLetterAnalystTools.find((tool) => tool.name === 'plan_letter')!.execute({}, coverCtx as never);
  await coverLetterWriterTools.find((tool) => tool.name === 'write_letter')!.execute({ tone: 'bold' }, coverCtx as never);
  await coverLetterWriterTools.find((tool) => tool.name === 'review_letter')!.execute({}, coverCtx as never);
  sections.push(summarizeArtifact(
    'Cover Letter',
    coverState.letter_draft ?? '',
    [
      `Plan: ${JSON.stringify(coverState.letter_plan ?? {}, null, 2)}`,
      `Review score: ${coverState.quality_score ?? 'n/a'}; feedback: ${coverState.review_feedback ?? 'n/a'}`,
    ],
  ));

  // Thank-you note.
  const thankState: ThankYouNoteState = {
    session_id: randomUUID(),
    user_id: 'live-review-user',
    current_stage: 'writing',
    interview_context: {
      company: 'Coventry Industrial Holdings',
      role: 'Chief Operating Officer',
      interview_date: '2026-04-27',
    },
    recipients: [
      {
        name: 'Patricia Monroe',
        title: 'CEO',
        role: 'hiring_manager',
        topics_discussed: ['margin recovery', 'four-division integration', 'board confidence'],
        rapport_notes: 'Patricia was direct about needing a COO who can rebuild operating discipline before recapitalization.',
        key_questions: ['How would you get four divisions aligned in the first 90 days?'],
      },
    ],
    notes: [],
    revision_feedback_by_recipient: {},
    activity_signals: { days_since_interview: 0 },
    prior_interview_prep: {
      report_excerpt:
        'Interview strategy: lead with operating-system builder identity, $18M Lean savings, $47M modernization, and be honest that P&L ownership is adjacent through $210M budget partnership rather than final sign-off.',
    },
    shared_context: sharedContext,
  };
  const thankCtx = makeCtx<ThankYouNoteState, ThankYouNoteSSEEvent>(thankState);
  await thankYouTools.find((tool) => tool.name === 'analyze_interview_context')!.execute({ resume_text: profile.resumeText }, thankCtx as never);
  await thankYouTools.find((tool) => tool.name === 'write_thank_you_note')!.execute({
    recipient_name: 'Patricia Monroe',
    format: 'email',
    key_topics: ['margin recovery', 'board confidence', 'first 90 days'],
  }, thankCtx as never);
  await thankYouTools.find((tool) => tool.name === 'personalize_per_recipient')!.execute({
    recipient_name: 'Patricia Monroe',
    format: 'email',
  }, thankCtx as never);
  const thankNote = thankState.notes[0];
  sections.push(summarizeArtifact(
    'Thank-You Note',
    [`Subject: ${thankNote?.subject_line ?? ''}`, '', thankNote?.content ?? ''].join('\n'),
    [`Quality score: ${thankNote?.quality_score ?? 'n/a'}; personalization: ${thankNote?.personalization_notes ?? 'n/a'}`],
  ));

  // Follow-up email.
  const followState: FollowUpEmailState = {
    session_id: randomUUID(),
    user_id: 'live-review-user',
    current_stage: 'writing',
    follow_up_number: 1,
    tone: 'warm',
    situation: 'post_interview',
    company_name: 'Coventry Industrial Holdings',
    role_title: 'Chief Operating Officer',
    recipient_name: 'Patricia Monroe',
    recipient_title: 'CEO',
    specific_context:
      'Five days after the interview. David wants to reference the first-90-day operating cadence discussion without sounding needy.',
    activity_signals: {
      thank_you_sent: true,
      most_recent_interview_date: '2026-04-27',
      days_since_interview: 5,
    },
    prior_interview_prep: {
      report_excerpt:
        'Patricia focused on margin recovery, cross-divisional integration, and board confidence. David should lead with cadence, Lean proof, and honest P&L adjacency.',
    },
    shared_context: sharedContext,
  };
  const followCtx = makeCtx<FollowUpEmailState, FollowUpEmailSSEEvent>(followState);
  await followUpTools.find((tool) => tool.name === 'draft_follow_up_email')!.execute({}, followCtx as never);
  followState.draft = followCtx.scratchpad.draft as never;
  sections.push(summarizeArtifact(
    'Follow-Up Email',
    [`Subject: ${followState.draft?.subject ?? ''}`, '', followState.draft?.body ?? ''].join('\n'),
    [`Tone notes: ${followState.draft?.tone_notes ?? 'n/a'}; timing: ${followState.draft?.timing_guidance ?? 'n/a'}`],
  ));

  // Interview prep.
  const interviewState: InterviewPrepState = {
    session_id: randomUUID(),
    user_id: 'live-review-user',
    current_stage: 'writing',
    resume_data: resumeData,
    jd_analysis: interviewJdAnalysis,
    company_research: companyResearch,
    sourced_questions: [
      {
        category: 'technical',
        source: 'synthetic QA',
        question: 'How would you integrate four operating divisions without losing local plant accountability?',
      },
      {
        category: 'behavioral',
        source: 'synthetic QA',
        question: 'Tell me about a time you had to make operational performance visible to executives.',
      },
    ],
    sections: {},
    shared_context: sharedContext,
    platform_context: {
      why_me_story: {
        colleaguesCameForWhat: 'turning recurring firefighting into repeatable operating cadence',
        knownForWhat: 'making operational waste visible and measurable',
        whyNotMe: 'he has not held final P&L sign-off, so he must position adjacent financial discipline honestly',
      },
      gap_analysis: {
        critical_gaps: ['true P&L ownership', 'direct PE board reporting'],
        requirements: [
          {
            requirement: 'true P&L ownership',
            classification: 'partial',
            strategy: { positioning: 'Use $210M operating budget partnership and cost-per-unit accountability as adjacent proof.' },
          },
          {
            requirement: 'board/PE reporting',
            classification: 'partial',
            strategy: { positioning: 'Use advisory board and executive reporting experience as adjacent proof; do not claim PE board ownership.' },
          },
        ],
      },
    },
  };
  const interviewCtx = makeCtx<InterviewPrepState, InterviewPrepSSEEvent>(interviewState);
  await interviewPrepTools.find((tool) => tool.name === 'write_interview_advantage_brief')!.execute({
    emphasis: 'Make the top six requirements and Why Me sections interview-ready and first person. Be honest about P&L and Board/PE gaps.',
  }, interviewCtx as never);
  sections.push(summarizeArtifact(
    'Interview Prep — Interview Advantage Brief',
    interviewState.final_report ?? '',
    [`Quality score: ${interviewState.quality_score ?? 'n/a'}`],
  ));

  sections.push('## Automated Issue Summary', '');
  const withIssues = artifactIssueSummary.filter((artifact) => artifact.issues.length > 0);
  if (withIssues.length === 0) {
    sections.push('- No automated blocker patterns detected in the final artifact text.');
  } else {
    for (const { title, issues } of withIssues) {
      sections.push(`- **${title}:** ${issues.join('; ')}`);
    }
  }
  sections.push('');

  const outPath = resolve(process.cwd(), 'docs/live-writing-quality-review-2026-04-27.md');
  writeFileSync(outPath, `${sections.join('\n')}\n`);
  console.log(`Wrote ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
