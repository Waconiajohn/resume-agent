import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface EditableFieldProps {
  value: string;
  onSave: (newValue: string) => void;
  isEditing: boolean;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}

export function EditableField({
  value,
  onSave,
  isEditing,
  placeholder,
  multiline = false,
  className,
}: EditableFieldProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleBlur = () => {
    if (draft !== value) {
      onSave(draft);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
      handleBlur();
      (inputRef.current as HTMLElement)?.blur();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      (inputRef.current as HTMLElement)?.blur();
    }
  };

  if (!isEditing) {
    return (
      <span className={cn('text-[var(--text-muted)]', !value && 'italic text-[var(--text-soft)]', className)}>
        {value || placeholder || '—'}
      </span>
    );
  }

  const sharedClass = cn(
    'w-full rounded-lg border border-[var(--line-soft)] bg-[var(--surface-1)] px-2 py-1 text-sm text-[var(--text-strong)] placeholder-[var(--text-soft)] outline-none focus:border-[var(--line-strong)] focus:bg-[var(--surface-2)]',
    className,
  );

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={4}
        className={cn(sharedClass, 'resize-y')}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={sharedClass}
    />
  );
}
