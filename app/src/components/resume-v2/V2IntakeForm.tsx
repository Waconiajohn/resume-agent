import { useState, useRef, useCallback, useId } from 'react';
import { ArrowLeft, FileText, Link, Upload, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { GlassCard } from '../GlassCard';
import { GlassButton } from '../GlassButton';
import { GlassInput, GlassTextarea } from '../GlassInput';
import { cn } from '@/lib/utils';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';
import { extractJobDescriptionTextFromUpload } from '@/lib/job-description-upload';

interface V2IntakeFormProps {
  onSubmit: (resumeText: string, jobDescription: string) => void;
  onBack?: () => void;
  loading?: boolean;
  error?: string | null;
  initialResumeText?: string;
}

const MIN_CHARS = 50;

function CharCounter({ value, label }: { value: string; label: string }) {
  const len = value.trim().length;
  const met = len >= MIN_CHARS;
  const remaining = MIN_CHARS - len;
  return (
    <p
      className={cn(
        'text-[12px] transition-colors duration-200',
        met ? 'text-[#b5dec2]/60' : 'text-[#f0b8b8]/60',
      )}
      aria-live="polite"
    >
      {met ? (
        <>
          <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" />
          {label} ready
        </>
      ) : len > 0 ? (
        `${remaining} more character${remaining === 1 ? '' : 's'} needed`
      ) : null}
    </p>
  );
}

// ---- Resume Drop Zone ----

interface ResumeDropZoneProps {
  resumeText: string;
  onResumeTextChange: (text: string) => void;
  loading: boolean;
  initialResumeText?: string;
}

function ResumeDropZone({ resumeText, onResumeTextChange, loading, initialResumeText }: ResumeDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(() => Boolean(initialResumeText?.trim()));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteId = useId();

  const processFile = useCallback(async (file: File) => {
    setFileError(null);
    setFileLoading(true);
    setFileName(null);
    try {
      const text = await extractResumeTextFromUpload(file);
      if (!text) {
        setFileError('No readable text found in this file.');
        return;
      }
      onResumeTextChange(text);
      setFileName(file.name);
      // If a file is successfully loaded, collapse the paste area
      setPasteOpen(false);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to read file.');
    } finally {
      setFileLoading(false);
    }
  }, [onResumeTextChange]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = '';
  }, [processFile]);

  const handleClearFile = useCallback(() => {
    setFileName(null);
    onResumeTextChange('');
    setFileError(null);
    setPasteOpen(true);
  }, [onResumeTextChange]);

  const hasContent = resumeText.trim().length >= MIN_CHARS;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={loading || fileLoading ? -1 : 0}
        aria-label="Drop zone for resume file. Click to browse."
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onClick={() => !loading && !fileLoading && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !loading && !fileLoading) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={cn(
          'relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all duration-200 select-none',
          isDragging
            ? 'border-[#afc4ff]/60 bg-[#afc4ff]/10 scale-[1.01]'
            : 'border-[var(--line-strong)] bg-[var(--accent-muted)] hover:border-[#afc4ff]/40 hover:bg-[#afc4ff]/[0.04]',
          (loading || fileLoading) && 'pointer-events-none opacity-60',
        )}
      >
        {fileLoading ? (
          <>
            <Loader2 className="h-8 w-8 text-[#afc4ff] motion-safe:animate-spin" />
            <p className="text-sm text-[var(--text-soft)]">Reading file...</p>
          </>
        ) : fileName ? (
          <>
            <FileText className="h-8 w-8 text-[#4ade80]" />
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-sm font-medium text-[#4ade80]">{fileName}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClearFile(); }}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 rounded"
                aria-label="Remove uploaded file"
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
              isDragging ? 'border-[#afc4ff]/40 bg-[#afc4ff]/10' : 'border-[var(--line-strong)] bg-[var(--surface-1)]',
            )}>
              <Upload className={cn('h-6 w-6 transition-colors duration-200', isDragging ? 'text-[#afc4ff]' : 'text-[var(--text-soft)]')} />
            </div>
            <div className="text-center">
              <p className={cn('text-sm font-medium transition-colors duration-200', isDragging ? 'text-[#afc4ff]' : 'text-[var(--text-strong)]')}>
                {isDragging ? 'Drop your resume here' : 'Drag your resume here'}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                .docx, .pdf, or .txt — or{' '}
                <span className="text-[#afc4ff] underline-offset-2 hover:underline">click to browse</span>
              </p>
            </div>
          </>
        )}
      </div>

      {fileError && (
        <p className="text-[12px] text-[#f0b8b8]" role="alert">{fileError}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.docx,.pdf"
        className="hidden"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Paste toggle */}
      <button
        type="button"
        onClick={() => setPasteOpen((o) => !o)}
        disabled={loading}
        className="flex w-full items-center gap-2 py-1 text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 rounded disabled:opacity-50 disabled:pointer-events-none"
        aria-expanded={pasteOpen}
        aria-controls={pasteId}
      >
        <div className="flex-1 border-t border-[var(--line-soft)]" />
        <span className="shrink-0">
          {pasteOpen ? 'Hide paste area' : 'Or paste text'}
        </span>
        {pasteOpen ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
        <div className="flex-1 border-t border-[var(--line-soft)]" />
      </button>

      {pasteOpen && (
        <div id={pasteId} className="space-y-1.5">
          <GlassTextarea
            id="v2-resume"
            value={resumeText}
            onChange={(e) => {
              onResumeTextChange(e.target.value);
              if (fileName) setFileName(null);
            }}
            placeholder="Paste your current resume here — we'll identify your strengths and hidden accomplishments..."
            rows={8}
            disabled={loading}
            aria-required="true"
            aria-label="Resume text"
            className="min-h-[160px] resize-y bg-[var(--accent-muted)] border-[var(--line-soft)] focus:border-[#afc4ff]/30 focus:ring-1 focus:ring-[#afc4ff]/20 text-[var(--text-strong)] placeholder:text-[var(--text-soft)]"
          />
          <div className="flex justify-end">
            <CharCounter value={resumeText} label="Resume" />
          </div>
        </div>
      )}

      {!pasteOpen && hasContent && (
        <div className="flex justify-end">
          <CharCounter value={resumeText} label="Resume" />
        </div>
      )}
    </div>
  );
}

// ---- Job Description Drop Zone ----

interface JdDropZoneProps {
  jobDescription: string;
  onJobDescriptionChange: (text: string) => void;
  loading: boolean;
  fileName: string | null;
  onFileLoaded: (text: string, name: string) => void;
  onFileClear: () => void;
}

function JdDropZone({ jobDescription: _jobDescription, onJobDescriptionChange, loading, fileName, onFileLoaded, onFileClear }: JdDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setFileError(null);
    setFileLoading(true);
    try {
      const text = await extractJobDescriptionTextFromUpload(file);
      if (!text) {
        setFileError('No readable text found in this file.');
        return;
      }
      onJobDescriptionChange(text);
      onFileLoaded(text, file.name);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to read file.');
    } finally {
      setFileLoading(false);
    }
  }, [onJobDescriptionChange, onFileLoaded]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = '';
  }, [processFile]);

  const handleClearFile = useCallback(() => {
    onFileClear();
    setFileError(null);
  }, [onFileClear]);

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={loading || fileLoading ? -1 : 0}
        aria-label="Drop zone for job description file. Click to browse."
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onClick={() => !loading && !fileLoading && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !loading && !fileLoading) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={cn(
          'relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all duration-200 select-none',
          isDragging
            ? 'border-[#afc4ff]/60 bg-[#afc4ff]/10 scale-[1.01]'
            : 'border-[var(--line-strong)] bg-[var(--accent-muted)] hover:border-[#afc4ff]/40 hover:bg-[#afc4ff]/[0.04]',
          (loading || fileLoading) && 'pointer-events-none opacity-60',
        )}
      >
        {fileLoading ? (
          <>
            <Loader2 className="h-8 w-8 text-[#afc4ff] motion-safe:animate-spin" />
            <p className="text-sm text-[var(--text-soft)]">Reading file...</p>
          </>
        ) : fileName ? (
          <>
            <FileText className="h-8 w-8 text-[#4ade80]" />
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-sm font-medium text-[#4ade80]">{fileName}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClearFile(); }}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 rounded"
                aria-label="Remove uploaded job description file"
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
              isDragging ? 'border-[#afc4ff]/40 bg-[#afc4ff]/10' : 'border-[var(--line-strong)] bg-[var(--surface-1)]',
            )}>
              <Upload className={cn('h-6 w-6 transition-colors duration-200', isDragging ? 'text-[#afc4ff]' : 'text-[var(--text-soft)]')} />
            </div>
            <div className="text-center">
              <p className={cn('text-sm font-medium transition-colors duration-200', isDragging ? 'text-[#afc4ff]' : 'text-[var(--text-strong)]')}>
                {isDragging ? 'Drop the job description here' : 'Drag the job description here'}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                .pdf, .docx, or .txt — or{' '}
                <span className="text-[#afc4ff] underline-offset-2 hover:underline">click to browse</span>
              </p>
            </div>
          </>
        )}
      </div>

      {fileError && (
        <p className="text-[12px] text-[#f0b8b8]" role="alert">{fileError}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.docx,.pdf,.html,.htm"
        className="hidden"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

// ---- Job Description Section ----

interface JdSectionProps {
  jobDescription: string;
  onJobDescriptionChange: (text: string) => void;
  loading: boolean;
}

function JdSection({ jobDescription, onJobDescriptionChange, loading }: JdSectionProps) {
  const [jdUrl, setJdUrl] = useState('');
  const [jdFileName, setJdFileName] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const urlId = useId();
  const pasteId = useId();

  const handleFileLoaded = useCallback((text: string, name: string) => {
    onJobDescriptionChange(text);
    setJdFileName(name);
    setJdUrl('');
    setPasteOpen(false);
  }, [onJobDescriptionChange]);

  const handleFileClear = useCallback(() => {
    setJdFileName(null);
    onJobDescriptionChange('');
    setPasteOpen(true);
  }, [onJobDescriptionChange]);

  // When a URL is entered, use it as the job description value
  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setJdUrl(url);
    setJdFileName(null);
    if (url.trim()) {
      onJobDescriptionChange(url.trim());
    } else {
      onJobDescriptionChange('');
    }
  }, [onJobDescriptionChange]);

  // When paste textarea changes, clear the URL field and file
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onJobDescriptionChange(e.target.value);
    if (jdUrl) setJdUrl('');
    if (jdFileName) setJdFileName(null);
  }, [onJobDescriptionChange, jdUrl, jdFileName]);

  // Effective value for char counter
  const effectiveValue = jdUrl.trim() ? jdUrl : jobDescription;

  return (
    <div className="space-y-3">
      {/* URL input */}
      <div className="space-y-1.5">
        <label htmlFor={urlId} className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          <Link className="h-3.5 w-3.5 text-[#afc4ff]" />
          Paste job posting URL
        </label>
        <GlassInput
          id={urlId}
          type="url"
          value={jdUrl}
          onChange={handleUrlChange}
          placeholder="https://example.com/jobs/..."
          disabled={loading}
          aria-label="Job posting URL"
        />
        {jdUrl.trim().length > 0 && (
          <p className="text-[11px] text-[var(--text-soft)]">
            We'll extract the job details from this URL.
          </p>
        )}
      </div>

      {/* Drag-drop zone */}
      {!jdUrl.trim() && (
        <JdDropZone
          jobDescription={jobDescription}
          onJobDescriptionChange={onJobDescriptionChange}
          loading={loading}
          fileName={jdFileName}
          onFileLoaded={handleFileLoaded}
          onFileClear={handleFileClear}
        />
      )}

      {/* Paste toggle */}
      {!jdUrl.trim() && (
        <button
          type="button"
          onClick={() => setPasteOpen((o) => !o)}
          disabled={loading}
          className="flex w-full items-center gap-2 py-1 text-xs text-[var(--text-soft)] hover:text-[var(--text-muted)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40 rounded disabled:opacity-50 disabled:pointer-events-none"
          aria-expanded={pasteOpen}
          aria-controls={pasteId}
        >
          <div className="flex-1 border-t border-[var(--line-soft)]" />
          <span className="shrink-0">
            {pasteOpen ? 'Hide paste area' : 'Or paste text'}
          </span>
          {pasteOpen ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
          <div className="flex-1 border-t border-[var(--line-soft)]" />
        </button>
      )}

      {pasteOpen && !jdUrl.trim() && (
        <div id={pasteId} className="space-y-1.5">
          <GlassTextarea
            id={pasteId}
            value={jobDescription}
            onChange={handleTextChange}
            placeholder="Paste the job description here — we'll analyze every requirement and position you strategically..."
            rows={7}
            disabled={loading}
            aria-required="true"
            aria-label="Job description text"
            className="min-h-[140px] resize-y bg-[var(--accent-muted)] border-[var(--line-soft)] focus:border-[#afc4ff]/30 focus:ring-1 focus:ring-[#afc4ff]/20 text-[var(--text-strong)] placeholder:text-[var(--text-soft)]"
          />
        </div>
      )}

      {/* Char counter */}
      {effectiveValue.trim().length > 0 && (
        <div className="flex justify-end">
          <CharCounter value={effectiveValue} label="Job description" />
        </div>
      )}
    </div>
  );
}

// ---- Main Form ----

export function V2IntakeForm({ onSubmit, onBack, loading = false, error, initialResumeText }: V2IntakeFormProps) {
  const [resumeText, setResumeText] = useState(initialResumeText ?? '');
  const [jobDescription, setJobDescription] = useState('');

  const isValid = resumeText.trim().length >= MIN_CHARS && jobDescription.trim().length >= MIN_CHARS;

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    onSubmit(resumeText.trim(), jobDescription.trim());
  }, [isValid, loading, onSubmit, resumeText, jobDescription]);

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-300/[0.07] via-transparent to-transparent" />

      {onBack && (
        <div className="relative z-10 px-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium text-[var(--text-soft)] transition-colors hover:text-[var(--text-strong)] hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#afc4ff]/40"
            aria-label="Back to workspace"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Workspace
          </button>
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-12">
        {/* Header — clean typography, no icon */}
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-3xl font-bold text-[var(--text-strong)]">Build Your Tailored Resume</h1>
          <p className="mx-auto max-w-xl text-sm text-[var(--text-soft)]">
            Upload your resume and target job — our AI positions you as the benchmark candidate.
          </p>
        </div>

        <GlassCard className="animate-[fade-in_500ms_ease-out_forwards] opacity-0 p-8">
          {/* Error display */}
          {error && (
            <div
              className="mb-6 flex items-start gap-2 rounded-lg border border-[#f0b8b8]/20 bg-[#f0b8b8]/10 p-3"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f0b8b8]" />
              <p className="text-sm text-[#f0b8b8]/90">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8" noValidate>
            {/* Resume */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-strong)]">
                Your Resume
              </label>
              <ResumeDropZone
                resumeText={resumeText}
                onResumeTextChange={setResumeText}
                loading={loading}
                initialResumeText={initialResumeText}
              />
            </div>

            {/* Job Description */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text-strong)]">
                Job Description
              </label>
              <JdSection
                jobDescription={jobDescription}
                onJobDescriptionChange={setJobDescription}
                loading={loading}
              />
            </div>

            {/* Submit */}
            <div className="pt-2">
              <GlassButton
                type="submit"
                size="lg"
                disabled={!isValid || loading}
                className="w-full px-8 py-3 text-base font-medium bg-[#afc4ff]/20 border-[#afc4ff]/30 hover:bg-[#afc4ff]/30 text-[#afc4ff]"
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 motion-safe:animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Analyze and craft my resume'
                )}
              </GlassButton>
            </div>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}
