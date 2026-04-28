/**
 * Thank You Note Writer — Tool definitions.
 *
 * Phase 2.3e: recipient-role primary axis, multi-recipient with
 * independent refinement, soft interview-prep coupling, timing
 * awareness.
 *
 * 5 tools:
 * - analyze_interview_context: Extract themes, decision-makers, rapport signals
 * - write_thank_you_note: Draft a note for a specific recipient, calibrated by role
 * - personalize_per_recipient: Quality-check a specific draft (tone + uniqueness)
 * - assemble_note_set: Combine all notes into final collection with timing guidance
 * - emit_timing_warning: Surface a soft warning when days-since-interview > 2
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  ThankYouNoteState,
  ThankYouNoteSSEEvent,
  ThankYouNote,
  NoteFormat,
  RecipientContext,
  RecipientRole,
} from '../types.js';
import { NOTE_FORMAT_LABELS, RECIPIENT_ROLE_LABELS } from '../types.js';
import { THANK_YOU_NOTE_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderBenchmarkProfileDirectionSection,
  renderPositioningStrategySection,
  renderWhyMeStorySection,
} from '../../../contracts/shared-context-prompt.js';

type WriterTool = AgentTool<ThankYouNoteState, ThankYouNoteSSEEvent>;

// ─── Role-specific tone guidance ───────────────────────────────────

const ROLE_TONE_GUIDANCE: Record<RecipientRole, string> = {
  hiring_manager:
    'HIRING MANAGER: Confirm fit without overclaiming. Reinforce 1–2 value propositions that map to conversation topics. Forward-looking close with a concrete next step. Never "look forward to hearing back."',
  recruiter:
    'RECRUITER: Appreciative of process navigation. One confident sentence of continued interest. Logistics-friendly — offer to make their job easier. Do not re-pitch.',
  panel_interviewer:
    'PANEL INTERVIEWER (peer): Peer tone, future colleague posture. Reference a SPECIFIC conversation thread with THIS person — not what you said to the hiring manager. Connection-oriented close.',
  executive_sponsor:
    'EXECUTIVE SPONSOR: Strategic/visionary. Brief (75–125 words). One strategic synthesis — not a recap — from the conversation. Acknowledge their time; do not apologize for it. No asks.',
  other:
    'OTHER: Standard peer/professional tone. Calibrate to seniority cue from the title and any user-supplied rapport notes. Apply the standard personalization rules.',
};

// ─── Helpers ───────────────────────────────────────────────────────

function findRecipientIndex(
  recipients: RecipientContext[],
  name: string,
): number {
  for (let i = 0; i < recipients.length; i += 1) {
    if (recipients[i].name === name) return i;
  }
  return -1;
}

/**
 * Find the most recent note written for this recipient name (regardless of format).
 * Returns -1 if none found.
 */
function findLatestNoteIndex(notes: ThankYouNote[], recipientName: string): number {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    if (notes[i].recipient_name === recipientName) return i;
  }
  return -1;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.includes('{')) return null;

  try {
    const repaired = repairJSON<unknown>(trimmed);
    const parsed = repaired
      ?? (trimmed.startsWith('{') && trimmed.endsWith('}') ? JSON.parse(trimmed) : null);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function normalizeGeneratedNotePayload(result: unknown): Record<string, unknown> {
  const payload = parseRecord(result) ?? {};
  const nestedContent = parseRecord(payload.content);
  if (!nestedContent) return payload;

  return {
    ...payload,
    ...Object.fromEntries(
      Object.entries(nestedContent).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ),
    content: nestedContent.content ?? payload.content,
    subject_line: nestedContent.subject_line ?? payload.subject_line,
    personalization_notes: nestedContent.personalization_notes ?? payload.personalization_notes,
    word_count: nestedContent.word_count ?? payload.word_count,
  };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeCandidateSignoff(text: string, candidateName: string): string {
  const realName = candidateName.trim();
  const hasRealName = realName.length > 0 && !/^(candidate|the candidate|your name)$/i.test(realName);
  const placeholderPattern = /\[(?:candidate|your)\s+name\]|\{\{(?:candidate|your)_?name\}\}|<\s*(?:candidate|your)\s+name\s*>/gi;

  if (hasRealName) {
    return normalizeWhitespace(text.replace(placeholderPattern, realName));
  }

  return normalizeWhitespace(
    text
      .replace(placeholderPattern, '')
      .replace(/\n\s*(?:best|best regards|regards|sincerely),?\s*$/i, ''),
  );
}

// ─── Tool: analyze_interview_context ──────────────────────────────

const analyzeInterviewContextTool: WriterTool = {
  name: 'analyze_interview_context',
  description:
    'Analyze the interview context to extract key themes, decision-makers, rapport signals, ' +
    'and strategic opportunities for personalized thank-you notes. Reads recipients (with roles) from state.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: "The full text of the candidate's resume",
      },
    },
    required: ['resume_text'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const resumeText = String(input.resume_text ?? '');

    const recipientDetails = state.recipients
      .map((r: RecipientContext) => {
        const topics = r.topics_discussed?.length ? r.topics_discussed.join(', ') : '(none captured — lean on prior interview-prep context if available)';
        const rapport = r.rapport_notes ? `. Rapport: ${r.rapport_notes}` : '';
        const questions = r.key_questions?.length ? `. Key questions: ${r.key_questions.join('; ')}` : '';
        const titleSuffix = r.title ? ` (${r.title})` : '';
        return `- ${r.name}${titleSuffix} [role=${r.role}]: Topics: ${topics}${rapport}${questions}`;
      })
      .join('\n');

    const priorContext = state.prior_interview_prep?.report_excerpt
      ? `\n## Prior interview-prep report excerpt\n${state.prior_interview_prep.report_excerpt}`
      : '';

    const sharedContext = state.shared_context;
    const platformContextSections = [
      ...renderBenchmarkProfileDirectionSection({
        heading: '## Benchmark Profile Direction',
        sharedContext,
      }),
      ...renderPositioningStrategySection({
        heading: '## Platform Positioning Strategy',
        sharedStrategy: sharedContext?.positioningStrategy,
        legacyStrategy: state.platform_context?.positioning_strategy,
      }),
      ...renderWhyMeStorySection({
        heading: '## Why-Me Story',
        legacyWhyMeStory: state.platform_context?.why_me_story,
      }),
    ].filter(Boolean).join('\n');

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are a senior executive interview strategist. You identify the strongest personalization opportunities for each recipient, calibrated by their role (hiring_manager / recruiter / panel_interviewer / executive_sponsor / other). Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Analyze the interview context to guide personalized thank-you notes.

## Candidate Resume
${resumeText}

## Interview Context
Company: ${state.interview_context.company}
Role: ${state.interview_context.role}
${state.interview_context.interview_date ? `Date: ${state.interview_context.interview_date}` : ''}

## Recipients
${recipientDetails}
${priorContext}

${platformContextSections ? platformContextSections : ''}

For each recipient, determine:
1. The strongest personalization angle given their role and the conversation
2. The single most important value-proposition thread to reinforce (if any)
3. The tone calibration (peer / appreciative-of-process / strategic-brief / etc.)

Return JSON:
{
  "key_themes": ["theme 1", "theme 2"],
  "recipient_analysis": [
    {
      "name": "...",
      "role": "...",
      "seniority_level": "C-suite | VP | director | IC | recruiter | HRBP | other",
      "tone_recommendation": "...",
      "strongest_personalization": "...",
      "value_thread": "...",
      "format_recommendation": "email | handwritten | linkedin_message"
    }
  ]
}`,
      }],
    });

    let result = parseRecord(response.text);
    if (!result) {
      result = { key_themes: [], recipient_analysis: [] };
    }

    scratchpad.interview_analysis = result;

    // Derive candidate name for later tools.
    const nameMatch = resumeText.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})/);
    if (nameMatch) {
      scratchpad.candidate_name = nameMatch[1];
    }

    return JSON.stringify({
      success: true,
      theme_count: Array.isArray(result.key_themes) ? result.key_themes.length : 0,
      recipient_count: Array.isArray(result.recipient_analysis) ? result.recipient_analysis.length : 0,
    });
  },
};

// ─── Tool: emit_timing_warning ────────────────────────────────────

const emitTimingWarningTool: WriterTool = {
  name: 'emit_timing_warning',
  description:
    'Emit a soft UI warning when more than 2 days have passed since the most recent interview. ' +
    'The user-facing message is author-written (not a template). Call this only when ' +
    'state.activity_signals.days_since_interview is greater than 2. Never blocks the pipeline.',
  model_tier: 'orchestrator',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Short, first-person warning copy (1–2 sentences) surfacing that the window has slipped. No template language.',
      },
    },
    required: ['message'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const days = state.activity_signals?.days_since_interview;
    if (typeof days !== 'number' || days <= 2) {
      return { emitted: false, reason: 'timing_window_still_fresh' };
    }
    if (state.timing_warning_emitted) {
      return { emitted: false, reason: 'already_emitted' };
    }

    const raw = String(input.message ?? '').trim();
    if (!raw) {
      return { emitted: false, reason: 'empty_message' };
    }

    ctx.emit({
      type: 'thank_you_timing_warning',
      session_id: state.session_id,
      days_since_interview: days,
      message: raw,
    });
    state.timing_warning_emitted = true;

    return { emitted: true, days_since_interview: days };
  },
};

// ─── Tool: write_thank_you_note ───────────────────────────────────

const writeThankYouNoteTool: WriterTool = {
  name: 'write_thank_you_note',
  description:
    'Draft a thank-you note for a specific recipient, calibrated by recipient_role. ' +
    'Replaces or appends into state.notes keyed on recipient_name. If revision_feedback_by_recipient ' +
    'has an entry for this recipient, incorporate it and clear that entry in the scratchpad return.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      recipient_name: {
        type: 'string',
        description: 'Name of the recipient (must match a recipient in state.recipients).',
      },
      format: {
        type: 'string',
        enum: ['email', 'handwritten', 'linkedin_message'],
        description: 'The note delivery channel.',
      },
      key_topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific topics to reference. May be empty — the analyze step and prior context can fill in.',
      },
    },
    required: ['recipient_name', 'format'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const recipientName = String(input.recipient_name ?? '');
    const format = String(input.format ?? 'email') as NoteFormat;
    const keyTopics = Array.isArray(input.key_topics)
      ? (input.key_topics as string[]).map(String)
      : [];
    const formatLabel = NOTE_FORMAT_LABELS[format] ?? format;

    const recipientIndex = findRecipientIndex(state.recipients, recipientName);
    if (recipientIndex < 0) {
      return JSON.stringify({
        success: false,
        error: `Recipient '${recipientName}' not found in state.recipients.`,
      });
    }
    const recipient = state.recipients[recipientIndex];
    const role: RecipientRole = recipient.role;
    const roleLabel = RECIPIENT_ROLE_LABELS[role];
    const roleGuidance = ROLE_TONE_GUIDANCE[role];

    const perRecipientFeedback = state.revision_feedback_by_recipient?.[recipientIndex];
    const collectionFeedback = state.revision_feedback;

    const topicsBlock = recipient.topics_discussed?.length
      ? `Topics Discussed: ${recipient.topics_discussed.join(', ')}`
      : '';
    const rapportBlock = recipient.rapport_notes ? `Rapport Notes: ${recipient.rapport_notes}` : '';
    const questionsBlock = recipient.key_questions?.length
      ? `Key Questions: ${recipient.key_questions.join('; ')}`
      : '';
    const priorExcerpt = state.prior_interview_prep?.report_excerpt?.trim();
    const benchmarkDirection = renderBenchmarkProfileDirectionSection({
      heading: '## Benchmark Profile Direction',
      sharedContext: state.shared_context,
    }).join('\n');

    const analysis = scratchpad.interview_analysis as Record<string, unknown> | undefined;
    let analysisLine = '';
    if (analysis && Array.isArray(analysis.recipient_analysis)) {
      const match = (analysis.recipient_analysis as Array<Record<string, unknown>>).find(
        (a) => a.name === recipientName,
      );
      if (match) {
        analysisLine = `Seniority: ${String(match.seniority_level ?? 'unspecified')}. Tone: ${String(match.tone_recommendation ?? 'peer-professional')}. Personalization angle: ${String(match.strongest_personalization ?? 'conversation-specific')}.`;
      }
    }

    const candidateName = scratchpad.candidate_name ? String(scratchpad.candidate_name) : 'the candidate';
    const wordCountGuide: Record<NoteFormat, string> = {
      email: '150–250 words, 3–5 short paragraphs',
      handwritten: '75–150 words, card-sized',
      linkedin_message: '50–100 words, concise',
    };

    const revisionBlock: string[] = [];
    if (perRecipientFeedback) {
      revisionBlock.push(
        '',
        '## User Revision Requested (this recipient only)',
        `"${perRecipientFeedback}"`,
        'Incorporate this feedback. Preserve what was working; change only what was called out.',
      );
    } else if (collectionFeedback) {
      revisionBlock.push(
        '',
        '## User Revision Requested (collection-level)',
        `"${collectionFeedback}"`,
        'Apply this to the current recipient as well; adjust tone and emphasis accordingly.',
      );
    }

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a world-class executive communication writer. You write authentic, role-calibrated thank-you notes that build relationships and reinforce candidacy without desperation.

${THANK_YOU_NOTE_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Draft a ${formatLabel} thank-you note for ${recipientName}.

## Recipient
Name: ${recipientName}
Role: ${roleLabel} (${role})
${recipient.title ? `Title: ${recipient.title}` : 'Title: (not provided)'}
${topicsBlock}
${rapportBlock}
${questionsBlock}
${analysisLine ? `\n## Analysis\n${analysisLine}` : ''}

## Interview Context
Company: ${state.interview_context.company}
Role: ${state.interview_context.role}
${state.interview_context.interview_date ? `Date: ${state.interview_context.interview_date}` : ''}
Candidate: ${candidateName}

${benchmarkDirection ? `${benchmarkDirection}\n` : ''}
## Key Topics to Reference
${keyTopics.length > 0 ? keyTopics.map((t) => `- ${t}`).join('\n') : '(none supplied — use prior interview-prep context if available)'}

${priorExcerpt ? `## Prior interview-prep report excerpt (reference real moments only; never invent)\n${priorExcerpt}\n` : ''}
## Role-Tone Guidance (primary axis)
${roleGuidance}

## Format Requirements
- Format: ${formatLabel}
- Target length: ${wordCountGuide[format]}
${format === 'email' ? '- Include a compelling subject line' : ''}

REQUIREMENTS:
- Role calibration is the primary axis — the note must sound clearly different from a note to a recipient in a different role, even at the same interview.
- Reference at least one specific moment from the interview. Use prior-interview-prep excerpts only for real topics, never to invent.
- Subtly reinforce fit with one brief connection to the candidate's relevant experience.
- Close with a forward-looking statement appropriate to the role's tone guidance.
- Do NOT include desperation, salary mentions, cliches, or apologies.
- Write in the first person from the candidate's perspective.
- Never use bracketed placeholders such as [Candidate Name] or [Your Name]. Sign with "${candidateName}" only if that is a real candidate name.
${revisionBlock.join('\n')}

Return JSON:
{
  "content": "the full note text",
${format === 'email' ? '  "subject_line": "email subject line",' : ''}
  "word_count": <actual word count>,
  "personalization_notes": "brief description of how this note was personalized and why it fits the role"
}`,
      }],
    });

    let result = parseRecord(response.text);
    if (!result) {
      result = {
        content: response.text.trim(),
        subject_line: format === 'email' ? `Thank you — ${state.interview_context.role} conversation` : undefined,
        word_count: response.text.trim().split(/\s+/).length,
        personalization_notes: 'Unable to parse personalization notes',
      };
    }

    result = normalizeGeneratedNotePayload(result);

    const content = normalizeCandidateSignoff(String(result.content ?? ''), candidateName);
    const note: ThankYouNote = {
      recipient_role: role,
      recipient_name: recipientName,
      recipient_title: recipient.title ?? '',
      format,
      content,
      subject_line: format === 'email' ? normalizeWhitespace(String(result.subject_line ?? '')) : undefined,
      personalization_notes: normalizeWhitespace(String(result.personalization_notes ?? '')),
    };

    // Replace the existing note for this recipient (if any), else append.
    const scratchNotes = (scratchpad.notes ?? []) as ThankYouNote[];
    const scratchIdx = findLatestNoteIndex(scratchNotes, recipientName);
    if (scratchIdx >= 0) {
      scratchNotes[scratchIdx] = note;
    } else {
      scratchNotes.push(note);
    }
    scratchpad.notes = scratchNotes;

    const stateIdx = findLatestNoteIndex(state.notes, recipientName);
    if (stateIdx >= 0) {
      state.notes[stateIdx] = note;
    } else {
      state.notes.push(note);
    }

    // Consume per-recipient feedback so subsequent rounds don't re-apply it.
    if (perRecipientFeedback && state.revision_feedback_by_recipient) {
      delete state.revision_feedback_by_recipient[recipientIndex];
    }

    ctx.emit({
      type: 'note_drafted',
      recipient_name: recipientName,
      recipient_role: role,
      format,
    });

    return JSON.stringify({
      success: true,
      recipient_name: recipientName,
      recipient_role: role,
      format,
      word_count: content.split(/\s+/).filter(Boolean).length,
    });
  },
};

// ─── Tool: personalize_per_recipient ──────────────────────────────

const personalizePerRecipientTool: WriterTool = {
  name: 'personalize_per_recipient',
  description:
    "Quality-check and score a drafted note for a specific recipient. Evaluates role calibration, " +
    "personalization depth, tone, anti-patterns, and uniqueness against the rest of the note set.",
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      recipient_name: {
        type: 'string',
        description: 'Recipient whose note to quality-check.',
      },
      format: {
        type: 'string',
        enum: ['email', 'handwritten', 'linkedin_message'],
        description: 'The note format to quality-check.',
      },
    },
    required: ['recipient_name', 'format'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const recipientName = String(input.recipient_name ?? '');
    const format = String(input.format ?? 'email') as NoteFormat;

    const notes = (scratchpad.notes ?? []) as ThankYouNote[];
    let noteIndex = -1;
    for (let i = notes.length - 1; i >= 0; i -= 1) {
      if (notes[i].recipient_name === recipientName && notes[i].format === format) {
        noteIndex = i;
        break;
      }
    }

    if (noteIndex === -1) {
      return JSON.stringify({
        success: false,
        error: `No note found for recipient=${recipientName}, format=${format}. Write it first.`,
      });
    }

    const note = notes[noteIndex];
    const roleLabel = RECIPIENT_ROLE_LABELS[note.recipient_role];
    const roleGuidance = ROLE_TONE_GUIDANCE[note.recipient_role];

    const otherNotes = notes
      .filter((_, idx) => idx !== noteIndex)
      .map((n) => `[${n.recipient_name} — ${n.recipient_role}]: ${n.content.substring(0, 200)}...`);
    const otherNotesContext = otherNotes.length > 0
      ? `\n## Other Notes in This Set (for uniqueness check)\n${otherNotes.join('\n')}`
      : '';

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are a senior executive communications editor. You evaluate thank-you notes for role calibration, personalization quality, tone accuracy, and anti-pattern detection.

${THANK_YOU_NOTE_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Quality-check and score this thank-you note.

## Note
Recipient: ${recipientName} (${roleLabel})
Format: ${format}
Content:
${note.content}
${note.subject_line ? `Subject Line: ${note.subject_line}` : ''}
${otherNotesContext}

## Role-Tone Guidance (the note should match this)
${roleGuidance}

## Interview Context
Company: ${state.interview_context.company}
Role: ${state.interview_context.role}

REVIEW CHECKLIST:
1. Role calibration: Does the tone match the role-tone guidance?
2. Personalization depth: Does it reference specific conversation topics?
3. Tone overall: Peer-level, confident, not obsequious or desperate?
4. Strategic reinforcement: One brief, natural connection to candidate's value?
5. Format compliance: Word count appropriate for ${format}?
6. Anti-pattern scan: Desperation, salary, cliches, excessive flattery?
7. Uniqueness: Does it differ meaningfully in tone AND content from the other notes?
8. Name and title accuracy.
9. Natural voice.

Return JSON:
{
  "quality_score": <0-100>,
  "role_calibration_ok": true/false,
  "personalization_score": <0-100>,
  "tone_ok": true/false,
  "format_compliance_ok": true/false,
  "anti_patterns_found": ["pattern1"],
  "uniqueness_ok": true/false,
  "issues": ["issue1"],
  "strengths": ["strength1"]
}`,
      }],
    });

    let result = parseRecord(response.text);
    if (!result) {
      result = {
        quality_score: 70,
        role_calibration_ok: true,
        personalization_score: 70,
        tone_ok: true,
        format_compliance_ok: true,
        anti_patterns_found: [] as string[],
        uniqueness_ok: true,
        issues: ['Unable to parse quality check response'],
        strengths: [] as string[],
      };
    }

    const qualityScore = Math.min(100, Math.max(0, Number(result.quality_score) || 70));
    notes[noteIndex].quality_score = qualityScore;

    let stateNoteIndex = -1;
    for (let i = state.notes.length - 1; i >= 0; i -= 1) {
      if (state.notes[i].recipient_name === recipientName && state.notes[i].format === format) {
        stateNoteIndex = i;
        break;
      }
    }
    if (stateNoteIndex !== -1) {
      state.notes[stateNoteIndex].quality_score = qualityScore;
    }

    ctx.emit({
      type: 'note_complete',
      recipient_name: recipientName,
      recipient_role: note.recipient_role,
      format,
      quality_score: qualityScore,
    });

    return JSON.stringify({
      success: true,
      recipient_name: recipientName,
      format,
      quality_score: qualityScore,
      role_calibration_ok: Boolean(result.role_calibration_ok),
      tone_ok: Boolean(result.tone_ok),
      format_compliance_ok: Boolean(result.format_compliance_ok),
      uniqueness_ok: Boolean(result.uniqueness_ok),
      anti_patterns_found: Array.isArray(result.anti_patterns_found) ? result.anti_patterns_found.map(String) : [],
      issue_count: Array.isArray(result.issues) ? result.issues.length : 0,
      strength_count: Array.isArray(result.strengths) ? result.strengths.length : 0,
    });
  },
};

// ─── Tool: assemble_note_set ──────────────────────────────────────

const assembleNoteSetTool: WriterTool = {
  name: 'assemble_note_set',
  description:
    'Assemble all written notes into a formatted collection with per-recipient role labels, ' +
    'quality scores, and delivery timing guidance.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_note_set',
      message: 'Assembling thank-you note collection...',
    });

    const notes = (scratchpad.notes ?? state.notes ?? []) as ThankYouNote[];
    const candidateName = scratchpad.candidate_name ? String(scratchpad.candidate_name) : 'Candidate';

    const reportParts: string[] = [];

    reportParts.push(`# Thank You Note Collection — ${candidateName}`);
    reportParts.push('');
    reportParts.push(`**Company:** ${state.interview_context.company}`);
    reportParts.push(`**Role:** ${state.interview_context.role}`);
    if (state.interview_context.interview_date) {
      reportParts.push(`**Interview Date:** ${state.interview_context.interview_date}`);
    }
    reportParts.push('');

    if (typeof state.activity_signals?.days_since_interview === 'number' && state.activity_signals.days_since_interview > 2) {
      reportParts.push(
        '> **Timing note:** ' +
        `More than ${state.activity_signals.days_since_interview} days have passed since the most recent interview. ` +
        'A thank-you still carries weight, but consider sending alongside a follow-up if silence has stretched long.',
      );
      reportParts.push('');
    }

    reportParts.push('## Delivery Timing');
    reportParts.push('');
    reportParts.push('| Format | Send By |');
    reportParts.push('|--------|---------|');
    reportParts.push('| Email | Within 2–4 hours of the interview (same day) |');
    reportParts.push('| LinkedIn Message | Within 12–24 hours |');
    reportParts.push('| Handwritten Note | Mail within 24 hours |');
    reportParts.push('');
    reportParts.push('> **Important:** All notes for all recipients should be sent in the same window. Recipients compare notes.');
    reportParts.push('');

    reportParts.push('## Note Overview');
    reportParts.push('');
    reportParts.push('| Recipient | Role | Title | Format | Words | Quality |');
    reportParts.push('|-----------|------|-------|--------|-------|---------|');
    for (const note of notes) {
      const formatLabel = NOTE_FORMAT_LABELS[note.format] ?? note.format;
      const roleLabel = RECIPIENT_ROLE_LABELS[note.recipient_role] ?? note.recipient_role;
      const wordCount = note.content.split(/\s+/).filter(Boolean).length;
      reportParts.push(
        `| ${note.recipient_name} | ${roleLabel} | ${note.recipient_title || '—'} | ${formatLabel} | ${wordCount} | ${note.quality_score ?? 'N/A'}/100 |`,
      );
    }
    reportParts.push('');

    for (const note of notes) {
      const formatLabel = NOTE_FORMAT_LABELS[note.format] ?? note.format;
      const roleLabel = RECIPIENT_ROLE_LABELS[note.recipient_role] ?? note.recipient_role;
      const wordCount = note.content.split(/\s+/).filter(Boolean).length;
      reportParts.push(`## ${note.recipient_name} — ${roleLabel} (${formatLabel})`);
      reportParts.push('');
      reportParts.push(`*${note.recipient_title || 'Title not provided'} | ${wordCount} words | Quality: ${note.quality_score ?? 'N/A'}/100*`);
      reportParts.push('');
      if (note.subject_line) {
        reportParts.push(`**Subject:** ${note.subject_line}`);
        reportParts.push('');
      }
      reportParts.push(note.content);
      reportParts.push('');
      reportParts.push(`> **Personalization:** ${note.personalization_notes}`);
      reportParts.push('');
      reportParts.push('---');
      reportParts.push('');
    }

    const report = reportParts.join('\n');

    const qualityScores = notes.map((n) => n.quality_score ?? 0).filter((s) => s > 0);
    const overallQuality = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length)
      : 0;

    scratchpad.final_report = report;
    scratchpad.quality_score = overallQuality;
    state.final_report = report;
    state.quality_score = overallQuality;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_note_set',
      message: `Note collection assembled — ${notes.length} notes, average quality: ${overallQuality}/100`,
    });

    return JSON.stringify({
      success: true,
      report_length: report.length,
      note_count: notes.length,
      quality_score: overallQuality,
      recipients_covered: [...new Set(notes.map((n) => n.recipient_name))],
    });
  },
};

// ─── Exports ───────────────────────────────────────────────────────

export const writerTools: WriterTool[] = [
  analyzeInterviewContextTool,
  emitTimingWarningTool,
  writeThankYouNoteTool,
  personalizePerRecipientTool,
  assembleNoteSetTool,
];
