import { useState, useCallback, useRef } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import type { CsvUploadSummary } from '@/types/ni';

export interface CsvUploaderProps {
  accessToken: string | null;
  authLoading?: boolean;
  onUploadComplete: (summary: CsvUploadSummary) => void;
}

type UploadState = 'idle' | 'dragging' | 'uploading' | 'complete' | 'error';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function CsvUploader({ accessToken, authLoading = false, onUploadComplete }: CsvUploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const isInteractive = !authLoading && !!accessToken && state !== 'uploading';

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setState('error');
      setErrorMessage('Please upload a .csv file');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setState('error');
      setErrorMessage('File too large (max 5MB)');
      return;
    }

    if (!accessToken) {
      setState('error');
      setErrorMessage('Not authenticated');
      return;
    }

    setFileName(file.name);
    setState('uploading');
    setErrorMessage(null);

    try {
      const csvText = await file.text();

      const res = await fetch(`${API_BASE}/ni/csv/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ csv_text: csvText, file_name: file.name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState('error');
        const detail = data.errors?.length
          ? `: ${data.errors.map((e: { message: string }) => e.message).join('; ')}`
          : '';
        setErrorMessage(data.error ?? `Upload failed (${res.status})${detail}`);
        return;
      }

      setState('complete');
      onUploadComplete({
        totalRows: data.totalRows,
        validRows: data.validRows,
        skippedRows: data.skippedRows,
        duplicatesRemoved: data.duplicatesRemoved,
        uniqueCompanies: data.uniqueCompanies,
        errors: data.errors ?? [],
      });
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [accessToken, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setState('idle');
    if (!isInteractive) return;
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }, [isInteractive, processFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInteractive) return;
    dragDepthRef.current += 1;
    setState('dragging');
  }, [isInteractive]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInteractive) return;
    e.dataTransfer.dropEffect = 'copy';
    setState('dragging');
  }, [isInteractive]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInteractive) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setState('idle');
    }
  }, [isInteractive]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  }, [processFile]);

  const handleReset = useCallback(() => {
    setState('idle');
    setErrorMessage(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  return (
    <GlassCard
      className={cn(
        'relative cursor-pointer border-2 border-dashed p-8 text-center transition-colors',
        state === 'dragging' && 'border-[var(--link)]/50 bg-[var(--badge-blue-bg)]',
        state === 'error' && 'border-[var(--badge-red-text)]/30',
        state === 'complete' && 'border-[var(--badge-green-text)]/30',
        !isInteractive && 'cursor-default opacity-80',
        state !== 'dragging' && state !== 'error' && state !== 'complete' && 'border-[var(--line-soft)]',
      )}
      aria-disabled={!isInteractive}
      aria-label="Upload LinkedIn connections CSV"
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => isInteractive && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {authLoading && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-muted)]">
            Preparing secure upload...
          </p>
          <p className="text-xs text-[var(--text-soft)]">
            We&apos;re connecting your session before import.
          </p>
        </div>
      )}

      {!authLoading && !accessToken && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-muted)]">
            Sign in required
          </p>
          <p className="text-xs text-[var(--text-soft)]">
            Please refresh your session before importing LinkedIn connections.
          </p>
        </div>
      )}

      {!authLoading && accessToken && state === 'idle' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-muted)]">
            Drop your LinkedIn Connections CSV here
          </p>
          <p className="text-xs text-[var(--text-soft)]">
            or click to browse — .csv files only, max 5MB
          </p>
        </div>
      )}

      {state === 'dragging' && (
        <p className="text-sm font-medium text-[var(--link)]/80">Drop to upload</p>
      )}

      {state === 'uploading' && (
        <div className="space-y-2">
          <div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-[var(--line-soft)]">
            <div className="h-full motion-safe:animate-pulse rounded-full bg-[var(--link)]/60" style={{ width: '60%' }} />
          </div>
          <p className="text-sm text-[var(--text-soft)]">
            Uploading {fileName}...
          </p>
        </div>
      )}

      {state === 'complete' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--badge-green-text)]/80">Upload complete</p>
          <GlassButton
            variant="ghost"
            className="text-xs"
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
          >
            Upload another
          </GlassButton>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--badge-red-text)]/80">{errorMessage}</p>
          <GlassButton
            variant="ghost"
            className="text-xs"
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
          >
            Try again
          </GlassButton>
        </div>
      )}
    </GlassCard>
  );
}
