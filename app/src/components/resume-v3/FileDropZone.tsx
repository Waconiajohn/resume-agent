/**
 * FileDropZone — drag-drop + browse + paste primitive for v3's intake.
 *
 * Three user affordances in one control:
 *   1. Drop a file onto the dashed tile (or click to browse).
 *   2. Toggle "Or paste text" to reveal a textarea for pasting.
 *   3. Swap a loaded file via the "Change file" button.
 *
 * The caller owns the text value (so validation stays in the parent) and
 * supplies an `extract` function (typically one of the existing helpers
 * at app/src/lib/resume-upload.ts or .../job-description-upload.ts).
 *
 * Styling matches v2's V2IntakeForm dropzones (same Tailwind classes,
 * same CSS-variable palette) so the look is consistent with the rest of
 * the app, with the v3 coral accent applied to the paste toggle to hint
 * "v3 primary action."
 */

import { useCallback, useId, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { GlassTextarea } from '@/components/GlassInput';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

export interface FileDropZoneProps {
  /** Accessible label used internally for aria attributes (e.g. "resume", "job description"). */
  label: string;
  /** Comma-separated extensions for the file input accept attribute. */
  accept: string;
  /** Async parser that returns plaintext from a File. */
  extract: (file: File) => Promise<string>;
  /** Current text value (owned by parent). */
  value: string;
  /** Called when text changes via paste OR file parse. */
  onChange: (next: string) => void;
  /** Notify the parent when a file is loaded or cleared. Optional. */
  onFileNameChange?: (name: string | null) => void;
  disabled?: boolean;
  /** Initial paste-area state. Parent passes true when seeding the form with prior text. */
  defaultPasteOpen?: boolean;
  /** Placeholder for the paste textarea. */
  pastePlaceholder: string;
  /** Textarea rows when paste area is open. */
  pasteRows?: number;
  /** Minimum characters shown as an aria-validation hint below the counter. */
  minChars?: number;
  /** Additional className on the outer wrapper (rare). */
  className?: string;
}

export function FileDropZone({
  label,
  accept,
  extract,
  value,
  onChange,
  onFileNameChange,
  disabled = false,
  defaultPasteOpen = false,
  pastePlaceholder,
  pasteRows = 8,
  minChars = 50,
  className,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState<boolean>(defaultPasteOpen || Boolean(value));

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pasteId = useId();
  const busy = disabled || fileLoading;

  const setFile = useCallback(
    (name: string | null) => {
      setFileName(name);
      onFileNameChange?.(name);
    },
    [onFileNameChange],
  );

  const processFile = useCallback(
    async (file: File) => {
      setFileError(null);
      setFileLoading(true);
      setFile(null);
      try {
        const text = await extract(file);
        if (!text || !text.trim()) {
          setFileError('No readable text found in this file.');
          return;
        }
        onChange(text);
        setFile(file.name);
        // Successful parse collapses the paste area — the file is now authoritative.
        setPasteOpen(false);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'Failed to read file.');
      } finally {
        setFileLoading(false);
      }
    },
    [extract, onChange, setFile],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (busy) return;
      const file = e.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [busy, processFile],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!busy) setIsDragging(true);
  }, [busy]);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!busy) setIsDragging(true);
  }, [busy]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
      // Reset the input so the same file can be picked again after a clear.
      e.target.value = '';
    },
    [processFile],
  );

  const handleClearFile = useCallback(() => {
    setFile(null);
    onChange('');
    setFileError(null);
    setPasteOpen(true);
  }, [onChange, setFile]);

  const handleDropzoneClick = useCallback(() => {
    if (busy) return;
    fileInputRef.current?.click();
  }, [busy]);

  const handleDropzoneKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (busy) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }, [busy]);

  const handlePasteChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      // Typing in the paste area makes the file no longer the authoritative
      // source; clear the filename badge.
      if (fileName) setFile(null);
    },
    [fileName, onChange, setFile],
  );

  const charCount = value.trim().length;
  const hasContent = charCount >= minChars;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Dropzone tile */}
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label={`Drop zone for ${label}. Click or press Enter to browse.`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onClick={handleDropzoneClick}
        onKeyDown={handleDropzoneKeyDown}
        className={cn(
          'relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all duration-200 select-none',
          isDragging
            ? 'border-[var(--bullet-confirm)]/60 bg-[var(--bullet-confirm-bg)] scale-[1.01]'
            : 'border-[var(--line-strong)] bg-[var(--accent-muted)] hover:border-[var(--bullet-confirm)]/40 hover:bg-[var(--bullet-confirm-bg)]',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        {fileLoading ? (
          <>
            <Loader2 className="h-8 w-8 text-[var(--bullet-confirm)] motion-safe:animate-spin" />
            <p className="text-sm text-[var(--text-soft)]">Reading file…</p>
          </>
        ) : fileName ? (
          <>
            <FileText className="h-8 w-8 text-[#4ade80]" />
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-sm font-medium text-[#4ade80]">{fileName}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClearFile(); }}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bullet-confirm)]/40 rounded"
                aria-label={`Remove uploaded ${label} file`}
              >
                <X className="h-3 w-3" />
                Change file
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl border transition-colors duration-200',
              isDragging ? 'border-[var(--bullet-confirm)]/40 bg-[var(--bullet-confirm-bg)]' : 'border-[var(--line-strong)] bg-[var(--surface-1)]',
            )}>
              <Upload className={cn('h-6 w-6 transition-colors duration-200', isDragging ? 'text-[var(--bullet-confirm)]' : 'text-[var(--text-soft)]')} />
            </div>
            <div className="text-center">
              <p className={cn('text-sm font-medium transition-colors duration-200', isDragging ? 'text-[var(--bullet-confirm)]' : 'text-[var(--text-strong)]')}>
                {isDragging ? `Drop your ${label} here` : `Drag your ${label} here`}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                {accept.split(',').map((s) => s.trim()).filter(Boolean).join(', ')} — or{' '}
                <span className="text-[var(--bullet-confirm)] underline-offset-2 hover:underline">click to browse</span>
              </p>
            </div>
          </>
        )}
      </div>

      {fileError && (
        <p className="text-[12px] text-[var(--badge-red-text)]" role="alert">
          {fileError}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileInputChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Paste toggle */}
      <button
        type="button"
        onClick={() => setPasteOpen((o) => !o)}
        disabled={disabled}
        className="flex w-full items-center gap-2 py-1 text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bullet-confirm)]/40 rounded disabled:opacity-50 disabled:pointer-events-none"
        aria-expanded={pasteOpen}
        aria-controls={pasteId}
      >
        <div className="flex-1 border-t border-[var(--line-soft)]" />
        <span className="shrink-0">{pasteOpen ? 'Hide paste area' : 'Or paste text'}</span>
        {pasteOpen ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
        <div className="flex-1 border-t border-[var(--line-soft)]" />
      </button>

      {pasteOpen && (
        <div id={pasteId} className="space-y-1.5">
          <GlassTextarea
            value={value}
            onChange={handlePasteChange}
            placeholder={pastePlaceholder}
            rows={pasteRows}
            disabled={disabled}
            aria-label={`${label} text`}
            className="font-mono text-[13px] leading-relaxed"
          />
          <div className="flex justify-end">
            <span className="text-[11px] text-[var(--text-soft)]">
              {charCount.toLocaleString()} characters
              {!hasContent && charCount > 0 && (
                <span className="text-[var(--badge-red-text)] ml-2">
                  (at least {minChars} required)
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {!pasteOpen && charCount > 0 && (
        <div className="flex justify-end">
          <span className="text-[11px] text-[var(--text-soft)]">
            {charCount.toLocaleString()} characters
          </span>
        </div>
      )}
    </div>
  );
}
