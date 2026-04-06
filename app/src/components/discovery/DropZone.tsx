import { useState, useRef, useCallback } from 'react';
import { Upload, Briefcase, CheckCircle2, ArrowRight } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';
import { cn } from '@/lib/utils';

interface DropZoneProps {
  onAnalyze: (resumeText: string, jobText: string) => void;
  loading: boolean;
}

interface ZoneState {
  content: string | null;
  label: string | null;
  dragging: boolean;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function DropZone({ onAnalyze, loading }: DropZoneProps) {
  const [resume, setResume] = useState<ZoneState>({ content: null, label: null, dragging: false });
  const [job, setJob] = useState<ZoneState>({ content: null, label: null, dragging: false });
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jobInputRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = resume.content !== null && job.content !== null && !loading;

  const handleResumeFile = useCallback(async (file: File) => {
    try {
      const text = await readFileAsText(file);
      setResume({ content: text, label: file.name, dragging: false });
    } catch {
      setResume((prev) => ({ ...prev, dragging: false }));
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

  const handleJobDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      setJob({ content: text, label: text.trim().slice(0, 60), dragging: false });
    }
  }, []);

  const handleJobPaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (text.trim()) {
      setJob({ content: text, label: text.trim().slice(0, 60), dragging: false });
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!resume.content || !job.content) return;
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
      <div className="flex w-full max-w-3xl gap-5">
        {/* Resume zone */}
        <DropTarget
          icon={<Upload className="h-7 w-7" />}
          title="Drop your resume here"
          subtitle="PDF or paste your text"
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
          accept=".txt,.pdf,.doc,.docx"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await handleResumeFile(file);
          }}
          aria-label="Upload resume file"
        />

        {/* Job zone */}
        <DropTarget
          icon={<Briefcase className="h-7 w-7" />}
          title="Drop one job you want"
          subtitle="Paste the URL or job description"
          filled={job.content !== null}
          label={job.label}
          dragging={job.dragging}
          onDrop={handleJobDrop}
          onPaste={handleJobPaste}
          onDragOver={(e) => { e.preventDefault(); setJob((p) => ({ ...p, dragging: true })); }}
          onDragLeave={() => setJob((p) => ({ ...p, dragging: false }))}
          onClick={() => jobInputRef.current?.focus()}
        />
        {/* Hidden textarea for job paste focus target */}
        <textarea
          ref={jobInputRef}
          className="sr-only"
          aria-label="Paste job description"
          onPaste={handleJobPaste}
          onChange={() => undefined}
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
  onDrop: (e: React.DragEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onClick: () => void;
}

function DropTarget({
  icon,
  title,
  subtitle,
  filled,
  label,
  dragging,
  onDrop,
  onPaste,
  onDragOver,
  onDragLeave,
  onClick,
}: DropTargetProps) {
  return (
    <GlassCard
      hover
      className={cn(
        'flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 p-8 text-center transition-all duration-200 min-h-[220px]',
        dragging && 'ring-2 ring-[var(--link)] ring-offset-2 ring-offset-[var(--bg-0)]',
        filled && 'ring-1 ring-green-400/40',
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
      {filled ? (
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
          </p>
        </>
      )}
    </GlassCard>
  );
}
