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
      <span className={cn('text-white/80', !value && 'italic text-white/30', className)}>
        {value || placeholder || '—'}
      </span>
    );
  }

  const sharedClass = cn(
    'w-full rounded-lg border border-white/[0.12] bg-white/[0.05] px-2 py-1 text-sm text-white/90 placeholder-white/30 outline-none focus:border-white/[0.24] focus:bg-white/[0.08]',
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
