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

/** Context about the job requirement this edit addresses */
export interface EditContext {
  requirement?: string;
  evidence?: string[];
  strategy?: string;
  origin?: 'gap' | 'final_review' | 'manual';
  scoreDomain?: 'job_description' | 'benchmark' | 'both';
  candidateInputUsed?: boolean;
  finalReviewConcernId?: string;
  finalReviewConcernSeverity?: 'critical' | 'moderate' | 'minor';
}

export interface PendingEdit {
  section: string;
  originalText: string;
  replacement: string;
  action: EditAction;
  /** Context about the requirement this edit addresses (shown in DiffView) */
  editContext?: EditContext;
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
    editContext?: EditContext,
  ) => {
    if (!accessToken || !sessionId || !resume || isEditing) return;

    setIsEditing(true);
    setEditError(null);
    setPendingEdit(null);

    try {
      const fullContext = resumeToPlainText(resume);
      // Build section-only context when possible (much smaller than full resume)
      const sectionContext = extractSectionContext(resume, section);

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
          section_context: sectionContext ?? undefined,
          edit_context: editContext ?? undefined,
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
        editContext,
      });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Edit failed');
    } finally {
      setIsEditing(false);
    }
  }, [accessToken, sessionId, resume, isEditing, jobDescription]);

  const acceptEdit = useCallback((editedReplacement?: string) => {
    if (!pendingEdit || !resume) return;

    // Push current state to undo stack
    undoStack.current.push({ resume: structuredClone(resume), description: `${pendingEdit.action} in ${pendingEdit.section}` });
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
    setUndoCount(undoStack.current.length);
    setRedoCount(0);

    // Apply the edit
    const replacement = editedReplacement !== undefined ? editedReplacement : pendingEdit.replacement;
    const updated = applyTextReplacement(resume, pendingEdit, replacement);
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
export function resumeToPlainText(r: ResumeDraft): string {
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

  if (r.certifications?.length) {
    parts.push('');
    parts.push('CERTIFICATIONS:');
    parts.push(r.certifications.join(', '));
  }

  return parts.join('\n');
}

/** Extract only the relevant section context (reduces ~5K tokens to ~500) */
function extractSectionContext(r: ResumeDraft, section: string): string | null {
  const sectionLower = section.toLowerCase();

  // Executive Summary
  if (sectionLower.includes('executive summary') || sectionLower.includes('summary')) {
    return `EXECUTIVE SUMMARY:\n${r.executive_summary.content}`;
  }

  // Core Competencies
  if (sectionLower.includes('core competencies') || sectionLower.includes('competencies')) {
    return `CORE COMPETENCIES:\n${r.core_competencies.join(', ')}`;
  }

  // Selected Accomplishments
  if (sectionLower.includes('selected accomplishments') || sectionLower.includes('accomplishments')) {
    return `SELECTED ACCOMPLISHMENTS:\n${r.selected_accomplishments.map(a => `- ${a.content}`).join('\n')}`;
  }

  // Professional Experience — match by company name
  for (const exp of r.professional_experience) {
    if (sectionLower.includes(exp.company.toLowerCase())) {
      const lines = [
        `${exp.title} | ${exp.company} (${exp.start_date} - ${exp.end_date})`,
        exp.scope_statement,
        ...exp.bullets.map(b => `- ${b.text}`),
      ];
      return `PROFESSIONAL EXPERIENCE:\n${lines.join('\n')}`;
    }
  }

  // Education
  if (sectionLower.includes('education')) {
    return `EDUCATION:\n${r.education.map(edu => `${edu.degree} - ${edu.institution}${edu.year ? ` (${edu.year})` : ''}`).join('\n')}`;
  }

  // Certifications
  if (sectionLower.includes('certification') && r.certifications?.length) {
    return `CERTIFICATIONS:\n${r.certifications.join(', ')}`;
  }

  // No match — return null, full context will be used
  return null;
}

/** Apply a targeted text replacement and preserve provenance metadata */
function applyTextReplacement(resume: ResumeDraft, pendingEdit: PendingEdit, newText: string): ResumeDraft {
  const requirement = pendingEdit.editContext?.requirement;
  const requirementTag = requirement?.trim();
  const sectionLower = pendingEdit.section.toLowerCase();
  const oldText = pendingEdit.originalText;

  const addRequirement = (requirements: string[]): string[] => {
    if (!requirementTag) return requirements;
    return requirements.includes(requirementTag) ? requirements : [...requirements, requirementTag];
  };

  const markEditedText = (value: string) => value === oldText ? newText : value;

  if (sectionLower.includes('executive summary') || sectionLower.includes('summary')) {
    if (resume.executive_summary.content === oldText) {
      return {
        ...resume,
        executive_summary: {
          ...resume.executive_summary,
          content: newText,
          is_new: true,
          addresses_requirements: addRequirement(resume.executive_summary.addresses_requirements ?? []),
        },
      };
    }
  }

  if (sectionLower.includes('selected accomplishments') || sectionLower.includes('accomplishments')) {
    return {
      ...resume,
      selected_accomplishments: resume.selected_accomplishments.map((accomplishment) => (
        accomplishment.content === oldText
          ? {
              ...accomplishment,
              content: newText,
              is_new: true,
              addresses_requirements: addRequirement(accomplishment.addresses_requirements),
            }
          : accomplishment
      )),
    };
  }

  if (sectionLower.includes('professional experience')) {
    return {
      ...resume,
      professional_experience: resume.professional_experience.map((experience) => {
        const matchesSection = sectionLower.includes(experience.company.toLowerCase()) || sectionLower === 'professional_experience';
        if (!matchesSection) return experience;

        if (experience.scope_statement === oldText) {
          return {
            ...experience,
            scope_statement: newText,
            scope_statement_is_new: true,
            scope_statement_addresses_requirements: addRequirement(experience.scope_statement_addresses_requirements ?? []),
          };
        }

        return {
          ...experience,
          bullets: experience.bullets.map((bullet) => (
            bullet.text === oldText
              ? {
                  ...bullet,
                  text: newText,
                  is_new: true,
                  addresses_requirements: addRequirement(bullet.addresses_requirements),
                }
              : bullet
          )),
        };
      }),
    };
  }

  return {
    ...resume,
    header: {
      ...resume.header,
      branded_title: markEditedText(resume.header.branded_title),
    },
    executive_summary: {
      ...resume.executive_summary,
      content: markEditedText(resume.executive_summary.content),
      is_new: resume.executive_summary.content === oldText ? true : resume.executive_summary.is_new,
      addresses_requirements: resume.executive_summary.content === oldText
        ? addRequirement(resume.executive_summary.addresses_requirements ?? [])
        : resume.executive_summary.addresses_requirements,
    },
    core_competencies: resume.core_competencies.map(markEditedText),
    selected_accomplishments: resume.selected_accomplishments.map((accomplishment) => (
      accomplishment.content === oldText
        ? {
            ...accomplishment,
            content: newText,
            is_new: true,
            addresses_requirements: addRequirement(accomplishment.addresses_requirements),
          }
        : accomplishment
    )),
    professional_experience: resume.professional_experience.map((experience) => ({
      ...experience,
      scope_statement: experience.scope_statement === oldText ? newText : experience.scope_statement,
      scope_statement_is_new: experience.scope_statement === oldText ? true : experience.scope_statement_is_new,
      scope_statement_addresses_requirements: experience.scope_statement === oldText
        ? addRequirement(experience.scope_statement_addresses_requirements ?? [])
        : experience.scope_statement_addresses_requirements,
      bullets: experience.bullets.map((bullet) => (
        bullet.text === oldText
          ? {
              ...bullet,
              text: newText,
              is_new: true,
              addresses_requirements: addRequirement(bullet.addresses_requirements),
            }
          : bullet
      )),
    })),
    education: resume.education.map((education) => ({
      ...education,
      degree: markEditedText(education.degree),
      institution: markEditedText(education.institution),
    })),
    certifications: resume.certifications.map(markEditedText),
  };
}
