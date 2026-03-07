/**
 * Thank You Note Writer — Tool definitions.
 *
 * 4 tools:
 * - analyze_interview_context: Extract key themes, decision-makers, rapport signals
 * - write_thank_you_note: Write a note for a specific interviewer in a specific format
 * - personalize_per_interviewer: Adjust tone/references based on interviewer role/seniority
 * - assemble_note_set: Combine all notes into final collection with delivery timing
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  ThankYouNoteState,
  ThankYouNoteSSEEvent,
  ThankYouNote,
  NoteFormat,
  InterviewerContext,
} from '../types.js';
import { NOTE_FORMAT_LABELS } from '../types.js';
import { THANK_YOU_NOTE_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type WriterTool = AgentTool<ThankYouNoteState, ThankYouNoteSSEEvent>;

// ─── Tool: analyze_interview_context ──────────────────────────────

const analyzeInterviewContextTool: WriterTool = {
  name: 'analyze_interview_context',
  description:
    'Analyze the interview context to extract key themes, decision-makers, rapport signals, ' +
    'and strategic opportunities for personalized thank-you notes.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'The full text of the candidate\'s resume',
      },
    },
    required: ['resume_text'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const resumeText = String(input.resume_text ?? '');

    const interviewerDetails = state.interviewers.map((i: InterviewerContext) =>
      `- ${i.name} (${i.title}): Topics: ${i.topics_discussed.join(', ')}${i.rapport_notes ? `. Rapport: ${i.rapport_notes}` : ''}${i.key_questions?.length ? `. Key questions: ${i.key_questions.join('; ')}` : ''}`,
    ).join('\n');

    const platformContext = state.platform_context
      ? `\n## Platform Context\nPositioning Strategy: ${JSON.stringify(state.platform_context.positioning_strategy, null, 2)}\nWhy-Me Narrative: ${state.platform_context.why_me_story ?? 'N/A'}`
      : '';

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: `You are a senior executive career strategist. You analyze interview contexts to identify the best personalization opportunities for thank-you notes.

${THANK_YOU_NOTE_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Analyze this interview context for thank-you note personalization.

## Interview Context
Company: ${state.interview_context.company}
Role: ${state.interview_context.role}
Date: ${state.interview_context.interview_date ?? 'Not specified'}
Type: ${state.interview_context.interview_type ?? 'Not specified'}

## Interviewers
${interviewerDetails}

## Resume
${resumeText}
${platformContext}

REQUIREMENTS:
- Identify the key themes across all interviews
- For each interviewer, identify the strongest personalization opportunity
- Identify rapport signals and connection points
- Determine the appropriate tone and format for each interviewer based on their seniority
- Extract candidate strengths most relevant to what was discussed
- Ground everything in the actual interview details — never fabricate

Return JSON:
{
  "key_themes": ["theme1", "theme2"],
  "interviewer_analysis": [
    {
      "name": "interviewer name",
      "seniority_level": "senior|mid|peer",
      "recommended_format": "email|handwritten|linkedin_message",
      "strongest_personalization": "specific callback opportunity",
      "tone_recommendation": "formal|warm|casual",
      "relevant_candidate_strengths": ["strength1", "strength2"]
    }
  ],
  "candidate_summary": {
    "name": "candidate name",
    "current_title": "title",
    "key_strengths": ["strength1", "strength2"]
  }
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        key_themes: [] as string[],
        interviewer_analysis: [] as unknown[],
        candidate_summary: null,
      };
    }

    scratchpad.interview_analysis = result;
    scratchpad.key_themes = Array.isArray(result.key_themes) ? result.key_themes : [];

    if (result.candidate_summary && typeof result.candidate_summary === 'object') {
      const cs = result.candidate_summary as Record<string, unknown>;
      scratchpad.candidate_name = String(cs.name ?? '');
      scratchpad.candidate_title = String(cs.current_title ?? '');
    }

    return JSON.stringify({
      success: true,
      theme_count: Array.isArray(result.key_themes) ? result.key_themes.length : 0,
      interviewer_count: Array.isArray(result.interviewer_analysis) ? result.interviewer_analysis.length : 0,
    });
  },
};

// ─── Tool: write_thank_you_note ───────────────────────────────────

const writeThankYouNoteTool: WriterTool = {
  name: 'write_thank_you_note',
  description:
    'Write a thank-you note for a specific interviewer in a specific format. ' +
    'The note is personalized to the conversation topics and interviewer context.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      interviewer_name: {
        type: 'string',
        description: 'Name of the interviewer to write the note for',
      },
      format: {
        type: 'string',
        enum: ['email', 'handwritten', 'linkedin_message'],
        description: 'The note format to write',
      },
      key_topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key topics to reference in the note',
      },
    },
    required: ['interviewer_name', 'format', 'key_topics'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const interviewerName = String(input.interviewer_name ?? '');
    const format = String(input.format ?? 'email') as NoteFormat;
    const keyTopics = Array.isArray(input.key_topics)
      ? (input.key_topics as string[]).map(String)
      : [] as string[];
    const formatLabel = NOTE_FORMAT_LABELS[format] ?? format;

    // Find the interviewer context
    let interviewer: InterviewerContext | undefined;
    for (const i of state.interviewers) {
      if (i.name === interviewerName) { interviewer = i; break; }
    }

    const interviewerContext = interviewer
      ? `\n## Interviewer\nName: ${interviewer.name}\nTitle: ${interviewer.title}\nTopics Discussed: ${interviewer.topics_discussed.join(', ')}${interviewer.rapport_notes ? `\nRapport Notes: ${interviewer.rapport_notes}` : ''}${interviewer.key_questions?.length ? `\nKey Questions: ${interviewer.key_questions.join('; ')}` : ''}`
      : `\n## Interviewer\nName: ${interviewerName}`;

    const interviewAnalysis = scratchpad.interview_analysis as Record<string, unknown> | undefined;
    let analysiContext = '';
    if (interviewAnalysis && Array.isArray(interviewAnalysis.interviewer_analysis)) {
      const match = (interviewAnalysis.interviewer_analysis as Array<Record<string, unknown>>).find(
        (a) => a.name === interviewerName,
      );
      if (match) {
        analysiContext = `\n## Analysis for this interviewer\nSeniority: ${match.seniority_level}\nTone: ${match.tone_recommendation}\nBest personalization: ${match.strongest_personalization}`;
      }
    }

    const candidateName = scratchpad.candidate_name ? String(scratchpad.candidate_name) : 'the candidate';

    const wordCountGuide: Record<NoteFormat, string> = {
      email: '150-250 words, 3-5 short paragraphs',
      handwritten: '75-150 words, card-sized',
      linkedin_message: '50-100 words, concise',
    };

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a world-class executive communication writer. You write authentic, personalized thank-you notes that build relationships and reinforce candidacy without desperation.

${THANK_YOU_NOTE_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a ${formatLabel} thank-you note for ${interviewerName}.

## Interview Context
Company: ${state.interview_context.company}
Role: ${state.interview_context.role}
Date: ${state.interview_context.interview_date ?? 'Recent'}
Candidate: ${candidateName}
${interviewerContext}
${analysiContext}

## Key Topics to Reference
${keyTopics.map((t) => `- ${t}`).join('\n')}

## Format Requirements
- Format: ${formatLabel}
- Target length: ${wordCountGuide[format]}
${format === 'email' ? '- Include a compelling subject line' : ''}

REQUIREMENTS:
- Express genuine gratitude for the specific conversation, not generic thanks
- Reference at least one specific topic or moment from the interview
- Subtly reinforce fit with one brief connection to the candidate's relevant experience
- Match tone to interviewer seniority and format
- Close with a forward-looking statement about next steps or continued conversation
- Do NOT include desperation, salary mentions, cliches, or apologies
- Write from the candidate's perspective (first person)

Return JSON:
{
  "content": "the full note text",
${format === 'email' ? '  "subject_line": "email subject line",' : ''}
  "word_count": <actual word count>,
  "personalization_notes": "brief description of how this note was personalized"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        content: response.text.trim(),
        subject_line: format === 'email' ? `Thank you — ${state.interview_context.role} conversation` : undefined,
        word_count: response.text.trim().split(/\s+/).length,
        personalization_notes: 'Unable to parse personalization notes',
      };
    }

    const content = String(result.content ?? '');
    const note: ThankYouNote = {
      interviewer_name: interviewerName,
      interviewer_title: interviewer?.title ?? '',
      format,
      content,
      subject_line: format === 'email' ? String(result.subject_line ?? '') : undefined,
      personalization_notes: String(result.personalization_notes ?? ''),
    };

    // Append to scratchpad notes
    if (!Array.isArray(scratchpad.notes)) {
      scratchpad.notes = [] as ThankYouNote[];
    }
    (scratchpad.notes as ThankYouNote[]).push(note);

    // Update state
    if (!state.notes) {
      state.notes = [] as ThankYouNote[];
    }
    state.notes.push(note);

    ctx.emit({
      type: 'note_drafted',
      interviewer_name: interviewerName,
      format,
    });

    return JSON.stringify({
      success: true,
      interviewer_name: interviewerName,
      format,
      word_count: content.split(/\s+/).filter(Boolean).length,
    });
  },
};

// ─── Tool: personalize_per_interviewer ────────────────────────────

const personalizePerInterviewerTool: WriterTool = {
  name: 'personalize_per_interviewer',
  description:
    'Quality-check and adjust tone, references, and personalization depth for a specific note ' +
    'based on the interviewer\'s role, seniority, and rapport established.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      interviewer_name: {
        type: 'string',
        description: 'Name of the interviewer whose note to personalize',
      },
      format: {
        type: 'string',
        enum: ['email', 'handwritten', 'linkedin_message'],
        description: 'The note format to personalize',
      },
    },
    required: ['interviewer_name', 'format'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const interviewerName = String(input.interviewer_name ?? '');
    const format = String(input.format ?? 'email') as NoteFormat;

    // Find the most recently written note for this interviewer+format
    const notes = (scratchpad.notes ?? []) as ThankYouNote[];
    let noteIndex = -1;
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].interviewer_name === interviewerName && notes[i].format === format) {
        noteIndex = i;
        break;
      }
    }

    if (noteIndex === -1) {
      return JSON.stringify({
        success: false,
        error: `No note found for interviewer=${interviewerName}, format=${format}. Write it first.`,
      });
    }

    const note = notes[noteIndex];

    // Check uniqueness against other notes in the set
    const otherNotes = notes
      .filter((_, idx) => idx !== noteIndex)
      .map((n) => `[${n.interviewer_name}]: ${n.content.substring(0, 200)}...`);
    const otherNotesContext = otherNotes.length > 0
      ? `\n## Other Notes in This Set (for uniqueness check)\n${otherNotes.join('\n')}`
      : '';

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are a senior executive communications editor. You evaluate thank-you notes for personalization quality, tone accuracy, and anti-pattern detection.

${THANK_YOU_NOTE_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Quality-check and score this thank-you note.

## Note
Interviewer: ${interviewerName}
Format: ${format}
Content:
${note.content}
${note.subject_line ? `Subject Line: ${note.subject_line}` : ''}
${otherNotesContext}

## Interview Context
Company: ${state.interview_context.company}
Role: ${state.interview_context.role}

REVIEW CHECKLIST:
1. Personalization depth: Does it reference specific conversation topics?
2. Tone calibration: Peer-level, confident, not obsequious or desperate?
3. Strategic reinforcement: One brief, natural connection to candidate's value?
4. Format compliance: Word count appropriate for ${format}?
5. Anti-pattern scan: Desperation, salary, cliches, excessive flattery?
6. Uniqueness: Does it differ meaningfully from other notes in the set?
7. Name and title accuracy: Correct?
8. Natural voice: Sounds human, not template-generated?

Return JSON:
{
  "quality_score": <0-100>,
  "personalization_score": <0-100>,
  "tone_ok": true/false,
  "format_compliance_ok": true/false,
  "anti_patterns_found": ["pattern1", "pattern2"],
  "uniqueness_ok": true/false,
  "issues": ["issue1", "issue2"],
  "strengths": ["strength1", "strength2"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        quality_score: 70,
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

    // Update note quality score in scratchpad
    notes[noteIndex].quality_score = qualityScore;

    // Update in state as well
    let stateNoteIndex = -1;
    for (let i = state.notes.length - 1; i >= 0; i--) {
      if (state.notes[i].interviewer_name === interviewerName && state.notes[i].format === format) {
        stateNoteIndex = i;
        break;
      }
    }
    if (stateNoteIndex !== -1) {
      state.notes[stateNoteIndex].quality_score = qualityScore;
    }

    ctx.emit({
      type: 'note_complete',
      interviewer_name: interviewerName,
      format,
      quality_score: qualityScore,
    });

    return JSON.stringify({
      success: true,
      interviewer_name: interviewerName,
      format,
      quality_score: qualityScore,
      tone_ok: Boolean(result.tone_ok),
      format_compliance_ok: Boolean(result.format_compliance_ok),
      anti_patterns_found: Array.isArray(result.anti_patterns_found) ? result.anti_patterns_found.map(String) : [],
      uniqueness_ok: Boolean(result.uniqueness_ok),
      issue_count: Array.isArray(result.issues) ? result.issues.length : 0,
      strength_count: Array.isArray(result.strengths) ? result.strengths.length : 0,
    });
  },
};

// ─── Tool: assemble_note_set ──────────────────────────────────────

const assembleNoteSetTool: WriterTool = {
  name: 'assemble_note_set',
  description:
    'Assemble all written notes into a formatted collection with quality scores, ' +
    'delivery timing guidance, and personalization summaries.',
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

    const notes = (scratchpad.notes ?? []) as ThankYouNote[];
    const candidateName = scratchpad.candidate_name ? String(scratchpad.candidate_name) : 'Candidate';

    const reportParts: string[] = [];

    // ── Header ──
    reportParts.push(`# Thank You Note Collection — ${candidateName}`);
    reportParts.push('');
    reportParts.push(`**Company:** ${state.interview_context.company}`);
    reportParts.push(`**Role:** ${state.interview_context.role}`);
    if (state.interview_context.interview_date) {
      reportParts.push(`**Interview Date:** ${state.interview_context.interview_date}`);
    }
    reportParts.push('');

    // ── Delivery Timing Guidance ──
    reportParts.push('## Delivery Timing');
    reportParts.push('');
    reportParts.push('| Format | Send By |');
    reportParts.push('|--------|---------|');
    reportParts.push('| Email | Within 2-4 hours of the interview (same day) |');
    reportParts.push('| LinkedIn Message | Within 12-24 hours |');
    reportParts.push('| Handwritten Note | Mail within 24 hours |');
    reportParts.push('');
    reportParts.push('> **Important:** All notes for all interviewers should be sent in the same window. Interviewers compare notes.');
    reportParts.push('');

    // ── Overview table ──
    reportParts.push('## Note Overview');
    reportParts.push('');
    reportParts.push('| Interviewer | Title | Format | Words | Quality |');
    reportParts.push('|-------------|-------|--------|-------|---------|');
    for (const note of notes) {
      const formatLabel = NOTE_FORMAT_LABELS[note.format] ?? note.format;
      const wordCount = note.content.split(/\s+/).filter(Boolean).length;
      reportParts.push(
        `| ${note.interviewer_name} | ${note.interviewer_title} | ${formatLabel} | ${wordCount} | ${note.quality_score ?? 'N/A'}/100 |`,
      );
    }
    reportParts.push('');

    // ── Individual Notes ──
    for (const note of notes) {
      const formatLabel = NOTE_FORMAT_LABELS[note.format] ?? note.format;
      const wordCount = note.content.split(/\s+/).filter(Boolean).length;
      reportParts.push(`## ${note.interviewer_name} — ${formatLabel}`);
      reportParts.push('');
      reportParts.push(`*${note.interviewer_title} | ${wordCount} words | Quality: ${note.quality_score ?? 'N/A'}/100*`);
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

    // ── Quality scoring ──
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
      interviewers_covered: [...new Set(notes.map((n) => n.interviewer_name))],
    });
  },
};

// ─── Exports ───────────────────────────────────────────────────────

export const writerTools: WriterTool[] = [
  analyzeInterviewContextTool,
  writeThankYouNoteTool,
  personalizePerInterviewerTool,
  assembleNoteSetTool,
];
