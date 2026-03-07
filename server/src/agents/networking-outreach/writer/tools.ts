/**
 * Networking Outreach Writer — Tool definitions.
 *
 * 4 tools:
 * - write_connection_request: Write the initial LinkedIn connection request (≤300 chars)
 * - write_follow_up: Write follow-up messages (≤500 chars each)
 * - write_value_offer: Write a value offer that naturally positions expertise
 * - assemble_sequence: Combine all messages into the final outreach sequence report
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  NetworkingOutreachState,
  NetworkingOutreachSSEEvent,
  OutreachMessage,
  OutreachMessageType,
} from '../types.js';
import { MESSAGE_TYPE_LABELS, MESSAGE_TIMING } from '../types.js';
import { NETWORKING_OUTREACH_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type NetworkingOutreachTool = AgentTool<NetworkingOutreachState, NetworkingOutreachSSEEvent>;

// ─── Helpers ────────────────────────────────────────────────────────

function buildContextBlock(state: NetworkingOutreachState): string {
  const parts: string[] = [];

  // Resume data
  if (state.resume_data) {
    const rd = state.resume_data;
    parts.push('## Candidate Resume Data');
    parts.push(`Name: ${rd.name}`);
    parts.push(`Current Title: ${rd.current_title}`);
    parts.push(`Career Summary: ${rd.career_summary}`);
    if (rd.key_skills?.length > 0) {
      parts.push(`Key Skills: ${rd.key_skills.join(', ')}`);
    }
    if (rd.key_achievements?.length > 0) {
      parts.push('Key Achievements:');
      for (const a of rd.key_achievements) {
        parts.push(`- ${a}`);
      }
    }
    if (rd.work_history?.length > 0) {
      parts.push('Work History:');
      for (const w of rd.work_history) {
        parts.push(`- ${w.title} at ${w.company} (${w.duration})`);
        for (const h of w.highlights ?? []) {
          parts.push(`  - ${h}`);
        }
      }
    }
  }

  // Target analysis
  if (state.target_analysis) {
    const ta = state.target_analysis;
    parts.push('\n## Target Analysis');
    parts.push(`Target Name: ${ta.target_name}`);
    parts.push(`Target Title: ${ta.target_title}`);
    parts.push(`Target Company: ${ta.target_company}`);
    parts.push(`Industry: ${ta.industry}`);
    parts.push(`Seniority: ${ta.seniority}`);
    if (ta.professional_interests?.length > 0) {
      parts.push(`Professional Interests: ${ta.professional_interests.join(', ')}`);
    }
    if (ta.recent_activity?.length > 0) {
      parts.push('Recent Activity:');
      for (const activity of ta.recent_activity) {
        parts.push(`- ${activity}`);
      }
    }
  }

  // Common ground
  if (state.common_ground) {
    const cg = state.common_ground;
    parts.push('\n## Common Ground');
    if (cg.shared_connections?.length > 0) {
      parts.push(`Shared Connections: ${cg.shared_connections.join(', ')}`);
    }
    if (cg.industry_overlap?.length > 0) {
      parts.push(`Industry Overlap: ${cg.industry_overlap.join(', ')}`);
    }
    if (cg.complementary_expertise?.length > 0) {
      parts.push(`Complementary Expertise: ${cg.complementary_expertise.join(', ')}`);
    }
    if (cg.mutual_interests?.length > 0) {
      parts.push(`Mutual Interests: ${cg.mutual_interests.join(', ')}`);
    }
    parts.push(`Recommended Angle: ${cg.recommended_angle}`);
  }

  // Connection path
  if (state.connection_path) {
    const cp = state.connection_path;
    parts.push('\n## Connection Path');
    parts.push(`Connection Degree: ${cp.connection_degree}`);
    parts.push(`Approach Strategy: ${cp.approach_strategy}`);
    parts.push(`Connection Rationale: ${cp.connection_rationale}`);
    parts.push(`Value Proposition: ${cp.value_proposition}`);
    parts.push(`Risk Level: ${cp.risk_level}`);
  }

  // Outreach plan
  if (state.outreach_plan) {
    const op = state.outreach_plan;
    parts.push('\n## Outreach Plan');
    parts.push(`Sequence Length: ${op.sequence_length} messages`);
    parts.push(`Message Types: ${op.message_types.map(t => MESSAGE_TYPE_LABELS[t]).join(', ')}`);
    parts.push(`Tone: ${op.tone}`);
    parts.push(`Themes: ${op.themes.join(', ')}`);
    parts.push(`Goal: ${op.goal}`);
  }

  // Previously written messages (for context in later messages)
  if (state.messages && state.messages.length > 0) {
    parts.push('\n## Previously Written Messages');
    for (const msg of state.messages) {
      parts.push(`\n### ${MESSAGE_TYPE_LABELS[msg.type]}`);
      parts.push(`Body: ${msg.body}`);
      parts.push(`Personalization Hooks: ${msg.personalization_hooks.join(', ')}`);
    }
  }

  // Platform context (Why-Me story, positioning strategy)
  if (state.platform_context?.why_me_story) {
    const wm = state.platform_context.why_me_story;
    parts.push('\n## Why-Me Story (from CareerIQ)');
    if (wm.colleaguesCameForWhat) parts.push(`What colleagues came to me for: ${wm.colleaguesCameForWhat}`);
    if (wm.knownForWhat) parts.push(`What I'm known for: ${wm.knownForWhat}`);
    if (wm.whyNotMe) parts.push(`Why not me (differentiator): ${wm.whyNotMe}`);
  }

  if (state.platform_context?.positioning_strategy) {
    parts.push('\n## Positioning Strategy');
    parts.push(JSON.stringify(state.platform_context.positioning_strategy, null, 2));
  }

  return parts.join('\n');
}

// ─── Tool: write_connection_request ─────────────────────────────────

const writeConnectionRequestTool: NetworkingOutreachTool = {
  name: 'write_connection_request',
  description:
    'Write the initial LinkedIn connection request message. ' +
    'Must be ≤300 characters (hard LinkedIn platform limit). ' +
    'Reads target analysis, common ground, and outreach plan from state. ' +
    'Quality scores the message (0-100).',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.target_analysis || !state.common_ground || !state.outreach_plan) {
      return JSON.stringify({
        success: false,
        error: 'Missing required state: target_analysis, common_ground, and outreach_plan must be populated. Run Researcher first.',
      });
    }

    ctx.emit({ type: 'message_progress', message_type: 'connection_request', status: 'drafting' });

    const contextBlock = buildContextBlock(state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are a LinkedIn outreach writer for senior executives (45+).

${NETWORKING_OUTREACH_RULES}

You have the following data:

${contextBlock}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a LinkedIn connection request message.

HARD REQUIREMENTS:
- Maximum 300 characters total (this is a LinkedIn platform limit — count carefully)
- Lead with WHY you're reaching out to THIS specific person
- Reference something specific: shared experience, their published work, mutual connection, or recent achievement
- Never mention job searching, being "in transition," or looking for opportunities
- Never use "I'd love to pick your brain"
- End with a light, no-pressure statement
- One sentence of context + one sentence of specific reference + one sentence of intent

Return JSON:
{
  "subject": "",
  "body": "the connection request message (≤300 chars)",
  "personalization_hooks": ["specific hook used in this message"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      const text = response.text.trim();
      result = {
        subject: '',
        body: text.slice(0, 300),
        personalization_hooks: [],
      };
    }

    let body = String(result.body ?? '').trim();
    const subject = String(result.subject ?? '');
    const personalizationHooks: string[] = Array.isArray(result.personalization_hooks)
      ? result.personalization_hooks.map(String)
      : [];

    // Quality scoring
    let qualityScore = 100;

    // Hard limit: penalize heavily if over 300 chars, then truncate
    if (body.length > 300) {
      qualityScore -= 30;
      body = body.slice(0, 300);
    }
    const charCount = body.length;

    // Personalization: penalize if no hooks
    if (personalizationHooks.length === 0) qualityScore -= 20;

    // Generic patterns
    if (/I'm a .+ professional/i.test(body)) qualityScore -= 15;
    if (/expand my network/i.test(body)) qualityScore -= 15;
    if (/pick your brain/i.test(body)) qualityScore -= 20;
    if (/in transition/i.test(body)) qualityScore -= 20;
    if (/looking for opportunities/i.test(body)) qualityScore -= 20;

    // Too short
    if (charCount < 50) qualityScore -= 15;

    qualityScore = Math.max(0, qualityScore);

    const message: OutreachMessage = {
      type: 'connection_request',
      subject,
      body,
      char_count: charCount,
      personalization_hooks: personalizationHooks,
      timing: MESSAGE_TIMING.connection_request,
      quality_score: qualityScore,
    };

    // Store in state
    if (!state.messages) {
      state.messages = [];
    }
    const existingIdx = state.messages.findIndex(m => m.type === 'connection_request');
    if (existingIdx >= 0) {
      state.messages[existingIdx] = message;
    } else {
      state.messages.push(message);
    }

    ctx.emit({ type: 'message_progress', message_type: 'connection_request', status: 'complete' });

    return JSON.stringify({
      success: true,
      message_type: 'connection_request',
      char_count: charCount,
      quality_score: qualityScore,
    });
  },
};

// ─── Tool: write_follow_up ──────────────────────────────────────────

const writeFollowUpTool: NetworkingOutreachTool = {
  name: 'write_follow_up',
  description:
    'Write a follow-up message for the outreach sequence. ' +
    'Must be ≤500 characters. Personalization hooks must be DIFFERENT from previous messages. ' +
    'Call with follow_up_number=1 for the first follow-up, follow_up_number=2 for the second.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      follow_up_number: {
        type: 'number',
        enum: [1, 2],
        description: 'Which follow-up to write: 1 or 2',
      },
    },
    required: ['follow_up_number'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const followUpNumber = Number(input.follow_up_number);

    if (followUpNumber !== 1 && followUpNumber !== 2) {
      return JSON.stringify({ success: false, error: 'follow_up_number must be 1 or 2.' });
    }

    if (!state.target_analysis || !state.common_ground) {
      return JSON.stringify({
        success: false,
        error: 'Missing required state: target_analysis and common_ground must be populated.',
      });
    }

    const messageType: OutreachMessageType = followUpNumber === 1 ? 'follow_up_1' : 'follow_up_2';

    ctx.emit({ type: 'message_progress', message_type: messageType, status: 'drafting' });

    const contextBlock = buildContextBlock(state);

    // Gather previously used personalization hooks to avoid repetition
    const usedHooks = (state.messages ?? []).flatMap(m => m.personalization_hooks);
    const usedHooksStr = usedHooks.length > 0
      ? `\n\nPERSONALIZATION HOOKS ALREADY USED (do NOT repeat these):\n${usedHooks.map(h => `- ${h}`).join('\n')}`
      : '';

    const followUpGuidance = followUpNumber === 1
      ? `Follow-Up #1 (3-5 days after connection accepted):
- Thank them for connecting — brief and warm, not effusive
- Share ONE specific insight or observation related to their work or industry
- Keep it short (50-100 words / ≤500 chars). Don't overwhelm.
- Ask ONE low-commitment question that shows genuine interest`
      : `Follow-Up #2 (5-7 days after follow-up #1):
- Reference your previous exchange or their recent activity
- Share something of value: an article, a framework, a data point relevant to their interests
- Begin positioning your expertise naturally — not as a pitch, but as context
- 75-125 words / ≤500 chars. Continue building, not selling.`;

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are a LinkedIn outreach writer for senior executives (45+).

${NETWORKING_OUTREACH_RULES}

You have the following data:

${contextBlock}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write Follow-Up #${followUpNumber} for the outreach sequence.

${followUpGuidance}

HARD REQUIREMENTS:
- Maximum 500 characters
- Must contain at least ONE specific personalization hook
- Personalization hook must be DIFFERENT from all previous messages${usedHooksStr}
- Never mention job searching or being in transition
- Tone: warm but not effusive, confident but not arrogant

Return JSON:
{
  "body": "the follow-up message (≤500 chars)",
  "personalization_hooks": ["specific NEW hook used in this message"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      const text = response.text.trim();
      result = {
        body: text.slice(0, 500),
        personalization_hooks: [],
      };
    }

    const body = String(result.body ?? '').trim();
    const personalizationHooks: string[] = Array.isArray(result.personalization_hooks)
      ? result.personalization_hooks.map(String)
      : [];
    const charCount = body.length;

    // Quality scoring
    let qualityScore = 100;

    // Hard limit: penalize if over 500 chars
    if (charCount > 500) qualityScore -= 25;

    // Personalization: penalize if no hooks
    if (personalizationHooks.length === 0) qualityScore -= 20;

    // Check if hooks repeat previous messages
    const repeatedHooks = personalizationHooks.filter(h =>
      usedHooks.some(used => used.toLowerCase() === h.toLowerCase())
    );
    if (repeatedHooks.length > 0) qualityScore -= 15;

    // Generic patterns
    if (/I hope this finds you well/i.test(body)) qualityScore -= 10;
    if (/reach out/i.test(body)) qualityScore -= 10;
    if (/pick your brain/i.test(body)) qualityScore -= 20;

    // Too short
    if (charCount < 80) qualityScore -= 15;

    qualityScore = Math.max(0, qualityScore);

    const message: OutreachMessage = {
      type: messageType,
      subject: '',
      body,
      char_count: charCount,
      personalization_hooks: personalizationHooks,
      timing: MESSAGE_TIMING[messageType],
      quality_score: qualityScore,
    };

    // Store in state
    if (!state.messages) {
      state.messages = [];
    }
    const existingIdx = state.messages.findIndex(m => m.type === messageType);
    if (existingIdx >= 0) {
      state.messages[existingIdx] = message;
    } else {
      state.messages.push(message);
    }

    ctx.emit({ type: 'message_progress', message_type: messageType, status: 'complete' });

    return JSON.stringify({
      success: true,
      message_type: messageType,
      char_count: charCount,
      quality_score: qualityScore,
    });
  },
};

// ─── Tool: write_value_offer ────────────────────────────────────────

const writeValueOfferTool: NetworkingOutreachTool = {
  name: 'write_value_offer',
  description:
    'Write a value offer message that offers something specific (insight, introduction, resource, perspective). ' +
    'Must naturally position expertise without explicit self-promotion. ' +
    '100-150 words. Quality scores the message (0-100).',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.target_analysis || !state.common_ground || !state.resume_data) {
      return JSON.stringify({
        success: false,
        error: 'Missing required state: target_analysis, common_ground, and resume_data must be populated.',
      });
    }

    ctx.emit({ type: 'message_progress', message_type: 'value_offer', status: 'drafting' });

    const contextBlock = buildContextBlock(state);

    // Gather previously used personalization hooks
    const usedHooks = (state.messages ?? []).flatMap(m => m.personalization_hooks);
    const usedHooksStr = usedHooks.length > 0
      ? `\n\nPERSONALIZATION HOOKS ALREADY USED (do NOT repeat these):\n${usedHooks.map(h => `- ${h}`).join('\n')}`
      : '';

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are a LinkedIn outreach writer for senior executives (45+).

${NETWORKING_OUTREACH_RULES}

You have the following data:

${contextBlock}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a Value Offer message for the outreach sequence.

The value offer is the centerpiece of the sequence — demonstrate you're worth knowing by offering something genuinely useful.

Types of value offers:
1. Insight sharing — "I put together a quick analysis of X trend..."
2. Introduction — "I know someone working on [relevant problem]..."
3. Resource — "I came across this [report/tool/framework]..."
4. Perspective — "Having done X, I have a contrarian take on..."

HARD REQUIREMENTS:
- 100-150 words
- Must offer something SPECIFIC to the target (not generic)
- Must be something the target actually wants based on their professional interests
- Must naturally position your expertise WITHOUT explicitly saying "I'm an expert in..."
- Don't oversell — "I put together a quick framework" beats "I created a comprehensive methodology"
- Use a NEW personalization hook not used in previous messages${usedHooksStr}

Return JSON:
{
  "body": "the value offer message (100-150 words)",
  "personalization_hooks": ["specific NEW hook used in this message"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      const text = response.text.trim();
      result = {
        body: text,
        personalization_hooks: [],
      };
    }

    const body = String(result.body ?? '').trim();
    const personalizationHooks: string[] = Array.isArray(result.personalization_hooks)
      ? result.personalization_hooks.map(String)
      : [];
    const charCount = body.length;
    const wordCount = body.split(/\s+/).filter(Boolean).length;

    // Quality scoring
    let qualityScore = 100;

    // Word count: penalize outside optimal range
    if (wordCount < 60) qualityScore -= 20;
    else if (wordCount < 100) qualityScore -= 10;
    if (wordCount > 200) qualityScore -= 10;

    // Personalization: penalize if no hooks
    if (personalizationHooks.length === 0) qualityScore -= 20;

    // Check for repeated hooks
    const repeatedHooks = personalizationHooks.filter(h =>
      usedHooks.some(used => used.toLowerCase() === h.toLowerCase())
    );
    if (repeatedHooks.length > 0) qualityScore -= 15;

    // Generic value offers
    if (/I'd love to share my expertise/i.test(body)) qualityScore -= 20;
    if (/comprehensive methodology/i.test(body)) qualityScore -= 10;
    if (/revolutionize/i.test(body)) qualityScore -= 10;

    // Explicit self-promotion
    if (/I'm an expert in/i.test(body)) qualityScore -= 15;
    if (/as a thought leader/i.test(body)) qualityScore -= 15;
    if (/I'm passionate about/i.test(body)) qualityScore -= 10;

    qualityScore = Math.max(0, qualityScore);

    const message: OutreachMessage = {
      type: 'value_offer',
      subject: '',
      body,
      char_count: charCount,
      personalization_hooks: personalizationHooks,
      timing: MESSAGE_TIMING.value_offer,
      quality_score: qualityScore,
    };

    // Store in state
    if (!state.messages) {
      state.messages = [];
    }
    const existingIdx = state.messages.findIndex(m => m.type === 'value_offer');
    if (existingIdx >= 0) {
      state.messages[existingIdx] = message;
    } else {
      state.messages.push(message);
    }

    ctx.emit({ type: 'message_progress', message_type: 'value_offer', status: 'complete' });

    return JSON.stringify({
      success: true,
      message_type: 'value_offer',
      char_count: charCount,
      word_count: wordCount,
      quality_score: qualityScore,
    });
  },
};

// ─── Tool: write_meeting_request ─────────────────────────────────────

const writeMeetingRequestTool: NetworkingOutreachTool = {
  name: 'write_meeting_request',
  description:
    'Write a meeting request message — the end goal of the outreach sequence. ' +
    'Should only be included after sufficient rapport has been built. ' +
    '75-100 words. Suggests a specific topic and gives an easy out.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.target_analysis || !state.common_ground) {
      return JSON.stringify({
        success: false,
        error: 'Missing required state: target_analysis and common_ground must be populated.',
      });
    }

    ctx.emit({ type: 'message_progress', message_type: 'meeting_request', status: 'drafting' });

    const contextBlock = buildContextBlock(state);

    // Gather previously used personalization hooks
    const usedHooks = (state.messages ?? []).flatMap(m => m.personalization_hooks);
    const usedHooksStr = usedHooks.length > 0
      ? `\n\nPERSONALIZATION HOOKS ALREADY USED (do NOT repeat these):\n${usedHooks.map(h => `- ${h}`).join('\n')}`
      : '';

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are a LinkedIn outreach writer for senior executives (45+).

${NETWORKING_OUTREACH_RULES}

You have the following data:

${contextBlock}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a Meeting Request message — the final message in the outreach sequence.

By this point, you should have established enough rapport and demonstrated enough value that a meeting feels natural.

HARD REQUIREMENTS:
- 75-100 words
- Frame as mutual benefit: "I think we could have an interesting conversation about X"
- Offer specific times and keep to 15-20 minutes
- Always give an easy out: "No pressure at all — I know things get busy"
- Suggest a SPECIFIC topic for discussion
- Never propose "picking their brain" or an "informational interview"
- Use a NEW personalization hook${usedHooksStr}

Return JSON:
{
  "body": "the meeting request message (75-100 words)",
  "personalization_hooks": ["specific NEW hook used in this message"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      const text = response.text.trim();
      result = {
        body: text,
        personalization_hooks: [],
      };
    }

    const body = String(result.body ?? '').trim();
    const personalizationHooks: string[] = Array.isArray(result.personalization_hooks)
      ? result.personalization_hooks.map(String)
      : [];
    const charCount = body.length;
    const wordCount = body.split(/\s+/).filter(Boolean).length;

    // Quality scoring
    let qualityScore = 100;

    // Word count: penalize outside optimal range
    if (wordCount < 40) qualityScore -= 20;
    else if (wordCount < 75) qualityScore -= 10;
    if (wordCount > 150) qualityScore -= 10;

    // Personalization
    if (personalizationHooks.length === 0) qualityScore -= 20;

    // Check for repeated hooks
    const repeatedHooks = personalizationHooks.filter(h =>
      usedHooks.some(used => used.toLowerCase() === h.toLowerCase())
    );
    if (repeatedHooks.length > 0) qualityScore -= 15;

    // Anti-patterns
    if (/pick your brain/i.test(body)) qualityScore -= 20;
    if (/informational interview/i.test(body)) qualityScore -= 20;
    if (/I'd appreciate your time/i.test(body)) qualityScore -= 10;

    qualityScore = Math.max(0, qualityScore);

    const message: OutreachMessage = {
      type: 'meeting_request',
      subject: '',
      body,
      char_count: charCount,
      personalization_hooks: personalizationHooks,
      timing: MESSAGE_TIMING.meeting_request,
      quality_score: qualityScore,
    };

    if (!state.messages) {
      state.messages = [];
    }
    const existingIdx = state.messages.findIndex(m => m.type === 'meeting_request');
    if (existingIdx >= 0) {
      state.messages[existingIdx] = message;
    } else {
      state.messages.push(message);
    }

    ctx.emit({ type: 'message_progress', message_type: 'meeting_request', status: 'complete' });

    return JSON.stringify({
      success: true,
      message_type: 'meeting_request',
      char_count: charCount,
      word_count: wordCount,
      quality_score: qualityScore,
    });
  },
};

// ─── Tool: assemble_sequence ────────────────────────────────────────

const assembleSequenceTool: NetworkingOutreachTool = {
  name: 'assemble_sequence',
  description:
    'Assemble all written messages into the final outreach sequence report. ' +
    'Calculates overall quality_score. ' +
    'Call this after ALL messages have been written. ' +
    'Does NOT emit sequence_complete — finalizeResult handles that.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const messages = state.messages ?? [];

    if (messages.length < 3) {
      return JSON.stringify({
        success: false,
        error: `Only ${messages.length} message(s) written. At least 3 messages are required before assembling the sequence.`,
      });
    }

    // ─── Quality scoring ────────────────────────────────────────────

    const avgQuality = Math.round(
      messages.reduce((sum, m) => sum + m.quality_score, 0) / messages.length
    );

    // ─── Assemble markdown report ───────────────────────────────────

    const targetName = state.target_analysis?.target_name ?? 'Target Contact';
    const targetCompany = state.target_analysis?.target_company ?? 'Target Company';
    const approachStrategy = state.connection_path?.approach_strategy ?? 'Direct outreach';

    const parts: string[] = [];
    parts.push('# LinkedIn Outreach Sequence');
    parts.push('');
    parts.push(`**Target:** ${targetName}`);
    parts.push(`**Company:** ${targetCompany}`);
    if (state.target_analysis?.target_title) {
      parts.push(`**Title:** ${state.target_analysis.target_title}`);
    }
    parts.push(`**Connection Approach:** ${approachStrategy}`);
    if (state.connection_path?.connection_degree) {
      parts.push(`**Connection Degree:** ${state.connection_path.connection_degree}`);
    }
    parts.push(`**Messages in Sequence:** ${messages.length}`);
    parts.push(`**Overall Quality Score:** ${avgQuality}%`);
    parts.push('');
    parts.push('---');
    parts.push('');

    // Each message formatted
    for (const msg of messages) {
      const label = MESSAGE_TYPE_LABELS[msg.type] ?? msg.type;
      const timing = MESSAGE_TIMING[msg.type] ?? 'See timing guidance';

      parts.push(`## ${label}`);
      parts.push('');
      parts.push(`**Timing:** ${timing}`);
      parts.push(`**Characters:** ${msg.char_count}`);
      parts.push(`**Quality Score:** ${msg.quality_score}%`);
      if (msg.subject) {
        parts.push(`**Subject:** ${msg.subject}`);
      }
      parts.push('');
      parts.push('> ' + msg.body.split('\n').join('\n> '));
      parts.push('');
      if (msg.personalization_hooks.length > 0) {
        parts.push(`**Personalization Hooks:** ${msg.personalization_hooks.join(', ')}`);
        parts.push('');
      }
      parts.push('---');
      parts.push('');
    }

    // Personalization summary
    const allHooks = messages.flatMap(m => m.personalization_hooks);
    if (allHooks.length > 0) {
      parts.push('## Personalization Summary');
      parts.push('');
      for (const msg of messages) {
        if (msg.personalization_hooks.length > 0) {
          parts.push(`- **${MESSAGE_TYPE_LABELS[msg.type]}:** ${msg.personalization_hooks.join(', ')}`);
        }
      }
      parts.push('');
      parts.push('---');
      parts.push('');
    }

    // Timing guidance
    parts.push('## Timing Guidance');
    parts.push('');
    for (const msg of messages) {
      parts.push(`- **${MESSAGE_TYPE_LABELS[msg.type]}:** ${MESSAGE_TIMING[msg.type]}`);
    }
    parts.push('');
    parts.push('---');
    parts.push('');

    // Quality notes
    const qualityNotes: string[] = [];
    if (avgQuality < 70) {
      qualityNotes.push('Overall sequence quality is below target (70%) — consider revising weak messages.');
    }
    const weakMessages = messages.filter(m => m.quality_score < 60);
    if (weakMessages.length > 0) {
      qualityNotes.push(
        `${weakMessages.length} message(s) scored below 60%: ${weakMessages.map(m => MESSAGE_TYPE_LABELS[m.type]).join(', ')}`
      );
    }
    const overLimitMessages = messages.filter(m => {
      if (m.type === 'connection_request') return m.char_count > 300;
      if (m.type === 'follow_up_1' || m.type === 'follow_up_2') return m.char_count > 500;
      return false;
    });
    if (overLimitMessages.length > 0) {
      qualityNotes.push(
        `${overLimitMessages.length} message(s) exceed character limits: ${overLimitMessages.map(m => MESSAGE_TYPE_LABELS[m.type]).join(', ')}`
      );
    }

    if (qualityNotes.length > 0) {
      parts.push('## Quality Notes');
      parts.push('');
      for (const note of qualityNotes) {
        parts.push(`- ${note}`);
      }
      parts.push('');
    }

    // Tips
    parts.push('## Engagement Tips');
    parts.push('');
    parts.push('- If the target responds at ANY point, stop the sequence and engage in genuine conversation');
    parts.push('- Never send follow-ups on weekends or before 8 AM / after 6 PM in the target\'s timezone');
    parts.push('- Adjust timing based on their engagement patterns — if they post at 7 AM, they\'re an early reader');
    parts.push('- If no response after the value offer, pause for 2-3 weeks before any final outreach');
    parts.push('');

    const finalReport = parts.join('\n');

    // Store on state — do NOT emit sequence_complete (finalizeResult handles that)
    state.final_report = finalReport;
    state.quality_score = avgQuality;

    return JSON.stringify({
      success: true,
      message_count: messages.length,
      quality_score: avgQuality,
      quality_notes: qualityNotes,
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const writerTools: NetworkingOutreachTool[] = [
  writeConnectionRequestTool,
  writeFollowUpTool,
  writeValueOfferTool,
  writeMeetingRequestTool,
  assembleSequenceTool,
];
