/**
 * CustomEditArea — Pre-populated textarea for manual bullet editing.
 *
 * The textarea is NEVER blank — it starts with the AI suggestion (or current
 * bullet text when opened from "Write My Own"). The character count guides the
 * user toward a reasonable bullet length. A "Reset to Suggestion" link undoes
 * manual edits when the user wants to restore the AI version.
 */

import { cn } from '@/lib/utils';

export interface CustomEditAreaProps {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
  placeholder?: string;
  disabled?: boolean;
  originalSuggestion?: string;
}

const IDEAL_MAX_CHARS = 200;

export function CustomEditArea({
  value,
  onChange,
  onApply,
  onReset,
  placeholder = 'Write your bullet here…',
  disabled = false,
  originalSuggestion,
}: CustomEditAreaProps) {
  const charCount = value.length;
  const hasEdited = originalSuggestion !== undefined && value !== originalSuggestion;
  const isOverLimit = charCount > IDEAL_MAX_CHARS;

  return (
    <div className="space-y-2">
      {/* Textarea */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          disabled={disabled}
          aria-label="Edit bullet text"
          className={cn(
            'w-full resize-y rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-1',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          style={{
            background: 'var(--surface-1)',
            borderColor: 'var(--line-soft)',
            color: 'var(--text-strong)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--badge-blue-text)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--line-soft)';
          }}
        />
      </div>

      {/* Character count */}
      <p
        className="text-right text-[11px]"
        style={{ color: isOverLimit ? 'var(--badge-amber-text)' : 'var(--text-soft)' }}
        aria-live="polite"
        aria-label={`${charCount} characters`}
      >
        {charCount} chars
        {isOverLimit && (
          <span className="ml-1">(aim for under {IDEAL_MAX_CHARS})</span>
        )}
      </p>

      {/* Actions row */}
      <div className="flex items-center justify-between gap-3">
        {/* Apply button */}
        <button
          type="button"
          onClick={onApply}
          disabled={disabled || !value.trim()}
          className={cn(
            'min-h-[44px] rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2',
            (disabled || !value.trim()) && 'cursor-not-allowed opacity-50',
          )}
          style={{
            background: 'var(--btn-primary-bg)',
            border: '1px solid var(--btn-primary-border)',
            color: 'var(--btn-primary-text)',
          }}
          aria-label="Apply edited bullet to resume"
        >
          Apply to Resume
        </button>

        {/* Reset link — only shown when user has edited */}
        {hasEdited && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className={cn(
              'text-[12px] underline underline-offset-2 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 rounded',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            style={{ color: 'var(--text-soft)' }}
            aria-label="Reset to AI suggestion"
          >
            Reset to suggestion
          </button>
        )}
      </div>
    </div>
  );
}
