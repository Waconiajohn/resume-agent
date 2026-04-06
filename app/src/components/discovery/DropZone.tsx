import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Briefcase, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';
import { extractResumeTextFromUpload } from '@/lib/resume-upload';

interface DropZoneProps {
  onAnalyze: (resumeText: string, jobText: string) => void;
  loading: boolean;
  onFetchJobDescription: (url: string) => Promise<{ text: string; title: string } | null>;
}

interface ZoneState {
  content: string | null;
  label: string | null;
  dragging: boolean;
}

function isUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test(s.trim());
}

export function DropZone({ onAnalyze, loading, onFetchJobDescription }: DropZoneProps) {
  const [resume, setResume] = useState<ZoneState>({ content: null, label: null, dragging: false });
  const [job, setJob] = useState<ZoneState>({ content: null, label: null, dragging: false });
  const [jobEditing, setJobEditing] = useState(false);
  const [jobDraftText, setJobDraftText] = useState('');
  const [jobLoading, setJobLoading] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jobFileInputRef = useRef<HTMLInputElement>(null);
  const jobTextareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSubmittedRef = useRef(false);

  const canSubmit = resume.content !== null && job.content !== null && !loading;

  // Focus the inline job textarea when editing begins
  useEffect(() => {
    if (jobEditing && jobTextareaRef.current) {
      jobTextareaRef.current.focus();
    }
  }, [jobEditing]);

  // Gap 3: Auto-submit when both zones are filled
  useEffect(() => {
    if (resume.content && job.content && !loading && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      const timer = setTimeout(() => {
        onAnalyze(resume.content!, job.content!);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [resume.content, job.content, loading, onAnalyze]);

  const handleResumeFile = useCallback(async (file: File) => {
    try {
      const text = await extractResumeTextFromUpload(file);
      setResume({ content: text, label: file.name, dragging: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file';
      setResume({ content: null, label: message, dragging: false });
    }
  }, []);

  const handleResumeDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        await handleResumeFile(file);
      } else {
        const text = e.dataTransfer.getData('text/plain');
        if (text) {
          setResume({ content: text, label: text.slice(0, 60), dragging: false });
        }
      }
    },
    [handleResumeFile],
  );

  const handleResumePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (text.trim()) {
      setResume({ content: text, label: text.trim().slice(0, 60), dragging: false });
    }
  }, []);

  // Shared helper: resolve raw text or a URL into job content
  const resolveJobContent = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (isUrl(trimmed)) {
        setJobLoading(true);
        try {
          const result = await onFetchJobDescription(trimmed);
          if (result) {
            setJob({
              content: result.text,
              label: result.title || trimmed.slice(0, 60),
              dragging: false,
            });
          } else {
            // Fall back to raw URL text so the user isn't left empty-handed
            setJob({ content: trimmed, label: trimmed.slice(0, 60), dragging: false });
          }
        } finally {
          setJobLoading(false);
        }
      } else {
        setJob({ content: trimmed, label: trimmed.slice(0, 60), dragging: false });
      }
    },
    [onFetchJobDescription],
  );

  const handleJobDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setJob((p) => ({ ...p, dragging: false }));

      // Handle file drops (txt, pdf, docx)
      const file = e.dataTransfer.files[0];
      if (file) {
        try {
          const text = await extractResumeTextFromUpload(file);
          setJobDraftText('');
          setJobEditing(false);
          await resolveJobContent(text);
        } catch {
          // Fall back to reading as plain text
          const fallback = await file.text().catch(() => '');
          if (fallback.trim()) {
            await resolveJobContent(fallback);
          }
        }
        return;
      }

      // Handle text/URL drops
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        setJobDraftText('');
        setJobEditing(false);
        await resolveJobContent(text);
      }
    },
    [resolveJobContent],
  );

  const handleJobPaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text/plain');
      if (text.trim()) {
        setJobDraftText('');
        setJobEditing(false);
        await resolveJobContent(text);
      }
    },
    [resolveJobContent],
  );

  const handleJobFile = useCallback(async (file: File) => {
    try {
      const text = await extractResumeTextFromUpload(file);
      await resolveJobContent(text);
    } catch {
      const fallback = await file.text().catch(() => '');
      if (fallback.trim()) {
        await resolveJobContent(fallback);
      }
    }
  }, [resolveJobContent]);

  const commitJobDraft = useCallback(async () => {
    const trimmed = jobDraftText.trim();
    setJobEditing(false);
    if (trimmed) {
      await resolveJobContent(trimmed);
    }
    setJobDraftText('');
  }, [jobDraftText, resolveJobContent]);

  const handleSubmit = useCallback(() => {
    if (!resume.content || !job.content) return;
    autoSubmittedRef.current = true;  // Prevent auto-submit from also firing
    onAnalyze(resume.content, job.content);
  }, [resume.content, job.content, onAnalyze]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-12 px-8">
      {/* Promise text */}
      <div className="max-w-2xl text-center">
        <p
          className="text-3xl font-light leading-relaxed tracking-wide text-[var(--text-strong)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          You have spent decades building something remarkable.
          <br />
          <span className="text-[var(--text-muted)]">
            Most people cannot see it — including you.
          </span>
          <br />
          We can.
        </p>
      </div>

      {/* Drop zones */}
      <div className="flex w-full max-w-5xl gap-5">
        {/* Resume zone */}
        <DropTarget
          icon={<Upload className="h-7 w-7" />}
          title="Drop your resume here"
          subtitle="PDF, DOCX, or paste your resume"
          filled={resume.content !== null}
          label={resume.label}
          dragging={resume.dragging}
          onDrop={handleResumeDrop}
          onPaste={handleResumePaste}
          onDragOver={(e) => { e.preventDefault(); setResume((p) => ({ ...p, dragging: true })); }}
          onDragLeave={() => setResume((p) => ({ ...p, dragging: false }))}
          onClick={() => resumeInputRef.current?.click()}
        />
        <input
          ref={resumeInputRef}
          type="file"
          accept=".txt,.pdf,.docx"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await handleResumeFile(file);
          }}
          aria-label="Upload resume file"
        />

        {/* Job zone */}
        {jobEditing ? (
          <GlassCard
            className={cn(
              'flex flex-1 flex-col gap-3 p-4 min-h-[220px]',
              'ring-2 ring-[var(--link)] ring-offset-2 ring-offset-[var(--bg-0)]',
            )}
            onDrop={handleJobDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <p className="text-xs font-medium text-[var(--text-soft)]">Paste or type the job description</p>
            <textarea
              ref={jobTextareaRef}
              className="flex-1 resize-none rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:outline-none focus:ring-1 focus:ring-[var(--link)]"
              placeholder="Paste the job description or a URL here..."
              value={jobDraftText}
              onChange={(e) => setJobDraftText(e.target.value)}
              onPaste={handleJobPaste}
              onBlur={commitJobDraft}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setJobEditing(false);
                  setJobDraftText('');
                }
              }}
              aria-label="Job description text"
            />
            <button
              type="button"
              className="self-end rounded-lg bg-[var(--link)] px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              onClick={commitJobDraft}
            >
              Done
            </button>
          </GlassCard>
        ) : (
          <DropTarget
            icon={
              jobLoading
                ? <Loader2 className="h-7 w-7 animate-spin" />
                : <Briefcase className="h-7 w-7" />
            }
            title="Drop one job you want"
            subtitle="Drop a file, paste a URL, or type it"
            filled={job.content !== null}
            label={job.label}
            dragging={job.dragging}
            loading={jobLoading}
            onDrop={handleJobDrop}
            onPaste={handleJobPaste}
            onDragOver={(e) => { e.preventDefault(); setJob((p) => ({ ...p, dragging: true })); }}
            onDragLeave={() => setJob((p) => ({ ...p, dragging: false }))}
            onClick={() => { if (!jobLoading) jobFileInputRef.current?.click(); }}
            onTypeClick={() => { if (!jobLoading) setJobEditing(true); }}
          />
        )}
        <input
          ref={jobFileInputRef}
          type="file"
          accept=".txt,.pdf,.docx"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await handleJobFile(file);
          }}
          aria-label="Upload job description file"
        />
      </div>

      {/* Submit button — only visible when both zones have content */}
      <div
        className={cn(
          'transition-all duration-500',
          canSubmit ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
        )}
      >
        <GlassButton
          size="lg"
          onClick={handleSubmit}
          loading={loading}
          disabled={!canSubmit}
          className="gap-3"
        >
          Show me what you found
          <ArrowRight className="h-4 w-4" />
        </GlassButton>
      </div>
    </div>
  );
}

interface DropTargetProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  filled: boolean;
  label: string | null;
  dragging: boolean;
  loading?: boolean;
  onDrop: (e: React.DragEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onClick: () => void;
  onTypeClick?: () => void;
}

function DropTarget({
  icon,
  title,
  subtitle,
  filled,
  label,
  dragging,
  loading = false,
  onDrop,
  onPaste,
  onDragOver,
  onDragLeave,
  onClick,
  onTypeClick,
}: DropTargetProps) {
  return (
    <GlassCard
      hover
      className={cn(
        'flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 p-8 text-center transition-all duration-200 min-h-[220px]',
        dragging && 'ring-2 ring-[var(--link)] ring-offset-2 ring-offset-[var(--bg-0)]',
        filled && 'ring-1 ring-green-400/40',
        loading && 'cursor-wait',
      )}
      role="button"
      tabIndex={0}
      aria-label={filled ? `${title} — content added` : title}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onPaste={onPaste}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      {loading ? (
        <>
          <span className="text-[var(--text-soft)]">{icon}</span>
          <p className="text-sm text-[var(--text-soft)]">Fetching job description...</p>
        </>
      ) : filled ? (
        <>
          <CheckCircle2 className="h-8 w-8 text-green-400" />
          <div>
            <p className="text-sm font-medium text-green-400">Content added</p>
            {label && (
              <p className="mt-1 max-w-[200px] truncate text-xs text-[var(--text-soft)]">{label}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="text-[var(--text-soft)]">{icon}</span>
          <div>
            <p className="text-base font-medium text-[var(--text-strong)]">{title}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
          </div>
          <p className="text-xs text-[var(--text-soft)]">
            Drag, drop, or paste — or click to browse
            {onTypeClick && (
              <>
                {' · '}
                <button
                  type="button"
                  className="text-[var(--link)] hover:text-[var(--link-hover)] underline"
                  onClick={(e) => { e.stopPropagation(); onTypeClick(); }}
                >
                  or type it
                </button>
              </>
            )}
          </p>
        </>
      )}
    </GlassCard>
  );
}
