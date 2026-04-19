/**
 * EditableText — click-to-edit inline text primitive.
 *
 * Default state: renders as a span matching normal body typography.
 * Click: converts to a textarea with the same text, auto-grows to
 * content. Blur or Escape: commits edit back via onChange. Shift+Enter
 * inserts newline; Enter without shift commits.
 *
 * Used for v3 bullet text, summary paragraph, and accomplishment items.
 * Keeps the rendered resume looking like prose, not a form.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface EditableTextProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  /** Allow newlines via Shift+Enter (for summary). Bullets default to single-line commit. */
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function EditableText({
  value,
  onChange,
  className,
  multiline = false,
  disabled = false,
  placeholder,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep draft synced when value changes externally (e.g. pipeline re-run).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Auto-grow textarea + focus on enter-edit-mode.
  useEffect(() => {
    if (!editing || !textareaRef.current) return;
    const el = textareaRef.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing]);

  const commit = () => {
    const next = draft;
    setEditing(false);
    if (next !== value) onChange(next);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      commit();
    }
  };

  const handleChange = (next: string) => {
    setDraft(next);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  if (editing && !disabled) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        rows={multiline ? 3 : 1}
        placeholder={placeholder}
        className={cn(
          'w-full resize-none bg-[var(--bullet-confirm-bg)] border border-[var(--bullet-confirm-border)] rounded-[6px] px-2 py-1 leading-relaxed',
          'focus:border-[var(--bullet-confirm)] focus:outline-none focus:ring-1 focus:ring-[var(--bullet-confirm)]/40',
          className,
        )}
      />
    );
  }

  return (
    <span
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && setEditing(true)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        !disabled && 'cursor-text rounded-[4px] hover:bg-[var(--surface-2)]/40 transition-colors',
        !disabled && 'focus:outline-none focus:ring-1 focus:ring-[var(--bullet-confirm)]/40',
        className,
      )}
    >
      {value || (placeholder ? <span className="text-[var(--text-soft)] italic">{placeholder}</span> : '')}
    </span>
  );
}
