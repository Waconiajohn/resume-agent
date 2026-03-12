/**
 * useInlineEdit — Manages inline AI editing state for the v2 resume
 *
 * Handles:
 * - API calls to the edit endpoint
 * - Pending edit state (original + replacement)
 * - Undo/redo stack (25 deep)
 * - Resume text mutation after accepting edits
 */

import { useState, useCallback, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import type { ResumeDraft } from '@/types/resume-v2';

export type EditAction = 'strengthen' | 'add_metrics' | 'shorten' | 'add_keywords' | 'rewrite' | 'custom' | 'not_my_voice';

export interface PendingEdit {
  section: string;
  originalText: string;
  replacement: string;
  action: EditAction;
}

interface UndoEntry {
  resume: ResumeDraft;
  description: string;
}

const MAX_UNDO = 25;

export function useInlineEdit(
  accessToken: string | null,
  sessionId: string,
  resume: ResumeDraft | null,
  jobDescription: string,
  onResumeUpdate: (resume: ResumeDraft) => void,
) {
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const requestEdit = useCallback(async (
    selectedText: string,
    section: string,
    action: EditAction,
    customInstruction?: string,
  ) => {
    if (!accessToken || !sessionId || !resume || isEditing) return;

    setIsEditing(true);
    setEditError(null);
    setPendingEdit(null);

    try {
      const fullContext = resumeToPlainText(resume);
      const response = await fetch(`${API_BASE}/pipeline/${sessionId}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action,
          selected_text: selectedText,
          section,
          full_resume_context: fullContext,
          job_description: jobDescription,
          custom_instruction: customInstruction,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Edit failed: ${response.status}`);
      }

      const result = (await response.json()) as { replacement: string };
      setPendingEdit({
        section,
        originalText: selectedText,
        replacement: result.replacement,
        action,
      });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Edit failed');
    } finally {
      setIsEditing(false);
    }
  }, [accessToken, sessionId, resume, isEditing, jobDescription]);

  const acceptEdit = useCallback(() => {
    if (!pendingEdit || !resume) return;

    // Push current state to undo stack
    undoStack.current.push({ resume: structuredClone(resume), description: `${pendingEdit.action} in ${pendingEdit.section}` });
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
    setUndoCount(undoStack.current.length);
    setRedoCount(0);

    // Apply the edit
    const updated = applyTextReplacement(resume, pendingEdit.originalText, pendingEdit.replacement);
    onResumeUpdate(updated);
    setPendingEdit(null);
  }, [pendingEdit, resume, onResumeUpdate]);

  const rejectEdit = useCallback(() => {
    setPendingEdit(null);
    setEditError(null);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0 || !resume) return;
    const entry = undoStack.current.pop()!;
    redoStack.current.push({ resume: structuredClone(resume), description: entry.description });
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    onResumeUpdate(entry.resume);
  }, [resume, onResumeUpdate]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0 || !resume) return;
    const entry = redoStack.current.pop()!;
    undoStack.current.push({ resume: structuredClone(resume), description: entry.description });
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
    onResumeUpdate(entry.resume);
  }, [resume, onResumeUpdate]);

  const resetHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setUndoCount(0);
    setRedoCount(0);
  }, []);

  return {
    pendingEdit,
    isEditing,
    editError,
    undoCount,
    redoCount,
    requestEdit,
    acceptEdit,
    rejectEdit,
    undo,
    redo,
    resetHistory,
  };
}

/** Convert structured resume to plain text for LLM context */
function resumeToPlainText(r: ResumeDraft): string {
  const parts: string[] = [
    `${r.header.name} | ${r.header.branded_title}`,
    r.header.email,
    '',
    'EXECUTIVE SUMMARY:',
    r.executive_summary.content,
    '',
    'CORE COMPETENCIES:',
    r.core_competencies.join(', '),
    '',
    'SELECTED ACCOMPLISHMENTS:',
    ...r.selected_accomplishments.map(a => `- ${a.content}`),
    '',
    'PROFESSIONAL EXPERIENCE:',
  ];

  for (const exp of r.professional_experience) {
    parts.push(`${exp.title} | ${exp.company} (${exp.start_date} - ${exp.end_date})`);
    parts.push(exp.scope_statement);
    for (const b of exp.bullets) {
      parts.push(`- ${b.text}`);
    }
    parts.push('');
  }

  if (r.earlier_career?.length) {
    parts.push('EARLIER CAREER:');
    for (const ec of r.earlier_career) {
      parts.push(`${ec.title} | ${ec.company} (${ec.dates})`);
    }
    parts.push('');
  }

  if (r.education.length) {
    parts.push('EDUCATION:');
    for (const edu of r.education) {
      parts.push(`${edu.degree} - ${edu.institution}${edu.year ? ` (${edu.year})` : ''}`);
    }
  }

  return parts.join('\n');
}

/** Apply a text replacement across all string fields in the resume */
function applyTextReplacement(resume: ResumeDraft, oldText: string, newText: string): ResumeDraft {
  const replace = (s: string) => s.includes(oldText) ? s.replaceAll(oldText, newText) : s;

  return {
    ...resume,
    executive_summary: {
      ...resume.executive_summary,
      content: replace(resume.executive_summary.content),
    },
    selected_accomplishments: resume.selected_accomplishments.map(a => ({
      ...a,
      content: replace(a.content),
    })),
    professional_experience: resume.professional_experience.map(exp => ({
      ...exp,
      scope_statement: replace(exp.scope_statement),
      bullets: exp.bullets.map(b => ({
        ...b,
        text: replace(b.text),
      })),
    })),
  };
}
