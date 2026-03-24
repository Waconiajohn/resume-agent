/**
 * Job Application Tracker Follow-Up Writer — Tool definitions.
 *
 * 5 tools:
 * - write_follow_up_email: Write an initial follow-up email for an application
 * - write_thank_you: Write a post-interview thank-you note
 * - write_check_in: Write a check-in message for stale applications
 * - assess_status: Assess and recommend status updates for applications
 * - assemble_tracker_report: Combine all analyses and messages into the final report
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  JobTrackerState,
  JobTrackerSSEEvent,
  FollowUpMessage,
  FollowUpType,
} from '../types.js';
import { FOLLOW_UP_LABELS, FOLLOW_UP_TIMING } from '../types.js';
import { JOB_TRACKER_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderCareerNarrativeSection,
  renderCareerProfileSection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';

type JobTrackerTool = AgentTool<JobTrackerState, JobTrackerSSEEvent>;

// ─── Helpers ───────────────────────────────────────────────────────

function buildCandidateContext(state: JobTrackerState): string {
  const parts: string[] = [];
  const sharedContext = state.shared_context;

  if (state.resume_data) {
    const rd = state.resume_data;
    parts.push('## Candidate');
    parts.push(`Name: ${rd.name}`);
    parts.push(`Current Title: ${rd.current_title}`);
    parts.push(`Summary: ${rd.career_summary}`);
    if (rd.key_skills?.length > 0) {
      parts.push(`Key Skills: ${rd.key_skills.join(', ')}`);
    }
    if (rd.key_achievements?.length > 0) {
      parts.push('Key Achievements:');
      for (const a of rd.key_achievements.slice(0, 10)) {
        parts.push(`- ${a}`);
      }
    }
  }

  if (hasMeaningfulSharedValue(sharedContext?.candidateProfile)) {
    parts.push(...renderCareerProfileSection({
      heading: '## Career Profile',
      sharedContext,
    }));
  }

  if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
    parts.push(...renderCareerNarrativeSection({
      heading: '## Career Narrative Signals',
      sharedNarrative: sharedContext?.careerNarrative,
    }));
  }

  if (state.platform_context?.positioning_strategy || hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
    parts.push(...renderPositioningStrategySection({
      heading: '## Positioning Strategy',
      sharedStrategy: sharedContext?.positioningStrategy,
      legacyStrategy: state.platform_context?.positioning_strategy,
    }));
  }

  return parts.join('\n');
}

function buildApplicationContext(
  company: string,
  role: string,
  state: JobTrackerState,
): string {
  const parts: string[] = [];
  const app = state.applications.find((a) => a.company === company && a.role === role);
  const analysis = state.application_analyses?.find((a) => a.company === company && a.role === role);

  parts.push('## Application');
  parts.push(`Company: ${company}`);
  parts.push(`Role: ${role}`);

  if (app) {
    parts.push(`Date Applied: ${app.date_applied}`);
    parts.push(`Status: ${app.status}`);
    if (app.contact_name) parts.push(`Contact: ${app.contact_name}`);
    if (app.notes) parts.push(`Notes: ${app.notes}`);
    parts.push('');
    parts.push('## Job Description (excerpt)');
    parts.push(app.jd_text.slice(0, 3000));
  }

  if (analysis) {
    parts.push('');
    parts.push('## Fit Analysis');
    parts.push(`Fit Score: ${analysis.fit_score}/100`);
    parts.push(`Strengths: ${analysis.strengths.join(', ') || 'None identified'}`);
    parts.push(`Gaps: ${analysis.gaps.join(', ') || 'None identified'}`);
    parts.push(`Response Likelihood: ${analysis.response_likelihood}`);
  }

  // Include previously written messages for this application
  const existing = state.follow_up_messages.filter((m) => m.company === company && m.role === role);
  if (existing.length > 0) {
    parts.push('');
    parts.push('## Previously Written Messages (for this application)');
    for (const msg of existing) {
      parts.push(`### ${FOLLOW_UP_LABELS[msg.type]}`);
      parts.push(`Subject: ${msg.subject}`);
      parts.push(`Body: ${msg.body}`);
    }
  }

  return parts.join('\n');
}

function storeMessage(state: JobTrackerState, message: FollowUpMessage): void {
  if (!state.follow_up_messages) {
    state.follow_up_messages = [];
  }
  const existingIdx = state.follow_up_messages.findIndex(
    (m) => m.company === message.company && m.role === message.role && m.type === message.type,
  );
  if (existingIdx >= 0) {
    state.follow_up_messages[existingIdx] = message;
  } else {
    state.follow_up_messages.push(message);
  }
}

// ─── Tool: write_follow_up_email ───────────────────────────────────

const writeFollowUpEmailTool: JobTrackerTool = {
  name: 'write_follow_up_email',
  description:
    'Write an initial follow-up email for a specific job application. ' +
    '150-200 words. References the specific role and adds value beyond the original application. ' +
    'Call this for applications with urgency "immediate" or "soon".',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      company: {
        type: 'string',
        description: 'Company name of the application to write follow-up for',
      },
      role: {
        type: 'string',
        description: 'Role title of the application',
      },
    },
    required: ['company', 'role'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const company = String(input.company ?? '');
    const role = String(input.role ?? '');

    if (!state.application_analyses || state.application_analyses.length === 0) {
      return JSON.stringify({ success: false, error: 'No application analyses available. Run Analyst first.' });
    }

    ctx.emit({ type: 'follow_up_generated', company, role, follow_up_type: 'initial_follow_up' });

    const candidateContext = buildCandidateContext(state);
    const applicationContext = buildApplicationContext(company, role, state);
    const analysis = state.application_analyses.find((a) => a.company === company && a.role === role);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are a follow-up email writer for senior executives (45+). Write polished, professional follow-up emails that add value and demonstrate genuine interest.

${candidateContext}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write an initial follow-up email for this application.

${applicationContext}

REQUIREMENTS:
- 150-200 words
- Subject line: "Following up — [Role Title] application"
- Lead with the specific role and approximate timing of application
- Include ONE value-add insight that demonstrates expertise relevant to this role
- Reference something specific about the company (from JD analysis)
- Soft close expressing continued interest without pressure
- Never mention other applications or interviews
- Never ask "did you receive my application?"
- The value-add must come from the candidate's REAL expertise (resume data), not fabricated knowledge
${analysis ? `- Lean into these strengths: ${analysis.strengths.join(', ')}` : ''}

Return JSON:
{
  "subject": "Following up — [Role Title] application",
  "body": "the follow-up email body",
  "personalization_hooks": ["specific hooks used"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        subject: `Following up — ${role} application`,
        body: response.text.trim().slice(0, 800),
        personalization_hooks: [],
      };
    }

    const body = String(result.body ?? '').trim();
    const wordCount = body.split(/\s+/).length;
    const personalizationHooks: string[] = Array.isArray(result.personalization_hooks)
      ? result.personalization_hooks.map(String)
      : [];

    let qualityScore = 100;
    if (wordCount > 250) qualityScore -= 15;
    if (wordCount < 100) qualityScore -= 15;
    if (personalizationHooks.length === 0) qualityScore -= 20;
    if (/did you receive/i.test(body)) qualityScore -= 20;
    if (/other opportunities/i.test(body)) qualityScore -= 15;
    if (/in transition/i.test(body)) qualityScore -= 20;
    qualityScore = Math.max(0, qualityScore);

    const message: FollowUpMessage = {
      company,
      role,
      type: 'initial_follow_up',
      subject: String(result.subject ?? `Following up — ${role} application`),
      body,
      word_count: wordCount,
      personalization_hooks: personalizationHooks,
      timing: FOLLOW_UP_TIMING.initial_follow_up,
      quality_score: qualityScore,
    };

    storeMessage(state, message);

    return JSON.stringify({
      success: true,
      company,
      role,
      type: 'initial_follow_up',
      word_count: wordCount,
      quality_score: qualityScore,
    });
  },
};

// ─── Tool: write_thank_you ─────────────────────────────────────────

const writeThankYouTool: JobTrackerTool = {
  name: 'write_thank_you',
  description:
    'Write a post-interview thank-you note for a specific application. ' +
    '100-150 words. References a specific topic from the interview. ' +
    'Call for applications with status "interviewing".',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      company: {
        type: 'string',
        description: 'Company name',
      },
      role: {
        type: 'string',
        description: 'Role title',
      },
    },
    required: ['company', 'role'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const company = String(input.company ?? '');
    const role = String(input.role ?? '');

    if (!state.application_analyses || state.application_analyses.length === 0) {
      return JSON.stringify({ success: false, error: 'No application analyses available. Run Analyst first.' });
    }

    ctx.emit({ type: 'follow_up_generated', company, role, follow_up_type: 'thank_you' });

    const candidateContext = buildCandidateContext(state);
    const applicationContext = buildApplicationContext(company, role, state);
    const analysis = state.application_analyses.find((a) => a.company === company && a.role === role);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are a follow-up email writer for senior executives (45+). Write concise, impactful thank-you notes.

${candidateContext}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a post-interview thank-you note for this application.

${applicationContext}

REQUIREMENTS:
- 100-150 words
- Thank them directly (don't start with "I wanted to thank you")
- Reference a specific topic likely discussed based on the JD and candidate fit
- Reinforce one relevant experience that connects to a challenge in the role
- Express enthusiasm for next steps without asking "what's next?"
- Keep it SHORT — executives respect brevity
- Never negotiate, ask about salary, or raise concerns
${analysis ? `- Connect to these strengths: ${analysis.strengths.slice(0, 2).join(', ')}` : ''}

Return JSON:
{
  "subject": "Thank you — [Role Title] conversation",
  "body": "the thank-you note body",
  "personalization_hooks": ["specific hooks used"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        subject: `Thank you — ${role} conversation`,
        body: response.text.trim().slice(0, 600),
        personalization_hooks: [],
      };
    }

    const body = String(result.body ?? '').trim();
    const wordCount = body.split(/\s+/).length;
    const personalizationHooks: string[] = Array.isArray(result.personalization_hooks)
      ? result.personalization_hooks.map(String)
      : [];

    let qualityScore = 100;
    if (wordCount > 200) qualityScore -= 15;
    if (wordCount < 60) qualityScore -= 15;
    if (personalizationHooks.length === 0) qualityScore -= 20;
    if (/I wanted to thank/i.test(body)) qualityScore -= 10;
    if (/salary|compensation|negotiate/i.test(body)) qualityScore -= 25;
    qualityScore = Math.max(0, qualityScore);

    const message: FollowUpMessage = {
      company,
      role,
      type: 'thank_you',
      subject: String(result.subject ?? `Thank you — ${role} conversation`),
      body,
      word_count: wordCount,
      personalization_hooks: personalizationHooks,
      timing: FOLLOW_UP_TIMING.thank_you,
      quality_score: qualityScore,
    };

    storeMessage(state, message);

    return JSON.stringify({
      success: true,
      company,
      role,
      type: 'thank_you',
      word_count: wordCount,
      quality_score: qualityScore,
    });
  },
};

// ─── Tool: write_check_in ──────────────────────────────────────────

const writeCheckInTool: JobTrackerTool = {
  name: 'write_check_in',
  description:
    'Write a check-in message for an application with no recent response. ' +
    '75-125 words. Conveys continued interest without nagging. ' +
    'Use sparingly — maximum ONE check-in per application.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      company: {
        type: 'string',
        description: 'Company name',
      },
      role: {
        type: 'string',
        description: 'Role title',
      },
    },
    required: ['company', 'role'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const company = String(input.company ?? '');
    const role = String(input.role ?? '');

    if (!state.application_analyses || state.application_analyses.length === 0) {
      return JSON.stringify({ success: false, error: 'No application analyses available. Run Analyst first.' });
    }

    ctx.emit({ type: 'follow_up_generated', company, role, follow_up_type: 'check_in' });

    const candidateContext = buildCandidateContext(state);
    const applicationContext = buildApplicationContext(company, role, state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are a follow-up email writer for senior executives (45+). Write delicate check-in messages that are professional and brief.

${candidateContext}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a check-in message for this application.

${applicationContext}

REQUIREMENTS:
- 75-125 words
- Re-establish who you are and which role (assume they're busy)
- Include a value-add: relevant industry news, a recent achievement, or reaffirmation of interest
- Low-pressure ask: "Happy to provide any additional information" or similar
- NEVER express frustration about silence
- NEVER reference how long it's been waiting ("It's been three weeks...")
- Frame around their timeline: "I understand these processes take time"
- This is the final professional impression if they don't respond — make it good

Return JSON:
{
  "subject": "Checking in — [Role Title]",
  "body": "the check-in message body",
  "personalization_hooks": ["specific hooks used"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        subject: `Checking in — ${role}`,
        body: response.text.trim().slice(0, 500),
        personalization_hooks: [],
      };
    }

    const body = String(result.body ?? '').trim();
    const wordCount = body.split(/\s+/).length;
    const personalizationHooks: string[] = Array.isArray(result.personalization_hooks)
      ? result.personalization_hooks.map(String)
      : [];

    let qualityScore = 100;
    if (wordCount > 150) qualityScore -= 15;
    if (wordCount < 50) qualityScore -= 10;
    if (personalizationHooks.length === 0) qualityScore -= 15;
    if (/haven't heard/i.test(body)) qualityScore -= 20;
    if (/it's been/i.test(body)) qualityScore -= 15;
    if (/frustrat|disappoint|confus/i.test(body)) qualityScore -= 25;
    qualityScore = Math.max(0, qualityScore);

    const message: FollowUpMessage = {
      company,
      role,
      type: 'check_in',
      subject: String(result.subject ?? `Checking in — ${role}`),
      body,
      word_count: wordCount,
      personalization_hooks: personalizationHooks,
      timing: FOLLOW_UP_TIMING.check_in,
      quality_score: qualityScore,
    };

    storeMessage(state, message);

    return JSON.stringify({
      success: true,
      company,
      role,
      type: 'check_in',
      word_count: wordCount,
      quality_score: qualityScore,
    });
  },
};

// ─── Tool: assess_status ───────────────────────────────────────────

const assessStatusTool: JobTrackerTool = {
  name: 'assess_status',
  description:
    'Assess and recommend status updates for all applications based on elapsed time and follow-up history. ' +
    'Identifies applications that should be reclassified (e.g., applied → ghosted). ' +
    'Call this before assemble_tracker_report.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.application_analyses || state.application_analyses.length === 0) {
      return JSON.stringify({ success: false, error: 'No application analyses available.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'assess_status',
      message: 'Assessing application statuses and recommending updates...',
    });

    const statusUpdates: Array<{ company: string; role: string; current: string; recommended: string; reason: string }> = [];

    for (let i = 0; i < state.application_analyses.length; i++) {
      const analysis = state.application_analyses[i];
      const app = state.applications[i];
      if (!app) continue;

      const followUps = state.follow_up_messages.filter(
        (m) => m.company === analysis.company && m.role === analysis.role,
      );
      const hasFollowUp = followUps.length > 0;

      // Heuristic status recommendations
      if (app.status === 'applied' && analysis.days_elapsed > 21 && hasFollowUp) {
        statusUpdates.push({
          company: analysis.company,
          role: analysis.role,
          current: app.status,
          recommended: 'ghosted',
          reason: `${analysis.days_elapsed} days with no response after follow-up`,
        });
      } else if (app.status === 'applied' && analysis.days_elapsed > 14 && !hasFollowUp) {
        statusUpdates.push({
          company: analysis.company,
          role: analysis.role,
          current: app.status,
          recommended: 'applied',
          reason: `${analysis.days_elapsed} days — follow-up overdue`,
        });
      } else if (app.status === 'followed_up' && analysis.days_elapsed > 21) {
        statusUpdates.push({
          company: analysis.company,
          role: analysis.role,
          current: app.status,
          recommended: 'ghosted',
          reason: `${analysis.days_elapsed} days since follow-up with no response`,
        });
      }
    }

    ctx.emit({
      type: 'transparency',
      stage: 'assess_status',
      message: `Status assessment complete — ${statusUpdates.length} update(s) recommended`,
    });

    return JSON.stringify({
      success: true,
      status_updates: statusUpdates,
      total_assessed: state.application_analyses.length,
    });
  },
};

// ─── Tool: assemble_tracker_report ─────────────────────────────────

const assembleTrackerReportTool: JobTrackerTool = {
  name: 'assemble_tracker_report',
  description:
    'Assemble the final tracker report combining application analyses, ' +
    'follow-up messages, portfolio analytics, and recommendations. ' +
    'Call this LAST after all follow-up messages have been written.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.application_analyses || state.application_analyses.length === 0) {
      return JSON.stringify({ success: false, error: 'No application analyses available.' });
    }

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_tracker_report',
      message: 'Assembling tracker report...',
    });

    const analyses = state.application_analyses;
    const messages = state.follow_up_messages;
    const analytics = state.portfolio_analytics;
    const priorities = state.follow_up_priorities ?? [];

    // Build report
    const reportParts: string[] = [];

    // Header
    reportParts.push('# Job Application Tracker Report');
    reportParts.push('');

    // Portfolio summary
    if (analytics) {
      reportParts.push('## Portfolio Summary');
      reportParts.push('');
      reportParts.push(`**Total Applications:** ${analytics.total_applications}`);
      reportParts.push(`**Average Fit Score:** ${analytics.average_fit_score}/100`);
      reportParts.push(`**Follow-Ups Generated:** ${messages.length}`);
      reportParts.push('');
      reportParts.push('### Assessment');
      reportParts.push(analytics.portfolio_assessment);
      reportParts.push('');

      if (analytics.top_applications.length > 0) {
        reportParts.push('### Top Applications');
        for (const top of analytics.top_applications) {
          reportParts.push(`- **${top.company}** — ${top.role} (Fit: ${top.fit_score}/100)`);
        }
        reportParts.push('');
      }
    }

    // Per-application detail
    reportParts.push('## Application Details');
    reportParts.push('');

    for (const analysis of analyses) {
      const app = state.applications.find((a) => a.company === analysis.company && a.role === analysis.role);
      const priority = priorities.find((p) => p.company === analysis.company && p.role === analysis.role);
      const appMessages = messages.filter((m) => m.company === analysis.company && m.role === analysis.role);

      reportParts.push(`### ${analysis.company} — ${analysis.role}`);
      reportParts.push('');
      reportParts.push(`| Metric | Value |`);
      reportParts.push(`|--------|-------|`);
      reportParts.push(`| Fit Score | ${analysis.fit_score}/100 |`);
      reportParts.push(`| Keyword Match | ${analysis.keyword_match}% |`);
      reportParts.push(`| Seniority | ${analysis.seniority_alignment} |`);
      reportParts.push(`| Industry Relevance | ${analysis.industry_relevance}% |`);
      reportParts.push(`| Positioning Fit | ${analysis.positioning_fit}% |`);
      reportParts.push(`| Response Likelihood | ${analysis.response_likelihood} |`);
      reportParts.push(`| Days Since Applied | ${analysis.days_elapsed} |`);
      if (app) reportParts.push(`| Status | ${app.status} |`);
      if (priority) reportParts.push(`| Follow-Up Urgency | ${priority.urgency} |`);
      reportParts.push('');

      if (analysis.strengths.length > 0) {
        reportParts.push('**Strengths:** ' + analysis.strengths.join(', '));
      }
      if (analysis.gaps.length > 0) {
        reportParts.push('**Gaps:** ' + analysis.gaps.join(', '));
      }
      reportParts.push(`**Recommended Action:** ${analysis.recommended_action}`);
      reportParts.push('');

      // Include follow-up messages for this application
      for (const msg of appMessages) {
        const label = FOLLOW_UP_LABELS[msg.type] ?? msg.type;
        const timing = FOLLOW_UP_TIMING[msg.type] ?? 'See timing guidance';
        reportParts.push(`#### ${label}`);
        reportParts.push(`**Timing:** ${timing}`);
        reportParts.push(`**Subject:** ${msg.subject}`);
        reportParts.push(`**Quality:** ${msg.quality_score}/100`);
        reportParts.push('');
        reportParts.push(msg.body);
        reportParts.push('');
      }

      reportParts.push('---');
      reportParts.push('');
    }

    const report = reportParts.join('\n');
    state.final_report = report;

    // Compute overall quality score
    const allScores = [
      ...analyses.map((a) => a.fit_score),
      ...messages.map((m) => m.quality_score),
    ];
    state.quality_score = allScores.length > 0
      ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
      : 0;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_tracker_report',
      message: `Report assembled — ${analyses.length} applications, ${messages.length} follow-ups, quality: ${state.quality_score}/100`,
    });

    return JSON.stringify({
      success: true,
      report_length: report.length,
      application_count: analyses.length,
      follow_up_count: messages.length,
      quality_score: state.quality_score,
    });
  },
};

// ─── Exports ───────────────────────────────────────────────────────

export const writerTools: JobTrackerTool[] = [
  writeFollowUpEmailTool,
  writeThankYouTool,
  writeCheckInTool,
  assessStatusTool,
  assembleTrackerReportTool,
];
