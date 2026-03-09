import { useState, useCallback, useRef } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import type { CsvUploadSummary } from '@/types/ni';

export interface CsvUploaderProps {
  accessToken: string | null;
  onUploadComplete: (summary: CsvUploadSummary) => void;
}

type UploadState = 'idle' | 'dragging' | 'uploading' | 'complete' | 'error';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function CsvUploader({ accessToken, onUploadComplete }: CsvUploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setErrorMessage(data.error ?? `Upload failed (${res.status})`);
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
    setState('idle');
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState('dragging');
  }, []);

  const handleDragLeave = useCallback(() => {
    setState('idle');
  }, []);

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
        state === 'dragging' && 'border-[#afc4ff]/50 bg-[#afc4ff]/[0.05]',
        state === 'error' && 'border-[#f0b8b8]/30',
        state === 'complete' && 'border-[#b5dec2]/30',
        state !== 'dragging' && state !== 'error' && state !== 'complete' && 'border-white/10',
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => state !== 'uploading' && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {state === 'idle' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-white/70">
            Drop your LinkedIn Connections CSV here
          </p>
          <p className="text-xs text-white/40">
            or click to browse — .csv files only, max 5MB
          </p>
        </div>
      )}

      {state === 'dragging' && (
        <p className="text-sm font-medium text-[#afc4ff]/80">Drop to upload</p>
      )}

      {state === 'uploading' && (
        <div className="space-y-2">
          <div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-white/10">
            <div className="h-full motion-safe:animate-pulse rounded-full bg-[#afc4ff]/60" style={{ width: '60%' }} />
          </div>
          <p className="text-sm text-white/60">
            Uploading {fileName}...
          </p>
        </div>
      )}

      {state === 'complete' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#b5dec2]/80">Upload complete</p>
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
          <p className="text-sm text-[#f0b8b8]/80">{errorMessage}</p>
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
